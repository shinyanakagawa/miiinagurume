// ============================================================
// Cloudflare Worker - 店舗サブドメイン用リバースプロキシ
// ------------------------------------------------------------
// データ連携担当/参考資料/2026-06-20-cloudflare-routing-plan.md の
// Task 4 設計に基づく実装。
//
// 役割:
//   *.miiinagurume.com 宛のリクエストを受け、Hostヘッダーから
//   店舗slugを抽出し、Netlify上の site.html?slug=<slug> に
//   透過的にプロキシする。
//
// 注意:
//   - app.miiinagurume.com（管理画面）はDNSのみで直接Netlifyに
//     向ける設定（Cloudflare DNS: CNAME app → Netlifyサイト, Proxy off）
//     のためこのWorkerを経由しない。Worker Routeはワイルドカード
//     （*.miiinagurume.com/*）のみに設定する。
//   - slugがHostヘッダーから抽出できない場合（ルートドメイン自体、
//     appサブドメイン、複数階層サブドメイン、別ドメイン）は
//     Workerが直接404を返す。
//   - slugが抽出できても、そのslugがSupabase上に存在しない・
//     未公開の場合は、Netlify側のsite.htmlが「このページは現在
//     公開されていません」というメッセージ（HTTP 200）を返す設計
//     になっている。slugの実在確認はWorkerの責務ではなく
//     Netlify/Supabase側の責務とする（cloudflare-routing-plan.md の
//     完了条件に明記の方針を踏襲）。
// ============================================================

import { extractSlugFromHost } from './slug.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = extractSlugFromHost(url.hostname, env.ROOT_DOMAIN);

    if (!slug) {
      return new Response('Not Found', { status: 404 });
    }

    const targetUrl = `${env.NETLIFY_ORIGIN}/site.html?slug=${encodeURIComponent(slug)}`;

    let originResponse;
    try {
      originResponse = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        // GET/HEAD以外のメソッドは想定していないが、将来的なPOST等にも
        // 対応できるようbodyを引き渡す（GET/HEADの場合はundefinedのまま）
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      });
    } catch (err) {
      console.error('Netlifyオリジンへのプロキシに失敗しました:', err);
      return new Response('Bad Gateway', { status: 502 });
    }

    // オリジンのレスポンスをそのまま透過させる（ステータス・ヘッダー・ボディ）。
    // slugがSupabase上に実在しない場合も、site.html側のエラーメッセージ
    // （HTTP 200 + 案内文）がそのまま返る。
    return new Response(originResponse.body, originResponse);
  },
};
