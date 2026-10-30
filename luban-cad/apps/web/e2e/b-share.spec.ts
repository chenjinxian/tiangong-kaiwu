/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * A6 分享运行时门禁（P2.3 review §A6 / P2.6 Step 3b）——真实两用户，UI 路径：
 * - A = 种子账号 TEST_USER（`E2E B 项目` 创建者/owner，直接 URL 进入详情页）；
 * - B = 确定性真实用户（`e2e-share-b2@example.com`）：
 *   登录/刷新产物缓存于 `playwright/.auth/share-user-b.json`（同 A 会话纪律，
 *   避免每次跑都吃 hub 登录 5/15min 与注册 3/hour 额度）；首次不存在时走
 *   `/auth/email/register` 注册后登录。B 以 **默认成员权限** 加入 iTwin
 *   （POST members/users 只带 email + roleIds: []——hub 解析为 users.id）。
 *   该成员行**保留**（项目级 seed）：hub 成员删除是软删且 (iTwinId,userId)
 *   唯一约束不排除软删行，删后重加会 500 duplicate key（P2.6b1 实测）。
 *
 * 断言链（与 A6 逐条对应）：
 * 1. `GET /accesscontrol/itwins/:id/members/users` 对已注册成员返回数字
 *    `userId`（= B 的 users.id，非 email、非成员行 UUID）；
 * 2. A 在分享面板「限制访问」HITL → PATCH `{isSecured:true}`；授权 B 只读 →
 *    拦截浏览器发出的 grant 请求，断言 body.userId = B users.id 且四维 read；
 * 3. B 独立 token：`GET /imodels/:id` 与 `GET /imodels/:id/changesets` 均 200；
 * 4. A UI 撤销 → DELETE users/:userId（= B users.id）→ B 两路由 403；
 * 5. A UI「恢复项目级访问」→ PATCH `{isSecured:false}` → B 两路由 200；
 * 6. 未注册邮箱邀请：只加项目成员、不发 grant（无 grant 网络请求、无权限行），
 *    UI 如实提示「已加入项目成员，但该邮箱尚未注册…」。
 *
 * 隔离/清理：只使用 B 种子项目（auth.setup 每轮新建）与固定 B 账号 + 每轮
 * 唯一的 `e2e-unregistered-share-*` 邀请邮箱；每例前后只撤销本用例邮箱的
 * 授权、清掉未注册邀请成员，并把种子 iModel 复位为未 secured，不触碰人工数据。
 * 仅 hub 面，不打开编辑器（不消耗 MS 100/15min 配额）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { B_SEED_IMODEL_NAME } from './fixtures';
import {
  authHeaders,
  collectConsoleErrors,
  getApiToken,
  gotoRoute,
  loginWithSession,
  resolveSeedImodelIds,
} from './helpers';

const SHARE_USER = {
  email: 'e2e-share-b2@example.com',
  password: 'ShareB123!@#',
  firstName: 'Share',
  lastName: 'B',
} as const;

/**
 * 未注册邀请目标：永不注册；**每轮唯一**（hub 成员删除为软删，且
 * `@Unique(iTwinId,userId)` 不排除软删行——复用同一 email 再邀请会 500
 * duplicate key；唯一值使每轮可独立验证「成员在、grant 无」）。
 */
let UNREGISTERED_EMAIL = '';

/** B 用户会话产物（playwright/.auth 已在根 .gitignore；与 A 会话同目录）。 */
const SHARE_SESSION_FILE = 'playwright/.auth/share-user-b.json';

interface ShareUserSession {
  token: string;
  userId: string;
  email: string;
}

interface CachedShareUser extends ShareUserSession {
  refreshToken: string;
  expiresAt: number;
}

interface MemberRow {
  id: string;
  userId?: string;
  email: string;
  roles?: Array<{ id: string; displayName?: string }>;
}

interface ImodelPermissionRow {
  id: string;
  userId: string;
}

let itwinId = '';
let imodelId = '';
let bUser!: ShareUserSession;
let bMemberRowId = '';
let consoleErrors: string[] = [];

// ---------------------------------------------------------------------------
// B 用户会话（缓存 → refresh → login → register+login）
// ---------------------------------------------------------------------------

function readCachedShareUser(): CachedShareUser | null {
  try {
    return JSON.parse(readFileSync(SHARE_SESSION_FILE, 'utf-8')) as CachedShareUser;
  } catch {
    return null;
  }
}

