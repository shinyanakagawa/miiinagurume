-- ============================================================
-- みーなグルメ データベース スキーマ
-- Supabase SQL Editor に貼り付けて実行してください
-- ============================================================

-- 1. 飲食店テーブル
CREATE TABLE restaurants (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  area        TEXT,
  category    TEXT CHECK (category IN ('カフェ','ビストロ','居酒屋','定食屋','高級店','その他')),
  price_range TEXT CHECK (price_range IN ('〜1,000円','1,000〜3,000円','3,000〜6,000円','6,000円〜')),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  visit_date  DATE,
  instagram_post_url TEXT,
  pr_status   TEXT DEFAULT 'なし' CHECK (pr_status IN ('なし','ギフティング','有償PR')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 投稿管理テーブル
CREATE TABLE posts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  post_date       DATE,
  format          TEXT CHECK (format IN ('フィード','カルーセル','リール','ストーリーズ')),
  caption         TEXT,
  hashtags        TEXT,
  likes           INTEGER DEFAULT 0,
  saves           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  instagram_url   TEXT,
  status          TEXT DEFAULT '企画中' CHECK (status IN ('企画中','制作中','完成','投稿済')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PR案件テーブル
CREATE TABLE pr_campaigns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_name TEXT NOT NULL,
  contact_name    TEXT,
  contact_email   TEXT,
  type            TEXT CHECK (type IN ('ギフティング','有償PR','コンサル','その他')),
  amount          INTEGER DEFAULT 0,
  deadline        DATE,
  status          TEXT DEFAULT '検討中' CHECK (status IN ('検討中','受諾','辞退','完了')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. お問い合わせテーブル
CREATE TABLE contacts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  restaurant_name TEXT,
  type            TEXT CHECK (type IN ('取材依頼','PR相談','コンサル依頼','一般問い合わせ')),
  message         TEXT,
  responded       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. HP生成アプリ：生成したHPの保存
CREATE TABLE generated_sites (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_name  TEXT NOT NULL,
  category    TEXT CHECK (category IN ('カフェ','ビストロ','居酒屋','定食屋','高級店')),
  form_data   JSONB,
  html        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security（外部から読み取りできるように設定）
-- ============================================================

ALTER TABLE restaurants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_sites   ENABLE ROW LEVEL SECURITY;

-- 飲食店・投稿は誰でも読み取り可（サイトに表示するため）
CREATE POLICY "public read restaurants" ON restaurants FOR SELECT USING (true);
CREATE POLICY "public read posts"       ON posts       FOR SELECT USING (true);

-- お問い合わせは誰でも書き込み可（フォーム送信のため）
CREATE POLICY "public insert contacts"  ON contacts    FOR INSERT WITH CHECK (true);

-- HP生成アプリの保存データは誰でも読み書き可（チームツールのため）
CREATE POLICY "public insert generated_sites" ON generated_sites FOR INSERT WITH CHECK (true);
CREATE POLICY "public read generated_sites"   ON generated_sites FOR SELECT USING (true);

-- PR案件・お問い合わせは読み取り不可（管理者のみ）
CREATE POLICY "no public read pr"       ON pr_campaigns FOR SELECT USING (false);
CREATE POLICY "no public read contacts" ON contacts     FOR SELECT USING (false);

-- ============================================================
-- Storage：HP生成アプリの画像アップロード用バケット
-- ============================================================

-- site-images バケットを公開バケットとして作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO NOTHING;

-- 誰でもアップロード可（HP生成アプリから画像を追加するため）
CREATE POLICY "public insert site-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'site-images');

-- 誰でも読み取り可（生成したHPに画像を表示するため）
CREATE POLICY "public read site-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-images');