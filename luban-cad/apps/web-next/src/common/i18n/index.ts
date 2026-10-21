import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en/common.json';
// M1 Task 3：auth 词库最小键集（auth.signIn.*，供 /login 页取用）。
// 与 common 同姿态挂在默认 ns translation 之下（键路径 auth.signIn.xxx，
// 见上方注释）；完整 auth 词表由 Task 7 补全。
import zhAuth from './locales/zh-CN/auth.json';
import enAuth from './locales/en/auth.json';

const LANG_KEY = 'luban-next-lang';

export type AppLanguage = 'zh-CN' | 'en';

function detectLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch { /* 忽略 */ }
  return navigator.language.startsWith('en') ? 'en' : 'zh-CN';
}

let instance: I18n | null = null;

export async function initI18n(): Promise<I18n> {
  if (instance) return instance;
  await i18next.use(initReactI18next).init({
    // 词桶挂默认命名空间 translation 之下（brief 原文为 { common: zhCommon }，
    // 即把 common 当命名空间——但测试以默认 ns 的点路径 t('common.app.name')
    // 取词，直接挂 ns 时取不到、原样返回键名）。挂 translation 下后
    // 'common.app.name' = ns translation + 资源路径 common→app→name，命中。
    resources: {
      'zh-CN': { translation: { common: zhCommon, auth: zhAuth } },
      en: { translation: { common: enCommon, auth: enAuth } },
    },
    lng: detectLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  });
  instance = i18next;
  return instance;
}

export async function changeAppLanguage(lang: AppLanguage): Promise<void> {
  await initI18n();
  await i18next.changeLanguage(lang);
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* 忽略 */ }
}

// （brief 之外的附加导出）同步就绪查询，供 AppProviders 首帧 gate 使用：
// 词库内联时 i18next.init 同步完成、isInitialized 立即为 true；而模块内
// instance 赋值发生在 await 之后（下一微任务），不能拿 instance 判就绪。
export function isI18nReady(): boolean {
  return i18next.isInitialized;
}
