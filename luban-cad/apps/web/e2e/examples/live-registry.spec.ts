/**
 * 私有 live-specs 的批量构建/验证入口（2026-11-11 策略切换）。
 *
 * 数据目录：`$ONSHAPE_PARITY_DATA/live-specs/*.json`（私有）。
 * 每个 spec 独立 iModel；无数据时整个 suite skip，不伪造 fixture。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc, reloadWithFlush } from '../helpers';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { openExampleEditor, pushExampleChanges } from './imodel.js';
import type { LiveSpec } from './live/live-spec.js';
import { runLiveSpec } from './live/run-live.js';

const LIVE_DIR = path.join(DEFAULT_DATA_ROOT, 'live-specs');

function loadSpecs(): LiveSpec[] {
  if (!existsSync(LIVE_DIR)) return [];
  return readdirSync(LIVE_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(LIVE_DIR, file), 'utf8')) as LiveSpec);
}

const specs = loadSpecs();

interface MassRow {
  bodyKey: string;
  volume: number;
  centroid: { x: number; y: number; z: number };
  surfaceArea?: number;
}

const MASS_REL_TOLERANCE = 1e-9;
const MASS_ABS_TOLERANCE = 1e-9;

/**
 * 质量属性持久化回读门（live spec 建链结果 vs push/reload 后 RPC 回读）：
 * - bodyKey 列表逐项严格相等——body 身份/顺序不得漂移；
 * - volume / surfaceArea / centroid 保留逐字段断言，容差只吸收 double
 *   序列化与求值顺序带来的 1e-15 级漂移（相对/绝对 1e-9，远小于任何几何
 *   公差；不是「大致相等」式的放松）；
 * - surfaceArea 可选：两侧必须同时缺席或同时在场。
 * 旧 `toEqual` 会在仅 1e-15 质心漂移时假红，掩盖真实几何回归。
 */
function expectMassPropertiesClose(actual: MassRow[], expected: MassRow[]): void {
  expect(actual.map((row) => row.bodyKey), 'bodyKey 必须逐项严格一致').toEqual(
    expected.map((row) => row.bodyKey),
  );
  expect(actual, '质量属性行数必须一致').toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) {
    const a = actual[index]!;
    const e = expected[index]!;
    const field = `${e.bodyKey}.`;
    const volumeTolerance = Math.max(Math.abs(e.volume), 1) * MASS_REL_TOLERANCE;
    expect(
      Math.abs(a.volume - e.volume),
      `${field}volume 偏差超容差（actual=${a.volume} expected=${e.volume}）`,
    ).toBeLessThanOrEqual(volumeTolerance);
    expect(a.surfaceArea === undefined, `${field}surfaceArea 在场性必须一致`).toBe(
      e.surfaceArea === undefined,
    );
    if (e.surfaceArea !== undefined) {
      const areaTolerance = Math.max(Math.abs(e.surfaceArea), 1) * MASS_REL_TOLERANCE;
      expect(
        Math.abs(a.surfaceArea - e.surfaceArea),
        `${field}surfaceArea 偏差超容差（actual=${a.surfaceArea} expected=${e.surfaceArea}）`,
      ).toBeLessThanOrEqual(areaTolerance);
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(
        Math.abs(a.centroid[axis] - e.centroid[axis]),
        `${field}centroid.${axis} 偏差超容差（actual=${a.centroid[axis]} expected=${e.centroid[axis]}）`,
      ).toBeLessThanOrEqual(MASS_ABS_TOLERANCE);
    }
  }
}

test.describe('live UI 复刻 registry', () => {
  test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
  test.skip(specs.length === 0, 'live-specs 为空');

  for (const spec of specs) {
    test(`${spec.title}（${spec.status}）`, async ({ page, request }) => {
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      const result = await runLiveSpec(page, request, spec);
      const expectedTree = spec.steps
        .filter((step) => step.kind !== 'skipped')
        .map((step) => step.kind === 'sketch' ? 'sketch' : step.kind);
      expect(result.tree.map((row) => row.featureType)).toEqual(expectedTree);
      expect(result.tree.every((row) => row.status === 0)).toBe(true);
      const activeBodies = result.bodies.filter((body) => body.active !== false && body.authored !== false);
      console.log(
        `[live] ${spec.id} bodies=${activeBodies.length} masses=` +
        JSON.stringify(result.mass.map((entry) => Number(entry.volume.toFixed(3)))),
      );
      if (spec.expected?.bodyCount !== undefined)
        expect(activeBodies).toHaveLength(spec.expected.bodyCount);
      const volume = result.mass.reduce((sum, entry) => sum + entry.volume, 0);
      if (spec.expected?.volumeMm3 !== undefined) {
        const tolerance = spec.expected.tolerance ?? 0.02;
        console.log(
          `[live] ${spec.id} volume=${volume.toFixed(3)} expected=${spec.expected.volumeMm3.toFixed(3)} ` +
          `delta=${((Math.abs(volume - spec.expected.volumeMm3) / spec.expected.volumeMm3) * 100).toFixed(3)}%`,
        );
        expect(Math.abs(volume - spec.expected.volumeMm3) / spec.expected.volumeMm3).toBeLessThan(tolerance);
      }

      await pushExampleChanges(page, `live ${spec.id}`);
      await reloadWithFlush(page);
      await openExampleEditor(page, result.ids);
      expect(await getFeatureTreeRpc(result.ctx, result.token)).toEqual(result.tree);
      expect(await getBodiesRpc(result.ctx, result.token)).toEqual(result.bodies);
      expectMassPropertiesClose(
        (await getMassPropertiesRpc(result.ctx, result.token)) as MassRow[],
        result.mass as MassRow[],
      );
    });
  }
});
