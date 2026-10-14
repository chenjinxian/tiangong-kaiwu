import { describe, expect, it } from 'vitest';
import i18n, { LANGUAGE_STORAGE_KEY } from './index.js';

describe('i18n 骨架', () => {
  it('默认语言为 zh-CN', () => {
    expect(i18n.language.startsWith('zh')).toBe(true);
  });

  it('common 命名空间键命中（中文）', () => {
    expect(i18n.t('app.name')).toBe('鲁班CAD');
  });

  it('切换英文后键命中英文文案', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('app.name')).toBe('LubanCAD');
    await i18n.changeLanguage('zh-CN');
  });

  it('缺失键回落 zh-CN', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('common.onlyZh')).toBe('仅中文占位');
    await i18n.changeLanguage('zh-CN');
  });

  it('语言持久化键常量', () => {
    expect(LANGUAGE_STORAGE_KEY).toBe('luban-cad-lang');
  });
});
