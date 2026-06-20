# セキュリティ強化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** みーなグルメプロジェクトのセキュリティレビューで指摘された7件（課金カラム改ざん・公開API過剰開示・旧システム放置・予約フォームBot対策欠如・XSS・APIキー平文保存・MCP Path Traversal）を修正する。

**Architecture:** DB層（Supabase RLS/トリガー）、フロントエンドJS（グルメHP作成アプリ）、Netlify Functions（予約通知）、ローカルMCPサーバー（mcp-gemini-image）の4箇所に分かれた独立した修正を、優先度順（課金保護→公開データ制限→旧システム閉鎖→Bot対策→XSS→APIキー→MCP）にタスク化する。

**Tech Stack:** PostgreSQL（Supabase, RLS/PL-pgSQL trigger）、Vanilla JS（ES Modules）、Netlify Functions（Node.js）、Cloudflare Turnstile、Node.js MCP SDK。

## Global Constraints

- 本番Supabaseプロジェクトに対する `apply_migration` はデータを書き換える操作のため、適用前に必ずユーザーに確認する。
- 既存の正常系（ビストロ用予約フォーム、グルメHP作成アプリのeditor/dashboard/site表示）を壊さないこと。
- 新規外部サービスキー（Cloudflare Turnstile の Site Key/Secret Key、LINE管理者User ID）はこの計画の実行者が発行できないため、コードは環境変数/設定値を読む形で実装し、実際の値の取得・設定はユーザー対応とする。
- 既存ファイルにテストフレームワークの導入実績がないため、新規に重いテスト基盤を追加しない。純粋ロジック関数は Node.js 標準の `node:test` で検証し、DB変更は `mcp__supabase__execute_sql` による確認、UIに関わる変更はブラウザでの目視確認で代替する。

---

### Task 1: 課金カラム保護トリガー（最優先）

**背景:** `supabase/schema_app.sql:52-53` の `owner update own sites` ポリシーは `USING (auth.uid() = user_id)` のみで `WITH CHECK` がなく、ログイン済みユーザーが自分の `sites` 行の `subscription_status` / `stripe_customer_id` / `stripe_subscription_id` を直接 `update()` で書き換えられる（決済なしで公開状態にできる）。Stripe Webhook (`supabase/functions/stripe-webhook/index.ts`) と create-checkout-session (`supabase/functions/create-checkout-session/index.ts`) はいずれも `SUPABASE_SERVICE_ROLE_KEY` で `createClient` し、PostgREST経由でこれらのカラムを更新しているため、`auth.role() = 'service_role'` のときだけ変更を許可するトリガーで安全に保護できる。

**Files:**
- Create: `supabase/migrations/2026-06-20_01_protect_billing_columns.sql`

**Interfaces:**
- Produces: トリガー関数 `protect_billing_columns()`、トリガー `sites_protect_billing_columns`（Task 3以降では参照しない）

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- ============================================================
-- 課金カラム保護: subscription_status / stripe_customer_id /
-- stripe_subscription_id は service_role 以外からのUPDATEで
-- 変更できないようにする（Stripe Webhook/Edge Functionsのみ可）
-- ============================================================

CREATE OR REPLACE FUNCTION protect_billing_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
      RAISE EXCEPTION 'billing columns can only be modified via service_role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sites_protect_billing_columns ON sites;
CREATE TRIGGER sites_protect_billing_columns
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION protect_billing_columns();
```

- [ ] **Step 2: ユーザーに適用確認を取り、`mcp__supabase__apply_migration` で本番に適用**

migration name: `protect_billing_columns`

- [ ] **Step 3: トリガーが authenticated ロールからの課金カラム変更を拒否することを確認**

`mcp__supabase__execute_sql` で以下を実行（既存行を使うが `ROLLBACK` するため実データは変化しない）：

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated"}';
DO $$
DECLARE
  test_id uuid;
BEGIN
  SELECT id INTO test_id FROM sites LIMIT 1;
  IF test_id IS NOT NULL THEN
    UPDATE sites SET subscription_status = 'active' WHERE id = test_id;
  END IF;
END $$;
ROLLBACK;
```

