import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, renderSiteHTML } from './template-renderer.js';

test('https URLはそのまま返す', () => {
  assert.equal(safeUrl('https://instagram.com/example'), 'https://instagram.com/example');
});

test('http URLはそのまま返す', () => {
  assert.equal(safeUrl('http://example.com'), 'http://example.com');
});

test('javascript: スキームは空文字になる', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
});

test('data: スキームは空文字になる', () => {
  assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '');
});

test('空・未定義は空文字になる', () => {
  assert.equal(safeUrl(''), '');
  assert.equal(safeUrl(undefined), '');
});

test('前後の空白を許容してhttpsと判定する', () => {
  assert.equal(safeUrl('  https://instagram.com/example  '), 'https://instagram.com/example');
});

const SITE_WITH_PHONE = {
  theme: 'cafe',
  slug: 'test-shop',
  data: { store_name: 'テスト店', phone: '03-1234-5678' },
};

test('通常モードの予約フォームは本番のNetlify Functionへ送信する', () => {
  const html = renderSiteHTML(SITE_WITH_PHONE);
  assert.match(html, /fetch\('\/\.netlify\/functions\/send-reservation'/);
  assert.doesNotMatch(html, /プレビューのため実際には送信されません/);
});

test('preview:true の予約フォームは本番のNetlify Functionへ送信しない', () => {
  const html = renderSiteHTML(SITE_WITH_PHONE, { preview: true });
  assert.doesNotMatch(html, /fetch\('\/\.netlify\/functions\/send-reservation'/);
  assert.match(html, /プレビューのため実際には送信されません/);
});

test('optionsを省略した場合は通常モード（後方互換）', () => {
  const html = renderSiteHTML(SITE_WITH_PHONE);
  assert.match(html, /id="reservation-form"/);
  assert.match(html, /fetch\('\/\.netlify\/functions\/send-reservation'/);
});
