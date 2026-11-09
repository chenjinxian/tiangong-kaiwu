/**
 * Bumper Block 严格轨（2026-11-10 回滚快照 oracle + 审计 override 回退）：
 * Fillet 1 的 20 边覆盖。
 *
 * 背景（仅定性 + 证据指针）：
 * - 通用 `resolveScenarioEdges` 把 Fillet 1 的 9 条 CAP_FACE / SWEPT_EDGE /
 *   SWEPT_FACE 查询展开为 **12 条** lower-box 边（`1:1`..`1:12`），内核拒绝该
 *   边集（Fillet 1 status=1）。
 * - 私有回滚快照 oracle（`manifest/face-oracle-edges.json`，rb=3）是本示例的
 *   **首选**路径：matched edge（4 条）+ matched face 的 loops/coedges 边界边
 *   展开、去重后得到选中边曲线；公共 runner 经 `edgeOracle` 选项走
 *   `resolveOracleEdges`（几何唯一匹配 → `resolveEdgeRef`）。
 * - 本示例 oracle 实测 fail closed：展开仅 **16/20** 条 body 边（缺底面 4 条
 *   loop 边），且其中 4 条锥面斜边在产品侧是 `kind:'other'(curvePrimitive)`
 *   （Extrude 2 的 startOffset+draft 近似），无几何可比。只有 oracle 解析出
 *   **恰好 20 条**产品边时才采用；否则回退到本示例专用的审计 20 边 override
 *   （Onshape live evidence；native/private 证据只在私有审计台账）。回退原因
 *   写入 notes 并打印，绝不把部分边集当成功。
 *
 * 严格门（run-file 缺省 policy 即 strict）：树类型一致、全部 status=0、
 * 1 body、逐 body 体积与采集目标 636,731.499 mm³ 相对误差 <0.5%、
 * push+冷重开。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { msRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { readBodyEdgeHandles } from './replay/edge-resolver.js';
import {
  edgeOracleMapForPartStudio,
  loadRollbackEdgeOracleManifest,
  resolveOracleEdges,
  type RollbackEdgeOracle,
} from './replay/rollback-edge-oracle.js';
import { resolveScenarioFile, runScenarioFile } from './replay/run-file.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';

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

test.describe('Bumper Block 严格轨（Fillet 1 oracle 优先 + 审计 20 边回退）', () => {
  test('scenario-file → target 636,731.499 mm³ / status 0 / 1 body / push+冷重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    const edgeOracle = loadBumperEdgeOracle();
    const filletOracle = edgeOracle?.get(FILLET_FEATURE_NAME);
    console.log(
      `[bumper-strict] oracle=${filletOracle
        ? `${filletOracle.status}:${filletOracle.edges.length}/${filletOracle.bodyEdgeCount ?? '?'}`
        : 'absent'}`,
    );
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_500_000);
    const result = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'Onshape example: Bumper Block (strict oracle + audited fallback)',
      reset: true,
      skipSketchConstraints: true,
      // 严格门显式 0.5%：scenario 自带的 tolerance=0.01 不用于本 spec。
      tolerance: 0.005,
      // 本示例专用：先试 oracle，只有恰好 20 条产品边时才采用；否则回退审计
      // 20 边 override。回退原因进入 notes（run-file 会汇总到步骤 notes）。
      edgeRefsOverride: async ({ feature, page: overridePage, ctx, accessToken, bodyContext }) => {
        if (feature.name !== FILLET_FEATURE_NAME) return undefined;
        let oracleFailure: string;
        if (!filletOracle) {
          oracleFailure = 'oracle 条目缺失';
        } else if (filletOracle.status === 'blocked') {
          oracleFailure = `oracle blocked: ${filletOracle.blockedReason ?? 'unknown'}`;
        } else {
          try {
            const resolved = await resolveOracleEdges(
              overridePage,
              ctx,
              feature,
              filletOracle,
              accessToken,
              bodyContext,
            );
            if (resolved.refs.length === EXPECTED_BODY_EDGES) {
              console.log(`[bumper-strict] oracle refs=${resolved.refs.length} → 采用 oracle`);
              return {
                ...resolved,
                notes: [...resolved.notes, `edgeOracle=${FILLET_FEATURE_NAME}: ${EXPECTED_BODY_EDGES}/${EXPECTED_BODY_EDGES} refs（oracle 路径）`],
              };
            }
            oracleFailure = `oracle refs=${resolved.refs.length}，要求恰好 ${EXPECTED_BODY_EDGES}`;
          } catch (error) {
            oracleFailure = (error as Error).message;
          }
        }
        console.log(`[bumper-strict] oracle fail-closed → audited fallback: ${oracleFailure}`);

        // 审计回退：读当前 body 全部边（与 BRep 显示同一只读枚举通道），逐条
        // resolveEdgeRef → 持久边引用；数量/引用集不符即失败闭合。
        const handles = await readBodyEdgeHandles(overridePage, ctx, accessToken);
        expect(
          handles.length,
          `${FILLET_FEATURE_NAME} 回退要求当前 body 恰 ${EXPECTED_BODY_EDGES} 条边`,
        ).toBe(EXPECTED_BODY_EDGES);
        const refs: FilletEdgeRef[] = [];
        const bodyKeys = new Set<string>();
        for (const handle of handles) {
          const resolvedRef = (await msRpc(
            ctx.itwinId,
            ctx.imodelId,
            'resolveEdgeRef',
            [ctx.dbKey, handle.bodyKey, handle.subEntityId],
            accessToken,
          )) as { ok: boolean; ref?: FilletEdgeRef; error?: string };
          expect(
            resolvedRef.ok && resolvedRef.ref !== undefined,
            `${FILLET_FEATURE_NAME} resolveEdgeRef 失败: ${resolvedRef.error ?? 'unknown'}`,
          ).toBe(true);
          refs.push(resolvedRef.ref!);
          bodyKeys.add(handle.bodyKey);
        }
        const keys = refs
          .map((ref) => `${ref.edge.nodeId}:${ref.edge.entityId}`)
          .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        // 真栈实测（2026-11-09）：单 body 的 20 条边分属两个持久 topological
        // node——node 1 = lower box 12 条（1:1..1:12，即通用 resolver 当前
        // 命中的子集），node 2 = upper taper 8 条（2:1..2:8）。这里 pin 全量
        // 引用集，防止枚举/解析只回子集时静默通过。
        const expectedKeys = [
          ...Array.from({ length: 12 }, (_value, index) => `1:${index + 1}`),
          ...Array.from({ length: 8 }, (_value, index) => `2:${index + 1}`),
        ];
        console.log(`[bumper-strict] Fillet 1 audited fallback refs=${keys.join(',')}`);
        expect(keys, `${FILLET_FEATURE_NAME} 回退引用集必须恰为全 body 20 边`).toEqual(expectedKeys);
        expect(bodyKeys.size, `${FILLET_FEATURE_NAME} 回退必须落在单一 body`).toBe(1);
        return {
          refs,
          bodyKeys: Array.from(bodyKeys),
          notes: [
            `edgeOverride=${FILLET_FEATURE_NAME}: audited 20-edge selection from ` +
            'Onshape live evidence（native/private evidence 见私有审计台账）；' +
            `refs=${keys.join(',')}`,
            `edgeOracle fail-closed（${oracleFailure}）→ 使用审计 20 边回退；` +
            '不回退到部分边集、不猜 curvePrimitive',
          ],
        };
      },
    });
    const actual = result.volumes[0]!;
    const expected = result.expected[0]!;
    const relative = Math.abs(actual - expected) / expected;
    console.log(
      `[bumper-strict] volume=${actual.toFixed(3)} expected=${expected.toFixed(3)} ` +
      `target=${TARGET_VOLUME_MM3.toFixed(3)} ` +
      `delta=${((actual - TARGET_VOLUME_MM3) / TARGET_VOLUME_MM3 * 100).toFixed(3)}%`,
    );
    expect(result.volumes).toHaveLength(1);
    expect(Math.abs(expected - TARGET_VOLUME_MM3), 'scenario 采集目标漂移').toBeLessThan(1e-3);
    expect(relative, '体积相对误差必须 <0.5%').toBeLessThan(0.005);
  });
});
