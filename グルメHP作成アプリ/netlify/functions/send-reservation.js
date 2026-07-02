// ============================================================
// 汎用予約フォーム通知Function（マルチテナント対応）
// ------------------------------------------------------------
// グルメHP作成アプリで作成された複数店舗（テナント）が、この1つの
// Netlify Functionを共有して予約通知を受け取る。
// 店舗ごとの通知先（LINE userId・通知メール）は env var ではなく、
// リクエストボディの slug から Supabase の sites テーブルを
// service role キーで参照して取得する。
//
// 処理フロー（既存の send-line-cafe.js 等の個別店舗版と同じ順序）:
//   1. ハニーポット検証
//   2. 必須項目検証
//   3. slug から店舗情報を取得（service role・サーバーサイドのみ）
//   4. レート制限
//   5. Turnstile検証
//   6. LINE push通知
//   7. Resendメール通知
//
// 必要な環境変数:
//   SUPABASE_URL              : SupabaseプロジェクトURL
//   SUPABASE_SERVICE_ROLE_KEY : Supabase service roleキー（絶対にクライアントへ
//                               渡さない。RLSをバイパスするためサーバー専用）
//   LINE_CHANNEL_ACCESS_TOKEN : LINE Developersで発行したチャネルアクセストークン
//                               （全店舗共通のLINE公式アカウントを想定。
//                               店舗ごとに異なるのは送信先 line_admin_user_id のみ）
//   RESEND_API_KEY            : Resend (https://resend.com) のAPIキー
//   TURNSTILE_SECRET_KEY      : Cloudflare Turnstileのシークレットキー
//                               （全店舗共通。個別店舗ごとのTurnstileアカウント
//                               発行は運用が複雑になるため見送り。site key
//                               （sites.turnstile_site_key）はテナントごとに
//                               異なってもよいが、secret keyは共通でよい）
//
// 通知先の取得元（sites テーブルの非公開カラム。詳細は
// supabase/schema_app.sql の「2026-06-28 予約フォーム通知先カラム追加」
// コメントと データ連携担当/成果物/成果物.md を参照）:
//   - notify_email       : 店主が受け取るメールアドレス
//   - line_admin_user_id : 店主のLINE userId（LINE公式アカウントの友だち登録が必要）
//   - data.store_name    : 通知文・メール件名に使う店舗名（公開列 data 内の値。
//                           表示用の店名であり個人情報ではないため data 列のままでよい）
//
// 重要: ここで取得した notify_email / line_admin_user_id は、この関数の
// レスポンスボディに含めて返してはならない（フロントエンドに店主の個人連絡先を
// 漏らさないため）。レスポンスは "ok" / エラー文言のみとすること。
// ============================================================

const REQUIRED_FIELDS = ['slug', 'name', 'tel', 'date', 'time', 'pax'];

const RATE_LIMIT_WINDOW_MS = 10_000;
const lastRequestByIp = new Map();

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const last = lastRequestByIp.get(ip);
  lastRequestByIp.set(ip, now);
  return typeof last === 'number' && now - last < RATE_LIMIT_WINDOW_MS;
}

// siteHasTurnstileKey: この店舗の turnstile_site_key（フロントの予約フォームに
// Turnstileウィジェットを表示するかどうかの判定と同じ値）。falsy の場合、
// そもそもフォーム側にウィジェットが出力されずトークンを取得しようがないため、
// TURNSTILE_SECRET_KEY が設定済みでも検証をスキップする。これが無いと、
// site key未設定の店舗（editor.htmlでは「任意」項目）の予約が
// TURNSTILE_SECRET_KEY設定後は永久に「Bot確認に失敗しました」になってしまう。
async function verifyTurnstile(token, remoteIp, siteHasTurnstileKey) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !siteHasTurnstileKey) {
    if (!secret) console.warn('TURNSTILE_SECRET_KEY が未設定のため、Turnstile検証をスキップしています');
    return true;
  }
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: remoteIp }),
  });
  const result = await res.json();
  return result.success === true;
}

/**
 * slug から店舗の非公開設定（通知先）と表示用店名を取得する。
 * service role キーを使い、Supabase REST API (PostgREST) を直接 fetch する
 * （npm依存を増やさず、既存のsend-line-*.jsと同じ「素のfetchで完結」方針を踏襲）。
 *
 * status='published' の店舗のみを対象とする（下書き状態の店舗からの
 * 予約送信は想定しないため、安全側に倒して draft では通知しない）。
 */
