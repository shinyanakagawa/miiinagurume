# Clerk認証移行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グルメHP作成アプリの認証をSupabase AuthからClerkに置き換える。DB（Postgres）とStorageはSupabaseのまま維持し、SupabaseのThird-Party Auth機能でClerkが発行するJWTをRLS判定に使う。

**Architecture:** `@clerk/clerk-js`（Vanilla JS版）でクライアント側の認証UI・セッション管理を行い、SupabaseクライアントはClerkのセッショントークンを`accessToken`コールバックで受け取る。DB側は`sites.user_id`をUUID（`auth.users`参照）からTEXT（Clerk user ID）に変更し、RLSポリシーを`auth.uid()`から`auth.jwt()->>'sub'`に変更する。

**Tech Stack:** `@clerk/clerk-js@5`（esm.sh経由のESM import）、Supabase Third-Party Auth（Clerk連携）。

## Global Constraints

- 現時点で実ユーザー（顧客のサイトデータ）は存在しない（テストデータのみ）。そのため`sites`テーブルはDROPして再作成する（データ移行は不要）。
- 既存コードの慣習（ESM `<script type="module">`、CDN importは`https://esm.sh/...`）に従う。
- Clerkの現行バージョン（Core 3）では`afterSignInUrl`/`afterSignUpUrl`は廃止されており、`fallbackRedirectUrl`/`signUpFallbackRedirectUrl`を使う。
- DOM結合・Clerk/Supabase結合部分は自動テスト化しない（手動ブラウザ確認で検証）。本計画には純粋関数として抽出できるロジックがほぼ無いため、Vitestは導入しない。
- Stripe決済・PostHog分析・Cloudflareルーティングは別計画で扱うため対象外。

---

### Task 1: ClerkプロジェクトとSupabase Third-Party Auth連携の設定

**Files:**
- なし（Clerk / Supabase管理画面での手動セットアップのみ）

**Interfaces:**
- Produces: Clerk Publishable Key（`pk_test_...`または`pk_live_...`）。Task 3で使用する。

- [ ] **Step 1: Clerkプロジェクトを作成**

手動作業（Clerk管理画面）:
1. https://clerk.com でアカウント・新規アプリケーションを作成する
2. Sign-in optionsで「Email」を有効にする（既存のメール/パスワード認証と同等の体験にする）
3. 「API Keys」ページから「Publishable key」（`pk_test_...`）をメモする

- [ ] **Step 2: ClerkとSupabaseのThird-Party Auth連携を設定**

手動作業:
1. Clerk管理画面の「Integrations」→「Supabase」を開き、統合を有効化する
2. 表示される「Clerk domain」（例: `https://xxxxx.clerk.accounts.dev`）をメモする
3. Supabase管理画面の「Authentication」→「Sign In / Up」→「Third Party Auth」で「Clerk」を追加し、Step2-2でメモしたClerk domainを貼り付けて保存する

- [ ] **Step 3: 設定確認**

Run: Supabase管理画面の「Authentication」→「Third Party Auth」一覧に「Clerk」が表示されていることを確認する
Expected: Clerkがプロバイダとして登録されている状態になる

---

### Task 2: DBスキーマをClerk対応に移行

**Files:**
- Modify: `supabase/schema_app.sql`

**Interfaces:**
- Produces: `sites.user_id`がTEXT型（Clerkのuser ID文字列を格納）になり、RLSポリシーが`auth.jwt()->>'sub'`を比較に使うようになる。Task 4以降のフロントエンドコードはこの前提で書く。

- [ ] **Step 1: schema_app.sqlをClerk対応版に書き換え**

`supabase/schema_app.sql`の全文を以下に置き換える:

