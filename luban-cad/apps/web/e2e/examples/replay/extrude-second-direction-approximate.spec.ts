/**
 * 第二方向 UP_TO_SURFACE 静态近似（test-only，2026-11-08）真栈验收。
 *
 * converter 把 Onshape 的 secondDirection UP_TO_SURFACE 转成
 * `{endBound:'blind', distanceMm:<已解算深度>, approximate:true, sourceBound}`
 * （目标面查询未采集；产品第二方向仅 blind/throughAll，up-to 未映射）。translator 必须显式标 approximate
 * 并在 notes 记录；本 spec 走完整 scenario runner → 20×20 拉伸 10 + 第二方向 5
 * = 6000 mm³，push + 重开一致。
 */
import { expect, test } from '@playwright/test';
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import {
  getApiToken,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../../seed.js';
import { ensureExampleImodel, openExampleEditor, pushExampleChanges } from '../imodel.js';
import { runScenario } from './run.js';
import type { ParityScenario } from './scenario-to-op.js';

function rectangle(width: number, height: number): { entities: SketchEntityDto[]; constraints: SketchConstraintDto[] } {
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

test.describe('第二方向 UP_TO_SURFACE 静态近似', () => {
  test('scenario secondDirection approximate → blind(5) → 6000 mm³ push+重开', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
    const token = await getApiToken();
    const ids = await ensureExampleImodel(request, token, 'E2E - Second Direction Approx', { reset: true });
    const ctx = await openExampleEditor(page, ids);
    const sketch = rectangle(20, 20);
    const scenario: ParityScenario = {
      schemaVersion: 1,
      id: 'synthetic-second-direction-approximate',
      docId: 'synthetic',
      elementId: 'synthetic',
      owner: 'synthetic',
      name: 'Second Direction Approx',
      units: 'mm',
      features: [
        {
          type: 'sketch',
          name: 'Sketch 1',
          sourceFeatureId: 's1',
          params: { entities: sketch.entities, constraints: sketch.constraints },
        },
        {
          type: 'extrude',
          name: 'Extrude 1',
          sourceFeatureId: 'e1',
          params: {
            operation: 'new',
            endBound: 'blind',
            depthMm: 10,
            secondDirection: {
              endBound: 'blind',
              distanceMm: 5,
              approximate: true,
              sourceBound: 'UP_TO_SURFACE',
            },
            selection: { kind: 'sketchRegions', sketchFeatureId: 's1', regions: [0] },
          },
        },
      ],
      expected: { volumeM3: 0, bodyCount: 1 },
    } as ParityScenario;

    const built = await runScenario(ctx, scenario, token, { skipSketchConstraints: true });
    expect(built.steps.map((step) => step.type)).toEqual(['sketch', 'extrude']);
    expect(built.steps[1]?.approximate).toBe(true);
    expect(built.notes.some((note) => note.includes('secondDirection=UP_TO_SURFACE→blind(5mm'))).toBe(true);

    const mass = async () => {
      const items = await getMassPropertiesRpc(ctx, token);
      return { count: items.length, total: items.reduce((sum, item) => sum + item.volume, 0) };
    };
    let result = await mass();
    console.log(`[second-direction-approx] bodies=${result.count} total=${result.total.toFixed(3)}`);
    expect(result.count).toBe(1);
    expect(result.total).toBeCloseTo(6000, 2);

    await pushExampleChanges(page, 'second direction up-to approximation');
    await page.reload();
    await openExampleEditor(page, ids);
    const tree = await getFeatureTreeRpc(ctx, token);
    expect(tree.map((row) => row.featureType)).toEqual(['sketch', 'extrude']);
    expect(tree.every((row) => row.status === 0)).toBe(true);
    result = await mass();
    expect(result.total).toBeCloseTo(6000, 2);
  });
});
