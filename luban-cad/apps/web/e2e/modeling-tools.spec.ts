/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { loginWithSession, navigateToEditor, activateToolbarTool, SEED_PROJECT_NAME } from './helpers';

/** 工具条按钮「可见的文案（accessible name）→ 注册 toolId」映射（CadToolbar.tsx + registerTools.ts） */
const TOOLBAR_TOOLS: Record<string, string> = {
  '并集 (Unite)': 'UniteSolids',
  '差集 (Subtract)': 'SubtractSolids',
  '交集 (Intersect)': 'IntersectSolids',
  '圆角 (Fillet)': 'RoundEdges',
  '倒角 (Chamfer)': 'ChamferEdges',
  '抽壳 (Shell)': 'HollowFaces',
  '面偏移 (Offset Face)': 'OffsetFaces',
  '拉伸面 (Sweep Face)': 'SweepFaces',
  '拔模 (Draft)': 'DraftFaces',
  '镜像 (Mirror)': 'MirrorElements',
};

/**
 * E2E Tests for Modeling Tools
 * Tests all modeling tools including the newly implemented ones:
 * - Boolean tools (Unite, Subtract, Intersect)
 * - OffsetFaces
 * - SweepFaces
 *
 * 断言依据：工具激活提示走 outputPrompt 无 UI 消费（不落 DOM），
 * 故激活断言用 window.IModelApp.toolAdmin.activeTool.toolId（main.tsx 调试暴露）。
 */

test.describe('Modeling Tools - Basic Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
  });

  test('login should succeed and show project page', async ({ page }) => {
    // Verify we're on the projects page（section-title 即过滤标签 heading）
    await expect(page.locator('.section-title')).toHaveText('我的项目');
    await expect(page.getByText(SEED_PROJECT_NAME).first()).toBeVisible();
  });
});

// 编辑器内 15 个测试共享同一 seed iModel 的 briefcase —— 串行防连接争用
test.describe.configure({ mode: 'serial' }); // 编辑器内 15 个测试共享同一 seed iModel 的 briefcase —— 串行防连接争用

test.describe('Modeling Tools - Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
    await navigateToEditor(page);
  });

  test('should display CAD toolbar with all categories', async ({ page }) => {
    const toolbar = page.locator('.cad-toolbar-horizontal');
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Check all tool categories are visible
    const categories = ['草图', '实体', '变换', '布尔', '边', '面', '高级'];
    for (const category of categories) {
      await expect(toolbar.getByText(category, { exact: true })).toBeVisible();
    }
  });

  test('should display boolean tool buttons', async ({ page }) => {
    const toolbar = page.locator('.cad-toolbar-horizontal');
    for (const label of ['并集', '差集', '交集']) {
      // 工具按钮的 label 是 React prop（渲染为 aria-label），title= / label= 属性选择器均不适用
      await expect(toolbar.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();
    }
  });

  test('should display face tool buttons', async ({ page }) => {
    const toolbar = page.locator('.cad-toolbar-horizontal');
    for (const label of ['抽壳', '面偏移', '拉伸面', '拔模']) {
      await expect(toolbar.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();
    }
  });

  test('should display edge tool buttons', async ({ page }) => {
    const toolbar = page.locator('.cad-toolbar-horizontal');
    for (const label of ['圆角', '倒角']) {
      await expect(toolbar.getByRole('button', { name: new RegExp(label) }).first()).toBeVisible();
    }
  });
});

test.describe('Modeling Tools - Activation', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
    await navigateToEditor(page);
  });

  for (const [buttonName, toolId] of Object.entries(TOOLBAR_TOOLS)) {
    test(`should activate ${toolId} tool without error`, async ({ page }) => {
      await activateToolbarTool(page, buttonName, toolId);
    });
  }
});

test.describe('Modeling Tools - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithSession(page);
    await navigateToEditor(page);
  });

  test('should handle tool activation without console errors', async ({ page }) => {
    const toolbar = page.locator('.cad-toolbar-horizontal');

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('Console error:', msg.text());
      }
    });

    // Test all tools
    for (const [buttonName, toolId] of Object.entries(TOOLBAR_TOOLS)) {
      // Clear previous errors
      consoleErrors.length = 0;

      await activateToolbarTool(page, buttonName, toolId);

      // Check no critical errors
      const criticalErrors = consoleErrors.filter(e =>
        e.includes('Tool not registered') ||
        e.includes('undefined is not') ||
        e.includes('cannot read property') ||
        e.includes('is not a function')
      );

      expect(criticalErrors, `工具 ${toolId} 不应产生关键 console 错误`).toHaveLength(0);

      // Press Escape to exit tool
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });
});