```sql
-- ============================================================
-- グルメHP作成アプリ 追加スキーマ（Clerk認証対応版）
-- 既存の schema.sql（チーム管理用）に追加で実行してください
-- ============================================================

-- 既存のsitesテーブルと関連ポリシーを削除（実データなし、Clerk移行のため再作成）
DROP TABLE IF EXISTS sites CASCADE;
DROP POLICY IF EXISTS "owner upload own images" ON storage.objects;
DROP POLICY IF EXISTS "owner update own images" ON storage.objects;
DROP POLICY IF EXISTS "owner delete own images" ON storage.objects;
DROP POLICY IF EXISTS "public read images" ON storage.objects;

-- 1. サイト（飲食店オーナーが作成するHPデータ）
-- user_id は Clerk が発行する user ID（文字列）を格納する。
-- auth.users への外部キー制約は持たない（ClerkユーザーはSupabase auth.usersに存在しないため）。
CREATE TABLE sites (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  slug                    TEXT UNIQUE NOT NULL,
  theme                   TEXT NOT NULL DEFAULT 'cafe'
                            CHECK (theme IN ('cafe','bistro','izakaya','teishoku','kaiseki')),
  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  data                    JSONB NOT NULL DEFAULT '{}',
  subscription_status     TEXT NOT NULL DEFAULT 'inactive'
                            CHECK (subscription_status IN ('inactive','active','past_due','canceled')),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX sites_user_id_idx ON sites(user_id);
CREATE INDEX sites_slug_idx ON sites(slug);

-- updated_at 自動更新（関数は既存のものを再利用、無ければ作成）
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sites_set_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Row Level Security（ClerkのJWTを使う：auth.jwt()->>'sub'）
-- ============================================================

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select own sites" ON sites
  FOR SELECT USING (auth.jwt()->>'sub' = user_id);

CREATE POLICY "owner insert own sites" ON sites
  FOR INSERT WITH CHECK (auth.jwt()->>'sub' = user_id);

CREATE POLICY "owner update own sites" ON sites
  FOR UPDATE USING (auth.jwt()->>'sub' = user_id);

CREATE POLICY "owner delete own sites" ON sites
  FOR DELETE USING (auth.jwt()->>'sub' = user_id);

-- 公開済み＋契約有効なサイトは誰でも閲覧可能（公開ページ表示用）
CREATE POLICY "public read published active sites" ON sites
  FOR SELECT USING (status = 'published' AND subscription_status = 'active');

-- ============================================================
-- Storage（写真アップロード用バケット、Clerk対応版ポリシー）
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO NOTHING;

-- ユーザーは自分のフォルダ（<Clerk user id>/...）にのみアップロード・更新・削除可能
CREATE POLICY "owner upload own images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'site-images'
    AND (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  );

CREATE POLICY "owner update own images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'site-images'
    AND (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  );

CREATE POLICY "owner delete own images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'site-images'
    AND (auth.jwt()->>'sub') = (storage.foldername(name))[1]
  );

-- 画像は誰でも閲覧可能（公開HPに表示するため）
CREATE POLICY "public read images" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-images');
```

- [ ] **Step 2: Supabaseに適用**

Run（Supabase MCPの`apply_migration`、またはSupabase SQL Editorで`schema_app.sql`の内容を実行）
Expected: `sites`テーブルが新しいスキーマ（`user_id`がTEXT型）で再作成され、RLSポリシー一覧に`auth.jwt()->>'sub'`を使うポリシーが表示される

- [ ] **Step 3: コミット**

```bash
git add "supabase/schema_app.sql"
git commit -m "feat: sitesテーブルとStorageポリシーをClerk認証(auth.jwt())対応に移行"
```

---

### Task 3: Clerkクライアントの初期化

**Files:**
- Create: `グルメHP作成アプリ/js/clerk-client.js`

**Interfaces:**
- Produces: `clerk`（`@clerk/clerk-js`の`Clerk`インスタンス。`clerk.load()`済みでexportされる。`clerk.user`、`clerk.session`、`clerk.signOut()`、`clerk.mountSignIn()`、`clerk.mountSignUp()`を提供）

- [ ] **Step 1: clerk-client.jsを作成**

