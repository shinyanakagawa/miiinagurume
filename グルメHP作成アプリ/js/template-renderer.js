// ============================================================
// グルメHP作成アプリ - テンプレートレンダラー
// site.theme と site.data から公開HPの完全なHTMLを生成する
// ============================================================

export const THEMES = {
  cafe:     { label: 'カフェ',   ctaIcon: '☕', genreDefault: 'CAFE' },
  bistro:   { label: 'ビストロ', ctaIcon: '🍷', genreDefault: 'BISTRO' },
  izakaya:  { label: '居酒屋',   ctaIcon: '🍺', genreDefault: 'IZAKAYA' },
  teishoku: { label: '定食屋',   ctaIcon: '🍚', genreDefault: 'TEISHOKU' },
  kaiseki:  { label: '高級店',   ctaIcon: '🍶', genreDefault: 'KAISEKI' },
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeUrl(value) {
  const v = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(v)) return '';
  return v;
}

function telHref(phone) {
  return 'tel:' + String(phone ?? '').replace(/[^\d+]/g, '');
}

// 120字程度を目安にmeta description用の文章を作る
function buildMetaDescription(data, storeName, genre) {
  const base = (data.description || data.catch_copy || '').toString().trim();
  let text = base
    ? base.replace(/\s+/g, ' ')
    : `${storeName}の公式ホームページです。`;
  if (!base) {
    const extra = [genre, data.address, data.hours].filter(Boolean).join(' ／ ');
    if (extra) text += ` ${extra}`;
  }
  const LIMIT = 120;
  if (text.length > LIMIT) text = text.slice(0, LIMIT - 1) + '…';
  return text;
}

// 曜日別営業時間（任意）から schema.org openingHours 用の簡易テキストを作る
function buildOpeningHoursText(weeklyHours) {
  if (!Array.isArray(weeklyHours) || !weeklyHours.length) return '';
  const labels = ['月', '火', '水', '木', '金', '土', '日'];
  return weeklyHours
    .filter(d => d && !d.closed && d.open && d.close)
    .map(d => `${labels[d.day] ?? ''} ${d.open}-${d.close}`)
    .join(', ');
}

function renderHeadMeta(data, storeName, genre) {
  const description = buildMetaDescription(data, storeName, genre);
  const ogImage = safeUrl(data.hero_image);

  const ldJson = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: storeName,
  };
  if (data.address) ldJson.address = { '@type': 'PostalAddress', streetAddress: data.address };
  if (data.phone) ldJson.telephone = data.phone;
  if (genre) ldJson.servesCuisine = genre;
  if (ogImage) ldJson.image = ogImage;
  const openingHoursText = buildOpeningHoursText(data.weekly_hours);
  if (openingHoursText) {
    ldJson.openingHours = openingHoursText;
  } else if (data.hours) {
    ldJson.openingHoursSpecification = String(data.hours);
  }
  if (data.catch_copy || data.description) ldJson.description = description;

  return `
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(storeName)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="restaurant.restaurant">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<script type="application/ld+json">${JSON.stringify(ldJson).replace(/</g, '\\u003c')}</script>`;
}

function renderMenu(items = []) {
  if (!items.length) return '';
  const cards = items.map(item => `
    <div class="site-menu-item">
      <div class="name">${esc(item.name)}</div>
      ${item.price ? `<div class="price">${esc(item.price)}</div>` : ''}
      ${item.description ? `<div class="desc">${esc(item.description)}</div>` : ''}
    </div>`).join('');
  return `
  <section class="site-section" id="menu">
    <span class="site-section-label">MENU</span>
    <h2 class="site-section-title">メニュー</h2>
    <div class="site-menu-grid">${cards}</div>
  </section>`;
}

