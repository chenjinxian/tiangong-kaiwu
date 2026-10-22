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

/** DocumentDetailsPage（Task 6）实际取用的 documents.detail.* 键集——与
 * modules/document-details 组件逐条对账；漏任一即渲染裸键名。 */
const REQUIRED_DOCUMENT_DETAIL_KEYS = [
  'detail.breadcrumb.documents',
  'detail.status.active',
  'detail.meta.createdAt', 'detail.meta.updatedAt',
  'detail.imodelCount', 'detail.syncing', 'detail.syncingTitle',
  'detail.actions.createIModel',
  'detail.states.loading', 'detail.states.errorTitle', 'detail.states.errorDescription',
  'detail.states.retry', 'detail.states.back',
  'detail.create.title', 'detail.create.nameLabel', 'detail.create.nameRequired',
  'detail.create.descriptionLabel', 'detail.create.failed',
  'detail.card.open', 'detail.card.moreActions', 'detail.card.initialized',
  'detail.card.initializing', 'detail.card.noDescription', 'detail.card.untitled',
  'detail.card.deleteTitle', 'detail.card.deleteMessage',
  'detail.empty.title', 'detail.empty.description',
] as const;

/** SettingsPage（M2 Task 7）实际取用的 settings.* 键集——与
 * modules/settings 组件逐条对账；漏任一即渲染裸键名。 */
const REQUIRED_SETTINGS_KEYS = [
  'breadcrumb.back', 'breadcrumb.current',
  'userMenu.open', 'userMenu.account', 'userMenu.darkMode', 'userMenu.logout',
  'nav.sections.account', 'nav.sections.subscription', 'nav.sections.team',
  'nav.items.profile', 'nav.items.email', 'nav.items.preferences', 'nav.items.notifications',
  'nav.items.security', 'nav.items.devices', 'nav.items.applications', 'nav.items.integrations',
  'nav.items.developer', 'nav.items.subscription', 'nav.items.paymentOptions',
  'nav.items.paymentHistory', 'nav.items.team',
  'profile.title', 'profile.avatarHint', 'profile.changeAvatar', 'profile.removeAvatar',
  'profile.firstName', 'profile.lastName', 'profile.username', 'profile.nickname', 'profile.bio',
  'preferences.title', 'preferences.darkMode', 'preferences.language',
  'placeholder.title', 'placeholder.description',
] as const;

/** PartStudioPage（M3 Task 3）实际取用的 partStudio.* 键集——与
 * modules/part-studio 组件逐条对账；漏任一即渲染裸键名。 */
