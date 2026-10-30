/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * E2E Seed 自管库重置助手（M5-T4 复测隔离）：按名删旧建新并等待 baseline initialized。
 * 原 auth.setup 的每轮重置逻辑抽成可复用单元——建模用例若同文件连续多个，
 * 必须在各自 beforeEach 重置，否则前一用例的特征会污染后一用例计数与体积。
 *
 * P2.6a B/A 双种子：
 * - A 旧文档种子（未标记 iTwin `测试项目` / `E2E Seed`）：只读规格与文档中心/
 *   详情页真实数据锚点；行为与 P2.6 前逐字一致（只按名删 E2E Seed，人工调试库
 *   零接触）。
 * - B-model 种子（`E2E B 项目` / `E2E B Seed`）：项目创建时带
 *   `data.luban = { modelMode:'B', schemaVersion:1 }` 标记（读模型唯一裁决点见
 *   `src/clients/itwins/types.ts#isBModelItwin`）；默认 Part Studio 不在此处
 *   创建——第一次编辑器打开时由解析器经注册表创建（helpers.openSeedImodelEditor
 *   从 `?model=` 派生 scope）。
 *
 * 安全纪律（P2.6a review L3/L4/L7）：
 * - 一律按名定位，列表统一 `$top=200`（hub clampTop 上限）；同名项 ≥2 直接抛错，
 *   绝不任取第一个（reset/open 各自择行会「重置一个库、打开另一个库」）。
 * - 删除只命中本种子名下的 iModel（同项目内人工库不碰）；重复名不删，先红。
 * - B 项目标记必须**精确**匹配 P2.1 形态（modelMode='B' 且 schemaVersion=1）；
 *   未标记/版本不符视为人工同名项目，不删改未知数据，直接红（hub 的
 *   PATCH /itwins 不支持改 `data`，无法原地补标记）。
 * - 重置返回的 `{itwinId, imodelId}` 应原样传给 open helper（openSeedImodelEditor/
 *   openBModelEditor 的可选 ids），保证 reset 与 open 指向同一行。
 */

import { expect, type APIRequestContext } from '@playwright/test';
import {
  B_MODEL_MARKER,
  B_SEED_IMODEL_NAME,
  B_SEED_PROJECT_NAME,
  E2E_IMODEL_NAME,
  SEED_PROJECT_NAME,
} from './fixtures';
import {
  apiFindDocumentByName,
  authHeaders,
  SEED_PAGE_SIZE,
  uniqueMatch,
} from './helpers';

/** 种子项目 + 其下种子 iModel 的 id（A/B 通用；B 另有 scope 由 helpers 派生）。 */
export interface SeedImodelRef {
  itwinId: string;
  imodelId: string;
}

/**
 * baseline 传播窗（M1）：hub 把 iModel 状态置为 `initialized` 先于 CloudSqlite
 * blob 在 Azurite 侧完全可读。旧 scratch 构造器（boolean-bodies/newbody/
 * feature-contracts）实测：initialized 后立即打开会卡在 briefcase 下载
 * （MS 日志停在 Downloading briefcase，hub/Azurite 请求均 200/201）。先前这些
 * 构造器固定驻留 15s 规避；种子路径必须保留同等 guard，否则 per-test reset →
 * 立即 open 正是该竞态。
 */
export const SEED_BASELINE_SETTLE_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 精确 P2.1 B 标记（L4）：`data.luban.modelMode === 'B'` **且**
 * `data.luban.schemaVersion === 1`。纯函数，供 seed 自检与回归测试共用。
 */
export function hasExactBModelMarker(data: Record<string, unknown> | undefined): boolean {
  const luban = data?.luban;
  if (!luban || typeof luban !== 'object') return false;
  const marker = luban as Record<string, unknown>;
  return marker.modelMode === 'B' && marker.schemaVersion === 1;
}

/** 按名确保种子项目在场；缺失时自愈重建（A：未标记；B：带标记）。同名 ≥2 抛错。 */
async function ensureSeedProject(
  request: APIRequestContext,
  accessToken: string,
  projectName: string,
  data?: Record<string, unknown>,
): Promise<string> {
  const existing = await apiFindDocumentByName(request, projectName, accessToken);
  if (existing) return existing.id;
  const created = await request.post('/itwins', {
    headers: authHeaders(accessToken),
    // subClass-only：class 由 hub 派生（Project → Endeavor）；pre-P0 hub
    // 剥离未知 subClass 并缺省 class，种子在滚动升级窗口内同样可建。
    data: { displayName: projectName, subClass: 'Project', ...(data ? { data } : {}) },
  });
  expect(created.status(), `种子项目缺失且自愈重建失败：HTTP ${created.status()}`).toBe(201);
  return ((await created.json()) as { iTwin: { id: string } }).iTwin.id;
}

/** 读项目标记（B 种子自检；`GET /itwins/:id` → `{ iTwin }`）。 */
async function readItwinData(
  request: APIRequestContext,
  accessToken: string,
  itwinId: string,
): Promise<Record<string, unknown> | undefined> {
  const detail = await request.get(`/itwins/${itwinId}`, { headers: authHeaders(accessToken) });
  expect(detail.ok(), `项目详情查询失败（${itwinId}）：HTTP ${detail.status()}`).toBeTruthy();
  const body = (await detail.json()) as { iTwin?: { data?: Record<string, unknown> } };
  return body.iTwin?.data;
}

