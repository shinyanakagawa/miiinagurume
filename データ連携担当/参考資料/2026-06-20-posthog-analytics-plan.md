# PostHog分析導入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** グルメHP作成アプリ（管理画面：index.html / dashboard.html / editor.html）にPostHogによる製品分析を導入し、サインアップ・ログイン・サイト作成・公開・課金導線クリックを計測できるようにする。

**Architecture:** イベント名・プロパティを組み立てる純粋関数（`analytics-events.js`）と、PostHog SDKの初期化・送信を行う副作用関数（`analytics.js`）を分離する。前者はVitestでユニットテストし、後者とDOM結合部分は手動ブラウザ確認で検証する。

**Tech Stack:** posthog-js（esm.sh経由のESM import、既存の`supabase-client.js`と同じパターン）、Vitest（新規導入、グルメHP作成アプリ配下にのみ追加）。

## Global Constraints

- 対象は `グルメHP作成アプリ/` 配下のみ。site.html（店舗公開HP）の訪問者解析は対象外。
- 既存コードの慣習（ESM `<script type="module">`、CDN importは`https://esm.sh/...`）に従う。
- 新規導入するテストフレームワークはVitestのみ。DOM操作・Clerk/Supabase結合部分は自動テスト化しない（手動ブラウザ確認で検証）。
- PostHogはPostHog Cloud（無料枠）を利用する。

---

### Task 1: Vitestセットアップとイベント定義の純粋関数

**Files:**
- Create: `グルメHP作成アプリ/package.json`
- Create: `グルメHP作成アプリ/js/analytics-events.js`
- Test: `グルメHP作成アプリ/js/analytics-events.test.js`

**Interfaces:**
- Produces: `buildEvent(name, properties = {})` → `{ name, properties }`
- Produces: `signupEvent(method)` → `{ name: 'signup_completed', properties: { method } }`
- Produces: `loginEvent(method)` → `{ name: 'login_completed', properties: { method } }`
- Produces: `siteCreatedEvent(theme)` → `{ name: 'site_created', properties: { theme } }`
- Produces: `sitePublishedEvent(slug)` → `{ name: 'site_published', properties: { slug } }`
- Produces: `siteUnpublishedEvent(slug)` → `{ name: 'site_unpublished', properties: { slug } }`
- Produces: `subscribeClickEvent(siteId)` → `{ name: 'subscribe_click', properties: { site_id: siteId } }`
- Produces: `siteSavedEvent(siteId)` → `{ name: 'site_saved', properties: { site_id: siteId } }`

- [ ] **Step 1: package.jsonを作成**

`グルメHP作成アプリ/package.json`:

```json
{
  "name": "gurume-hp-app",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: 依存をインストール**

Run: `cd グルメHP作成アプリ && npm install`
Expected: `node_modules/`が作成され、`vitest`がインストールされる

- [ ] **Step 3: 失敗するテストを書く**

`グルメHP作成アプリ/js/analytics-events.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  signupEvent, loginEvent, siteCreatedEvent,
  sitePublishedEvent, siteUnpublishedEvent, subscribeClickEvent, siteSavedEvent,
} from './analytics-events.js';

