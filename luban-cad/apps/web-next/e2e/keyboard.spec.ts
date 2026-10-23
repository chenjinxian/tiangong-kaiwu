/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 纯键盘流 e2e（M5-T5，切换门禁第 2 条）：登录注入 → Tab 走焦到「创建」→
 * 键盘建文档 → 键盘开 iModel → 进编辑器 → alt+/ 命令搜索真激活工具 →
 * Escape 分层收合。**全程禁 mouse**：交互只走 page.keyboard（Enter/Tab/
 * Escape/热键）；焦点路径逐步断言（document.activeElement 可观测面）。
 *
 * 自首（honest 边界）：文档中心→编辑器跨页长路径的卡片级焦点锚定用
 * locator.focus() 程序化置焦（Tile 卡片深藏在长 tab 序中，Tab 走焦从页首
 * 步进属脆断言）；「Tab 走焦」的焦点序断言收敛在创建菜单→对话框→提交钮
 * 一段（focusViaTab），两段配合兼顾真实性与稳定性。
 *
 * 自建自清：键盘创建的文档经 API 按名删除（test.afterEach 级联清 iModel）。
 */

import { expect, test } from '@playwright/test';
import { E2E_IMODEL_NAME, SEED_PROJECT_NAME } from './fixtures';
import {
  apiDeleteDocument,
  apiFindDocumentByName,
  focusViaTab,
  gotoDocuments,
  readAccessToken,
  readActiveElement,
  waitEditorReady,
} from './helpers';

/** 键盘流自建文档名（ASCII 前缀防 GBK 链路污染；时间戳防跨轮撞名）。 */
const KEYBOARD_DOC_NAME = `E2E-KB-${Date.now()}`;

test.afterEach(async ({ request }) => {
  // 自清（幂等：文档不存在时 API 返回 null 不删）
  const created = await apiFindDocumentByName(request, KEYBOARD_DOC_NAME, readAccessToken());
  if (created) await apiDeleteDocument(request, created.id, readAccessToken());
});

test('纯键盘：Tab 到创建 → 建文档（焦点路径断言）', async ({ page }) => {
  await gotoDocuments(page, 'my');

  // Tab 走焦到「创建」大钮（全程 page.keyboard）
  await focusViaTab(page, page.getByRole('button', { name: '创建', exact: true }));
  await page.keyboard.press('Enter');

  // 创建菜单开：等焦点落进菜单（开菜单异步置焦——可见 ≠ 已置焦，抢跑 ArrowDown
  // 会把首项焦点推到第二项）；真实浏览器落首项（新建文档），兜底一档 ArrowDown
  const newItem = page.getByRole('menuitem', { name: '新建文档' });
  await expect(newItem).toBeVisible();
  await expect.poll(
    async () => page.evaluate(() => document.activeElement?.getAttribute('role') ?? ''),
    { timeout: 5_000 },
  ).toBe('menuitem');
  if ((await readActiveElement(page)).text !== '新建文档') {
    await page.keyboard.press('ArrowDown');
  }
  await expect.poll(async () => (await readActiveElement(page)).text).toBe('新建文档');
  await page.keyboard.press('Enter');

  // 对话框开：焦点在名称输入（autoFocus）→ 键入
  const dialog = page.getByRole('dialog', { name: '新建文档' });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await readActiveElement(page)).tag).toBe('INPUT');
  await page.keyboard.type(KEYBOARD_DOC_NAME);
  await expect(dialog.getByPlaceholder('输入文档名称')).toHaveValue(KEYBOARD_DOC_NAME);

  // Tab 走焦到提交钮（名称→编号→取消→创建）→ Enter 提交
  await focusViaTab(page, dialog.getByRole('button', { name: '创建', exact: true }));
  await page.keyboard.press('Enter');

  // 建成：对话框收合 + 文档落「我的文档」列表
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: KEYBOARD_DOC_NAME })).toBeVisible({
    timeout: 20_000,
  });
});

test('纯键盘：开 iModel 进编辑器 → alt+/ 真激活扫掠 → Escape 分层', async ({ page }) => {
  // 编辑器用例预算放大（T5 评审 M-4）：编辑器就绪链最坏 210s（waitEditorReady
  // 30+90+90）+ 前置导航，超全局 120s——慢栈下 timeout 会抢先吃掉 helper 的
  // 诊断文案。前一个用例（文档中心，无编辑器）不吃放大。
  test.slow();
  await gotoDocuments(page, 'my');

  // 键盘激活种子项目卡（Enter 导航详情页；焦点锚定见文件头自首）
  const projectCard = page.getByRole('button', { name: SEED_PROJECT_NAME }).first();
  await projectCard.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 20_000 });

  // 键盘打开 E2E Seed（「打开工作空间」钮 Enter）
  const seedCard = page.locator('.imodel-card', { hasText: E2E_IMODEL_NAME });
  await expect(seedCard).toBeVisible({ timeout: 20_000 });
  await seedCard.getByRole('button', { name: '打开工作空间' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/documents\/[^/]+\/[^/]+$/, { timeout: 30_000 });

  // 编辑器就绪：连接 + 视口（真实栈 briefcase/WebGL）
  const consoleWarnings: string[] = [];
  page.on('console', (message) => {
    consoleWarnings.push(`[${message.type()}] ${message.text()}`);
  });
  await waitEditorReady(page);

  // alt+/ 开命令搜索（焦点入输入框）→ 键入过滤 → Enter 激活首个命中（扫掠；
  // M6-b T6 起圆角 RoundEdges 改道 new/fillet 对话框，键盘真激活探针换扫掠）
  await page.keyboard.press('Alt+Slash');
  const palette = page.getByRole('dialog', { name: '搜索工具' });
  await expect(palette).toBeVisible();
  await expect.poll(async () => (await readActiveElement(page)).tag).toBe('INPUT');
  await page.keyboard.type('扫掠');
  await page.keyboard.press('Enter');

  // 真激活双证（part-studio.spec 同口径）：store 写入（aria-pressed）+ console
  // 零「未启动/激活失败」——aria-pressed 先于 tools.run 落定，单证会放过假激活。
  const sweep = page.getByRole('button', { name: '扫掠', exact: true });
  await expect(sweep).toHaveAttribute('aria-pressed', 'true');
  const activationWarnings = consoleWarnings.filter((text) => /未启动|激活失败/.test(text));
  expect(activationWarnings, `键盘流 SweepFaces 激活不应有警告：\n${activationWarnings.join('\n')}`).toHaveLength(0);

  // Escape 分层②：alt+~+t 和弦开页签管理器 → Escape 收
  await page.keyboard.press('Alt+Backquote');
  await page.keyboard.press('t');
  const tabManager = page.getByRole('dialog', { name: '页签管理器' });
  await expect(tabManager).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tabManager).toBeHidden();

  // Escape 分层③：alt+/ 再开命令搜索 → Escape 收（面板级独立收合）
  await page.keyboard.press('Alt+Slash');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});
