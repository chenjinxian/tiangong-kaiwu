/**
 * registry 驱动重开验证（B0）。
 *
 * 不写、不推送；逐个 registry 文档按“项目名 + iModel 名”定位，打开每个
 * Part Studio scope，读回特征树/body/逐 body 质量属性并与 registry expected 对拍。
 * legacy 12 个先跑通；新 document 级条目随后用同一流程扩展。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getBodiesRpc, getFeatureTreeRpc, getMassPropertiesRpc, listPartStudiosRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { findExampleDocument, openExampleEditor, openExamplePartStudio } from './imodel.js';
import { loadExampleRegistry } from './registry.js';
import { upsertExampleDocumentState, type ExampleScopeState } from './state.js';

test.describe('示例 registry 重开回归', () => {
  test('legacy registry 条目：PS 列表/特征树/body/体积读回', async ({ page, request }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const token = await getApiToken();
    const registry = loadExampleRegistry();
    const only = process.env.EXAMPLE_DOCS
      ?.split(',').map((value) => value.trim()).filter(Boolean);
    const entries = only?.length
      ? registry.documents.filter((entry) => only.includes(entry.id))
      // B0 默认只验已存在的 legacy 条目；新 document 级示例用 EXAMPLE_DOCS 显式点名，
      // 避免“registry 已登记但尚未构建”被误报为回归。
      : registry.documents.filter((entry) => entry.layout === 'legacy-single-ps');
    expect(entries.length, `EXAMPLE_DOCS 无匹配：${only?.join(',')}`).toBeGreaterThan(0);
    const summary: unknown[] = [];

    for (const entry of entries) {
      const ids = await findExampleDocument(request, token, entry);
      const defaultCtx = await openExampleEditor(page, ids);
      const studios = await listPartStudiosRpc(defaultCtx, token);
      expect(studios.length, `${entry.imodelName} Part Studio 列表为空`).toBeGreaterThan(0);

      const byName = new Map(studios.map((studio) => [studio.name, studio]));
      const defaultStudio = studios.find((studio) => studio.id === defaultCtx.scopeId);
      const scopeStates: ExampleScopeState[] = [];
      for (const scope of entry.scopes) {
        // legacy 单 PS iModel 的实际 scope 名不保证是 "Part Studio 1"；默认入口
        // 的 scope 才是历史构建目标。多 PS 文档才按 registry 名称匹配。
        const studio = entry.scopes.length === 1
          ? (defaultStudio ?? studios[0])
          : (byName.get(scope.name) ?? (studios.length === 1 ? studios[0] : undefined));
        if (!studio)
          throw new Error(`${entry.imodelName} 缺少 registry scope ${scope.name}（现有：${studios.map((s) => s.name).join(',')}）`);

        const ctx = studio.id === defaultCtx.scopeId
          ? defaultCtx
          : await openExamplePartStudio(page, ids, studio.id);
        const tree = await getFeatureTreeRpc(ctx, token);
        const treeTypes = tree.map((row) => row.featureType);
        if (scope.featureTypes)
          expect(treeTypes, `${entry.id}/${scope.id} 特征树`).toEqual(scope.featureTypes);
        expect(tree.every((row) => row.status === 0), `${entry.id}/${scope.id} 特征状态`).toBe(true);

        const bodies = (await getBodiesRpc(ctx, token)).filter((body) => body.active);
        if (scope.expected.bodyCount !== undefined)
          expect(bodies.length, `${entry.id}/${scope.id} body 数`).toBe(scope.expected.bodyCount);

        const mass = await getMassPropertiesRpc(ctx, token);
        const volume = mass.reduce((sum, item) => sum + item.volume, 0);
        if (scope.expected.totalVolumeMm3 !== undefined) {
          const tolerance = scope.expected.tolerance ?? 0.01;
          expect(
            Math.abs(volume - scope.expected.totalVolumeMm3) / scope.expected.totalVolumeMm3,
            `${entry.id}/${scope.id} 体积 ${volume} vs ${scope.expected.totalVolumeMm3}`,
          ).toBeLessThanOrEqual(tolerance);
        }
        summary.push({
          doc: entry.id,
          scope: scope.id,
          scopeId: studio.id,
          featureTypes: treeTypes,
          bodyCount: bodies.length,
          volumeMm3: volume,
        });
        scopeStates.push({
          id: scope.id,
          sourceElementId: scope.sourceElementId,
          name: scope.name,
          scopeId: studio.id,
          featureTypes: treeTypes,
          bodyCount: bodies.length,
          volumeMm3: volume,
          status: 'verified',
          verifiedAt: new Date().toISOString(),
        });
        await page.screenshot({
          path: `demo-artifacts/examples/_verify-registry/${entry.id}/${scope.id}.png`,
          fullPage: false,
        });
      }
      upsertExampleDocumentState({
        id: entry.id,
        projectId: ids.itwinId,
        imodelId: ids.imodelId,
        updatedAt: new Date().toISOString(),
        scopes: scopeStates,
      });
    }
    console.log(`[verify-registry] summary ${JSON.stringify(summary)}`);
  });
});
