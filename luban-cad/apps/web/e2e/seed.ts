/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * E2E Seed 自管库重置助手（M5-T4 复测隔离）：按名删旧建新并等待 baseline initialized。
 * 原 auth.setup 的每轮重置逻辑抽成可复用单元——建模用例若同文件连续多个，
 * 必须在各自 beforeEach 重置，否则前一用例的特征会污染后一用例计数与体积。
 * 人工调试库零接触；只处理 SEED_PROJECT_NAME 下名为 E2E_IMODEL_NAME 的库。
 */

import { expect, type APIRequestContext } from '@playwright/test';
import { E2E_IMODEL_NAME, SEED_PROJECT_NAME } from './fixtures';
import { apiFindDocumentByName, authHeaders } from './helpers';

export async function resetE2eSeed(request: APIRequestContext, accessToken: string): Promise<void> {
  let seedProject = await apiFindDocumentByName(request, SEED_PROJECT_NAME, accessToken);
  if (!seedProject) {
    const created = await request.post('/itwins', {
      headers: authHeaders(accessToken),
      data: { displayName: SEED_PROJECT_NAME, class: 'Project' },
    });
    expect(created.status(), `种子项目缺失且自愈重建失败：HTTP ${created.status()}`).toBe(201);
    seedProject = ((await created.json()) as { iTwin: { id: string } }).iTwin;
  }

  const listResponse = await request.get(`/imodels?iTwinId=${seedProject.id}&$top=100`, {
    headers: authHeaders(accessToken),
  });
  expect(listResponse.ok(), 'iModel 列表查询失败').toBeTruthy();
  const { iModels } = (await listResponse.json()) as {
    iModels?: Array<{ id: string; displayName?: string; name?: string; state?: string }>;
  };
  for (const imodel of iModels ?? []) {
    if ((imodel.displayName ?? imodel.name) !== E2E_IMODEL_NAME) continue;
    const deleted = await request.delete(`/imodels/${imodel.id}`, {
      headers: authHeaders(accessToken),
    });
    expect(deleted.status(), `E2E Seed 旧库删除失败：HTTP ${deleted.status()}`).toBe(204);
  }

  const created = await request.post('/imodels', {
    headers: authHeaders(accessToken),
    data: { iTwinId: seedProject.id, name: E2E_IMODEL_NAME },
  });
  expect(created.status(), `E2E Seed 创建失败：HTTP ${created.status()}`).toBe(201);
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
      throw new Error(`E2E Seed baseline 终态 ${state}（查 docker compose logs webhook-agent）`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  expect(state, `E2E Seed 未在预算内 initialized（最后 state=${state}）`).toBe('initialized');
}