function writeCachedShareUser(cached: CachedShareUser): void {
  mkdirSync('playwright/.auth', { recursive: true });
  writeFileSync(SHARE_SESSION_FILE, JSON.stringify(cached), 'utf-8');
}

async function loginRequest(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ status: number; body: { token?: string; refreshToken?: string; tokenExpires?: number; user?: { id: string | number; email?: string | null } }; text: string }> {
  const response = await request.post('/auth/email/login', { data: { email, password } });
  const text = await response.text();
  let body: { token?: string; refreshToken?: string; tokenExpires?: number; user?: { id: string | number; email?: string | null } } = {};
  try {
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    // 非 JSON 响应由调用方以 text 呈现
  }
  return { status: response.status(), body, text };
}

async function registerRequest(
  request: APIRequestContext,
): Promise<{ status: number; text: string }> {
  const response = await request.post('/auth/email/register', {
    data: {
      email: SHARE_USER.email,
      password: SHARE_USER.password,
      firstName: SHARE_USER.firstName,
      lastName: SHARE_USER.lastName,
    },
  });
  return { status: response.status(), text: await response.text() };
}

/**
 * 取 B 用户独立会话：缓存 access token 有效 → 直接复用；过期 → refresh；
 * refresh 失效 → 登录；登录报「邮箱不存在」→ 注册一次再登录。
 * 429 一律显式抛错（不把限流伪装成产品失败，也不在限流下继续注册）。
 */
async function getShareUserSession(request: APIRequestContext): Promise<ShareUserSession> {
  const cached = readCachedShareUser();
  // 邮箱变更即视为无效缓存（旧确定性账号的 token 不得冒充新账号）。
  const usable = cached?.email === SHARE_USER.email ? cached : null;
  if (usable?.token) {
    const me = await request.get('/auth/me', { headers: authHeaders(usable.token) });
    if (me.ok()) {
      return { token: usable.token, userId: usable.userId, email: usable.email };
    }
  }
  if (usable?.refreshToken) {
    const refresh = await request.post('/auth/refresh', {
      headers: {
        Authorization: `Bearer ${usable.refreshToken}`,
        'Content-Type': 'application/json',
      },
      data: { refreshToken: usable.refreshToken },
    });
    if (refresh.ok()) {
      const body = (await refresh.json()) as {
        token: string;
        refreshToken: string;
        tokenExpires?: number;
      };
      writeCachedShareUser({
        token: body.token,
        refreshToken: body.refreshToken,
        expiresAt: body.tokenExpires || Date.now() + 15 * 60 * 1000,
        userId: usable.userId,
        email: usable.email,
      });
      return { token: body.token, userId: usable.userId, email: usable.email };
    }
  }

  let login = await loginRequest(request, SHARE_USER.email, SHARE_USER.password);
  if (login.status === 429) {
    throw new Error(
      `B 用户登录触发 hub 限流（429）：${login.text.slice(0, 200)}——等待窗口后重跑；不自动注册`,
    );
  }
  if (login.status !== 200) {
    const registered = await registerRequest(request);
    if (registered.status === 429) {
      throw new Error(
        `B 用户注册触发 hub 限流（429）：${registered.text.slice(0, 200)}——等待窗口后重跑`,
      );
    }
    if (registered.status !== 204) {
      throw new Error(
        `B 用户不存在且注册失败（HTTP ${registered.status}）：${registered.text.slice(0, 200)}`,
      );
    }
    login = await loginRequest(request, SHARE_USER.email, SHARE_USER.password);
    if (login.status === 429) {
      throw new Error(
        `B 用户注册后登录触发 hub 限流（429）：${login.text.slice(0, 200)}——等待窗口后重跑`,
      );
    }
  }
  if (login.status !== 200 || !login.body.token || login.body.user?.id === undefined) {
    throw new Error(`B 用户登录失败（HTTP ${login.status}）：${login.text.slice(0, 200)}`);
  }

  const session: CachedShareUser = {
    token: login.body.token,
    refreshToken: login.body.refreshToken ?? '',
    expiresAt: login.body.tokenExpires || Date.now() + 15 * 60 * 1000,
    userId: String(login.body.user.id),
    email: login.body.user.email ?? SHARE_USER.email,
  };
  writeCachedShareUser(session);
  return { token: session.token, userId: session.userId, email: session.email };
}

// ---------------------------------------------------------------------------
// iTwin 成员 / iModel 权限（API 侧准备与清理；精确 email/userId 过滤）
// ---------------------------------------------------------------------------

