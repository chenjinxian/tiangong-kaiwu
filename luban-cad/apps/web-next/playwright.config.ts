/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * web-next e2e 独立 config（M5-T5，切换门禁第 1 条「七页 e2e 全绿」的载体）：
 * - baseURL :5310（web-next dev server，vite.config.ts 同端口；webServer 复用
 *   在场实例——常态开发态 dev 已在跑，不重复起进程）；
 * - workers=1 + retries 0（红即真红；编辑器用例共享 MS briefcase/WebGL 资源，
 *   串行是旧应用 2026-10-03 实测纪律，web-next 沿用）；
 * - projects：setup（auth.setup.ts，API 取 token 零限流消耗）→ chromium 依赖
 *   setup——消费方经 helpers.loginWithSession 注入 sessionStorage
 *   `luban-next-auth`（M3-T8/M4-T9 会话注入手法，MS 登录限流 100/15min）；
 * - 中文断言稳定：locale 钉 zh-CN（i18n navigator 探测落中文，同 apps/web 口径）。
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  /* 编辑器用例含 briefcase 下载 + WebGL 初始化（旧应用预算教训），默认预算放大 */
  timeout: 120_000,

  /* 串行铁律：单 worker，禁文件内并行 */
  fullyParallel: false,

  forbidOnly: !!process.env.CI,

  /* 红即真红：不重试（brief 纪律） */
  retries: 0,

  workers: 1,

  reporter: 'list',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5310',
    locale: 'zh-CN',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  /* 视觉钉版基线（M5-T6，visual.spec.ts）：快照落 e2e/__screenshots__/
   * （测试目录旁，git 正常跟踪——luban-cad/.gitignore 的 *.png 有对应豁免行）；
   * 不带 {-projectname}{-platform} 后缀：本仓唯一 chromium 项目 + Windows 单机
   * 钉版（跨平台像素本就不可比，基线随平台重建）。 */
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',

  expect: {
    toHaveScreenshot: {
      /* 钉版红即真红（retries 0 同纪律）；仅禁动画防过渡态像素噪声。
       * 「逐像素」精确口径（T6 评审 M-3）：maxDiffPixelRatio 缺省 0=像素数
       * 零容差（任何 1 个差异像素即红）；但 per-pixel 色距 threshold 缺省
       * 0.2（YIQ）——非零色差在此容差内不判差，「零色差」不成立。 */
      animations: 'disabled',
    },
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'corepack pnpm@10 dev',
    url: 'http://localhost:5310',
    // 常态开发态复用在场 dev server（M5-T5 口径）；CI 恒新起（T5 评审 M-5：
    // 切换冲刺后 CI 形态临近，陈旧 dev server 被静默复用会吃假绿——旧应用
    // apps/web 同口径 `!process.env.CI`）。
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