Expected: `sites` テーブルに1件以上行があれば `ERROR: billing columns can only be modified via service_role` が発生すること。行が0件の場合はテスト不成立なのでその旨を記録する。

- [ ] **Step 4: service_role からの更新が成功することを確認（Stripe Webhookの実動作に影響しないことの確認）**

```sql
BEGIN;
DO $$
DECLARE
  test_id uuid;
  before_status text;
BEGIN
  SELECT id, subscription_status INTO test_id, before_status FROM sites LIMIT 1;
  IF test_id IS NOT NULL THEN
    UPDATE sites SET subscription_status = before_status WHERE id = test_id; -- 値は変えずに確認のみ
  END IF;
END $$;
ROLLBACK;
```

Expected: service_role（デフォルトの実行ロール）ではエラーが出ないこと。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/2026-06-20_01_protect_billing_columns.sql
git commit -m "fix: sitesテーブルの課金カラムをservice_role以外から変更不可にする"
```

---

### Task 2: 公開取得APIのカラムを最小化

**背景:** `グルメHP作成アプリ/js/supabase-client.js:62-71` の `getPublishedSiteBySlug` は `select('*')` で `subscription_status` / `stripe_customer_id` / `stripe_subscription_id` まで匿名ユーザーのブラウザに返している。呼び出し元の `グルメHP作成アプリ/site.html:26-28` は `site.theme` と `site.data` のみ使うため、カラムを絞っても動作に影響しない。

**Files:**
- Modify: `グルメHP作成アプリ/js/supabase-client.js:62-71`

**Interfaces:**
- Consumes: なし（既存の `supabase` クライアントのみ）
- Produces: `getPublishedSiteBySlug(slug)` は `{ theme, status, data }` のみを返す（`site.html` の `renderSiteHTML(site)` がこの形を使う）

- [ ] **Step 1: `select('*')` をカラム指定に変更**

`グルメHP作成アプリ/js/supabase-client.js:62-71` を以下に置き換える：

```js
/** スラッグから公開サイトを取得（公開ページ表示用・誰でも可） */
export async function getPublishedSiteBySlug(slug) {
  const { data, error } = await supabase
    .from('sites')
    .select('theme, status, data')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: ブラウザで動作確認**

`グルメHP作成アプリ/site.html?slug=<公開済みslug>` を開き、サイトが正常に表示されること、ブラウザDevToolsのNetworkタブで該当リクエストのレスポンスに `subscription_status`/`stripe_customer_id`/`stripe_subscription_id` が含まれていないことを確認する。

- [ ] **Step 3: コミット**

```bash
git add "グルメHP作成アプリ/js/supabase-client.js"
git commit -m "fix: 公開サイト取得APIが課金カラムを返さないようにする"
```

---

### Task 3: 旧generated_sitesの認証必須化とStorage制限

**背景:** `supabase/schema.sql:65-93` の `generated_sites` テーブルは旧プロトタイプ `WEB制作担当/成果物/HP生成アプリ/index.html` 専用で、現行の `グルメHP作成アプリ/` には引き継がれていない。RLSポリシー `public insert/read generated_sites` は誰でも読み書き可能なまま残っている。また `storage.objects` には旧 `public insert site-images`（`schema.sql:108-111`）と新 `owner upload own images`（`schema_app.sql:71-75`）が両方存在し、OR評価されるため旧ポリシーが新ポリシーの制限を無効化している（誰でも `site-images` バケットにアップロード可能な状態）。`site-images` バケットには `allowed_mime_types` / `file_size_limit` の設定もない。

**Files:**
- Create: `supabase/migrations/2026-06-20_02_close_legacy_and_storage_limits.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- ============================================================
-- 旧 generated_sites を認証必須に変更し、
-- site-images バケットの旧公開アップロードポリシーを削除、
-- MIME/サイズ制限を設定する
-- ============================================================

-- generated_sites: 誰でも読み書き可能だった旧ポリシーを認証済みユーザーのみに変更
DROP POLICY IF EXISTS "public insert generated_sites" ON generated_sites;
DROP POLICY IF EXISTS "public read generated_sites" ON generated_sites;

CREATE POLICY "authenticated insert generated_sites" ON generated_sites
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated read generated_sites" ON generated_sites
  FOR SELECT TO authenticated USING (true);

-- site-images: 誰でもアップロード可能だった旧ポリシーを削除
-- （owner upload own images など新ポリシーのみ残す。閲覧は引き続き公開）
DROP POLICY IF EXISTS "public insert site-images" ON storage.objects;

-- 画像以外・5MB超のアップロードを拒否
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    file_size_limit = 5242880
WHERE id = 'site-images';
```

- [ ] **Step 2: ユーザーに適用確認を取り、`mcp__supabase__apply_migration` で本番に適用**

migration name: `close_legacy_generated_sites_and_storage_limits`

- [ ] **Step 3: 影響確認**

`mcp__supabase__execute_sql` で以下を実行し、期待通りのポリシー構成になっていることを確認：

```sql
SELECT polname, polcmd, polroles::regrole[] FROM pg_policy
WHERE polrelid = 'generated_sites'::regclass
   OR polrelid = 'storage.objects'::regclass;

SELECT id, allowed_mime_types, file_size_limit FROM storage.buckets WHERE id = 'site-images';
```

Expected: `generated_sites` に `public` 系ポリシーが存在せず `authenticated` 系のみ。`storage.objects` に `public insert site-images` が存在しない。`site-images` の `allowed_mime_types` が画像4種、`file_size_limit` が `5242880`。

- [ ] **Step 4: 旧プロトタイプが動作しなくなることを確認**

`WEB制作担当/成果物/HP生成アプリ/index.html` は匿名で `generated_sites` にINSERTしていたため、このマイグレーション後は動作しなくなる（意図した挙動）。グルメHP作成アプリ（`sites` テーブル使用）には影響しないことをブラウザで確認する。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/2026-06-20_02_close_legacy_and_storage_limits.sql
git commit -m "fix: 旧generated_sitesを認証必須化、site-imagesのMIME/サイズ制限を追加"
```

---

### Task 4: 予約フォームへのCloudflare Turnstile・ハニーポット・必須項目検証の追加

**背景:** `WEB制作担当/成果物/サンプル/ビストロ用/index.html:560-567` の予約フォームと `netlify/functions/send-line.js` にはBot対策が一切ない。Netlify Functions自体にも他のサンプル（カフェ用・居酒屋用・高級店用・定食屋用）には予約通知APIが実装されていないため、対象はビストロ用のみ。

**Files:**
- Modify: `WEB制作担当/成果物/サンプル/ビストロ用/index.html`
- Modify: `WEB制作担当/成果物/サンプル/ビストロ用/netlify/functions/send-line.js`

**Interfaces:**
- Consumes: なし
- Produces: `send-line.js` の `exports.handler` は、Turnstileトークン未検証・ハニーポット入力・必須項目欠落の場合に `400` を返す（Task 5でこのファイルにレート制限とLINE宛先変更を追加する）

- [ ] **Step 1: `<head>` にTurnstileスクリプトを追加**

`WEB制作担当/成果物/サンプル/ビストロ用/index.html` の `</head>` 直前に追加：

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

- [ ] **Step 2: フォームにTurnstileウィジェットとハニーポット欄を追加**

`WEB制作担当/成果物/サンプル/ビストロ用/index.html:560-567` を以下に置き換える：

```html
  <form class="res-form reveal" id="reservation-form" name="reservation" method="POST" data-netlify="true">
    <input type="hidden" name="form-name" value="reservation">
    <input type="text" id="res-name" name="name" placeholder="お名前" required>
    <input type="tel" id="res-tel" name="tel" placeholder="電話番号" required>
    <input type="date" id="res-date" name="date" required>
    <select id="res-time" name="time" required></select>
    <select id="res-pax" name="pax" required></select>
    <input type="text" name="website" id="hp-field" autocomplete="off" tabindex="-1" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true">
    <div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY"></div>
    <button class="res-submit" type="submit">予約する</button>
  </form>
```

`data-sitekey` の値は、Cloudflareダッシュボード（Turnstile）でこのドメイン用のウィジェットを作成して得られる Site Key にユーザーが置き換える。Site Key は公開情報のためHTMLへのハードコードで問題ない。

- [ ] **Step 3: `send-line.js` にTurnstile検証・ハニーポット・必須項目検証を追加**

`WEB制作担当/成果物/サンプル/ビストロ用/netlify/functions/send-line.js` の先頭〜LINE通知部分を以下に置き換える（メール通知部分はTask 5で `escapeHtml` 込みでそのまま残す）：

```js
// 予約フォーム送信時にLINE公式アカウントへの通知と、
// 担当者宛のHTMLメール通知を送る。
//
// 必要な環境変数:
//   LINE_CHANNEL_ACCESS_TOKEN : LINE Developersで発行したチャネルアクセストークン
//   LINE_ADMIN_USER_ID        : 通知を受け取る管理者のLINE userId
//   RESEND_API_KEY            : Resend (https://resend.com) のAPIキー
//   NOTIFY_EMAIL              : 通知を受け取るメールアドレス
//   TURNSTILE_SECRET_KEY      : Cloudflare Turnstileのシークレットキー
const REQUIRED_FIELDS = ['name', 'tel', 'date', 'time', 'pax'];

async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // 未設定環境（ローカル検証等）はスキップ
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: remoteIp }),
  });
  const result = await res.json();
  return result.success === true;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ハニーポット: 人間には見えない欄が埋まっていたら静かに拒否
  if (data.website) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // 必須項目検証
  const { name, tel, date, time, pax } = data;
  const missing = REQUIRED_FIELDS.filter((field) => !String(data[field] ?? '').trim());
  if (missing.length > 0) {
    return { statusCode: 400, body: `必須項目が未入力です: ${missing.join(', ')}` };
  }

  const remoteIp = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'];

  const turnstileOk = await verifyTurnstile(data['cf-turnstile-response'], remoteIp);
  if (!turnstileOk) {
    return { statusCode: 400, body: 'Bot確認に失敗しました' };
  }

  const results = {};