describe('analytics-events', () => {
  it('signupEvent はメソッド名を含むイベントを返す', () => {
    expect(signupEvent('email')).toEqual({
      name: 'signup_completed',
      properties: { method: 'email' },
    });
  });

  it('loginEvent はメソッド名を含むイベントを返す', () => {
    expect(loginEvent('email')).toEqual({
      name: 'login_completed',
      properties: { method: 'email' },
    });
  });

  it('siteCreatedEvent はテーマ名を含むイベントを返す', () => {
    expect(siteCreatedEvent('bistro')).toEqual({
      name: 'site_created',
      properties: { theme: 'bistro' },
    });
  });

  it('sitePublishedEvent はslugを含むイベントを返す', () => {
    expect(sitePublishedEvent('miiina-cafe')).toEqual({
      name: 'site_published',
      properties: { slug: 'miiina-cafe' },
    });
  });

  it('siteUnpublishedEvent はslugを含むイベントを返す', () => {
    expect(siteUnpublishedEvent('miiina-cafe')).toEqual({
      name: 'site_unpublished',
      properties: { slug: 'miiina-cafe' },
    });
  });

  it('subscribeClickEvent はsite_idを含むイベントを返す', () => {
    expect(subscribeClickEvent('abc-123')).toEqual({
      name: 'subscribe_click',
      properties: { site_id: 'abc-123' },
    });
  });

  it('siteSavedEvent はsite_idを含むイベントを返す', () => {
    expect(siteSavedEvent('abc-123')).toEqual({
      name: 'site_saved',
      properties: { site_id: 'abc-123' },
    });
  });
});
```

- [ ] **Step 4: テストを実行して失敗を確認**

Run: `cd グルメHP作成アプリ && npm test`
Expected: FAIL（`analytics-events.js`が存在しないためimportエラー）

- [ ] **Step 5: 実装を書く**

`グルメHP作成アプリ/js/analytics-events.js`:

```js
// ============================================================
// グルメHP作成アプリ - 分析イベント定義（純粋関数）
// PostHogへの送信はせず、イベント名とプロパティの組み立てのみ行う
// ============================================================

export function buildEvent(name, properties = {}) {
  return { name, properties };
}

export function signupEvent(method) {
  return buildEvent('signup_completed', { method });
}

export function loginEvent(method) {
  return buildEvent('login_completed', { method });
}

export function siteCreatedEvent(theme) {
  return buildEvent('site_created', { theme });
}

export function sitePublishedEvent(slug) {
  return buildEvent('site_published', { slug });
}

export function siteUnpublishedEvent(slug) {
  return buildEvent('site_unpublished', { slug });
}

export function subscribeClickEvent(siteId) {
  return buildEvent('subscribe_click', { site_id: siteId });
}

export function siteSavedEvent(siteId) {
  return buildEvent('site_saved', { site_id: siteId });
}
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `cd グルメHP作成アプリ && npm test`
Expected: PASS（7件すべて成功）

- [ ] **Step 7: .gitignoreにnode_modulesを追加**

`グルメHP作成アプリ/.gitignore`（新規作成）:

```
node_modules/
```

- [ ] **Step 8: コミット**

```bash
git add "グルメHP作成アプリ/package.json" "グルメHP作成アプリ/.gitignore" "グルメHP作成アプリ/js/analytics-events.js" "グルメHP作成アプリ/js/analytics-events.test.js"
git commit -m "feat: PostHog分析イベント定義の純粋関数とVitestテストを追加"
```

---

### Task 2: PostHogプロジェクト作成とクライアント初期化

**Files:**
- Create: `グルメHP作成アプリ/js/analytics.js`

**Interfaces:**
- Consumes: なし（外部SDK `posthog-js` のみ）
- Produces: `identifyUser(userId, properties = {})`（戻り値なし、副作用のみ）
- Produces: `track(event)`（`event`は`{ name, properties }`形式。Task 1の`analytics-events.js`が返す形と一致させる。戻り値なし、副作用のみ）

- [ ] **Step 1: PostHogプロジェクトを作成しAPIキーを取得**

手動作業（ブラウザでPostHog管理画面を操作）:
1. https://posthog.com で無料プランのアカウント・プロジェクトを作成する
2. プロジェクト設定から「Project API Key」（`phc_`で始まる文字列）と、リージョン（US: `https://us.i.posthog.com` / EU: `https://eu.i.posthog.com`）を確認する
3. 取得したAPIキーとホストをメモする（次のステップで`analytics.js`に設定する）

- [ ] **Step 2: analytics.jsを作成**

`グルメHP作成アプリ/js/analytics.js`の`POSTHOG_KEY`は、Step 1で取得した実際のProject API Keyに書き換えること。

