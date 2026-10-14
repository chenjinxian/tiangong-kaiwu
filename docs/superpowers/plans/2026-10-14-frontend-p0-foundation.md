# 前端对标 Onshape 重构 · P0 基座实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立六波重构的地基——统一 httpClient、i18n 骨架（中/英）、品牌 token 映射、useToaster 迁移、`/documents` 路由骨架与债务清偿，全程保持 lint/test/e2e 绿。

**Architecture:** 原地迁移，不改页面外观与功能行为（P1 起才重做页面）；所有变更以现有单测/e2e 为护栏，新增能力先写失败测试。

**Tech Stack:** React 18 + Vite + vitest + Playwright；@itwin/itwinui-react v3.22；i18next ^21 + react-i18next（新增依赖）。

**Spec:** `docs/superpowers/specs/2026-10-14-frontend-onshape-redesign-design.md`（P0 行：httpClient 统一 + i18n 骨架 + token 映射 + useToaster 迁移 + `/documents` 路由骨架与旧路由重定向 + 债务清偿）

## Global Constraints

- 品牌 teal：light `#00b894`（hsl 167 100% 36.1%）/ dark `#00e4b8`（hsl 167 100% 44.7%），经 `--iui-color-accent-hsl` 映射。
- 新路由：`/documents`、`/documents/:iTwinId`、`/documents/:iTwinId/:iModelId`；旧 `/itwins`、`/itwins/:id`、`/workspace/:a/:b` 一律 `<Navigate replace>` 重定向。
- i18n：中文（zh-CN）默认，英文（en）同步；localStorage 键 `luban-cad-lang`。
- **后端 API 路径不变**——e2e/demo 里 `http://localhost:4000/itwins/...` 是后端 API，**禁止改动**；只改前端页面路由断言。
- 状态诚实：不做任何 mock UI；缺口不做假实现。
- pnpm 一律 `corepack pnpm@10`；手改 package.json 后 `install --no-frozen-lockfile`，**前后核对 pnpm-lock.yaml 中 `link:` 计数不变**（防 link: 被静默重解析）。
- Editor.tsx 内部（statusbar 硬编码色、overlay 栈）属 P4 范围，P0 不动——禁止镀金。
- 提交信息格式：`类型(web): 中文描述（P0 TaskN）`，尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。
- Windows 环境：删目录用 `Remove-Item -Recurse -Force`（PowerShell）或 `rm -rf`（Bash 工具）；非交互 rush/pnpm 需 `CI=true`。

## File Structure

| 文件 | 职责 |
|---|---|
| `shared/api/httpClient.ts`（新建） | 唯一 fetch 封装：Bearer 注入、401 刷新重试一次、官方错误包络两段读取、403 统一文案、`ApiError` |
| `shared/api/httpClient.test.ts`（新建） | 上述行为单测 |
| `shared/services/{itwins,accessControl,briefcases,imodels,webhooks}/client.ts`、`features/imodel/services/client.ts`（改） | 收敛到 httpClient，删除各自平行 fetch 封装 |
| `shared/i18n/index.ts` + `shared/i18n/locales/{zh-CN,en}/common.json`（新建） | i18next 初始化 + 首份语言资源 |
| `shared/i18n/i18n.test.ts`（新建） | 语言切换/fallback/键查找单测 |
| `shared/hooks/useAppToast.ts`（新建） | itwinui `useToaster` 的 `showToast(msg, type)` 适配器（供现有 hooks 签名复用） |
| `shared/components/ui/Toast*`（删） | 自研 Toast 三件套 + Toast.css + 两个测试退役 |
| `app/App.tsx`（改） | 新路由 + 旧路由重定向 + 404 i18n 化 |
| `app/components/PrivateRoute.tsx`（移入改） | 自绘 spinner → `ProgressRadial`，硬编码色 → token |
| `shared/components/feedback/ErrorBoundary.tsx`（改） | 双版合一：NonIdealState UI + logger + onError |
| `app/components/ErrorBoundary.tsx`（删） | 冗余版退役 |
| `e2e/*.spec.ts`、`e2e/auth.setup.ts`、`demo-flow.mjs`（改） | 前端路由断言 `/itwins`→`/documents`、`/workspace/`→`/documents/` |
| `styles/variables.css`（改） | 品牌 teal → `--iui-color-accent-hsl`；旧 `--color-*` 标 deprecated |

---

### Task 1: 统一 httpClient

**Files:**
- Create: `luban-cad/apps/web/shared/api/httpClient.ts`
- Create: `luban-cad/apps/web/shared/api/httpClient.test.ts`
- Modify: `luban-cad/apps/web/shared/services/itwins/client.ts:44-98`（fetchWithAuth 收敛为委托）
- Test: `luban-cad/apps/web/shared/api/httpClient.test.ts`

**Interfaces:**
- Consumes: `getValidAccessToken()`、`refreshAccessToken()`（`features/auth/services/auth/client.ts:395,356`）
- Produces:
  ```ts
  export class ApiError extends Error {
    constructor(message: string, readonly statusCode: number, readonly code?: string);
    get isNotFound(): boolean; get isUnauthorized(): boolean; get isForbidden(): boolean;
  }
  export interface FetchWithAuthOptions extends RequestInit { baseUrl?: string }
  export async function fetchWithAuth(path: string, options?: FetchWithAuthOptions, retryCount?: number): Promise<Response>
  ```
  后续 Task 2+ 与各波次的服务 hooks 全部依赖这两个导出。