```

この後ろに既存の「LINE通知」「メール通知」「return { statusCode: 200, ... }」「escapeHtml」をそのまま続ける（Task 5でLINE送信部分のみ書き換える）。

- [ ] **Step 4: ブラウザでフォーム送信を目視確認**

ローカルまたはNetlify Deploy Previewでビストロ用ページを開き、(a) Turnstileウィジェットが表示される、(b) 通常入力で送信が成功する、(c) `name`等を空にすると `required` 属性によりブラウザ側で送信がブロックされる、ことを確認する。

- [ ] **Step 5: コミット**

```bash
git add "WEB制作担当/成果物/サンプル/ビストロ用/index.html" "WEB制作担当/成果物/サンプル/ビストロ用/netlify/functions/send-line.js"
git commit -m "feat: 予約フォームにTurnstile・ハニーポット・必須項目検証を追加"
```

---

### Task 5: LINE通知を管理者宛pushに変更し、簡易レート制限を追加

**背景:** `netlify/functions/send-line.js:34-41` は `https://api.line.me/v2/bot/message/broadcast` で全登録ユーザーに送信しており、予約通知の用途には不適切（友だち全員に他人の予約情報相当の通知が届くリスク・コスト）。管理者1名宛の `push` API に変更する。Netlify Functionsはステートレスだが、同一インスタンスがウォームな間はグローバル変数が保持されるため、ベストエフォートの簡易レート制限として利用する。

