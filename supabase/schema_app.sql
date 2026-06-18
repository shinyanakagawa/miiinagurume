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
