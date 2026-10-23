/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * e2e 共通 helper（web-next 版，形态对齐 apps/web/e2e/helpers.ts 的
 * 会话注入纪律）：
 * - 常规 spec 标准登录 = loginWithSession（auth.setup 产物注入 sessionStorage
 *   `luban-next-auth`，零登录请求零限流消耗；AuthSession.getStoredAuth 直读
 *   该键，RequireAuth 门即放行）；表单实时登录仅 login.spec 保留一轮。
 * - 导航/编辑器就绪/种子数据定位集中于此，spec 不内嵌选择器细节。
 * - 自建数据走 API（/itwins、/imodels，同源 :5310 代理到 hub :5400），
 *   用例自建自清，不依赖手工种子。
 */

import { dirname } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { E2E_IMODEL_NAME, SEED_PROJECT_NAME, TEST_USER } from './fixtures';

/** auth.setup 产物（setup 与消费方的唯一交接面）。 */
export const SESSION_FILE = 'playwright/.auth/session.json';
/** web-next 会话键（AuthSession.SESSION_KEY 同名）。 */
export const AUTH_STORAGE_KEY = 'luban-next-auth';

/** sessionStorage `luban-next-auth` 的存储形状（src/clients/auth/AuthSession.ts）。 */
export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string; name: string; avatar?: string };
}

// ============================================================================
// 会话注入
// ============================================================================

/** API 登录（经 baseURL 同源代理 → hub :5400；零 UI 表单零限流额度消耗）。
 * 端点/响应形状取证 AuthSession.login（token/refreshToken/tokenExpires/user）。
 * name 形状对齐 AuthSession.convertUser（D-T6-8）：hub 实为 firstName/lastName
 *（name 缺席），按「name → firstName+lastName 拼装 → email → Unknown」取——
 * 此前 `name ?? email` 直落 email，设置页钉版基线随之改名（重钉见
 * readonly-gate-report）。 */