**Files:**
- Modify: `WEB制作担当/成果物/サンプル/ビストロ用/netlify/functions/send-line.js`

**Interfaces:**
- Consumes: Task 4で追加した `verifyTurnstile`, `REQUIRED_FIELDS` はそのまま使う
- Produces: 同一IPからのリクエストを10秒以内に2回送ると `429` を返す

- [ ] **Step 1: レート制限用のin-memory Mapと判定関数を追加**

Task 4のコード冒頭（`const REQUIRED_FIELDS = [...]` の直後）に追加：

```js
const RATE_LIMIT_WINDOW_MS = 10_000;
const lastRequestByIp = new Map();

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const last = lastRequestByIp.get(ip);
  lastRequestByIp.set(ip, now);
  return typeof last === 'number' && now - last < RATE_LIMIT_WINDOW_MS;
}
```

- [ ] **Step 2: ハンドラ内でレート制限チェックを追加**

`remoteIp` を取得した直後（Turnstile検証の前）に追加：

```js
  if (isRateLimited(remoteIp)) {
    return { statusCode: 429, body: '送信間隔が短すぎます。少し待ってから再度お試しください。' };
  }
```

- [ ] **Step 3: LINE通知をbroadcastから管理者宛pushに変更**

既存の「LINE通知」ブロックを以下に置き換える：

