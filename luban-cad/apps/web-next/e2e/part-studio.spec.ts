/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Part Studio 编辑器页 e2e（M5-T5，会话注入零登录；真实栈：MS :5401 briefcase
 * 下载 + WebGL）。五组断言各自独立导航（briefcase 重开走 MS「Closing existing
 * db」复用路径，连接等待带一次 reload 恢复——见 helpers.waitEditorReady）：
 *  1) 五区结构 + 连接就绪 + 特征树双段 + 顶栏编辑三钮干净态诚实禁用；
 *  2) ribbon 工具真激活：RoundEdges（真实 toolId）→ aria-pressed + console
 *     零「未启动/激活失败」警告（M4-T9 冒烟 S4 同口径）；
 *  3) 页签管理器（「+」开合）；
 *  4) 汉堡文档菜单 11 项 + 工作区单位对话框（mm 唯一可用）；
 *  5) FeatureDialog 开合（拉伸 → 非模态面板 + 距离缺省 → ✗ 收合）。
 *
 * honest 边界（brief）：本页只测 UI 面与工具激活——**不做建模闭环断言**
 * （特征提交/撤销链归 T4 私有仓复测门）。
 */

import { expect, test } from '@playwright/test';
import { openSeedImodelEditor, waitEditorReady } from './helpers';

test.beforeEach(async ({ page }) => {
  await openSeedImodelEditor(page);
  await waitEditorReady(page);
});

test('五区结构 + 连接就绪 + 特征树双段 + 编辑三钮干净态', async ({ page }) => {
  // 五区（os-11）：顶栏 / ribbon / 左栏（图标条+树）/ 画布 / 底部（页签条+状态栏）
  await expect(page.getByTestId('part-studio-top-bar')).toBeVisible();
  await expect(page.getByTestId('part-studio-ribbon')).toBeVisible();
  await expect(page.getByTestId('part-studio-sidebar')).toBeVisible();
  await expect(page.getByTestId('part-studio-canvas')).toBeVisible();
  await expect(page.getByTestId('part-studio-tab-strip')).toBeVisible();
  await expect(page.getByTestId('part-studio-status-bar')).toBeVisible();

  // 连接就绪双证：状态栏「已连接」（briefcase+host 相位合流）+ 挂载点 canvas
  await expect(page.getByTestId('part-studio-status-connection')).toHaveText('已连接');
  await expect(page.getByTestId('part-studio-viewport').locator('canvas').first()).toBeVisible();

  // 左栏：图标条四类槽 + 双段树段头（特征/零件）
  const rail = page.getByTestId('part-studio-icon-rail');
  for (const label of ['特征', '零件', '装配体', '导入']) {
    await expect(rail.getByRole('button', { name: label })).toBeVisible();
  }
  const tree = page.getByTestId('part-studio-tree');
  await expect(tree).toBeVisible();
  await expect(tree.getByText('特征', { exact: true }).first()).toBeVisible();
  await expect(tree.getByText('零件', { exact: true }).first()).toBeVisible();

  // 右停靠三页签（role=tab）+ 底部活动页签
  for (const tab of ['工具设置', '版本历史', '显示设置']) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: 'Part Studio 1' })).toBeVisible();

  // 顶栏编辑三钮（干净事务态诚实禁用——无可撤销/重做/未推送内容；每轮种子
  // 重置保证此前提，见 auth.setup）
  await expect(page.getByTestId('part-studio-undo-button')).toBeDisabled();
  await expect(page.getByTestId('part-studio-redo-button')).toBeDisabled();
  await expect(page.getByTestId('part-studio-save-button')).toBeDisabled();
});

test('ribbon 工具真激活：RoundEdges aria-pressed + 零未启动警告', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    consoleMessages.push(`[${message.type()}] ${message.text()}`);
  });

  const roundEdges = page.getByRole('button', { name: '圆角', exact: true });
  await expect(roundEdges).toBeVisible();
  await expect(roundEdges).toHaveAttribute('aria-pressed', 'false');

  await roundEdges.click();

  // 真激活双证：store 写入（aria-pressed）+ tools.run 真启动（console 零警告）。
  // aria-pressed 先于 tools.run 落定——单证会放过假激活（M4-T9 S4 反证口径：
  // 「命令未启动」警告 = 假激活）。
  await expect(roundEdges).toHaveAttribute('aria-pressed', 'true');
  const warnings = consoleMessages.filter((text) => /未启动|激活失败/.test(text));
  expect(warnings, `RoundEdges 激活不应有警告：\n${warnings.join('\n')}`).toHaveLength(0);
});

test('页签管理器开合（「+」入口）', async ({ page }) => {
  await page.getByRole('button', { name: '新建页签' }).click();
  const manager = page.getByRole('dialog', { name: '页签管理器' });
  await expect(manager).toBeVisible();
  await expect(manager.getByRole('button', { name: '关闭' })).toBeVisible();

  await manager.getByRole('button', { name: '关闭' }).click();
  await expect(manager).toBeHidden();
});

test('汉堡文档菜单 + 工作区单位对话框（mm 唯一可用）', async ({ page }) => {
  await page.getByRole('button', { name: '文档菜单' }).click();
  // DropdownMenu 无 aria-label（menu 无可访问名）——页面唯一展开菜单，裸 role 定位
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  // os-24 项序关键项（11 项菜单的抽样钉死）
  for (const item of ['重命名文档', '移至…', '文档详细信息…', '工作区单位…', '切换到仅查看模式', '关闭文档']) {
    await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
  }

  // 工作区单位对话框：mm 可用，其余单位 disabled 占位（完整 UI 面；
  // LabeledSelect native——option 的 disabled 语义不依赖可见性）
  await menu.getByRole('menuitem', { name: '工作区单位…' }).click();
  const units = page.getByRole('dialog', { name: '工作区单位' });
  await expect(units).toBeVisible();
  await expect(units.getByRole('option', { name: '毫米 (mm)' })).toBeEnabled();
  await expect(units.getByRole('option', { name: '英寸 (in)' })).toBeDisabled();
  await units.getByRole('button', { name: '关闭' }).click();
  await expect(units).toBeHidden();

  // Escape 收合汉堡菜单（项点击后菜单已自收——断言仍收合态）
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('FeatureDialog 开合：拉伸 → 非模态面板 + 距离缺省 → ✗ 收合', async ({ page }) => {
  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  const dialog = page.getByTestId('part-studio-feature-dialog');
  await expect(dialog).toBeVisible();
  // 非模态（os-31）：aria-modal=false，画布仍可达
  await expect(dialog).toHaveAttribute('aria-modal', 'false');
  // 距离缺省 10（M4-T9 冒烟 S5 同口径；输入为文本型 number 框——role=textbox）
  await expect(dialog.getByRole('textbox', { name: '距离' })).toHaveValue('10');

  // ✗ 取消收合（不做建模闭环断言——那归 T4 私有仓复测门）
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
});
