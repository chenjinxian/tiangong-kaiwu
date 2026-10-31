/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * P2.6b2：B 文档全链 e2e + A 旧文档只读冒烟。
 *
 * B 全链（生产 UI 路径，无 RPC 造数）：
 *  1) B 种子项目详情页 →「新建 iModel」对话框 → 浏览器 `POST /imodels`
 *    （P2.3 F3/F4：只 POST 一次，UI 自己轮询到 initialized 才进编辑器）；
 *      **P2.6c1 flag-on**：e2e 环境以 `VITE_B_MODEL_ENABLED=true` 启动，B 项目
 *      在 `/documents` 的 B 区可见（本链先做真实列表断言）；列表→详情的 UI 入口
 *      由 documents.spec 覆盖，本链仍按种子 id 直连详情页以缩短路径；
 *  2) 打开文档 → P2.4 解析器创建默认 `Part Studio 1` 并 replace 到 `?model=`；
 *  3) 草图（上视 + 线 2 击 + 3 点弧 3 击闭环，sketch-extrude.spec 同款
 *     构造：弧端点=线端点像素，同一会话像素→草图面映射自洽）→ 拉伸 →
 *     特征树 2 节点；体位如实读回（scope-aware `getBodies`，只读 RPC，证明
 *     成体而非仅树行）；
 *  4) reload → 同一 `?model=` 活动 scope + 树/体位仍在；
 *  5)「+」创建第二个 Part Studio → 页签切走/切回（只换 URL）；连接键
 *    （`IModelConnection.key` ≡ briefcase fileName）不变、无新 IPC WebSocket、
 *    状态栏仍「已连接」；
 *  6) 顶栏「保存版本」→ CreateNamedVersionDialog → 版本历史出现该命名版本；
 *  7) 全程 console error 零（仅豁免既有外部字体资源失败，见 helpers）。
 *
 * A 只读冒烟：A 种子编辑器（未标记 `测试项目`）——只读横幅 + 连接 `isReadonly`
 * + 写工具/保存/撤销/新建 Part Studio 禁用 + 打开期间零模型写请求（hub 非 GET
 * `/itwins|/imodels|/accesscontrol` 与 MS 写 RPC 全零）+ 现有 A 文档仍可读
 * （GET /imodels/:id initialized）。本用例不建/不删/不改 A 种子。
 *
 * 隔离：B 链只创建**本项目自管**的一份 B 文档（唯一名），afterAll 按捕获到的
 * id 删除；`E2E B Seed` 与 A 种子（含同项目人工调试库）零接触。
 *
 * 预算/限流：auth.setup 每轮重置双种子；本文件共开 3 次编辑器会话（B 首开 +
 * reload + A 只读），无直连 RPC 造数循环——MS 100 req/15min 配额仅少量
 * briefcase bootstrap 与一次 getBodies 读面；若出现 429 按实际窗口回报，不重试轰炸。
 */

import { expect, test, type Page } from '@playwright/test';
import { B_SEED_PROJECT_NAME } from './fixtures';
import {
  authHeaders,
  collectConsoleErrors,
  getApiToken,
  getBodiesRpc,
  gotoRoute,
  loginWithSession,
  openLegacySeedEditor,
  readModelScopeId,
  readOpenBriefcaseInfo,
  resolveSeedImodelIds,
  waitEditorReady,
  type BSeedEditorContext,
} from './helpers';
import { SEED_BASELINE_SETTLE_MS } from './seed';

/** 本文件创建的唯一 B 文档（afterAll 按 id 清理；不触碰种子库）。 */
let createdImodelId = '';

test.afterAll(async ({ request }) => {
  if (!createdImodelId) return;
  try {
    const token = await getApiToken();
    const response = await request.delete(`/imodels/${createdImodelId}`, {
      headers: authHeaders(token),
    });
    const status = response.status();
    if (status === 204 || status === 404) {
      console.log(`[b-chain] 清理本轮 B 文档 ${createdImodelId}：HTTP ${status}`);
    } else {
      console.warn(`[b-chain] 清理本轮 B 文档失败（${createdImodelId}）：HTTP ${status}`);
    }
  } catch (error) {
    console.warn(`[b-chain] 清理本轮 B 文档异常（${createdImodelId}）：`, error);
  }
});

/** MS 健康/配额诊断（打开失败时进错误文案；429 时如实给出窗口事实）。 */
async function msHealthHint(): Promise<string> {
  try {
    const response = await fetch('http://localhost:5401/health');
    return `MS health=${response.status}${response.status === 429 ? ` (${(await response.text()).slice(0, 160)})` : ''}`;
  } catch {
    return 'MS health=<unreachable>';
  }
}