function renderGallery(images = []) {
  const valid = images.filter(Boolean);
  if (!valid.length) return '';
  const imgs = valid.map(url => `<img src="${esc(safeUrl(url))}" alt="店内・料理写真" loading="lazy">`).join('');
  return `
  <section class="site-section" id="gallery">
    <span class="site-section-label">GALLERY</span>
    <h2 class="site-section-title">ギャラリー</h2>
    <div class="site-gallery">${imgs}</div>
  </section>`;
}

function renderSpecial(data) {
  if (!data.special_title && !data.special_body) return '';
  return `
  <section class="site-section" id="special">
    <span class="site-section-label">FEATURE</span>
    <h2 class="site-section-title">${esc(data.special_title || '特集')}</h2>
    <div class="site-special">
      <p style="white-space:pre-wrap">${esc(data.special_body)}</p>
    </div>
  </section>`;
}

function renderReviews(reviews = []) {
  const valid = reviews.filter(r => r && (r.comment || r.name));
  if (!valid.length) return '';
  const cards = valid.map(r => `
    <div class="site-review">
      ${r.rating ? `<div class="stars">${'★'.repeat(Math.min(5, Math.max(1, Number(r.rating) || 5)))}</div>` : ''}
      <p>${esc(r.comment)}</p>
      ${r.name ? `<p class="name">${esc(r.name)} 様</p>` : ''}
    </div>`).join('');
  return `
  <section class="site-section" id="reviews">
    <span class="site-section-label">VOICE</span>
    <h2 class="site-section-title">お客様の声</h2>
    <div class="site-reviews">${cards}</div>
  </section>`;
}

function renderInfoAndAccess(data) {
  const hasWeeklyHours = Array.isArray(data.weekly_hours) && data.weekly_hours.length > 0;
  const hoursValue = data.hours
    ? `${esc(data.hours)}${hasWeeklyHours ? ' <span id="site-open-badge" class="site-open-badge"></span>' : ''}`
    : (hasWeeklyHours ? '<span id="site-open-badge" class="site-open-badge"></span>' : '');

  const rows = [
    ['住所', data.address ? esc(data.address) : ''],
    ['TEL', data.phone ? `<a href="${telHref(data.phone)}">${esc(data.phone)}</a>` : ''],
    ['営業時間', hoursValue],
    ['定休日', data.closed_days ? esc(data.closed_days) : ''],
    ['最寄駅', data.station ? esc(data.station) : ''],
    ['席数', data.seats ? esc(data.seats) : ''],
    ['予算', data.budget ? esc(data.budget) : ''],
  ].filter(([, v]) => v);

  if (!rows.length && !data.address) return '';

  const trs = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('');

  return `
  <section class="site-section" id="info">
    <span class="site-section-label">SHOP INFO</span>
    <h2 class="site-section-title">店舗情報・アクセス</h2>
    <table class="site-info-table">${trs}</table>
    ${data.address ? `
    <div class="site-map-embed">
      <iframe
        src="https://www.google.com/maps?q=${encodeURIComponent(data.address)}&output=embed"
        width="100%" height="320" style="border:0"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        title="${esc(data.store_name || 'お店')}の地図"></iframe>
    </div>
    <div style="margin-top:1.5rem;text-align:center">
      <a href="https://maps.google.com/?q=${encodeURIComponent(data.address)}" class="site-cta" style="display:inline-flex" target="_blank" rel="noopener">🗺 Googleマップで開く</a>
    </div>` : ''}
  </section>`;
}

