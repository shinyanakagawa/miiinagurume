import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { sanitizeFilename } from './index.js';

const outputDir = path.resolve('generated-images');

test('正常なファイル名は outputDir 内の絶対パスを返す', () => {
  const result = sanitizeFilename('cafe_hero.png', outputDir);
  assert.equal(result, path.join(outputDir, 'cafe_hero.png'));
});

test('Path Traversalを含むファイル名は null を返す', () => {
  assert.equal(sanitizeFilename('../../../etc/passwd', outputDir), null);
});

test('スラッシュを含むファイル名は basename のみ使われる', () => {
  const result = sanitizeFilename('sub/dir/image.png', outputDir);
  assert.equal(result, path.join(outputDir, 'image.png'));
});

test('許可文字以外を含むファイル名は null を返す', () => {
  assert.equal(sanitizeFilename('image;rm -rf.png', outputDir), null);
  assert.equal(sanitizeFilename('<script>.png', outputDir), null);
});

test('空文字・未指定は null を返す', () => {
  assert.equal(sanitizeFilename('', outputDir), null);
  assert.equal(sanitizeFilename(undefined, outputDir), null);
});