- [ ] **Step 1: 写失败测试**

`shared/api/httpClient.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/auth/services/auth/client.js', () => ({
  getValidAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

import { fetchWithAuth, ApiError } from './httpClient.js';
import { getValidAccessToken, refreshAccessToken } from '../../features/auth/services/auth/client.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.mocked(getValidAccessToken).mockResolvedValue('token-1');
  vi.mocked(refreshAccessToken).mockResolvedValue(null);
  mockFetch.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('fetchWithAuth', () => {
  it('注入 Bearer 头并使用默认 hub base', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await fetchWithAuth('/itwins');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/itwins');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('无 token 抛 401 ApiError', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue('');
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ statusCode: 401 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('官方错误包络 {error:{message}} 优先，回落顶层 message', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'X', message: '官方消息' }, message: '旧消息' }), { status: 400 }),
    );
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ message: '官方消息', code: 'X' });
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: '旧消息' }), { status: 400 }));
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ message: '旧消息' });
  });

  it('403 统一改写文案', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));
    const err = await fetchWithAuth('/itwins').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('无权限访问该资源');
    expect((err as ApiError).isForbidden).toBe(true);
  });

  it('401 刷新 token 后重试一次，刷新失败抛 401', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await fetchWithAuth('/itwins');
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error('expired'));
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ statusCode: 401, code: 'Unauthorized' });
  });

  it('非 JSON 错误体不崩溃，回落 HTTP 状态码文案', async () => {
    mockFetch.mockResolvedValue(new Response('not json', { status: 500 }));
    await expect(fetchWithAuth('/itwins')).rejects.toMatchObject({ message: 'HTTP 500' });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd luban-cad/apps/web && npx vitest run shared/api/httpClient.test.ts`
Expected: FAIL（`Cannot find module './httpClient.js'`）

- [ ] **Step 3: 实现 httpClient**

`shared/api/httpClient.ts`：

```ts
/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 全站唯一认证 fetch 封装（P0 Task1）。
 * 行为口径迁移自 shared/services/itwins/client.ts 原 fetchWithAuth：
 * Bearer 注入 / 401 刷新并重试一次 / 官方错误包络 {error:{code,message}} 优先、
 * 回落旧包络顶层 message / 403 统一文案（页面经 showToast(error.message) 上浮）。
 */
import { getValidAccessToken, refreshAccessToken } from '../../features/auth/services/auth/client.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNotFound(): boolean { return this.statusCode === 404; }
  get isUnauthorized(): boolean { return this.statusCode === 401; }
  get isForbidden(): boolean { return this.statusCode === 403; }
}

export interface FetchWithAuthOptions extends RequestInit {
  /** 覆盖 base；默认 '' = 同源反代（VITE_IMODELHUB_URL 未配置） */
  baseUrl?: string;
}

export async function fetchWithAuth(
  path: string,
  options: FetchWithAuthOptions = {},
  retryCount = 0,
): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new ApiError('No authentication token', 401);
  }

  const { baseUrl, ...init } = options;
  const base = baseUrl ?? (import.meta.env.VITE_IMODELHUB_URL || '');
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (response.status === 401 && retryCount === 0) {
    try {
      await refreshAccessToken();
      return await fetchWithAuth(path, options, retryCount + 1);
    } catch {
      throw new ApiError('Authentication failed', 401, 'Unauthorized');
    }
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
      message?: string;
      code?: string;
    };
    const message = errorData.error?.message ?? errorData.message ?? `HTTP ${response.status}`;
    throw new ApiError(
      response.status === 403 ? '无权限访问该资源' : message,
      response.status,
      errorData.error?.code ?? errorData.code,
    );
  }

  return response;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd luban-cad/apps/web && npx vitest run shared/api/httpClient.test.ts`
Expected: PASS 6/6

- [ ] **Step 5: itwins/client.ts 收敛**

`shared/services/itwins/client.ts`：
- 删除本地 `fetchWithAuth`（:49-98）与 `ITwinsApiError` 类定义（:22-43）。
- 顶部改为：`import { fetchWithAuth, ApiError } from '../../api/httpClient.js';`
- 保留向后兼容导出（`instanceof` 语义不变，因别名同类）：`export { ApiError as ITwinsApiError } from '../../api/httpClient.js';`
- 删除文件内 `BACKEND_URL` 常量若仅服务于被删函数（注意 :261 `iTwinsClient` 仍在用——保留）。

- [ ] **Step 6: 全量单测 + lint 确认无回归**

Run: `cd luban-cad/apps/web && pnpm lint && pnpm test`
Expected: 全绿（重点：useITwinsQuery 相关测试仍过——`instanceof ITwinsApiError` 现为 `instanceof ApiError`，同类别名语义不变）

- [ ] **Step 7: Commit**