```js
// ============================================================
// グルメHP作成アプリ - PostHogクライアント
// イベント名・プロパティの組み立てはanalytics-events.jsを使う
// ============================================================
import posthog from 'https://esm.sh/posthog-js@1';

const POSTHOG_KEY = 'phc_REPLACE_WITH_YOUR_PROJECT_API_KEY';
const POSTHOG_HOST = 'https://us.i.posthog.com';

posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST });

export function identifyUser(userId, properties = {}) {
  posthog.identify(userId, properties);
}

export function track(event) {
  posthog.capture(event.name, event.properties);
}
```

- [ ] **Step 3: ブラウザで読み込み確認**

`グルメHP作成アプリ/index.html`の`<script type="module">`の先頭に一時的に以下を追加し、ブラウザで`index.html`を開いてDevToolsのConsoleにエラーが出ないことを確認する（確認後この1行は削除する。本格的な統合はTask 3で行う）:

```js
import './js/analytics.js';
```

Run: ブラウザで`グルメHP作成アプリ/index.html`を開く
Expected: Consoleに`posthog-js`関連のエラーが出ない。PostHog管理画面の「Activity」→「Live events」に`$pageview`イベントが届く

- [ ] **Step 4: コミット**

```bash
git add "グルメHP作成アプリ/js/analytics.js"
git commit -m "feat: PostHogクライアント初期化処理を追加"
```

---

### Task 3: index.htmlへの統合（サインアップ・ログイン計測）

**Files:**
- Modify: `グルメHP作成アプリ/index.html:56-103`

**Interfaces:**
- Consumes: `signupEvent`, `loginEvent`（Task 1の`analytics-events.js`）、`track`, `identifyUser`（Task 2の`analytics.js`）

- [ ] **Step 1: importを追加**

`グルメHP作成アプリ/index.html`の56行目付近、既存のimport文を以下のように変更する:

変更前:
```js
<script type="module">
  import { signIn, signUp, getCurrentUser } from './js/supabase-client.js';
```

変更後:
```js
<script type="module">
  import { signIn, signUp, getCurrentUser } from './js/supabase-client.js';
  import { track, identifyUser } from './js/analytics.js';
  import { signupEvent, loginEvent } from './js/analytics-events.js';
```

- [ ] **Step 2: フォーム送信処理にイベント計測を追加**

`グルメHP作成アプリ/index.html`の83-102行目、フォーム送信ハンドラを以下のように変更する:

変更前:
```js
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
```

変更後:
```js
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    submitBtn.disabled = true;
    msg.innerHTML = '';
    try {
      if (mode === 'login') {
        const { user } = await signIn(email, password);
        identifyUser(user.id, { email: user.email });
        track(loginEvent('email'));
        location.href = 'dashboard.html';
      } else {
        const { user } = await signUp(email, password);
        if (user) identifyUser(user.id, { email: user.email });
        track(signupEvent('email'));
        msg.innerHTML = `<div class="app-msg success">登録確認メールを送信しました。メール内のリンクから認証後、ログインしてください。</div>`;
      }
    } catch (err) {
      msg.innerHTML = `<div class="app-msg error">${err.message}</div>`;
    } finally {
      submitBtn.disabled = false;
    }
  });
```

- [ ] **Step 3: ブラウザで動作確認**

Run: ブラウザで`グルメHP作成アプリ/index.html`を開き、テスト用メールアドレスで「新規登録」→確認メール認証後に「ログイン」を行う
Expected: PostHog管理画面の「Activity」→「Live events」に`signup_completed`イベントと`login_completed`イベントが、それぞれ`method: email`プロパティ付きで届く。また「People」にログインしたユーザーのemailが表示される

- [ ] **Step 4: コミット**

```bash
git add "グルメHP作成アプリ/index.html"
git commit -m "feat: index.htmlにサインアップ/ログインのPostHogイベント計測を追加"
```

---

### Task 4: dashboard.htmlへの統合（サイト新規作成計測）

**Files:**
- Modify: `グルメHP作成アプリ/dashboard.html:69-184`