```js
  // LINE通知（管理者宛のみ。broadcastは使わない）
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineAdminUserId = process.env.LINE_ADMIN_USER_ID;
  if (lineToken && lineAdminUserId) {
    const message =
      '【Bistrot MIIINA】新しいご予約\n' +
      `お名前: ${name || '-'}\n` +
      `電話番号: ${tel || '-'}\n` +
      `日付: ${date || '-'}\n` +
      `時間: ${time || '-'}\n` +
      `人数: ${pax ? pax + '名' : '-'}`;

    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({ to: lineAdminUserId, messages: [{ type: 'text', text: message }] }),
    });
    results.line = lineRes.ok ? 'ok' : await lineRes.text();
  }
```

- [ ] **Step 4: 環境変数の更新が必要であることをユーザーに連絡**

Netlify側の環境変数に `LINE_ADMIN_USER_ID`（管理者個人またはLINE公式アカウントの管理者として登録したuserId）と `TURNSTILE_SECRET_KEY` を追加する必要がある旨を伝える。`LINE_ADMIN_USER_ID` はLINE Developersコンソールの「あなたのユーザーID」、または管理者がBotに一度メッセージを送りWebhookログから取得する方法がある。

- [ ] **Step 5: 動作確認**

10秒以内に2回連続でフォーム送信し、2回目が「送信間隔が短すぎます」エラーになることをブラウザで確認する。

- [ ] **Step 6: コミット**

```bash
git add "WEB制作担当/成果物/サンプル/ビストロ用/netlify/functions/send-line.js"
git commit -m "fix: LINE通知をbroadcastから管理者宛pushに変更し簡易レート制限を追加"
```

---

### Task 6: 公開HPテンプレートのURLサニタイズ（XSS対策）

**背景:** `グルメHP作成アプリ/js/template-renderer.js` の `esc()`（14-21行）は文字列をHTMLエンティティ化するのみで、URLスキームを検証しない。`data.sns_instagram`（170行目）・`data.hero_image`（127-129行目）・`data.gallery_images`（46行目）はオーナーが編集画面から入力する値が `href`/`src`/`background-image:url(...)` にそのまま埋め込まれており、`javascript:alert(1)` のようなスキームを入力されると公開ページ閲覧者のブラウザで実行される。

**Files:**
- Modify: `グルメHP作成アプリ/js/template-renderer.js`
- Test: `グルメHP作成アプリ/js/template-renderer.test.js`（新規、`node:test`使用）

**Interfaces:**
- Produces: `safeUrl(value)` — `http://` または `https://` で始まる文字列のみそのまま返し、それ以外（`javascript:`, `data:`, 相対パス, 空文字等）は `''` を返す

- [ ] **Step 1: 失敗するテストを書く**

`グルメHP作成アプリ/js/template-renderer.test.js` を新規作成：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl } from './template-renderer.js';

test('https URLはそのまま返す', () => {
  assert.equal(safeUrl('https://instagram.com/example'), 'https://instagram.com/example');
});

test('http URLはそのまま返す', () => {
  assert.equal(safeUrl('http://example.com'), 'http://example.com');
});

test('javascript: スキームは空文字になる', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
});

