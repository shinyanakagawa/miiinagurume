// ============================================================
// Cloudflare Worker - Hostヘッダーから店舗slugを抽出する純粋関数
// ------------------------------------------------------------
// データ連携担当/参考資料/2026-06-20-cloudflare-routing-plan.md の
// Task 3 設計に基づく実装。
// ============================================================

const RESERVED_SUBDOMAINS = new Set(['app']);

/**
 * ホスト名からテナント（店舗）のslugを抽出する。
 *
 * @param {string} hostname  例: 'bistro-miina.miiinagurume.com'
 * @param {string} rootDomain 例: 'miiinagurume.com'
 * @returns {string|null} 抽出できたslug。以下のいずれかに該当する場合はnull:
 *   - ルートドメイン自体（サブドメインなし）
 *   - 予約済みサブドメイン（'app' = 管理画面用。Workerを経由させずDNSのみで直結する）
 *   - 別ドメイン（rootDomainで終わらない）
 *   - 複数階層のサブドメイン（'foo.bar.miiinagurume.com' のような形）
 */
export function extractSlugFromHost(hostname, rootDomain) {
  if (hostname === rootDomain) return null;
  if (!hostname.endsWith(`.${rootDomain}`)) return null;

  const sub = hostname.slice(0, hostname.length - rootDomain.length - 1);
  if (sub.includes('.')) return null;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  if (!sub) return null;

  return sub;
}
