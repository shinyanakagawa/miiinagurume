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
      ${item.image ? `<img src="${esc(safeUrl(item.image))}" alt="${esc(item.name)}" loading="lazy">` : ''}
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

function renderReviews(reviews = [], data = {}) {
  const valid = reviews.filter(r => r && (r.comment || r.name));
  if (!valid.length && !data.address) return '';

  const mapLink = data.address ? `
  <div style="text-align:center;margin-top:1.5rem">
    <a href="https://maps.google.com/?q=${encodeURIComponent(data.address)}" class="site-cta" style="display:inline-flex" target="_blank" rel="noopener">★ Googleマップで全レビューを見る</a>
  </div>` : '';

  if (!valid.length) {
    return `
  <section class="site-section" id="reviews">
    <span class="site-section-label">VOICE</span>
    <h2 class="site-section-title">お客様の声</h2>
    ${mapLink}
  </section>`;
  }

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
    ${mapLink}
  </section>`;
}

// turnstileSiteKey が設定されている場合のみ、Cloudflare Turnstileの公式スクリプトを
// 読み込む（<head>用）。未設定の店舗では3rd-partyスクリプトを読み込まない。
function renderTurnstileScriptTag(turnstileSiteKey) {
  if (!turnstileSiteKey) return '';
  return `
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
}

// 予約フォーム（汎用Netlify Function /.netlify/functions/send-reservation 宛）。
// data.phone が無い店舗では予約導線自体を出さない既存規約（ヘッダーCTA・
// フローティングボタンと同じ判定）に合わせる。
function renderReservationForm(data, slug, turnstileSiteKey) {
  if (!data.phone) return '';
  return `
  <section class="site-section" id="reservation">
    <span class="site-section-label">CONTACT</span>
    <h2 class="site-section-title">ご予約・お問い合わせ</h2>
    ${data.phone ? `<p style="text-align:center;margin-bottom:1.5rem"><a href="${telHref(data.phone)}" class="site-tel-big">${esc(data.phone)}</a></p>` : ''}
    <form id="reservation-form" class="site-reservation-form">
      <input type="hidden" name="slug" value="${esc(slug)}">
      <div class="site-form-row">
        <div class="site-form-group">
          <label for="reservation-name">お名前</label>
          <input type="text" id="reservation-name" name="name" required>
        </div>
        <div class="site-form-group">
          <label for="reservation-tel">電話番号</label>
          <input type="tel" id="reservation-tel" name="tel" required>
        </div>
      </div>
      <div class="site-form-row">
        <div class="site-form-group">
          <label for="reservation-date">日付</label>
          <input type="date" id="reservation-date" name="date" required>
        </div>
        <div class="site-form-group">
          <label for="reservation-time">時間</label>
          <input type="time" id="reservation-time" name="time" required>
        </div>
        <div class="site-form-group">
          <label for="reservation-pax">人数</label>
          <input type="number" id="reservation-pax" name="pax" min="1" required>
        </div>
      </div>
      <input type="text" name="website" id="hp-field" autocomplete="off" tabindex="-1" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true">
      ${turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}"></div>` : ''}
      <button type="submit" class="site-cta site-form-submit">この内容で予約する</button>
    </form>
    <p id="reservation-status" class="site-form-status"></p>
  </section>`;
}

// 予約フォーム送信処理（body末尾に追加で出力する文字列。
// #reservation-form が存在しない場合は何もしない）。
function renderReservationFormScript() {
  return `
