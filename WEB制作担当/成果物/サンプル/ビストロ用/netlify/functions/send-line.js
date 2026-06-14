// 予約フォーム送信時にLINE公式アカウントへのブロードキャスト通知と、
// 担当者宛のHTMLメール通知を送る。
//
// 必要な環境変数:
//   LINE_CHANNEL_ACCESS_TOKEN : LINE Developersで発行したチャネルアクセストークン
//   RESEND_API_KEY            : Resend (https://resend.com) のAPIキー
//   NOTIFY_EMAIL              : 通知を受け取るメールアドレス
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

  const { name, tel, date, time, pax } = data;
  const results = {};

  // LINE通知
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (lineToken) {
    const message =
      '【Bistrot MIIINA】新しいご予約\n' +
      `お名前: ${name || '-'}\n` +
      `電話番号: ${tel || '-'}\n` +
      `日付: ${date || '-'}\n` +
      `時間: ${time || '-'}\n` +
      `人数: ${pax ? pax + '名' : '-'}`;

    const lineRes = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({ messages: [{ type: 'text', text: message }] }),
    });
    results.line = lineRes.ok ? 'ok' : await lineRes.text();
  }

  // メール通知
  const resendKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (resendKey && notifyEmail) {
    const html = `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;background:#FAF6F2;padding:32px;color:#2C1820;">
        <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #F0E6E8;border-radius:8px;overflow:hidden;">
          <div style="background:#2C1820;padding:24px 32px;">
            <p style="margin:0;color:#C8903A;font-size:11px;letter-spacing:.3em;text-transform:uppercase;">New Reservation</p>
            <h1 style="margin:8px 0 0;color:#FAF6F2;font-size:22px;letter-spacing:.08em;">Bistrot MIIINA</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="margin:0 0 20px;font-size:16px;color:#8B2840;">ご予約を受け付けました</h2>
            <table style="width:100%;font-size:14px;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;color:#9E7070;width:96px;">お名前</td><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;font-weight:bold;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;color:#9E7070;">電話番号</td><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;">${escapeHtml(tel)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;color:#9E7070;">日付</td><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;">${escapeHtml(date)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;color:#9E7070;">時間</td><td style="padding:10px 0;border-bottom:1px solid #F0E6E8;">${escapeHtml(time)}</td></tr>
              <tr><td style="padding:10px 0;color:#9E7070;">人数</td><td style="padding:10px 0;">${escapeHtml(pax)}名</td></tr>
            </table>
          </div>
          <div style="background:#F0E6E8;padding:16px 32px;text-align:center;font-size:11px;color:#9E7070;letter-spacing:.05em;">
            Bistrot MIIINA ご予約管理
          </div>
        </div>
      </div>
    `;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Bistrot MIIINA <onboarding@resend.dev>',
        to: [notifyEmail],
        subject: `【ご予約】${name || ''}様 ${date || ''} ${time || ''}`,
        html,
      }),
    });
    results.email = emailRes.ok ? 'ok' : await emailRes.text();
  }

  return { statusCode: 200, body: JSON.stringify(results) };
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