```bash
git add luban-cad/apps/web/shared/api luban-cad/apps/web/shared/services/itwins/client.ts
git commit -m "refactor(web): 统一 httpClient——Bearer/401刷新重试/错误包络两段读/403文案收敛（P0 Task1）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 服务客户端全量收编 httpClient

**Files:**
- Modify: `luban-cad/apps/web/shared/services/accessControl/client.ts:58-80`（私有 fetch → fetchWithAuth）
- Modify: `luban-cad/apps/web/shared/services/briefcases/client.ts:38-70`（裸 fetch 两处 → fetchWithAuth）
- Modify: `luban-cad/apps/web/shared/services/imodels/client.ts`、`shared/services/webhooks/client.ts`、`features/imodel/services/client.ts`（同上收敛）
- Test: 复用各 client 既有测试 + Task 1 httpClient 测试

**Interfaces:**
- Consumes: Task 1 的 `fetchWithAuth(path, options)` / `ApiError`
- Produces: 全站 services 层零平行 fetch 封装；P2/P3 的 members/roles hooks 直接站在统一口径上

- [ ] **Step 1: accessControl 收编**

删除类内私有 `fetch(path, options, retryCount)`（:58-80），方法体内 `this.fetch(...)` 全部替换为模块级 `fetchWithAuth(...)`；删除冗余 `getValidAccessToken` import（若仅被删函数使用）。注意保留文件尾 `getAuthorization` 导出（:132，SDK 回调在用）。

- [ ] **Step 2: briefcases 收编**

两处 `fetch(`${API_BASE_URL}${url}...`, { headers: { Authorization... } })`（:41-70）替换为 `fetchWithAuth(url, { baseUrl: API_BASE_URL, ... })`——**注意保留 `API_BASE_URL` 作 baseUrl**（briefcases 走 modeling-server 面，非同源 hub 默认）。

- [ ] **Step 3: imodels / webhooks / features-imodel 收编**

同模式替换。每处替换后 grep 确认无残留：`grep -n "getValidAccessToken\|Authorization" <file>` 仅剩 `getAuthorization` 类 SDK 回调。

- [ ] **Step 4: 全量单测 + lint**

Run: `cd luban-cad/apps/web && pnpm lint && pnpm test`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add luban-cad/apps/web/shared/services luban-cad/apps/web/features/imodel/services
git commit -m "refactor(web): 服务客户端全量收编 httpClient，平行 fetch 封装清零（P0 Task2）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: i18n 骨架（zh-CN 默认 / en 同步）

**Files:**
- Create: `luban-cad/apps/web/shared/i18n/index.ts`
- Create: `luban-cad/apps/web/shared/i18n/locales/zh-CN/common.json`
- Create: `luban-cad/apps/web/shared/i18n/locales/en/common.json`
- Create: `luban-cad/apps/web/shared/i18n/i18n.test.ts`
- Modify: `luban-cad/apps/web/package.json`（dependencies 增 3 项）
- Modify: `luban-cad/apps/web/app/main.tsx:14`（side-effect import）
- Modify: `luban-cad/apps/web/tsconfig.json`（若缺 `resolveJsonModule`）

**Interfaces:**
- Consumes: 无（新基建）
- Produces:
  ```ts
  // shared/i18n/index.ts
  export const LANGUAGE_STORAGE_KEY = 'luban-cad-lang';
  export default i18n; // i18next 实例
  ```
  页面经 `import { useTranslation } from 'react-i18next'` 消费；Task 6 的 404 页是首个真实消费方。

**依赖说明（对 spec §4.4 的技术修正）**：spec 写「`@itwin/core-i18n` 建骨架」。实施采用 **i18next + react-i18next 直连**——core-i18n 是面向 iTwin 工具串的封装（依赖 IModelApp.startup 时序），而认证页在 IModelApp 初始化前渲染；react-i18next 是 React 标准集成（itwin-ui 自身亦用它）。i18next 版本与 core-i18n 内嵌的 ^21 对齐，无并行实例。

- [ ] **Step 1: 加依赖（手改 package.json，非 pnpm add）**

`luban-cad/apps/web/package.json` `dependencies` 块按字母序插入：

```json
    "i18next": "^21.9.1",
    "i18next-browser-languagedetector": "^6.1.2",
    "react-i18next": "^14.3.0",
```

记录改前 link: 计数：`grep -c "link:" luban-cad/pnpm-lock.yaml`
安装：`cd luban-cad && CI=true corepack pnpm@10 install --no-frozen-lockfile`
**核对改后 link: 计数不变**；若变，回滚 lockfile（`git checkout luban-cad/pnpm-lock.yaml`）改用手动 lockfile 修补。
（网络受限时先 `$env:HTTPS_PROXY='http://127.0.0.1:7897'`。）

- [ ] **Step 2: 确认 tsconfig 支持 JSON import**

`grep resolveJsonModule luban-cad/apps/web/tsconfig.json`；缺失则在 `compilerOptions` 加 `"resolveJsonModule": true`。

- [ ] **Step 3: 写失败测试**

`shared/i18n/i18n.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import i18n, { LANGUAGE_STORAGE_KEY } from './index.js';

