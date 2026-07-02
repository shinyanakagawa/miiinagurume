// 予約フォーム送信時にLINE公式アカウントへの通知と、
// 担当者宛のHTMLメール通知を送る。
//
// 必要な環境変数:
//   LINE_CHANNEL_ACCESS_TOKEN : LINE Developersで発行したチャネルアクセストークン
//   LINE_ADMIN_USER_ID        : 通知を受け取る管理者のLINE userId
//   RESEND_API_KEY            : Resend (https://resend.com) のAPIキー
//   NOTIFY_EMAIL              : 通知を受け取るメールアドレス
//   TURNSTILE_SECRET_KEY      : Cloudflare Turnstileのシークレットキー
const REQUIRED_FIELDS = ['name', 'tel', 'date', 'time', 'pax'];

const RATE_LIMIT_WINDOW_MS = 10_000;
const lastRequestByIp = new Map();

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const last = lastRequestByIp.get(ip);
  lastRequestByIp.set(ip, now);
  return typeof last === 'number' && now - last < RATE_LIMIT_WINDOW_MS;
}

async function verifyTurnstile(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY が未設定のため、Turnstile検証をスキップしています');
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

  // 必須項目検証
  const { name, tel, date, time, pax } = data;
  const missing = REQUIRED_FIELDS.filter((field) => !String(data[field] ?? '').trim());
  if (missing.length > 0) {
    return { statusCode: 400, body: `必須項目が未入力です: ${missing.join(', ')}` };
  }

  const remoteIp = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'];

  if (isRateLimited(remoteIp)) {
    return { statusCode: 429, body: '送信間隔が短すぎます。少し待ってから再度お試しください。' };
  }

  const turnstileOk = await verifyTurnstile(data['cf-turnstile-response'], remoteIp);
  if (!turnstileOk) {
    return { statusCode: 400, body: 'Bot確認に失敗しました' };
  }

  const results = {};

  // LINE通知（管理者宛のみ。broadcastは使わない）
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineAdminUserId = process.env.LINE_ADMIN_USER_ID;
  if (lineToken && lineAdminUserId) {
    const message =
      '【Cafe MIIINA】新しいご予約\n' +
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
      results.line = lineRes.ok ? 'ok' : await lineRes.text();
    } catch (err) {
      console.error('LINE通知中に例外が発生しました:', err);
      results.line = 'failed';
    }
  }

  // メール通知
  const resendKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (resendKey && notifyEmail) {
    const html = `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#FAF7F2;padding:32px;color:#2C1F14;">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E8DFD0;border-radius:8px;overflow:hidden;">
          <div style="background:#2C1F14;padding:24px 32px;">
            <p style="margin:0;color:#C8A090;font-size:11px;letter-spacing:.3em;text-transform:uppercase;">New Reservation</p>
            <h1 style="margin:8px 0 0;color:#FAF7F2;font-size:22px;letter-spacing:.08em;">MIIINA</h1>
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
            MIIINA ご予約管理
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
          // 注意: onboarding@resend.dev はResendの未検証アカウント用共有送信元アドレスのため、
          // Resendアカウントに登録・検証済みのメールアドレス宛にしか配信できない。
          // NOTIFY_EMAIL が別アドレスの場合は配信に失敗するので、独自送信ドメインの検証を推奨。
          from: 'Cafe MIIINA <onboarding@resend.dev>',
          to: [notifyEmail],
          subject: `【ご予約】${name || ''}様 ${date || ''} ${time || ''}`,
          html,
        }),
      });
      if (emailRes.ok) {
        results.email = 'ok';
      } else {
        const errorText = await emailRes.text();
        console.error('Resendメール送信に失敗しました:', emailRes.status, errorText);
        results.email = errorText;
      }
    } catch (err) {
      console.error('Resendメール送信中に例外が発生しました:', err);
      results.email = 'failed';
    }
  }

  return { statusCode: 200, body: JSON.stringify(results) };
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
