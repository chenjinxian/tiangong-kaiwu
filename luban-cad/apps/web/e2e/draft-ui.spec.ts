/**
 * ADR-0021 AX-01 真栈 UI 验收：DraftDialog + TaperFaces op 37。
 *
 * 盒 20×20×10（4000 mm³）→ 分视角视口选侧面 x=20 与底面 z=0 → ribbon「拔模」
 * → 对话框中把底面指定为中性面、方向 Z、角度 15° → insertFeature/draft →
 * TaperFaces 使顶边内收，体积约 3732.05 mm³ → push + 冷重开一致。
 */
import { expect, test } from '@playwright/test';
import type { FeatureOp, SketchConstraintDto, SketchEntityDto, SketchPlaneDto } from '@luban-cad/shared';
import {
  applyFeatureOpRpc,
  assertFeatureOpOk,
  borrowWriteLease,
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc, reloadWithFlush } from './helpers';
import { SEED_AND_OPEN_TIMEOUT_MS } from './seed.js';
import { frameStandardView, projectWorld } from './tutorial2-helpers.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from './examples/imodel.js';

function rectangleSketch(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
  return {
    entities: [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: width, y: 0 },
      { kind: 'point', id: 3, x: width, y: height },
      { kind: 'point', id: 4, x: 0, y: height },
      { kind: 'point', id: 5, x: 0, y: 0 },
      { kind: 'point', id: 6, x: width, y: 0 },
      { kind: 'point', id: 7, x: width, y: height },
      { kind: 'point', id: 8, x: 0, y: height },
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

const XY_PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

const RANGE = { low: { x: 0, y: 0, z: 0 }, high: { x: 20, y: 20, z: 10 } };
const EXPECTED_VOLUME = 20 * 10 * (20 + (20 - 10 * Math.tan((15 * Math.PI) / 180))) / 2;

test.describe('Draft UI（ADR-0021 AX-01）', () => {
  test('选侧面+底面 → 中性面/15°/Z → TaperFaces 体积下降、push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Draft UI', { reset: true });
    const openWithRetry = async () => {
      try {
        return await openExampleEditor(page, ids);
      } catch {
        await reloadWithFlush(page);
        return await openExampleEditor(page, ids);
      }
    };
    let ctx = await openWithRetry();
    const lease = await borrowWriteLease(ctx, token, 'draft-ui');

    const apply = async (op: FeatureOp, label: string): Promise<string> => {
      const result = await applyFeatureOpRpc(ctx, op, lease, token);
      assertFeatureOpOk(result, label);
      return result.featureId ?? '';
    };

    const sketch = rectangleSketch(20, 20);
    const sketchId = await apply(
      { kind: 'insertSketch', entities: sketch.entities, constraints: sketch.constraints, plane: XY_PLANE },
      '盒体草图',
    );
    await apply(
      { kind: 'insertFeature', featureType: 'extrude', params: { profile: [], distance: 10, sketchId, regions: [0] } },
      '盒体拉伸',
    );

    await frameStandardView(page, 6, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('画布不可用');

    interface RawFace {
      kind: string;
      id: string;
      label?: string;
      ownerBodyKey: string;
      topologyId: { nodeId: number; entityId: number };
    }
    const readSelection = () => page.evaluate(() => (
      window as unknown as {
        __lubanE2EApp: { usePartStudioStore: { getState(): { canvas: { selection: Array<Record<string, unknown>> } } } };
      }
    ).__lubanE2EApp.usePartStudioStore.getState().canvas.selection) as Promise<Array<Record<string, unknown>>>;

    const clickPoint = async (point: { x: number; y: number; z: number }): Promise<void> => {
      const [screen] = await projectWorld(page, { x: box.x, y: box.y }, [point]);
      if (!screen) throw new Error('投影失败');
      // 先移动让 accuSnap.currHit 建立（iTwin locate 异步），再按下；直接
      // mouse.click 的 move→down 间隔太短，down 时 currHit 尚未刷新会被当空白点击清空。
      await page.mouse.move(screen.x, screen.y);
      await page.waitForTimeout(400);
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.mouse.up();
      await page.waitForTimeout(250);
    };

    // 分视角单击捕获不同面（Ctrl 叠加在不同视角下易被取消），把两条选择直接写回
    // 唯一选择权威 store；这是 e2e 取面手段，不改产品选择语义。
    // 面选择走异步 resolveFaceRef RPC，点击后 store 可能滞后，故轮询而非单读。
    const pickFace = async (
      points: { x: number; y: number; z: number }[],
      label: string,
    ): Promise<RawFace> => {
      for (const point of points) {
        await clickPoint(point);
        for (let attempt = 0; attempt < 24; attempt++) {
          const selection = await readSelection();
          const face = selection.find((entry) => entry.kind === 'face'
            && entry.topologyId !== undefined && entry.ownerBodyKey !== undefined);
          if (face) return face as unknown as RawFace;
          if (selection.length > 0 && attempt === 0) {
            console.log(`[draft-ui] ${label} 点击后即时选择: ${JSON.stringify(selection)}`);
          }
          await page.waitForTimeout(250);
        }
      }
      throw new Error(`${label} 拾取失败`);
    };

    // Iso 看顶面；Bottom 看底面；Right 看 x=20 侧面。
    await frameStandardView(page, 6, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const top = await pickFace([{ x: 10, y: 10, z: 10 }], '顶面');
    await frameStandardView(page, 1, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const neutral = await pickFace([{ x: 10, y: 10, z: 0 }, { x: 8, y: 9, z: 0 }, { x: 12, y: 11, z: 0 }], '底面');
    await frameStandardView(page, 3, RANGE, { left: 0.2, right: 0.05, top: 0.15, bottom: 0.1 });
    const side = await pickFace([{ x: 20, y: 10, z: 5 }, { x: 20, y: 8, z: 4 }, { x: 20, y: 12, z: 6 }], '侧面');
    if (top.topologyId.nodeId === neutral.topologyId.nodeId && top.topologyId.entityId === neutral.topologyId.entityId)
      throw new Error('顶面与底面引用相同（视角取面失败）');
    await page.evaluate((entries: RawFace[]) => {
      const app = (window as unknown as {
        __lubanE2EApp: { usePartStudioStore: { getState(): { setCanvasSelection(selection: RawFace[]): void } } };
      }).__lubanE2EApp;
      app.usePartStudioStore.getState().setCanvasSelection(entries);
    }, [side, neutral]);

    await page.getByRole('button', { name: '拔模', exact: true }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('part-studio-draft-dialog');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    const neutralValue = `${neutral.ownerBodyKey}:${neutral.topologyId.nodeId}:${neutral.topologyId.entityId}`;
    await dialog.getByTestId('part-studio-draft-neutral').selectOption(neutralValue);
    await dialog.getByTestId('part-studio-draft-angle').fill('15');
    await expect(dialog.getByTestId('part-studio-draft-direction')).toHaveValue('Z');
    await expect(dialog.getByTestId('part-studio-draft-add-step')).toBeChecked();
    const confirm = dialog.getByRole('button', { name: '确认' });
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId('part-studio-feature-preview'))
      .toHaveAttribute('data-dynamic', '1', { timeout: 60_000 });
    await confirm.click({ timeout: 30_000 });
    await expect(dialog).toBeHidden({ timeout: 180_000 });

    const readVolume = async (context: typeof ctx): Promise<number> => {
      const items = await getMassPropertiesRpc(context, token);
      return items.reduce((sum, item) => sum + item.volume, 0);
    };
    let volume = await readVolume(ctx);
    console.log(`[draft-ui] volume=${volume.toFixed(3)} expected≈${EXPECTED_VOLUME.toFixed(3)}`);
    expect(volume).toBeGreaterThan(3500);
    expect(volume).toBeLessThan(3900);
    // ACIS 与解析值可能有 1–2% 量化差；此处保护 3%。
    expect(Math.abs(volume - EXPECTED_VOLUME) / EXPECTED_VOLUME).toBeLessThan(0.03);

    let tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'draft']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    expect(tree[2]?.params).toMatchObject({
      faces: [{ nodeId: side.topologyId.nodeId, entityId: side.topologyId.entityId }],
      neutralFace: { nodeId: neutral.topologyId.nodeId, entityId: neutral.topologyId.entityId },
      pullDirection: 'Z',
      angleDeg: 15,
    });

    await pushExampleChanges(page, 'draft UI acceptance');
    await reloadWithFlush(page);
    ctx = await openWithRetry();
    tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude', 'draft']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    volume = await readVolume(ctx);
    expect(volume).toBeGreaterThan(3500);
    expect(volume).toBeLessThan(3900);
  });
});
