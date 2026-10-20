/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Share 流 e2e（RW4-P3-T3-2）：
 * 详情页 hero「分享项目」→ 添加成员（真数据 POST /accesscontrol/.../members/users）→
 * 成员行出现 → 移除按钮按 UUID 守卫降级（aria-disabled+inline 说明）→ 链接页 = origin + /documents/:id。
 *
 * 限流纪律：登录一律 loginWithSession（零登录请求）。
 * 契约备注（2026-10-20 实探）：本 hub 的 GET members/users 回 `id = userId`
 *（成员行 id=userId，邀请时即 email），而 PATCH/DELETE 路由 Param 走 ParseUUIDPipe →
 * 对 email 形态 id 返回 400；故本 spec 不提交移除（成员行出现 + 确认框可达即止），
 * 收尾用 `/itwins/:id/members` facade 的 member row UUID 做 best-effort 清理。
 */

import { test, expect } from '@playwright/test';
import { loginWithSession, SEED_PROJECT_NAME } from './helpers';

const HUB = 'http://localhost:5400';

test.describe('Share Project Dialog', () => {
  test('invite by email adds a member row and the share surfaces render', async ({ page }) => {
    test.setTimeout(120000);

    await loginWithSession(page);

    // 进入种子项目详情
    const projectTile = page.locator('main').getByRole('button', { name: SEED_PROJECT_NAME }).first();
    await expect(projectTile, 'seed 项目卡片未出现——起栈+seed 后重跑').toBeVisible({ timeout: 20000 });
    await projectTile.click();
    await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 15000 });
    const projectId = page.url().split('/documents/')[1] ?? '';

    // 入口补齐：hero 分享按钮此前无 true 置位点
    await page.getByRole('button', { name: '分享项目' }).first().click();
    const dialog = page.getByRole('dialog', { name: '分享项目' });
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // 成员页真数据加载完成（空态或既有成员行）
    await expect(dialog.getByRole('tab', { name: /^成员/ })).toBeVisible();
    await expect(async () => {
      const empty = await dialog.getByText('暂无成员').isVisible().catch(() => false);
      const rows = await dialog.locator('.share-member').count();
      expect(empty || rows > 0).toBe(true);
    }).toPass({ timeout: 15000 });

    // 邀请（唯一邮箱，避免历史残留干扰断言）
    const email = `share-e2e-${Date.now()}@example.com`;
    await dialog.getByRole('tab', { name: '邀请成员' }).click();
    await dialog.getByPlaceholder('colleague@company.com').fill(email);
    await dialog.getByRole('button', { name: '添加成员' }).click();

    // 邀请成功切回成员页——成员行出现（POST members/users 直接加成员）
    const memberRow = dialog.locator('.share-member').filter({ hasText: email });
    await expect(memberRow).toBeVisible({ timeout: 15000 });

    // 现 hub 契约缺陷：成员行 id=email（非 UUID），PATCH/DELETE 必 400——
    // 前端按 UUID 守卫显式降级：移除/改角色禁用 + inline 诚实说明（不呈现「请重试」）
    await expect(memberRow.getByRole('button', { name: '移除成员' }))
      .toHaveAttribute('aria-disabled', 'true');
    await expect(memberRow.getByText(/暂不支持修改或移除该成员/)).toBeVisible();

    // 链接页 = origin + /documents/:iTwinId
    await dialog.getByRole('tab', { name: '分享链接' }).click();
    await expect(dialog.locator('#share-link-input')).toHaveValue(
      `${new URL(page.url()).origin}/documents/${projectId}`,
    );

    await dialog.getByRole('button', { name: '关闭' }).click();
    await expect(dialog).toBeHidden();

    // 收尾：facade 用 member row UUID 删除（access-control 路由该 id 非 UUID，勿用）
    await page.evaluate(
      async ({ hub, pid, email }) => {
        const authJson = sessionStorage.getItem('luban_cad_auth');
        const auth = authJson ? JSON.parse(authJson) : null;
        const headers: Record<string, string> = auth?.accessToken
          ? { Authorization: `Bearer ${auth.accessToken}` }
          : {};
        const res = await fetch(`${hub}/itwins/${pid}/members`, { headers });
        if (!res.ok) return;
        const body = (await res.json()) as { data?: Array<{ id: string; email?: string }> };
        const row = (body.data ?? []).find((m) => m.email === email);
        if (row) {
          await fetch(`${hub}/itwins/${pid}/members/${row.id}`, { method: 'DELETE', headers });
        }
      },
      { hub: HUB, pid: projectId, email },
    ).catch(() => undefined);
  });
});
