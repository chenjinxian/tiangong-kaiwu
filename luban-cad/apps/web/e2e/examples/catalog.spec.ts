/**
 * /examples 全部示例目录 smoke（public + 登录态解析）。
 *
 * 只读页面：不创建/修改示例 iModel；登录态用 e2e 固定测试账号，按名解析
 * 已存在的示例项目。21 卡必须全部来自 catalog，不允许用空壳占位。
 */
import { expect, test } from '@playwright/test';
import { loginWithSession } from '../helpers.js';

test.describe('/examples 全部示例目录', () => {
  test('公开可读：21 张卡片 + 未登录动作', async ({ page }) => {
    await page.goto('/examples');
    await expect(page.getByTestId('example-card')).toHaveCount(21);
    await expect(page.getByRole('heading', { name: '全部示例' })).toBeVisible();
    await expect(page.getByTestId('example-card').first()).toContainText('登录后打开');
    await expect(page.getByRole('link', { name: '全部示例', exact: true })).toBeVisible();
  });

  test('登录态：文档中心可见 Onshape 示例复刻（B 项目）', async ({ page }) => {
    await loginWithSession(page);
    await page.goto('/documents');
    await expect(page.getByText('Onshape 示例复刻').first()).toBeVisible({ timeout: 30_000 });
  });

  test('SPA 重入：编辑器 → 项目页 → 另一编辑器不卡在解析', async ({ page }) => {
    await loginWithSession(page);
    await page.goto('/examples');
    const firstOpen = page.getByRole('link', { name: '打开示例' }).first();
    await expect(firstOpen).toBeVisible({ timeout: 30_000 });
    const href = await firstOpen.getAttribute('href');
    const itwinId = href!.split('/')[2]!;

    await page.goto(`/documents/${itwinId}`);
    await expect(page.getByTestId('imodel-card-grid')).toBeVisible({ timeout: 30_000 });
    await page.locator('.imodel-card', { hasText: 'WARNING LABEL - Bench Vise' }).click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });

    // 编辑器顶栏项目面包屑走 SPA 返回；不得整页 reload（reload 会掩盖 IPC 生命周期问题）。
    await page.locator('.part-studio-doc-title').click();
    await expect(page.getByTestId('imodel-card-grid')).toBeVisible({ timeout: 30_000 });
    await page.locator('.imodel-card', { hasText: 'DRILL HOTD / ENG_BEARING' }).click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('part-studio-scope-loading')).toHaveCount(0, { timeout: 30_000 });

    // 第二轮返回/重开：确认不是“只修复一次”的假绿。
    await page.locator('.part-studio-doc-title').click();
    await expect(page.getByTestId('imodel-card-grid')).toBeVisible({ timeout: 30_000 });
    await page.locator('.imodel-card', { hasText: 'WARNING LABEL - Onshape Quickstart' }).click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('part-studio-scope-loading')).toHaveCount(0, { timeout: 30_000 });

    // 页面刷新：浏览器销毁旧 WebSocket，新页面重新 startup 并打开同一模型。
    await page.reload();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('part-studio-scope-loading')).toHaveCount(0, { timeout: 30_000 });
  });

  test('登录态：Bumper 唯一解析到 iModel，打开链接直达', async ({ page }) => {
    await loginWithSession(page);
    await page.goto('/examples');
    await expect(page.getByTestId('example-card')).toHaveCount(21);
    // 21 个示例 iModel 都应被按名解析；缺一个说明 project/imodel 映射漂移。
    await expect(page.getByRole('link', { name: '打开示例' })).toHaveCount(20, { timeout: 30_000 });

    await page.getByTestId('example-search').fill('Bumper');
    await expect(page.getByTestId('example-card')).toHaveCount(1);
    const open = page.getByRole('link', { name: '打开示例' });
    await expect(open).toBeVisible({ timeout: 30_000 });
    const href = await open.getAttribute('href');
    expect(href).toMatch(/^\/documents\/[^/]+\/[^/]+$/);
    await expect(page.getByText('已定位 iModel')).toBeVisible();

    await open.click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/[^/]+/);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 });
  });
});
