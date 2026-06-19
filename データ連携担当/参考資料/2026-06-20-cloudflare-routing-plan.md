# Cloudflareドメイン/ルーティング導入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `miiinagurume.com`をCloudflareで管理し、`app.miiinagurume.com`を管理画面（Netlify）に、`<店舗slug>.miiinagurume.com`をCloudflare Workerのリバースプロキシ経由で各店舗の公開HP（`site.html?slug=xxx`）に振り分けられるようにする。

**Architecture:** Cloudflare Workerが`*.miiinagurume.com`宛のリクエストを受け、Hostヘッダーから店舗slugを抜き出す純粋関数（テスト対象）と、それを使ってNetlifyのオリジンへ転送するfetchハンドラ（手動検証対象）に分離する。`app`サブドメインはWorkerを経由させず、DNSのみでNetlifyに直結する。

**Tech Stack:** Cloudflare Workers（`wrangler`）、Vitest（slug抽出ロジックのみユニットテスト）。ホスティング自体はNetlify（変更なし）。

## Global Constraints

- ドメイン名は`miiinagurume.com`を使用する。
- `app.miiinagurume.com`はWorkerを経由しない（DNS onlyのCNAMEで直接Netlifyに向ける）。`*.miiinagurume.com`（店舗公開HP）のみWorkerを経由する。
- 新規導入するテストフレームワークはVitestのみ。Workerのfetchハンドラ自体（Netlifyへの実際のHTTP転送）は自動テスト化せず、`wrangler dev`での手動確認とする。
- 現時点で「グルメHP作成アプリ」用のNetlifyサイトはまだ存在しない。本計画のTask 1で新規作成する。

---

### Task 1: グルメHP作成アプリをNetlifyにデプロイ

**Files:**
- なし（Netlify管理画面での手動セットアップのみ）

**Interfaces:**
- Produces: Netlifyサイトの公開URL（例: `https://<サイト名>.netlify.app`）。以降のタスクでWorkerのプロキシ先として使用する。

- [ ] **Step 1: Netlifyで新規サイトを作成**

手動作業（Netlify管理画面）:
1. https://app.netlify.com で「Add new site」→「Import an existing project」を選択
2. GitHubリポジトリ`shinyanakagawa/miiinagurume`を選択
3. 設定値:
   - Base directory: `グルメHP作成アプリ`
   - Build command: 空欄のまま（ビルド不要の静的サイト）
   - Publish directory: `グルメHP作成アプリ`
4. 「Deploy site」をクリック
5. デプロイ完了後、Site settings → Site detailsでサイト名を`miiinagurume-app`などの分かりやすい名前に変更する

- [ ] **Step 2: デプロイ確認とURLの記録**

Run: ブラウザで`https://<変更後のサイト名>.netlify.app/index.html`を開く
Expected: ログイン画面が表示される（Supabaseへの接続もそのまま動作する）

このURL（`https://<サイト名>.netlify.app`）を、以降のTask 4・Task 5で使用する。

---

### Task 2: Cloudflareでドメイン追加とDNS設定

**Files:**
- なし（Cloudflare管理画面での手動セットアップのみ）

**Interfaces:**
- Consumes: Task 1で確定したNetlifyサイトURL

- [ ] **Step 1: ドメインをCloudflareに追加**

手動作業（Cloudflare管理画面）:
1. `miiinagurume.com`が未取得の場合、Cloudflare Registrarで購入する
2. Cloudflareダッシュボードで「Add a site」から`miiinagurume.com`を追加し、表示されるネームサーバーをドメインのレジストラ側に設定する（Cloudflare Registrarで購入した場合はこの手順は不要）

- [ ] **Step 2: appサブドメイン用CNAMEを追加**

Cloudflare DNS設定で以下のレコードを追加する:

| Type | Name | Target | Proxy status |
|------|------|--------|--------------|
| CNAME | `app` | `<Task 1のNetlifyサイト名>.netlify.app` | DNS only（グレークラウド） |

`app.miiinagurume.com`はWorkerを経由させず直接Netlifyに向けるため、Proxy statusは必ず「DNS only」にする。