**Interfaces:**
- Consumes: `siteCreatedEvent`（Task 1の`analytics-events.js`）、`track`（Task 2の`analytics.js`）

- [ ] **Step 1: importを追加**

`グルメHP作成アプリ/dashboard.html`の69行目付近、既存のimport文を以下のように変更する:

変更前:
```js
<script type="module">
  import { getCurrentUser, signOut, getMySites, createSite, isSlugTaken, deleteSite } from './js/supabase-client.js';
  import { THEMES } from './js/template-renderer.js';
```

変更後:
```js
<script type="module">
  import { getCurrentUser, signOut, getMySites, createSite, isSlugTaken, deleteSite } from './js/supabase-client.js';
  import { THEMES } from './js/template-renderer.js';
  import { track } from './js/analytics.js';
  import { siteCreatedEvent } from './js/analytics-events.js';
```

- [ ] **Step 2: 新規作成フォームの送信処理にイベント計測を追加**

`グルメHP作成アプリ/dashboard.html`の153-183行目、新規作成フォームのsubmitハンドラを以下のように変更する:

変更前:
```js
      const site = await createSite({
        slug,
        theme: selectedTheme,
        data: { store_name: storeName, genre: '' },
      });
      location.href = `editor.html?id=${site.id}`;
```

変更後:
```js
      const site = await createSite({
        slug,
        theme: selectedTheme,
        data: { store_name: storeName, genre: '' },
      });
      track(siteCreatedEvent(selectedTheme));
      location.href = `editor.html?id=${site.id}`;
```

- [ ] **Step 3: ブラウザで動作確認**

Run: ブラウザでログイン後、`dashboard.html`から「＋ 新しいHPを作成」でテーマを選び新規作成する
Expected: PostHog管理画面の「Live events」に`site_created`イベントが`theme`プロパティ付きで届く

- [ ] **Step 4: コミット**

```bash
git add "グルメHP作成アプリ/dashboard.html"
git commit -m "feat: dashboard.htmlにサイト新規作成のPostHogイベント計測を追加"
```

---

### Task 5: editor.htmlへの統合（公開・課金導線計測）

**Files:**
- Modify: `グルメHP作成アプリ/editor.html:201-496`

**Interfaces:**
- Consumes: `sitePublishedEvent`, `siteUnpublishedEvent`, `subscribeClickEvent`, `siteSavedEvent`（Task 1の`analytics-events.js`）、`track`（Task 2の`analytics.js`）

- [ ] **Step 1: importを追加**

`グルメHP作成アプリ/editor.html`の201-205行目、既存のimport文を以下のように変更する:

変更前:
```js
<script type="module">
  import {
    getCurrentUser, getSiteById, updateSiteData, uploadSiteImage, createCheckoutSession,
  } from './js/supabase-client.js';
  import { renderSiteHTML, THEMES } from './js/template-renderer.js';
```

変更後:
```js
<script type="module">
  import {
    getCurrentUser, getSiteById, updateSiteData, uploadSiteImage, createCheckoutSession,
  } from './js/supabase-client.js';
  import { renderSiteHTML, THEMES } from './js/template-renderer.js';
  import { track } from './js/analytics.js';
  import { sitePublishedEvent, siteUnpublishedEvent, subscribeClickEvent, siteSavedEvent } from './js/analytics-events.js';
```

- [ ] **Step 2: 公開・下書き・課金ボタンのハンドラにイベント計測を追加**

`グルメHP作成アプリ/editor.html`の462-482行目を以下のように変更する:

変更前:
```js
  document.getElementById('publish-btn').addEventListener('click', async () => {
    collectData();
    site = await updateSiteData(siteId, { theme: site.theme, data: site.data, status: 'published' });
    renderStatus();
    msgEl.innerHTML = '<div class="app-msg success">公開設定にしました</div>';
  });
  document.getElementById('unpublish-btn').addEventListener('click', async () => {
    collectData();
    site = await updateSiteData(siteId, { theme: site.theme, data: site.data, status: 'draft' });
    renderStatus();
    msgEl.innerHTML = '<div class="app-msg">下書きに戻しました</div>';
  });
  document.getElementById('subscribe-btn').addEventListener('click', async () => {
    msgEl.innerHTML = '<div class="app-msg">決済ページを準備しています...</div>';
    try {
      const { url } = await createCheckoutSession(siteId);
      location.href = url;
    } catch (err) {
      msgEl.innerHTML = `<div class="app-msg error">決済ページの作成に失敗しました: ${err.message}</div>`;
    }
  });
```

変更後:
```js
  document.getElementById('publish-btn').addEventListener('click', async () => {
    collectData();
    site = await updateSiteData(siteId, { theme: site.theme, data: site.data, status: 'published' });
    track(sitePublishedEvent(site.slug));
    renderStatus();
    msgEl.innerHTML = '<div class="app-msg success">公開設定にしました</div>';
  });
  document.getElementById('unpublish-btn').addEventListener('click', async () => {
    collectData();
    site = await updateSiteData(siteId, { theme: site.theme, data: site.data, status: 'draft' });
    track(siteUnpublishedEvent(site.slug));
    renderStatus();
    msgEl.innerHTML = '<div class="app-msg">下書きに戻しました</div>';
  });
  document.getElementById('subscribe-btn').addEventListener('click', async () => {
    track(subscribeClickEvent(siteId));
    msgEl.innerHTML = '<div class="app-msg">決済ページを準備しています...</div>';
    try {
      const { url } = await createCheckoutSession(siteId);
      location.href = url;
    } catch (err) {
      msgEl.innerHTML = `<div class="app-msg error">決済ページの作成に失敗しました: ${err.message}</div>`;
    }
  });
```

- [ ] **Step 3: 保存ボタンのハンドラにイベント計測を追加**

`グルメHP作成アプリ/editor.html`の484-496行目を以下のように変更する:

変更前:
```js
  document.getElementById('save-btn').addEventListener('click', async () => {
    collectData();
    const status = document.getElementById('save-status');
    status.textContent = '保存中...';
    try {
      site = await updateSiteData(siteId, { theme: site.theme, data: site.data });
      status.textContent = '保存しました';
      setTimeout(() => status.textContent = '', 2000);
    } catch (err) {
      msgEl.innerHTML = `<div class="app-msg error">${err.message}</div>`;
    }
  });
```

変更後:
```js
  document.getElementById('save-btn').addEventListener('click', async () => {
    collectData();
    const status = document.getElementById('save-status');
    status.textContent = '保存中...';
    try {
      site = await updateSiteData(siteId, { theme: site.theme, data: site.data });
      track(siteSavedEvent(siteId));
      status.textContent = '保存しました';
      setTimeout(() => status.textContent = '', 2000);
    } catch (err) {
      msgEl.innerHTML = `<div class="app-msg error">${err.message}</div>`;
    }
  });
```

- [ ] **Step 4: ブラウザで動作確認**

Run: ブラウザで編集画面を開き、「保存する」「公開する」「下書きに戻す」「月額プランを契約する」を順にクリックする
Expected: PostHog管理画面の「Live events」に`site_saved`（`site_id`付き）、`site_published`（`slug`付き）、`site_unpublished`（`slug`付き）、`subscribe_click`（`site_id`付き）の4イベントが届く

- [ ] **Step 5: コミット**

```bash
git add "グルメHP作成アプリ/editor.html"
git commit -m "feat: editor.htmlに公開/課金導線のPostHogイベント計測を追加"
```

---

### Task 6: Stripe Webhookでのサブスクリプション有効化イベント送信（サーバーサイド）

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

**Interfaces:**
- Consumes: なし（PostHog capture APIへの直接HTTPリクエストのみ。フロントエンドの`analytics-events.js`はDeno環境からは利用しない）
- Produces: `trackPostHogEvent(distinctId, event, properties)`（戻り値なし、副作用のみ。本タスク内でのみ使用）

