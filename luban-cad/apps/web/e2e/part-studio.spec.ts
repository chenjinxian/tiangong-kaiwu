/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Part Studio 编辑器页 e2e（M5-T5，会话注入零登录；真实栈：MS :5401 briefcase
 * 下载 + WebGL）。P2.6a 起主编辑种子 = B（标记项目 `E2E B 项目`，解析器首开
 * 创建默认 Part Studio 并把 URL replace 到 `?model=`）；末尾另有一组 A 旧文档
 * 只读冒烟（`测试项目` / `E2E Seed`）。五组 B 断言各自独立导航（briefcase
 * 重开走 MS「Closing existing db」复用路径，连接等待带一次 reload 恢复——见
 * helpers.waitEditorReady）：
 *  1) 五区结构 + 连接就绪 + 特征树双段 + 顶栏编辑三钮干净态（undo/redo 禁用、
 *     保存版本可用——B-model P0 Task 5 起干净态也可命名当前 changeset）；
 *  2) ribbon 工具真激活：ChamferEdges（真实 toolId；M6-b T6 起圆角 RoundEdges
 *     改道 new/fillet、B3 起扫掠 SweepFaces 改道 new/sweep 对话框，探针换倒角）
 *     → aria-pressed + console 零「未启动/激活失败」警告（M4-T9 冒烟 S4 同口径）；
 *  3) 真实页签（「+」新建 Part Studio 换 scope）+ 页签管理器（alt+~+t）；
 *  4) 汉堡文档菜单 11 项 + 工作区单位对话框（mm 唯一可用）；
 *  5) FeatureDialog 开合（拉伸 → 非模态面板 + 距离缺省 → ✗ 收合）；
 *     圆角通道（M6-b T6）：半径缺省 5 + 空边集禁提交（视口拾取链不自动断言
 *     ——归 T7 真栈冒烟）。
 *
 * honest 边界（brief）：本页只测 UI 面与工具激活——**不做建模闭环断言**
 * （特征提交/撤销链归 T4 私有仓复测门）。
 */

import { expect, test } from '@playwright/test';
import { getApiToken, openLegacySeedEditor, openSeedImodelEditor } from './helpers';
import { resetBModelSeed, type SeedImodelRef } from './seed';