// weekly_hours を使って「営業中／準備中」バッジを判定するための軽量スクリプト。
// weekly_hours が無いサイトでは #site-open-badge 自体が出力されないため何もしない。
function renderOpenStatusScript(weeklyHours) {
  if (!Array.isArray(weeklyHours) || !weeklyHours.length) return '';
  return `
<script>
(function () {
  var badge = document.getElementById('site-open-badge');
  if (!badge) return;
  var weeklyHours = ${JSON.stringify(weeklyHours).replace(/</g, '\\u003c')};
  var now = new Date();
  var day = (now.getDay() + 6) % 7; // 月=0 ... 日=6 に変換
  var today = weeklyHours.find(function (d) { return d && d.day === day; });
  if (!today || today.closed || !today.open || !today.close) {
    badge.textContent = '本日定休日';
    badge.classList.add('is-closed');
    return;
  }
  var toMinutes = function (t) {
    var parts = String(t).split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  };
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var openMin = toMinutes(today.open);
  var closeMin = toMinutes(today.close);
  var isOpen = closeMin > openMin
    ? (nowMin >= openMin && nowMin < closeMin)
    : (nowMin >= openMin || nowMin < closeMin); // 深夜営業（閉店が翌日扱い）
  badge.textContent = isOpen ? '営業中' : '準備中';
  badge.classList.add(isOpen ? 'is-open' : 'is-closed');
})();
</script>`;
}

/**
 * site = { theme, status, data }
 * data = {
 *   store_name, logo_text, genre, catch_copy, description,
 *   hero_image, address, phone, hours, closed_days, station,
 *   seats, budget, menu_items[], gallery_images[],
 *   special_title, special_body, reviews[], sns_instagram,
 *   weekly_hours[] (任意・後方互換: 未設定なら hours の文字列のみ表示)
 *     weekly_hours の各要素: { day: 0-6 (0=月...6=日), open: 'HH:MM', close: 'HH:MM', closed: boolean }
 * }
 */
export function renderSiteHTML(site) {
  const theme = THEMES[site.theme] ? site.theme : 'cafe';
  const data = site.data || {};
  const meta = THEMES[theme];
  const storeName = data.store_name || 'お店の名前';
  const logoText = data.logo_text || storeName;
  const genre = data.genre || meta.label;
  const heroStyle = data.hero_image
    ? ` style="background-image:url('${esc(safeUrl(data.hero_image))}')"`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(storeName)}${data.catch_copy ? `｜${esc(data.catch_copy)}` : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/themes.css">${renderHeadMeta(data, storeName, genre)}
</head>
<body class="site-body" data-theme="${theme}">

<header class="site-header">
  <div class="site-logo">${esc(logoText)}</div>
  ${data.phone ? `<a href="${telHref(data.phone)}" class="site-cta">${meta.ctaIcon} ご予約</a>` : ''}
</header>

<section class="site-hero${data.hero_image ? ' has-image' : ''}"${heroStyle}>
  <span class="site-hero-genre">${esc(genre)}</span>
  <h1 class="site-hero-name">${esc(storeName)}</h1>
  ${data.catch_copy ? `<p class="site-hero-copy">${esc(data.catch_copy)}</p>` : ''}
</section>

${data.description ? `
<section class="site-section" id="concept">
  <span class="site-section-label">CONCEPT</span>
  <h2 class="site-section-title">${esc(genre)}のこだわり</h2>
  <p class="site-section-desc">${esc(data.description)}</p>
</section>` : ''}

${renderMenu(data.menu_items)}
${renderSpecial(data)}
${renderGallery(data.gallery_images)}
${renderReviews(data.reviews)}
${renderInfoAndAccess(data)}

<footer class="site-footer">
  <p class="flogo">${esc(logoText)}</p>
  <p>${esc(genre)} ${esc(storeName)}</p>
  ${data.sns_instagram ? `<p style="margin-top:.5rem"><a href="${esc(safeUrl(data.sns_instagram))}" target="_blank" rel="noopener" style="color:var(--accent)">Instagram</a></p>` : ''}
  <p style="margin-top:1rem">※ このページは「グルメHP作成アプリ」で作成されたサンプルです</p>
</footer>

${data.phone ? `
<div class="site-floating">
  <a href="${telHref(data.phone)}">${meta.ctaIcon} 電話で予約する</a>
</div>` : ''}
${renderOpenStatusScript(data.weekly_hours)}

</body>
</html>`;
}
