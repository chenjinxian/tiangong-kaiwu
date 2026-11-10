/**
 * Bumper Block 严格轨（ADR-0016 A3/A4：S10 CAP_FACE profile → faceExtrude + rb=3 oracle）。
 *
 * 背景（定性 + 证据指针，不含私有 id）：
 * - Extrude 2 是 S10 面驱动 CAP_FACE profile：converter 输出 `capFaceProfile`
 *   （起始面 z=40、startOffset=0、10° 收窄拔模、depth 40）；runner 在步骤时点把
 *   起始面证据解析为持久 bodyId/faceRef，改走产品 faceExtrude（A2 解析边壳体）。
 * - Fillet 1 的私有回滚快照 oracle（rb=3）覆盖 Onshape 实际选中的 **16 条**边
 *   （5 个面 + 4 条边：顶面/4 个锥面 + 4 条竖边）。body 共 20 条边，剩余 4 条是
 *   z=0 底面环——Onshape 结果中它们是**尖边**（最终 body 仅 16 个 R5 圆角柱面，
 *   没有 z≈5 的底环圆角；live 截图底边为直尖边），因此 oracle 的 16 条是完整
 *   选择，不是部分选择。历史审计 20 边 override 多选了底面环，导致 −0.374%。
 * - 旧的 20 边审计 override 已移除；本 spec 只走 oracle，oracle 不是恰好 16 条
 *   就失败闭合（不猜、不用部分边集）。
 *
 * 严格门（run-file 缺省 policy 即 strict）：树类型一致（Extrude 2 = faceExtrude）、
 * 全部 status=0（push 前/冷重开后）、1 body、最终体积 vs 采集目标
 * 636,731.499 mm³ 相对误差 <0.5%、push+冷重开；本 spec 额外断言 pre-fillet
 * 657,764.787 mm³（A2 硬门）+ 20/20 解析 line/arc 边（无 curvePrimitive）。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { FeatureTreeEntry, FilletEdgeRef } from '@luban-cad/shared';
import { getFeatureTreeRpc, getMassPropertiesRpc, msRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { readBodyEdgeHandles, type EdgeHandle } from './replay/edge-resolver.js';
import {
  edgeOracleMapForPartStudio,
  loadRollbackEdgeOracleManifest,
  matchOracleToProductEdges,
  resolveOracleEdges,
  type RollbackEdgeOracle,
} from './replay/rollback-edge-oracle.js';
import { resolveScenarioFile, runScenarioFile } from './replay/run-file.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';

const SCENARIO =
  'scenarios/Explore-Onshape-Models-7c199f0e3db618e8abeb0d95-f664ba9907810c60c6fba5e2.scenario.json';
const FILLET_FEATURE_NAME = 'Fillet 1';
/** Onshape Fillet 1 实际选中边数（rb=3 oracle；底面 4 条尖边不在选择内）。 */
const EXPECTED_SELECTED_EDGES = 16;
/** 预圆角 body 的全部边数（A2 解析边门：20/20 line/arc）。 */
const EXPECTED_BODY_EDGES = 20;
/** 未选中的底面 loop 边数（z=0 四边；Onshape 保持尖边）。 */
const EXPECTED_BOTTOM_LOOP_EDGES = 4;
/** 已解析 16 条产品边的持久引用集（product topology；node1 少 1:3/1:7/1:10/1:12）。 */
const EXPECTED_SELECTED_REF_KEYS = [
  '1:1', '1:2', '1:4', '1:5', '1:6', '1:8', '1:9', '1:11',
  '2:1', '2:2', '2:3', '2:4', '2:5', '2:6', '2:7', '2:8',
] as const;
/** 采集目标（非精确断言值）：636,731.499 mm³（Onshape bodydetails）。 */
const TARGET_VOLUME_MM3 = 636_731.499;
/** A2 硬门：Extrude 1 + Extrude 2（10° 收窄拔模）预圆角体积。 */
const PRE_FILLET_VOLUME_MM3 = 657_764.7871846836;
/** Extrude 2 增量（prismoid 闭式/ rb=3 BRep 积分）。 */
const EXTRUDE2_INCREMENT_MM3 = 297_764.7871846836;
/** 预圆角/增量使用**绝对**容差（实测精确到 1e-6 mm³；0.01 mm³ 已足够严格）。 */
const PRE_FILLET_ABS_TOLERANCE_MM3 = 0.01;
/** z=0 底面 loop 判定容差（mm）。 */
const BOTTOM_LOOP_Z_TOLERANCE_MM = 0.01;

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

