/**
 * P2.8 残项：A all-model 真栈夹具。
 *
 * A 种子是空 iModel（0 PhysicalModel），A 编辑器视觉只做 mask；本夹具用
 * fromBaseline 上传 `imodel-fixtures/a-geometry.bim`（2 个 PhysicalModel，
 * 各一个 Generic:PhysicalObject Box），在真实 A 只读编辑器中断言模型/几何
 * 内容与 canvas 就绪。WebGL 像素不做钉版（平台/驱动不稳定），由模型+几何流
 * 断言证明画布有可渲染内容。
 */
import { expect, test } from '@playwright/test';
import {
  A_FIXTURE_IMODEL_NAME,
  A_FIXTURE_PROJECT_NAME,
} from './fixtures';
import {
  collectConsoleErrors,
  getApiToken,
  openLegacySeedEditor,
  waitEditorReady,
} from './helpers';
import { resetFixtureImodel, type SeedImodelRef } from './seed';

let ids: SeedImodelRef;

test.describe('A all-model 夹具', () => {
  test.beforeAll(async ({ request }) => {
    test.setTimeout(1_200_000);
    ids = await resetFixtureImodel(request, await getApiToken(), {
      projectName: A_FIXTURE_PROJECT_NAME,
      imodelName: A_FIXTURE_IMODEL_NAME,
      fixturePath: 'e2e/imodel-fixtures/a-geometry.bim',
    });
  });

  test('A 只读编辑器加载全部模型与 BIS 几何（canvas 内容非空）', async ({ page }) => {
    test.setTimeout(1_200_000);
    const consoleErrors = collectConsoleErrors(page);
    await openLegacySeedEditor(page, ids);
    await waitEditorReady(page);
    await expect(page.getByTestId('part-studio-readonly-banner')).toBeVisible();

    const stats = await page.evaluate(async () => {
      const cf = (window as unknown as {
        __lubanE2E?: { coreFrontend?: typeof import('@itwin/core-frontend') };
      }).__lubanE2E?.coreFrontend;
      if (!cf) throw new Error('window.__lubanE2E.coreFrontend 不可用（非 hook 镜像）');
      const view = cf.IModelApp.viewManager.getFirstOpenView();
      if (!view) throw new Error('无打开的视图');
      await view.waitForSceneCompletion();
      const iModel = view.iModel;
      const modelIds = await iModel.elements.queryIds({ from: 'BisCore.PhysicalModel', limit: 100 }) as unknown as Set<string>;
      const elementIds = await iModel.elements.queryIds({ from: 'Generic.PhysicalObject', limit: 100 }) as unknown as Set<string>;
      const firstId = Array.from(elementIds)[0];
      if (!firstId) throw new Error('夹具无 Generic:PhysicalObject');
      const props = await iModel.elements.loadProps(firstId, { wantGeometry: true });
      const serialized = JSON.stringify(props ?? {});
      return {
        modelCount: modelIds.size,
        elementCount: elementIds.size,
        hasGeometry: /"(geom|elementGeometryBuilderParams|entryArray)"/.test(serialized),
        propKeys: Object.keys(props ?? {}),
      };
    });

    expect(stats.modelCount, 'A 夹具应含多个 PhysicalModel').toBeGreaterThanOrEqual(2);
    expect(stats.elementCount, 'A 夹具应含多个几何元素').toBeGreaterThanOrEqual(2);
    expect(
      stats.hasGeometry,
      `夹具元素应携带几何流（keys=${stats.propKeys.join(',')}）`,
    ).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
