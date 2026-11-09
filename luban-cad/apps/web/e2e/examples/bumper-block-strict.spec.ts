/**
 * Bumper Block 严格轨（2026-11-09 follow-up）：Fillet 1 的审计 20 边覆盖。
 *
 * 背景（仅定性 + 证据指针）：
 * - 通用 `resolveScenarioEdges` 把 Fillet 1 的 9 条 CAP_FACE / SWEPT_EDGE /
 *   SWEPT_FACE 查询展开为 **12 条** lower-box 边（`1:1`..`1:12`），内核拒绝该
 *   边集（Fillet 1 status=1）。
 * - Fillet 1 的 audited 20-edge selection 来自 Onshape live evidence；
 *   native/private evidence 只在私有审计台账，不进入公共仓。
 *
 * 本 spec 的覆盖是**本示例专用、可审计**的 test-only 通道（不是通用选择器
 * 变更）：仅当特征为 `Fillet 1` 且场景 id 匹配时，读取当前 body 的全部边并
 * 断言恰为审计的 20 条、持久引用为 `1:1`..`1:12` + `2:1`..`2:8`（真栈实测：
 * 两个持久 topological node），再交给标准 Fillet FeatureOp；其他特征/其他
 * 示例仍走通用 resolver。本 spec 取代原 record 轨
 * `bumper-block-approx.spec.ts`（2026-11-09 退场）；通用 resolver 对 Fillet 1
 * 仍解析 12 条边、仍属 blocked-kernel（索引分类不变，见
 * `docs/superpowers/plans/2026-11-09-ps-blocker-driven.md` follow-up）。
 *
 * 严格门（run-file 缺省 policy 即 strict）：树类型一致、全部 status=0、
 * 1 body、逐 body 体积与采集目标 636,731.499 mm³ 相对误差 <0.5%、
 * push+冷重开。
 */
import { expect, test } from '@playwright/test';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { msRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { readBodyEdgeHandles } from './replay/edge-resolver.js';
import { runScenarioFile } from './replay/run-file.js';
import { isExampleDataAvailable } from './registry.js';

const SCENARIO =
  'scenarios/Explore-Onshape-Models-7c199f0e3db618e8abeb0d95-f664ba9907810c60c6fba5e2.scenario.json';
/** scenario id 前缀（避免覆盖在其他场景里偶然同名的特征）。 */
const SCENARIO_ID_PREFIX = 'onshape-7c199f0e3db618e8abeb0d95';
const FILLET_FEATURE_NAME = 'Fillet 1';
const EXPECTED_BODY_EDGES = 20;
/** 采集目标（非精确断言值）：636,731.499 mm³（Onshape bodydetails）。 */
const TARGET_VOLUME_MM3 = 636_731.499;

test.describe('Bumper Block 严格轨（Fillet 1 审计 20 边覆盖）', () => {
  test('scenario-file → target 636,731.499 mm³ / status 0 / 1 body / push+冷重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_500_000);
    const result = await runScenarioFile(page, request, {
      scenario: SCENARIO,
      name: 'Onshape example: Bumper Block (strict 20-edge fillet)',
      reset: true,
      skipSketchConstraints: true,
      // 严格门显式 0.5%：scenario 自带的 tolerance=0.01 不用于本 spec。
      tolerance: 0.005,
      edgeRefsOverride: async ({ feature, scenario, page: overridePage, ctx, accessToken }) => {
        if (feature.name !== FILLET_FEATURE_NAME || !scenario.id.startsWith(SCENARIO_ID_PREFIX))
          return undefined;
        // 审计覆盖：读当前 body 全部边（与 BRep 显示同一只读枚举通道），
        // 逐条 resolveEdgeRef → 持久边引用；数量/引用集不符即失败闭合。
        const handles = await readBodyEdgeHandles(overridePage, ctx, accessToken);
        expect(
          handles.length,
          `${FILLET_FEATURE_NAME} 覆盖要求当前 body 恰 ${EXPECTED_BODY_EDGES} 条边`,
        ).toBe(EXPECTED_BODY_EDGES);
        const refs: FilletEdgeRef[] = [];
        const bodyKeys = new Set<string>();
        for (const handle of handles) {
          const resolved = (await msRpc(
            ctx.itwinId,
            ctx.imodelId,
            'resolveEdgeRef',
            [ctx.dbKey, handle.bodyKey, handle.subEntityId],
            accessToken,
          )) as { ok: boolean; ref?: FilletEdgeRef; error?: string };
          expect(
            resolved.ok && resolved.ref !== undefined,
            `${FILLET_FEATURE_NAME} resolveEdgeRef 失败: ${resolved.error ?? 'unknown'}`,
          ).toBe(true);
          refs.push(resolved.ref!);
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
        console.log(`[bumper-strict] Fillet 1 override refs=${keys.join(',')}`);
        expect(keys, `${FILLET_FEATURE_NAME} 覆盖引用集必须恰为全 body 20 边`).toEqual(expectedKeys);
        expect(bodyKeys.size, `${FILLET_FEATURE_NAME} 覆盖必须落在单一 body`).toBe(1);
        return {
          refs,
          bodyKeys: Array.from(bodyKeys),
          notes: [
            `edgeOverride=${FILLET_FEATURE_NAME}: audited 20-edge selection from ` +
            'Onshape live evidence（native/private evidence 见私有审计台账）；' +
            `refs=${keys.join(',')}`,
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
