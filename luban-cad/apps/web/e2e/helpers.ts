/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * e2e 共通 helper —— 适配 2026-10 现状 UI 的标准导航/断言路径。
 *
 * UI 事实（勿凭旧测试反推）：
 * - 项目卡片是 iTwinUI Tile：div[cursor=pointer] 内嵌以项目名命名的 <button>（无 a[href]、无 .section-card）。
 * - iModel 卡片的主按钮文案是「打开工作空间」（initialized 前禁用）。
 * - 编辑器路由是 /workspace/:iTwinId/:iModelId（不存在 /editor/...）。
 * - CreateITwinDialog 标题只存在于 aria-label（内层 heading 为空）→ 用 getByRole('dialog', { name }) 定位。
 * - 工具激活提示走 IModelApp.notifications.outputPrompt，无 UI 消费、不落 DOM；
 *   断言用 main.tsx 暴露的 window.IModelApp.toolAdmin.activeTool.toolId。
 */

export const SEED_PROJECT_NAME = '测试项目';

/** UI 登录（e2e 标准账号，与 fixtures.TEST_USER 一致）。
 *  仅登录流相关 spec 使用（login/complete-workflow/demo）—— 每次登录都是一次 MS HTTP
 *  请求，而 modeling-server 有全局 100 请求/15 分钟/IP 限流，滥用会 429 拖垮整套件。 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'Test123!@#');
  await page.getByRole('button', { name: /^登录$|登录中|Sign In/i }).first().click();
  await page.waitForURL(/\/itwins/, { timeout: 15000 });
}

/** 会话注入登录：复用 auth.setup 产物（playwright/.auth/session.json）注入 sessionStorage，
 *  免走登录表单 —— 常规 spec 的标准登录方式（不消耗 MS 限流额度，且更快）。
 *  依赖 config 中 setup project 先行（dependencies 保证）。 */
export async function loginWithSession(page: Page): Promise<void> {
  const session: Record<string, string | null> = JSON.parse(
    readFileSync('playwright/.auth/session.json', 'utf-8')
  );
  await page.addInitScript((session) => {
    for (const [key, value] of Object.entries(session)) {
      if (typeof value === 'string') sessionStorage.setItem(key, value);
    }
  }, session);
  await page.goto('/itwins');
  await expect(page.locator('.section-title')).toBeVisible({ timeout: 15000 });
}

/**
 * 经 UI 导航至编辑器：项目列表 → 点种子项目卡片 → 详情页「打开工作空间」→ 等 CAD 工具条。
 * 工具条出现即等价于 briefcase 连接已建立（CadToolbar 仅在 isEditMode 渲染）。
 */
export async function navigateToEditor(page: Page, projectName = SEED_PROJECT_NAME): Promise<void> {
  // 项目卡片：Tile 内嵌按钮（可点击冒泡到卡片 onClick → /itwins/:id）
  const projectTile = page.locator('main').getByRole('button', { name: projectName }).first();
  await expect(projectTile).toBeVisible({ timeout: 20000 });
  await projectTile.click();
  await page.waitForURL(/\/itwins\/[^/]+$/, { timeout: 15000 });

  // 详情页：iModel 卡片的「打开工作空间」（未初始化时禁用，等待解锁）
  const openBtn = page.getByRole('button', { name: '打开工作空间' }).first();
  await expect(openBtn).toBeVisible({ timeout: 15000 });
  await expect(openBtn).toBeEnabled({ timeout: 60000 });
  await openBtn.click();
  await page.waitForURL(/\/workspace\/[^/]+\/[^/]+/, { timeout: 60000 });

  await waitForEditorReady(page);
  await expect(page.locator('.cad-toolbar-horizontal')).toBeVisible({ timeout: 60000 });

  // 工具条出现只代表 briefcase 连接建立；CadToolbar.handleToolClick 还要等 isReady
  // （GraphicalEditingScope 进入完成，否则点击被静默吞掉）。IModelApp.connections 在
  // iTwin.js 5.x 已移除，改经 viewManager.selectedView.iModel 轮询 editingScope。
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const app = (window as unknown as {
            IModelApp?: { viewManager?: { selectedView?: { iModel?: { editingScope?: unknown } } | null } };
          }).IModelApp;
          return !!app?.viewManager?.selectedView?.iModel?.editingScope;
        }),
      { timeout: 30000, message: 'GraphicalEditingScope 应就绪（工具可激活）' }
    )
    .toBe(true);
}

