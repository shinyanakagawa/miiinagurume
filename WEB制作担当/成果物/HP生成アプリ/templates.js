// ============================================================
// みーなグルメ HP生成アプリ - テンプレート定義
// カテゴリごとのテーマカラー・ラベルと、HTML生成ロジックを提供する
// ============================================================

export const THEMES = {
  'カフェ': {
    icon: '☕', label: 'Café',
    bg: '#FAF7F2', surface: '#E8DFD0', primary: '#6B4F3A', accent: '#C5A55A',
    text: '#2C1F14', muted: '#7A6B60',
    font: "'Noto Serif JP', serif",
  },
  'ビストロ': {
    icon: '🍷', label: 'Bistro',
    bg: '#FAF6F1', surface: '#EFD9D2', primary: '#7A1F2B', accent: '#C9A84C',
    text: '#2A1015', muted: '#8A6A60',
    font: "'Noto Serif JP', serif",
  },
  '居酒屋': {
    icon: '🍺', label: 'Izakaya',
    bg: '#1F1812', surface: '#2C2017', primary: '#E0581F', accent: '#C8A060',
    text: '#F0ECE4', muted: '#A89888',
    font: "'Noto Sans JP', sans-serif",
  },
  '定食屋': {
    icon: '🍱', label: 'Teishoku',
    bg: '#FDF8F0', surface: '#F5E6CF', primary: '#C07020', accent: '#7A9B5C',
    text: '#2C2014', muted: '#8A7A66',
    font: "'Noto Sans JP', sans-serif",
  },
  '高級店': {
    icon: '✨', label: 'Fine Dining',
    bg: '#0F0D0A', surface: '#1C1814', primary: '#C8A060', accent: '#F0E0C0',
    text: '#F0ECE4', muted: '#A89880',
    font: "'Noto Serif JP', serif",
  },
};

export const CATEGORIES = Object.keys(THEMES);

export const DEFAULT_HOURS = [
  { day: '月曜日', time: '11:00 - 22:00', closed: false },
  { day: '火曜日', time: '11:00 - 22:00', closed: false },
  { day: '水曜日', time: '11:00 - 22:00', closed: false },
  { day: '木曜日', time: '11:00 - 22:00', closed: false },
  { day: '金曜日', time: '11:00 - 23:00', closed: false },
  { day: '土曜日', time: '11:00 - 23:00', closed: false },
  { day: '日曜日', time: '', closed: true },
];

/** HTML特殊文字をエスケープ */
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** 改行をbrタグに変換しつつエスケープ */
function escMultiline(str) {
  return esc(str).replace(/\n/g, '<br>');
}

/**
 * 入力データから飲食店HPのHTML一式を生成する
 * @param {string} category - カフェ/ビストロ/居酒屋/定食屋/高級店
 * @param {object} data - フォーム入力データ
 * @returns {string} 完成したHTML文書
 */
