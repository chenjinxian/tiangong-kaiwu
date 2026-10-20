/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * RW4-P5 中英四象限走查（亮/暗 × zh/en × 七页）。
 *
 * 与 `i18n-walkthrough.spec.ts`（公开页锚点 + 品牌色，独立 config 零登录）互补：
 * 本 spec 走主 config（依赖 setup 的 auth 产物），覆盖登录后的四页
 * （Documents / 项目详情 / Editor / Settings）并补公开页的暗色象限。
 *
 * 证据落 `.superpowers/sdd/2026-10-15-rw4-frontend-ia/p5-screenshots/`（工作区，不入库）。
 *
 * 语言/主题经 addInitScript 注入 localStorage（i18n 探测链 localStorage 优先；
 * ThemeProvider 同键读取），必须在本 test 的首次 goto 前注册——故用 beforeEach，
 * 不用顶层 test.use（文件级合并会互相覆盖，见 i18n-walkthrough 坑位记录）。
 *
 * en 象限附加 CJK 兜底：正文不得残留中文（种子项目名是数据，白名单剔除）。
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { loginWithSession, SEED_PROJECT_NAME } from './helpers';

const LANG_KEY = 'luban-cad-lang';
const THEME_KEY = 'luban-cad-theme';
const SHOT_DIR =
  process.env.P5_WALKTHROUGH_SHOT_DIR ||
  resolve(process.cwd(), '../../../.superpowers/sdd/2026-10-15-rw4-frontend-ia/p5-screenshots');

type Lang = 'zh-CN' | 'en';
type Theme = 'light' | 'dark';

const LANGS: readonly Lang[] = ['zh-CN', 'en'];
const THEMES: readonly Theme[] = ['light', 'dark'];

const COPY: Record<Lang, {
  loginHeading: string;
  registerHeading: string;
  forgotHeading: string;
  notFoundHeading: string;
  documents: RegExp;
  openWorkspace: RegExp;
  editorSelect: RegExp;
  editorDisplay: RegExp;
  editorShare: RegExp;
  editorRename: RegExp;
  shareDialog: RegExp;
  renameDialog: RegExp;
  historyButton: RegExp;
  namedVersionsTab: RegExp;
  namedVersionsEmpty: RegExp;
  versionPill: RegExp;
  settingsTab: RegExp;
  projectsFilter: RegExp;
}> = {
  'zh-CN': {
    loginHeading: '欢迎回来',
    registerHeading: '创建账户',
    forgotHeading: '忘记密码',
    notFoundHeading: '404 - 页面不存在',
    documents: /文档|项目/,
    openWorkspace: /打开工作空间/,
    editorSelect: /^选择$/,
    editorDisplay: /^显示设置$/,
    editorShare: /^分享$/,
    editorRename: /^重命名$/,
    shareDialog: /分享项目/,
    renameDialog: /重命名 iModel/,
    historyButton: /^历史$/,
    namedVersionsTab: /命名版本/,
    namedVersionsEmpty: /暂无命名版本/,
    versionPill: /^#\d+$/,
    settingsTab: /个人资料/,
    projectsFilter: /我的项目/,
  },
  en: {
    loginHeading: 'Welcome back',
    registerHeading: 'Create account',
    forgotHeading: 'Forgot password',
    notFoundHeading: '404 - Page Not Found',
    documents: /Documents|Projects/,
    openWorkspace: /Open workspace/,
    editorSelect: /^Select$/,
    editorDisplay: /^Display$/,
    editorShare: /^Share$/,
    editorRename: /^Rename$/,
    shareDialog: /Share Project/,
    renameDialog: /Rename iModel/,
    historyButton: /^History$/,
    namedVersionsTab: /Named versions/,
    namedVersionsEmpty: /No named versions/,
    versionPill: /^#\d+$/,
    settingsTab: /Profile/,
    projectsFilter: /My Projects/,
  },
};