const REQUIRED_PART_STUDIO_KEYS = [
  'topBar.breadcrumb.documents',
  'topBar.branch.main',
  'topBar.share', 'topBar.help',
  'topBar.userMenu.open', 'topBar.userMenu.account',
  'topBar.userMenu.darkMode', 'topBar.userMenu.logout',
  'sidebar.railLabel',
  'sidebar.rail.features', 'sidebar.rail.parts',
  'sidebar.rail.assemblies', 'sidebar.rail.import',
  'sidebar.tree.features', 'sidebar.tree.parts',
  'sidebar.tree.emptyFeatures', 'sidebar.tree.defaultPart',
  'dock.tabs.toolSettings', 'dock.tabs.history', 'dock.tabs.display',
  'dock.placeholder',
  'tabs.fitView', 'tabs.newTab', 'tabs.partStudio',
  'status.connection', 'status.connecting', 'status.connected', 'status.connectionFailed',
  'status.editMode', 'status.editModePart',
  'status.units', 'status.unitMm',
  'status.viewType', 'status.viewIso',
  // M3 Task 4：ribbon/命令搜索/能力引导对话框 chrome 键——ribbon.tools.* 与
  // ribbon.items.*（27+44 条）由 ribbon-registry.test.ts 数据驱动守卫。
  'ribbon.toolbarLabel', 'ribbon.searchTools', 'ribbon.searchShortcut',
  'palette.title', 'palette.placeholder', 'palette.hint', 'palette.returnHint',
  'palette.close', 'palette.highlight', 'palette.empty',
  'capability.close',
  // M3 Task 6：草图模式变身 + 非模态对话框 chrome 键——ribbon.sketchTools.*
  // 与 sketchGroups.*（12+3 条）由 SketchDialog.test 数据驱动守卫。
  'ribbon.sketchToolbarLabel', 'ribbon.exitSketch',
  // M4 Task 3：工具注册编排失败通知（PartStudioPage 编排层，错误面必须可见）。
  'tools.registrationFailed',
  // M4 Task 4：顶栏右侧撤销/重做/保存三钮组（对齐 os-11）。
  'topBar.edit.undo', 'topBar.edit.redo', 'topBar.edit.save',
  'topBar.edit.saving', 'topBar.edit.saveFailed',
  'featureDialog.confirm', 'featureDialog.cancel',
  'featureDialog.resultTypeTabs', 'featureDialog.booleanScopeTabs',
  'featureDialog.entitiesLabel', 'featureDialog.fastPick',
  'featureDialog.rollbackLabel', 'featureDialog.finish',
  'featureDialog.help', 'featureDialog.helpText',
  'sketchDialog.defaultTitle', 'sketchDialog.confirm', 'sketchDialog.cancel',
  'sketchDialog.planeLabel', 'sketchDialog.planePlaceholder', 'sketchDialog.fastPick',
  'sketchDialog.optionsGroup', 'sketchDialog.history', 'sketchDialog.help',
  'sketchDialog.helpText',
  'sketch.constraintsOverlay',
  // M4 Task 5：特征系统中枢 hook（useFeatureSystem）applyOp 错误面键——
  // hook 回调内 i18next 直取（非组件 t()），漏键即渲染裸键名。
  'featureSystem.notConnected', 'featureSystem.leaseHeldBy', 'featureSystem.leaseAcquireFailed',
  // M3 Task 7：页签管理器（os-33）+ 汉堡文档菜单（os-24）chrome 键——
  // capabilities.*（20 条）由 capabilities.test.ts 数据驱动守卫。
  'tabManager.title', 'tabManager.listLabel', 'tabManager.shortcut',
  'tabManager.searchPlaceholder', 'tabManager.clear', 'tabManager.filterLabel',
  'tabManager.filters.all', 'tabManager.filters.partStudio',
  'tabManager.filters.assembly', 'tabManager.filters.tutorial',
  'tabManager.viewList', 'tabManager.viewGrid', 'tabManager.openAs',
  'tabManager.empty', 'tabManager.loading', 'tabManager.loadFailed', 'tabManager.retry',
  'tabManager.previewLabel', 'tabManager.noPreview', 'tabManager.close',
  'tabManager.kindLabels.partStudio', 'tabManager.kindLabels.assembly',
  'tabManager.kindLabels.tutorial',
  'documentMenu.open',
  'documentMenu.rename', 'documentMenu.move', 'documentMenu.details',
  'documentMenu.restoreWorkspace', 'documentMenu.copyWorkspace',
  'documentMenu.updateWorkspace', 'documentMenu.units',
  'documentMenu.workspaceProperties', 'documentMenu.viewOnly', 'documentMenu.editMode',
  'documentMenu.print', 'documentMenu.closeDocument',
  'documentMenu.unitsDialog.title', 'documentMenu.unitsDialog.unitsLabel',
  'documentMenu.unitsDialog.hint', 'documentMenu.unitsDialog.close',
  'documentMenu.unitsDialog.options.mm', 'documentMenu.unitsDialog.options.in',
  'documentMenu.unitsDialog.options.cm', 'documentMenu.unitsDialog.options.m',
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
  // M2 Task 6：documents.detail 词库（详情页）键集一致性 + 页面取用键存在性。
  it('documents.detail 词库：zh/en 键奇偶且详情页取用键存在', async () => {
    const zh = (await import('../locales/zh-CN/documents.json')).default;
    const en = (await import('../locales/en/documents.json')).default;
    const zhKeys = flatten(zh).sort();
    expect(flatten(en).sort()).toEqual(zhKeys);
    for (const key of REQUIRED_DOCUMENT_DETAIL_KEYS) {
      // documents.json 根即 documents 块（挂 translation.documents 下），
      // 展平键不带 documents. 前缀；组件侧 t('documents.<key>') 对应词库键 <key>。
      expect(zhKeys, `documents.${key} 应在 zh-CN documents.json 中存在`).toContain(key);
    }
    // imodelCount 的 {{count}} 插值在双语下均可渲染（hero 计数验收依赖）。
    const i18n = await initI18n();
    await changeAppLanguage('zh-CN');
    expect(i18n.t('documents.detail.imodelCount', { count: 2 })).toContain('2');
  });
  // M3 Task 3：part-studio 词库（编辑器壳）键集一致性 + 页面取用键存在性。
  it('part-studio 词库：zh/en 键奇偶且编辑器壳取用键存在', async () => {
    const zh = (await import('../locales/zh-CN/part-studio.json')).default;
    const en = (await import('../locales/en/part-studio.json')).default;
    const zhKeys = flatten(zh).sort();
    expect(flatten(en).sort()).toEqual(zhKeys);
    for (const key of REQUIRED_PART_STUDIO_KEYS) {
      // part-studio.json 根即 partStudio 块（挂 translation.partStudio 下），
      // 展平键不带 partStudio. 前缀；组件侧 t('partStudio.<key>') 对应词库键 <key>。
      expect(zhKeys, `partStudio.${key} 应在 zh-CN part-studio.json 中存在`).toContain(key);
    }
  });
  // M2 Task 7：settings 词库（设置页）键集一致性 + 页面取用键存在性。
  it('settings 词库：zh/en 键奇偶且设置页取用键存在', async () => {
    const zh = (await import('../locales/zh-CN/settings.json')).default;
    const en = (await import('../locales/en/settings.json')).default;
    const zhKeys = flatten(zh).sort();
    expect(flatten(en).sort()).toEqual(zhKeys);
    for (const key of REQUIRED_SETTINGS_KEYS) {
      // settings.json 根即 settings 块（挂 translation.settings 下），
      // 展平键不带 settings. 前缀；组件侧 t('settings.<key>') 对应词库键 <key>。
      expect(zhKeys, `settings.${key} 应在 zh-CN settings.json 中存在`).toContain(key);
    }
    // 复位默认语言（本用例的 changeAppLanguage 调用为后续测试保持 zh-CN 基线）。
    const i18n = await initI18n();
    await changeAppLanguage('zh-CN');
    expect(i18n.t('settings.nav.sections.account')).toBe('帐户');
  });
});
