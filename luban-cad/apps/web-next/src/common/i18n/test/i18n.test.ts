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
  it('en 词库与 zh-CN 键集一致（展平深比较）', async () => {
    const flatten = (obj: unknown, prefix = ''): string[] =>
      Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
          ? flatten(v, `${prefix}${k}.`)
          : [`${prefix}${k}`]);
    const zh = (await import('../locales/zh-CN/common.json')).default;
    const en = (await import('../locales/en/common.json')).default;
    expect(flatten(en).sort()).toEqual(flatten(zh).sort());
  });
  // M1 Task 3 起：auth 最小词库（完整词表 Task 7 补全），键集一致性同口径约束。
  it('auth 词库 en 与 zh-CN 键集一致（展平深比较）', async () => {
    const flatten = (obj: unknown, prefix = ''): string[] =>
      Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
          ? flatten(v, `${prefix}${k}.`)
          : [`${prefix}${k}`]);
    const zh = (await import('../locales/zh-CN/auth.json')).default;
    const en = (await import('../locales/en/auth.json')).default;
    expect(flatten(en).sort()).toEqual(flatten(zh).sort());
  });
});