/** 编辑器就绪（错误时带 MS 健康面，区分配额 429 与连接停滞）。 */
async function waitEditorReadyDiagnosed(page: Page): Promise<void> {
  try {
    await waitEditorReady(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}；URL=${page.url()}；${await msHealthHint()}`);
  }
}

/** 画布数据点（sketch-extrude.spec 同款：近→目标两段运动 + 驻留，给 AccuSnap
 * 运动定位算热捕捉的窗口；不做视图旋转——闭环由「弧端点点击=线端点像素」构造保证）。 */
async function dataPoint(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x - 28, y + 20);
  await page.waitForTimeout(120);
  await page.mouse.move(x, y);
  await page.waitForTimeout(450);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test('B 全链：详情页建文档 → 默认 Part Studio → 草图/拉伸 → reload → 双页签 → Named Version', async ({
  page,
  request,
}) => {
  test.slow();
  test.setTimeout(1_500_000);

  const consoleErrors = collectConsoleErrors(page);

  // IPC/进度 WebSocket 计数（页签切换不得新建连接；HMR WS 不计）。
  const ipcSockets: string[] = [];
  page.on('websocket', (socket) => {
    const url = socket.url();
    if (url.includes('/ipc') || url.includes('/ws')) ipcSockets.push(url);
  });

  // 建文档请求探针（P2.3 F4：只允许一次 POST /imodels；不重复建库）。
  const createPosts: Array<{ url: string; body: string | null }> = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    try {
      if (new URL(req.url()).pathname === '/imodels') {
        createPosts.push({ url: req.url(), body: req.postData() });
      }
    } catch {
      // 非法 URL 不属模型写面
    }
  });

  const bSeed = await resolveSeedImodelIds('B');
  const docName = `E2E B Chain ${Date.now()}`;

  await loginWithSession(page);

  // ── 1) B 种子项目详情页（flag-on：B 项目在文档中心 B 区，详情直连）────
  // 先钉 flag-on 的真实列表面（B 种子项目在 B 区——不是伪造列表）；本链后续
  // 要测「详情页新建 iModel」，直接按 id 进入详情页（列表→详情的 UI 路径由
  // documents.spec 的 P2.6c1 用例覆盖）。
  await gotoRoute(page, '/documents', 'documents-route');
  await expect(
    page.getByTestId('projects-section').getByRole('button', { name: B_SEED_PROJECT_NAME }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await gotoRoute(page, `/documents/${bSeed.itwinId}`, 'document-details-route');
  await expect(page.getByTestId('legacy-readonly-banner')).toHaveCount(0);
  const createButton = page.getByRole('button', { name: '新建 iModel' }).first();
  await expect(createButton).toBeVisible({ timeout: 20_000 });
  await createButton.click();

  const createDialog = page.getByRole('dialog', { name: '新建 iModel' });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/iModel 名称/).fill(docName);

  // 响应监听先于提交（唯一 POST 的载体；id 供 afterAll 清理与后续断言）。
  const createResponsePromise = page.waitForResponse(
    (response) => {
      try {
        return (
          response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/imodels'
        );
      } catch {
        return false;
      }
    },
    { timeout: 60_000 },
  );
  await createDialog.getByRole('button', { name: '创建', exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status(), 'POST /imodels 应返回 201').toBe(201);
  const createBody = (await createResponse.json()) as { iModel?: { id?: string } };
  const imodelId = createBody.iModel?.id;
  expect(imodelId, 'POST /imodels 响应须携带 iModel.id').toBeTruthy();
  createdImodelId = imodelId as string;

  // UI 等到初始化完成才导航进编辑器（CreateImodelDialog 内置轮询）。
  await expect(page).toHaveURL(
    new RegExp(`/documents/${bSeed.itwinId}/${createdImodelId}`),
    { timeout: 120_000 },
  );
  const detailResponse = await request.get(`/imodels/${createdImodelId}`, {
    headers: authHeaders(await getApiToken()),
  });
  expect(detailResponse.ok(), 'GET /imodels/:id 应 200').toBeTruthy();
  const detailBody = (await detailResponse.json()) as { iModel?: { state?: string } };
  expect(detailBody.iModel?.state, '进入编辑器时文档应为 initialized').toBe('initialized');

  // P2.6b2 F2（P2.6c2 承接）：hub 把 state 置 initialized 先于 baseline blob 在
  // Azurite 完全可读（seed.ts M1 竞态）。本链新建的文档由 UI 在 initialized 后
  // 立即导航打开，正落在该窗口——慢栈下 briefcase 下载可能停滞。等传播窗后
  // reload 一次，让被测首开从 settled 状态起步（seed 重置路径同款 15s guard）。
  await page.waitForTimeout(SEED_BASELINE_SETTLE_MS);
  await page.reload();

  // ── 2) 解析器默认 Part Studio + 可写连接 ────────────────────────────────
  await waitEditorReadyDiagnosed(page);
  await expect(page).toHaveURL(/\?model=/);
  const firstScope = readModelScopeId(page);
  expect(firstScope, '默认 Part Studio 应写入 ?model=').toBeTruthy();
  const firstScopeId = firstScope as string;

  expect(createPosts, '创建文档只允许一次 POST /imodels（不得重复建库）').toHaveLength(1);
  expect(createPosts[0]!.body ?? '').toContain(docName);

  const tabStrip = page.getByTestId('part-studio-tab-strip');
  const tabs = tabStrip.getByRole('tab');
  await expect(tabs).toHaveCount(1, { timeout: 60_000 });
  await expect(tabStrip.locator(`[data-studio-id="${firstScopeId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tabs.first()).toHaveText('Part Studio 1');

  const openInfo = await readOpenBriefcaseInfo(page);
  expect(openInfo.key, 'B 文档应打开 briefcase（connection.key 在场）').toBeTruthy();
  expect(openInfo.isReadonly, 'B 文档连接应为可写').toBe(false);
  const dbKey = openInfo.key as string;
  const ctx: BSeedEditorContext = {
    itwinId: bSeed.itwinId,
    imodelId: createdImodelId,
    scopeId: firstScopeId,
    dbKey,
  };

  const featureCount = page.getByTestId('part-studio-feature-count');
  const featureList = page.getByTestId('part-studio-feature-list');
  const featureDialog = page.getByTestId('part-studio-feature-dialog');

  // ── 3) 草图（上视 + 线/3 点弧闭环）→ 拉伸 ──────────────────────────────
  await page.getByRole('button', { name: '草图', exact: true }).click();
  const sketchDialog = page.getByTestId('part-studio-sketch-dialog');
  await expect(sketchDialog).toBeVisible();
  await sketchDialog.getByRole('combobox', { name: '草图平面' }).selectOption({ label: '上视' });
  await sketchDialog.getByRole('button', { name: '确认' }).click();
  // 提交双通道：成功=「退出草图」现身；拒收=对话框 alert（原文抛出）。
  await expect(
    page
      .getByTestId('part-studio-ribbon')
      .getByRole('button', { name: '退出草图' })
      .or(sketchDialog.getByTestId('part-studio-sketch-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
  if ((await sketchDialog.getByTestId('part-studio-sketch-dialog-error').count()) > 0) {
    throw new Error(
      `insertSketch 被后端拒收：${await sketchDialog
        .getByTestId('part-studio-sketch-dialog-error')
        .textContent()}`,
    );
  }

  const sketchToolbar = page.getByRole('toolbar', { name: '草图工具' });
  await expect(sketchToolbar).toBeVisible({ timeout: 60_000 });
  await expect(featureCount).toHaveText('(1)', { timeout: 60_000 });
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible();

  // 线（2 击）+ 3 点弧（3 击）：弧端点点击=线端点像素 → 同一像素经同一会话
  // 工具事件管道映回同一草图面点，闭环由构造保证（sketch-extrude.spec 实证）。
  const canvas = page.getByTestId('part-studio-viewport').locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas boundingBox 不可得（视口未挂载？）');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const pointA = { x: cx - 150, y: cy }; // 线起点（像素）
  const pointB = { x: cx + 150, y: cy }; // 线终点（像素）
  const lineButton = sketchToolbar.getByRole('button', { name: '线', exact: true });
  const arcButton = sketchToolbar.getByRole('button', { name: '圆弧', exact: true });
  await lineButton.click();
  await expect(lineButton).toHaveAttribute('aria-pressed', 'true');
  await dataPoint(page, pointA.x, pointA.y);
  await dataPoint(page, pointB.x, pointB.y);
  await page.waitForTimeout(2_000);
  await arcButton.click();
  await expect(arcButton).toHaveAttribute('aria-pressed', 'true');
  await dataPoint(page, pointB.x, pointB.y); // 弧起点=线终点
  await dataPoint(page, pointA.x, pointA.y); // 弧终点=线起点（闭环）
  await dataPoint(page, cx, cy - 80); // 弧上点外挑
  await page.waitForTimeout(2_000);

  await page.getByTestId('part-studio-ribbon').getByRole('button', { name: '退出草图' }).click();
  await expect(page.getByRole('toolbar', { name: '特征工具' })).toBeVisible();

  await page.getByRole('button', { name: '拉伸', exact: true }).click();
  await expect(featureDialog).toBeVisible();
  await featureDialog.getByRole('combobox', { name: '草图' }).selectOption({ label: '草图 1' });
  await expect(featureDialog.getByText('草图 1 的面', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(featureDialog.getByRole('button', { name: '确认' })).toBeEnabled({
    timeout: 10_000,
  });
  await featureDialog.getByRole('button', { name: '确认' }).click();
  await expect(
    featureList
      .getByRole('button', { name: '拉伸 1' })
      .or(featureDialog.getByTestId('part-studio-feature-dialog-error')),
  ).toBeVisible({ timeout: 60_000 });
  if ((await featureDialog.getByTestId('part-studio-feature-dialog-error').count()) > 0) {
    throw new Error(
      `insertFeature 被后端拒收：${await featureDialog
        .getByTestId('part-studio-feature-dialog-error')
        .textContent()}`,
    );
  }
  await expect(featureCount).toHaveText('(2)', { timeout: 30_000 });
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible();
  await expect(featureList.getByRole('button', { name: '拉伸 1' })).toBeVisible();

  // 体位读回（scope-aware 只读 RPC）：拉伸确实成体，而非仅树行。
  const bodies = await getBodiesRpc(ctx, await getApiToken(), firstScopeId);
  expect(
    bodies.length,
    `拉伸后应有 ≥1 个 body（getBodies scope=${firstScopeId}）`,
  ).toBeGreaterThanOrEqual(1);

  // ── 4) reload：同活动 scope + 树持久 ───────────────────────────────────
  await page.reload();
  await waitEditorReadyDiagnosed(page);
  expect(readModelScopeId(page), 'reload 后活动 scope 应保持').toBe(firstScopeId);
  await expect(tabs).toHaveCount(1, { timeout: 60_000 });
  await expect(tabStrip.locator(`[data-studio-id="${firstScopeId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(featureCount).toHaveText('(2)', { timeout: 60_000 });
  await expect(featureList.getByRole('button', { name: '草图 1' })).toBeVisible();
  await expect(featureList.getByRole('button', { name: '拉伸 1' })).toBeVisible();

  const reloadedInfo = await readOpenBriefcaseInfo(page);
  expect(reloadedInfo.key, 'reload 后应重新打开同一 briefcase').toBe(openInfo.key);

  // reload 不触发 React unmount → 前页写租约靠 30s TTL 自然过期（P2.6a 实测
  // 陈旧 holder 会拒 registry 写）。实测（P2.6b2）：去掉本等待后点「+」页签数
  // 停在 1（registry acquire 10s 预算耗尽，就地报错）；等满 TTL 后同一路径通过。
  // 这是产品写租约语义下的确定性前置，不是断言放宽——「+」仍必须成功换 scope。
  await page.waitForTimeout(30_000);

  // ── 5)「+」第二个 Part Studio → 页签切换 → 连接键稳定 ──────────────────
  const ipcBeforeSwitch = [...ipcSockets];
  await page.getByTestId('part-studio-new-tab-button').click();
  await expect(tabs).toHaveCount(2, { timeout: 60_000 });
  const secondScope = readModelScopeId(page);
  expect(secondScope, '「+」后 URL 应切到新 scope').toBeTruthy();
  expect(secondScope).not.toBe(firstScopeId);
  await expect(tabStrip.locator(`[data-studio-id="${secondScope}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(featureCount).toHaveText('(0)', { timeout: 30_000 });
  await expect(page.getByTestId('part-studio-status-connection')).toHaveText('已连接');

  // 页签切回（只换 URL）：树恢复 + 连接键/WS 均不变。
  await tabStrip.locator(`[data-studio-id="${firstScopeId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`[?&]model=${firstScopeId}`), { timeout: 30_000 });
  await expect(tabStrip.locator(`[data-studio-id="${firstScopeId}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(featureCount).toHaveText('(2)', { timeout: 30_000 });
  await expect(featureList.getByRole('button', { name: '拉伸 1' })).toBeVisible();

  const afterSwitchInfo = await readOpenBriefcaseInfo(page);
  expect(afterSwitchInfo.key, '页签切换后连接键须不变（不重建 BriefcaseConnection）').toBe(dbKey);
  expect(ipcSockets, '页签切换不得新建 IPC/进度 WebSocket').toEqual(ipcBeforeSwitch);
  await expect(page.getByTestId('part-studio-status-connection')).toHaveText('已连接');

  // ── 6) Named Version（顶栏保存版本）→ 版本历史 ────────────────────────
  const versionName = `E2E B Chain V ${Date.now()}`;
  const saveButton = page.getByTestId('part-studio-save-button');
  await expect(saveButton).toBeEnabled({ timeout: 30_000 });
  await saveButton.click();
  const versionDialog = page.getByRole('dialog', { name: '保存版本' });
  await expect(versionDialog).toBeVisible({ timeout: 15_000 });
  await versionDialog.getByLabel('版本名称').fill(versionName);
  await versionDialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('版本已保存')).toBeVisible({ timeout: 90_000 });
  await expect(saveButton).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('part-studio-dock').getByRole('tab', { name: '版本历史' }).click();
  await expect(
    page.getByTestId('part-studio-named-versions').getByText(versionName),
  ).toBeVisible({ timeout: 30_000 });

  // ── 7) 全程零 console error ────────────────────────────────────────────
  expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
});

// ============================================================================
// A 旧文档只读冒烟（P2.6b2）：不建/不删/不改 A 种子；现有文档仍可打开读。
// ============================================================================

test.describe('A 旧文档只读', () => {
  test('打开 A 种子：只读横幅/只读连接/编辑入口禁用/零模型写请求', async ({ page, request }) => {
    test.slow();
    test.setTimeout(600_000);

    const consoleErrors = collectConsoleErrors(page);

    // 模型写面探针：hub 资源非 GET + MS 写 RPC（URL path 携带操作名）。
    const writeRequests: string[] = [];
    page.on('request', (req) => {
      const method = req.method();
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
      const url = req.url();
      let path = '';
      try {
        path = new URL(url).pathname;
      } catch {
        return;
      }
      const hubWrite =
        path.startsWith('/itwins')
        || path.startsWith('/imodels')
        || path.startsWith('/accesscontrol');
      const msWrite =
        /applyFeatureOp|acquireWriteLease|releaseWriteLease|previewFeatureOp|createPartStudio|renamePartStudio|deletePartStudio/.test(
          url,
        );
      if (hubWrite || msWrite) writeRequests.push(`${method} ${url}`);
    });

    const legacyIds = await resolveSeedImodelIds('A');
    const legacy = await openLegacySeedEditor(page, legacyIds);
    expect(legacy.kind).toBe('A');

    // 只读读面：连接 + 画布 + 无 ?model= + 只读横幅。
    await expect(page).not.toHaveURL(/[?&]model=/);
    await expect(page.getByTestId('part-studio-readonly-banner')).toBeVisible();
    await expect(page.getByTestId('part-studio-status-connection')).toHaveText('已连接');
    await expect(
      page.getByTestId('part-studio-viewport').locator('canvas').first(),
    ).toBeVisible();

    // 连接级只读：briefcase 以 readonly 打开（不是仅 UI 禁用）。
    const info = await readOpenBriefcaseInfo(page);
    expect(info.key, 'A 文档应打开 briefcase').toBeTruthy();
    expect(info.isReadonly, 'A 文档连接必须以只读模式打开').toBe(true);

    // 写面收口：全量写工具 + 顶栏保存/撤销/重做 + 「+」新建 Part Studio。
    for (const name of ['草图', '拉伸', '旋转', '倒角']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    await expect(page.getByTestId('part-studio-new-tab-button')).toBeDisabled();
    await expect(page.getByTestId('part-studio-save-button')).toBeDisabled();
    await expect(page.getByTestId('part-studio-undo-button')).toBeDisabled();
    await expect(page.getByTestId('part-studio-redo-button')).toBeDisabled();

    // 读面交互仍可用（文档菜单开合——只读页完整 UI 面）。
    await page.getByRole('button', { name: '文档菜单' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: '关闭文档' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // 现有 A 文档仍可读（hub GET）且状态未变。
    const detail = await request.get(`/imodels/${legacyIds.imodelId}`, {
      headers: authHeaders(await getApiToken()),
    });
    expect(detail.ok(), 'GET /imodels/:id（A 种子）应 200').toBeTruthy();
    const detailBody = (await detail.json()) as { iModel?: { state?: string; id?: string } };
    expect(detailBody.iModel?.id).toBe(legacyIds.imodelId);
    expect(detailBody.iModel?.state).toBe('initialized');

    // 写面探针窗口：打开 + 读操作的整段期间零模型写请求。
    await page.waitForTimeout(2_000);
    expect(
      writeRequests,
      `A 只读打开期间不得出现模型写请求：\n${writeRequests.join('\n')}`,
    ).toHaveLength(0);

    expect(consoleErrors, `console error 应为空：\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });
});
