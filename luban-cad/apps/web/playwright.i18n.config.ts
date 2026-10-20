import { defineConfig, devices } from '@playwright/test';

/**
 * 中英走查专用 Playwright 配置（RW4-P1.5 评审 Minor⑥/concern③ 基建化）。
 *
 * 与主 `playwright.config.ts` 的差异（有意为之，勿合并）：
 * - **无 setup project**：Login/Register/ForgotPassword/404 四页全是公开页，零登录
 *   = 零 imodelhub 限流消耗（5 次/15min 桶，auth.setup 每轮烧 1 次）；主配置已
 *   `testIgnore` 本 spec，默认 e2e 基线计数不变。
 * - 语言切换 = `luban-cad-lang` localStorage 注入（storageState），不经 UI/登录态。
 * - 断言全部走公开锚点（heading/button/link），不触后端数据链。
 *
 * 运行：`npx playwright test --config playwright.i18n.config.ts`
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /i18n-walkthrough\.spec\.ts/,

  /* 认证三页带 300ms 假 loading + 骨架门，60s 足够（无 briefcase/WebGL 预算） */
  timeout: 60000,

  fullyParallel: true,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  /* 走查类保持串行（本机 dev server + 截图稳定性；主 config workers=1 先例） */
  workers: 1,

  reporter: [['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5300',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5300',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
