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

  it('真实键中英双落（缺失键不炸，返回键路径）', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('notFound.title')).toBe('404 - Page Not Found');
    // 真缺失键：不抛错、返回键路径本身（returnEmptyString=false 下的保底行为）
    expect(i18n.t('common.definitely.missing')).toBe('common.definitely.missing');
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('notFound.title')).toBe('404 - 页面不存在');
  });

  it('auth 命名空间键命中（429 限流文案，Sync F2）', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('login.error.rateLimited', { ns: 'auth' })).toBe('尝试过于频繁，请稍后再试');
    expect(i18n.t('login.error.rateLimitedWithRetry', { ns: 'auth', minutes: 10 })).toBe(
      '尝试过于频繁，请 10 分钟后再试',
    );
    await i18n.changeLanguage('en');
    expect(i18n.t('login.error.rateLimited', { ns: 'auth' })).toBe('Too many attempts. Please try again later.');
  });

  it('auth 命名空间：登录页文案键命中（zh/en，e2e 中文锚点）', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('login.title', { ns: 'auth' })).toBe('欢迎回来');
    expect(i18n.t('login.email', { ns: 'auth' })).toBe('电子邮箱');
    expect(i18n.t('login.password', { ns: 'auth' })).toBe('密码');
    expect(i18n.t('login.submit', { ns: 'auth' })).toBe('登录');
    expect(i18n.t('login.register', { ns: 'auth' })).toBe('立即注册');
    await i18n.changeLanguage('en');
    expect(i18n.t('login.title', { ns: 'auth' })).toMatch(/Welcome back/i);
    expect(i18n.t('login.email', { ns: 'auth' })).toMatch(/Email/i);
    expect(i18n.t('login.password', { ns: 'auth' })).toMatch(/Password/i);
    expect(i18n.t('login.submit', { ns: 'auth' })).toMatch(/Sign In|Log in/i);
    expect(i18n.t('login.register', { ns: 'auth' })).toMatch(/Register/i);
    await i18n.changeLanguage('zh-CN');
  });

  it('auth 命名空间：注册页文案键命中（zh/en）', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('register.title', { ns: 'auth' })).toBe('创建账户');
    expect(i18n.t('register.name', { ns: 'auth' })).toBe('姓名');
    expect(i18n.t('register.confirmPassword', { ns: 'auth' })).toBe('确认密码');
    expect(i18n.t('register.submit', { ns: 'auth' })).toBe('创建账户');
    expect(i18n.t('register.validation.mismatch', { ns: 'auth' })).toBe('两次输入的密码不一致');
    expect(i18n.t('register.strength.strong', { ns: 'auth' })).toBe('强');
    expect(i18n.t('register.success.title', { ns: 'auth' })).toBe('注册成功！');
    await i18n.changeLanguage('en');
    expect(i18n.t('register.title', { ns: 'auth' })).toMatch(/Create/i);
    expect(i18n.t('register.name', { ns: 'auth' })).toMatch(/Name/i);
    expect(i18n.t('register.strength.strong', { ns: 'auth' })).toMatch(/Strong/i);
    await i18n.changeLanguage('zh-CN');
  });

  it('auth 命名空间：忘记密码页文案键命中（zh/en）', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('forgotPassword.title', { ns: 'auth' })).toBe('忘记密码');
    expect(i18n.t('forgotPassword.submit', { ns: 'auth' })).toBe('发送重置链接');
    expect(i18n.t('forgotPassword.success.sentTo', { ns: 'auth', email: 'a@b.c' })).toBe(
      '重置密码链接已发送至 a@b.c',
    );
    await i18n.changeLanguage('en');
    expect(i18n.t('forgotPassword.title', { ns: 'auth' })).toMatch(/Forgot/i);
    expect(i18n.t('forgotPassword.submit', { ns: 'auth' })).toMatch(/Reset/i);
    await i18n.changeLanguage('zh-CN');
  });

  it('auth 命名空间：UserContext 错误码映射键命中（zh/en）', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('error.invalidCredentials', { ns: 'auth' })).toBe('邮箱或密码错误');
    expect(i18n.t('error.accountDisabled', { ns: 'auth' })).toBe('账户已被禁用');
    expect(i18n.t('error.emailNotRegistered', { ns: 'auth' })).toBe('该邮箱未注册，请先注册账户');
    expect(i18n.t('error.serverUnavailable', { ns: 'auth' })).toBe('服务器暂时不可用，请稍后重试');
    expect(i18n.t('error.loginFailed', { ns: 'auth' })).toBe('登录失败，请稍后重试');
    expect(i18n.t('error.network', { ns: 'auth' })).toBe('网络连接失败，请检查网络设置');
    expect(i18n.t('error.emailExists', { ns: 'auth' })).toBe('该邮箱已被注册，请使用其他邮箱或直接登录');
    expect(i18n.t('error.logoutFailed', { ns: 'auth' })).toBe('退出失败');
    await i18n.changeLanguage('en');
    expect(i18n.t('error.invalidCredentials', { ns: 'auth' })).toMatch(/email.*password|incorrect/i);
    expect(i18n.t('error.emailExists', { ns: 'auth' })).toMatch(/already registered|in use/i);
    await i18n.changeLanguage('zh-CN');
  });

  it('auth 命名空间：品牌侧栏键命中 + 特性行插值（zh/en）', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('brand.name', { ns: 'auth' })).toBe('鲁班CAD');
    expect(i18n.t('brand.tagline', { ns: 'auth' })).toBe('基于 iTwin.js 的开源云端 CAD 平台');
    expect(i18n.t('brand.features.free', { ns: 'auth' })).toBe('完全免费，开源透明');
    expect(i18n.t('brand.features.security', { ns: 'auth' })).toBe('企业级数据安全');
    await i18n.changeLanguage('en');
    expect(i18n.t('brand.name', { ns: 'auth' })).toBe('LubanCAD');
    expect(i18n.t('brand.tagline', { ns: 'auth' })).toMatch(/iTwin\.js/i);
    await i18n.changeLanguage('zh-CN');
  });

  it('auth 命名空间：SSO 按钮位键命中（zh/en）', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('sso.or', { ns: 'auth' })).toBe('或');
    expect(i18n.t('sso.googleContinue', { ns: 'auth' })).toBe('使用 Google 账号继续');
    await i18n.changeLanguage('en');
    expect(i18n.t('sso.googleContinue', { ns: 'auth' })).toMatch(/Google/i);
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
