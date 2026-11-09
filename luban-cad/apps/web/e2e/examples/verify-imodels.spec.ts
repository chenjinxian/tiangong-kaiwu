/**
 * 示例运行态 state 重开回归（2026-11-08 重写）。
 *
 * 旧版硬编码 12 个 iModel UUID（2026-11-05），当前 hub 已发生重建/改名，旧 id
 * 全部失效；本 spec 改为**只读 demo-artifacts/examples/state.json** 的运行时
 * 真相：每个 document 一条 test（失败按文档隔离），逐 scope 读回特征树/status/
 * active body 数/总体积并与 state 记录对拍。state 缺失/为空 fail closed。
 *
 * 与 `verify-registry.spec.ts` 的分工：
 * - registry：静态“要建什么”（文档/PS 名、expected）；
 * - 本 spec：运行态“实际建成了什么”（project/iModel/scope UUID、上次读回值）。
 * 两者都绿才说明静态期望与运行态一致；UUID 不写回源码。
 */
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  getMassPropertiesRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor, openExamplePartStudio } from './imodel.js';
import { EXAMPLE_STATE_PATH, loadExampleState } from './state.js';

const state = loadExampleState();
const only = process.env.EXAMPLE_DOCS
  ?.split(',').map((value) => value.trim()).filter(Boolean);
const documents = (state?.documents ?? [])
  .filter((doc) => doc.projectId && doc.imodelId && doc.scopes.length > 0)
  .filter((doc) => !only?.length || only.includes(doc.id));

test.describe('示例 state 重开回归', () => {
  if (documents.length === 0) {
    test('state 必须存在且非空', () => {
      expect(
        state,
        `示例 state 缺失/为空：${EXAMPLE_STATE_PATH}（先运行 registry builder 生成）`,
      ).toBeTruthy();
      expect(
        (state?.documents ?? []).some((doc) => doc.projectId && doc.imodelId),
        `示例 state 没有带 projectId/imodelId 的文档：${EXAMPLE_STATE_PATH}`,
      ).toBe(true);
    });
    return;
  }

  for (const doc of documents) {
    test(`${doc.id}：树/body/体积按 state 读回`, async ({ page }) => {
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
      const token = await getApiToken();
      const ids = { itwinId: doc.projectId!, imodelId: doc.imodelId! };
      const defaultCtx = await openExampleEditor(page, ids, { canvasTimeoutMs: 240_000 });
      const scopes = doc.scopes.filter((scope) => scope.scopeId);
      expect(scopes.length, `${doc.id} state 无已建 scope`).toBeGreaterThan(0);

      for (const scope of scopes) {
        const ctx = scope.scopeId === defaultCtx.scopeId
          ? defaultCtx
          : await openExamplePartStudio(page, ids, scope.scopeId!, { canvasTimeoutMs: 240_000 });
        const tree = await getFeatureTreeRpc(ctx, token);
        if (scope.featureTypes)
          expect(tree.map((row) => row.featureType), `${doc.id}/${scope.id} 特征树`).toEqual(scope.featureTypes);
        expect(tree.every((row) => row.status === 0), `${doc.id}/${scope.id} 特征状态`).toBe(true);

        const bodies = (await getBodiesRpc(ctx, token)).filter((body) => body.active);
        if (scope.bodyCount !== undefined)
          expect(bodies.length, `${doc.id}/${scope.id} active body 数`).toBe(scope.bodyCount);

        if (scope.volumeMm3 !== undefined && scope.volumeMm3 > 0) {
          const volume = (await getMassPropertiesRpc(ctx, token))
            .reduce((sum, item) => sum + item.volume, 0);
          expect(
            Math.abs(volume - scope.volumeMm3) / scope.volumeMm3,
            `${doc.id}/${scope.id} 体积 ${volume} vs state ${scope.volumeMm3}`,
          ).toBeLessThanOrEqual(0.005);
        }
      }
    });
  }
});