describe('i18n 骨架', () => {
  it('默认语言为 zh-CN', () => {
    expect(i18n.language.startsWith('zh')).toBe(true);
  });

  it('common 命名空间键命中（中文）', () => {
    expect(i18n.t('app.name')).toBe('鲁班CAD');
  });

  it('切换英文后键命中英文文案', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('app.name')).toBe('LubanCAD');
    await i18n.changeLanguage('zh-CN');
  });

  it('缺失键回落 zh-CN', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('common.onlyZh')).toBe('仅中文占位');
    await i18n.changeLanguage('zh-CN');
  });

  it('语言持久化键常量', () => {
    expect(LANGUAGE_STORAGE_KEY).toBe('luban-cad-lang');
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd luban-cad/apps/web && npx vitest run shared/i18n/i18n.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 5: 实现**

`shared/i18n/locales/zh-CN/common.json`：

```json
{
  "app": { "name": "鲁班CAD", "tagline": "基于 iTwin.js 的云端 CAD 平台" },
  "common": { "onlyZh": "仅中文占位", "loading": "加载中…", "confirm": "确认", "cancel": "取消" },
  "notFound": { "title": "404 - 页面不存在", "goDocuments": "回到文档" }
}
```

`shared/i18n/locales/en/common.json`：

```json
{
  "app": { "name": "LubanCAD", "tagline": "Cloud CAD platform built on iTwin.js" },
  "common": { "loading": "Loading…", "confirm": "Confirm", "cancel": "Cancel" },
  "notFound": { "title": "404 - Page Not Found", "goDocuments": "Go to Documents" }
}
```

`shared/i18n/index.ts`：

```ts
/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * i18n 骨架（P0 Task3）：i18next + react-i18next，资源打包内置（无运行时拉取）。
 * 语言优先级：localStorage(luban-cad-lang) → navigator → zh-CN。
 * 命名空间按页面/域划分：common/auth/documents/editor/settings（本任务仅建 common，
 * 各波次页面迁移时各自补 namespace 文件并注册到 resources）。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en/common.json';

export const LANGUAGE_STORAGE_KEY = 'luban-cad-lang';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { common: zhCommon },
      en: { common: enCommon },
    },
    defaultNS: 'common',
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en'],
    nonExplicitSupportedLngs: true,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });

export default i18n;
```

`app/main.tsx` 在 `import { initMonitoring }` 行前插入：`import '../shared/i18n/index.js'`

- [ ] **Step 6: 跑测试确认通过 + lint + 全量单测**

Run: `cd luban-cad/apps/web && npx vitest run shared/i18n/i18n.test.ts && pnpm lint && pnpm test`
Expected: 5/5 PASS；全量绿

- [ ] **Step 7: Commit**

```bash
git add luban-cad/apps/web/shared/i18n luban-cad/apps/web/package.json luban-cad/pnpm-lock.yaml luban-cad/apps/web/app/main.tsx luban-cad/apps/web/tsconfig.json
git commit -m "feat(web): i18n 骨架——i18next+react-i18next 中英双语命名空间与语言探测（P0 Task3）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: 品牌 token 映射（teal → iTwinUI accent）

**Files:**
- Modify: `luban-cad/apps/web/styles/variables.css`
- Create: `luban-cad/apps/web/styles/brandTokens.test.ts`

**Interfaces:**
- Consumes: iTwinUI v3.22 `--iui-color-accent-hsl` 主题种子变量
- Produces: 全站 high-visibility/accent 组件呈现品牌 teal；P1 认证页直接继承

- [ ] **Step 1: 核对 iTwinUI accent-hsl 值格式**

Run: `grep -o -- "--iui-color-accent-hsl:[^;]*" node_modules/@itwin/itwinui-react/styles.css | head -2`
确认格式为 `H S% L%` 三段通道（如 `210 100% 43.1%`）。若格式不同，按实际格式调整 Step 3 写法。

- [ ] **Step 2: 写失败测试（防回归的文件内容断言）**

`styles/brandTokens.test.ts`：

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'variables.css'), 'utf8');

describe('品牌 token 映射', () => {
  it('light 主题映射品牌 teal 到 iTwinUI accent 种子', () => {
    expect(css).toMatch(/\[data-theme="light"\][\s\S]*?--iui-color-accent-hsl:\s*167 100% 36\.1%/);
  });
  it('dark 主题映射品牌亮 teal', () => {
    expect(css).toMatch(/\[data-theme="dark"\][\s\S]*?--iui-color-accent-hsl:\s*167 100% 44\.7%/);
  });
  it('旧 --color-* 别名标记 deprecated', () => {
    expect(css).toContain('@deprecated');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd luban-cad/apps/web && npx vitest run styles/brandTokens.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现**

`styles/variables.css`：在 light 块（`[data-theme="light"]` 段）与 dark 块各追加 accent 种子覆写；文件头注释补迁移说明；旧 `--color-*` 段加 `@deprecated` 注释：

```css
/* light 块内追加 */
--iui-color-accent-hsl: 167 100% 36.1%; /* 品牌 teal #00b894 → iTwinUI accent 种子 */

/* dark 块内追加 */
--iui-color-accent-hsl: 167 100% 44.7%; /* 品牌亮 teal #00e4b8 */
```

```css
/* 旧 --color-* 段上方追加：
 * @deprecated P0 起品牌色经 --iui-color-accent-hsl 注入；
 * 以下 --color-* 别名仅为向后兼容保留，各波次页面重写时逐页清除，禁止新增消费方。 */
```

- [ ] **Step 5: 跑测试确认通过 + 视觉抽查**

Run: `npx vitest run styles/brandTokens.test.ts && pnpm test`
视觉抽查（栈在跑时）：`pnpm dev` 起 :3000，登录页「登录」high-visibility 按钮应呈 teal 而非 iTwinUI 默认蓝。

- [ ] **Step 6: Commit**

```bash
git add luban-cad/apps/web/styles
git commit -m "feat(web): 品牌 teal 映射 iTwinUI accent 种子 token，旧 --color-* 标 deprecated（P0 Task4）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: useToaster 迁移（自研 Toast 退役）

**Files:**
- Create: `luban-cad/apps/web/shared/hooks/useAppToast.ts`
- Create: `luban-cad/apps/web/shared/hooks/useAppToast.test.tsx`
- Modify: `luban-cad/apps/web/shared/hooks/index.ts`（追加导出）
- Modify: `luban-cad/apps/web/src/pages/Editor/Editor.tsx:157`、ITwinDetail.tsx:63、Settings.tsx:77（换适配器，删 `<ToastContainer />` JSX）
- Modify: `luban-cad/apps/web/shared/components/index.ts`（删 Toast 导出行）
- Delete: `shared/components/ui/Toast.tsx`、`ToastContainer.tsx`、`Toast.css`、`Toast.test.tsx`、`ToastContainer.test.tsx`

**Interfaces:**
- Consumes: `@itwin/itwinui-react` 的 `useToaster()`（`toaster.positive/negative/informational`）
- Produces:
  ```ts
  // shared/hooks/useAppToast.ts
  export type ToastType = 'success' | 'error' | 'info';
  export function useAppToast(): { showToast: (message: string, type?: ToastType) => void }
  ```
  `showToast` 签名与旧自研版逐字兼容——`useVersionControl`/`useSolidModelingDialogs` 的参数签名零改动。

- [ ] **Step 1: 写失败测试**

`shared/hooks/useAppToast.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const positive = vi.fn();
const negative = vi.fn();
const informational = vi.fn();
vi.mock('@itwin/itwinui-react', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToaster: () => ({ positive, negative, informational }),
}));

import { useAppToast } from './useAppToast.js';

describe('useAppToast', () => {
  it('类型映射到 itwinui toaster', () => {
    const { result } = renderHook(() => useAppToast());
    result.current.showToast('ok', 'success');
    result.current.showToast('bad', 'error');
    result.current.showToast('fyi', 'info');
    expect(positive).toHaveBeenCalledWith('ok');
    expect(negative).toHaveBeenCalledWith('bad');
    expect(informational).toHaveBeenCalledWith('fyi');
  });

  it('默认 type=info', () => {
    const { result } = renderHook(() => useAppToast());
    result.current.showToast('plain');
    expect(informational).toHaveBeenCalledWith('plain');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd luban-cad/apps/web && npx vitest run shared/hooks/useAppToast.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现适配器**

`shared/hooks/useAppToast.ts`：

```ts
/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * itwinui useToaster 的 showToast 适配器（P0 Task5）。
 * 签名与退役自研 ToastContainer 的 useToast().showToast 逐字兼容，
 * 使 useVersionControl/useSolidModelingDialogs 等以参数接收 showToast 的 hooks 零改动。
 */
import { useCallback } from 'react';
import { useToaster } from '@itwin/itwinui-react';

export type ToastType = 'success' | 'error' | 'info';

export function useAppToast(): { showToast: (message: string, type?: ToastType) => void } {
  const toaster = useToaster();
  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (type === 'success') toaster.positive(message);
      else if (type === 'error') toaster.negative(message);
      else toaster.informational(message);
    },
    [toaster],
  );
  return { showToast };
}
```

`shared/hooks/index.ts` 追加：`export { useAppToast, type ToastType } from './useAppToast.js';`

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run shared/hooks/useAppToast.test.tsx`
Expected: PASS 2/2