- [ ] **Step 1: PostHogのProject API Keyとホストをsupabase secretsに設定**

手動作業:

```bash
supabase secrets set POSTHOG_API_KEY=phc_xxx
supabase secrets set POSTHOG_HOST=https://us.i.posthog.com
```

（`phc_xxx`はTask 2で取得した実際のProject API Keyに置き換える。EUリージョンの場合は`POSTHOG_HOST`を`https://eu.i.posthog.com`にする）

- [ ] **Step 2: PostHog送信用ヘルパーとサブスクリプション有効化時の呼び出しを追加**

`supabase/functions/stripe-webhook/index.ts`の17-28行目（既存の`stripe`・`supabase`クライアント初期化の直後）に以下を追加する:

変更前:
```ts
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function mapStripeStatus(status: string): string {
```

変更後:
```ts
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function trackPostHogEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
) {
  const apiKey = Deno.env.get('POSTHOG_API_KEY');
  if (!apiKey) return;
  const host = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com';
  await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, event, distinct_id: distinctId, properties }),
  });
}

function mapStripeStatus(status: string): string {
```

- [ ] **Step 3: checkout.session.completedハンドラでイベント送信**

`supabase/functions/stripe-webhook/index.ts`の67-77行目を以下のように変更する:

変更前:
```ts
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const siteId = session.metadata?.site_id;
      if (siteId && session.subscription) {
        await updateBySiteId(siteId, {
          subscription_status: 'active',
          stripe_subscription_id: session.subscription as string,
        });
      }
      break;
    }
```

変更後:
```ts
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const siteId = session.metadata?.site_id;
      if (siteId && session.subscription) {
        await updateBySiteId(siteId, {
          subscription_status: 'active',
          stripe_subscription_id: session.subscription as string,
        });
        const { data: site } = await supabase
          .from('sites').select('user_id').eq('id', siteId).single();
        if (site) {
          await trackPostHogEvent(site.user_id, 'subscription_activated', { site_id: siteId });
        }
      }
      break;
    }
```

- [ ] **Step 4: デプロイ**

```bash
supabase functions deploy stripe-webhook
```

- [ ] **Step 5: 動作確認**

Run: テスト用Stripeアカウントでテストカード（`4242 4242 4242 4242`）を使い、editor.htmlから「月額プランを契約する」→Checkout完了まで実行する
Expected: PostHog管理画面の「Live events」に`subscription_activated`イベントが`site_id`プロパティ付きで届く（`distinct_id`はサイト所有者のSupabase Auth user.idと一致する）

- [ ] **Step 6: コミット**

```bash
git add "supabase/functions/stripe-webhook/index.ts"
git commit -m "feat: Stripeサブスクリプション有効化時にPostHogへサーバーサイドイベントを送信"
```

---

## 完了条件

- `npm test`（`グルメHP作成アプリ/`配下）が全件PASSする
- PostHog管理画面の「Live events」で、ログイン・サインアップ・サイト作成・保存・公開・課金導線クリック・サブスクリプション有効化の各イベントが実際に確認できる

---

## 追加スコープ：site.html（公開HP）訪問者解析（2026-06-28追記）

> 上記「Global Constraints」では「site.html（店舗公開HP）の訪問者解析は対象外」としていたが、
> フェーズ2の依頼により本節でスコープに追加する。対象は店舗の公開HP（一般客が訪れるページ）の
> 訪問者解析のみであり、上記Task 1〜6（管理画面側）の計測とは別物として扱う。

### 設計方針

- **匿名トラッキングのみ。** `posthog.identify()` は呼ばない。site.html の訪問者は一般の来店客であり、
  店舗オーナーのSupabase Auth `user_id` とは無関係なため、店主アカウントの行動ログと混在させない。
  PostHogのデフォルトの匿名 `distinct_id`（cookie/localStorageベース）のみを使う。
