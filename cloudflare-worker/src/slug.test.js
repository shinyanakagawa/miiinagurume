import { describe, it, expect } from 'vitest';
import { extractSlugFromHost } from './slug.js';

const ROOT = 'miiinagurume.com';

describe('extractSlugFromHost', () => {
  it('店舗サブドメインからslugを抽出する', () => {
    expect(extractSlugFromHost('bistro-miina.miiinagurume.com', ROOT)).toBe('bistro-miina');
  });

  it('ルートドメイン自体はnullを返す', () => {
    expect(extractSlugFromHost('miiinagurume.com', ROOT)).toBeNull();
  });

  it('appサブドメインはnullを返す', () => {
    expect(extractSlugFromHost('app.miiinagurume.com', ROOT)).toBeNull();
  });

  it('別ドメインはnullを返す', () => {
    expect(extractSlugFromHost('example.com', ROOT)).toBeNull();
  });

  it('複数階層のサブドメインはnullを返す', () => {
    expect(extractSlugFromHost('foo.bar.miiinagurume.com', ROOT)).toBeNull();
  });

  it('wwwサブドメインからもslugとして抽出される（予約済みではないため）', () => {
    expect(extractSlugFromHost('www.miiinagurume.com', ROOT)).toBe('www');
  });
});