async function listMembers(
  request: APIRequestContext,
  token: string,
  projectId: string,
): Promise<MemberRow[]> {
  const response = await request.get(`/accesscontrol/itwins/${projectId}/members/users?$top=200`, {
    headers: authHeaders(token),
  });
  expect(response.status(), 'iTwin 成员列表查询').toBe(200);
  return ((await response.json()) as { members?: MemberRow[] }).members ?? [];
}

/** 清掉本用例命名空间下的未注册邀请成员（历史残留；不触碰人工成员）。 */
async function removeUnregisteredInviteMembers(
  request: APIRequestContext,
  token: string,
  projectId: string,
): Promise<void> {
  const rows = (await listMembers(request, token, projectId)).filter((m) =>
    m.email.startsWith('e2e-unregistered-share-'),
  );
  for (const row of rows) {
    const response = await request.delete(
      `/accesscontrol/itwins/${projectId}/members/users/${row.id}`,
      { headers: authHeaders(token) },
    );
    expect(response.status(), `移除未注册邀请测试成员 ${row.email}（${row.id}）`).toBe(200);
  }
}

/**
 * 添加 B 为项目成员（默认成员权限：roleIds 为空 = hub DEFAULT_MEMBER_PERMISSIONS，
 * 足以读未 secured 的 iModel），并断言成员 DTO 的 `userId` 是 B 的 users.id。
 */
async function ensureShareMember(
  request: APIRequestContext,
  token: string,
  projectId: string,
  user: ShareUserSession,
): Promise<MemberRow> {
  const validate = (row: MemberRow, label: string): void => {
    expect(row.userId, `${label} userId 必须回填真实 users.id`).toBe(user.userId);
    expect(row.userId, `${label} userId 必须是数字串（不是 email）`).toMatch(/^\d+$/);
    expect(row.userId, `${label} userId 不得是成员行 UUID`).not.toBe(row.id);
  };

  const existing = (await listMembers(request, token, projectId)).filter(
    (m) => m.email === user.email,
  );
  expect(existing.length, '成员列表 B 测试邮箱应至多一行').toBeLessThanOrEqual(1);

  if (existing.length === 1) {
    // 复用（不删再建）：hub 删除成员是软删且 (iTwinId,userId) 唯一约束
    // 不排除软删行——重复「删→加」会 500 duplicate key（P2.6b1 实测）。
    const member = existing[0];
    validate(member, '已存在成员');
    console.log(
      `[A6] member DTO(reuse): id=${member.id} userId=${member.userId} email=${member.email} ` +
        `(users.id=${user.userId}, numeric=${/^\d+$/.test(member.userId ?? '')})`,
    );
    return member;
  }

  const created = await request.post(`/accesscontrol/itwins/${projectId}/members/users`, {
    headers: authHeaders(token),
    data: { email: user.email, roleIds: [] },
  });
  if (created.status() !== 201) {
    throw new Error(
      `添加 B 为 iTwin 成员失败（HTTP ${created.status()}）：${(await created.text()).slice(0, 240)}` +
        '——若为 duplicate key，说明该 users.id 的成员行曾被软删（hub 唯一约束不排除软删）；' +
        '请换确定性 B 账号或人工恢复该行',
    );
  }
  const posted = ((await created.json()) as { members?: MemberRow[] }).members?.[0];
  expect(posted, '添加成员响应应携带 member').toBeTruthy();
  validate(posted as MemberRow, 'POST 响应');

  const listed = (await listMembers(request, token, projectId)).filter(
    (m) => m.email === user.email,
  );
  expect(listed, '成员列表应恰有一行 B（固定测试邮箱）').toHaveLength(1);
  const member = listed[0];
  validate(member, 'GET 列表');
  console.log(
    `[A6] member DTO: id=${member.id} userId=${member.userId} email=${member.email} ` +
      `(users.id=${user.userId}, numeric=${/^\d+$/.test(member.userId ?? '')})`,
  );
  return member;
}

async function listPermissionRows(
  request: APIRequestContext,
  token: string,
): Promise<ImodelPermissionRow[]> {
  const response = await request.get(`/imodels/${imodelId}/permissions/users?limit=200&page=1`, {
    headers: authHeaders(token),
  });
  if (!response.ok()) return [];
  return ((await response.json()) as { data?: ImodelPermissionRow[] }).data ?? [];
}

