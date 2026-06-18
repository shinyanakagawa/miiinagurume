# グルメHP作成アプリ

飲食店オーナーがテンプレートを選び、フォーム入力と写真アップロードだけで
自分の公式HPを作成・公開できるアプリです。月額課金（Stripe）で公開を維持します。

## 構成

```
グルメHP作成アプリ/
├── index.html      … ログイン／新規登録
├── dashboard.html  … マイサイト一覧・新規作成
├── editor.html     … テンプレート編集（フォーム＋リアルタイムプレビュー）
├── site.html       … 公開ページ（?slug=xxx で表示）
├── css/
│   ├── app.css     … 管理画面UI
│   └── themes.css  … 公開HPのテーマ別デザイン（5テーマ）
└── js/
    ├── supabase-client.js   … 認証・DB・Storage操作
    └── template-renderer.js … テンプレートHTML生成

../supabase/
├── schema_app.sql                         … 追加DBスキーマ（要実行）
└── functions/
    ├── create-checkout-session/index.ts   … Stripe Checkout作成
    └── stripe-webhook/index.ts            … Stripeサブスク状態の同期
```

## セットアップ手順

1. **DBスキーマ適用**
   Supabaseの SQL Editor で `supabase/schema_app.sql` を実行する。
   （`sites` テーブル、Storageバケット `site-images`、RLSポリシーが作成されます）

2. **メール認証設定**
   Supabase Authでメール確認を有効にする場合、ダッシュボードのRedirect URLに
   このアプリのURLを追加する。

3. **Stripe設定**
   - Stripeダッシュボードで月額プランの Price を作成し、Price IDを控える
   - Supabase Edge Functionsに以下のSecretsを設定
     ```
     supabase secrets set STRIPE_SECRET_KEY=sk_xxx
     supabase secrets set STRIPE_PRICE_ID=price_xxx
     supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
     supabase secrets set APP_URL=https://your-domain.example/グルメHP作成アプリ
     ```
   - Edge Functionsをデプロイ
     ```
     supabase functions deploy create-checkout-session
     supabase functions deploy stripe-webhook
     ```
   - Stripeダッシュボードで Webhook エンドポイントを登録し、
     `checkout.session.completed` / `customer.subscription.updated` /
     `customer.subscription.deleted` を購読する

4. **動作確認**
   - `index.html` から新規登録 → ログイン
   - ダッシュボードでテンプレート（テーマ）を選んでHP作成
   - エディタで店舗情報・写真・メニューなどを入力（右側にリアルタイムプレビュー）
   - 「月額プランを契約する」からStripe決済 → 完了後 `subscription_status` が `active` に更新
   - 「公開する」を押すと `site.html?slug=作成時に指定したID` で一般公開される

## テンプレート（テーマ）

カフェ／ビストロ／居酒屋／定食屋／高級店の5種類のカラーテーマを用意しています。
共通のセクション構成（メニュー・特集・ギャラリー・口コミ・店舗情報）を
オーナー自身が入力するだけで、ジャンルに合わせた雰囲気のHPになります。
