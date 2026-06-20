import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl } from './template-renderer.js';

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
