/**
 * 每个 Onshape 示例的持久 iModel 生命周期（2026-11-05 需求）。
 *
 * 与 e2e/seed.ts 的 reset* 不同：这里**不删除已有示例库**。首次运行创建
 * B 标记项目下的具名 iModel，之后重复运行直接复用；只有显式 reset 才重建。
 * 模型内容通过真实 web 编辑器构建后由 dock「推送」写入 hub changeset。
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { PartStudioInfo } from '@luban-cad/shared';
import { B_MODEL_MARKER } from '../fixtures.js';
import {
  apiFindDocumentByName,
  authHeaders,
  borrowWriteLease,
  createPartStudioRpc,
  listPartStudiosRpc,
  openBModelEditor,
  openBModelPartStudio,
  renamePartStudioRpc,
  SEED_PAGE_SIZE,
  type BSeedEditorContext,
  type EditorReadyOptions,
} from '../helpers.js';
import {
  assertBModelProject,
  ensureSeedProject,
  type SeedImodelRef,
} from '../seed.js';
import type { ExampleDocumentEntry, ExampleScopeEntry } from './registry.js';

/** 所有示例共用的 B 标记项目。 */
export const EXAMPLE_PROJECT_NAME = 'Onshape 示例复刻';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 确保示例项目存在，且带精确 B 标记（不满足即拒绝改名/改标记）。 */
export async function ensureExampleProjectNamed(
  request: APIRequestContext,
  accessToken: string,
  projectName: string,
): Promise<string> {
  const itwinId = await ensureSeedProject(
    request,
    accessToken,
    projectName,
    B_MODEL_MARKER,
  );
  await assertBModelProject(request, accessToken, itwinId);
  return itwinId;
}

/** 默认示例项目（历史 12 个示例除 Tutorial 2 外都在这里）。 */
export async function ensureExampleProject(
  request: APIRequestContext,
  accessToken: string,
): Promise<string> {
  return ensureExampleProjectNamed(request, accessToken, EXAMPLE_PROJECT_NAME);
}

