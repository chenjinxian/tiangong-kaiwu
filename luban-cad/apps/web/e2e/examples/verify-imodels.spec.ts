/**
 * 示例 iModel 重开回归（2026-11-05）。
 *
 * 枚举已完成示例的真实 hub iModel，逐个打开并读回特征树 + 质量属性；
 * 不写入、不推送。作为演示画廊的持久性证据门：任何示例库被删/被改坏，
 * 本 spec 直接红。
 */
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { openExampleEditor } from './imodel.js';

interface VerifyEntry {
  slug: string;
  projectId: string;
  imodelId: string;
  featureTypes: string[];
  expectedVolumeMm3: number;
  tolerance: number;
}

const ENTRIES: VerifyEntry[] = [
  {
    slug: 'tutorial-2',
    projectId: '9808b77f-ebab-4cc3-bc5b-61fc90047a4d',
    imodelId: 'f2278180-4f57-43b2-98f5-2cc8f76fd24f',
    featureTypes: ['sketch', 'extrude', 'extrude', 'extrude', 'revolve', 'fillet'],
    expectedVolumeMm3: 357716,
    tolerance: 0.01,
  },
  {
    slug: 'exercise-basic-drawing',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: '3f90c416-34c3-4c02-8ce3-0cdbb98c1761',
    featureTypes: ['sketch', 'revolve'],
    expectedVolumeMm3: 2442293.8,
    tolerance: 0.01,
  },
  {
    slug: 'tutorial-2-ios',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: 'f49b33ab-d07d-4e76-9aef-80812e8784cf',
    featureTypes: ['sketch', 'extrude', 'extrude', 'chamfer'],
    expectedVolumeMm3: 157478.9,
    tolerance: 0.001,
  },
  {
    slug: 'hand-brake',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: '33f8feb0-ea05-4e7d-9f88-38c30def30e8',
    featureTypes: ['sketch', 'revolve', 'chamfer'],
    expectedVolumeMm3: 7125.2741608,
    tolerance: 0.005,
  },
  {
    slug: 'sample-assignment',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    // 2026-11-06：canonical 场景重建库（`E2E - Sample Assignment RPC`；9 特征/
    // 8915.8602 mm³）。旧 UI 库 a9eacfe5 已不存在，且残留的同名 UI 库特征树为空。
    imodelId: 'f52752cb-5602-42e7-8f30-14371d371b41',
    featureTypes: [
      'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude', 'chamfer',
    ],
    expectedVolumeMm3: 8915.859905,
    tolerance: 0.001,
  },
  {
    slug: 'postman',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: '828fc683-c679-40d3-b75c-e6dbe5911eae',
    featureTypes: ['sketch', 'extrude'],
    expectedVolumeMm3: 2686.592,
    tolerance: 0.02,
  },
  {
    slug: 'warning-label',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: '2e2fd3e3-607b-4b20-b8e1-937db350a89f',
    featureTypes: ['sketch', 'extrude', 'sketch', 'sketch', 'extrude'],
    expectedVolumeMm3: 0.8193532,
    tolerance: 0.02,
  },
  {
    slug: 'warning-label-edu-quickstart',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: 'f3867be8-a3d3-46de-b683-713b0720dfed',
    featureTypes: ['sketch', 'extrude', 'sketch', 'sketch', 'extrude'],
    expectedVolumeMm3: 0.8193532,
    tolerance: 0.02,
  },
  {
    slug: 'warning-label-professional-discovery',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: '8ed53b20-9141-4f8a-886b-9a7025f84641',
    featureTypes: ['sketch', 'extrude', 'sketch', 'sketch', 'extrude'],
    expectedVolumeMm3: 0.8193532,
    tolerance: 0.02,
  },
  {
    slug: 'warning-label-onshape-quickstart',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: '86c7a96f-c405-423f-8c15-5937e2244ee0',
    featureTypes: ['sketch', 'extrude', 'sketch', 'sketch', 'extrude'],
    expectedVolumeMm3: 0.8193532,
    tolerance: 0.02,
  },
  {
    slug: 'mate-connectors',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    imodelId: 'b261311a-3f3a-4800-bebf-1d66bdc8eb93',
    featureTypes: ['sketch', 'extrude', 'sketch', 'extrude', 'sketch', 'extrude'],
    expectedVolumeMm3: 21743.326,
    tolerance: 0.03,
  },
  {
    slug: 'intro-to-cad',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    // 2026-11-06：cPlane 版本当前库（state.json 同源；树 sketch/extrude/cPlane/
    // sketch、85157.3407 mm³）。旧 de911416 已不存在。
    imodelId: 'bb8efb7b-5a07-4eb9-b36a-e0f8a7dfcaaf',
    featureTypes: ['sketch', 'extrude', 'cPlane', 'sketch'],
    expectedVolumeMm3: 85157.342,
    tolerance: 0.02,
  },
  {
    slug: 'top-ring-key',
    projectId: 'c7778d27-f4c5-4097-a735-fc8080c2c820',
    // P0.5 新建（2026-11-06）：12 特征/逐 body 2998.1430 mm³。此条把该示例的
    // persist 从 pending 提升为“冷 briefcase cache 重开可读回”。
    imodelId: '09ea16a9-46dd-48aa-a866-04a0ee39db7a',
    featureTypes: [
      'sketch', 'extrude', 'fillet', 'sketch', 'revolve',
      'sketch', 'hole', 'sketch', 'extrude', 'sketch', 'extrude', 'chamfer',
    ],
    expectedVolumeMm3: 2998.14301903484,
    tolerance: 0.01,
  },
];

test.describe('示例 iModel 重开回归', () => {
  test('13 个已推送 iModel：特征树 + 体积读回一致', async ({ page }) => {
    test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 900_000);
    const token = await getApiToken();
    const summary: unknown[] = [];
    for (const entry of ENTRIES) {
      const ctx = await openExampleEditor(page, {
        itwinId: entry.projectId,
        imodelId: entry.imodelId,
      });
      const tree = await getFeatureTreeRpc(ctx, token);
      expect(tree.map((row) => row.featureType), `${entry.slug} 特征树`).toEqual(entry.featureTypes);
      expect(tree.every((row) => row.status === 0), `${entry.slug} 特征状态`).toBe(true);
      const mass = await getMassPropertiesRpc(ctx, token);
      const volume = mass.reduce((sum, item) => sum + item.volume, 0);
      console.log(`[verify-imodels] ${entry.slug}: ${volume.toFixed(6)} mm³ (expected ${entry.expectedVolumeMm3})`);
      expect(
        Math.abs(volume - entry.expectedVolumeMm3) / entry.expectedVolumeMm3,
        `${entry.slug} 体积`,
      ).toBeLessThan(entry.tolerance);
      await page.screenshot({
        path: `demo-artifacts/examples/_verify/${entry.slug}.png`,
        fullPage: false,
      });
      summary.push({ slug: entry.slug, imodelId: entry.imodelId, volumeMm3: volume });
    }
    console.log(`[verify-imodels] summary ${JSON.stringify(summary)}`);
  });
});
