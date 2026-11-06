/**
 * T3 参数化抽壳真栈验收（ShellDialog）。
 *
 * 合成盒体（20×20×10）→ 选中顶面 → ribbon「抽壳」→ 壁厚 1 mm 向内 →
 * 移除顶面。期望体积 = 20·20·10 − 18·18·9 = 1084 mm³。
 * 断言：树 sketch/extrude/shell 全 status=0、单 body、体积、undo/redo、
 * 推送后重开树/体积一致。面选择走真实 OnshapeSelectTool（store.canvas.selection）。
 */
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { frameStandardView, projectWorld } from './tutorial2-helpers.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';
import { runScenario } from './examples/replay/run.js';
import type { ParityScenario } from './examples/replay/scenario-to-op.js';

const EXAMPLE_NAME = 'E2E - Shell';
const BOX_VOLUME_MM3 = 20 * 20 * 10;
const SHELL_VOLUME_MM3 = 20 * 20 * 10 - 18 * 18 * 9;
const RANGE = { low: { x: 0, y: 0, z: 0 }, high: { x: 20, y: 20, z: 10 } };

function boxScenario(): ParityScenario {
  return {
    schemaVersion: 1,
    id: 'e2e-shell-box',
    name: 'T3 shell box',
    units: 'mm',
    features: [
      {
        type: 'sketch',
        name: 'Sketch 1',
        sourceFeatureId: 'sketch-1',
        params: {
          plane: {
            origin: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 1 },
            xDir: { x: 1, y: 0, z: 0 },
          },
          entities: [
            { kind: 'line', id: 1, p1: { x: 0, y: 0 }, p2: { x: 20, y: 0 } },
            { kind: 'line', id: 2, p1: { x: 20, y: 0 }, p2: { x: 20, y: 20 } },
            { kind: 'line', id: 3, p1: { x: 20, y: 20 }, p2: { x: 0, y: 20 } },
            { kind: 'line', id: 4, p1: { x: 0, y: 20 }, p2: { x: 0, y: 0 } },
          ],
          constraints: [],
        },
      },
      {
        type: 'extrude',
        name: 'Extrude 1',
        sourceFeatureId: 'extrude-1',
        params: {
          operation: 'new',
          endBound: 'blind',
          depthMm: 10,
          symmetric: false,
          oppositeDirection: false,
          selection: {
            kind: 'sketchRegions',
            sketchFeatureId: 'sketch-1',
            regionIndex: 0,
            regions: [0],
          },
        },
      },
    ],
    expected: { volumeM3: BOX_VOLUME_MM3 * 1e-9, bodyCount: 1 },
    provenance: { capturedAt: '2026-11-06', status: 'complete', missing: [] },
  };
}