/**
 * 复位分享状态（每例前后 + afterAll）：只撤销/移除本用例测试邮箱相关的授权与
 * 未注册邀请成员，并把 B 种子 iModel 恢复为项目级访问；人工权限/成员零接触。
 * 确定性 B 成员保留（成员=项目级 seed；hub 软删+唯一约束使「删→加」不可重复，
 * 见 ensureShareMember 注），每例只用创建者 A 撤销其 iModel 授权。
 */
async function cleanupShareState(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  // beforeAll 失败时 afterAll 仍会执行：无种子 id 则无可清理对象。
  if (!itwinId || !imodelId) return;
  const headers = authHeaders(token);

  for (const row of await listPermissionRows(request, token)) {
    const isOurs =
      row.userId === bUser?.userId ||
      row.userId === SHARE_USER.email ||
      row.userId === UNREGISTERED_EMAIL;
    if (!isOurs) continue;
    const revoked = await request.delete(
      `/imodels/${imodelId}/permissions/users/${encodeURIComponent(row.userId)}`,
      { headers },
    );
    expect([204, 404], `撤销测试授权 userId=${row.userId}`).toContain(revoked.status());
  }

  const detail = await request.get(`/imodels/${imodelId}`, { headers });
  if (detail.ok()) {
    const body = (await detail.json()) as { iModel?: { isSecured?: boolean } };
    if (body.iModel?.isSecured) {
      const restored = await request.patch(`/imodels/${imodelId}`, {
        headers,
        data: { isSecured: false },
      });
      expect(restored.status(), '清理：恢复项目级访问').toBe(200);
    }
  }

  await removeUnregisteredInviteMembers(request, token, itwinId);
}