- [ ] **Step 5: 三页迁移**

Editor.tsx / ITwinDetail.tsx / Settings.tsx：
- `import { useToast } from '../../../shared/components/ui/ToastContainer.js'` → `import { useAppToast } from '../../../shared/hooks/index.js'`
- `const { showToast, ToastContainer } = useToast();` → `const { showToast } = useAppToast();`
- 删除 JSX 中 `<ToastContainer />`（逐文件 grep 定位）。

- [ ] **Step 6: 退役自研 Toast + 修引用测试**

```bash
rm luban-cad/apps/web/shared/components/ui/Toast.tsx luban-cad/apps/web/shared/components/ui/ToastContainer.tsx luban-cad/apps/web/shared/components/ui/Toast.css luban-cad/apps/web/shared/components/ui/Toast.test.tsx luban-cad/apps/web/shared/components/ui/ToastContainer.test.tsx
```
`shared/components/index.ts` 删除 `export { Toast }...`、`export { useToast }...` 两行。
`src/pages/Editor/Editor.test.tsx` 若渲染断言含 ToastContainer，改为匹配 toaster 或无断言（先看文件再改）。

- [ ] **Step 7: 全量验证**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: 全绿；build 无 Toast 残留引用错误

- [ ] **Step 8: Commit**

```bash
git add -A luban-cad/apps/web
git commit -m "refactor(web): 自研 Toast 退役迁 itwinui useToaster，showToast 签名兼容适配器（P0 Task5）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: /documents 路由骨架 + 旧路由重定向 + 404 i18n 化

**Files:**
- Modify: `luban-cad/apps/web/app/App.tsx`（路由表 + 重定向组件 + 404）
- Create: `luban-cad/apps/web/app/routes.test.tsx`
- Modify（navigate 清扫，11 处）: `src/pages/Documents/Documents.tsx:172`、`src/pages/Editor/Editor.tsx:109,111`、`src/pages/ForgotPassword/ForgotPassword.tsx:35`、`src/pages/ITwinDetail/ITwinDetail.tsx:178,186,194`、`src/pages/Login/Login.tsx:61`、`src/pages/Register/Register.tsx:55,235`、`src/pages/Settings/Settings.tsx:93`、`features/imodel/components/CreateIModelWorkflow.tsx:410`
- Modify（e2e 前端路由断言）: `e2e/login.spec.ts:73,76,99,105`、`e2e/documents.spec.ts:59,60`、`e2e/auth.setup.ts:48`、`e2e/complete-workflow.spec.ts:27`、`e2e/complete-workflow-api-login.spec.ts:75`、`e2e/authenticated-workflow.spec.ts:36,53`、`e2e/editor.spec.ts:69`
- Modify: `demo-flow.mjs:289,299,303,315,322`（仅前端路由 pattern；`:4000/itwins` 后端 API **不动**）

**Interfaces:**
- Consumes: Task 3 的 i18n（404 文案）、`useParams`（重定向保参）
- Produces:
  ```tsx
  export const LegacyITwinRedirect: React.FC        // /itwins/:iTwinId → /documents/:iTwinId
  export const LegacyWorkspaceRedirect: React.FC    // /workspace/:a/:b → /documents/:a/:b
  ```
  P2/P3/P4 的页面重写一律以 `/documents` 系路由为目标。

- [ ] **Step 1: 写失败测试**

`app/routes.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LegacyITwinRedirect, LegacyWorkspaceRedirect } from './App.js';

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="probe">{loc.pathname}</div>;
};