test.describe('T3 shell dialog', () => {
  test('顶面移除 + 1 mm 内缩 → 树/体积/undo/重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, EXAMPLE_NAME, { reset: true });
    const ctx = await openExampleEditor(page, ids);
    await runScenario(ctx, boxScenario(), token);

    await page.reload();
    await openExampleEditor(page, ids);
    // Top 视图：顶面全可见，避免等轴测下投影点被其它面遮挡。
    await frameStandardView(page, 0, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });

    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画布不可用');
    const candidates = [
      { x: 10, y: 10, z: 10 },
      { x: 9, y: 9, z: 10 },
      { x: 11, y: 11, z: 10 },
      { x: 10, y: 11, z: 10 },
    ];
    const screens = await projectWorld(page, { x: box.x, y: box.y }, candidates);
    for (const screen of screens) {
      await page.mouse.click(screen.x, screen.y);
      await page.waitForTimeout(500);
      const kind = await page.evaluate(() => {
        const selection = (window as unknown as {
          __lubanE2EApp: { usePartStudioStore: { getState(): { canvas: { selection: Array<{ kind: string }> } } } };
        }).__lubanE2EApp.usePartStudioStore.getState().canvas.selection;
        return selection[0]?.kind;
      });
      if (kind === 'face') break;
    }
    await expect.poll(() => page.evaluate(() => {
      const selection = (window as unknown as {
        __lubanE2EApp: { usePartStudioStore: { getState(): { canvas: { selection: Array<{ kind: string }> } } } };
      }).__lubanE2EApp.usePartStudioStore.getState().canvas.selection;
      return selection.map((entry) => entry.kind);
    }), { timeout: 10_000 }).toEqual(['face']);

    await page.getByRole('button', { name: '抽壳', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-shell-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.locator('.part-studio-feature-dialog__profile-chip')).toHaveCount(1, { timeout: 10_000 });
    await dialog.getByTestId('part-studio-shell-thickness').fill('1');
    await expect(dialog.getByTestId('part-studio-shell-confirm')).toBeEnabled({ timeout: 15_000 });
    await dialog.getByTestId('part-studio-shell-confirm').click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'shell']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    const mass = await getMassPropertiesRpc(ctx, token);
    expect(mass.length).toBe(1);
    const volume = mass.reduce((sum, item) => sum + item.volume, 0);
    console.log(`[shell] volume=${volume.toFixed(3)} expected≈${SHELL_VOLUME_MM3}`);
    expect(volume).toBeLessThan(BOX_VOLUME_MM3);
    expect(Math.abs(volume - SHELL_VOLUME_MM3) / SHELL_VOLUME_MM3).toBeLessThan(0.02);

    // 原生 undo/redo：shell 行必须可撤销。
    const undo = page.getByTestId('part-studio-ribbon-undo');
    await expect(undo).toBeEnabled({ timeout: 90_000 });
    await undo.click();
    await expect.poll(async () => (await getFeatureTreeRpc(ctx, token)).map((row) => row.featureType), {
      timeout: 60_000,
    }).toEqual(['sketch', 'extrude']);
    const redo = page.getByTestId('part-studio-ribbon-redo');
    await expect(redo).toBeEnabled({ timeout: 90_000 });
    await redo.click();
    await expect.poll(async () => (await getFeatureTreeRpc(ctx, token)).map((row) => row.featureType), {
      timeout: 90_000,
    }).toEqual(['sketch', 'extrude', 'shell']);

    await pushExampleChanges(page, 'T3 shell dialog');
    await page.reload();
    await openExampleEditor(page, ids);
    const reopened = await getFeatureTreeRpc(ctx, token);
    expect(reopened.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'shell']);
    const reopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(reopenedVolume - SHELL_VOLUME_MM3) / SHELL_VOLUME_MM3).toBeLessThan(0.02);

    // 双击树行二次编辑：壁厚 1 → 2（内腔 16×16×8），验证 updateParams 与回显。
    const featureList = page.getByTestId('part-studio-feature-list');
    await featureList.getByRole('button', { name: /抽壳/ }).dblclick();
    const editDialog = page.getByTestId('part-studio-shell-dialog');
    await expect(editDialog).toBeVisible({ timeout: 30_000 });
    await expect(editDialog.getByTestId('part-studio-shell-thickness')).toHaveValue('1');
    await editDialog.getByTestId('part-studio-shell-thickness').fill('2');
    await editDialog.getByTestId('part-studio-shell-confirm').click({ timeout: 30_000 });
    await expect(editDialog).toBeHidden({ timeout: 180_000 });
    const editedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    const expectedEdited = 20 * 20 * 10 - 16 * 16 * 8;
    expect(Math.abs(editedVolume - expectedEdited) / expectedEdited).toBeLessThan(0.02);

    await pushExampleChanges(page, 'T3 shell dialog edit');
    await page.reload();
    await openExampleEditor(page, ids);
    const editedReopened = (await getFeatureTreeRpc(ctx, token)).map((row) => row.featureType);
    expect(editedReopened).toEqual(['sketch', 'extrude', 'shell']);
    const editedReopenedVolume = (await getMassPropertiesRpc(ctx, token)).reduce((sum, item) => sum + item.volume, 0);
    expect(Math.abs(editedReopenedVolume - expectedEdited) / expectedEdited).toBeLessThan(0.02);
  });
});
