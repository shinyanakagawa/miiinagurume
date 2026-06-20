# グルメHP作成アプリ マーケティングサイト(LP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `グルメHP作成アプリ/index.html`をログイン専用ページからマーケティングサイト(LP)に作り変え、セルフサーブ登録と代行制作(coconala)問い合わせの二軸を1ページで両立させる。あわせてログイン専用の`login.html`と、使い方を画面スクリーンショット付きで解説する`guide.html`を新設する。

**Architecture:** 既存と同じ静的HTML/CSS/JS構成（フレームワークなし）。LP本体はSupabase接続不要で、認証処理は新設`login.html`に閉じる。デザインは既存サンプルHP5業態・ルート`index.html`と同一の和風トンマナ（Noto Serif JP・ベージュ系・金アクセント）を継承する。

**Tech Stack:** HTML / CSS（`グルメHP作成アプリ/css/app.css`の既存変数を再利用） / Vanilla JS（ESM, `js/supabase-client.js`）。確認はPlaywright MCPでブラウザを操作し見た目・リンク動作を確認する（このプロジェクトに自動テストフレームワークは存在しない）。

参照spec: `WEB制作担当/成果物/HP生成アプリ/LP設計.md`

## Global Constraints

- デザイントーンは既存サンプルHP5業態・ルート`index.html`と同一の和風トンマナ：見出し`Noto Serif JP`、ベージュ系背景`#faf9f6`、深茶色文字`#2c2820`、金アクセント`#c8a060`、ボーダー`#e8e0d8`。SaaS的な新トンマナは採用しない。
- `グルメHP作成アプリ/dashboard.html`・`editor.html`・`site.html`・`js/supabase-client.js`・`js/template-renderer.js`・Supabase/Stripe連携には**変更を加えない**。
- ルートの`index.html`（飲食店サンプルHP一覧、お問い合わせフォーム、取材済み飲食店一覧を含む）には**変更を加えない**。
- coconala出品ページは2026-06-20時点で未公開。リンク先は`#`とし、`<!-- TODO: coconala出品ページ公開後にURLを差し込む -->`をHTML内に残す。
- `guide.html`はテキストのみで5ステップを解説する（Task 4で判明：このセッションにSupabase MCPの認証トークンがなく実機スクリーンショット撮影ができないため方針変更。各ステップに画像差し込み用の枠を残し、後日担当者が実機操作して撮影した画像を追加できるようにする）。
- 既存`グルメHP作成アプリ/css/app.css`の共通パーツ（`.app-btn`, `.app-card`, `.app-input`等）とCSS変数（`--app-accent`等）を再利用し、重複定義しない。

---

## Task 1: `login.html`を新設する

現行`グルメHP作成アプリ/index.html`はログイン・新規登録フォームのみの内容。これをそのまま`login.html`として独立させる。Hero文言だけLP用の長い説明文から、ログイン専用ページ向けの短い文言に変更する。

**Files:**
- Create: `グルメHP作成アプリ/login.html`

**Interfaces:**
- Consumes: `js/supabase-client.js`の`signIn(email, password)`, `signUp(email, password)`, `getCurrentUser()`（既存のまま、変更しない）
- Produces: `login.html`は`dashboard.html`へログイン後リダイレクトする（既存の挙動を維持）。後続タスクの`index.html`からは`login.html`へのリンクとして参照される。

- [ ] **Step 1: `グルメHP作成アプリ/login.html`を作成する**

現行`グルメHP作成アプリ/index.html`(107行)の内容をベースに、以下の内容で新規作成する。スクリプト部分（タブ切替・フォーム送信・既ログイン時のリダイレクト）はそのまま流用し、Hero文言のみ変更する。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ログイン・新規登録｜グルメHP作成アプリ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@700&family=Noto+Sans+JP:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/app.css">
<style>
  .hero { text-align: center; padding: 3rem 1.5rem 1rem; }
  .hero h1 { font-family: 'Noto Serif JP', serif; font-size: clamp(1.6rem, 5vw, 2.4rem); margin-bottom: .8rem; }
  .hero p { color: var(--app-muted); }
  .tabs { display: flex; border-bottom: 1px solid var(--app-border); margin-bottom: 1.5rem; }
  .tabs button {
    flex: 1; padding: .8rem; border: none; background: none; cursor: pointer;
    font-weight: 700; color: var(--app-muted); border-bottom: 2px solid transparent;
  }
  .tabs button.active { color: var(--app-text); border-bottom-color: var(--app-accent); }
  .price-note { text-align: center; font-size: .85rem; color: var(--app-muted); margin-top: 1rem; }
  .back-link { display: block; text-align: center; font-size: .85rem; margin-top: 1.2rem; color: var(--app-muted); }
</style>
</head>
<body>

<div class="hero">
  <h1>ログイン / 新規登録</h1>
  <p>アカウントを作成して、HP作成を始めましょう。</p>
</div>

