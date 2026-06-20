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