<script>
(function () {
  var form = document.getElementById('reservation-form');
  if (!form) return;
  var statusEl = document.getElementById('reservation-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) statusEl.textContent = '送信中...';
    try {
      var formData = new FormData(form);
      var payload = Object.fromEntries(formData.entries());
      var res = await fetch('/.netlify/functions/send-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (statusEl) statusEl.textContent = 'ご予約を受け付けました。確認のご連絡をお待ちください。';
        form.reset();
      } else {
        if (statusEl) statusEl.textContent = '送信に失敗しました。お電話でお問い合わせください。';
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '送信に失敗しました。お電話でお問い合わせください。';
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})();
</script>`;
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

// ============================================================
// PostHog 訪問者解析（公開HP/site.html 側の追加スコープ）
// ------------------------------------------------------------
// 既存の `データ連携担当/参考資料/2026-06-20-posthog-analytics-plan.md` は
// 管理画面（index.html / dashboard.html / editor.html）のみが対象だったが、
// ここでは公開HP（site.html が renderSiteHTML() の出力を document.write する）
// 側の訪問者解析を追加スコープとして実装する。
//
// 重要: 匿名トラッキングのみ。サイト訪問者は店舗オーナーのアプリアカウント
// （Supabase Auth の user_id）とは無関係の一般客なので、posthog.identify()
// は呼ばない（PostHogのデフォルトの匿名 distinct_id のみを使う）。
//
// APIキーはまだ実際のPostHogプロジェクトが存在しないためプレースホルダ
// （'YOUR_POSTHOG_API_KEY'）。既存のTurnstile site keyプレースホルダ
// （'YOUR_TURNSTILE_SITE_KEY'）と同様の扱い。
// 実際にPostHogプロジェクトを作成しAPIキーを取得した後、下記
// POSTHOG_API_KEY の値を 'phc_xxx' 形式の実キーに置き換えること。
// ============================================================
const POSTHOG_API_KEY = 'YOUR_POSTHOG_API_KEY';
const POSTHOG_HOST = 'https://us.i.posthog.com'; // EUリージョンの場合は https://eu.i.posthog.com に変更

/**
 * site.html が出力するHTMLの</head>直前に挿入するPostHog snippetを生成する。
 * 計測イベントは最小限に絞る:
 *   - $pageview（PostHog SDKが自動収集）
 *   - tel_link_click（tel:リンクのクリック。電話番号タップ計測）
 *   - reservation_form_submit（予約フォーム送信。#reservation-form が
 *     存在する場合のみ発火。汎用テンプレートに予約フォームが未実装の
 *     現状ではフォームが無いため発火しないが、将来追加された際に
 *     そのまま動作するよう先行実装する）
 *   - map_open_click（Googleマップを開くリンクのクリック）
 *
 * 公式snippetの読み込みに失敗してもページ表示自体は壊さないよう、
 * <script>タグはbody末尾に置き、PostHog SDK初期化失敗時も
 * try/catchで握りつぶす。
 */
export function renderAnalyticsSnippet() {
  return `
<script>
(function () {
  try {
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.uploaded_to_v2||t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('${POSTHOG_API_KEY}', {
      api_host: '${POSTHOG_HOST}',
      person_profiles: 'identified_only', // 匿名訪問者はPersonプロファイルを作らない（店主アカウントとは紐付けない）
      autocapture: false // 必要なイベントのみ明示的にcaptureする
    });

    document.addEventListener('click', function (e) {
      var telLink = e.target.closest('a[href^="tel:"]');
      if (telLink) {
        posthog.capture('tel_link_click');
        return;
      }
      var mapLink = e.target.closest('a[href*="maps.google.com"], a[href*="google.com/maps"]');
      if (mapLink) {
        posthog.capture('map_open_click');
      }
    });

    var reservationForm = document.getElementById('reservation-form');
    if (reservationForm) {
      reservationForm.addEventListener('submit', function () {
        posthog.capture('reservation_form_submit');
      });
    }
  } catch (err) {
    // PostHog読み込み失敗時もページ表示自体には影響させない
    console.warn('analytics snippet failed to initialize', err);
  }
})();
</script>`;
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
 * site = { slug, theme, status, data, turnstile_site_key }
 * data = {
 *   store_name, logo_text, genre, catch_copy, description,
 *   hero_image, address, phone, hours, closed_days, station,
 *   seats, budget, menu_items[] (各要素は { name, price, description, image }),
 *   gallery_images[],
 *   special_title, special_body, reviews[], sns_instagram,
 *   weekly_hours[] (任意・後方互換: 未設定なら hours の文字列のみ表示)
 *     weekly_hours の各要素: { day: 0-6 (0=月...6=日), open: 'HH:MM', close: 'HH:MM', closed: boolean }
 * }
 * site.slug / site.turnstile_site_key は予約フォーム（renderReservationForm）で使用する。
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
<link rel="stylesheet" href="css/themes.css">${renderHeadMeta(data, storeName, genre)}${renderTurnstileScriptTag(site.turnstile_site_key)}
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
${renderReviews(data.reviews, data)}
${renderReservationForm(data, site.slug || '', site.turnstile_site_key || '')}
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
${renderReservationFormScript()}
${renderAnalyticsSnippet()}

</body>
</html>`;
}