<div class="center-page" style="min-height:auto;padding-top:0">
  <div class="auth-card app-card">
    <div class="tabs">
      <button id="tab-login" class="active">ログイン</button>
      <button id="tab-signup">新規登録</button>
    </div>

    <div id="msg"></div>

    <form id="auth-form">
      <div class="app-form-group">
        <label for="email">メールアドレス</label>
        <input class="app-input" type="email" id="email" required autocomplete="email">
      </div>
      <div class="app-form-group">
        <label for="password">パスワード</label>
        <input class="app-input" type="password" id="password" required minlength="6" autocomplete="current-password">
        <p class="hint">6文字以上</p>
      </div>
      <button type="submit" class="app-btn" style="width:100%" id="submit-btn">ログイン</button>
    </form>

    <p class="price-note">作成・プレビューは無料。公開する時に月額1,000円／サイトのお支払いが発生します。</p>
  </div>
</div>

<a href="index.html" class="back-link">← サービス紹介ページに戻る</a>

<script type="module">
  import { signIn, signUp, getCurrentUser } from './js/supabase-client.js';

  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const submitBtn = document.getElementById('submit-btn');
  const form = document.getElementById('auth-form');
  const msg = document.getElementById('msg');

  let mode = 'login';

  function setMode(next) {
    mode = next;
    tabLogin.classList.toggle('active', mode === 'login');
    tabSignup.classList.toggle('active', mode === 'signup');
    submitBtn.textContent = mode === 'login' ? 'ログイン' : '新規登録';
    document.getElementById('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    msg.innerHTML = '';
  }
  tabLogin.addEventListener('click', () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  // URLに ?tab=signup があれば新規登録タブを開く
  if (new URLSearchParams(location.search).get('tab') === 'signup') {
    setMode('signup');
  }

  // 既にログイン済みならダッシュボードへ
  getCurrentUser().then(user => {
    if (user) location.href = 'dashboard.html';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    submitBtn.disabled = true;
    msg.innerHTML = '';
    try {
      if (mode === 'login') {
        await signIn(email, password);
        location.href = 'dashboard.html';
      } else {
        await signUp(email, password);
        msg.innerHTML = `<div class="app-msg success">登録確認メールを送信しました。メール内のリンクから認証後、ログインしてください。</div>`;
      }
    } catch (err) {
      msg.innerHTML = `<div class="app-msg error">${err.message}</div>`;
    } finally {
      submitBtn.disabled = false;
    }
  });
</script>

</body>
</html>
```

`?tab=signup`クエリパラメータで新規登録タブを直接開けるようにした（LP側の「無料で会員登録」CTAから使う）。

- [ ] **Step 2: ブラウザで開いて確認する**

Playwright MCPで`グルメHP作成アプリ/login.html`をファイルパスで開き、以下を確認する：
- ログイン／新規登録タブの切り替えが機能する
- `login.html?tab=signup`で開くと新規登録タブが最初から選択されている
- フォームの見た目が既存`index.html`と同じ（崩れていない）

- [ ] **Step 3: コミット**

```bash
git add "グルメHP作成アプリ/login.html"
git commit -m "グルメHP作成アプリにログイン専用ページ(login.html)を新設"
```

---

## Task 2: `index.html`をLPの前半（ヘッダー・Hero・特徴・テンプレート例）に作り変える

**Files:**
- Modify: `グルメHP作成アプリ/index.html`（全面的に書き換え。現行のログインフォーム内容はTask 1で`login.html`に移植済みのため、ここでは完全に新しいLP内容に置き換える）

**Interfaces:**
- Consumes: なし（静的コンテンツのみ、Supabase接続不要）
- Produces: `#features`, `#templates`の各アンカーID。ヘッダーナビとフッターから参照される。Task 3で追記する`#how-it-works`, `#pricing`, `#faq`へのナビリンクもこのタスクで先に用意する。

- [ ] **Step 1: `グルメHP作成アプリ/index.html`を以下の内容で書き換える**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>グルメHP作成アプリ｜飲食店の公式HPを自分でかんたん作成</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@300;400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --lp-bg: #faf9f6;
    --lp-card: #ffffff;
    --lp-text: #2c2820;
    --lp-muted: #8a7a66;
    --lp-border: #e8e0d8;
    --lp-accent: #c8a060;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: var(--lp-bg); color: var(--lp-text);
    font-family: 'Noto Sans JP', sans-serif; min-height: 100vh; line-height: 1.7;
  }
  h1, h2, h3 { font-family: 'Noto Serif JP', serif; }
  a { color: inherit; }

  /* ヘッダー */
  .lp-header {
    position: sticky; top: 0; z-index: 50;
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.5rem; background: rgba(250,249,246,.92); backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--lp-border);
  }
  .lp-logo { font-weight: 700; font-size: 1.05rem; letter-spacing: .04em; text-decoration: none; }
  .lp-nav { display: none; gap: 1.4rem; font-size: .82rem; }
  @media (min-width: 768px) { .lp-nav { display: flex; align-items: center; } }
  .lp-nav a { text-decoration: none; color: var(--lp-muted); }
  .lp-nav a:hover { color: var(--lp-text); }
  .lp-header-cta { display: flex; gap: .6rem; align-items: center; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
    padding: .7rem 1.4rem; border-radius: 999px; font-size: .85rem; font-weight: 700;
    text-decoration: none; cursor: pointer; border: none; transition: background .15s, transform .1s;
  }
  .btn-primary { background: var(--lp-accent); color: #fff; }
  .btn-primary:hover { background: #b08d4d; }
  .btn-secondary { background: transparent; color: var(--lp-text); border: 1px solid var(--lp-border); }
  .btn-secondary:hover { background: var(--lp-card); }
  .btn-sm { padding: .55rem 1.1rem; font-size: .78rem; }

  /* Hero */
  #hero { text-align: center; padding: 5rem 1.5rem 4rem; }
  #hero h1 { font-size: clamp(1.8rem, 5vw, 2.8rem); margin-bottom: 1rem; }
  #hero p.sub { color: var(--lp-muted); font-size: 1rem; margin-bottom: 2rem; }
  .hero-ctas { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

  section { padding: 4rem 1.5rem; max-width: 1080px; margin: 0 auto; }
  .section-label {
    font-size: .65rem; letter-spacing: .3em; text-transform: uppercase;
    color: var(--lp-accent); text-align: center; margin-bottom: .6rem;
  }
  .section-title { font-size: clamp(1.4rem, 3vw, 1.9rem); text-align: center; margin-bottom: 3rem; }

  /* 特徴 */
  .features-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .feature-card { background: var(--lp-card); border: 1px solid var(--lp-border); border-radius: 14px; padding: 1.6rem; text-align: center; }
  .feature-icon { font-size: 1.8rem; margin-bottom: .8rem; }
  .feature-card h3 { font-size: 1rem; margin-bottom: .5rem; }
  .feature-card p { font-size: .85rem; color: var(--lp-muted); }

  /* テンプレート例 */
  .templates-grid { display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .template-card {
    display: block; text-decoration: none; color: inherit;
    background: var(--lp-card); border: 1px solid var(--lp-border); border-radius: 14px; overflow: hidden;
    transition: transform .2s, box-shadow .2s;
  }
  .template-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(44,40,32,.1); }
  .template-thumb { height: 100px; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; }
  .template-cafe     { background: linear-gradient(135deg, #c8e0c0, #a8cca0); }
  .template-bistro    { background: linear-gradient(135deg, #f0c8c0, #d89090); }
  .template-izakaya   { background: linear-gradient(135deg, #4a3018, #2a1a0a); }
  .template-teishoku  { background: linear-gradient(135deg, #f5dfc5, #e8c8a0); }
  .template-kaiseki   { background: linear-gradient(135deg, #201810, #100c08); }
  .template-body { padding: 1rem 1.2rem 1.3rem; }
  .template-body .tag { font-size: .62rem; letter-spacing: .15em; text-transform: uppercase; color: var(--lp-muted); margin-bottom: .3rem; }
  .template-body .name { font-weight: 700; font-size: .95rem; margin-bottom: .3rem; }
  .template-body .desc { font-size: .76rem; color: var(--lp-muted); }
</style>
</head>
<body>

<header class="lp-header">
  <a href="index.html" class="lp-logo">グルメHP作成アプリ</a>
  <nav class="lp-nav">
    <a href="#features">特徴</a>
    <a href="#templates">テンプレート</a>
    <a href="#how-it-works">使い方</a>
    <a href="#pricing">料金</a>
    <a href="#faq">FAQ</a>
  </nav>
  <div class="lp-header-cta">
    <a href="login.html" class="btn btn-secondary btn-sm">ログイン</a>
    <a href="login.html?tab=signup" class="btn btn-primary btn-sm">無料で始める</a>
  </div>
</header>

<section id="hero">
  <h1>テンプレートから、自分だけの飲食店HPを。</h1>
  <p class="sub">店名・写真を入力するだけ。作成・プレビューは無料、公開する時だけ料金が発生します。</p>
  <div class="hero-ctas">
    <a href="login.html?tab=signup" class="btn btn-primary">無料で始める</a>
    <a href="#pricing" class="btn btn-secondary">代行を相談する</a>
  </div>
</section>

<section id="features">
  <p class="section-label">Features</p>
  <h2 class="section-title">選ばれる理由</h2>
  <div class="features-grid">
    <div class="feature-card">
      <div class="feature-icon">📱</div>
      <h3>スマホでもPCでも美しく</h3>
      <p>どの端末で見ても整ったレイアウトで表示されます。</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">⏱️</div>
      <h3>最短数十分で公開</h3>
      <p>テーマを選び、文字と写真を入れるだけで完成します。</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">💰</div>
      <h3>作成は無料、公開時だけ課金</h3>
      <p>月額1,000円／サイトが必要になるのは「公開する」を押す時だけです。</p>
    </div>
    <div class="feature-card">
      <div class="feature-icon">📸</div>
      <h3>写真をアップロードするだけ</h3>
      <p>お店の写真を入れるだけでプロらしい仕上がりになります。</p>
    </div>
  </div>
</section>

<section id="templates">
  <p class="section-label">Templates</p>
  <h2 class="section-title">テンプレート例</h2>
  <div class="templates-grid">
    <a href="../WEB制作担当/成果物/サンプル/カフェ用/index.html" class="template-card">
      <div class="template-thumb template-cafe">☕</div>
      <div class="template-body">
        <p class="tag">Café</p>
        <p class="name">カフェ用テンプレート</p>
        <p class="desc">自家焙煎コーヒー・スイーツ・ランチ。明るく居心地の良いスタイル。</p>
      </div>
    </a>
    <a href="../WEB制作担当/成果物/サンプル/ビストロ用/index.html" class="template-card">
      <div class="template-thumb template-bistro">🍷</div>
      <div class="template-body">
        <p class="tag">Bistro</p>
        <p class="name">ビストロ用テンプレート</p>
        <p class="desc">フレンチコース・ワイン・記念日対応。エレガントなスタイル。</p>
      </div>
    </a>
    <a href="../WEB制作担当/成果物/サンプル/居酒屋用/index.html" class="template-card">
      <div class="template-thumb template-izakaya">🍺</div>
      <div class="template-body">
        <p class="tag">Izakaya</p>
        <p class="name">居酒屋用テンプレート</p>
        <p class="desc">旬の一品料理・地酒・宴会対応。活気あるダーク系スタイル。</p>
      </div>
    </a>
    <a href="../WEB制作担当/成果物/サンプル/定食屋用/index.html" class="template-card">
      <div class="template-thumb template-teishoku">🍱</div>
      <div class="template-body">
        <p class="tag">Teishoku</p>
        <p class="name">定食屋用テンプレート</p>
        <p class="desc">日替わり定食・地元野菜・テイクアウト。温かみのあるスタイル。</p>
      </div>
    </a>
    <a href="../WEB制作担当/成果物/サンプル/高級店用/index.html" class="template-card">
      <div class="template-thumb template-kaiseki">✨</div>
      <div class="template-body">
        <p class="tag">Fine Dining</p>
        <p class="name">高級店用テンプレート</p>
        <p class="desc">懐石コース・完全予約制。ラグジュアリーなスタイル。</p>
      </div>
    </a>
  </div>
</section>

</body>
</html>
```

- [ ] **Step 2: ブラウザで開いて確認する**

Playwright MCPで`グルメHP作成アプリ/index.html`を開き、以下を確認する：
- ヘッダーが画面上部に固定され、ナビリンク（特徴・テンプレート・使い方・料金・FAQ）が見える（このタスク時点では使い方・料金・FAQのセクションは未実装なのでクリックすると何も起きないが、リンク自体は表示されていてよい）
- 「無料で始める」「ログイン」ボタンが`login.html`へ正しく遷移する
- 「特徴」セクションの4カードが表示される
- 「テンプレート例」セクションの5カードが表示され、カフェ用カードをクリックすると`WEB制作担当/成果物/サンプル/カフェ用/index.html`が開く

- [ ] **Step 3: コミット**

```bash
git add "グルメHP作成アプリ/index.html"
git commit -m "グルメHP作成アプリのindex.htmlをLPの前半(ヘッダー/Hero/特徴/テンプレート例)に作り変え"
```

---

## Task 3: `index.html`の後半（使い方・料金・お客様の声・FAQ・最終CTA・フッター）を追記する

**Files:**
- Modify: `グルメHP作成アプリ/index.html`（Task 2で作成した`</body>`直前に追記）

**Interfaces:**
- Consumes: Task 2で定義したCSS変数(`--lp-*`)とユーティリティクラス(`.btn`, `.section-title`等)
- Produces: `#how-it-works`, `#pricing`, `#faq`の各アンカーID（Task 2のヘッダーナビから参照されるリンク先が、このタスクで実在するようになる）。`guide.html`へのリンク（Task 5で作成）をここで張る。

- [ ] **Step 1: `<style>`の`</style>`直前に以下のCSSを追記する**

```css
  /* 使い方（簡素版） */
  .steps-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-bottom: 2rem; }
  .step-card { background: var(--lp-card); border: 1px solid var(--lp-border); border-radius: 14px; padding: 1.6rem; text-align: center; }
  .step-num {
    width: 36px; height: 36px; border-radius: 50%; background: var(--lp-accent); color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: 700; margin: 0 auto .8rem;
  }
  .step-card h3 { font-size: .95rem; margin-bottom: .4rem; }
  .step-card p { font-size: .83rem; color: var(--lp-muted); }
  .steps-more { text-align: center; }

  /* 料金 */
  .pricing-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); align-items: start; }
  .pricing-card { background: var(--lp-card); border: 1px solid var(--lp-border); border-radius: 16px; padding: 1.8rem; }
  .pricing-card h3 { font-size: 1.05rem; margin-bottom: .4rem; }
  .pricing-card .price { font-size: 1.6rem; font-weight: 700; margin-bottom: .8rem; }
  .pricing-card .price span { font-size: .8rem; font-weight: 400; color: var(--lp-muted); }
  .pricing-flow { list-style: none; font-size: .82rem; color: var(--lp-muted); margin-bottom: 1.2rem; }
  .pricing-flow li { padding: .25rem 0; }
  .pricing-note { font-size: .76rem; color: var(--lp-muted); margin-top: .8rem; }
  .pricing-plans { display: grid; gap: 1rem; }
  .plan-row {
    display: flex; justify-content: space-between; align-items: center; gap: 1rem;
    border-top: 1px solid var(--lp-border); padding-top: 1rem;
  }
  .plan-row:first-child { border-top: none; padding-top: 0; }
  .plan-row .plan-name { font-weight: 700; font-size: .9rem; }
  .plan-row .plan-price { font-size: .82rem; color: var(--lp-muted); }

  /* FAQ */
  .faq-item { border-bottom: 1px solid var(--lp-border); padding: 1.2rem 0; }
  .faq-item h3 { font-size: .92rem; margin-bottom: .5rem; }
  .faq-item p { font-size: .85rem; color: var(--lp-muted); }

  /* 最終CTA */
  #final-cta { text-align: center; background: var(--lp-text); color: #fff; border-radius: 20px; max-width: 1080px; margin: 0 auto 4rem; }
  #final-cta h2 { color: #fff; }
  #final-cta p { color: rgba(255,255,255,.7); margin-bottom: 1.6rem; }

  /* フッター */
  footer { text-align: center; padding: 2.5rem 1.5rem; font-size: .75rem; color: var(--lp-muted); border-top: 1px solid var(--lp-border); }
  footer a { color: var(--lp-accent); text-decoration: none; }
```

- [ ] **Step 2: `</body>`直前（Task 2で作成した`<section id="templates">...</section>`の直後）に以下を追記する**

```html
<section id="how-it-works">
  <p class="section-label">How it works</p>
  <h2 class="section-title">使い方</h2>
  <div class="steps-grid">
    <div class="step-card">
      <div class="step-num">1</div>
      <h3>基本情報・写真を入力</h3>
      <p>店名・営業時間・写真などをフォームに入れるだけ。</p>
    </div>
    <div class="step-card">
      <div class="step-num">2</div>
      <h3>公開する</h3>
      <p>プレビューを確認して「公開する」を押すと完成です。</p>
    </div>
  </div>
  <p class="steps-more"><a href="guide.html" class="btn btn-secondary btn-sm">詳しい使い方を見る →</a></p>
</section>

<section id="pricing">
  <p class="section-label">Pricing</p>
  <h2 class="section-title">料金プラン</h2>
  <div class="pricing-grid">
    <div class="pricing-card">
      <h3>セルフサーブ</h3>
      <div class="price">月額1,000円<span> ／ サイト</span></div>
      <ul class="pricing-flow">
        <li>① 無料で会員登録</li>
        <li>② 情報・写真を入力してプレビュー（無料）</li>
        <li>③ 公開する時に決済</li>
      </ul>
      <a href="login.html?tab=signup" class="btn btn-primary" style="width:100%">無料で会員登録</a>
      <p class="pricing-note">独自ドメインを使いたい場合は、公開前にご相談ください。</p>
    </div>
    <div class="pricing-card">
      <h3>代行制作（みーなグルメにおまかせ）</h3>
      <p class="pricing-note" style="margin-top:0;margin-bottom:1rem">HP制作に加えて、写真撮影・ドメイン設定・データ分析まで対応するフルサービスです。</p>
      <div class="pricing-plans">
        <div class="plan-row">
          <span class="plan-name">ライト</span>
          <span class="plan-price">29,800円〜</span>
        </div>
        <div class="plan-row">
          <span class="plan-name">スタンダード</span>
          <span class="plan-price">49,800円〜</span>
        </div>
        <div class="plan-row">
          <span class="plan-name">プレミアム</span>
          <span class="plan-price">89,800円〜</span>
        </div>
      </div>
      <!-- TODO: coconala出品ページ公開後にURLを差し込む -->
      <a href="#" class="btn btn-secondary" style="width:100%;margin-top:1.2rem">このプランで相談する</a>
    </div>
  </div>
</section>

<!-- お客様の声: coconala受注・レビューが集まった時点で追加する。ナビには現状リンクを置かない -->

<section id="faq">
  <p class="section-label">FAQ</p>
  <h2 class="section-title">よくあるご質問</h2>
  <div class="faq-item">
    <h3>いつ料金が発生しますか？</h3>
    <p>会員登録・情報入力・写真アップロード・プレビューはすべて無料です。「公開する」を押す時に、月額1,000円のお支払いが発生します。</p>
  </div>
  <div class="faq-item">
    <h3>独自ドメインを使いたいのですが？</h3>
    <p>公開前に個別にご相談ください。独自ドメインの取得費用はお客様負担となります。</p>
  </div>
  <div class="faq-item">
    <h3>解約はいつでもできますか？</h3>
    <p>いつでも解約可能です。解約後は公開ページが非表示になります。</p>
  </div>
  <div class="faq-item">
    <h3>お店の写真がない場合はどうすればいいですか？</h3>
    <p>編集画面のAI画像生成機能を使えば、お店のジャンルに合った写真を生成して使うことができます。</p>
  </div>
</section>

<section id="final-cta">
  <div style="padding:3.5rem 2rem">
    <h2 class="section-title" style="margin-bottom:.6rem">まずは無料で試してみませんか？</h2>
    <p>会員登録・作成・プレビューはすべて無料です。</p>
    <div class="hero-ctas">
      <a href="login.html?tab=signup" class="btn btn-primary">無料で始める</a>
      <a href="#pricing" class="btn btn-secondary" style="border-color:rgba(255,255,255,.3);color:#fff">代行を相談する</a>
    </div>
  </div>
</section>

<footer>
  © みーなグルメ · <a href="https://www.instagram.com/miiinagurume/">@miiinagurume</a> · <a href="../index.html">サンプルHP一覧</a>
</footer>
```

- [ ] **Step 3: ブラウザで開いて全体を確認する**

Playwright MCPで`グルメHP作成アプリ/index.html`を開き、以下を確認する：
- ヘッダーの「使い方」「料金」「FAQ」リンクをクリックすると、それぞれのセクションへスクロールする
- 「詳しい使い方を見る」リンクは`guide.html`を指している（Task 5でファイルを作るまでは404になるが、リンク先パスが正しいことを確認）
- 料金セクションの「無料で会員登録」が`login.html?tab=signup`に正しく遷移する
- 「このプランで相談する」ボタンが表示されている（リンク先は`#`のプレースホルダーで問題ない）
- FAQの4項目が表示される
- 最終CTA・フッターが表示される
- ページ全体をスマホ幅（375px）でも確認し、レイアウト崩れがないこと

- [ ] **Step 4: コミット**

```bash
git add "グルメHP作成アプリ/index.html"
git commit -m "グルメHP作成アプリのindex.htmlに使い方/料金/FAQ/最終CTA/フッターを追加してLPを完成させる"
```

---

## Task 4: テストアカウントでログインし、`dashboard.html`・`editor.html`の操作スクリーンショットを撮影する

> **実行結果（2026-06-20）：BLOCKEDのためスキップ。** このセッションにはSupabase MCPの認証トークン（`SUPABASE_ACCESS_TOKEN`）が設定されておらず、`auth.users`へのSQL操作（メール確認・削除）が実行できなかった。ユーザーの判断により、本タスクはスキップし、Task 5の`guide.html`はスクリーンショットなしのテキスト解説に変更した（後日、実機操作できる環境で担当者が画像を追加する）。未確認のテストユーザー`lp-guide-test@gmail.com`（サイト未作成）が`auth.users`に残っているため、Supabase管理画面から手動削除が必要。

`guide.html`に掲載するスクリーンショットを用意する。`dashboard.html`は`getCurrentUser()`がnullだと`index.html`にリダイレクトされる（ログイン必須）ため、先にテストアカウントでログイン状態を作る必要がある。

**Files:**
- Create: `グルメHP作成アプリ/images/guide/01-theme.png`
- Create: `グルメHP作成アプリ/images/guide/02-basic-info.png`
- Create: `グルメHP作成アプリ/images/guide/03-photo.png`
- Create: `グルメHP作成アプリ/images/guide/04-preview.png`
- Create: `グルメHP作成アプリ/images/guide/05-publish.png`

**Interfaces:**
- Consumes: 既存の`login.html`（Task 1）, `dashboard.html`, `editor.html`（変更なし）
- Produces: 上記5枚のPNG画像。Task 5の`guide.html`から`images/guide/01-theme.png`等の相対パスで参照される。

- [ ] **Step 1: Supabaseの認証設定を確認する**

`mcp__supabase__execute_sql`で、Supabaseプロジェクト(`fgwoqrnjrsnnhogxvtof`、`js/supabase-client.js`記載のURL`https://fgwoqrnjrsnnhogxvtof.supabase.co`から特定)の`auth.users`テーブルの状況を確認する。メール確認が必須の設定であれば、テストユーザー作成後に手動で`email_confirmed_at`を設定する必要がある。

```sql
select id, email, email_confirmed_at from auth.users order by created_at desc limit 5;
```

- [ ] **Step 2: テストユーザーでPlaywright経由で新規登録する**

Playwright MCPで`グルメHP作成アプリ/login.html?tab=signup`を開き、テスト用メールアドレス（例：`lp-guide-test@example.com`）とパスワードで新規登録する。

- [ ] **Step 3: メール確認が必要な場合、SQLで確認済みにする**

Step 1で確認済みメールが必須と分かった場合、`mcp__supabase__execute_sql`で対象ユーザーの`email_confirmed_at`を現在時刻に更新する。

```sql
update auth.users set email_confirmed_at = now()
where email = 'lp-guide-test@example.com' and email_confirmed_at is null;
```

- [ ] **Step 4: ログインしてダッシュボードのスクリーンショットを撮影する**

Playwright MCPで`login.html`からログインし、`dashboard.html`へ遷移後、「＋ 新しいHPを作成」ボタンを押してテーマ選択モーダルを開いた状態でスクリーンショットを撮影し、`グルメHP作成アプリ/images/guide/01-theme.png`として保存する。

- [ ] **Step 5: テスト用サイトを1件作成しエディタへ進む**

モーダルでテーマ「カフェ」を選択し、店名に「ガイド用テストカフェ」、URL用IDに`guide-test-cafe`を入力して「作成する」を押す。`editor.html?id=...`に遷移することを確認する。

- [ ] **Step 6: 基本情報入力欄のスクリーンショットを撮影する**

エディタの「基本情報」セクション（店名・ロゴ表記・ジャンル・キャッチコピー・お店の紹介文の入力欄が見える状態）をスクリーンショットし、`グルメHP作成アプリ/images/guide/02-basic-info.png`として保存する。

- [ ] **Step 7: 写真アップロード欄のスクリーンショットを撮影する**

エディタの「写真」セクション（メイン画像・ギャラリー画像のアップロードボタンが見える状態）をスクリーンショットし、`グルメHP作成アプリ/images/guide/03-photo.png`として保存する。

- [ ] **Step 8: プレビューのスクリーンショットを撮影する**

エディタ右側のリアルタイムプレビュー(iframe)が見える状態をスクリーンショットし、`グルメHP作成アプリ/images/guide/04-preview.png`として保存する。

- [ ] **Step 9: 公開設定欄のスクリーンショットを撮影する**

エディタの「公開設定」セクション（「公開する」「月額プランを契約する」ボタンが見える状態）をスクリーンショットし、`グルメHP作成アプリ/images/guide/05-publish.png`として保存する。

- [ ] **Step 10: テスト用サイトを削除する**

ダッシュボードに戻り、「ガイド用テストカフェ」カードの「削除」ボタンでテストデータを削除する（本番データに残さない）。

- [ ] **Step 11: テストユーザー自体を削除する**

`mcp__supabase__execute_sql`で、Step 2で作成したテストユーザー(`lp-guide-test@example.com`)を`auth.users`から削除する。

```sql
delete from auth.users where email = 'lp-guide-test@example.com';
```

- [ ] **Step 12: コミット**

```bash
git add "グルメHP作成アプリ/images/guide/"
git commit -m "guide.html用に管理画面の操作スクリーンショット5枚を追加"
```

---

## Task 5: `guide.html`を新設する（テキスト解説版）

> Task 4がBLOCKEDでスキップされたため、当初予定していた実機スクリーンショットは使わない。各ステップをテキストで解説し、後日画像を追加できるプレースホルダー枠を残す。

**Files:**
- Create: `グルメHP作成アプリ/guide.html`

**Interfaces:**
- Consumes: なし（画像なし。後日`images/guide/01-theme.png`〜`05-publish.png`が追加されたら、各`.guide-step-img`をその`<img>`タグに置き換える前提のプレースホルダーを用意する）
- Produces: `index.html`の「詳しい使い方を見る」リンク（Task 3で設置済み）が指す実体ページ

- [ ] **Step 1: `グルメHP作成アプリ/guide.html`を以下の内容で作成する**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>使い方ガイド｜グルメHP作成アプリ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@700&family=Noto+Sans+JP:wght@300;400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --lp-bg: #faf9f6; --lp-card: #ffffff; --lp-text: #2c2820;
    --lp-muted: #8a7a66; --lp-border: #e8e0d8; --lp-accent: #c8a060;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--lp-bg); color: var(--lp-text); font-family: 'Noto Sans JP', sans-serif; line-height: 1.7; }
  h1, h2 { font-family: 'Noto Serif JP', serif; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.5rem; border-bottom: 1px solid var(--lp-border); background: #fff;
  }
  header a.logo { text-decoration: none; color: var(--lp-text); font-weight: 700; }
  header a.back { text-decoration: none; color: var(--lp-muted); font-size: .85rem; }
  main { max-width: 760px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
  main > h1 { font-size: clamp(1.5rem, 4vw, 2.1rem); text-align: center; margin-bottom: .6rem; }
  main > p.lead { text-align: center; color: var(--lp-muted); margin-bottom: 3rem; }
  .guide-step { margin-bottom: 2.4rem; padding-bottom: 2.4rem; border-bottom: 1px solid var(--lp-border); }
  .guide-step:last-of-type { border-bottom: none; }
  .guide-step-img-placeholder {
    background: var(--lp-card); border: 1px dashed var(--lp-border); border-radius: 12px;
    padding: 2rem 1rem; text-align: center; color: var(--lp-muted); font-size: .8rem;
    margin-bottom: 1rem;
  }
  .guide-step-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 50%; background: var(--lp-accent); color: #fff;
    font-weight: 700; font-size: .85rem; margin-bottom: .6rem;
  }
  .guide-step h2 { font-size: 1.1rem; margin-bottom: .5rem; }
  .guide-step p { font-size: .9rem; color: var(--lp-muted); }
  .guide-cta { text-align: center; margin-top: 3rem; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
    padding: .8rem 1.8rem; border-radius: 999px; font-size: .9rem; font-weight: 700;
    text-decoration: none; background: var(--lp-accent); color: #fff;
  }
</style>
</head>
<body>

<header>
  <a href="index.html" class="logo">グルメHP作成アプリ</a>
  <a href="index.html" class="back">← サービス紹介に戻る</a>
</header>

<main>
  <h1>使い方ガイド</h1>
  <p class="lead">登録から公開まで、5つのステップで完了します。</p>

  <div class="guide-step">
    <!-- TODO: 実機操作後、images/guide/01-theme.png を撮影してこのプレースホルダーを<img>タグに置き換える -->
    <div class="guide-step-img-placeholder">📷 スクリーンショット準備中</div>
    <span class="guide-step-num">1</span>
    <h2>テーマを選ぶ</h2>
    <p>マイサイト一覧の「＋ 新しいHPを作成」から、カフェ・ビストロ・居酒屋・定食屋・高級店の5テーマから1つ選びます。</p>
  </div>

  <div class="guide-step">
    <!-- TODO: 実機操作後、images/guide/02-basic-info.png を撮影してこのプレースホルダーを<img>タグに置き換える -->
    <div class="guide-step-img-placeholder">📷 スクリーンショット準備中</div>
    <span class="guide-step-num">2</span>
    <h2>基本情報を入力する</h2>
    <p>店名・ジャンル・キャッチコピー・お店の紹介文を入力します。右側にリアルタイムでプレビューが反映されます。</p>
  </div>

  <div class="guide-step">
    <!-- TODO: 実機操作後、images/guide/03-photo.png を撮影してこのプレースホルダーを<img>タグに置き換える -->
    <div class="guide-step-img-placeholder">📷 スクリーンショット準備中</div>
    <span class="guide-step-num">3</span>
    <h2>写真をアップロードする</h2>
    <p>メイン画像とギャラリー画像をアップロードします。写真がない場合はAI画像生成機能でお店のイメージに合った写真を作成できます。</p>
  </div>

  <div class="guide-step">
    <!-- TODO: 実機操作後、images/guide/04-preview.png を撮影してこのプレースホルダーを<img>タグに置き換える -->
    <div class="guide-step-img-placeholder">📷 スクリーンショット準備中</div>
    <span class="guide-step-num">4</span>
    <h2>プレビューを確認する</h2>
    <p>入力した内容がそのままHPになります。画面右側でいつでも最新の見た目を確認できます。</p>
  </div>

  <div class="guide-step">
    <!-- TODO: 実機操作後、images/guide/05-publish.png を撮影してこのプレースホルダーを<img>タグに置き換える -->
    <div class="guide-step-img-placeholder">📷 スクリーンショット準備中</div>
    <span class="guide-step-num">5</span>
    <h2>公開する</h2>
    <p>「公開する」を押し、「月額プランを契約する」から決済すると、HPが一般公開されます。公開ページは契約中かつ公開状態のときに表示されます。</p>
  </div>

  <div class="guide-cta">
    <a href="login.html?tab=signup" class="btn">無料で会員登録して始める</a>
  </div>
</main>

</body>
</html>
```

- [ ] **Step 2: ブラウザで開いて確認する**

Playwright(`node_modules/playwright`)で`グルメHP作成アプリ/guide.html`を開き、以下を確認する：
- 5つのステップが順に表示され、各ステップに「📷 スクリーンショット準備中」のプレースホルダー枠が表示される
- 「サービス紹介に戻る」「無料で会員登録して始める」のリンクがそれぞれ正しく遷移する
- `index.html`の「詳しい使い方を見る」から`guide.html`に遷移できる

- [ ] **Step 3: コミット**

```bash
git add "グルメHP作成アプリ/guide.html"
git commit -m "使い方ガイドページ(guide.html)を新設しテキストで5ステップを解説（スクリーンショットは後日追加）"
```

---

## Task 6: 全体のリンク確認と最終チェック

**Files:**
- 変更なし（確認のみ。問題が見つかった場合はTask 1〜5で作成・編集したファイルを修正する）

- [ ] **Step 1: 全ページのリンクを一通りクリックして確認する**

Playwright MCPで以下を順に確認する：
- ルート`index.html`の「HP生成アプリを開く」カードから`グルメHP作成アプリ/index.html`（新LP）に遷移する
- LPヘッダーの「ログイン」「無料で始める」→`login.html`
- LPの「テンプレート例」5カード→それぞれ対応するサンプルHPが開く
- LPの「詳しい使い方を見る」→`guide.html`
- LPの「無料で会員登録」（料金セクション）→`login.html?tab=signup`
- LPの「このプランで相談する」→ `#`（プレースホルダーであることを確認するのみ。実URLはcoconala公開後に別途差し込む）
- `guide.html`の「サービス紹介に戻る」→`index.html`
- `login.html`の「サービス紹介ページに戻る」→`index.html`

- [ ] **Step 2: スマホ幅(375px)・タブレット幅(768px)・PC幅(1280px)でLPと`guide.html`の見た目を確認する**

Playwright MCPでビューポートを切り替えて、レイアウト崩れ・テキストの重なりがないことを確認する。

- [ ] **Step 3: 既存ページに影響がないことを確認する**

`dashboard.html`・`editor.html`・`site.html`・ルート`index.html`を変更していないことを`git diff --stat`で確認する。

```bash
git diff --stat HEAD~6
```

`グルメHP作成アプリ/index.html`・`login.html`・`guide.html`・`images/guide/`以外に差分が無いことを確認する。

- [ ] **Step 4: 最終確認後、ユーザーに報告する**

問題があれば該当タスクに戻って修正する。問題がなければ完了として報告する。
