/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 设置页 e2e（M5-T5，会话注入零登录）：左导航三分区结构（帐户九项/订阅三项/
 * 团队一项，os-48）+ 首选项深色开关（联动 documentElement[data-theme] 与
 * localStorage）+ 占位分区诚实呈现。选择器第一来源 SettingsPage 族组件
 * testid + i18n 中文可访问名。
 */

import { expect, test } from '@playwright/test';
import { gotoRoute, loginWithSession } from './helpers';

test.beforeEach(async ({ page }) => {
  await loginWithSession(page);
  await gotoRoute(page, '/settings', 'settings-route');
});

test('左导航分区结构与默认个人资料面板', async ({ page }) => {
  // 三分区标题（分区标题与订阅/团队项同名——经标题类名作用域防双命中）
  const sidebar = page.getByTestId('settings-sidebar');
  await expect(sidebar).toBeVisible();
  const sectionTitles = sidebar.locator('.settings-sidebar__section-title');
  await expect(sectionTitles).toHaveCount(3);
  await expect(sectionTitles.filter({ hasText: '帐户' })).toBeVisible();
  await expect(sectionTitles.filter({ hasText: '订阅' })).toBeVisible();
  await expect(sectionTitles.filter({ hasText: '团队' })).toBeVisible();

  // 帐户九项在场（os-48 导航结构完整）
  for (const item of ['个人资料', '电子邮件', '首选项', '通知', '安全', '设备', '应用程序', '集成', '开发者']) {
    await expect(sidebar.getByRole('button', { name: item })).toBeVisible();
  }

  // 默认面板=个人资料（真实内容：标题 + 头像区）
  await expect(page.getByTestId('settings-panel').getByRole('heading', { name: '个人资料' })).toBeVisible();

  // 占位分区诚实呈现（团队=即将推出；NonIdealState heading 非 heading role）
  await sidebar.getByRole('button', { name: '团队' }).click();
  await expect(page.getByTestId('settings-panel').getByText('即将推出', { exact: true })).toBeVisible();
});

test('首选项深色开关联动 data-theme 与 localStorage', async ({ page }) => {
  await page.getByTestId('settings-sidebar').getByRole('button', { name: '首选项' }).click();
  const panel = page.getByTestId('settings-panel');
  await expect(panel.getByRole('heading', { name: '首选项' })).toBeVisible();

  // 深色开关在场（初始浅色——data-theme=light）
  const darkToggle = panel.getByRole('switch', { name: '深色模式' });
  await expect(darkToggle).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // 开：html data-theme + localStorage 同步落 dark
  await darkToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.evaluate(() => localStorage.getItem('luban-next-theme'))).resolves.toBe('dark');

  // 关：还原浅色（不给后续用例/人工调试留暗色态）
  await darkToggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // 语言选择在场（zh-CN/en 双语）
  await expect(panel.getByRole('combobox', { name: '语言' })).toBeVisible();
});