/** B 项目必须带**精确** P2.1 标记；否则视为人工同名项目——不删改，直接红（L4）。 */
async function assertBModelProject(
  request: APIRequestContext,
  accessToken: string,
  itwinId: string,
): Promise<void> {
  const data = await readItwinData(request, accessToken, itwinId);
  if (!hasExactBModelMarker(data)) {
    throw new Error(
      `B 种子项目 ${B_SEED_PROJECT_NAME}（${itwinId}）未带精确标记 ` +
        `data.luban={modelMode:'B',schemaVersion:1}（实得 ${JSON.stringify(data?.luban)}）——` +
        '拒绝删改未知同名项目；请人工删除该项目后重跑 auth.setup',
    );
  }
}

/** 按名重置项目内的种子 iModel（删旧建新 + 轮询 initialized + baseline settle）。 */
async function resetSeedImodel(
  request: APIRequestContext,
  accessToken: string,
  itwinId: string,
  imodelName: string,
): Promise<string> {
  const listResponse = await request.get(`/imodels?iTwinId=${itwinId}&$top=${SEED_PAGE_SIZE}`, {
    headers: authHeaders(accessToken),
  });
  expect(listResponse.ok(), 'iModel 列表查询失败').toBeTruthy();
  const { iModels } = (await listResponse.json()) as {
    iModels?: Array<{ id: string; displayName?: string; name?: string; state?: string }>;
  };
  // L3：同名重复不删（否则可能误删人工库/另一行），先红要求人工清理。
  const existing = uniqueMatch(
    iModels ?? [],
    (imodel) => imodel.displayName ?? imodel.name,
    imodelName,
    '种子库',
  );
  if (existing) {
    const deleted = await request.delete(`/imodels/${existing.id}`, {
      headers: authHeaders(accessToken),
    });
    expect(deleted.status(), `种子旧库删除失败（${imodelName}）：HTTP ${deleted.status()}`).toBe(204);
  }

  const created = await request.post('/imodels', {
    headers: authHeaders(accessToken),
    data: { iTwinId: itwinId, name: imodelName },
  });
  expect(created.status(), `种子创建失败（${imodelName}）：HTTP ${created.status()}`).toBe(201);
  const seedImodel = ((await created.json()) as { iModel: { id: string } }).iModel;

  let state = 'unknown';
  for (let i = 0; i < 110; i++) {
    const detail = await request.get(`/imodels/${seedImodel.id}`, {
      headers: authHeaders(accessToken),
    });
    const body = (await detail.json()) as { iModel?: { state?: string } };
    state = body.iModel?.state ?? 'unknown';
    if (state === 'initialized') break;
    if (state === 'failed' || state === 'missingFiles') {
      throw new Error(
        `种子 ${imodelName} baseline 终态 ${state}（查 docker compose logs webhook-agent）`,
      );
    }
    await sleep(5000);
  }
  expect(state, `种子 ${imodelName} 未在预算内 initialized（最后 state=${state}）`).toBe('initialized');

  // M1：initialized ≠ blob 可读。固定 settle 15s（旧 scratch 构造器同口径），
  // 防 per-test reset → 立即 open 的 briefcase 下载停滞。
  await sleep(SEED_BASELINE_SETTLE_MS);
  return seedImodel.id;
}

/**
 * A 旧文档种子重置（未标记项目 + `E2E Seed`）。
 * 保留给 A 只读规格/文档中心/详情页；编辑规格一律用 `resetBModelSeed`。
 * 返回值应传给 open helper（L3：同一行）。
 */
export async function resetE2eSeed(
  request: APIRequestContext,
  accessToken: string,
): Promise<SeedImodelRef> {
  const itwinId = await ensureSeedProject(request, accessToken, SEED_PROJECT_NAME);
  const imodelId = await resetSeedImodel(request, accessToken, itwinId, E2E_IMODEL_NAME);
  return { itwinId, imodelId };
}

/**
 * B-model 种子重置（精确标记项目 + `E2E B Seed`）。
 * 项目缺失时带标记自愈创建；已存在则校验精确标记（不满足即红，见文件头安全纪律）。
 * 默认 Part Studio 不预建——首开编辑器由解析器创建，scope id 由 helpers 派生。
 * 返回值应传给 `openSeedImodelEditor(page, ids)`（L3：reset/open 同一行）。
 */
export async function resetBModelSeed(
  request: APIRequestContext,
  accessToken: string,
): Promise<SeedImodelRef> {
  const itwinId = await ensureSeedProject(
    request,
    accessToken,
    B_SEED_PROJECT_NAME,
    B_MODEL_MARKER,
  );
  await assertBModelProject(request, accessToken, itwinId);
  const imodelId = await resetSeedImodel(request, accessToken, itwinId, B_SEED_IMODEL_NAME);
  return { itwinId, imodelId };
}

/** auth.setup 用：A + B 双种子一次重置（顺序执行——baseline 生成串行更稳）。 */
export async function resetE2eSeeds(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ legacy: SeedImodelRef; b: SeedImodelRef }> {
  const legacy = await resetE2eSeed(request, accessToken);
  const b = await resetBModelSeed(request, accessToken);
  return { legacy, b };
}
