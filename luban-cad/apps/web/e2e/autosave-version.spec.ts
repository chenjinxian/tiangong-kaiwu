/**
 * ADR-0017 Stage F 真栈验收：Onshape 式自动保存 + 文档级版本。
 *
 * 1) 常规 UI 无保存/推送入口（dock 历史面板）；
 * 2) UI 提交（新建草图）→ 自动静默 pushChanges（hub changesets 出现「自动保存」）；
 * 3) 左栏「创建版本…」→ Onshape f7 对话框（创建来自 Main 的版本，名称缺省 V1）
 *    → 版本历史出现命名版本；
 * 4) 刷新 + 冷重开：草图/命名版本仍在（无手动推送步骤）。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, openSeedImodelEditor } from './helpers.js';
import { resetBModelSeed, SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { finishSketch } from './tutorial2-helpers.js';
import { listExampleChangesets } from './examples/imodel.js';

test.describe('自动保存 + 创建版本（Stage F）', () => {
  test('UI 提交自动同步 hub；创建版本；冷重开仍在', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const seed = await resetBModelSeed(request, token);
    const openWithRetry = async () => {
      try {
        return await openSeedImodelEditor(page, seed);
      } catch {
        await page.reload();
        return openSeedImodelEditor(page, seed);
      }
    };
    let ctx = await openWithRetry();

    // ── 0) 常规 UI 无保存/推送入口 ─────────────────────────────────────────
    await expect(page.getByTestId('part-studio-autosave-state')).toBeAttached();
    await page.getByTestId('part-studio-panel-rail-history').click();
    const dock = page.getByTestId('part-studio-dock');
    await expect(dock.getByTestId('part-studio-dock-history')).toBeVisible();
    await expect(dock.getByTestId('part-studio-dock-save-button')).toHaveCount(0);
    await expect(dock.getByTestId('part-studio-dock-push-button')).toHaveCount(0);
    await expect(dock.getByTestId('part-studio-dock-unpushed-badge')).toHaveCount(0);

    const before = await listExampleChangesets(request, token, ctx.imodelId);

    // ── 1) UI 提交：新建草图（空草图先建壳）────────────────────────────────
    await page.getByRole('button', { name: '草图', exact: true }).click();
    const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
    await expect(sketchDialog).toBeVisible();
    // 2026-11-13：平面字段无下拉——树内基准面点击即选面并自动创建草图。
    await page.getByTestId('part-studio-feature-list')
      .getByRole('button', { name: 'Top', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: '草图工具' })).toBeVisible({ timeout: 120_000 });
    await finishSketch(page);

    // ── 2) 自动保存：hub changesets 增加（描述「自动保存」）────────────────
    await expect.poll(async () => (await listExampleChangesets(request, token, ctx.imodelId)).length, {
      timeout: 120_000,
      intervals: [1_000, 2_000, 5_000],
    }).toBeGreaterThan(before.length);
    const afterAuto = await listExampleChangesets(request, token, ctx.imodelId);
    expect(afterAuto.at(-1)?.description ?? '').toContain('自动保存');
    await expect(page.getByTestId('part-studio-autosave-state')).toHaveAttribute('data-state', 'idle');

    // ── 3) 创建版本（左栏；Onshape f7 对话框）──────────────────────────────
    await page.getByTestId('part-studio-panel-rail-create-version').click();
    const versionDialog = page.getByRole('dialog', { name: '创建来自 Main 的版本' });
    await expect(versionDialog).toBeVisible();
    const nameInput = versionDialog.getByLabel('名称');
    await expect(nameInput).toHaveValue('V1');
    await expect(versionDialog.getByRole('button', { name: '创建版本并编辑属性' })).toBeDisabled();
    await versionDialog.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.getByText('版本已创建')).toBeVisible({ timeout: 120_000 });

    // 历史面板是开关钮：已开则不再点（再点会收合）。
    if (!(await dock.getByTestId('part-studio-dock-history').isVisible().catch(() => false))) {
      await page.getByTestId('part-studio-panel-rail-history').click();
    }
    await expect(dock.getByTestId('part-studio-named-versions')).toBeVisible({ timeout: 60_000 });
    await expect(dock.getByTestId('part-studio-named-versions')).toContainText('V1');

    // ── 4) 刷新 + 冷重开：草图和命名版本仍在 ───────────────────────────────
    await page.reload();
    ctx = await openWithRetry();
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch']);
    await page.getByTestId('part-studio-panel-rail-history').click();
    await expect(page.getByTestId('part-studio-named-versions')).toContainText('V1', { timeout: 60_000 });
  });
});
