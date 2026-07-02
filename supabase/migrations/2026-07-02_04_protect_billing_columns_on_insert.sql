-- ============================================================
-- 課金カラム保護（INSERT時）: 2026-06-20_01_protect_billing_columns.sql の
-- protect_billing_columns() トリガーは BEFORE UPDATE のみに適用されており、
-- INSERT には適用されていなかった。
--
-- 影響: 認証済みユーザーが Supabase クライアントから直接
--   supabase.from('sites').insert([{ user_id: <自分>, slug: 'x',
--     subscription_status: 'active', ... }])
-- のようなINSERTを行うと、"owner insert own sites" ポリシー
-- （auth.uid() = user_id のみを検証）と CHECK制約
-- （subscription_status IN (...,'active',...) を許容）の両方を通過してしまい、
-- 決済なしで有効な課金状態を自己付与できてしまう。
-- アプリ本体（グルメHP作成アプリ/js/supabase-client.js の createSite()）は
-- subscription_status / stripe_customer_id / stripe_subscription_id を
-- 一切指定せず、カラムのDEFAULT値（'inactive' / NULL / NULL）に任せている
-- ため、このマイグレーションによる正規フローへの影響はない。
--
-- 修正方針: protect_billing_columns() を INSERT にも対応させ、
-- service_role以外からのINSERTでは billing カラムがDEFAULT値のままで
-- あることを要求する（OLD行が存在しないINSERT時に単純に
-- BEFORE UPDATEと同じ比較ロジックを流用すると、OLD.* が常にNULLになり
-- 正規のINSERT（subscription_statusはNOT NULL DEFAULT 'inactive'）まで
-- 誤って拒否してしまうため、TG_OPで分岐する）。
-- ============================================================

CREATE OR REPLACE FUNCTION protect_billing_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.subscription_status IS DISTINCT FROM 'inactive'
         OR NEW.stripe_customer_id IS NOT NULL
         OR NEW.stripe_subscription_id IS NOT NULL THEN
        RAISE EXCEPTION 'billing columns can only be set via service_role';
      END IF;
    ELSIF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
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
  BEFORE INSERT OR UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION protect_billing_columns();
