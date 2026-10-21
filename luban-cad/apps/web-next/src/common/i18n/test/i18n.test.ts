// src/common/i18n/test/i18n.test.ts
import { describe, expect, it } from 'vitest';
import { changeAppLanguage, initI18n } from '../index.js';

describe('i18n 骨架', () => {
  it('默认 zh-CN，键命中', async () => {
    const i18n = await initI18n();
    expect(i18n.language).toBe('zh-CN');
    expect(i18n.t('common.app.name')).toBe('鲁班CAD');
  });
  it('切换 en 并持久化', async () => {
    const i18n = await initI18n();
    await changeAppLanguage('en');
    expect(i18n.t('common.app.name')).toBe('LubanCAD');
    expect(localStorage.getItem('luban-next-lang')).toBe('en');
  });
  it('en 词库与 zh-CN 键集一致（键奇偶守卫）', async () => {
    const zh = (await import('../locales/zh-CN/common.json')).default;
    const en = (await import('../locales/en/common.json')).default;
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });
});