describe('旧路由重定向', () => {
  it('/itwins/:id → /documents/:id', () => {
    render(
      <MemoryRouter initialEntries={['/itwins/abc-123']}>
        <Routes>
          <Route path="/itwins/:iTwinId" element={<LegacyITwinRedirect />} />
          <Route path="/documents/:iTwinId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('/documents/abc-123');
  });

  it('/workspace/:a/:b → /documents/:a/:b', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/itwin-1/imodel-9']}>
        <Routes>
          <Route path="/workspace/:iTwinId/:iModelId" element={<LegacyWorkspaceRedirect />} />
          <Route path="/documents/:iTwinId/:iModelId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('/documents/itwin-1/imodel-9');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd luban-cad/apps/web && npx vitest run app/routes.test.tsx`
Expected: FAIL（App.js 无此导出）

- [ ] **Step 3: 实现路由改造**

`app/App.tsx`：
- 顶部 import 增 `useParams`、`useTranslation`；新增并**导出**两个重定向组件：

```tsx
// eslint-disable-next-line @typescript-eslint/naming-convention
export const LegacyITwinRedirect: React.FC = () => {
  const { iTwinId } = useParams();
  return <Navigate to={`/documents/${iTwinId}`} replace />;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const LegacyWorkspaceRedirect: React.FC = () => {
  const { iTwinId, iModelId } = useParams();
  return <Navigate to={`/documents/${iTwinId}/${iModelId}`} replace />;
};
```

- 受保护路由改写：`/itwins`→`/documents`、`/itwins/:iTwinId`→`/documents/:iTwinId`、`/workspace/:iTwinId/:iModelId`→`/documents/:iTwinId/:iModelId`；`/` → `/documents`。
- 追加兼容路由：

```tsx
<Route path="/itwins" element={<Navigate to="/documents" replace />} />
<Route path="/itwins/:iTwinId" element={<LegacyITwinRedirect />} />
<Route path="/workspace/:iTwinId/:iModelId" element={<LegacyWorkspaceRedirect />} />
```

- 404 分支 i18n 化（组件内 `const { t } = useTranslation();`）：

```tsx
<Route path="*" element={
  <div style={{ padding: 40, textAlign: 'center' }}>
    <h1>{t('notFound.title')}</h1>
    <a href="/documents">{t('notFound.goDocuments')}</a>
  </div>
} />
```

（404 挂在 AppRoutes 内层需函数化以用 hook：把 `*` 路由 element 抽成 `const NotFoundPage: React.FC = () => {...}` 小组件。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run app/routes.test.tsx app/App.test.tsx`
Expected: PASS（App.test.tsx 若因结构变化失败，最小修改适配——不动其测试意图）

- [ ] **Step 5: navigate 清扫（11 处）**

统一替换规则：字符串 `'/itwins'` → `'/documents'`；模板 `` `/itwins/${x}` `` → `` `/documents/${x}` ``；`` `/workspace/${a}/${b}` `` → `` `/documents/${a}/${b}` ``。逐文件改后：

Run: `grep -rn "navigate.*'/itwins\|navigate.*\`/itwins\|navigate.*\`/workspace" src features app --include="*.tsx" | grep -v node_modules`
Expected: 零命中

- [ ] **Step 6: e2e/demo 断言更新**

替换规则：断言/等待里的页面路由 `/itwins`→`/documents`、`/workspace/`→`/documents/`（含 `waitForURL('**/itwins')`→`'**/documents'`、`toContain('/itwins')`→`'/documents'`、正则 `/\/itwins\//`→`/\/documents\//`、`split('/')[4]` 注释同步）。**红线**：`:4000/itwins`（后端 API fetch）一律不动——改完逐文件 diff 复核。

- [ ] **Step 7: 全量验证**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: 全绿

- [ ] **Step 8: Commit**

```bash
git add -A luban-cad/apps/web
git commit -m "feat(web): /documents 路由骨架+旧路由重定向兼容+404 i18n 化（P0 Task6）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: PrivateRoute 归位 app 层 + itwinui 化

**Files:**
- Create: `luban-cad/apps/web/app/components/PrivateRoute.tsx`（自 features/editor 移入改写）
- Create: `luban-cad/apps/web/app/components/PrivateRoute.test.tsx`（自 features/editor 移入）
- Delete: `luban-cad/apps/web/features/editor/components/PrivateRoute.tsx`、`PrivateRoute.test.tsx`
- Modify: `luban-cad/apps/web/features/editor/index.ts`（删 PrivateRoute 导出）
- Modify: `luban-cad/apps/web/app/App.tsx:6`（import 改指 `./components/PrivateRoute.js`）
- Modify: `luban-cad/apps/web/app/App.test.tsx:40`（mock 路径同步）

**Interfaces:**
- Consumes: `useUser()`（`app/contexts/UserContext`）、itwinui `ProgressRadial`
- Produces: `app/components/PrivateRoute.tsx` 导出 `PrivateRoute`（props 签名不变：`{ children: React.ReactNode }`）

- [ ] **Step 1: 移动并改写**

`app/components/PrivateRoute.tsx`：逻辑不变（isLoading→加载态 / !isAuthenticated→`<Navigate to="/login" state={{from}} replace>` / 否则 children），加载态改写为：

```tsx
if (isLoading) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
      background: 'var(--iui-color-background-backdrop)',
    }}>
      <ProgressRadial indeterminate size="large" />
    </div>
  );
}
```

（硬编码 `#f5f5f5/#2196f3` 与内联 `<style>` keyframes 全删。）

