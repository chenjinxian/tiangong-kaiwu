/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * i18n 骨架（P0 Task3）：i18next + react-i18next，资源打包内置（无运行时拉取）。
 * 语言优先级：localStorage(luban-cad-lang) → zh-CN（默认中文，不经 navigator 猜测，
 * 以保持产品默认语言确定性；nonExplicitSupportedLngs 也不启用，否则 zh-CN 会被
 * supportedLngs 归一化拒绝而破坏 fallback 链）。
 * 命名空间按页面/域划分：common/auth/documents/editor/settings（本任务仅建 common，
 * 各波次页面迁移时各自补 namespace 文件并注册到 resources）。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en/common.json';

export const LANGUAGE_STORAGE_KEY = 'luban-cad-lang';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { common: zhCommon },
      en: { common: enCommon },
    },
    defaultNS: 'common',
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en'],
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