async function getSiteContactBySlug(slug) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です');
    return null;
  }

  const params = new URLSearchParams({
    select: 'id,notify_email,line_admin_user_id,turnstile_site_key,data,status',
    slug: `eq.${slug}`,
    status: 'eq.published',
    limit: '1',
  });

  const res = await fetch(`${supabaseUrl}/rest/v1/sites?${params.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!res.ok) {
    console.error('Supabaseからの店舗情報取得に失敗しました:', res.status, await res.text());
    return null;
  }

  const rows = await res.json();
  return rows[0] || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ハニーポット: 人間には見えない欄が埋まっていたら静かに拒否
  if (data.website) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // 必須項目検証（slugも必須。どの店舗宛かを特定できないと通知不可）
  const { slug, name, tel, date, time, pax } = data;
  const missing = REQUIRED_FIELDS.filter((field) => !String(data[field] ?? '').trim());
  if (missing.length > 0) {
    return { statusCode: 400, body: `必須項目が未入力です: ${missing.join(', ')}` };
  }

  // レート制限はSupabaseへの問い合わせより前に行う（連打された場合に
  // 無駄なDBアクセスを発生させないため）
  const remoteIp = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'];
  if (isRateLimited(remoteIp)) {
    return { statusCode: 429, body: '送信間隔が短すぎます。少し待ってから再度お試しください。' };
  }

  const site = await getSiteContactBySlug(slug);
  if (!site) {
    // slugが存在しない・未公開・Supabase接続失敗のいずれも、
    // 詳細を外部に漏らさず汎用的な404として返す
    return { statusCode: 404, body: '指定された店舗が見つかりません' };
  }

  const turnstileOk = await verifyTurnstile(data['cf-turnstile-response'], remoteIp, !!site.turnstile_site_key);
  if (!turnstileOk) {
    return { statusCode: 400, body: 'Bot確認に失敗しました' };
  }

  const storeName = (site.data && site.data.store_name) || 'お店';
  const results = {};

  // LINE通知（管理者宛のみ。broadcastは使わない）
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineAdminUserId = site.line_admin_user_id;
  if (lineToken && lineAdminUserId) {
    const message =
      `【${storeName}】新しいご予約\n` +
      `お名前: ${name || '-'}\n` +
      `電話番号: ${tel || '-'}\n` +
      `日付: ${date || '-'}\n` +
      `時間: ${time || '-'}\n` +
      `人数: ${pax ? pax + '名' : '-'}`;

    try {
      const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lineToken}`,
        },
        body: JSON.stringify({ to: lineAdminUserId, messages: [{ type: 'text', text: message }] }),
      });
      if (lineRes.ok) {
        results.line = 'ok';
      } else {
        const errorText = await lineRes.text();
        console.error(`LINE通知に失敗しました（slug=${slug}）:`, lineRes.status, errorText);
        results.line = 'failed';
      }
    } catch (err) {
      console.error(`LINE通知中に例外が発生しました（slug=${slug}）:`, err);
      results.line = 'failed';
    }
  } else {
    results.line = 'skipped';
  }

  // メール通知
  const resendKey = process.env.RESEND_API_KEY;
  const notifyEmail = site.notify_email;
  if (resendKey && notifyEmail) {
    const html = `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#FAF7F2;padding:32px;color:#2C1F14;">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E8DFD0;border-radius:8px;overflow:hidden;">
          <div style="background:#2C1F14;padding:24px 32px;">
            <p style="margin:0;color:#C8A090;font-size:11px;letter-spacing:.3em;text-transform:uppercase;">New Reservation</p>
            <h1 style="margin:8px 0 0;color:#FAF7F2;font-size:22px;letter-spacing:.08em;">${escapeHtml(storeName)}</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="margin:0 0 20px;font-size:16px;color:#6B4F3A;">ご予約を受け付けました</h2>
            <table style="width:100%;font-size:14px;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;color:#7D9B76;width:96px;">お名前</td><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;font-weight:bold;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;color:#7D9B76;">電話番号</td><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;">${escapeHtml(tel)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;color:#7D9B76;">日付</td><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;">${escapeHtml(date)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;color:#7D9B76;">時間</td><td style="padding:10px 0;border-bottom:1px solid #E8DFD0;">${escapeHtml(time)}</td></tr>
              <tr><td style="padding:10px 0;color:#7D9B76;">人数</td><td style="padding:10px 0;">${escapeHtml(pax)}名</td></tr>
            </table>
          </div>
          <div style="background:#E8DFD0;padding:16px 32px;text-align:center;font-size:11px;color:#7D9B76;letter-spacing:.05em;">
            ${escapeHtml(storeName)} ご予約管理
          </div>
        </div>
      </div>
    `;

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          // 重要: onboarding@resend.dev はResendの未検証アカウント用共有送信元アドレスで、
          // 「Resendアカウントに登録・検証済みのメールアドレス宛」にしか配信できない制約がある
          // （Phase1のsend-line-*.js群と同じ既知の課題。データ連携担当/成果物/成果物.mdを参照）。
          //
          // マルチテナント化のリスク: このFunctionは店舗ごとに異なる notify_email
          // （店主が入力した任意のメールアドレス）宛に送信する。onboarding@resend.dev の
          // ままでは、Resendアカウントに検証登録されていないアドレスを持つ店舗の
          // 大半でメール配信が失敗する可能性が高い。本格運用には、みーなグルメの
          // 独自ドメイン（例: notify@miiinagurume.com）をResendで送信ドメイン検証する
          // ことが前提になる。ドメイン検証はResendダッシュボードでのDNS設定作業が必要なため
          // CEO/ユーザー側の対応待ち（コード側は失敗ログの出力強化までで対応済み）。
          from: 'みーなグルメ <onboarding@resend.dev>',
          to: [notifyEmail],
          subject: `【ご予約】${name || ''}様 ${date || ''} ${time || ''}（${storeName}）`,
          html,
        }),
      });
      if (emailRes.ok) {
        results.email = 'ok';
      } else {
        const errorText = await emailRes.text();
        console.error(`Resendメール送信に失敗しました（slug=${slug}, notify_email設定済み）:`, emailRes.status, errorText);
        results.email = 'failed';
      }
    } catch (err) {
      console.error(`Resendメール送信中に例外が発生しました（slug=${slug}）:`, err);
      results.email = 'failed';
    }
  } else {
    results.email = 'skipped';
  }

  // レスポンスには notify_email / line_admin_user_id を含めない
  // （店主の個人連絡先をフロントエンドに漏らさないため）。
  // results は line/email それぞれ 'ok' | 'failed' | 'skipped' のみ。
  return { statusCode: 200, body: JSON.stringify({ ok: true, results }) };
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