export async function apiLogin(request: APIRequestContext): Promise<StoredAuth> {
  const response = await request.post('/auth/email/login', {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  if (!response.ok()) {
    throw new Error(`API 登录失败：HTTP ${response.status()}（检查 hub :5400 与种子账号）`);
  }
  const data = (await response.json()) as {
    token: string;
    refreshToken: string;
    tokenExpires?: number;
    user: {
      id: string | number;
      email: string | null;
      name?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    };
  };
  return {
    accessToken: data.token,
    refreshToken: data.refreshToken,
    expiresAt: data.tokenExpires || Date.now() + 15 * 60 * 1000,
    user: {
      id: String(data.user.id),
      email: data.user.email ?? '',
      // 与 AuthSession.convertUser 逐语义对齐（|| 链：空串/缺席即落下一级，
      // `??` 会让空拼装名钉死空串）。
      name: data.user.name?.trim()
        || [data.user.firstName, data.user.lastName]
          .filter((part): part is string => Boolean(part))
          .join(' ')
          .trim()
        || data.user.email
        || 'Unknown',
    },
  };
}

/** 会话缓存校验：GET /auth/me（不具名限流端点）200 即产物仍可用。 */
export async function apiMeOk(request: APIRequestContext, accessToken: string): Promise<boolean> {
  const response = await request.get('/auth/me', { headers: authHeaders(accessToken) });
  return response.ok();
}

/** 刷新会话（POST /auth/refresh，Bearer 装 refreshToken——后端 jwt-refresh
 * 守卫契约，头缺失恒 401；响应无 user 段，沿用缓存 user）。端点无限流，
 * 是登录限流（5/15min IP+email 桶）下套件常态续命的唯一通道。 */
export async function apiRefresh(
  request: APIRequestContext,
  cached: StoredAuth,
): Promise<StoredAuth> {
  const response = await request.post('/auth/refresh', {
    headers: { Authorization: `Bearer ${cached.refreshToken}`, 'Content-Type': 'application/json' },
    data: { refreshToken: cached.refreshToken },
  });
  if (!response.ok()) throw new Error(`会话刷新失败：HTTP ${response.status()}`);
  const data = (await response.json()) as { token: string; refreshToken: string; tokenExpires?: number };
  return {
    accessToken: data.token,
    refreshToken: data.refreshToken,
    expiresAt: data.tokenExpires || Date.now() + 15 * 60 * 1000,
    user: cached.user,
  };
}

/** 读会话产物（setup 复用判定用；缺失/损坏返回 null）。 */
export function readSessionFile(): StoredAuth | null {
  try {
    const payload = JSON.parse(readFileSync(SESSION_FILE, 'utf-8')) as Record<string, string>;
    return JSON.parse(payload[AUTH_STORAGE_KEY]) as StoredAuth;
  } catch {
    return null;
  }
}

/** spec 侧取产物 access token（API 自建/清理通道鉴权；setup 先行为前提）。
 * 优先进程内共享会话（单飞刷新后的最新值），回落产物文件。 */
export function readAccessToken(): string {
  return (sharedSession ?? readSessionFile())?.accessToken ?? '';
}

// ============================================================================
// 共享会话单飞（refresh 竞态防线）
// ============================================================================

/** hub 直连（vite 代理同目标；Node 侧取 token 不走浏览器）。 */
const HUB_BASE = 'http://localhost:5400';
/** 提前刷新余量：token 将过期前 2 分钟即换新（套件尾段用例不吃过期边界）。 */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

let sharedSession: StoredAuth | null = null;
let sharedSessionPromise: Promise<StoredAuth> | null = null;

/**
 * 进程级共享会话（单飞）：所有 spec 注入同一份 token；将过期时**在 Node 侧
 * 统一刷新一次**并回写产物文件。
 *
 * 为何必须单飞：hub 的 refreshToken **旋转制**（auth.service.refreshToken 每次
 * regenerate session hash 并落库）——浏览器多 context 各自持同一份旧 refreshToken
 * 去 /auth/refresh，第一个成功者旋转 hash，其余全部 401 → AuthSession.clearAuth
 * → RequireAuth 打回 /login（套件性团灭）。故 loginWithSession 同时挂
 * /auth/refresh 路由拦截，浏览器侧刷新统一 fulfill 为单飞新 token：
 * 应用代码照常走 AuthSession.doRefresh 解析落 sessionStorage，零产品改动。
 */
async function getSharedSession(): Promise<StoredAuth> {
  if (sharedSession && sharedSession.expiresAt >= Date.now() + REFRESH_MARGIN_MS) {
    return sharedSession;
  }
  sharedSessionPromise ??= (async (): Promise<StoredAuth> => {
    const current = sharedSession ?? readSessionFile();
    if (!current) throw new Error('共享会话缺失（auth.setup 未运行？）');
    if (current.expiresAt >= Date.now() + REFRESH_MARGIN_MS) return current;
    const response = await fetch(`${HUB_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${current.refreshToken}`,
      },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!response.ok) {
      throw new Error(
        `共享会话刷新失败：HTTP ${response.status()}（refreshToken 已被其他进程旋转？重跑 setup project）`,
      );
    }
    const data = (await response.json()) as { token: string; refreshToken: string; tokenExpires?: number };
    const fresh: StoredAuth = {
      accessToken: data.token,
      refreshToken: data.refreshToken,
      expiresAt: data.tokenExpires || Date.now() + 15 * 60 * 1000,
      user: current.user,
    };
    sharedSession = fresh;
    mkdirSync(dirname(SESSION_FILE), { recursive: true });
    writeFileSync(
      SESSION_FILE,
      JSON.stringify({ [AUTH_STORAGE_KEY]: JSON.stringify(fresh) }),
      'utf-8',
    );
    return fresh;
  })().finally(() => {
    sharedSessionPromise = null;
  });
  return sharedSessionPromise;
}

/** 会话注入登录：addInitScript 预写 sessionStorage（进程级共享单飞 token）+
 * /auth/refresh 路由拦截（浏览器侧刷新统一 fulfill 单飞新 token——旋转竞态
 * 防线，见 getSharedSession 注注）。 */
export async function loginWithSession(page: Page): Promise<void> {
  const session = await getSharedSession();
  await page.addInitScript(
    ([key, value]) => {
      sessionStorage.setItem(key, value);
    },
    [AUTH_STORAGE_KEY, JSON.stringify(session)],
  );
  await page.route('**/auth/refresh', async (route) => {
    const fresh = await getSharedSession();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: fresh.accessToken,
        refreshToken: fresh.refreshToken,
        tokenExpires: fresh.expiresAt,
      }),
    });
  });
}

/** 导航 + 渲染锚点等待（带一次 reload 重试）。
 *
 * 为何需要：vite dev 态偶发整页空白（T9 自首#9 同族——模块取回 HTML/
 * 依赖重优化触发 reload 的竞态，dev-only 观察），首轮渲染锚点等不到时
 * reload 一次即愈；持续空白则二次等待超时如实红。 */
export async function gotoRoute(page: Page, url: string, anchorTestId: string): Promise<void> {
  await page.goto(url);
  try {
    await expect(page.getByTestId(anchorTestId)).toBeVisible({ timeout: 15_000 });
  } catch {
    await page.reload();
    await expect(page.getByTestId(anchorTestId)).toBeVisible({ timeout: 20_000 });
  }
}

/** 注入 + 进文档中心（默认我的文档档；需要其他档位时传 filter）。 */
export async function gotoDocuments(page: Page, filter?: string): Promise<void> {
  await loginWithSession(page);
  await gotoRoute(page, filter ? `/documents?filter=${filter}` : '/documents', 'documents-route');
}

// ============================================================================
// 导航：文档中心 → 编辑器
// ============================================================================

