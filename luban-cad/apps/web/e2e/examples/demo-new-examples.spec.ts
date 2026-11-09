/**
 * 演示素材采集（test-only）：为 2026-11-09 新转绿的严格示例生成：
 * - demo-artifacts/examples/<slug>/001-result.webp（画廊）
 * - public/showcase/example-<slug>.webp（产品 /showcase 页）
 * - demo-artifacts/examples/<slug>/manifest.json（真实 iModel/体积/树）
 *
 * 只走 scenario replay，不伪造几何；截图来自真实栈最终状态。
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getApiToken, getFeatureTreeRpc, getMassPropertiesRpc } from '../helpers.js';
import { SEED_AND_OPEN_TIMEOUT_MS } from '../seed.js';
import { ensureExampleImodel, openExampleEditor } from './imodel.js';
import { DEFAULT_DATA_ROOT, isExampleDataAvailable } from './registry.js';
import { runScenario } from './replay/run.js';
import type { ParityScenario } from './replay/scenario-to-op.js';

interface DemoCase {
  slug: string;
  label: string;
  imodelName: string;
  scenario: string;
  runner: string;
  owner: string;
  publicImage?: string;
}

const CASES: DemoCase[] = [
  {
    slug: 'drive-sleeve',
    label: 'Exercise: Intermediate Drawing / Drive Sleeve',
    imodelName: 'E2E - Drive Sleeve Scenario',
    scenario: 'Onshape-Training-Repo-58d0532589c36a0f85a5c6de-8509862e8b7fffa66b7cf6c2.scenario.json',
    runner: 'e2e/examples/drive-sleeve-scenario.spec.ts',
    owner: 'Onshape Training Repo',
    publicImage: 'example-drive-sleeve.webp',
  },
  {
    slug: 'intro-part-1',
    label: 'Intro to CAD 1.2 / Part 1',
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 1',
    scenario: 'Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-6ccf6efcd80bcab335d073b6.scenario.json',
    runner: 'e2e/examples/intro-cad-parts.spec.ts',
    owner: 'Onshape Training Repo',
    publicImage: 'example-intro-part1.webp',
  },
  {
    slug: 'intro-part-2',
    label: 'Intro to CAD 1.2 / Part 2',
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 2',
    scenario: 'Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-6516d9f30e2332db231b5256.scenario.json',
    runner: 'e2e/examples/intro-cad-parts.spec.ts',
    owner: 'Onshape Training Repo',
    publicImage: 'example-intro-part2.webp',
  },
  // 2026-11-09（PS blocker Task 2/8）：Part 3 由 bodydetails 面积+bbox 证据
  // 唯一反解三段 ADD 面集，真栈严格绿 229,418.896 mm³（0.000%）。
  {
    slug: 'intro-part-3',
    label: 'Intro to CAD 1.2 / Part 3',
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 3',
    scenario: 'Onshape-Training-Repo-c6a3cd9aa3daa7819cae0c44-2b8c683d9655e48fb91f2cd9.scenario.json',
    runner: 'e2e/examples/intro-cad-parts.spec.ts',
    owner: 'Onshape Training Repo',
    publicImage: 'example-intro-part3.webp',
  },
  {
    slug: 'o-ring',
    label: 'Exercise: Element Organization / O-Ring',
    imodelName: 'Onshape example: Element Organization / O-Ring',
    scenario: 'Onshape-Training-Repo-58eb97a87053360f6da2f15d-175362f23d8a08be2e01f828.scenario.json',
    runner: 'e2e/examples/o-ring-scenario.spec.ts',
    owner: 'Onshape Training Repo',
    publicImage: 'example-o-ring.webp',
  },
  {
    slug: 'bushing',
    label: 'Exercise: Element Organization / Bushing',
    imodelName: 'Onshape example: Element Organization / Bushing',
    scenario: 'Onshape-Training-Repo-58eb97a87053360f6da2f15d-bef3a95b0793f0bd33859cee.scenario.json',
    runner: 'e2e/examples/o-ring-scenario.spec.ts',
    owner: 'Onshape Training Repo',
    publicImage: 'example-bushing.webp',
  },
  {
    slug: 'eng-bearing',
    label: 'DRILL HOTD / ENG_BEARING',
    imodelName: 'Onshape example: DRILL HOTD / ENG_BEARING',
    scenario: 'Onshape-Training-Repo-2778b69a09d8fcb9a54e08dc-3da4bf9863d73b9c523edfc3.scenario.json',
    runner: 'e2e/examples/drill-hotd.spec.ts',
    owner: 'Onshape Training Repo',
    publicImage: 'example-eng-bearing.webp',
  },
];

test.describe('新严格绿示例演示素材采集', () => {
  for (const item of CASES) {
    test(`${item.label}：截图 + manifest`, async ({ page, request }) => {
      test.skip(!isExampleDataAvailable(), 'ONSHAPE_PARITY_DATA 不在场');
      test.setTimeout(SEED_AND_OPEN_TIMEOUT_MS + 600_000);
      await page.setViewportSize({ width: 1920, height: 1080 });
      const token = await getApiToken();
      const ids = await ensureExampleImodel(request, token, item.imodelName, { reset: true });
      const ctx = await openExampleEditor(page, ids);
      const scenarioPath = path.join(DEFAULT_DATA_ROOT, 'scenarios', item.scenario);
      const raw = JSON.parse(readFileSync(scenarioPath, 'utf8')) as ParityScenario;
      await runScenario(ctx, raw, token, { skipSketchConstraints: true });

      await page.reload();
      await openExampleEditor(page, ids);
      const tree = await getFeatureTreeRpc(ctx, token);
      const mass = await getMassPropertiesRpc(ctx, token);
      const actual = mass.reduce((sum, body) => sum + body.volume, 0);
      const expected = ((raw.expected as { bodies?: Array<{ volumeM3?: number }> } | undefined)?.bodies || [])
        .reduce((sum, body) => sum + Number(body.volumeM3 || 0) * 1e9, 0);

      const demoDir = path.join('demo-artifacts', 'examples', item.slug);
      mkdirSync(demoDir, { recursive: true });
      const shot = '001-result.webp';
      await page.screenshot({ path: path.join(demoDir, shot), type: 'webp', quality: 92 });
      if (item.publicImage) {
        const publicDir = path.join('public', 'showcase');
        mkdirSync(publicDir, { recursive: true });
        copyFileSync(path.join(demoDir, shot), path.join(publicDir, item.publicImage));
      }

      const manifest = {
        example: item.label,
        owner: item.owner,
        projectName: 'Onshape 示例复刻',
        imodelName: item.imodelName,
        imodelId: ids.imodelId,
        openPath: `http://localhost:5300/documents/${ids.itwinId}/${ids.imodelId}`,
        scenario: `scenarios/${item.scenario}`,
        featureTree: tree.map((row) => row.featureType),
        runner: item.runner,
        expected: { volumeMm3: expected, bodyCount: raw.expected?.bodyCount ?? mass.length },
        actual: { volumeMm3: actual, bodyCount: mass.length },
        screenshots: [shot],
        verifiedAt: new Date().toISOString(),
      };
      writeFileSync(path.join(demoDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log(`[demo-new] ${item.slug} actual=${actual.toFixed(3)} expected=${expected.toFixed(3)}`);
      expect(mass.length).toBeGreaterThan(0);
      expect(tree.every((row) => row.status === 0)).toBe(true);
    });
  }
});
