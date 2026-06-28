-- ============================================================
-- グルメHP作成アプリ 追加スキーマ
-- 既存の schema.sql（チーム管理用）に追加で実行してください
-- ============================================================

-- 1. サイト（飲食店オーナーが作成するHPデータ）
CREATE TABLE sites (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  slug                    TEXT UNIQUE NOT NULL,
  theme                   TEXT NOT NULL DEFAULT 'cafe'
                            CHECK (theme IN ('cafe','bistro','izakaya','teishoku','kaiseki')),
  status                  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  data                    JSONB NOT NULL DEFAULT '{}',
  subscription_status     TEXT NOT NULL DEFAULT 'inactive'
                            CHECK (subscription_status IN ('inactive','active','past_due','canceled')),
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  -- 予約通知用の店舗連絡先（非公開カラム。公開クエリでは絶対にSELECTしないこと。
  -- 詳細は本ファイル下部「2026-06-28 予約フォーム通知先カラム追加」のコメントを参照）
  notify_email            TEXT,
  line_admin_user_id      TEXT,
  turnstile_site_key      TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX sites_user_id_idx ON sites(user_id);
CREATE INDEX sites_slug_idx ON sites(slug);

-- updated_at 自動更新
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
-- Row Level Security
-- ============================================================

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- オーナーは自分のサイトを全操作可能
CREATE POLICY "owner select own sites" ON sites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "owner insert own sites" ON sites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner update own sites" ON sites
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "owner delete own sites" ON sites
  FOR DELETE USING (auth.uid() = user_id);

-- 公開済み＋契約有効なサイトは誰でも閲覧可能（公開ページ表示用）
CREATE POLICY "public read published active sites" ON sites
  FOR SELECT USING (status = 'published' AND subscription_status = 'active');

-- ============================================================
-- Storage（写真アップロード用バケット）
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO NOTHING;

-- ユーザーは自分のフォルダ（user_id/...）にのみアップロード・更新・削除可能
CREATE POLICY "owner upload own images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'site-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "owner update own images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'site-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "owner delete own images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'site-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 画像は誰でも閲覧可能（公開HPに表示するため）
CREATE POLICY "public read images" ON storage.objects
  FOR SELECT USING (bucket_id = 'site-images');

-- ============================================================
-- 2026-06-28 予約フォーム通知先カラム追加（マイグレーション）
-- ------------------------------------------------------------
-- 既にSupabase上で sites テーブルを作成済みの環境向けに、
-- 上記 CREATE TABLE 文に統合済みの3カラムを ALTER TABLE で追加する。
-- 新規にスキーマを流し込む場合（CREATE TABLE から実行する場合）は
-- このセクションは不要（IF NOT EXISTS のため実行しても無害）。
--
-- 背景・セキュリティ方針:
--   notify_email / line_admin_user_id は店主個人の連絡先であり、
--   sites テーブルには「公開済み・契約有効なサイトは誰でもSELECT可能」
--   という行レベルのRLSポリシー（public read published active sites）が
--   既に存在する。RLSは行単位のフィルタであり列単位のアクセス制御は
--   行わないため、このポリシーが有効な限り notify_email 等の新規カラムも
--   理論上は同じSELECT権限の対象になる。
--   アプリケーション層（クライアントの select() 呼び出しで該当カラムを
--   含めない）を第一の防御としつつ、PostgRESTのanon keyは公開鍵であり
--   クライアントが任意のカラムを明示指定して直接APIを叩く経路を
--   完全には防げないため、2026-06-28にDB側でも列単位のREVOKEを
--   追加適用済み（下記）。これにより anon ロールはRLSの行条件を
--   満たしても notify_email / line_admin_user_id を取得できない。
--     - グルメHP作成アプリ/js/supabase-client.js の公開読み取り関数
--       （getPublishedSiteBySlug など）は select('*') を使わず、
--       必要なカラムを明示的に列挙し、notify_email / line_admin_user_id /
--       turnstile_site_key を含めない（第一の防御）。
--     - Netlify Functions（send-reservation.js）は SUPABASE_SERVICE_ROLE_KEY
--       を使い、サーバーサイドのみでこれらのカラムを取得する
--       （service role キーはRLSもREVOKEもバイパスするため、
--       anon keyをクライアントに渡す経路とは完全に分離されている）。
--     - authenticated ロールは引き続きSELECT可能（店主が自分のサイトの
--       通知設定を編集画面で読み書きするために必要）。REVOKEはanonのみ
--       を対象とする。turnstile_site_key は公開して問題ない値
--       （reCAPTCHAのsite keyに相当）なのでREVOKE対象外。
--   より厳密な防御をDB側でも行いたい場合は、将来的に
--   notify_email 等を別テーブル（例: site_notify_settings、サーバー専用）に
--   切り出す設計への移行も検討余地はあるが、列単位REVOKEにより
--   当面のリスクは解消済み。
-- ============================================================

ALTER TABLE sites ADD COLUMN IF NOT EXISTS notify_email TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS line_admin_user_id TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS turnstile_site_key TEXT;

-- 列単位の権限制御（2026-06-28 本番適用済み）:
-- anon ロールから notify_email / line_admin_user_id へのSELECT権限を剥奪。
-- RLSの行条件（public read published active sites）を満たす行でも、
-- anon keyでこの2列を直接指定してSELECTすることはできなくなる。
-- authenticated ロールの権限は変更なし（店主自身の編集UIで必要）。
REVOKE SELECT (notify_email, line_admin_user_id) ON public.sites FROM anon;

-- 既存のRLSポリシー自体に変更はない（書き込みは引き続き
-- "owner update own sites" = auth.uid() = user_id のみが許可される）。
-- 上記の理由により、新規カラム追加に伴うポリシーの追加・変更は不要。