/** 经 UI 路径进入种子库编辑器：项目卡 → iModel 卡「打开工作空间」→ 等就绪。 */
export async function openSeedImodelEditor(page: Page): Promise<void> {
  await gotoDocuments(page, 'my');
  // 项目卡：Tile 内嵌以项目名命名的 button（无 a[href]，旧应用同构）
  const projectTile = page.getByRole('button', { name: SEED_PROJECT_NAME }).first();
  await expect(projectTile).toBeVisible({ timeout: 20_000 });
  await projectTile.click();
  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 20_000 });

  // iModel 卡按名锁定（「测试项目」内还有人工调试库，禁 .first() 取位）
  const seedCard = page.locator('.imodel-card', { hasText: E2E_IMODEL_NAME });
  await expect(seedCard).toBeVisible({ timeout: 20_000 });
  await seedCard.getByRole('button', { name: '打开工作空间' }).click();
  await page.waitForURL(/\/documents\/[^/]+\/[^/]+$/, { timeout: 30_000 });
}

/** 编辑器就绪双门：状态栏「已连接」（briefcase 打开 + IPC host ready 相位合流）
 * + 视口挂载点内 canvas 真实创建（M4-T9 教训：相位 ready ≠ ScreenViewport 已建，
 * 必须等 canvas 在场，防早测假象）。
 *
 * 连接等待为显式轮询：连接中/正在打开文档…为正常过渡态；「连接失败」按应用
 * 自面的恢复路径（关闭页签重开 ≡ reload）给至多两次重开机会——M4-T9 观察#8 的
 * 启动竞态（页面坍缩仅剩错误文本，dev StrictMode 双启噪音）实测偶发，重开即愈；
 * 真实打不开则预算耗尽如实红。 */
export async function waitEditorReady(page: Page): Promise<void> {
  await expect(page.getByTestId('part-studio-page')).toBeVisible({ timeout: 30_000 });
  const status = page.getByTestId('part-studio-status-connection');
  const deadline = Date.now() + 90_000;
  let reloads = 0;
  for (;;) {
    const text = (await status.textContent()) ?? '';
    if (text === '已连接') break;
    // 失败即重开（应用自面恢复路径），至多两次：一次重载可能再入启动竞态
    // （前一 context 的 MS 侧 db 释放/StrictMode 双启噪音），留二次机会；
    // 重载前小驻留，让上一连接的释放先落地。
    if (text === '连接失败' && reloads < 2) {
      reloads += 1;
      await page.waitForTimeout(3000);
      await page.reload();
      await expect(page.getByTestId('part-studio-page')).toBeVisible({ timeout: 30_000 });
    }
    if (Date.now() > deadline) {
      throw new Error(`编辑器连接未就绪（最后状态=${text}；重开已用=${reloads}）`);
    }
    await page.waitForTimeout(500);
  }
  await expect(
    page.getByTestId('part-studio-viewport').locator('canvas').first(),
  ).toBeVisible({ timeout: 90_000 });
}

// ============================================================================
// 自建数据（自建自清）
// ============================================================================

/** 按名定位文档（hub iTwin），返回 id；缺失返回 null。 */
export async function apiFindDocumentByName(
  request: APIRequestContext,
  name: string,
  accessToken: string,
): Promise<{ id: string } | null> {
  const response = await request.get('/itwins?class=Project&$top=100', {
    headers: authHeaders(accessToken),
  });
  if (!response.ok()) throw new Error(`文档列表查询失败：HTTP ${response.status()}`);
  const { iTwins } = (await response.json()) as { iTwins?: Array<{ id: string; displayName?: string }> };
  const hit = iTwins?.find((itwin) => itwin.displayName === name);
  return hit ? { id: hit.id } : null;
}

/** 删除文档（级联删其下 iModel——hub 同款语义）；自清专用。 */
export async function apiDeleteDocument(
  request: APIRequestContext,
  id: string,
  accessToken: string,
): Promise<void> {
  const response = await request.delete(`/itwins/${id}`, { headers: authHeaders(accessToken) });
  if (!response.ok() && response.status() !== 204) {
    throw new Error(`文档清理失败（${id}）：HTTP ${response.status()}`);
  }
}

/** hub REST 鉴权头（API 自建/清理通道专用；页面内请求由官方 SDK 自带头负责）。 */
export function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

// ============================================================================
// 键盘走焦（keyboard.spec 专用）
// ============================================================================

/** 反复 Tab 直至目标元素成为 document.activeElement（断言焦点路径的走焦助手）。
 * 上限 40 步防死循环；超限抛错（焦点序回归即红）。 */
export async function focusViaTab(page: Page, target: Locator): Promise<void> {
  const handle = await target.elementHandle();
  if (!handle) throw new Error('focusViaTab：目标元素不存在');
  try {
    for (let step = 0; step < 40; step++) {
      const isTarget = await page.evaluate(
        (el) => document.activeElement === el,
        handle,
      );
      if (isTarget) return;
      await page.keyboard.press('Tab');
    }
    throw new Error('focusViaTab：40 步 Tab 内未走到目标（焦点序回归）');
  } finally {
    await handle.dispose();
  }
}

/** 读 document.activeElement 的可观测面（标签名 + 可访问文本），断言焦点路径用。 */
export async function readActiveElement(page: Page): Promise<{ tag: string; text: string }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      tag: el?.tagName ?? '',
      text: (el?.getAttribute('aria-label') ?? el?.textContent ?? '').trim(),
    };
  });
}
