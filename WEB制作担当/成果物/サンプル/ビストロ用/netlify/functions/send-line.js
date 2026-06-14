// 予約フォーム送信時にLINE公式アカウントへブロードキャスト通知を送る
// 必要な環境変数: LINE_CHANNEL_ACCESS_TOKEN (LINE Developersで発行したチャネルアクセストークン)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return { statusCode: 500, body: 'LINE_CHANNEL_ACCESS_TOKEN is not set' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { name, tel, date, time, pax } = data;
  const message =
    '【Bistrot MIIINA】新しいご予約\n' +
    `お名前: ${name || '-'}\n` +
    `電話番号: ${tel || '-'}\n` +
    `日付: ${date || '-'}\n` +
    `時間: ${time || '-'}\n` +
    `人数: ${pax ? pax + '名' : '-'}`;

  const res = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages: [{ type: 'text', text: message }] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { statusCode: 502, body: `LINE API error: ${errText}` };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
