/**
 * Bumper Block 严格轨（2026-11-10 回滚快照 oracle 切片）。
 *
 * 背景（仅定性 + 证据指针）：
 * - 通用 `resolveScenarioEdges` 把 Fillet 1 的 9 条 CAP_FACE / SWEPT_EDGE /
 *   SWEPT_FACE 查询展开为 **12 条** lower-box 边（`1:1`..`1:12`），内核拒绝该
 *   边集（Fillet 1 status=1）。
 * - 本 spec 改为消费私有数据仓运行时生成的 `manifest/face-oracle-edges.json`：
 *   由 `Fillet 1` 执行前（rollbackBarIndex=3）bodydetails 的 matched edge（4 条）
 *   + matched face 的 loops/coedges 边界边展开、去重后得到选中边曲线；公共
 *   runner 经 `edgeOracle` 选项走 `resolveOracleEdges`（几何唯一匹配 →
 *   `resolveEdgeRef`）。公共源码不内嵌任何私有 id / 绝对路径。
 *
 * 严格门（run-file 缺省 policy 即 strict）：树类型一致、全部 status=0、
 * 1 body、逐 body 体积与采集目标 636,731.499 mm³ 相对误差 <0.5%、
 * push+冷重开。oracle 必须覆盖全部 20 条 body 边（`1:1`..`1:12` +
 * `2:1`..`2:8` 的持久引用布局属于真栈观测，本 spec 只断言 oracle 边数）；
 * 覆盖不足即测试失败闭合，不回退到人工 override。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import {
  edgeOracleMapForPartStudio,
  loadRollbackEdgeOracleManifest,
  type RollbackEdgeOracle,
} from './replay/rollback-edge-oracle.js';
import { resolveScenarioFile, runScenarioFile } from './replay/run-file.js';

const SCENARIO =
  'scenarios/Explore-Onshape-Models-7c199f0e3db618e8abeb0d95-f664ba9907810c60c6fba5e2.scenario.json';
const FILLET_FEATURE_NAME = 'Fillet 1';
const EXPECTED_BODY_EDGES = 20;
/** 采集目标（非精确断言值）：636,731.499 mm³（Onshape bodydetails）。 */
const TARGET_VOLUME_MM3 = 636_731.499;

/**
 * 运行时从私有数据根加载 oracle，并按 scenario 自带的 docId/elementId 过滤到
 * 本 Part Studio（不在公共源码写死私有 id）。文件缺失/无条目返回 undefined。
 */
function loadBumperEdgeOracle(): ReadonlyMap<string, RollbackEdgeOracle> | undefined {
  const oracleFile = path.join(DEFAULT_DATA_ROOT, 'manifest', 'face-oracle-edges.json');
  if (!existsSync(oracleFile)) return undefined;
  const manifest = loadRollbackEdgeOracleManifest(oracleFile);
  const scenario = JSON.parse(readFileSync(resolveScenarioFile(SCENARIO), 'utf8')) as {
    docId?: string;
    elementId?: string;
  };
  if (!scenario.docId || !scenario.elementId)
    throw new Error('Bumper scenario 缺少 docId/elementId，无法定位 oracle');
  const map = edgeOracleMapForPartStudio(manifest, {
    docId: scenario.docId,
    elementId: scenario.elementId,
  });
  return map.size > 0 ? map : undefined;
}

test.describe('Bumper Block 严格轨（Fillet 1 回滚快照 oracle）', () => {
  test('scenario-file → target 636,731.499 mm³ / status 0 / 1 body / push+冷重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    const edgeOracle = loadBumperEdgeOracle();
    test.skip(edgeOracle === undefined, 'face-oracle-edges.json 不在场或未覆盖 Bumper Block');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_500_000);
    const filletOracle = edgeOracle!.get(FILLET_FEATURE_NAME);
    expect(filletOracle, `${FILLET_FEATURE_NAME} 缺少 oracle 条目`).toBeDefined();
    expect(
      filletOracle!.status,
      `${FILLET_FEATURE_NAME} oracle 采集不完整：${filletOracle!.blockedReason ?? 'unknown'}`,
    ).toBe('ready');

    const result = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'Onshape example: Bumper Block (strict rollback oracle)',
      reset: true,
      skipSketchConstraints: true,
      // 严格门显式 0.5%：scenario 自带的 tolerance=0.01 不用于本 spec。
      tolerance: 0.005,
      edgeOracle,
    });
    const actual = result.volumes[0]!;
    const expected = result.expected[0]!;
    const relative = Math.abs(actual - expected) / expected;
    console.log(
      `[bumper-strict] volume=${actual.toFixed(3)} expected=${expected.toFixed(3)} ` +
      `target=${TARGET_VOLUME_MM3.toFixed(3)} ` +
      `delta=${((actual - TARGET_VOLUME_MM3) / TARGET_VOLUME_MM3 * 100).toFixed(3)}% ` +
      `oracleEdges=${filletOracle!.edges.length}/${filletOracle!.bodyEdgeCount ?? '?'}`,
    );
    expect(result.volumes).toHaveLength(1);
    expect(Math.abs(expected - TARGET_VOLUME_MM3), 'scenario 采集目标漂移').toBeLessThan(1e-3);
    expect(relative, '体积相对误差必须 <0.5%').toBeLessThan(0.005);
    // fail closed：oracle 必须覆盖全部 20 条 body 边；少于 20 时不回退人工 override。
    expect(
      filletOracle!.edges.length,
      `${FILLET_FEATURE_NAME} oracle 覆盖 ${filletOracle!.edges.length}/` +
      `${filletOracle!.bodyEdgeCount ?? '?'} 条 body 边；要求恰好 ${EXPECTED_BODY_EDGES} 条`,
    ).toBe(EXPECTED_BODY_EDGES);
  });
});
