/**
 * 后端重启边界（真栈，显式开启）：page-lifetime IPC host 无法自动重连，
 * 但打开新文档时必须**有界失败**并给整页刷新入口，而不是永久停在
 * “正在打开文档…”。
 *
 * 运行（会重启本机宿主 MS，结束后保持运行）：
 *   IPC_RESTART_E2E=1 npx playwright test e2e/examples/ms-restart-recovery.spec.ts
 *
 * 缺省 skip：本 spec 会 stop/start 宿主 modeling-server，不能混入常规串行套件。
 * 验证链：
 *  1) 打开一个模型 → 返回项目页（保持页面级 host 存活）；
 *  2) 重启宿主 MS；
 *  3) 打开另一模型：`queryConcurrency` 存活探针 8s 超时 → 错误面可见
 *     （不再永久 loading）；
 *  4) 点“刷新页面” → 新页面重建 host/WS → 同一编辑器重新打开成功。
 */
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { loginWithSession } from '../helpers.js';

const ROOT = 'D:\\Github\\tiangong-kaiwu';
const ENABLED = process.env.IPC_RESTART_E2E === '1';

async function waitForMsHealth(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://localhost:5401/health');
      if (response.ok) return;
    } catch {
      // 宿主重启中
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('modeling-server /health 未在预算内恢复');
}

test.describe('IPC 边界：后端 MS 重启', () => {
  test.skip(!ENABLED, '设置 IPC_RESTART_E2E=1 后运行（会重启本机宿主 modeling-server）');

  test('重启后打开另一模型 → 有界错误面 → 刷新恢复', async ({ page }) => {
    test.setTimeout(300_000);
    await loginWithSession(page);
    await page.goto('/examples');
    const first = page.getByRole('link', { name: '打开示例' }).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    const href = await first.getAttribute('href');
    const itwinId = href!.split('/')[2]!;

    await page.goto(`/documents/${itwinId}`);
    await expect(page.getByTestId('imodel-card-grid')).toBeVisible({ timeout: 30_000 });
    await page.locator('.imodel-card', { hasText: 'WARNING LABEL - Bench Vise' }).click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });
    await page.locator('.part-studio-doc-title').click();
    await expect(page.getByTestId('imodel-card-grid')).toBeVisible({ timeout: 30_000 });

    try {
      execFileSync('powershell', ['-NoProfile', '-File', `${ROOT}\\scripts\\stop-ms-host.ps1`, '-Force'], { stdio: 'ignore' });
    } finally {
      execFileSync('powershell', ['-NoProfile', '-File', `${ROOT}\\scripts\\start-ms-host.ps1`, '-Detach'], { stdio: 'ignore' });
      await waitForMsHealth();
    }

    // 旧 WebSocket 已死；IpcApp.isValid 仍为真。打开新模型必须 8s 探针失败，
    // 错误面 + 刷新按钮可见，而不是无限 loading / 解析中。
    await page.locator('.imodel-card', { hasText: 'DRILL HOTD / ENG_BEARING' }).click();
    await expect(page.getByTestId('part-studio-connection-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('part-studio-connection-error')).toContainText('建模服务连接已断开');
    await expect(page.getByTestId('part-studio-connection-reload')).toBeVisible();

    // 整页刷新 = 唯一恢复路径；新 host 连回重启后的 MS，同一模型打开成功。
    await page.getByTestId('part-studio-connection-reload').click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('part-studio-scope-loading')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('part-studio-connection-error')).toHaveCount(0);
  });
});