test.describe('B 种子编辑器（默认 Part Studio）', () => {
  // L3：reset 返回的同一组 id 交给 open，避免各自按名解析。
  let bSeed: SeedImodelRef | undefined;
  test.beforeEach(async ({ page, request }) => {
    // 每例重置 B 种子（新 iModel ⇒ 新 dbKey）：上一例页面关闭后其写租约仍可能
    // 在 30s TTL 内占住旧 dbKey，新页面会因租约 holder 未释放而无法建默认 scope
    // /新建页签（实跑复现：同文件第 4 例「+」停在 1 页签）。
    test.setTimeout(900_000);
    bSeed = await resetBModelSeed(request, await getApiToken());
    // 编辑器用例预算放大（T5 评审 M-4）：重置 baseline（P2.8 起无 settle）+
    // 导航（含 scope 解析/默认创建 ~90s 最坏）+ 连接/画布（210s 最坏）远超全局
    // 120s——统一 900s 上限，避免慢栈下 timeout 抢先吃掉 helper 诊断文案。
    await openSeedImodelEditor(page, bSeed);
  });

  test('五区结构 + 连接就绪 + 特征树双段 + 编辑三钮干净态', async ({ page }) => {
    // P2.6a：主编辑种子=B（标记项目）；解析器落位到完整 ?model= scope。
    await expect(page).toHaveURL(/\/documents\/[^/?]+\/[^/?]+\?model=/);
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

    // 顶栏编辑三钮（干净事务态：undo/redo 诚实禁用——无可撤销/重做内容；保存
    // 版本可用——B-model P0 Task 5 起干净态也可命名当前 changeset，不再随
    // hasPendingTxns 回落禁用）。每轮种子重置保证此前提，见 auth.setup。
    await expect(page.getByTestId('part-studio-undo-button')).toBeDisabled();
    await expect(page.getByTestId('part-studio-redo-button')).toBeDisabled();
    await expect(page.getByTestId('part-studio-save-button')).toBeEnabled();
  });

  test('保存版本：干净态命名当前 changeset', async ({ page }) => {
    // beforeEach 已 openSeedImodelEditor（含 waitEditorReady）；B 种子每轮重置，
    // 干净事务态下保存版本走「最新 changeset 命名」路径。
    await expect(page.getByTestId('part-studio-save-button')).toBeEnabled();
    await page.getByTestId('part-studio-save-button').click();

    const dialog = page.getByRole('dialog', { name: '保存版本' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('版本名称').fill('E2E V1');
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('版本已保存')).toBeVisible();

    // 打开版本历史面板，确认 Named Version 行出现。
    await page.getByRole('tab', { name: '版本历史' }).click();
    const named = page.getByTestId('part-studio-named-versions');
    await expect(named).toBeVisible();
    await expect(named.getByText('E2E V1')).toBeVisible();
  });

  test('ribbon 工具真激活：ChamferEdges aria-pressed + 零未启动警告（圆角/扫掠均已改道对话框）', async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on('console', (message) => {
      consoleMessages.push(`[${message.type()}] ${message.text()}`);
    });

    const chamfer = page.getByRole('button', { name: '倒角', exact: true });
    await expect(chamfer).toBeVisible();
    await expect(chamfer).toHaveAttribute('aria-pressed', 'false');

    await chamfer.click();

    // 真激活双证：store 写入（aria-pressed）+ tools.run 真启动（console 零警告）。
    // aria-pressed 先于 tools.run 落定——单证会放过假激活（M4-T9 S4 反证口径：
    // 「命令未启动」警告 = 假激活）。
    await expect(chamfer).toHaveAttribute('aria-pressed', 'true');
    const warnings = consoleMessages.filter((text) => /未启动|激活失败/.test(text));
    expect(warnings, `ChamferEdges 激活不应有警告：\n${warnings.join('\n')}`).toHaveLength(0);
  });

  test('真实页签：「+」新建 Part Studio 换 scope + alt+~+t 页签管理器开合', async ({ page }) => {
    const tabStrip = page.getByTestId('part-studio-tab-strip');
    const tabs = tabStrip.getByRole('tab');
    // 默认 scope 已由解析器创建：恰一页签且 active（URL ?model= 同源）。
    await expect(tabs).toHaveCount(1);
    const firstScope = new URL(page.url()).searchParams.get('model');
    expect(firstScope).toBeTruthy();
    await expect(tabStrip.locator(`[data-studio-id="${firstScope}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // P2.4 起「+」= 直接创建默认名称 Part Studio（不再开页签管理器）：
    // 页签数 +1、URL 换新 scope、新页签 active。
    await page.getByTestId('part-studio-new-tab-button').click();
    await expect(tabs).toHaveCount(2, { timeout: 60_000 });
    const secondScope = new URL(page.url()).searchParams.get('model');
    expect(secondScope).toBeTruthy();
    expect(secondScope).not.toBe(firstScope);
    await expect(tabStrip.locator(`[data-studio-id="${secondScope}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // 页签管理器（os-33；P2.4 仅 alt+~+t 和弦入口）开合。
    await page.keyboard.press('Alt+Backquote');
    await page.keyboard.press('t');
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

  test('FeatureDialog 圆角通道（M6-b T6）：半径缺省 5 + 空边集禁提交 → ✗ 收合', async ({ page }) => {
    await page.getByRole('button', { name: '圆角', exact: true }).click();
    const dialog = page.getByTestId('part-studio-feature-dialog');
    await expect(dialog).toBeVisible();
    // 半径缺省 5（M6-b T6 裁决；距离区对 fillet 不适用——不在场）。
    await expect(dialog.getByRole('textbox', { name: '半径' })).toHaveValue('5');
    await expect(dialog.getByRole('textbox', { name: '距离' })).toBeHidden();
    // 空边集门禁：✓/成品 禁用（视口拾取链不自动断言——归 T7 真栈冒烟）。
    await expect(dialog.getByRole('button', { name: '确认', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '成品', exact: true })).toBeDisabled();

    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('A 旧文档只读（legacy 种子）', () => {
  test('打开 A 种子：只读横幅 + 无 ?model= + 写工具/保存/撤销收口', async ({ page }) => {
    test.slow();
    const legacy = await openLegacySeedEditor(page);

    // 无 registry/scope：URL 不带 ?model=；只读横幅显式在场（P2.4 A 语义）。
    expect(legacy.kind).toBe('A');
    await expect(page).not.toHaveURL(/[?&]model=/);
    await expect(page.getByTestId('part-studio-readonly-banner')).toBeVisible();

    // 写面收口：full 写工具（倒角）+ 顶栏保存版本/撤销/重做 禁用。
    await expect(page.getByRole('button', { name: '倒角', exact: true })).toBeDisabled();
    await expect(page.getByTestId('part-studio-save-button')).toBeDisabled();
    await expect(page.getByTestId('part-studio-undo-button')).toBeDisabled();
    await expect(page.getByTestId('part-studio-redo-button')).toBeDisabled();

    // 只读仍可看：连接 + 画布在场（waitEditorReady 已在 helper 内断言）。
    await expect(page.getByTestId('part-studio-status-connection')).toHaveText('已连接');
  });
});
