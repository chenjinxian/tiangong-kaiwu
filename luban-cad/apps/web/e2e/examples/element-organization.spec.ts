/**
 * 首个 document 级多 Part Studio 示例：Exercise: Element Organization。
 *
 * O-Ring（sketch + revolve）与 Bushing（sketch + extrude）在建/重开时验证：
 * - 一个 Onshape 文档 = 一个 iModel；
 * - 两个 Part Studio = 两个 B-mode scope/页签；
 * - scenario runner 只走 FeatureOp + 写租约；
 * - Bushing 的 imprintFace 以 region 0 近似，页面/日志明确标注。
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  getApiToken,
  getBodiesRpc,
  getFeatureTreeRpc,
  listPartStudiosRpc,
} from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { demoShot } from './demo.js';
import {
  ensureExampleDocument,
  ensureExamplePartStudios,
  openExampleEditor,
  openExamplePartStudio,
  pushExampleChanges,
} from './imodel.js';
import { loadExampleRegistry, resolveExample, resolveScenarioPath, isExampleDataAvailable } from './registry.js';
import type { ExampleScopeEntry, ExampleDocumentEntry } from './registry.js';
import type { ParityScenario } from './replay/scenario-to-op.js';
import { runScenario } from './replay/run.js';

const DOC_ID = 'exercise-element-organization';

function requireScenario(scope: ExampleScopeEntry): ParityScenario {
  const file = resolveScenarioPath(scope);
  if (!file) throw new Error(`${scope.id} 缺少 scenarioPath`);
  return JSON.parse(readFileSync(file, 'utf8')) as ParityScenario;
}

test.describe('示例 iModel：Exercise: Element Organization', () => {
  test('O-Ring + Bushing 两个 Part Studio 页签 → 推送 → 重开', async ({ page, request }) => {
    test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场：跳过数据驱动多 PS 示例');
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 1_200_000);
    const token = await getApiToken();
    const registry = loadExampleRegistry();
    const entry = resolveExample(registry, DOC_ID) as ExampleDocumentEntry;
    // 默认重建：该 spec 是 builder，复用旧 iModel 会在末尾追加第二套 sketch/revolve；
    // 需要保留现场时显式 EXAMPLE_RESET=0。
    const ids = await ensureExampleDocument(request, token, entry, {
      reset: process.env.EXAMPLE_RESET !== '0',
    });
    const baseCtx = await openExampleEditor(page, ids);
    const studios = await ensureExamplePartStudios(baseCtx, entry, token);
    expect(studios.size).toBe(entry.scopes.length);

    const summary: unknown[] = [];
    let lastCtx = baseCtx;
    for (const scope of entry.scopes) {
      const studio = studios.get(scope.id);
      if (!studio) throw new Error(`${scope.id} 未创建 scope`);
      const ctx = await openExamplePartStudio(page, ids, studio.id);
      lastCtx = ctx;
      const scenario = requireScenario(scope);
      const result = await runScenario(ctx, scenario, token);
      const tree = await getFeatureTreeRpc(ctx, token);
      const types = tree.map((row) => row.featureType);
      if (scope.featureTypes) expect(types, `${scope.id} 特征树`).toEqual(scope.featureTypes);
      expect(tree.every((row) => row.status === 0), `${scope.id} 特征状态`).toBe(true);
      const bodies = (await getBodiesRpc(ctx, token)).filter((body) => body.active);
      expect(bodies.length, `${scope.id} body 数`).toBe(scope.expected.bodyCount);
      await demoShot(page, {
        dir: `demo-artifacts/examples/${DOC_ID}/${scope.id}`,
        index: 1,
        slug: 'result',
        title: `${scope.name} 结果`,
        detail: `feature=${result.featureIds.length}; approximate=${result.approximateSteps}; body=${bodies.length}`,
      });
      summary.push({
        scope: scope.id,
        scopeId: studio.id,
        types,
        bodyCount: bodies.length,
        featureIds: result.featureIds,
        notes: result.notes,
        approximateSteps: result.approximateSteps,
      });
    }

    await pushExampleChanges(page, `Onshape example: ${entry.imodelName}`);
    const reopened = await listPartStudiosRpc(lastCtx, token);
    expect(reopened.map((studio) => studio.name).sort()).toEqual(entry.scopes.map((scope) => scope.name).sort());
    await page.reload();
    await page.waitForTimeout(3_000);
    console.log(`[element-organization] ${JSON.stringify(summary)}`);
  });
});
