/**
 * W2.10 真栈 UI 验收：featurePattern 树行抑制/取消抑制/删除（通用树 op 通道）。
 *
 * 40×40×10 盒（16000）+ 顶面 4×4×5 凸台（80）→ featurePattern linear count=3
 * spacing=6（16240；count 含原件，后端只补 count−1 份增量）。
 *   右键「抑制」→ 源凸台仍在 = 16080，行 data-suppressed=true；
 *   「取消抑制」→ 16240；
 *   「删除」→ HITL 确认 → 树剩 sketch/extrude/sketch/extrude；**body 不再生**
 *     （后端 M1 deleteFeature 语义：ChamferFlow.test.ts「10. 删除链尾」钉；
 *     live/冷重开读均 16240）。push + 重开后树形一致。
 * 删除后 body 不更新是已登记的 M1 缺口（RW2-T9 backlog）；第二用例以
 * test.fail 钉住正确期望 16080，后端修再生后该标记会翻红提示摘除。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
  releaseWriteLease,
} from './helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number, x0 = 0, y0 = 0): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  const x1 = x0 + width;
  const y1 = y0 + height;
  return {
    entities: [
      { kind: 'point', id: 1, x: x0, y: y0 },
      { kind: 'point', id: 2, x: x1, y: y0 },
      { kind: 'point', id: 3, x: x1, y: y1 },
      { kind: 'point', id: 4, x: x0, y: y1 },
      { kind: 'point', id: 5, x: x0, y: y0 },
      { kind: 'point', id: 6, x: x1, y: y0 },
      { kind: 'point', id: 7, x: x1, y: y1 },
      { kind: 'point', id: 8, x: x0, y: y1 },
      { kind: 'line', id: 11, p1: 5, p2: 6 },
      { kind: 'line', id: 12, p1: 6, p2: 7 },
      { kind: 'line', id: 13, p1: 7, p2: 8 },
      { kind: 'line', id: 14, p1: 8, p2: 5 },
    ],
    constraints: [
      { kind: 'coincident', id: 21, refs: [1, 5] },
      { kind: 'coincident', id: 22, refs: [2, 6] },
      { kind: 'coincident', id: 23, refs: [3, 7] },
      { kind: 'coincident', id: 24, refs: [4, 8] },
      { kind: 'horizontal', id: 25, refs: [11] },
      { kind: 'horizontal', id: 26, refs: [13] },
      { kind: 'vertical', id: 27, refs: [12] },
      { kind: 'vertical', id: 28, refs: [14] },
      { kind: 'distance', id: 29, refs: [1, 2], value: width },
      { kind: 'distance', id: 30, refs: [2, 3], value: height },
    ],
  };
}

const XY_PLANE = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};
const TOP_PLANE = {
  origin: { x: 0, y: 0, z: 10 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

test.describe('featurePattern 树行抑制/删除（W2.10）', () => {
  test('抑制 16240→16080 → 取消抑制 → 删除树行（body 不更新，M1 已登记）→ push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern Tree Ops', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await page.reload();
        return openExampleEditor(page, ids);
      }
    };
    const ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern-tree-ops');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };
    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };

    const base = rectangleSketch(40, 40, -20, -20);
    const baseSketch = await apply(
      { kind: 'insertSketch', entities: base.entities, constraints: base.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId: baseSketch, regions: [0], operation: 'new' } },
      '盒体拉伸',
    );
    const boss = rectangleSketch(4, 4, 2, 2);
    const bossSketch = await apply(
      { kind: 'insertSketch', entities: boss.entities, constraints: boss.constraints, plane: TOP_PLANE },
      '凸台草图',
    );
    const bossFeature = await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 5, sketchId: bossSketch, regions: [0], operation: 'add' } },
      '凸台拉伸',
    );
    await apply(
      {
        kind: 'insertFeature',
        featureType: 'featurePattern',
        params: {
          sourceFeatureId: bossFeature,
          kind: 'linear',
          count: 3,
          spacing: 6,
          axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        },
      },
      '特征阵列',
    );
    expect(await mass()).toBeCloseTo(16240, 0);
    const patternRow = (await getFeatureTreeRpc(ctx, token)).find((row) => row.featureType === 'featurePattern');
    expect(patternRow?.id).toBeTruthy();

    // UI 树 op 走 applyOp（写租约）；释放 e2e 租约给 UI 会话。
    await releaseWriteLease(ctx, lease, token);
    const row = page.getByTestId(`tree-row-${patternRow!.id}`);
    const featureMenu = page.getByRole('menu', { name: '特征菜单' });
    await expect(row).toBeVisible({ timeout: 90_000 });

    // 抑制：pattern 只补 count−1 份增量，源凸台仍在 → 16080。
    await row.click({ button: 'right' });
    await expect(featureMenu).toBeVisible();
    await featureMenu.getByRole('menuitem', { name: '抑制', exact: true }).click();
    await expect.poll(mass, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBeCloseTo(16080, 0);
    await expect(row).toHaveAttribute('data-suppressed', 'true', { timeout: 90_000 });

    // 取消抑制
    await row.click({ button: 'right' });
    await expect(featureMenu).toBeVisible();
    await featureMenu.getByRole('menuitem', { name: '取消抑制', exact: true }).click();
    await expect.poll(mass, { timeout: 90_000, intervals: [2000, 5000, 10_000] }).toBeCloseTo(16240, 0);
    await expect(row).not.toHaveAttribute('data-suppressed', 'true', { timeout: 90_000 });

    // 删除（HITL 确认）：树行移除。**会话内 body 保持旧几何**——后端 M1
    // deleteFeature 语义（不触发再生；ChamferFlow.test.ts「10. 删除链尾」钉），
    // 因此 live 读仍为 16240；冷重建（push+重开）后才回 16080。
    await row.click({ button: 'right' });
    await expect(featureMenu).toBeVisible();
    await featureMenu.getByRole('menuitem', { name: '删除', exact: true }).click();
    const confirmDialog = page.getByRole('dialog', { name: /删除 特征阵列/ });
    await expect(confirmDialog).toBeVisible({ timeout: 15_000 });
    await confirmDialog.getByRole('button', { name: '删除', exact: true }).click();
    await expect(confirmDialog).toBeHidden();
    await expect.poll(async () => (await getFeatureTreeRpc(ctx, token)).map((r) => r.featureType), {
      timeout: 90_000,
      intervals: [2000, 5000, 10_000],
    }).toEqual(['sketch', 'extrude', 'sketch', 'extrude']);
    expect(await mass(), 'M1 删除语义：会话内不再生').toBeCloseTo(16240, 0);

    // 持久化后树形一致；body 仍为删除前形态（冷重开同样不再生 → 16240）。
    await pushExampleChanges(page, 'featurePattern tree ops acceptance');
    await page.reload();
    await openWithRetry();
    expect((await getFeatureTreeRpc(ctx, token)).map((r) => r.featureType))
      .toEqual(['sketch', 'extrude', 'sketch', 'extrude']);
    expect(await mass(), 'M1 删除语义：冷重开仍不再生').toBeCloseTo(16240, 0);
  });

  test('KNOWN-RED：删除 pattern 后 body 应重算为 16080', async ({ page, request }) => {
    // M1 deleteFeature 不触发体再生（RW2-T9 backlog）；本用例钉正确期望，
    // 后端修复后翻红提示摘除 test.fail。RPC 建链（无 UI 交互），避免重复 UI 成本。
    test.fail(true, 'M1 deleteFeature 不触发 body 再生（RW2-T9 backlog）');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 300_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Feature Pattern Tree Ops', { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const lease = await borrowWriteLease(ctx, token, 'feature-pattern-tree-ops-red');
    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };
    const base = rectangleSketch(40, 40, -20, -20);
    const baseSketch = await apply(
      { kind: 'insertSketch', entities: base.entities, constraints: base.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId: baseSketch, regions: [0], operation: 'new' } },
      '盒体拉伸',
    );
    const boss = rectangleSketch(4, 4, 2, 2);
    const bossSketch = await apply(
      { kind: 'insertSketch', entities: boss.entities, constraints: boss.constraints, plane: TOP_PLANE },
      '凸台草图',
    );
    const bossFeature = await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 5, sketchId: bossSketch, regions: [0], operation: 'add' } },
      '凸台拉伸',
    );
    const patternId = await apply(
      {
        kind: 'insertFeature',
        featureType: 'featurePattern',
        params: {
          sourceFeatureId: bossFeature,
          kind: 'linear',
          count: 3,
          spacing: 6,
          axis: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        },
      },
      '特征阵列',
    );
    await apply({ kind: 'deleteFeature', featureId: patternId }, '删除特征阵列');
    const items = await getMassPropertiesRpc(ctx, token);
    const total = items.reduce((sum, item) => sum + item.volume, 0);
    expect(total).toBeCloseTo(16080, 0);
  });
});
