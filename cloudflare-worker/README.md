# cloudflare-worker

`*.miiinagurume.com`（店舗ごとのサブドメイン）宛のリクエストを受け取り、Hostヘッダーから店舗slugを抽出して、Netlify上の `site.html?slug=<slug>` へ透過的にプロキシするCloudflare Workerです。

設計の背景は `データ連携担当/参考資料/2026-06-20-cloudflare-routing-plan.md` を参照してください。

## 現在のステータス

**コードのみ実装済み。実際のCloudflareアカウントへのデプロイ・ドメイン購入は未実施です。**

- ドメイン購入は実費が発生するため、デプロイ前に**CEO承認が必要**です。
- 本ディレクトリのコード（`src/worker.js`, `src/slug.js`）はローカルでテスト・`wrangler dev`での動作確認が可能ですが、本番ルーティングとして機能させるには下記「デプロイ手順」をすべて実施する必要があります。

## ディレクトリ構成

```
cloudflare-worker/
├── package.json
├── wrangler.toml          # Worker設定（account_id・NETLIFY_ORIGINはプレースホルダ）
├── src/
│   ├── slug.js            # Hostヘッダーからslugを抽出する純粋関数
│   ├── slug.test.js        # slug.jsのユニットテスト（Vitest）
│   └── worker.js           # fetchハンドラ（Netlifyへのリバースプロキシ本体）
└── README.md
```

## ローカルでのテスト

```bash
cd cloudflare-worker
npm install
npm test        # slug抽出ロジックのユニットテスト
```

## デプロイ前に必要な準備（実費・CEO承認が必要な手順を含む）

1. **ドメイン購入（実費発生・CEO承認必須）**
   - `miiinagurume.com` をまだ取得していない場合、Cloudflare RegistrarまたはGoogle Domains等で購入する。
   - 既に他社で取得済みの場合は、Cloudflareへの移管は不要（ネームサーバー変更のみで対応可能）。

2. **グルメHP作成アプリをNetlifyにデプロイ**
   - Netlify管理画面で `グルメHP作成アプリ/` をBase directory・Publish directoryとして新規サイトを作成する。
   - デプロイ完了後のNetlifyサイトURL（例: `https://miiinagurume-app.netlify.app`）を確認する。

3. **Cloudflareにドメインを追加してDNSを設定**
   - Cloudflareダッシュボードで「Add a site」から `miiinagurume.com` を追加し、ネームサーバーをレジストラ側に設定する。
   - DNSレコードを追加する:
     | Type | Name | Target | Proxy status |
     |------|------|--------|--------------|
     | CNAME | `app` | `<Netlifyサイト名>.netlify.app` | DNS only（管理画面はWorkerを経由しない） |
     | A | `*` | `192.0.2.1`（ダミーIP） | Proxied（Workerが横取りするため実際には到達しない） |

4. **`wrangler.toml` のプレースホルダを実際の値に置き換える**
   - `account_id`: Cloudflareダッシュボード右サイドバーで確認できるAccount ID
   - `NETLIFY_ORIGIN`: 手順2で確認した実際のNetlifyサイトURL

5. **Cloudflareへログインしてデプロイ**
   ```bash
   cd cloudflare-worker
   npx wrangler login
   npx wrangler deploy
   ```

6. **動作確認**
   - `https://<実在の店舗slug>.miiinagurume.com` を開き、該当店舗のHPが表示されることを確認する。
   - `https://app.miiinagurume.com` を開き、管理画面（ログイン画面）が表示されることを確認する（Workerを経由せず直接Netlifyから配信される）。
   - 存在しない・未公開のslugのサブドメインでは、Netlify側の `site.html` が表示する「このページは現在公開されていません」のメッセージが表示されることを確認する。

## 既知の制約・スコープ外事項

- 本Workerは `slug` の実在確認を行わない。HostヘッダーからのSlug抽出（文字列処理）のみを担当し、実際にその店舗が存在するか・公開済みかの判定はNetlify/Supabase側（`site.html` → `getPublishedSiteBySlug`）の責務とする。
- 独自ドメインのBYO（店主が自分の既存ドメインを持ち込む機能）は本計画のスコープ外（`データ連携担当/参考資料/2026-06-20-cloudflare-routing-plan.md` 参照）。