- [ ] **Step 3: ワイルドカードサブドメイン用レコードを追加**

Cloudflare DNS設定で以下のレコードを追加する:

| Type | Name | Target | Proxy status |
|------|------|--------|--------------|
| A | `*` | `192.0.2.1` | Proxied（オレンジクラウド） |

`192.0.2.1`はダミーIP（RFC 5737のドキュメント用アドレス）。実際の通信はTask 5で設定するWorker Routeが横取りするため、このIPには到達しない。Proxy statusは必ず「Proxied」にする（Workerが介在するために必須）。

- [ ] **Step 4: DNS反映確認**

Run: `nslookup app.miiinagurume.com`
Expected: Netlify側のIPまたはCNAME chainが返る（DNS反映には最大24時間かかる場合がある）

---

### Task 3: slug抽出ロジック（純粋関数）とテスト

**Files:**
- Create: `cloudflare-worker/package.json`
- Create: `cloudflare-worker/src/slug.js`
- Test: `cloudflare-worker/src/slug.test.js`

**Interfaces:**
- Produces: `extractSlugFromHost(hostname, rootDomain)` → `string | null`（マッチする店舗slugがあれば返す。ルートドメイン自体や`app`サブドメイン、複数階層のサブドメインの場合は`null`）

- [ ] **Step 1: package.jsonを作成**

`cloudflare-worker/package.json`:

```json
{
  "name": "miiinagurume-site-router",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.8",
    "wrangler": "^3.90.0"
  }
}
```

- [ ] **Step 2: 依存をインストール**

Run: `cd cloudflare-worker && npm install`
Expected: `node_modules/`が作成され、`vitest`と`wrangler`がインストールされる

- [ ] **Step 3: 失敗するテストを書く**

`cloudflare-worker/src/slug.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extractSlugFromHost } from './slug.js';

const ROOT = 'miiinagurume.com';

describe('extractSlugFromHost', () => {
  it('店舗サブドメインからslugを抽出する', () => {
    expect(extractSlugFromHost('bistro-miina.miiinagurume.com', ROOT)).toBe('bistro-miina');
  });

  it('ルートドメイン自体はnullを返す', () => {
    expect(extractSlugFromHost('miiinagurume.com', ROOT)).toBeNull();
  });

  it('appサブドメインはnullを返す', () => {
    expect(extractSlugFromHost('app.miiinagurume.com', ROOT)).toBeNull();
  });

  it('別ドメインはnullを返す', () => {
    expect(extractSlugFromHost('example.com', ROOT)).toBeNull();
  });

  it('複数階層のサブドメインはnullを返す', () => {
    expect(extractSlugFromHost('foo.bar.miiinagurume.com', ROOT)).toBeNull();
  });
});
```

- [ ] **Step 4: テストを実行して失敗を確認**

Run: `cd cloudflare-worker && npm test`
Expected: FAIL（`slug.js`が存在しないためimportエラー）

- [ ] **Step 5: 実装を書く**

`cloudflare-worker/src/slug.js`:

```js
const RESERVED_SUBDOMAINS = new Set(['app']);

export function extractSlugFromHost(hostname, rootDomain) {
  if (hostname === rootDomain) return null;
  if (!hostname.endsWith(`.${rootDomain}`)) return null;

  const sub = hostname.slice(0, hostname.length - rootDomain.length - 1);
  if (sub.includes('.')) return null;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;

  return sub;
}
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `cd cloudflare-worker && npm test`
Expected: PASS（5件すべて成功）

- [ ] **Step 7: .gitignoreを作成**

`cloudflare-worker/.gitignore`:

```
node_modules/
.wrangler/
```

- [ ] **Step 8: コミット**

```bash
git add "cloudflare-worker/package.json" "cloudflare-worker/.gitignore" "cloudflare-worker/src/slug.js" "cloudflare-worker/src/slug.test.js"
git commit -m "feat: Cloudflare Worker用のslug抽出ロジックとテストを追加"
```

---

### Task 4: fetchハンドラ（Netlifyへのリバースプロキシ）

**Files:**
- Create: `cloudflare-worker/src/index.js`
- Create: `cloudflare-worker/wrangler.toml`

**Interfaces:**
- Consumes: `extractSlugFromHost`（Task 3の`slug.js`）

- [ ] **Step 1: wrangler.tomlを作成**

`cloudflare-worker/wrangler.toml`の`NETLIFY_ORIGIN`は、Task 1で確認した実際のNetlifyサイトURLに書き換えること。

```toml
name = "miiinagurume-site-router"
main = "src/index.js"
compatibility_date = "2026-06-20"

