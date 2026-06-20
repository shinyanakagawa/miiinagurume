-- ============================================================
-- 匿名ユーザー(anon)がPostgREST経由でsitesテーブルの
-- stripe_customer_id / stripe_subscription_id を直接読めて
-- しまう問題を修正する（RLSは行を絞るが列は絞らないため）
-- ============================================================

REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON sites FROM anon;