- [ ] **Step 2: 移测试 + 改引用**

`git mv` 语义移动测试文件到 app/components；测试内 spinner 断言改为查 ProgressRadial 角色（`role="progressbar"` 或 container 查询——先看原测试再适配）。`features/editor/index.ts` 删 `PrivateRoute` 导出行；App.tsx、App.test.tsx import/mock 路径同步。

- [ ] **Step 3: 全量验证**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: 全绿

- [ ] **Step 4: Commit**

```bash
git add -A luban-cad/apps/web
git commit -m "refactor(web): PrivateRoute 归位 app 层，自绘 spinner 换 ProgressRadial 去硬编码色（P0 Task7）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: ErrorBoundary 双版合一

**Files:**
- Modify: `luban-cad/apps/web/shared/components/feedback/ErrorBoundary.tsx`（UI 换 NonIdealState，保留 logger+onError）
- Delete: `luban-cad/apps/web/app/components/ErrorBoundary.tsx`
- Modify（若有引用）: 任何 `app/components/ErrorBoundary` import 方

**Interfaces:**
- Consumes: itwinui `NonIdealState`/`Button`、`@itwin/itwinui-icons-react` `SvgStatusError/SvgRefresh`、`shared/lib/logger`
- Produces: `shared/components/feedback/ErrorBoundary.tsx` 导出 `ErrorBoundary`（props：`{ children, fallback?, onError?, onReset? }`）——App.tsx 现有 import 路径零改动

- [ ] **Step 1: 确认 app 版零引用**

Run: `grep -rln "app/components/ErrorBoundary\|components/ErrorBoundary" src features app shared --include="*.ts*" | grep -v node_modules`
Expected: 仅命中 `app/components/ErrorBoundary.tsx` 自身与 `shared/components/feedback/ErrorBoundary.tsx`（App.tsx 走的是 `shared/components/index.js`，不动）。若有额外命中先改指 shared 版。

- [ ] **Step 2: 合一实现**

`shared/components/feedback/ErrorBoundary.tsx` 重写为：保留 `logger.error(...)` + `onError?.(error, errorInfo)` 回调；默认 fallback 从红框自绘换成 app 版的 `NonIdealState` UI（`SvgStatusError` + 标题「出错了」+ 错误 message + DEV 下 componentStack 折叠 + 「重试」按钮 `onReset` 或 `window.location.reload()`）；文案暂保持中文（P 系列页面波次统一进 i18n，本任务不扩散范围）。`useErrorHandler` 如仅 app 版导出且无消费方则随删（先 grep 确认）。

- [ ] **Step 3: 删冗余 + 验证**

```bash
rm luban-cad/apps/web/app/components/ErrorBoundary.tsx
pnpm lint && pnpm test && pnpm build
```
Expected: 全绿（重点看是否有 ErrorBoundary 测试文件需适配）

- [ ] **Step 4: Commit**

```bash
git add -A luban-cad/apps/web
git commit -m "refactor(web): ErrorBoundary 双版合一——NonIdealState UI 统一，保留 logger/onError（P0 Task8）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 9: 死代码与空壳目录清除