/** 在指定项目下按名确保 iModel；存在复用，缺失创建；同名 ≥2 直接抛错。 */
async function ensureImodelInProject(
  request: APIRequestContext,
  accessToken: string,
  itwinId: string,
  imodelName: string,
  options: { reset?: boolean } = {},
): Promise<SeedImodelRef> {
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

/**
 * 按名确保示例 iModel 存在（固定默认示例项目）；保留给 legacy 12 个 spec。
 */
export async function ensureExampleImodel(
  request: APIRequestContext,
  accessToken: string,
  imodelName: string,
  options: { reset?: boolean } = {},
): Promise<SeedImodelRef> {
  const itwinId = await ensureExampleProject(request, accessToken);
  return ensureImodelInProject(request, accessToken, itwinId, imodelName, options);
}

/**
 * 新标准：一个 Onshape 文档 = 一个 iModel。项目名/imodel 名来自 registry；
 * blocked PS 不在这里建 scope（由 ensureExamplePartStudios 只建可构建条目）。
 */
export async function ensureExampleDocument(
  request: APIRequestContext,
  accessToken: string,
  entry: ExampleDocumentEntry,
  options: { reset?: boolean } = {},
): Promise<SeedImodelRef> {
  const itwinId = await ensureExampleProjectNamed(request, accessToken, entry.projectName);
  return ensureImodelInProject(request, accessToken, itwinId, entry.imodelName, options);
}

/** 只读定位已有示例文档（verifier 用）：缺失/同名 ≥2 直接失败，不创建。 */
export async function findExampleDocument(
  request: APIRequestContext,
  accessToken: string,
  entry: ExampleDocumentEntry,
): Promise<SeedImodelRef> {
  const project = await apiFindDocumentByName(request, entry.projectName, accessToken);
  if (!project)
    throw new Error(`示例项目不在场：${entry.projectName}`);
  const itwinId = project.id;
  const listResponse = await request.get(`/imodels?iTwinId=${itwinId}&$top=${SEED_PAGE_SIZE}`, {
    headers: authHeaders(accessToken),
  });
  expect(listResponse.ok(), `示例 iModel 列表查询失败（${entry.projectName}）`).toBeTruthy();
  const { iModels } = (await listResponse.json()) as {
    iModels?: Array<{ id: string; displayName?: string; name?: string }>;
  };
  const matches = (iModels ?? []).filter(
    (imodel) => (imodel.displayName ?? imodel.name) === entry.imodelName,
  );
  if (matches.length === 0) throw new Error(`示例 iModel 不在场：${entry.projectName}/${entry.imodelName}`);
  if (matches.length > 1)
    throw new Error(`示例 iModel 同名 ≥2（${entry.imodelName}）：${matches.map((m) => m.id).join(',')}`);
  return { itwinId, imodelId: matches[0]!.id };
}

/** 打开示例编辑器（首次打开会由 B 解析器创建 Part Studio 1）。 */
export async function openExampleEditor(
  page: Page,
  ids: SeedImodelRef,
  options?: EditorReadyOptions,
): Promise<BSeedEditorContext> {
  return openBModelEditor(page, ids, options);
}

/** 打开文档内指定 PS scope（新标准多页签）。 */
export async function openExamplePartStudio(
  page: Page,
  ids: SeedImodelRef,
  scopeId: string,
  options?: EditorReadyOptions,
): Promise<BSeedEditorContext> {
  return openBModelPartStudio(page, ids, scopeId, options);
}

/** 只有可构建 scope 才建页签；blocked/excluded 留在 catalog，不建空壳。 */
export function isBuildableScope(scope: ExampleScopeEntry): boolean {
  if (!scope.classification) return true;
  return scope.classification === 'replicable-now';
}

/**
 * 幂等补齐文档内所有可构建 Part Studio scope。
 *
 * - 默认 "Part Studio 1" 是编辑器首开自动创建的；第一个 registry scope 复用它
 *   并改名，其余 createPartStudio；
 * - 已存在的同名 scope 复用；同名 ≥2 抛错，不任取一条；
 * - blocked/excluded scope 不建空壳；
 * - 所有写操作走写租约（一个文档一个 lease）。
 */
export async function ensureExamplePartStudios(
  ctx: BSeedEditorContext,
  entry: ExampleDocumentEntry,
  accessToken: string,
): Promise<Map<string, PartStudioInfo>> {
  const scopes = entry.scopes.filter(isBuildableScope);
  if (scopes.length === 0) return new Map();
  const lease = await borrowWriteLease(ctx, accessToken, `example:${entry.id}`);
  const existing = await listPartStudiosRpc(ctx, accessToken);
  const byName = new Map<string, PartStudioInfo[]>();
  for (const studio of existing) {
    const list = byName.get(studio.name) ?? [];
    list.push(studio);
    byName.set(studio.name, list);
  }

  const result = new Map<string, PartStudioInfo>();
  let defaultStudio: PartStudioInfo | undefined =
    byName.get('Part Studio 1')?.length === 1 ? byName.get('Part Studio 1')![0] : undefined;
  const claimed = new Set<string>();

  for (const scope of scopes) {
    const matches = byName.get(scope.name) ?? [];
    if (matches.length > 1)
      throw new Error(`Part Studio 同名 ≥2（${entry.imodelName}/${scope.name}）：${matches.map((m) => m.id).join(',')}`);
    if (matches.length === 1) {
      result.set(scope.id, matches[0]!);
      claimed.add(matches[0]!.id);
      continue;
    }
    if (defaultStudio && !claimed.has(defaultStudio.id)) {
      const renamed = await renamePartStudioRpc(
        ctx,
        defaultStudio.id,
        scope.name,
        lease,
        accessToken,
      );
      result.set(scope.id, renamed);
      claimed.add(renamed.id);
      defaultStudio = undefined;
      continue;
    }
    const created = await createPartStudioRpc(ctx, scope.name, lease, accessToken);
    result.set(scope.id, created);
    claimed.add(created.id);
  }
  return result;
}

/**
 * ADR-0017 Stage F：自动保存（Onshape 语义）下的持久化收敛点。
 *
 * 常规 UI 已无「保存/推送」按钮——每次提交后 useAutoPush 防抖静默推送。
 * 本 helper 保留原签名：
 * 1) 先经页面桥 `flushAutoPush(description)` 在仍有 pending 时立即以自定义
 *    描述推送（老 spec 的 changeset 描述断言仍可命中）；
 * 2) 否则等待自动保存状态落定（`part-studio-autosave-state` → idle），
 *    确保 hub 已收到变更（自动保存描述恒「自动保存」）。
 */
export async function pushExampleChanges(page: Page, description: string): Promise<void> {
  await page.evaluate(async (desc) => {
    const host = (window as unknown as {
      __lubanE2EApp?: { flushAutoPush?: (d: string) => Promise<boolean> };
    }).__lubanE2EApp;
    await host?.flushAutoPush?.(desc);
  }, description);
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="part-studio-autosave-state"]');
    return !node || node.getAttribute('data-state') === 'idle';
  }, undefined, { timeout: 120_000 }).catch(() => undefined);
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