`グルメHP作成アプリ/js/clerk-client.js`の`CLERK_PUBLISHABLE_KEY`は、Task 1で取得した実際のPublishable Keyに書き換えること。

```js
// ============================================================
// グルメHP作成アプリ - Clerkクライアント
// 認証UI・セッション管理はClerkが担当する
// ============================================================
import { Clerk } from 'https://esm.sh/@clerk/clerk-js@5';

const CLERK_PUBLISHABLE_KEY = 'pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY';

export const clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
await clerk.load();
```

- [ ] **Step 2: コミット**

```bash
git add "グルメHP作成アプリ/js/clerk-client.js"
git commit -m "feat: Clerkクライアント初期化処理を追加"
```

---

### Task 4: supabase-client.jsの認証部分をClerkベースに置き換え

**Files:**
- Modify: `グルメHP作成アプリ/js/supabase-client.js`

**Interfaces:**
- Consumes: `clerk`（Task 3の`clerk-client.js`）
- Produces: `getCurrentUser()`（同期関数。戻り値は`clerk.user`、ログイン中でなければ`null`。既存の`await getCurrentUser()`という呼び出し方は変更不要で動作する）
- 削除: `signUp`, `signIn`, `signOut`, `onAuthStateChange`（Clerkが直接担当するため）

- [ ] **Step 1: ファイル冒頭のクライアント初期化を変更**

`グルメHP作成アプリ/js/supabase-client.js`の1-11行目を以下のように変更する:

変更前:
```js
// ============================================================
// グルメHP作成アプリ - Supabase クライアント
// 既存チームDBと同じSupabaseプロジェクトを利用（テーブルのみ追加）
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = 'https://fgwoqrnjrsnnhogxvtof.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CmlWeDTHmnnyCQZ2luPqxg_1g5NdBsU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

変更後:
```js
// ============================================================
// グルメHP作成アプリ - Supabase クライアント
// 既存チームDBと同じSupabaseプロジェクトを利用（テーブルのみ追加）
// 認証はClerk（js/clerk-client.js）が担当し、ここではClerkの
// セッショントークンをSupabaseのRLS判定用に渡すのみ行う
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clerk } from './clerk-client.js';

const SUPABASE_URL      = 'https://fgwoqrnjrsnnhogxvtof.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CmlWeDTHmnnyCQZ2luPqxg_1g5NdBsU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => (await clerk.session?.getToken()) ?? null,
});
```

- [ ] **Step 2: 認証関数をClerkベースに置き換え**

`グルメHP作成アプリ/js/supabase-client.js`の13-40行目（「---- 認証 ----」セクション全体）を以下のように変更する:

変更前:
```js
// ---- 認証 ----------------------------------------------------

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session));
}
```

変更後:
```js
// ---- 認証 ----------------------------------------------------
// 認証（サインイン/サインアップ/サインアウト）はClerkが担当する。
// ここではRLS判定や所有者チェックに使うユーザー情報の取得のみ提供する。

export function getCurrentUser() {
  return clerk.user;
}
```

- [ ] **Step 3: コミット**

```bash
git add "グルメHP作成アプリ/js/supabase-client.js"
git commit -m "feat: supabase-client.jsの認証処理をClerkベースに置き換え"
```

---

### Task 5: index.htmlをClerkのサインイン/サインアップUIに置き換え

**Files:**
- Modify: `グルメHP作成アプリ/index.html`

**Interfaces:**
- Consumes: `clerk`（Task 3の`clerk-client.js`）

- [ ] **Step 1: HTML本体を変更**

`グルメHP作成アプリ/index.html`の30-54行目を以下のように変更する:

変更前:
```html
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

    <p class="price-note">月額プラン：1サイトあたり月額1,000円（Stripe決済）</p>
  </div>