**Files:**
- Delete: `luban-cad/apps/web/src/shared/components/ui/Tooltip.tsx`（已确认零引用）
- Delete: `luban-cad/apps/web/src/shared/`（若删后为空）、`luban-cad/apps/web/src/features/`（空壳）
- Delete: `luban-cad/modules/core/`、`luban-cad/modules/ui/`（仅 node_modules 的历史安装位）
- Modify: `luban-cad/CLAUDE.md`（若提及 modules 布局）、根 `CLAUDE.md` 布局表（`modules/{core,ui}` 字样移除）

**Interfaces:**
- Consumes: 无
- Produces: 干净目录树；pnpm-workspace.yaml 本就只有 `apps/*`+`packages/*`，删除无配置影响

- [ ] **Step 1: 删除前复核（防误删）**

```bash
ls luban-cad/modules/core luban-cad/modules/ui        # 确认仅 node_modules
find luban-cad/apps/web/src/features -type f          # 确认零文件
find luban-cad/apps/web/src/shared -type f            # 确认仅 Tooltip.tsx
grep -rln "src/shared/components/ui/Tooltip\|modules/core\|modules/ui" luban-cad/apps/web/src luban-cad/apps/web/features luban-cad/apps/web/app luban-cad/packages --include="*.ts*" 2>/dev/null | grep -v node_modules
```
Expected: grep 零命中。有任何命中→停下核对再删。

- [ ] **Step 2: 删除**

```bash
rm luban-cad/apps/web/src/shared/components/ui/Tooltip.tsx
rm -rf luban-cad/apps/web/src/shared luban-cad/apps/web/src/features luban-cad/modules/core luban-cad/modules/ui
```

- [ ] **Step 3: 文档同步**

根 CLAUDE.md 布局表 luban-cad 行删「+ `modules/{core,ui}`」；`grep -n "modules" luban-cad/CLAUDE.md` 有提及则同步。

- [ ] **Step 4: 验证**

Run: `cd luban-cad/apps/web && pnpm lint && pnpm test && pnpm build`
Expected: 全绿（无残留 import 报错）

- [ ] **Step 5: Commit**

```bash
git add -A luban-cad
git commit -m "chore(web): 死代码与空壳目录清除——Tooltip/src壳/modules安装位退役（P0 Task9）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 10: P0 验收门

**Files:**
- 无新文件；产出验收记录

**Interfaces:**
- Consumes: Task 1-9 全部产出
- Produces: P0 完成态 + 验收结论，解锁 P1 计划

- [ ] **Step 1: 静态全绿**

Run: `cd luban-cad/apps/web && pnpm lint && pnpm test && pnpm build`
Expected: 0 错误；49 测试文件全绿 + 新增 4 个测试文件（httpClient/i18n/brandTokens/useAppToast/routes）

- [ ] **Step 2: 全栈 e2e**

按根 CLAUDE.md 起栈（栈已在跑则跳过 1-3）：
```powershell
powershell -File scripts/fetch-backend.ps1   # 产物已就位可跳
docker compose up -d
powershell -File scripts/start-ms-host.ps1 -Detach
powershell -File scripts/verify-stack.ps1
cd luban-cad/apps/web && pnpm dev   # :3000 另开终端
```
Run: `cd luban-cad/apps/web && npx playwright test --workers=1`
Expected: 14 spec 全绿（路由断言已更新；登录→`/documents` 落地）

- [ ] **Step 3: 旧路由重定向抽查（e2e 未覆盖处）**

浏览器手测或 curl：`:3000/itwins` → 落地 `/documents`；`:3000/workspace/a/b`（登录态）→ `/documents/a/b`。

- [ ] **Step 4: 验收记录 + 更新 spec 勾选**

在 spec 文件 P0 行尾标注完成日期；`git add` spec 并提交：

```bash
git commit -m "docs(spec): P0 基座验收完成记录（P0 Task10）

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Self-Review 结论

- **Spec 覆盖**：P0 行六项（httpClient/i18n/token/useToaster/路由骨架/债务清偿）→ Task 1-9 全覆盖 + Task 10 验收门；Settings 裸 fetch 收编按 spec 归 P5，不在本计划。
- **占位符**：无 TBD/TODO；所有代码步给出完整实现。
- **类型一致性**：`fetchWithAuth`/`ApiError`（Task1 产出 ↔ Task2 消费）、`showToast`（Task5 产出 ↔ 三页+两 hooks 消费）、`LegacyITwinRedirect/LegacyWorkspaceRedirect`（Task6 产出 ↔ routes.test 消费）签名一致。
- **技术修正登记**：spec §4.4「@itwin/core-i18n 建骨架」→ 实施用 i18next+react-i18next 直连（理由见 Task 3 依赖说明），spec 文本随 P1 计划一并修订。