test('data: スキームは空文字になる', () => {
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
});

test('空・未定義は空文字になる', () => {
  assert.equal(safeUrl(''), '');
  assert.equal(safeUrl(undefined), '');
});

test('前後の空白を許容してhttpsと判定する', () => {
  assert.equal(safeUrl('  https://instagram.com/example  '), 'https://instagram.com/example');
});
```

- [ ] **Step 2: テストを実行し、失敗を確認**

Run: `node --test "グルメHP作成アプリ/js/template-renderer.test.js"`
Expected: `safeUrl is not a function` 等のエラーでFAIL（`template-renderer.js` がまだ `safeUrl` をexportしていないため）

- [ ] **Step 3: `safeUrl` を実装し、3箇所に適用**

`グルメHP作成アプリ/js/template-renderer.js:14-21` の `esc` 関数の直後に追加：

```js
export function safeUrl(value) {
  const v = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(v)) return '';
  return v;
}
```

170行目（footer内 Instagram リンク）を変更：

```js
  ${data.sns_instagram ? `<p style="margin-top:.5rem"><a href="${esc(safeUrl(data.sns_instagram))}" target="_blank" rel="noopener" style="color:var(--accent)">Instagram</a></p>` : ''}
```

127-129行目（hero画像）を変更：

```js
  const heroStyle = data.hero_image
    ? ` style="background-image:url('${esc(safeUrl(data.hero_image))}')"`
    : '';
```

46行目（`renderGallery` 内）を変更：

```js
function renderGallery(images = []) {
  const valid = images.filter(Boolean);
  if (!valid.length) return '';
  const imgs = valid.map(url => `<img src="${esc(safeUrl(url))}" alt="店内・料理写真" loading="lazy">`).join('');
  return `
  <section class="site-section" id="gallery">
    <span class="site-section-label">GALLERY</span>
    <h2 class="site-section-title">ギャラリー</h2>
    <div class="site-gallery">${imgs}</div>
  </section>`;
}
```

- [ ] **Step 4: テストを再実行し、成功を確認**

Run: `node --test "グルメHP作成アプリ/js/template-renderer.test.js"`
Expected: 全7テストPASS

- [ ] **Step 5: 既存の正常系（Supabase Storageの画像URL）が壊れていないことを確認**

`グルメHP作成アプリ/js/supabase-client.js` の `uploadSiteImage` が返すURLは `https://<project>.supabase.co/storage/v1/object/public/site-images/...` 形式（`https://`始まり）であるため `safeUrl` を通っても変化しないことをコードレビューで確認し、ブラウザで既存サンプルサイトの画像が表示されることを目視確認する。

- [ ] **Step 6: コミット**

```bash
git add "グルメHP作成アプリ/js/template-renderer.js" "グルメHP作成アプリ/js/template-renderer.test.js"
git commit -m "fix: 公開HPテンプレートのURLをスキーム検証してjavascript:注入を防ぐ"
```

---

### Task 7: Gemini APIキーをsessionStorageに変更

**背景:** `グルメHP作成アプリ/editor.html:549` は `localStorage.setItem('gemini_api_key', apiKey)` でAPIキーを永続保存しており、同一ブラウザでXSSが発生した場合や共有PCでの利用時に長期間にわたり盗用可能な状態。`sessionStorage` に変更することでタブを閉じると消える状態にする（サーバー側プロキシ化は別途の大きな変更のため今回は対象外）。

**Files:**
- Modify: `グルメHP作成アプリ/editor.html:533`
- Modify: `グルメHP作成アプリ/editor.html:549`

- [ ] **Step 1: 読み込み箇所を変更**

`グルメHP作成アプリ/editor.html:533`

```js
    keyInput.value = localStorage.getItem('gemini_api_key') || '';
```

を以下に変更：

```js
    keyInput.value = sessionStorage.getItem('gemini_api_key') || '';
```

- [ ] **Step 2: 保存箇所を変更**

`グルメHP作成アプリ/editor.html:549`

```js
    localStorage.setItem('gemini_api_key', apiKey);
```