export function generateHTML(category, data) {
  const theme = THEMES[category] || THEMES['カフェ'];
  const storeName = data.storeName?.trim() || 'みいな';
  const catchCopy = data.catchCopy?.trim() || '';
  const description = data.description?.trim() || '';
  const address = data.address?.trim() || '';
  const phone = data.phone?.trim() || '';
  const instagramUrl = data.instagramUrl?.trim() || '';
  const hours = (data.hours && data.hours.length) ? data.hours : DEFAULT_HOURS;
  const menu = (data.menu || []).filter((m) => m.name?.trim());
  const heroImage = data.heroImage || null;
  const galleryImages = (data.galleryImages || []).filter(Boolean);

  const hoursRows = hours.map((h) => `
        <tr class="${h.closed ? 'closed' : ''}">
          <td>${esc(h.day)}</td>
          <td>${h.closed ? '定休日' : esc(h.time)}</td>
        </tr>`).join('');

  const menuCards = menu.length
    ? menu.map((m) => `
        <div class="menu-card">
          <div class="menu-card-top">
            <span class="menu-card-name">${esc(m.name)}</span>
            <span class="menu-card-price">${esc(m.price)}</span>
          </div>
          <p class="menu-card-desc">${escMultiline(m.desc)}</p>
        </div>`).join('')
    : `<p class="menu-empty">メニュー情報は準備中です。</p>`;

  const gallerySection = galleryImages.length ? `
  <section id="gallery">
    <p class="section-label">Gallery</p>
    <h2 class="section-title">ギャラリー</h2>
    <div class="gallery-grid">
      ${galleryImages.map((src) => `<div class="gallery-item"><img src="${esc(src)}" alt="${esc(storeName)}の写真" loading="lazy"></div>`).join('')}
    </div>
  </section>` : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(storeName)}${catchCopy ? `｜${esc(catchCopy)}` : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: ${theme.bg};
  --surface: ${theme.surface};
  --primary: ${theme.primary};
  --accent: ${theme.accent};
  --text: ${theme.text};
  --muted: ${theme.muted};
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: ${theme.font}, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.8;
}
header {
  text-align: center;
  padding: 6rem 1.5rem;
  background: var(--surface);
  ${heroImage ? `background-image: linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url('${esc(heroImage)}');
  background-size: cover;
  background-position: center;` : ''}
}
.header-icon { font-size: 3rem; margin-bottom: 1rem; }
.header-name {
  font-size: clamp(2rem, 6vw, 3.2rem);
  font-weight: 700;
  letter-spacing: .08em;
  margin-bottom: .8rem;
  color: ${heroImage ? '#fff' : 'var(--primary)'};
}
.header-copy {
  font-size: 1rem;
  color: ${heroImage ? '#f0ece4' : 'var(--muted)'};
  letter-spacing: .05em;
}
nav {
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 1.2rem;
  background: var(--bg);
  border-bottom: 1px solid var(--surface);
  position: sticky; top: 0; z-index: 10;
}
nav a {
  color: var(--text);
  text-decoration: none;
  font-size: .82rem;
  letter-spacing: .15em;
  text-transform: uppercase;
}
nav a:hover { color: var(--primary); }
main { max-width: 880px; margin: 0 auto; padding: 0 1.5rem; }
section { padding: 4.5rem 0; border-bottom: 1px solid var(--surface); }
section:last-of-type { border-bottom: none; }
.section-label {
  font-size: .7rem; letter-spacing: .35em; text-transform: uppercase;
  color: var(--accent); margin-bottom: .8rem;
}
.section-title {
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 700; margin-bottom: 1.6rem;
}
.concept-body { color: var(--muted); white-space: pre-line; }
.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.2rem;
}
.menu-card {
  background: var(--surface);
  border-radius: 10px;
  padding: 1.4rem 1.6rem;
}
.menu-card-top {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 1rem; margin-bottom: .6rem;
}
.menu-card-name { font-weight: 700; font-size: 1rem; }
.menu-card-price { color: var(--primary); font-weight: 700; white-space: nowrap; }
.menu-card-desc { font-size: .85rem; color: var(--muted); }
.menu-empty { color: var(--muted); font-size: .9rem; }
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}
.gallery-item {
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface);
}
.gallery-item img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.hours-table { width: 100%; border-collapse: collapse; max-width: 360px; }
.hours-table td { padding: .6rem 0; border-bottom: 1px solid var(--surface); font-size: .9rem; }
.hours-table td:last-child { text-align: right; font-weight: 700; color: var(--primary); }
.hours-table tr.closed td:last-child { color: var(--muted); font-weight: 400; }
.access-info { margin-top: 2rem; font-size: .9rem; color: var(--muted); }
.access-info strong { color: var(--text); }
footer {
  text-align: center; padding: 3rem 1.5rem;
  background: var(--surface); color: var(--muted); font-size: .8rem;
}
footer a { color: var(--primary); text-decoration: none; font-weight: 700; }
@media (max-width: 600px) {
  nav { gap: 1rem; flex-wrap: wrap; }
  section { padding: 3rem 0; }
}
</style>
</head>
<body>

<nav>
  <a href="#concept">コンセプト</a>
  <a href="#menu">メニュー</a>
  ${galleryImages.length ? `<a href="#gallery">ギャラリー</a>` : ''}
  <a href="#access">アクセス</a>
</nav>

<header>
  <div class="header-icon">${theme.icon}</div>
  <h1 class="header-name">${esc(storeName)}</h1>
  ${catchCopy ? `<p class="header-copy">${esc(catchCopy)}</p>` : ''}
</header>

<main>
  <section id="concept">
    <p class="section-label">${theme.label}</p>
    <h2 class="section-title">コンセプト</h2>
    <p class="concept-body">${escMultiline(description) || '店舗の魅力やこだわりをここに記載します。'}</p>
  </section>

  <section id="menu">
    <p class="section-label">Menu</p>
    <h2 class="section-title">メニュー</h2>
    <div class="menu-grid">
      ${menuCards}
    </div>
  </section>
${gallerySection}
  <section id="access">
    <p class="section-label">Access</p>
    <h2 class="section-title">営業時間・アクセス</h2>
    <table class="hours-table">
      ${hoursRows}
    </table>
    <div class="access-info">
      ${address ? `<p><strong>住所：</strong>${esc(address)}</p>` : ''}
      ${phone ? `<p><strong>TEL：</strong><a href="tel:${esc(phone)}" style="color:var(--primary)">${esc(phone)}</a></p>` : ''}
    </div>
  </section>
</main>

<footer>
  ${instagramUrl ? `<p style="margin-bottom:.6rem"><a href="${esc(instagramUrl)}" target="_blank" rel="noopener">Instagram →</a></p>` : ''}
  <p>© ${esc(storeName)} ｜ Produced by みーなグルメ</p>
</footer>

</body>
</html>
`;
}
