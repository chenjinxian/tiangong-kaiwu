/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * e2e 共通 helper（web 版，形态对齐旧应用（已删除）的 e2e/helpers.ts 的
 * 会话注入纪律）：
 * - 常规 spec 标准登录 = loginWithSession（auth.setup 产物注入 sessionStorage
 *   `luban-next-auth`，零登录请求零限流消耗；AuthSession.getStoredAuth 直读
 *   该键，RequireAuth 门即放行）；表单实时登录仅 login.spec 保留一轮。
 * - 导航/编辑器就绪/种子数据定位集中于此，spec 不内嵌选择器细节。
 * - 自建数据走 API（/itwins、/imodels，同源 :5300 代理到 hub :5400），
 *   用例自建自清，不依赖手工种子。
 */

import { dirname } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import type {
  BodyInfo,
  FeatureOp,
  FeatureOpResult,
  FeatureTreeEntry,
  SketchDto,
} from '@luban-cad/shared';
import {
  B_SEED_IMODEL_NAME,
  B_SEED_PROJECT_NAME,
  E2E_IMODEL_NAME,
  SEED_PROJECT_NAME,
  TEST_USER,
} from './fixtures';

/** auth.setup 产物（setup 与消费方的唯一交接面）。 */
export const SESSION_FILE = 'playwright/.auth/session.json';
/** web 会话键（AuthSession.SESSION_KEY 同名）。 */
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
 * 优先进程内共享会话（单飞刷新后的最新值），回落产物文件。
 * @deprecated 同步读不触发续命：长套件（>15min token TTL）后段会拿到过期 token。
 *   新代码用 `getApiToken()`；既有同步调用点按批迁移（M5-T4 复跑实测半程团灭）。 */
export function readAccessToken(): string {
  return (sharedSession ?? readSessionFile())?.accessToken ?? '';
}

/** 取可用于 API 调用的 access token（将过期则在 Node 侧单飞刷新并回写产物）。
 * 所有 beforeAll/beforeEach 里的 API 自建/清理/种子重置必须先走这里——否则
 * 套件跑到后段（token TTL 15min）时 readAccessToken() 给出过期 token，API 401
 * 表现为用例在准备阶段秒挂。 */
