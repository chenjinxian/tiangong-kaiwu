import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for LubanCAD
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* 编辑器类测试含 briefcase 下载 + WebGL 初始化，导航等待预算可达 60s+，
     默认 30s 会误杀慢机上的 beforeEach（个别 spec 内另有更长的 setTimeout 覆盖） */
  timeout: 120000,

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI；本地默认也用 1——每个编辑器测试都会向 modeling-server
     发起 WS IPC + briefcase 下载 + WebGL 初始化，并发开同一 seed iModel 会随机出现
     「初始化编辑器...」卡死（2026-10-03 实测 workers=2/8 均有复发，串行两轮全绿）。
     可用 PW_WORKERS 覆盖。 */
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 1,

  /* Reporter to use */
  reporter: 'html',

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    /* 认证前置：登录/注册测试账号并导出 auth 状态（storageState + sessionStorage 载荷） */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