を以下に変更：

```js
    sessionStorage.setItem('gemini_api_key', apiKey);
```

- [ ] **Step 3: 既存ユーザーのlocalStorageに残った古いキーを削除するクリーンアップを追加**

`グルメHP作成アプリ/editor.html:533` の直前に追加（移行後も `localStorage` に残ったキーを一度だけ消す）：

```js
    localStorage.removeItem('gemini_api_key');
```

- [ ] **Step 4: ブラウザで動作確認**

editor.htmlでAPIキーを入力・保存し、DevTools Applicationタブで `sessionStorage` にのみ `gemini_api_key` が存在し `localStorage` には存在しないことを確認。タブを閉じて再度開くとキー入力欄が空になることを確認する。

- [ ] **Step 5: コミット**

```bash
git add "グルメHP作成アプリ/editor.html"
git commit -m "fix: Gemini APIキーの保存先をlocalStorageからsessionStorageに変更"
```

---

### Task 8: MCP gemini-imageのPath Traversal対策と依存バージョン固定

**背景:** `mcp-gemini-image/index.js:46-48` は `filename` パラメータをそのまま `path.join(outputDir, name)` に渡しており、`filename: "../../../etc/passwd"` のような値で `OUTPUT_DIR` 外への書き込みが可能（Path Traversal）。また `.mcp.json:22` の `@supabase/mcp-server-supabase@latest` はバージョン固定がなく、再現性・サプライチェーンの観点で問題がある（現在の最新は `0.8.2`）。

**Files:**
- Modify: `mcp-gemini-image/index.js`
- Test: `mcp-gemini-image/filename.test.js`（新規、`node:test`使用）
- Modify: `.mcp.json:22`

**Interfaces:**
- Produces: `sanitizeFilename(filename, outputDir)` — 安全なファイル名なら `outputDir` 内の絶対パスを返し、不正なら `null` を返す

- [ ] **Step 1: 失敗するテストを書く**

`mcp-gemini-image/filename.test.js` を新規作成：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { sanitizeFilename } from './index.js';

const outputDir = path.resolve('generated-images');

test('正常なファイル名は outputDir 内の絶対パスを返す', () => {
  const result = sanitizeFilename('cafe_hero.png', outputDir);
  assert.equal(result, path.join(outputDir, 'cafe_hero.png'));
});

test('Path Traversalを含むファイル名は null を返す', () => {
  assert.equal(sanitizeFilename('../../../etc/passwd', outputDir), null);
});

test('スラッシュを含むファイル名は basename のみ使われる', () => {
  const result = sanitizeFilename('sub/dir/image.png', outputDir);
  assert.equal(result, path.join(outputDir, 'image.png'));
});

test('許可文字以外を含むファイル名は null を返す', () => {
  assert.equal(sanitizeFilename('image;rm -rf.png', outputDir), null);
  assert.equal(sanitizeFilename('<script>.png', outputDir), null);
});