export async function getApiToken(): Promise<string> {
  return (await getSharedSession()).accessToken;
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
      // 注意：Node 原生 fetch 的 Response 是属性（ok: boolean / status: number），
      // 不是 Playwright APIResponse 的方法。M5-T4 全量复跑实测：写成 status()
      // 会在 token 将过期触发的刷新路径上抛 TypeError，随后每个用例在会话注入
      // 阶段秒挂（表现为半程团灭，非产品缺陷）。
      throw new Error(
        `共享会话刷新失败：HTTP ${response.status}（refreshToken 已被其他进程旋转？重跑 setup project）`,
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
// console 门禁采集（M5-T4 全量复跑实证）
// ============================================================================

/** 外部字体 CDN：无代理环境下偶发 ERR_CONNECTION_TIMED_OUT（fonts.gstatic.com
 * 实测 trace 定位）。字体加载失败由系统回退字体兜底，不属应用 console 错误——
 * 门禁仍对应用自身错误零容忍，只豁免这类「资源加载失败 + 外部字体域」条目。 */
const EXTERNAL_FONT_HOSTS = ['fonts.gstatic.com', 'fonts.googleapis.com'];

/** Azurite tile 云缓存未命中：SDK 先 GET blob（404）再回退 native tile 生成——
 * 浏览器把该 404 记为 Failed to load resource，属预期缓存 miss（非应用错误，
 * 几何仍由回退路径正常生成）。只豁免 `/azurite/devstoreaccount1/<id>/tiles/`
 * 路径的 404；其它资源/应用错误仍零容忍。 */
const TILE_CACHE_404_PATH = /\/azurite\/devstoreaccount1\/[^/]+\/tiles\//;

/** 挂 console/pageerror 采集器并返回错误数组（spec 尾部断言长度 0）。 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const url = message.location()?.url ?? '';
    if (message.text().startsWith('Failed to load resource')) {
      if (EXTERNAL_FONT_HOSTS.some((host) => url.includes(host))) return;
      if (message.text().includes('404') && TILE_CACHE_404_PATH.test(url)) return;
    }
    errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

// ============================================================================
// 导航：种子编辑器（B-model / A legacy）
// ============================================================================

/** 种子项目 + 其下种子 iModel 的 id。 */
export interface SeedImodelIds {
  itwinId: string;
  imodelId: string;
}

/**
 * B 编辑器上下文：iModel + 活动 Part Studio scope + MS briefcase key。
 * `scopeId` = 解析器落位的 `?model=`（默认 Part Studio 由首开编辑器创建）；
 * 直连 RPC 规格必须把它作为 applyFeatureOp/getFeatureTree/getBodies/getSketch
 * 的末参，**禁止**回落 legacy（无 scope）读写。
 */
export interface BSeedEditorContext extends SeedImodelIds {
  scopeId: string;
  /** MS 侧打开登记键（RPC 首参）——取自已打开 briefcase 的 connection.key，
   *  取不到时回退同式路径（见 `briefcaseDbKey`）。 */
  dbKey: string;
}

/** A 旧文档编辑器上下文（只读；无 registry/scope）。 */
export interface LegacySeedEditorContext extends SeedImodelIds {
  kind: 'A';
}

/** MS dbKey 同式回退（useBriefcaseConnection 的 key = downloadBriefcase.fileName）。 */
export function briefcaseDbKey(imodelId: string): string {
  return ['briefcase-cache', 'imodels', imodelId, 'briefcases', '2.bim'].join('\\');
}

async function hubGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${HUB_BASE}${path}`, { headers: authHeaders(accessToken) });
  if (!response.ok) throw new Error(`hub ${path} 查询失败：HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * 按名唯一匹配（种子安全策略，P2.6a review L3/L7）：同名 0 项返回 undefined，
 * 1 项返回该项，**≥2 项抛错**——绝不在重复名之间任取第一个（reset 与 open 若
 * 各自随机命中不同行，会造成「重置了一个库、测试打开另一个库」的假绿）。
 */
export function uniqueMatch<T>(
  rows: readonly T[],
  nameOf: (row: T) => string | undefined,
  target: string,
  label: string,
): T | undefined {
  const hits = rows.filter((row) => nameOf(row) === target);
  if (hits.length > 1) {
    const ids = hits
      .map((row) => (row as { id?: string }).id ?? '<no-id>')
      .join(', ');
    throw new Error(
      `${label}「${target}」存在 ${hits.length} 个同名项（${ids}）——种子名必须唯一；` +
        '请人工清理重复项后重跑（不自动择一，防 reset/open 指向不同行）',
    );
  }
  return hits[0];
}

/** 种子列表统一分页上限（hub clampTop max=200；所有种子查询/重置同口径）。 */
export const SEED_PAGE_SIZE = 200;

/** 按名解析种子项目/库 id（不建数、不重置；auth.setup 保证在场）。 */
export async function resolveSeedImodelIds(kind: 'A' | 'B'): Promise<SeedImodelIds> {
  const accessToken = await getApiToken();
  const projectName = kind === 'B' ? B_SEED_PROJECT_NAME : SEED_PROJECT_NAME;
  const imodelName = kind === 'B' ? B_SEED_IMODEL_NAME : E2E_IMODEL_NAME;
  const projects = await hubGet<{ iTwins?: Array<{ id: string; displayName?: string }> }>(
    `/itwins?subClass=Project&$top=${SEED_PAGE_SIZE}`,
    accessToken,
  );
  const project = uniqueMatch(
    projects.iTwins ?? [],
    (itwin) => itwin.displayName,
    projectName,
    '种子项目',
  );
  if (!project) throw new Error(`种子项目 ${projectName} 不在场（auth.setup 自愈失败？）`);
  const list = await hubGet<{
    iModels?: Array<{ id: string; displayName?: string; name?: string }>;
  }>(`/imodels?iTwinId=${project.id}&$top=${SEED_PAGE_SIZE}`, accessToken);
  const imodel = uniqueMatch(
    list.iModels ?? [],
    (candidate) => candidate.displayName ?? candidate.name,
    imodelName,
    '种子库',
  );
  if (!imodel) throw new Error(`种子库 ${imodelName} 不在场（auth.setup 自愈失败？）`);
  return { itwinId: project.id, imodelId: imodel.id };
}

/** 读 URL 的活动 scope（全局唯一事实源；`?model=` 由解析器/页签生产者写）。 */
export function readModelScopeId(page: Page): string | null {
  return new URL(page.url()).searchParams.get('model');
}

/** 已打开 briefcase 的可观测身份（P2.6b2：连接键稳定性 + 只读/可写连接门）。 */
export interface OpenBriefcaseInfo {
  /** `IModelConnection.key` ≡ MS 侧 dbKey（downloadBriefcase.fileName）。 */
  key: string | null;
  /** 连接打开模式是否只读（A legacy=true；B 可写=false）。 */
  isReadonly: boolean | null;
}

/** 读已打开 briefcase 的 connection.key + 只读位；失败返回 null 字段。 */
export async function readOpenBriefcaseInfo(page: Page): Promise<OpenBriefcaseInfo> {
  // P2.8：e2e 观测面替代 dev-only /@id/；未以 VITE_E2E_HOOKS=true 构建/启动时
  // 快速失败（不要吞成 null——那会把载体配置错误伪装成产品失败）。
  const hookAvailable = await page
    .evaluate(() => Boolean((window as any).__lubanE2E))
    .catch(() => false);
  if (!hookAvailable) {
    throw new Error(
      'E2E hook 不可用：请以 VITE_E2E_HOOKS=true 运行（源码 e2e 由 playwright.config webServer.env 注入；' +
        '发布镜像用 rebuild-web.ps1 -BModelEnabled true -E2EHooks true 构建）',
    );
  }
  try {
    return await page.evaluate(async () => {
      const cf = ((window as any).__lubanE2E?.coreFrontend) as {
        IModelApp: {
          viewManager: {
            getFirstOpenView(): {
              iModel: { key?: string; isReadonly?: boolean };
            } | undefined;
          };
        };
      };
      const iModel = cf.IModelApp.viewManager.getFirstOpenView()?.iModel;
      return {
        key: iModel?.key ?? null,
        isReadonly: typeof iModel?.isReadonly === 'boolean' ? iModel.isReadonly : null,
      };
    });
  } catch {
    return { key: null, isReadonly: null };
  }
}

/** 读已打开 briefcase 的 connection.key（≡ MS 侧 dbKey）；失败返回 null。 */
async function readBriefcaseKey(page: Page): Promise<string | null> {
  return (await readOpenBriefcaseInfo(page)).key;
}

/** scope 横幅诊断面（B 解析失败时把可读文案带进 helper 错误）。 */
async function scopeBannerText(page: Page): Promise<string> {
  const testIds = [
    'part-studio-scope-error',
    'part-studio-scope-create',
    'part-studio-scope-recovery',
    'part-studio-scope-damaged',
    'part-studio-scope-empty',
    'part-studio-scope-loading',
  ];
  for (const testId of testIds) {
    const locator = page.getByTestId(testId);
    if ((await locator.count()) > 0) {
      const text = ((await locator.first().textContent()) ?? '').trim();
      if (text) return `${testId}: ${text}`;
    }
  }
  return '<无 scope 横幅>';
}

/** MS 健康/配额诊断（打开失败时一并进错误文案；M2 的额度等待归 P2.6c）。 */
async function msHealthHint(): Promise<string> {
  try {
    const response = await fetch(`${MS_BASE}/health`);
    const body = (await response.text()).slice(0, 160);
    return `MS health=${response.status}${response.status === 429 ? ` (${body})` : ''}`;
  } catch {
    return 'MS health=<unreachable>';
  }
}

/**
 * 打开任意 B 文档编辑器并等待解析器落位到完整 `?model=` scope + 编辑器就绪。
 * 适用于共享 B 种子与直连规格自建/自管 B 文档（项目须带 B 标记，否则解析器按
 * A 只读处理，永远没有 `?model=`）。
 *
 * 失败诊断包含 URL / scope 横幅 / MS health：M1 的「正在打开文档…」停滞既可能
 * 是 baseline 传播竞态，也可能是 MS 100 req/15min 配额 429；错误串先给出事实，
 * 不在 helper 内自动等待配额（M2 归 P2.6c）。
 */
export async function openBModelEditor(
  page: Page,
  ids: SeedImodelIds,
): Promise<BSeedEditorContext> {
  await loginWithSession(page);
  await gotoRoute(page, `/documents/${ids.itwinId}/${ids.imodelId}`, 'part-studio-page');
  try {
    await waitEditorReady(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}；URL=${page.url()}；scope=${await scopeBannerText(page)}；${await msHealthHint()}`,
    );
  }
  const scopeId = readModelScopeId(page);
  if (!scopeId) {
    throw new Error(
      `B 编辑器未落到 ?model= scope（URL=${page.url()}；${await scopeBannerText(page)}；${await msHealthHint()}）`,
    );
  }
  const dbKey = (await readBriefcaseKey(page)) ?? briefcaseDbKey(ids.imodelId);
  return { ...ids, scopeId, dbKey };
}

/**
 * 主编辑 helper（P2.6a）：打开 **B 种子** 编辑器，返回 `{itwinId, imodelId,
 * scopeId, dbKey}`。B 种子首开时解析器创建默认 `Part Studio 1` 并 replace 到
 * `?model=<uuid>`；本 helper 等到该 URL + 连接/画布就绪才返回。
 *
 * `ids` 可传入 reset 返回的同一组项目/库 id（L3：reset 与 open 必须指向同一行，
 * 避免各自按名解析在重复名/分页边缘命中不同对象）；省略时按名唯一解析。
 *
 * 注意：本 helper 一律直连 URL（编辑器规格的稳定入口，不依赖列表渲染/排序）。
 * flag-on 后 B 项目已在文档中心 B 区可见，列表→详情的 UI 入口由
 * documents.spec 的 P2.6c1 用例覆盖。
 */
export async function openSeedImodelEditor(
  page: Page,
  ids?: SeedImodelIds,
): Promise<BSeedEditorContext> {
  return openBModelEditor(page, ids ?? (await resolveSeedImodelIds('B')));
}

/**
 * A 旧文档编辑器 helper（只读规格专用）：打开未标记 A 种子库，返回项目/库 id。
 * 不等待 `?model=`（A 永不产生 scope），但等连接/画布就绪以承接只读读面断言。
 * `ids` 语义同 `openSeedImodelEditor`（可选传入 reset 结果）。
 */
export async function openLegacySeedEditor(
  page: Page,
  ids?: SeedImodelIds,
): Promise<LegacySeedEditorContext> {
  const target = ids ?? (await resolveSeedImodelIds('A'));
  await loginWithSession(page);
  await gotoRoute(page, `/documents/${target.itwinId}/${target.imodelId}`, 'part-studio-page');
  await waitEditorReady(page);
  if (new URL(page.url()).searchParams.has('model')) {
    throw new Error(`A 旧文档编辑器不应携带 ?model=（URL=${page.url()}）`);
  }
  return { ...target, kind: 'A' };
}

/** 编辑器就绪双门：状态栏「已连接」（briefcase 打开 + IPC host ready 相位合流）
 * + 视口挂载点内 canvas 真实创建（M4-T9 教训：相位 ready ≠ ScreenViewport 已建，
 * 必须等 canvas 在场，防早测假象）。
 *
 * 连接等待为显式轮询：连接中/正在打开文档…为正常过渡态；「连接失败」按应用
 * 自面的恢复路径（关闭页签重开 ≡ reload）给至多两次重开机会——M4-T9 观察#8 的
 * 启动竞态（页面坍缩仅剩错误文本，dev StrictMode 双启噪音）实测偶发，重开即愈；
 * 真实打不开则预算耗尽如实红。
 *
 * 【2026-10-26 发布日 e2e 产物模式复跑教训】负载窗口下（同机构建+双栈重建），
 * 固定 90s 死线会在两次重开进行中被耗尽——重开各含 3s 驻留 + 30s 可见等待 +
 * 过渡态轮询，实测需要 ~2 分钟。每次重开顺延 +60s 死线（预算语义不变：仍是
 * 「两次重开」，只是不让重开自身的耗时吃掉判定时间）。 */
export async function waitEditorReady(page: Page): Promise<void> {
  await expect(page.getByTestId('part-studio-page')).toBeVisible({ timeout: 30_000 });
  const status = page.getByTestId('part-studio-status-connection');
  let deadline = Date.now() + 90_000;
  let reloads = 0;
  for (;;) {
    // P2.6c2：状态栏 textContent 默认无超时——页面被 ErrorBoundary 整页接管
    // （如 RPC 未初始化崩溃）时会挂到用例总预算（实测 25min），把真红拖成
    // 「挂起」。5s 不可读即快速失败并把错误面文案带进诊断。
    let text: string;
    try {
      text = (await status.textContent({ timeout: 5_000 })) ?? '';
    } catch {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      throw new Error(
        `编辑器状态栏不可读（页面崩溃/导航离开？）：${bodyText.replace(/\s+/g, ' ').slice(0, 300)}`,
      );
    }
    if (text === '已连接') break;
    // 失败即重开（应用自面恢复路径），至多两次：一次重载可能再入启动竞态
    // （前一 context 的 MS 侧 db 释放/StrictMode 双启噪音），留二次机会；
    // 重载前小驻留，让上一连接的释放先落地。
    if (text === '连接失败' && reloads < 2) {
      reloads += 1;
      deadline += 60_000;
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

/** 按名定位文档（hub iTwin），返回 id；缺失返回 null；同名 ≥2 抛错（L3 唯一性）。 */
export async function apiFindDocumentByName(
  request: APIRequestContext,
  name: string,
  accessToken: string,
): Promise<{ id: string } | null> {
  const response = await request.get(`/itwins?subClass=Project&$top=${SEED_PAGE_SIZE}`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok()) throw new Error(`文档列表查询失败：HTTP ${response.status()}`);
  const { iTwins } = (await response.json()) as { iTwins?: Array<{ id: string; displayName?: string }> };
  const hit = uniqueMatch(iTwins ?? [], (itwin) => itwin.displayName, name, '文档');
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
// MS HTTP RPC（scope-aware 直连通道——发布窗真栈规格共用）
// ============================================================================

/** 宿主 modeling-server 直连基址（vite 代理同目标；Node 侧调用不走浏览器）。 */
const MS_BASE = 'http://localhost:5401';
/** RPC 操作路径版本取自共享契约（禁止硬编码——契约升版自动跟随，测试与 MS 不漂移）。 */
const FEATURE_RPC_VERSION = LubanFeatureRpcInterface.interfaceVersion;

interface RpcMeta {
  csrfHeader: string;
  csrf: string;
}
let rpcMeta: RpcMeta | undefined;

/** CSRF 元数据（/rpc/metadata 只取一次；双提交 token）。 */
export async function getRpcMeta(): Promise<RpcMeta> {
  if (rpcMeta) return rpcMeta;
  const res = await fetch(`${MS_BASE}/rpc/metadata`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const csrf = /csrf-token=([^;]+)/.exec(setCookie)?.[1] ?? '';
  rpcMeta = { csrfHeader: res.headers.get('x-csrf-token') ?? csrf, csrf };
  return rpcMeta;
}

/**
 * MS HTTP RPC 直调（BentleyCloud wire：POST text 载体 + CSRF 双提交 + 活动头）。
 * 参数一律原样进 body 数组——操作名在 URL path；可选 scope 参数按共享契约位置
 * 追加（如 applyFeatureOp 的 `partStudioId` 是第 4 参）。
 */
export async function msRpc(
  itwinId: string,
  imodelId: string,
  operation: string,
  args: unknown[],
  accessToken: string,
): Promise<unknown> {
  const { csrfHeader, csrf } = await getRpcMeta();
  const stamp = Date.now().toString(16).padStart(12, '0');
  const url =
    `${MS_BASE}/LubanCAD/v1.0/mode/primary/context/${itwinId}/imodel/${imodelId}` +
    `/changeset/0/LubanFeatureRpcInterface-${FEATURE_RPC_VERSION}-${operation}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Authorization: `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfHeader,
      Cookie: `csrf-token=${csrf}`,
      'X-Correlation-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
      'X-Application-Id': 'LubanCAD',
      'X-Application-Version': 'v1.0',
      'X-Session-Id': `7e19b6a0-0000-4000-8000-${stamp}`,
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MS RPC ${operation} HTTP ${res.status}: ${text.slice(0, 240)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`MS RPC ${operation} 响应非 JSON：${text.slice(0, 240)}`);
  }
  // text 载体响应形态容错：裸值 | {result} 包裹 | 序列化数组
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'result' in parsed
    && !('ok' in (parsed as Record<string, unknown>))) {
    return (parsed as { result: unknown }).result;
  }
  return parsed;
}

/** 写租约借用（页面在持会话：探测 holder 并沿用——单持有者语义，租约不另发）。 */
export interface WriteLease {
  sessionId: string;
  borrowed: boolean;
}

export async function borrowWriteLease(
  ctx: Pick<BSeedEditorContext, 'itwinId' | 'imodelId' | 'dbKey'>,
  accessToken: string,
  label: string,
): Promise<WriteLease> {
  const probeId = `${label}-probe-${Math.random().toString(36).slice(2)}`;
  const probe = (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'acquireWriteLease',
    [ctx.dbKey, probeId],
    accessToken,
  )) as { ok: boolean; holder?: string };
  const sessionId = probe.ok ? probeId : (probe.holder ?? probeId);
  if (probe.ok) {
    await msRpc(
      ctx.itwinId,
      ctx.imodelId,
      'acquireWriteLease',
      [ctx.dbKey, sessionId],
      accessToken,
    );
  }
  return { sessionId, borrowed: !probe.ok };
}

/**
 * 带 scope 的特征 op（第 4 参 `partStudioId`）。B 文档必须显式传 scope：缺省
 * legacy 写路径在含 scoped 分区的库上会被服务端诚实拒收（v1.17 契约）。
 * `scopeId` 可覆写以驱动同库另一 Part Studio（b-model-undo 的 ps-2 构造）。
 */
export async function applyFeatureOpRpc(
  ctx: BSeedEditorContext,
  op: FeatureOp,
  lease: WriteLease,
  accessToken: string,
  scopeId: string = ctx.scopeId,
): Promise<FeatureOpResult> {
  return (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'applyFeatureOp',
    [ctx.dbKey, op, lease.sessionId, scopeId],
    accessToken,
  )) as FeatureOpResult;
}

/** 带 scope 的特征树读面（第 2 参 `partStudioId`）。 */
export async function getFeatureTreeRpc(
  ctx: BSeedEditorContext,
  accessToken: string,
  scopeId: string = ctx.scopeId,
): Promise<FeatureTreeEntry[]> {
  return (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'getFeatureTree',
    [ctx.dbKey, scopeId],
    accessToken,
  )) as FeatureTreeEntry[];
}

/** 带 scope 的 body 读面。 */
export async function getBodiesRpc(
  ctx: BSeedEditorContext,
  accessToken: string,
  scopeId: string = ctx.scopeId,
): Promise<BodyInfo[]> {
  return (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'getBodies',
    [ctx.dbKey, scopeId],
    accessToken,
  )) as BodyInfo[];
}

/** 带 scope 的草图读面（第 3 参 `partStudioId`）。 */
export async function getSketchRpc(
  ctx: BSeedEditorContext,
  sketchId: string,
  accessToken: string,
  scopeId: string = ctx.scopeId,
): Promise<SketchDto | undefined> {
  return (await msRpc(
    ctx.itwinId,
    ctx.imodelId,
    'getSketch',
    [ctx.dbKey, sketchId, scopeId],
    accessToken,
  )) as SketchDto | undefined;
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
