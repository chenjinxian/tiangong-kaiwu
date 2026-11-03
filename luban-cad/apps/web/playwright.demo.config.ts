/**
 * Tutorial 2 完整建模演示配置（系统 Chrome，带视频录制）。
 *
 * 与主配置同栈、同 setup、同 webServer；仅把 chromium 项目换成系统 Chrome
 * （channel: 'chrome'）并开启 video/screenshot，供人工观看整段建模过程。
 *
 * 用法：
 *   npx playwright test e2e/tutorial2.spec.ts --config=playwright.demo.config.ts --project=chrome-demo
 * 产物：
 *   test-results/t2-demo-chrome/  （webm 视频 + 失败/结束时截图）
 *   test-results/t2-mouse-*.png   （spec 内关键节点截图）
 */
import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  outputDir: 'test-results/t2-demo-chrome',
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chrome-demo',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
        headless: false,
        // 演示节拍：每个 Playwright 输入动作放慢 180ms，鼠标轨迹/点击在录屏里可读。
        launchOptions: { slowMo: 180 },
        // T2_KEEP_OPEN=1：演示后浏览器长时间保持打开，停止录屏避免文件无限增长。
        video: process.env.T2_KEEP_OPEN === '1' ? 'off' : 'on',
        screenshot: 'on',
        trace: 'off',
      },
    },
  ],
  use: {
    ...base.use,
    viewport: { width: 1440, height: 900 },
    video: process.env.T2_KEEP_OPEN === '1' ? 'off' : 'on',
    screenshot: 'on',
    trace: 'off',
  },
});