</div>
```

変更後:
```html
<div class="center-page" style="min-height:auto;padding-top:0">
  <div class="auth-card app-card">
    <div class="tabs">
      <button id="tab-login" class="active">ログイン</button>
      <button id="tab-signup">新規登録</button>
    </div>

    <div id="clerk-sign-in"></div>
    <div id="clerk-sign-up" hidden></div>

    <p class="price-note">月額プラン：1サイトあたり月額1,000円（Stripe決済）</p>
  </div>
</div>
```

- [ ] **Step 2: スクリプト本体を変更**

`グルメHP作成アプリ/index.html`の56-103行目（`<script type="module">`全体）を以下のように変更する:

変更前:
```js
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
```

変更後:
```js
<script type="module">
  import { clerk } from './js/clerk-client.js';

  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const signInEl = document.getElementById('clerk-sign-in');
  const signUpEl = document.getElementById('clerk-sign-up');

  function setMode(mode) {
    tabLogin.classList.toggle('active', mode === 'login');
    tabSignup.classList.toggle('active', mode === 'signup');
    signInEl.hidden = mode !== 'login';
    signUpEl.hidden = mode !== 'signup';
  }
  tabLogin.addEventListener('click', () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  // 既にログイン済みならダッシュボードへ
  if (clerk.user) {
    location.href = 'dashboard.html';
  } else {
    clerk.mountSignIn(signInEl, { fallbackRedirectUrl: 'dashboard.html' });
    clerk.mountSignUp(signUpEl, { fallbackRedirectUrl: 'dashboard.html' });
  }
</script>
```

- [ ] **Step 3: ブラウザで動作確認**

Run: ブラウザで`グルメHP作成アプリ/index.html`を開く
Expected: Clerkの組み込みサインインフォームが「ログイン」タブに表示される。「新規登録」タブをクリックするとClerkのサインアップフォームに切り替わる。テスト用メールアドレスで新規登録すると確認コード入力が求められ、完了後`dashboard.html`にリダイレクトされる

- [ ] **Step 4: コミット**

```bash
git add "グルメHP作成アプリ/index.html"
git commit -m "feat: index.htmlの認証UIをClerkのSignIn/SignUpコンポーネントに置き換え"
```

---

### Task 6: dashboard.html・editor.htmlのセッションチェックをClerkベースに変更

**Files:**
- Modify: `グルメHP作成アプリ/dashboard.html`
- Modify: `グルメHP作成アプリ/editor.html`

**Interfaces:**
- Consumes: `clerk`（Task 3の`clerk-client.js`）、`getCurrentUser`（Task 4で再定義された同期関数）

- [ ] **Step 1: dashboard.htmlのimportとログアウト処理を変更**

`グルメHP作成アプリ/dashboard.html`の69-87行目を以下のように変更する:

変更前:
```js
<script type="module">
  import { getCurrentUser, signOut, getMySites, createSite, isSlugTaken, deleteSite } from './js/supabase-client.js';
  import { THEMES } from './js/template-renderer.js';

  const sitesEl = document.getElementById('sites');
  const msgEl = document.getElementById('msg');

  const user = await getCurrentUser();
  if (!user) {
    location.href = 'index.html';
  } else {
    document.getElementById('user-email').textContent = user.email;
  }

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut();
    location.href = 'index.html';
  });
```

変更後:
```js
<script type="module">
  import { getCurrentUser, getMySites, createSite, isSlugTaken, deleteSite } from './js/supabase-client.js';
  import { clerk } from './js/clerk-client.js';
  import { THEMES } from './js/template-renderer.js';

  const sitesEl = document.getElementById('sites');
  const msgEl = document.getElementById('msg');

  const user = getCurrentUser();
  if (!user) {
    location.href = 'index.html';
  } else {
    document.getElementById('user-email').textContent = user.primaryEmailAddress?.emailAddress ?? '';
  }

  document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await clerk.signOut();
    location.href = 'index.html';
  });