[vars]
ROOT_DOMAIN = "miiinagurume.com"
NETLIFY_ORIGIN = "https://REPLACE_WITH_YOUR_NETLIFY_SITE.netlify.app"
```

- [ ] **Step 2: fetchハンドラを実装**

`cloudflare-worker/src/index.js`:

```js
import { extractSlugFromHost } from './slug.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = extractSlugFromHost(url.hostname, env.ROOT_DOMAIN);

    if (!slug) {
      return new Response('Not Found', { status: 404 });
    }

    const targetUrl = `${env.NETLIFY_ORIGIN}/site.html?slug=${encodeURIComponent(slug)}`;
    const originResponse = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
    });

    return new Response(originResponse.body, originResponse);
  },
};
```

- [ ] **Step 3: ローカルで動作確認**

Run: `cd cloudflare-worker && npx wrangler dev`
Run（別ターミナルから）: `curl -H "Host: <Task1で作成した実在のslug>.miiinagurume.com" http://localhost:8787/`
Expected: Netlify上の`site.html`が返すHTML（該当slugの店舗ページ、または存在しないslugなら「このページは現在公開されていません」のメッセージ）が返る

- [ ] **Step 4: コミット**

```bash
git add "cloudflare-worker/src/index.js" "cloudflare-worker/wrangler.toml"
git commit -m "feat: Cloudflare Workerのリバースプロキシ実装を追加"
```

---

### Task 5: Worker Routeの設定とデプロイ

**Files:**
- Modify: `cloudflare-worker/wrangler.toml`

**Interfaces:**
- Consumes: Task 4の`index.js`、Task 2で設定したワイルドカードDNSレコード

- [ ] **Step 1: wrangler.tomlにroutesを追加**

`cloudflare-worker/wrangler.toml`に以下を追記する:

```toml
[[routes]]
pattern = "*.miiinagurume.com/*"
zone_name = "miiinagurume.com"
```

- [ ] **Step 2: Cloudflareへログイン**

Run: `cd cloudflare-worker && npx wrangler login`
Expected: ブラウザが開き、Cloudflareアカウントでの認証が完了する

- [ ] **Step 3: デプロイ**

Run: `cd cloudflare-worker && npx wrangler deploy`
Expected: デプロイ成功メッセージとWorker名が表示される

- [ ] **Step 4: 本番動作確認**

Run: ブラウザで`https://<Task1で作成した実在のslug>.miiinagurume.com`を開く
Expected: 該当店舗のHPが表示される。`https://app.miiinagurume.com`を開くと管理画面（ログイン画面）が表示される（Workerを経由せず直接Netlifyから配信される）

- [ ] **Step 5: コミット**

```bash
git add "cloudflare-worker/wrangler.toml"
git commit -m "feat: Cloudflare Worker Routeをワイルドカードサブドメインに設定"
```

---

## 完了条件

- `npm test`（`cloudflare-worker/`配下）が全件PASSする
- `https://app.miiinagurume.com`で管理画面（Netlify）が表示される
- `https://<実在の店舗slug>.miiinagurume.com`で該当店舗の公開HPが表示される
- `https://miiinagurume.com`（ルートドメイン自体）や、サブドメインなしのアクセスではWorkerが404を返す
- DBに存在しない店舗slugのサブドメインでは、Netlify側の`site.html`が表示する「このページは現在公開されていません」のメッセージが表示される（Workerはホスト名のパターンチェックのみ行い、slugの実在確認はNetlify/Supabase側の責務）