- **計測イベントは最小限の4種類：**
  - `$pageview`（PostHog SDKが自動収集。ページビュー）
  - `tel_link_click`（`tel:` リンクのクリック＝電話番号タップ）
  - `reservation_form_submit`（予約フォーム送信。`#reservation-form` の `submit` イベント）
  - `map_open_click`（Googleマップを開くリンクのクリック）
- **autocapture は無効化**し、上記4イベントのみ明示的に `posthog.capture()` する
  （訪問者の全クリック・全入力を収集しない。プライバシー配慮と通信量の最小化のため）。
- PostHog Cloud無料枠を利用する想定（管理画面側の計測と同じプロジェクトを共有してよいが、
  イベント名のprefixや`$current_url`等の標準プロパティで管理画面イベントと区別可能）。

### 実装

- **実装ファイル：** `グルメHP作成アプリ/js/template-renderer.js`
  - `renderAnalyticsSnippet()` 関数を追加。PostHog公式スニペット（インライン、esm.sh等のCDN importではなく
    `<script>`内に直接埋め込む形）と、上記4イベントを発火させるクリック/submitリスナーを文字列として返す。
  - `renderSiteHTML()` の `</body>` 直前で `renderAnalyticsSnippet()` の出力を埋め込む。
  - APIキーはプレースホルダ `YOUR_POSTHOG_API_KEY`（既存のTurnstile `YOUR_TURNSTILE_SITE_KEY` と同じ扱い）。
    実際にPostHogプロジェクトを作成しProject API Keyを取得した後、`template-renderer.js` 内の
    `POSTHOG_API_KEY` 定数を実際の値（`phc_` で始まる文字列）に置き換える。
    リージョンがEUの場合は `POSTHOG_HOST` を `https://eu.i.posthog.com` に変更する。
- `tel_link_click` は `a[href^="tel:"]` を持つ要素のクリックをイベント委譲（`document` への1つのリスナー）で検知する。
  ヘッダーCTA・フローティング予約ボタン・店舗情報テーブルのTEL行など、複数箇所にある `tel:` リンク全てを
  個別にリスナー登録せずカバーできる。
- `map_open_click` は `a[href*="maps.google.com"]` または `a[href*="google.com/maps"]` を持つリンクのクリックを検知する。
- `reservation_form_submit` は `#reservation-form` が存在する場合のみ発火する。
  **現状の汎用テンプレート（`editor.html` / `template-renderer.js`）には予約フォーム自体が未実装のため、
  現時点ではこのイベントは発火しない。** Phase2の別タスク（予約フォームの汎用化、本ファイルとは別の
  WEB制作担当の実装範囲）で `#reservation-form` というIDのフォームが追加された時点で、追加のコード変更なしに
  そのまま計測が動作するよう先行実装した。

### Go-live前に必要な外部対応

1. https://posthog.com で無料プランのアカウント・プロジェクトを新規作成する
   （既存の管理画面用プロジェクトと共用してもよいが、イベント数の無料枠消費は合算されることに注意）。
2. プロジェクト設定から実際のProject API Key（`phc_...`）とリージョン（US/EU）を取得する。
3. `グルメHP作成アプリ/js/template-renderer.js` の `POSTHOG_API_KEY`（および必要なら `POSTHOG_HOST`）を
   実際の値に書き換える。
4. ブラウザで実際に公開済みサイト（`site.html?slug=...`）を開き、PostHog管理画面の
   「Activity」→「Live events」で `$pageview` / `tel_link_click` / `map_open_click` が実際に届くことを確認する
   （`reservation_form_submit` は予約フォームの実装後に確認する）。

### 完了条件（追加スコープ分）

- `site.html` を開くと PostHog の `$pageview` イベントが記録される（実APIキー設定後）
- `tel:` リンク・Googleマップを開くリンクのクリックで、それぞれ対応イベントが記録される
- サイト訪問者のイベントが店舗オーナーの `user_id` と `identify` で紐付けられていないことを確認する
  （PostHog「People」一覧に一般訪問者の匿名IDが店主のメールアドレス等と統合されていないこと）
