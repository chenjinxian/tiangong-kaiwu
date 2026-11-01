/**
 * P2.8 残项：damaged 半图真栈门。
 *
 * 夹具 `b-half-graph.bim` 含一个 `LubanFeaturePartition:half-graph-fixture`
 * def 分区但没有 physical 分区。B 文档首开应停在 recovery（不自动 create）；
 * 打开该 scope 显示 damaged；经 HITL 删除（持久 tombstone）后，解析器创建
 * 新的默认 Part Studio，画布恢复。
 */
import { expect, test } from '@playwright/test';
import {
  B_HALF_GRAPH_IMODEL_NAME,
  B_HALF_GRAPH_PROJECT_NAME,
} from './fixtures';
import {
  collectConsoleErrors,
  getApiToken,
  gotoRoute,
  loginWithSession,
  waitEditorConnected,
  waitEditorReady,
} from './helpers';
import { resetFixtureImodel, type SeedImodelRef } from './seed';

const HALF_SCOPE_ID = 'half-graph-fixture';
let ids: SeedImodelRef;

test.describe('damaged 半图真栈门', () => {
  test.beforeAll(async ({ request }) => {
    test.setTimeout(1_200_000);
    ids = await resetFixtureImodel(request, await getApiToken(), {
      projectName: B_HALF_GRAPH_PROJECT_NAME,
      imodelName: B_HALF_GRAPH_IMODEL_NAME,
      bModel: true,
      fixturePath: 'e2e/imodel-fixtures/b-half-graph.bim',
    });
  });

  test('recovery → damaged → HITL 删除 → 默认 Part Studio 取代', async ({ page }) => {
    test.setTimeout(1_200_000);
    const consoleErrors = collectConsoleErrors(page);
    await loginWithSession(page);
    await gotoRoute(page, `/documents/${ids.itwinId}/${ids.imodelId}`, 'part-studio-page');
    await waitEditorConnected(page);

    // 半图恢复面：不自动 create，不把 iModel 交给视口。
    await expect(page.getByTestId('part-studio-scope-recovery')).toBeVisible({ timeout: 60_000 });
    expect(page.url()).not.toContain(`model=${HALF_SCOPE_ID}`);
    expect(page.url()).not.toContain('?model=');
    await expect(page.getByTestId('part-studio-viewport').locator('canvas')).toHaveCount(0);

    // 显式打开损坏 scope → damaged 面 + 删除 HITL。
    await gotoRoute(
      page,
      `/documents/${ids.itwinId}/${ids.imodelId}?model=${HALF_SCOPE_ID}`,
      'part-studio-page',
    );
    await waitEditorConnected(page);
    await expect(page.getByTestId('part-studio-scope-damaged')).toBeVisible({ timeout: 60_000 });
    // damaged 横幅只有一个删除入口（区别于 recovery 列表的
    // `part-studio-damaged-delete-<scopeId>`）。
    const deleteButton = page.getByTestId('part-studio-damaged-delete');
    await expect(deleteButton).toBeEnabled({ timeout: 60_000 });
    await deleteButton.click();

    const dialog = page.getByRole('dialog', { name: '删除 Part Studio' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '删除', exact: true }).click();

    // tombstone 后列表为空 → resolver 建默认 Part Studio → URL/画布恢复。
    // 先等 URL 离开旧 scope：`?model=` 在删除前就已匹配，不能当作完成信号。
    await expect(page).not.toHaveURL(new RegExp(`[?&]model=${HALF_SCOPE_ID}`), { timeout: 120_000 });
    await expect(page).toHaveURL(/\?model=/, { timeout: 120_000 });
    await waitEditorReady(page);
    await expect(page.getByTestId('part-studio-scope-damaged')).toHaveCount(0);
    await expect(page.getByTestId('part-studio-scope-recovery')).toHaveCount(0);
    await expect(page.getByTestId('part-studio-tab-strip').getByRole('tab')).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });
});
