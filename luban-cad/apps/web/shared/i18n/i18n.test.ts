import { describe, expect, it, vi } from 'vitest';

// jsdom 的 navigator.language/languages 恒为 en-US；i18n 实例在 import 时即初始化，
// 故须在模块求值前（vi.hoisted）把 navigator stub 为 zh-CN，
// 保证「默认语言 zh-CN」用例的确定性（spec：localStorage → navigator → zh-CN）。
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'language', { value: 'zh-CN', configurable: true });
  Object.defineProperty(window.navigator, 'languages', { value: ['zh-CN'], configurable: true });
});

import { createInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import i18n, { LANGUAGE_STORAGE_KEY } from './index.js';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en/common.json';

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

  it('navigator 首启探测：无缓存且 navigator=en-US 时首启解析为 en', async () => {
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true });
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true });
    localStorage.clear();
    const fresh = createInstance().use(LanguageDetector);
    await fresh.init({
      resources: {
        'zh-CN': { common: zhCommon },
        en: { common: enCommon },
      },
      defaultNS: 'common',
      fallbackLng: 'zh-CN',
      supportedLngs: ['zh-CN', 'en'],
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: [],
      },
      interpolation: { escapeValue: false },
      returnEmptyString: false,
    });
    expect(fresh.language.startsWith('en')).toBe(true);
  });
});
