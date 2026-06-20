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
