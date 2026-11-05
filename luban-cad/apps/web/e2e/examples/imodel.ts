/**
 * 每个 Onshape 示例的持久 iModel 生命周期（2026-11-05 需求）。
 *
 * 与 e2e/seed.ts 的 reset* 不同：这里**不删除已有示例库**。首次运行创建
 * B 标记项目下的具名 iModel，之后重复运行直接复用；只有显式 reset 才重建。
 * 模型内容通过真实 web 编辑器构建后由 dock「推送」写入 hub changeset。
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { B_MODEL_MARKER } from '../fixtures.js';
import {
  authHeaders,
  openBModelEditor,
  SEED_PAGE_SIZE,
  type BSeedEditorContext,
} from '../helpers.js';
import {
  assertBModelProject,
  ensureSeedProject,
  type SeedImodelRef,
} from '../seed.js';

/** 所有示例共用的 B 标记项目。 */
export const EXAMPLE_PROJECT_NAME = 'Onshape 示例复刻';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 确保示例项目存在，且带精确 B 标记（不满足即拒绝改名/改标记）。 */
export async function ensureExampleProject(
  request: APIRequestContext,
  accessToken: string,
): Promise<string> {
  const itwinId = await ensureSeedProject(
    request,
    accessToken,
    EXAMPLE_PROJECT_NAME,
    B_MODEL_MARKER,
  );
  await assertBModelProject(request, accessToken, itwinId);
  return itwinId;
}

/**
 * 按名确保示例 iModel 存在：存在则复用；缺失则创建并等 baseline initialized。
 * 同名 ≥2 直接抛错（不任取一行）。
 */
export async function ensureExampleImodel(
  request: APIRequestContext,
  accessToken: string,
  imodelName: string,
  options: { reset?: boolean } = {},
): Promise<SeedImodelRef> {
  const itwinId = await ensureExampleProject(request, accessToken);
  const listResponse = await request.get(`/imodels?iTwinId=${itwinId}&$top=${SEED_PAGE_SIZE}`, {
    headers: authHeaders(accessToken),
  });
  expect(listResponse.ok(), '示例 iModel 列表查询失败').toBeTruthy();
  const { iModels } = (await listResponse.json()) as {
    iModels?: Array<{ id: string; displayName?: string; name?: string }>;
  };
  const matches = (iModels ?? []).filter(
    (imodel) => (imodel.displayName ?? imodel.name) === imodelName,
  );
  if (matches.length > 1)
    throw new Error(`示例 iModel 同名 ≥2（${imodelName}）：${matches.map((m) => m.id).join(',')}`);

  if (matches.length === 1 && !options.reset)
    return { itwinId, imodelId: matches[0]!.id };

  if (matches.length === 1 && options.reset) {
    const deleted = await request.delete(`/imodels/${matches[0]!.id}`, {
      headers: authHeaders(accessToken),
    });
    expect(deleted.status(), `示例旧库删除失败（${imodelName}）：HTTP ${deleted.status()}`).toBe(204);
  }

  const created = await request.post('/imodels', {
    headers: authHeaders(accessToken),
    data: { iTwinId: itwinId, name: imodelName },
  });
  expect(created.status(), `示例库创建失败（${imodelName}）：HTTP ${created.status()}`).toBe(201);
  const imodelId = ((await created.json()) as { iModel: { id: string } }).iModel.id;

  let state = 'unknown';
  for (let i = 0; i < 110; i++) {
    const detail = await request.get(`/imodels/${imodelId}`, {
      headers: authHeaders(accessToken),
    });
    const body = (await detail.json()) as { iModel?: { state?: string } };
    state = body.iModel?.state ?? 'unknown';
    if (state === 'initialized') break;
    if (state === 'failed' || state === 'missingFiles') {
      throw new Error(
        `示例库 ${imodelName} baseline 终态 ${state}（查 docker compose logs webhook-agent）`,
      );
    }
    await sleep(5000);
  }
  expect(state, `示例库 ${imodelName} 未在预算内 initialized（最后 state=${state}）`).toBe('initialized');
  return { itwinId, imodelId };
}

/** 打开示例编辑器（首次打开会由 B 解析器创建 Part Studio 1）。 */
export async function openExampleEditor(
  page: Page,
  ids: SeedImodelRef,
): Promise<BSeedEditorContext> {
  return openBModelEditor(page, ids);
}

/**
 * 通过真实 UI 的 dock「版本和历史记录」→「推送」把本地特征变更推到 hub。
 * 与 First Demo（Tutorial 2）不同，本流程要求模型真正持久化，故必须显式推送。
 */
export async function pushExampleChanges(page: Page, description: string): Promise<void> {
  await page.getByTestId('part-studio-panel-rail-history').click();
  const push = page.getByTestId('part-studio-dock-push-button');
  await expect(push).toBeVisible({ timeout: 15_000 });
  await expect(push).toBeEnabled({ timeout: 30_000 });
  await push.click();
  const dialog = page.getByRole('dialog', { name: '推送变更' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('part-studio-push-description-input').fill(description);
  await page.getByTestId('part-studio-push-confirm-button').click();
  await expect(dialog).toBeHidden({ timeout: 120_000 });
}

/** hub changeset 摘要（推送后校验用）。 */
export async function listExampleChangesets(
  request: APIRequestContext,
  accessToken: string,
  imodelId: string,
): Promise<Array<{ id: string; description?: string }>> {
  const response = await request.get(`/imodels/${imodelId}/changesets`, {
    headers: authHeaders(accessToken),
  });
  expect(response.ok(), `changeset 列表查询失败：HTTP ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as {
    changesets?: Array<{ id: string; description?: string }>;
  };
  return body.changesets ?? [];
}