/** B 独立 token 读两条路由（详情 + changesets 内容维）并按 A6 期望断言状态。 */
async function expectBRead(
  request: APIRequestContext,
  expected: 200 | 403,
): Promise<void> {
  const headers = authHeaders(bUser.token);
  const imodel = await request.get(`/imodels/${imodelId}`, { headers });
  expect(imodel.status(), `B GET /imodels/:id 期望 ${expected}`).toBe(expected);
  if (expected === 200) {
    const body = (await imodel.json()) as { iModel?: { id?: string } };
    expect(body.iModel?.id).toBe(imodelId);
  }
  const changesets = await request.get(`/imodels/${imodelId}/changesets?$top=1`, { headers });
  expect(changesets.status(), `B GET /imodels/:id/changesets 期望 ${expected}`).toBe(expected);
  if (expected === 200) {
    const body = (await changesets.json()) as { changesets?: unknown[] };
    expect(Array.isArray(body.changesets)).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

/** 直接 URL 进入 B 项目详情页 → 卡片菜单「分享」→ 打开 B 文档权限对话框。 */
async function openShareDialog(page: Page): Promise<Locator> {
  await expect(page).toHaveURL(new RegExp(`/documents/${itwinId}`));
  // canManageITwin 落定锚点（hero 新建入口与卡片分享/删除同门）——避免权限
  // 未加载时菜单缺「分享」项。
  await expect(page.getByRole('button', { name: '新建 iModel' }).first()).toBeVisible({
    timeout: 30_000,
  });
  const card = page.locator('.imodel-card', { hasText: B_SEED_IMODEL_NAME });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '分享', exact: true }).click();
  const dialog = page.locator('.share-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

function isPatchRequest(request: { method(): string; url(): string }): boolean {
  return request.method() === 'PATCH' && request.url().includes(`/imodels/${imodelId}`);
}

function isPatchResponse(response: { request(): { method(): string }; url(): string }): boolean {
  return response.request().method() === 'PATCH' && response.url().includes(`/imodels/${imodelId}`);
}

test.describe('A6 分享运行时门禁（两真实用户）', () => {
  test.beforeAll(async ({ request }) => {
    test.setTimeout(180_000);
    const token = await getApiToken();
    ({ itwinId, imodelId } = await resolveSeedImodelIds('B'));
    bUser = await getShareUserSession(request);
    const member = await ensureShareMember(request, token, itwinId, bUser);
    bMemberRowId = member.id;
  });

  test.beforeEach(async ({ page, request }) => {
    // 未注册邀请每例唯一（软删唯一约束，见文件头注）。
    UNREGISTERED_EMAIL = `e2e-unregistered-share-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}@example.com`;
    // 上轮残留（失败现场）先复位，再进入 UI；人工数据不受影响。
    await cleanupShareState(request, await getApiToken());
    consoleErrors = collectConsoleErrors(page);
    await loginWithSession(page);
    await gotoRoute(page, `/documents/${itwinId}`, 'document-details-route');
    await expect(page.getByRole('heading', { name: 'E2E B 项目' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test.afterEach(async ({ request }) => {
    await cleanupShareState(request, await getApiToken());
  });

  test.afterAll(async ({ request }) => {
    try {
      await cleanupShareState(request, await getApiToken());
    } catch (error) {
      console.warn(`[A6] afterAll 清理未完成（不影响用例结论，需人工核对）：${String(error)}`);
    }
  });

  test('限制访问 → 授权 B 只读 → B 200 → 撤销 403 → 恢复项目级 200', async ({ page, request }) => {
    test.setTimeout(180_000);
    const dialog = await openShareDialog(page);

    // 初始：项目级访问（未 secured）；成员默认权限可读。
    await expect(dialog.getByText('当前由项目角色控制')).toBeVisible({ timeout: 20_000 });
    await expectBRead(request, 200);

    // 1) 限制访问（HITL）→ PATCH {isSecured:true}
    await dialog.getByRole('button', { name: '限制访问', exact: true }).click();
    const restrictHitl = page.locator('.share-remove-dialog');
    await expect(restrictHitl.getByText('限制文档访问').first()).toBeVisible();
    const [restrictReq, restrictRes] = await Promise.all([
      page.waitForRequest(isPatchRequest),
      page.waitForResponse(isPatchResponse),
      restrictHitl.getByRole('button', { name: '启用访问控制', exact: true }).click(),
    ]);
    expect(restrictReq.postDataJSON()).toEqual({ isSecured: true });
    expect(restrictRes.status()).toBe(200);
    await expect(dialog.getByText('文档访问控制已更新')).toBeVisible();
    await expect(dialog.getByText(/此文档已启用访问控制/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: '恢复项目级访问', exact: true })).toBeVisible();

    // 未授权：B 失去两条路由。
    await expectBRead(request, 403);

    // 2) 授权 B 只读：UI 选择项目成员 → grant；请求体必须是 users.id 数字串。
    await dialog.getByRole('tab', { name: /^邀请成员/ }).click();
    // iTwinUI Select 的 aria-label 落在包裹层 div 上，真正的原生 <select>
    // 在其内部——必须下钻到 select 才能 selectOption（P2.6b1 实测）。
    await dialog
      .getByLabel('选择项目成员')
      .locator('select')
      .selectOption({ label: SHARE_USER.email });
    const grantRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/permissions/grant'),
    );
    const grantResponse = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('/permissions/grant'),
    );
    await dialog.getByRole('button', { name: '授权', exact: true }).click();
    const grantReq = await grantRequest;
    const grantRes = await grantResponse;
    const grantBody = grantReq.postDataJSON() as Record<string, unknown>;
    expect(grantRes.status()).toBe(201);
    expect(grantBody.userId).toBe(bUser.userId);
    expect(String(grantBody.userId)).toMatch(/^\d+$/);
    expect(grantBody.userId).not.toBe(bMemberRowId);
    expect(String(grantBody.userId)).not.toContain('@');
    expect(grantBody).toMatchObject({
      role: 'user',
      briefcasesLevel: 'read',
      changesetsLevel: 'read',
      versionsLevel: 'read',
      locksLevel: 'read',
    });
    // 成功状态条渲染在「成员」面板（邀请面板只显示邀请错误）——切回成员页
    // 同时验证授权行（身份显示 email，等级只读）。
    await dialog.getByRole('tab', { name: /^成员/ }).click();
    await expect(dialog.getByText('已授权', { exact: true })).toBeVisible();
    const permissionRow = dialog.locator('.share-member', { hasText: SHARE_USER.email });
    await expect(permissionRow).toBeVisible();
    await expect(permissionRow.getByText('只读')).toBeVisible();

    // B 恢复读取（详情 + changesets 内容维）。
    await expectBRead(request, 200);

    // 3) UI 撤销 → DELETE users/:userId（= B users.id）→ B 403
    const revokeRequest = page.waitForRequest(
      (req) => req.method() === 'DELETE' && req.url().includes('/permissions/users/'),
    );
    const revokeResponse = page.waitForResponse(
      (res) => res.request().method() === 'DELETE' && res.url().includes('/permissions/users/'),
    );
    await permissionRow.getByRole('button', { name: '撤销授权' }).click();
    const revokeHitl = page.locator('.share-remove-dialog');
    await expect(revokeHitl.getByText('撤销文档授权').first()).toBeVisible();
    await revokeHitl.getByRole('button', { name: '撤销', exact: true }).click();
    const revokeReq = await revokeRequest;
    const revokeRes = await revokeResponse;
    expect(revokeReq.url()).toContain(`/permissions/users/${bUser.userId}`);
    expect(revokeRes.status()).toBe(204);
    await expect(dialog.getByText('已撤销授权', { exact: true })).toBeVisible();
    await expect(permissionRow).toHaveCount(0);
    await expectBRead(request, 403);

    // 4) UI 恢复项目级访问 → PATCH {isSecured:false} → B 200
    const restoreRequest = page.waitForRequest(isPatchRequest);
    const restoreResponse = page.waitForResponse(isPatchResponse);
    await dialog.getByRole('button', { name: '恢复项目级访问', exact: true }).click();
    const restoreHitl = page.locator('.share-remove-dialog');
    await expect(restoreHitl.getByText('恢复项目级访问').first()).toBeVisible();
    await restoreHitl.getByRole('button', { name: '恢复项目级访问', exact: true }).click();
    const restoreReq = await restoreRequest;
    const restoreRes = await restoreResponse;
    expect(restoreReq.postDataJSON()).toEqual({ isSecured: false });
    expect(restoreRes.status()).toBe(200);
    await expect(dialog.getByText('当前由项目角色控制')).toBeVisible();
    await expectBRead(request, 200);

    expect(consoleErrors, '分享运行链不应产生浏览器 console/page 错误').toEqual([]);
  });

  test('未注册邮箱邀请：只加项目成员，不创建 iModel 授权（UI 如实提示）', async ({ page, request }) => {
    test.setTimeout(180_000);
    const token = await getApiToken();

    // 邀请授权入口仅在 secured 时开放（A6 语义的前置状态；UI 的限制访问已在
    // 上一用例覆盖，这里用 API 置位以聚焦「未注册邀请」分支）。
    const restricted = await request.patch(`/imodels/${imodelId}`, {
      headers: authHeaders(token),
      data: { isSecured: true },
    });
    expect(restricted.status()).toBe(200);

    const dialog = await openShareDialog(page);
    await expect(dialog.getByText(/此文档已启用访问控制/)).toBeVisible({ timeout: 20_000 });

    await dialog.getByRole('tab', { name: /^邀请成员/ }).click();

    // 监听浏览器侧 grant 请求：未注册邀请绝不能发出。
    const grantBodies: string[] = [];
    const onRequest = (req: { method(): string; url(): string; postData(): string | null }): void => {
      if (req.method() === 'POST' && req.url().includes('/permissions/grant')) {
        grantBodies.push(req.postData() ?? '');
      }
    };
    page.on('request', onRequest);

    await dialog.getByLabel('邮箱地址').fill(UNREGISTERED_EMAIL);
    const inviteRequest = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().includes('/members/users'),
    );
    const inviteResponse = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('/members/users'),
    );
    await dialog.getByRole('button', { name: '添加并授权', exact: true }).click();
    const inviteReq = await inviteRequest;
    const inviteRes = await inviteResponse;
    page.off('request', onRequest);

    expect(inviteReq.postDataJSON()).toEqual({ email: UNREGISTERED_EMAIL, roleIds: [] });
    expect(inviteRes.status()).toBe(201);
    await expect(
      dialog.getByText(
        `已加入项目成员，但该邮箱尚未注册，无法授予文档权限：${UNREGISTERED_EMAIL}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(grantBodies, '未注册邀请不得发出任何 iModel grant 请求').toEqual([]);

    // API 复核：成员在（userId 保留 email 回退、行 id 是 UUID），授权行不存在。
    const member = (await listMembers(request, token, itwinId)).find(
      (row) => row.email === UNREGISTERED_EMAIL,
    );
    expect(member, '未注册邮箱应已加入项目成员').toBeTruthy();
    expect(member?.userId).toBe(UNREGISTERED_EMAIL);
    expect(member?.id).not.toBe(member?.userId);
    const permissions = await listPermissionRows(request, token);
    expect(
      permissions.some((row) => row.userId === UNREGISTERED_EMAIL),
      '未注册邮箱不得创建 iModel 授权行',
    ).toBe(false);

    // UI 诚实：成员页仍无授权用户（不显示虚假成功）。
    await dialog.getByRole('tab', { name: /^成员/ }).click();
    await expect(dialog.getByText('暂无授权用户')).toBeVisible();

    expect(consoleErrors, '邀请链路不应产生浏览器 console/page 错误').toEqual([]);
  });
});
