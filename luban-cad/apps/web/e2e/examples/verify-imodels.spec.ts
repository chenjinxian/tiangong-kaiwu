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
  listPartStudiosRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { findExampleDocument, openExampleEditor, openExamplePartStudio } from './imodel.js';
import { loadExampleRegistry, resolveExample } from './registry.js';
import type { ExampleDocumentEntry } from './registry.js';
import {
  EXAMPLE_STATE_PATH,
  loadExampleState,
  upsertExampleDocumentState,
  type ExampleScopeState,
} from './state.js';

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
    test(`${doc.id}：树/body/体积按 state 读回`, async ({ page, request }) => {
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
      // openExampleEditor may trigger a shared-session refresh (rotating the
      // server session hash); re-read after it so fallback/API calls never use
      // an access token invalidated by that rotation.
      let token = await getApiToken();
      const registry = loadExampleRegistry();
      const resolved = resolveExample(registry, doc.id);
      const entry = 'imodelName' in resolved ? resolved as ExampleDocumentEntry : undefined;

      // C2/示例 builder 会 reset 同名 iModel（新 id）或重建 scope（新 scopeId），
      // state 里的 UUID 可能在本轮更早的 creator 后过期。按名重解析是运行态
      // 真相的刷新，不是放宽断言；volume/featureTypes 仍与 state 记录对拍。
      let ids = { itwinId: doc.projectId!, imodelId: doc.imodelId! };
      let defaultCtx;
      try {
        defaultCtx = await openExampleEditor(page, ids, { canvasTimeoutMs: 240_000 });
      } catch (error) {
        if (!entry)
          throw error;
        token = await getApiToken();
        ids = await findExampleDocument(request, token, entry);
        defaultCtx = await openExampleEditor(page, ids, { canvasTimeoutMs: 240_000 });
      }
      // Editor open may have refreshed (rotated) the shared session.
      token = await getApiToken();
      const studios = await listPartStudiosRpc(defaultCtx, token);
      const byName = new Map(studios.map((studio) => [studio.name, studio]));
      const scopes = doc.scopes.filter((scope) => scope.scopeId);
      expect(scopes.length, `${doc.id} state 无已建 scope`).toBeGreaterThan(0);
      const scopeStates: ExampleScopeState[] = [];

      for (const scope of scopes) {
        const registryScope = entry?.scopes.find((candidate) => candidate.id === scope.id);
        const wantedName = registryScope?.name ?? scope.name;
        const studio = byName.get(wantedName) ?? (studios.length === 1 ? studios[0] : undefined);
        if (!studio)
          throw new Error(`${doc.id}/${scope.id} 找不到 Part Studio ${wantedName}（现有：${studios.map((s) => s.name).join(',')}）`);
        const ctx = studio.id === defaultCtx.scopeId
          ? defaultCtx
          : await openExamplePartStudio(page, ids, studio.id, { canvasTimeoutMs: 240_000 });
        const tree = await getFeatureTreeRpc(ctx, token);
        if (scope.featureTypes)
          expect(tree.map((row) => row.featureType), `${doc.id}/${scope.id} 特征树`).toEqual(scope.featureTypes);
        expect(tree.every((row) => row.status === 0), `${doc.id}/${scope.id} 特征状态`).toBe(true);

        const bodies = (await getBodiesRpc(ctx, token)).filter((body) => body.active);
        if (scope.bodyCount !== undefined)
          expect(bodies.length, `${doc.id}/${scope.id} active body 数`).toBe(scope.bodyCount);

        let volume: number | undefined;
        if (scope.volumeMm3 !== undefined && scope.volumeMm3 > 0) {
          volume = (await getMassPropertiesRpc(ctx, token))
            .reduce((sum, item) => sum + item.volume, 0);
          expect(
            Math.abs(volume - scope.volumeMm3) / scope.volumeMm3,
            `${doc.id}/${scope.id} 体积 ${volume} vs state ${scope.volumeMm3}`,
          ).toBeLessThanOrEqual(0.005);
        }
        scopeStates.push({
          ...scope,
          scopeId: studio.id,
          featureTypes: tree.map((row) => row.featureType),
          bodyCount: bodies.length,
          volumeMm3: volume ?? scope.volumeMm3,
          status: 'verified',
          verifiedAt: new Date().toISOString(),
        });
      }

      // 刷新运行态 UUID/读回值，使下一轮即使 creator 再次 reset 也能按名自愈。
      upsertExampleDocumentState({
        id: doc.id,
        projectId: ids.itwinId,
        imodelId: ids.imodelId,
        updatedAt: new Date().toISOString(),
        scopes: scopeStates,
      });
    });
  }
});