/**
 * 点击工具条按钮并断言工具激活。isReady（React 状态）可能滞后于 editingScope 实际建立
 * 一个提交窗口，首个点击偶被吞掉 —— 未激活则重试点击。
 */
export async function activateToolbarTool(
  page: Page,
  toolbarButtonName: string,
  toolId: string,
  timeout = 30000
): Promise<void> {
  const button = page.locator('.cad-toolbar-horizontal').getByRole('button', { name: toolbarButtonName }).first();
  const deadline = Date.now() + timeout;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    await button.click();
    try {
      await expectToolActivated(page, toolId, 3000);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`工具 ${toolId} 激活超时`);
}

/**
 * 等待编辑器就绪（状态栏出现）。
 * modeling-server 的 IPC WebSocket 握手偶发挂起（前端停在「初始化编辑器...」永不超时，
 * 2026-10-03 实测串行/并发均随机复现，重连即恢复）—— 每 30s 检测一次卡滞并 reload 重试。
 */
export async function waitForEditorReady(page: Page, timeout = 180000): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastProgressAt = Date.now();

  while (Date.now() < deadline) {
    if (await page.locator('.statusbar').isVisible().catch(() => false)) {
      return;
    }
    if (Date.now() - lastProgressAt > 30000) {
      const stuck = await page.getByText('初始化编辑器').isVisible().catch(() => false);
      if (stuck) {
        console.log('[waitForEditorReady] 编辑器初始化卡滞，reload 重试');
        await page.reload();
      }
      lastProgressAt = Date.now();
    }
    await page.waitForTimeout(1000);
  }
  await expect(page.locator('.statusbar'), '编辑器应在时限内就绪').toBeVisible({ timeout: 5000 });
}

/** window.IModelApp（main.tsx 调试暴露）读取当前激活工具的 toolId */
export async function getActiveToolId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const app = (window as unknown as {
      IModelApp?: { toolAdmin?: { activeTool?: { toolId?: string } | null } };
    }).IModelApp;
    return app?.toolAdmin?.activeTool?.toolId ?? null;
  });
}

/** 断言工具已激活（点击工具按钮后 activeTool.toolId === 期望值；工具启动有异步性故轮询） */
export async function expectToolActivated(page: Page, toolId: string, timeout = 10000): Promise<void> {
  await expect
    .poll(() => getActiveToolId(page), { timeout, message: `工具 ${toolId} 应被激活` })
    .toBe(toolId);
}

/** 取第一个 iTwin 的第一个 iModel 的真实 ID（hub API，须先登录产生 sessionStorage token） */
export async function getFirstProjectAndIModel(page: Page): Promise<{ projectId: string; imodelId: string }> {
  return page.evaluate(async () => {
    const authJson = sessionStorage.getItem('luban_cad_auth');
    const auth = authJson ? JSON.parse(authJson) : null;
    const headers: Record<string, string> = auth?.accessToken
      ? { Authorization: `Bearer ${auth.accessToken}` }
      : {};
    const projects = await fetch('http://localhost:4000/itwins?class=Project', { headers }).then((r) => r.json());
    if (!projects.iTwins?.length) {
      throw new Error('后端无项目数据——起栈+seed 后重跑（e2e 不再静默跳过）');
    }
    const imodels = await fetch(`http://localhost:4000/imodels?iTwinId=${projects.iTwins[0].id}`, { headers }).then((r) => r.json());
    if (!imodels.iModels?.length) {
      throw new Error('后端无 iModel 数据——起栈+seed 后重跑');
    }
    return { projectId: projects.iTwins[0].id as string, imodelId: imodels.iModels[0].id as string };
  });
}

/** best-effort 清理测试项目（DELETE /itwins/:id 级联删 iModel；失败不影响测试结果） */
export async function deleteProjectViaApi(page: Page, projectId: string): Promise<void> {
  await page
    .evaluate(async (id) => {
      const authJson = sessionStorage.getItem('luban_cad_auth');
      const auth = authJson ? JSON.parse(authJson) : null;
      const headers: Record<string, string> = auth?.accessToken
        ? { Authorization: `Bearer ${auth.accessToken}` }
        : {};
      await fetch(`http://localhost:4000/itwins/${id}`, { method: 'DELETE', headers });
    }, projectId)
    .catch(() => undefined);
}