const shoot = async (page: Page, name: string): Promise<void> => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`), fullPage: true });
};

/** 数据名白名单：演示/调试现场遗留的项目/模型名，属用户数据而非应用文案 */
const DATA_NAME_WHITELIST = [SEED_PROJECT_NAME, '演示项目', '调试专用'];

/**
 * en 象限中文兜底：剔除非应用文案的数据名（种子项目名/用户输入）与品牌字标
 * （AuthBrandSide 的「鲁」是 Logo 字形，非可翻译文案）后，正文不应再出现 CJK。
 * zh 象限不适用。
 */
const expectNoCjk = async (page: Page, label: string): Promise<void> => {
  const text = await page.locator('body').innerText();
  const sanitized = DATA_NAME_WHITELIST.reduce(
    (acc, name) => acc.split(name).join(''),
    text,
  ).replace(/鲁/g, '');
  const match = /[一-鿿]+/.exec(sanitized);
  expect(match?.[0], `${label} 在 en 象限仍出现中文：「${match?.[0] ?? ''}」`).toBeUndefined();
};

for (const lang of LANGS) {
  for (const theme of THEMES) {
    const copy = COPY[lang];
    const suffix = `${lang}-${theme}`;

    test.describe(`P5 走查 ${suffix}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(
          ({ langKey, themeKey, langValue, themeValue }) => {
            localStorage.setItem(langKey, langValue);
            localStorage.setItem(themeKey, themeValue);
          },
          { langKey: LANG_KEY, themeKey: THEME_KEY, langValue: lang, themeValue: theme },
        );
      });

      test('公开四页：Login / Register / Forgot / 404', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: copy.loginHeading })).toBeVisible({ timeout: 15000 });
        await shoot(page, `login-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'Login');

        await page.goto('/register');
        await expect(page.getByRole('heading', { name: copy.registerHeading })).toBeVisible({ timeout: 15000 });
        await shoot(page, `register-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'Register');

        await page.goto('/forgot-password');
        await expect(page.getByRole('heading', { name: copy.forgotHeading })).toBeVisible({ timeout: 15000 });
        await shoot(page, `forgot-password-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'ForgotPassword');

        await page.goto('/no-such-page');
        await expect(page.getByRole('heading', { name: copy.notFoundHeading })).toBeVisible({ timeout: 15000 });
        await shoot(page, `notfound-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'NotFound');
      });

      test('Documents 文档中心', async ({ page }) => {
        await loginWithSession(page);
        await expect(page.getByText(copy.documents).first()).toBeVisible();
        await expect(page.getByText(copy.projectsFilter).first()).toBeVisible();
        await shoot(page, `documents-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'Documents');
      });

      test('项目详情页', async ({ page }) => {
        await loginWithSession(page);
        await page.locator('main').getByRole('button', { name: SEED_PROJECT_NAME }).first().click();
        await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 15000 });
        await expect(page.getByRole('button', { name: copy.openWorkspace }).first()).toBeVisible({
          timeout: 20000,
        });
        await shoot(page, `project-detail-${suffix}`);
        // 详情页正文以数据为主（项目/iModel 名、描述、时间戳），CJK 扫描会误报；
        // 应用文案由语言感知的「Open workspace / 打开工作空间」锚点守住。
      });

      test('Editor 编辑页', async ({ page }) => {
        await loginWithSession(page);
        // helpers.navigateToEditor 的主按钮文案钉死中文；en 象限改用语言感知路径
        await page.locator('main').getByRole('button', { name: SEED_PROJECT_NAME }).first().click();
        await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 15000 });
        const seedCard = page.locator('.imodel-card').filter({
          has: page.locator('.imodel-card__title', { hasText: 'E2E Seed' }),
        });
        const openWorkspace = seedCard.getByRole('button', { name: copy.openWorkspace });
        await expect(openWorkspace).toBeEnabled({ timeout: 60000 });
        await openWorkspace.click();
        await page.waitForURL(/\/documents\/[^/]+\/[^/]+/, { timeout: 60000 });
        // briefcase/WS 偶发挂起（memory: 串行多轮后初始化卡死）：一次 reload 重试
        const selectButton = page.getByRole('button', { name: copy.editorSelect }).first();
        const editorReady = await selectButton
          .waitFor({ state: 'visible', timeout: 45000 })
          .then(() => true)
          .catch(() => false);
        if (!editorReady) {
          await page.reload();
          await expect(selectButton).toBeVisible({ timeout: 60000 });
        }
        // 版本药丸默认可见（briefcase changeset.index；终审复检 I4）
        await expect(page.getByRole('button', { name: copy.versionPill }).first()).toBeVisible({ timeout: 15000 });
        // 停靠/状态栏渲染完毕再截（避免 capture 到加载帧）
        await page.waitForTimeout(1200);
        await shoot(page, `editor-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'Editor');

        // 停靠面板展开态（viewer-core 面板文案的 en 兜底；终审 I2）
        await page.getByRole('button', { name: copy.editorDisplay }).first().click();
        await expect(page.getByTestId('editor-dock')).toBeVisible({ timeout: 15000 });
        await page.waitForTimeout(500);
        await shoot(page, `editor-dock-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'Editor dock');

        // 终审 I1：顶栏 Share / 重命名可达（对话框打开即断言，Escape 关闭）
        await page.getByRole('button', { name: copy.editorShare }).first().click();
        const shareDialog = page.getByRole('dialog', { name: copy.shareDialog });
        await expect(shareDialog).toBeVisible();
        await shareDialog.getByRole('button', { name: 'Close' }).first().click();
        await expect(shareDialog).toBeHidden();

        await page.getByRole('button', { name: copy.editorRename }).first().click();
        const renameDialog = page.getByRole('dialog', { name: copy.renameDialog });
        await expect(renameDialog).toBeVisible();
        await renameDialog.getByRole('button', { name: 'Close' }).first().click();
        await expect(renameDialog).toBeHidden();

        // 终审 I1：版本历史停靠 → 命名版本页可达
        await page.getByRole('button', { name: copy.historyButton }).first().click();
        const historyDock = page.getByTestId('editor-dock');
        await expect(historyDock.getByRole('tab', { name: copy.namedVersionsTab })).toBeVisible();
        await historyDock.getByRole('tab', { name: copy.namedVersionsTab }).click();
        // 命名版本面板真实内容（不是仅 tab 可点）且底栏时间线已让位
        await expect(historyDock.getByText(copy.namedVersionsEmpty).first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('.version-timeline-bar')).toHaveCount(0);
        await page.waitForTimeout(500);
        await shoot(page, `editor-named-versions-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'Editor named versions');
      });

      test('Settings 设置页', async ({ page }) => {
        await loginWithSession(page);
        await page.goto('/settings');
        await expect(page.getByRole('tab', { name: copy.settingsTab })).toBeVisible({
          timeout: 15000,
        });
        await shoot(page, `settings-${suffix}`);
        if (lang === 'en') await expectNoCjk(page, 'Settings');
      });
    });
  }
}
