// src/common/i18n/test/i18n.test.ts
import { describe, expect, it } from 'vitest';
import { changeAppLanguage, initI18n } from '../index.js';

/** 展平键集（Task 1 口径）：嵌套对象递归为点路径，供 zh/en 深比较与存在性断言。 */
const flatten = (obj: unknown, prefix = ''): string[] =>
  Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`]);

/** 三个路由页 t('auth.*') 实际取用的键集（与 SignInRoute/SignUpRoute/
 * ForgotPasswordRoute 逐条对账；漏任一即渲染裸键名）。 */
const REQUIRED_AUTH_KEYS = {
  // AuthFormField 密码可见切换钮 aria 文案（终审 M-a i18n 化后挂账守卫）。
  form: [
    'form.showPassword', 'form.hidePassword',
  ],
  signIn: [
    'signIn.title', 'signIn.subtitle',
    'signIn.emailLabel', 'signIn.emailRequired', 'signIn.emailInvalid',
    'signIn.passwordLabel', 'signIn.passwordRequired',
    'signIn.rememberMe', 'signIn.forgotPassword',
    'signIn.submit', 'signIn.submitting',
    'signIn.tooManyRequests', 'signIn.noAccount', 'signIn.register',
    'signIn.heroTitle', 'signIn.heroSubtitle',
    'signIn.heroTokenHub', 'signIn.heroTokenReady', 'signIn.heroTokenNote',
  ],
  signUp: [
    'signUp.title', 'signUp.subtitle',
    'signUp.firstNameLabel', 'signUp.firstNameRequired',
    'signUp.lastNameLabel', 'signUp.lastNameRequired',
    'signUp.emailLabel', 'signUp.emailRequired', 'signUp.emailInvalid',
    'signUp.passwordLabel', 'signUp.passwordRequired',
    'signUp.confirmPasswordLabel', 'signUp.confirmPasswordRequired', 'signUp.mismatch',
    'signUp.termsLabel', 'signUp.termsRequired',
    'signUp.submit', 'signUp.submitting',
    'signUp.tooManyRequests', 'signUp.haveAccount', 'signUp.signIn',
    'signUp.strength.tooShort', 'signUp.strength.weak', 'signUp.strength.medium',
    'signUp.strength.strong', 'signUp.strength.veryStrong',
    'signUp.heroTitle', 'signUp.heroSubtitle',
    'signUp.heroTokenHub', 'signUp.heroTokenReady', 'signUp.heroTokenNote',
  ],
  forgot: [
    'forgot.title', 'forgot.subtitle',
    'forgot.emailLabel', 'forgot.emailRequired', 'forgot.emailInvalid',
    'forgot.submit', 'forgot.submitting',
    'forgot.success', 'forgot.error', 'forgot.tooManyRequests', 'forgot.backToLogin',
    'forgot.heroTitle', 'forgot.heroSubtitle',
    'forgot.heroTokenHub', 'forgot.heroTokenReady', 'forgot.heroTokenNote',
  ],
} as const;

/** AuthSession / ApiClientError 以 i18nKey 引用的 common.errors 键。 */
const REQUIRED_ERROR_KEYS = [
  'errors.loginFailed',
  'errors.registerFailed',
  'errors.forgotPasswordFailed',
  'errors.sessionExpired',
  'errors.apiRequestFailed',
] as const;

/** DocumentsPage（Task 5）实际取用的 documents.* 键集——与
 * modules/documents 组件逐条对账；漏任一即渲染裸键名。 */
const REQUIRED_DOCUMENT_KEYS = [
  'userMenu.open', 'userMenu.account', 'userMenu.darkMode', 'userMenu.logout',
  'filters.recent', 'filters.favorites', 'filters.my', 'filters.shared', 'filters.public',
  'createMenu.button', 'createMenu.newDocument', 'createMenu.newFolder',
  'createMenu.importFile', 'createMenu.importFrom', 'createMenu.labelTag',
  'capability.title', 'capability.confirm',
  'section.count', 'section.searchResults',
  'actions.refresh', 'actions.retry', 'actions.clearSearch', 'actions.open', 'actions.details',
  'actions.rename', 'actions.favorite', 'actions.unfavorite', 'actions.share', 'actions.delete',
  'search.placeholder', 'search.noResults', 'search.noResultsHint',
  'empty.myTitle', 'empty.myDescription',
  'states.loading', 'states.errorTitle', 'states.unnamed', 'states.noDate',
  'view.tile', 'view.table',
  'table.name', 'table.owner', 'table.role', 'table.createdAt', 'table.modifiedAt', 'table.rowActions',
  'info.title', 'info.owner', 'info.role', 'info.createdAt', 'info.modifiedAt',
  'info.description', 'info.noDescription',
  'deleteDialog.title', 'deleteDialog.message', 'deleteDialog.cancel', 'deleteDialog.confirm',
  'create.title', 'create.nameLabel', 'create.nameRequired', 'create.submit', 'create.cancel',
  'rename.title', 'rename.nameLabel', 'rename.submit', 'rename.cancel',
  'sort.label', 'sort.name', 'sort.modifiedAt', 'sort.createdAt', 'sort.ascending', 'sort.descending',
  'shareDialog.title', 'shareDialog.close',
  'shareDialog.tabs.members', 'shareDialog.tabs.invite', 'shareDialog.tabs.link',
] as const;

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
    const zh = (await import('../locales/zh-CN/common.json')).default;
    const en = (await import('../locales/en/common.json')).default;
    expect(flatten(en).sort()).toEqual(flatten(zh).sort());
  });
  // M1 Task 3 起：auth 最小词库（完整词表 Task 7 补全），键集一致性同口径约束。
  it('auth 词库 en 与 zh-CN 键集一致（展平深比较）', async () => {
    const zh = (await import('../locales/zh-CN/auth.json')).default;
    const en = (await import('../locales/en/auth.json')).default;
    expect(flatten(en).sort()).toEqual(flatten(zh).sort());
  });
  // M1 Task 7：auth 命名空间奇偶 + 三页面块键存在性（路由 t('auth.*') 全量对账）。
  it('auth 命名空间：zh/en 键奇偶且关键键存在', async () => {
    const zh = (await import('../locales/zh-CN/auth.json')).default;
    const en = (await import('../locales/en/auth.json')).default;
    const zhKeys = flatten(zh).sort();
    expect(flatten(en).sort()).toEqual(zhKeys);
    const required = [
      ...REQUIRED_AUTH_KEYS.form,
      ...REQUIRED_AUTH_KEYS.signIn,
      ...REQUIRED_AUTH_KEYS.signUp,
      ...REQUIRED_AUTH_KEYS.forgot,
    ];
    for (const key of required) {
      // auth.json 根即 auth 块（i18n/index.ts 挂 translation.auth 下），
      // 展平键不带 auth. 前缀；路由侧 t('auth.<key>') 对应词库键 <key>。
      expect(zhKeys, `auth.${key} 应在 zh-CN auth.json 中存在`).toContain(key);
    }
    // tooManyRequests 的 {{seconds}} 插值在双语下均可渲染（429 语义验收依赖）。
    const i18n = await initI18n();
    await changeAppLanguage('zh-CN');
    expect(i18n.t('auth.signIn.tooManyRequests', { seconds: 30 })).toContain('30');
    await changeAppLanguage('en');
    expect(i18n.t('auth.signUp.tooManyRequests', { seconds: 30 })).toContain('30');
    await changeAppLanguage('zh-CN');
  });
  // M1 Task 7：AuthSession/ApiClientError 以 i18nKey 引用的 common.errors 键
  // 在双语词库中均存在（T4/T5 评审挂账项）。
  it('common.errors：i18nKey 引用键存在（zh/en）', async () => {
    const zh = (await import('../locales/zh-CN/common.json')).default;
    const en = (await import('../locales/en/common.json')).default;
    const zhKeys = flatten(zh).sort();
    const enKeys = flatten(en).sort();
    for (const key of REQUIRED_ERROR_KEYS) {
      // common.json 根即 common 块，展平键不带 common. 前缀。
      expect(zhKeys, `common.${key} 应在 zh-CN common.json 中存在`).toContain(key);
      expect(enKeys, `common.${key} 应在 en common.json 中存在`).toContain(key);
    }
  });
  // M2 Task 5：documents 词库（中心页）键集一致性 + 页面取用键存在性。
  it('documents 词库：zh/en 键奇偶且页面取用键存在', async () => {
    const zh = (await import('../locales/zh-CN/documents.json')).default;
    const en = (await import('../locales/en/documents.json')).default;
    const zhKeys = flatten(zh).sort();
    expect(flatten(en).sort()).toEqual(zhKeys);
    for (const key of REQUIRED_DOCUMENT_KEYS) {
      // documents.json 根即 documents 块（挂 translation.documents 下），
      // 展平键不带 documents. 前缀；组件侧 t('documents.<key>') 对应词库键 <key>。
      expect(zhKeys, `documents.${key} 应在 zh-CN documents.json 中存在`).toContain(key);
    }
    // section.count 的 {{count}} 插值在双语下均可渲染（分区计数验收依赖）。
    const i18n = await initI18n();
    await changeAppLanguage('zh-CN');
    expect(i18n.t('documents.section.count', { count: 2 })).toContain('2');
  });
});