```

（`getCurrentUser()`はTask 4で`clerk.user`を返す同期関数として再定義済み。`signOut`はsupabase-client.jsから削除したため、ログアウト処理のみ`clerk`を直接importして使う）

- [ ] **Step 2: editor.htmlのimportを変更**

`グルメHP作成アプリ/editor.html`の201-216行目を以下のように変更する:

変更前:
```js
<script type="module">
  import {
    getCurrentUser, getSiteById, updateSiteData, uploadSiteImage, createCheckoutSession,
  } from './js/supabase-client.js';
  import { renderSiteHTML, THEMES } from './js/template-renderer.js';

  const params = new URLSearchParams(location.search);
  const siteId = params.get('id');
  const msgEl = document.getElementById('msg');

  if (!siteId) {
    location.href = 'dashboard.html';
  }

  const user = await getCurrentUser();
  if (!user) location.href = 'index.html';
```

変更後:
```js
<script type="module">
  import {
    getCurrentUser, getSiteById, updateSiteData, uploadSiteImage, createCheckoutSession,
  } from './js/supabase-client.js';
  import { renderSiteHTML, THEMES } from './js/template-renderer.js';

  const params = new URLSearchParams(location.search);
  const siteId = params.get('id');
  const msgEl = document.getElementById('msg');

  if (!siteId) {
    location.href = 'dashboard.html';
  }

  const user = getCurrentUser();
  if (!user) location.href = 'index.html';
```

（`editor.html`は`getCurrentUser()`を`js/supabase-client.js`経由で使い続ける。Task 4でこの関数は同期的に`clerk.user`を返すように再定義済みのため、`await`を外すだけでよい。下記501行目付近の`site.user_id !== user.id`比較もそのまま動作する：ClerkのuserオブジェクトもSupabaseの`auth.users`オブジェクトと同様`id`プロパティを持つ）

- [ ] **Step 3: ブラウザで動作確認**

Run: ブラウザでログイン後、`dashboard.html`に遷移し、ユーザーのメールアドレスがヘッダーに表示されることを確認する。「ログアウト」をクリックし`index.html`に戻ることを確認する。再ログイン後、既存サイトの「編集する」から`editor.html`を開き、正常に表示されることを確認する
Expected: ヘッダーにログイン中のメールアドレスが表示される。ログアウト後は`index.html`に遷移する。`editor.html`が権限エラーなく開ける

- [ ] **Step 4: コミット**

```bash
git add "グルメHP作成アプリ/dashboard.html" "グルメHP作成アプリ/editor.html"
git commit -m "feat: dashboard.html/editor.htmlのセッションチェックをClerkベースに変更"
```

---

### Task 7: 全体動作確認（E2E）

**Files:**
- なし（手動確認のみ）

- [ ] **Step 1: 新規登録からサイト公開までの一連の流れを確認**

Run: ブラウザで以下を順に行う
1. `index.html`から新規登録（テスト用メールアドレス）
2. ダッシュボードでテーマを選び新規HP作成
3. エディタで店舗情報を入力し「保存する」
4. 「公開する」をクリック
5. `site.html?slug=<作成時のslug>`を別タブで開く

Expected: 各ステップでエラーが出ない。手順3の保存時にSupabaseへの書き込みがRLSエラーにならない（`auth.jwt()->>'sub' = user_id`が正しく評価されている証拠）。手順5では「契約中」でないため「このページは現在公開されていません」と表示される（これは正しい挙動。決済導線は別計画のPostHog/既存Stripe実装で確認済み）

- [ ] **Step 2: 他人のサイトにアクセスできないことを確認**

Run: 別のテスト用メールアドレスで新規登録し、最初のアカウントが作成したサイトのIDを直接`editor.html?id=<他人のsiteId>`で開く
Expected: 「このサイトを編集する権限がありません」エラーが表示される（RLSが正しく機能している証拠）

## 完了条件

- Clerkでの新規登録・ログイン・ログアウトがブラウザ上で正常に動作する
- サイトの作成・保存・公開がRLSエラーなく行える
- 他人が作成したサイトを編集できない（RLSが正しく機能している）
