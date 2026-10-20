/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 中英走查基建（RW4-P1.5，评审 Minor⑥/concern③）：四公开页 × zh/en 双语锚点断言，
 * 替代每波手工 localStorage 截图走查。用 `npx playwright test --config playwright.i18n.config.ts`
 * 运行（无 setup project——零登录 = 零 imodelhub 限流消耗；主 config 已 testIgnore 本文件）。
 *
 * 断言复用 P1 走查口径（task-p1-report「中英走查 8/8」）：
 *   Login / Register / ForgotPassword / 404 的 heading + 主按钮 + 关键 link。
 * 附加 RW4-P1.5 视觉修真实证：
 *   - Login「登录」high-visibility 按钮背景 = 品牌 teal（variables.css accent 别名族覆写）；
 *   - 404「回到文档」（Button as={Link}）文字色非 teal（styles/index.css 全局 a 规则收窄，
 *     itwinui 组件色权交还组件层 → 白字 teal 底）。
 * 截图落 `.superpowers/sdd/2026-10-15-rw4-frontend-ia/p15-screenshots/`（工作区证据，不入库）。
 *
 * 坑位记录：语言注入必须放进各自 test.describe 内的 test.use——顶层 for 循环里调用
 * test.use 会按文件级合并、末次覆写全局，zh 组会被 en 的 storageState 覆盖（实测复现）。
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const LANG_KEY = 'luban-cad-lang'; // shared/i18n LANGUAGE_STORAGE_KEY（避免拉起 i18n 单例）
const SHOT_DIR =
  process.env.I18N_WALKTHROUGH_SHOT_DIR ||
  resolve(process.cwd(), '../../../.superpowers/sdd/2026-10-15-rw4-frontend-ia/p15-screenshots');

type Lang = 'zh-CN' | 'en';

/** 文案矩阵（与 shared/i18n/locales/{zh-CN,en}/{auth,common}.json 对齐——改动文案须同步本表） */
const COPY: Record<Lang, {
  login: { heading: string; submit: string; registerLink: string };
  register: { heading: string; submit: string; loginLink: string };
  forgot: { heading: string; submit: string; loginLink: string };
  notFound: { heading: string; goDocuments: string };
}> = {
  'zh-CN': {
    login: { heading: '欢迎回来', submit: '登录', registerLink: '立即注册' },
    register: { heading: '创建账户', submit: '创建账户', loginLink: '立即登录' },
    forgot: { heading: '忘记密码', submit: '发送重置链接', loginLink: '立即登录' },
    notFound: { heading: '404 - 页面不存在', goDocuments: '回到文档' },
  },
  en: {
    login: { heading: 'Welcome back', submit: 'Sign In', registerLink: 'Register' },
    register: { heading: 'Create account', submit: 'Create account', loginLink: 'Sign in' },
    forgot: { heading: 'Forgot password', submit: 'Send reset link', loginLink: 'Sign in' },
    notFound: { heading: '404 - Page Not Found', goDocuments: 'Go to Documents' },
  },
};

/** 品牌 teal 判定：hsl(167deg 100% 36.1%/44.7%) ≈ rgb(0,184,145)/rgb(0,228,178)；
 * i22 存量 informational 蓝 ≈ rgb(0,98,158)——g 通道是判别位 */
const isBrandTeal = (color: string): boolean => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (!m) return false;
  const [, r, g, b] = m;
  const [rn, gn, bn] = [Number(r), Number(g), Number(b)];
  return rn < 40 && gn > 170 && bn > 120 && bn < 200;
};

const computedStyle = (page: Page, locator: ReturnType<Page['getByRole']>, prop: string) =>
  locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** 色值断言走 toPass 重试：itwinui 按钮有 ~150ms background transition，toBeEnabled 后立即取
 * computed background-color 会采到 disabled 灰 → teal 的过渡帧（实测 rgb(191,220,216)） */
const expectTealBg = async (page: Page, locator: ReturnType<Page['getByRole']>, what: string) => {
  await expect(async () => {
    const bg = await computedStyle(page, locator, 'background-color');
    expect(isBrandTeal(bg), `${what} 背景应为品牌 teal（实为 ${bg}）`).toBe(true);
  }).toPass({ timeout: 5000 });
};

const shoot = async (page: Page, name: string): Promise<void> => {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`), fullPage: true });
};

for (const [langLabel, lang] of [['zh-CN', 'zh-CN'], ['en', 'en']] as const) {
  const copy = COPY[lang];

  test.describe(`中英走查 ${langLabel}`, () => {
    // 语言经 storageState localStorage 注入（i18n 探测链 localStorage → navigator，首载即生效）。
    // 必须放在 describe 内：顶层 test.use 文件级合并（见文件头坑位记录）。
    test.use({
      storageState: {
        cookies: [],
        origins: [{ origin: BASE, localStorage: [{ name: LANG_KEY, value: lang }] }],
      },
    });

    test('Login：锚点 + CTA 呈品牌 teal（P1.5 别名族覆写实测）', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: copy.login.heading })).toBeVisible();
      await expect(page.getByRole('textbox', { name: /电子邮箱|Email/i })).toBeVisible();
      await expect(page.getByRole('link', { name: copy.login.registerLink })).toBeVisible();

      // 空表单时按钮 disabled 呈灰底——填合法值点亮（不 submit，零请求零限流消耗）
      const submit = page.getByRole('button', { name: copy.login.submit, exact: true });
      await page.getByRole('textbox', { name: /电子邮箱|Email/i }).fill('name@company.com');
      await page.getByRole('textbox', { name: /密码|Password/i }).fill('Walkthrough#2026');
      await expect(submit).toBeEnabled();
      await expectTealBg(page, submit, '登录按钮');
      await shoot(page, `login-${lang}`);
    });

    test('Register：锚点断言', async ({ page }) => {
      await page.goto('/register');
      await expect(page.getByRole('heading', { name: copy.register.heading })).toBeVisible();
      await expect(page.getByRole('button', { name: copy.register.submit, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: copy.register.loginLink })).toBeVisible();
      await shoot(page, `register-${lang}`);
    });

    test('ForgotPassword：锚点断言', async ({ page }) => {
      await page.goto('/forgot-password');
      await expect(page.getByRole('heading', { name: copy.forgot.heading })).toBeVisible();
      await expect(page.getByRole('button', { name: copy.forgot.submit, exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: copy.forgot.loginLink })).toBeVisible();
      await shoot(page, `forgot-password-${lang}`);
    });

    test('404：锚点 + 按钮文字非 teal（P1.5 全局 a 规则收窄实测）', async ({ page }) => {
      await page.goto('/no-such-page');
      await expect(page.getByRole('heading', { name: copy.notFound.heading })).toBeVisible();

      // Button as={Link} 渲染 <a href>（role=link，routes.test 同口径），非 button
      const back = page.getByRole('link', { name: copy.notFound.goDocuments });
      await expect(back).toBeVisible();
      // 背景 = accent 别名族覆写后的品牌 teal；文字 = itwinui 组件层白（非全局 a 的 teal）
      await expectTealBg(page, back, '404 按钮');
      const fg = await computedStyle(page, back, 'color');
      expect(isBrandTeal(fg), `404 按钮文字不应为 teal（全局 a 规则须让位组件层），实为 ${fg}`).toBe(false);
      await shoot(page, `notfound-${lang}`);
    });
  });
}
