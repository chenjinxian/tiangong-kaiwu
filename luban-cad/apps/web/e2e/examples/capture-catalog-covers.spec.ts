/**
 * test-only：采集 /examples 目录缺失的两张真实封面。
 *
 * 只打开已持久化的示例 iModel 截图，不重建/不修改模型；需要显式
 * `EXAMPLE_CATALOG_CAPTURE=1` 才运行，避免进入日常 e2e 套件。
 */
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { getApiToken } from '../helpers.js';
import { ensureExampleImodel, openExampleEditor } from './imodel.js';

const CASES = [
  {
    imodelName: 'WARNING LABEL - Bench Vise',
    file: 'example-warning-label.webp',
  },
  {
    imodelName: 'Onshape example: Bumper Block (S10 faceExtrude + rb=3 oracle)',
    file: 'example-bumper.webp',
  },
  {
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 4',
    file: 'example-intro-part4.webp',
  },
  {
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 5',
    file: 'example-intro-part5.webp',
  },
  {
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 6',
    file: 'example-intro-part6.webp',
  },
  {
    imodelName: 'E2E - Handle Parts Scenario',
    file: 'example-handle-parts.webp',
  },
] as const;

test.describe('示例目录封面采集', () => {
  for (const item of CASES) {
    test(`${item.file}`, async ({ page, request }) => {
      test.skip(!process.env.EXAMPLE_CATALOG_CAPTURE, 'EXAMPLE_CATALOG_CAPTURE 未开启');
      test.setTimeout(300_000);
      await page.setViewportSize({ width: 1600, height: 900 });
      const token = await getApiToken();
      const ids = await ensureExampleImodel(request, token, item.imodelName);
      await openExampleEditor(page, ids);
      await page.mouse.move(4, 4);
      await page.waitForTimeout(2_000);
      await page.screenshot({
        path: path.join('public', 'showcase', item.file),
        type: 'webp',
        quality: 90,
      });
      await expect(page.locator('canvas').first()).toBeVisible();
      console.log(`[catalog-cover] ${item.file} from ${item.imodelName}`);
    });
  }
});