test('空文字・未指定は null を返す', () => {
  assert.equal(sanitizeFilename('', outputDir), null);
  assert.equal(sanitizeFilename(undefined, outputDir), null);
});
```

- [ ] **Step 2: テストを実行し、失敗を確認**

Run: `node --test mcp-gemini-image/filename.test.js`
Expected: `sanitizeFilename is not a function` 等でFAIL（`index.js` がまだexportしていないため）

- [ ] **Step 3: `sanitizeFilename` を実装し、exportする**

`mcp-gemini-image/index.js:1-19` を以下に変更（`export function` を追加し、サーバー起動部分は実行時にのみ動かないとテストで `process.exit` 等が走らないよう注意。`apiKey` チェックは現状通り起動時に行われるため、テスト実行時に `GEMINI_API_KEY` が未設定だとテストごと失敗する。`sanitizeFilename` をAPIキー検証より前に定義してテスト用にexportする）：

```js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function sanitizeFilename(filename, outputDir) {
  const base = path.basename(String(filename ?? ""));
  if (!base || !/^[a-zA-Z0-9._-]+$/.test(base)) {
    return null;
  }
  const resolvedOutputDir = path.resolve(outputDir);
  const filePath = path.resolve(path.join(resolvedOutputDir, base));
  if (filePath !== resolvedOutputDir && !filePath.startsWith(resolvedOutputDir + path.sep)) {
    return null;
  }
  return filePath;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY が設定されていません");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  const outputDir = path.join(process.env.OUTPUT_DIR || "generated-images");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const server = new McpServer({
    name: "gemini-image",
    version: "1.0.0",
  });

  server.tool(
    "generate_image",
    "Gemini Imagen を使って画像を生成します",
    {
      prompt: z.string().describe("画像生成プロンプト（英語推奨）"),
      filename: z.string().optional().describe("保存ファイル名（省略時は自動生成）"),
    },
    async ({ prompt, filename }) => {
      try {
        const response = await ai.models.generateImages({
          model: "imagen-4.0-generate-001",
          prompt,
          config: { numberOfImages: 1 },
        });

        const imageData = response.generatedImages?.[0]?.image?.imageBytes;
        if (!imageData) {
          return { content: [{ type: "text", text: "画像生成に失敗しました" }] };
        }

        const defaultName = `image_${Date.now()}.png`;
        const filePath = filename
          ? sanitizeFilename(filename, outputDir)
          : sanitizeFilename(defaultName, outputDir);
        if (!filePath) {
          return { content: [{ type: "text", text: "不正なファイル名です" }] };
        }
        fs.writeFileSync(filePath, Buffer.from(imageData, "base64"));

        return {
          content: [
            {
              type: "text",
              text: `画像を生成しました: ${filePath}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `エラー: ${err.message}` }],
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: テストを再実行し、成功を確認**

Run: `node --test mcp-gemini-image/filename.test.js`
Expected: 全6テストPASS

- [ ] **Step 5: MCPサーバーが通常起動することを確認**

Run: `GEMINI_API_KEY=dummy node mcp-gemini-image/index.js` をフォアグラウンドで数秒起動し、`GEMINI_API_KEY が設定されていません` エラーが出ないこと（stdioサーバーとして待機状態になること）を確認後 Ctrl+C で終了する。

- [ ] **Step 6: `.mcp.json` の `@supabase/mcp-server-supabase` をバージョン固定**

`.mcp.json:22` を変更：

```json
        "args": ["-y", "@supabase/mcp-server-supabase@latest", "--access-token", "${SUPABASE_ACCESS_TOKEN}"]
```

を

```json
        "args": ["-y", "@supabase/mcp-server-supabase@0.8.2", "--access-token", "${SUPABASE_ACCESS_TOKEN}"]
```

に変更。

- [ ] **Step 7: コミット**

```bash
git add mcp-gemini-image/index.js mcp-gemini-image/filename.test.js .mcp.json
git commit -m "fix: MCP gemini-imageのPath Traversalを修正し、supabase MCPのバージョンを固定"
```

---

## 完了確認チェックリスト

- [ ] Task 1: `sites` の課金カラムがservice_role以外から変更不可
- [ ] Task 2: `getPublishedSiteBySlug` が課金カラムを返さない
- [ ] Task 3: `generated_sites` が認証必須、`site-images` にMIME/サイズ制限
- [ ] Task 4: 予約フォームにTurnstile・ハニーポット・必須項目検証
- [ ] Task 5: LINE通知が管理者宛push、簡易レート制限あり
- [ ] Task 6: `safeUrl` でjavascript:注入を防止
- [ ] Task 7: Gemini APIキーがsessionStorage
- [ ] Task 8: MCP filenameのPath Traversal対策、`.mcp.json`バージョン固定

## ユーザー対応が必要な外部設定（実装完了後）

- Cloudflare TurnstileでこのドメインのWidgetを作成し、Site Keyを `WEB制作担当/成果物/サンプル/ビストロ用/index.html` の `data-sitekey` に設定
- Netlify環境変数に `TURNSTILE_SECRET_KEY` を追加
- Netlify環境変数の `LINE_ADMIN_USER_ID`（管理者のLINE userId）を追加