/** 边 kind 直方图（A2 解析边门：全部 line/arc，无 other/curvePrimitive）。 */
function edgeKindSummary(handles: readonly EdgeHandle[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const handle of handles) {
    const key = handle.curve.kind === 'other'
      ? `other:${handle.curve.geometryType}`
      : handle.curve.kind;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * 复核 faceExtrude 落库参数（push 前 + 冷重开后共用）：S10/S11/S9 语义必须
 * 持久化而不是只在运行态生效。
 */
function assertStoredFaceExtrudeParams(row: FeatureTreeEntry | undefined, label: string): void {
  expect(row, `${label}：缺 faceExtrude 树行`).toBeDefined();
  expect(row!.featureType, `${label}：树行类型`).toBe('faceExtrude');
  const params = row!.params as {
    bodyId?: string;
    faceRef?: { nodeId?: number; entityId?: number };
    operation?: string;
    endBound?: string;
    depthMm?: number;
    direction?: string;
    startOffsetMm?: number;
    draftAngleDeg?: number;
    draftPullDirection?: boolean;
  };
  console.log(`[bumper-strict] ${label} faceExtrude params=${JSON.stringify(params)}`);
  expect(params.bodyId, `${label}：faceExtrude 必须落 bodyId`).toBeTruthy();
  expect(Number.isInteger(params.faceRef?.nodeId), `${label}：faceRef.nodeId`).toBe(true);
  expect(Number.isInteger(params.faceRef?.entityId), `${label}：faceRef.entityId`).toBe(true);
  expect(params.operation, `${label}：operation`).toBe('add');
  expect(params.endBound, `${label}：endBound`).toBe('blind');
  expect(params.depthMm, `${label}：depthMm`).toBe(40);
  expect(params.direction, `${label}：direction`).toBe('forward');
  expect(params.startOffsetMm, `${label}：startOffsetMm`).toBe(0);
  expect(params.draftAngleDeg, `${label}：draftAngleDeg`).toBeCloseTo(10, 9);
  expect(params.draftPullDirection, `${label}：draftPullDirection`).toBe(true);
}

test.describe('Bumper Block 严格轨（S10 faceExtrude + rb=3 oracle 16/16）', () => {
  test('scenario-file → target 636,731.499 mm³ / status 0 / 1 body / push+冷重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    const edgeOracle = loadBumperEdgeOracle();
    const filletOracle = edgeOracle?.get(FILLET_FEATURE_NAME);
    console.log(
      `[bumper-strict] oracle=${filletOracle
        ? `${filletOracle.status}:${filletOracle.edges.length}/${filletOracle.bodyEdgeCount ?? '?'}`
        : 'absent'}`,
    );
    expect(filletOracle, 'Fillet 1 的 rb=3 oracle 条目必须存在（严格轨不使用审计回退）').toBeDefined();
    expect(filletOracle!.status, 'oracle 必须 ready（blocked 即失败闭合）').toBe('ready');
    expect(
      filletOracle!.edges.length,
      `rb=3 oracle 必须覆盖 Onshape 实际选择的 ${EXPECTED_SELECTED_EDGES} 条边`,
    ).toBe(EXPECTED_SELECTED_EDGES);

    let preFilletVolume: number | undefined;
    let preFilletEdgeKinds: Record<string, number> | undefined;
    let preFilletEdgeCount: number | undefined;
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_500_000);
    const result = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'Onshape example: Bumper Block (S10 faceExtrude + rb=3 oracle)',
      reset: true,
      skipSketchConstraints: true,
      // 严格门显式 0.5%：scenario 自带的 tolerance=0.01 不用于本 spec。
      tolerance: 0.005,
      // review 2026-11-10：精确轨硬门 approximateSteps=0（run-file 内断言，
      // 不再只依赖末尾的显式断言）。
      requireExact: true,
      // Fillet 1 步骤：先用只读通道记录 pre-fillet 体积/边类型（A2 硬门），
      // 再走 oracle 解析；oracle 不恰好 16 条即失败闭合，绝不回退审计 20 边。
      edgeRefsOverride: async ({ feature, page: overridePage, ctx, accessToken, bodyContext }) => {
        if (feature.name !== FILLET_FEATURE_NAME) return undefined;
        // Extrude 2 必须在树里是 faceExtrude 且 status=0（S10 映射证据）。
        // 本回调发生在 Fillet 1 插入之前，故树只有已应用的前 3 行。
        const tree = await getFeatureTreeRpc(ctx, accessToken);
        expect(
          tree.map((row) => row.featureType),
          `Fillet 1 前树类型（Extrude 2 必须已是 faceExtrude）：${JSON.stringify(tree.map((row) => row.featureType))}`,
        ).toEqual(['sketch', 'extrude', 'faceExtrude']);
        expect(tree.every((row) => row.status === 0), 'Fillet 1 前树全部 status=0').toBe(true);
        // 落库参数证据：S11 startOffset=0、S9 draft 10° pullDirection=true、
        // 方向 forward（面 z=40 外法向）；bodyId/faceRef 由起始面解析器写入。
        assertStoredFaceExtrudeParams(tree[2], 'pre-push');

        // pre-fillet 体积（A2 硬门：657,764.787；绝对容差 0.01 mm³，实测精确）。
        const mass = await getMassPropertiesRpc(ctx, accessToken);
        expect(mass.length, 'pre-fillet 必须恰 1 body').toBe(1);
        preFilletVolume = mass[0]!.volume;
        expect(
          Math.abs(preFilletVolume - PRE_FILLET_VOLUME_MM3),
          `pre-fillet 体积 ${preFilletVolume} 必须 = ${PRE_FILLET_VOLUME_MM3} ±${PRE_FILLET_ABS_TOLERANCE_MM3} mm³`,
        ).toBeLessThan(PRE_FILLET_ABS_TOLERANCE_MM3);
        // Extrude 2 增量单独断言（= pre-fillet − Extrude 1 360,000）。
        const extrude2Increment = preFilletVolume - 360_000;
        expect(
          Math.abs(extrude2Increment - EXTRUDE2_INCREMENT_MM3),
          `Extrude 2 增量 ${extrude2Increment} 必须 = ${EXTRUDE2_INCREMENT_MM3} ±${PRE_FILLET_ABS_TOLERANCE_MM3} mm³`,
        ).toBeLessThan(PRE_FILLET_ABS_TOLERANCE_MM3);

        // A2 解析边硬门：pre-fillet body 20/20 边全为 line/arc（无 curvePrimitive）。
        const handles = await readBodyEdgeHandles(overridePage, ctx, accessToken);
        preFilletEdgeCount = handles.length;
        preFilletEdgeKinds = edgeKindSummary(handles);
        console.log(
          `[bumper-strict] pre-fillet volume=${preFilletVolume.toFixed(6)} ` +
          `edges=${handles.length} kinds=${JSON.stringify(preFilletEdgeKinds)}`,
        );
        expect(handles.length, `pre-fillet body 必须恰 ${EXPECTED_BODY_EDGES} 条边`).toBe(EXPECTED_BODY_EDGES);
        expect(preFilletEdgeKinds['other'] ?? 0, 'pre-fillet 边不得含 curvePrimitive/other').toBe(0);
        expect(
          (preFilletEdgeKinds.line ?? 0) + (preFilletEdgeKinds.arc ?? 0),
          'pre-fillet 边必须全为 line/arc',
        ).toBe(EXPECTED_BODY_EDGES);

        // Onshape 选择 = 16 条；body 另 4 条必须是 z=0 底面 loop 且**未选中**
        // （最终 body 是尖边）。oracle 曲线对 20 条 body 边做唯一匹配，未命中的
        // 4 条即未选边；按几何断言它们在 z=0，而不是硬编码私有边 id。
        expect(
          filletOracle!.unselectedBodyEdgeIds?.length,
          'oracle 必须声明底面 loop 的 4 条未选边',
        ).toBe(EXPECTED_BOTTOM_LOOP_EDGES);
        const oracleMatches = matchOracleToProductEdges(filletOracle!, handles);
        expect(oracleMatches.handles.length, 'oracle 曲线必须命中 16 条产品边').toBe(EXPECTED_SELECTED_EDGES);
        const matchedHandleKeys = new Set(
          oracleMatches.handles.map((handle) => `${handle.bodyKey}:${handle.subEntityId}`),
        );
        const unselectedHandles = handles.filter(
          (handle) => !matchedHandleKeys.has(`${handle.bodyKey}:${handle.subEntityId}`),
        );
        expect(
          unselectedHandles.length,
          `未选中的 body 边必须恰 ${EXPECTED_BOTTOM_LOOP_EDGES} 条（当前 ${unselectedHandles.length}）`,
        ).toBe(EXPECTED_BOTTOM_LOOP_EDGES);
        for (const handle of unselectedHandles) {
          const p0 = handle.curve.p0;
          const p1 = handle.curve.p1;
          if (handle.curve.kind !== 'line' || !p0 || !p1)
            throw new Error(
              `未选中的底面 loop 边不是 line：${handle.bodyKey}:${handle.subEntityId} (${handle.curve.kind})`,
            );
          expect(
            Math.abs(p0[2]),
            `未选边 ${handle.bodyKey}:${handle.subEntityId} 起点必须 z=0`,
          ).toBeLessThan(BOTTOM_LOOP_Z_TOLERANCE_MM);
          expect(
            Math.abs(p1[2]),
            `未选边 ${handle.bodyKey}:${handle.subEntityId} 终点必须 z=0`,
          ).toBeLessThan(BOTTOM_LOOP_Z_TOLERANCE_MM);
        }
        console.log(
          `[bumper-strict] unselected bottom-loop edges=` +
          unselectedHandles.map((handle) => `${handle.bodyKey}:${handle.subEntityId}`).join(','),
        );

        // oracle-only：几何唯一匹配 → resolveEdgeRef；必须恰好 16 条引用。
        const resolved = await resolveOracleEdges(
          overridePage,
          ctx,
          feature,
          filletOracle!,
          accessToken,
          bodyContext,
        );
        const keys = resolved.refs
          .map((ref: FilletEdgeRef) => `${ref.edge.nodeId}:${ref.edge.entityId}`)
          .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        console.log(
          `[bumper-strict] oracle refs=${resolved.refs.length} bodyKeys=${JSON.stringify(resolved.bodyKeys)} refs=${keys.join(',')}`,
        );
        expect(
          resolved.refs.length,
          `oracle 必须解析出恰好 ${EXPECTED_SELECTED_EDGES} 条产品边（当前 ${resolved.refs.length}）`,
        ).toBe(EXPECTED_SELECTED_EDGES);
        expect(keys, 'oracle 必须解析出已知 16 条持久边引用集').toEqual([...EXPECTED_SELECTED_REF_KEYS]);
        expect(resolved.bodyKeys?.length, 'oracle 必须落在单一 body').toBe(1);
        return {
          ...resolved,
          notes: [
            ...resolved.notes,
            `edgeOracle=${FILLET_FEATURE_NAME}: ${EXPECTED_SELECTED_EDGES}/${EXPECTED_SELECTED_EDGES} refs（rb=3 oracle；底面 4 条尖边不在选择内，无审计回退）`,
          ],
        };
      },
    });
    expect(result.approximateSteps, 'Bumper 严格轨必须 approximateSteps=0').toBe(0);
    expect(
      result.reopenedTree.map((row) => row.featureType),
      '冷重开后树类型必须为 S10 faceExtrude 全链',
    ).toEqual(['sketch', 'extrude', 'faceExtrude', 'fillet', 'sketch', 'hole']);
    expect(result.reopenedTree.every((row) => row.status === 0), '冷重开后全部 status=0').toBe(true);
    // 冷重开后重新读树：faceExtrude 的 bodyId/faceRef/startOffset/draft/pull 必须
    // 持久化仍在（不是只在 push 前运行态有效）。
    assertStoredFaceExtrudeParams(
      result.reopenedTree.find((row) => row.featureType === 'faceExtrude'),
      'cold-reopened',
    );
    const actual = result.volumes[0]!;
    const expected = result.expected[0]!;
    const relative = Math.abs(actual - expected) / expected;
    console.log(
      `[bumper-strict] volume=${actual.toFixed(3)} expected=${expected.toFixed(3)} ` +
      `target=${TARGET_VOLUME_MM3.toFixed(3)} ` +
      `delta=${((actual - TARGET_VOLUME_MM3) / TARGET_VOLUME_MM3 * 100).toFixed(3)}% ` +
      `oracleRefs=${EXPECTED_SELECTED_EDGES}`,
    );
    console.log(`[bumper-strict] preFilletVolume=${preFilletVolume?.toFixed(6)} ` +
      `edges=${preFilletEdgeCount} kinds=${JSON.stringify(preFilletEdgeKinds)}`);
    expect(result.volumes).toHaveLength(1);
    expect(Math.abs(expected - TARGET_VOLUME_MM3), 'scenario 采集目标漂移').toBeLessThan(1e-3);
    expect(relative, '体积相对误差必须 <0.5%').toBeLessThan(0.005);
  });
});
