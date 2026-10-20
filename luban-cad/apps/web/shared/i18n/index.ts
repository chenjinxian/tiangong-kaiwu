/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * i18n 骨架（P0 Task3）：i18next + react-i18next，资源打包内置（无运行时拉取）。
 * 语言优先级：localStorage(luban-cad-lang) → navigator → zh-CN。
 * 注意：不启用 nonExplicitSupportedLngs——该选项会把 zh-CN 归一为语言部件 zh 后
 * 拒收 fallback 码，破坏 zh-CN 回落链（i18next 21.10 isSupportedCode 实证）。
 * 命名空间按页面/域划分：common/auth/documents/editor/settings（本任务仅建 common，
 * 各波次页面迁移时各自补 namespace 文件并注册到 resources）。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en/common.json';
import zhAuth from './locales/zh-CN/auth.json';
import enAuth from './locales/en/auth.json';
import zhDocuments from './locales/zh-CN/documents.json';
import enDocuments from './locales/en/documents.json';
import zhEditor from './locales/zh-CN/editor.json';
import enEditor from './locales/en/editor.json';

export const LANGUAGE_STORAGE_KEY = 'luban-cad-lang';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { common: zhCommon, auth: zhAuth, documents: zhDocuments, editor: zhEditor },
      en: { common: enCommon, auth: enAuth, documents: enDocuments, editor: enEditor },
    },
    defaultNS: 'common',
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
