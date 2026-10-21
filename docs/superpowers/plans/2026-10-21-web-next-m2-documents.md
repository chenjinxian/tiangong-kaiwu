# web-next M2（Documents 中心页 + 文档详情页）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web-next 的 Documents 中心页（筛选/创建/表格/网格/详情侧栏/共享对话框）与文档详情页（iModel 卡片网格）达到 Onshape 采集证据（os-01~08/40/44/48）的视觉与交互基准，并收掉 M1 终审钉给 M2 的三件套（RequireAuth / QueryCache 401 / logout）。

**Architecture:** 模块 `modules/documents/`（中心页）+ `modules/document-details/`（详情页）；数据层 `clients/itwins/ItwinsClient.ts`（封装官方 `@itwin/itwins-client`）+ `clients/imodels/ImodelsClient.ts`（封装 `@itwin/imodels-client-management`）；共享对话框 `ShareDocumentDialog` 移植自旧 `features/itwin/components/ShareITwinDialog.tsx`。

**Tech Stack:** React 18 + iTwinUI 3.22 + react-router-dom 6 + react-query 5 + i18next + Vitest 4；官方客户端 @itwin/itwins-client@^1.6.1、@itwin/imodels-client-management@^6.0.2（已在 M0 依赖内）。

**Spec:** `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`（§0 铁律、§1 结构、§2 数据层、§4 质感门禁、§6 测试门禁）。本计划实现其 M2 行。

**参照证据：**
- Onshape 采集（只读引用）：`.superpowers/sdd/2026-10-15-rw4-frontend-ia/onshape-audit/os-01-documents.png`（侧栏五筛选+创建大钮+表格）、`os-02-create-menu.png`（创建菜单：文档/文件夹/导入文件/导入来源/标签）、`os-03-user-menu.png`（用户菜单：我的帐户/深色模式开关/退出登录）、`os-06-filter-owned.png`（由我所有）、`os-40-create-menu.png`（创建菜单高清）、`os-48-account.png`（账户设置页左导航分区）
- 旧应用移植源（只读参考，勿改）：`luban-cad/apps/web/src/pages/Documents/Documents.tsx`（1102 行）、`src/pages/ITwinDetail/ITwinDetail.tsx`（588 行）、`features/itwin/components/{Create,Edit,Share}ITwinDialog.tsx`

## Global Constraints

- 全部沿用 M0/M1 地基：别名、ESLint 分层、命名规范、令牌纪律
- 数据层：官方客户端 baseUrl 指 hub :5400；`ITwin` 官方类型无 `lastModifiedDateTime`——「修改时间」映射 hub 实际字段（`lastModifiedDateTime ?? createdDateTime`，无则回退「—」），映射只发生在 `documents.mapper.ts`
- 领域名词映射：UI 层统一 `Document`（`DocumentSummary`）；API 层跟随官方 `ITwin`
- 提交纪律：每任务一提交，`<type>(web-next): <中文摘要>` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- TDD：先写失败测试再实现；每步跑目标测试+全量+lint+tsc

---

### Task 1: M2 前置三件套（RequireAuth / QueryCache 401 / logout）

**Files:**
- Create: `luban-cad/apps/web-next/src/app/guards/RequireAuth.tsx`
- Create: `luban-cad/apps/web-next/src/app/providers/QueryErrorBridge.tsx`
- Modify: `luban-cad/apps/web-next/src/clients/auth/AuthSession.ts`（补 logout）
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`（挂守卫）
- Test: `luban-cad/apps/web-next/src/app/test/RequireAuth.test.tsx`

**Interfaces:**
- Produces:
  - `RequireAuth({ children })` — 无会话跳 `/login`（保留 redirect state）；有会话渲染 children
  - `QueryErrorBridge` — QueryCache onError：401→`AuthSession.getValidAccessToken()`（单飞刷新）→ 原请求重放；失败清场跳 /login
  - `AuthSession.logout(): Promise<void>` — POST `${hubUrl}/auth/logout` + `clearAuth()`

- [ ] **Step 1: 写失败测试**

```tsx
// app/test/RequireAuth.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '../guards/RequireAuth.js';

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: { getStoredAuth: vi.fn() },
}));

import { AuthSession } from '@clients/auth/AuthSession.js';

describe('RequireAuth', () => {
  it('无会话跳 /login', () => {
    (AuthSession.getStoredAuth as ReturnType<typeof vi.fn>).mockReturnValue(null);
    render(
      <MemoryRouter initialEntries={['/documents']}>
        <RequireAuth><div data-testid="protected">protected</div></RequireAuth>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('有会话渲染 children', () => {
    (AuthSession.getStoredAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: '1' }, accessToken: 'x' });
    render(
      <MemoryRouter initialEntries={['/documents']}>
        <RequireAuth><div data-testid="protected">protected</div></RequireAuth>
      </MemoryRouter>
    );
    expect(screen.getByTestId('protected')).toBeDefined();
  });
});
```

- [ ] **Step 2: 实现**

`RequireAuth.tsx`:

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthSession } from '@clients/auth/AuthSession.js';

export function RequireAuth({ children }: { children: React.ReactNode }): React.JSX.Element {
  const location = useLocation();
  const stored = AuthSession.getStoredAuth();
  if (!stored?.accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
```

`QueryErrorBridge.tsx`（QueryCache 全局 401→刷新→重放；接进 AppProviders 的 QueryClient）:

```tsx
import { QueryCache } from '@tanstack/react-query';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ApiClientError } from '@clients/http/ApiClientError.js';

export function installQueryErrorBridge(queryClient: import('@tanstack/react-query').QueryClient): void {
  queryClient.getQueryCache().subscribe(async (event) => {
    if (event.type !== 'observerResultsUpdated') return;
    const error = event.query.state.error;
    if (error instanceof ApiClientError && error.status === 401) {
      try {
        await AuthSession.getValidAccessToken();
        await event.query.fetch();
      } catch {
        AuthSession.clearAuth();
        window.location.href = '/login';
      }
    }
  });
}
```

（更稳的做法是把 installQueryErrorBridge 挂到 AppProviders 的 useEffect；QueryClient 实例从 useQueryClient 取。）

`AuthSession.logout`：POST `${hubUrl}/auth/logout` `{accessToken, refreshToken}`；无论成败都 `clearAuth()`。

`routes.tsx`：把 `/documents`、`/documents/:iTwinId`、`/documents/:iTwinId/:iModelId`、`/settings` 包进 `<RequireAuth>`。

- [ ] **Step 3: 全绿 + Commit**

```bash
git add luban-cad/apps/web-next
git commit -m "feat(web-next): M2 前置三件套——RequireAuth 守卫+QueryCache 401 桥+logout"
```

---

### Task 2: clients/itwins（官方客户端封装）

**Files:**
- Create: `luban-cad/apps/web-next/src/clients/itwins/ItwinsClient.ts`
- Create: `luban-cad/apps/web-next/src/clients/itwins/types.ts`
- Test: `luban-cad/apps/web-next/src/clients/itwins/test/ItwinsClient.test.ts`

**Interfaces:**
- Produces:
  - `ItwinsClient.list(params?: { top?: number; skip?: number }): Promise<ITwin[]>`
  - `ItwinsClient.get(id: string): Promise<ITwin>`
  - `ItwinsClient.create(input: { displayName: string; class?: string }): Promise<ITwin>`
  - `ItwinsClient.update(id: string, input: Partial<ITwin>): Promise<ITwin>`
  - `ItwinsClient.delete(id: string): Promise<void>`
  - `ItwinsClient.listFavorites(): Promise<ITwin[]>`
  - `ItwinsClient.listRecents(): Promise<ITwin[]>`
  - 全部经官方 `@itwin/itwins-client` `ITwinsAccessClient`（baseUrl hub :5400）；accessToken 由 `AuthSession.getValidAccessToken()` 供给

- [ ] **Step 1: 失败测试**（mock `@itwin/itwins-client` 的 ITwinsAccessClient，断言调用形状+返回映射）

- [ ] **Step 2: 实现**（构造函数 `new ITwinsAccessClient(env.hubUrl)`；每个方法先 `getValidAccessToken()` 再调官方方法；`ITwin` 类型 re-export 自官方包）

- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): clients/itwins——官方 ITwinsAccessClient 封装（list/get/create/update/delete/favorites/recents）"
```

---

### Task 3: clients/imodels（官方客户端封装）

**Files:**
- Create: `luban-cad/apps/web-next/src/clients/imodels/ImodelsClient.ts`
- Create: `luban-cad/apps/web-next/src/clients/imodels/types.ts`
- Test: `luban-cad/apps/web-next/src/clients/imodels/test/ImodelsClient.test.ts`

**Interfaces:**
- Produces:
  - `ImodelsClient.list(iTwinId: string): Promise<IModel[]>`
  - `ImodelsClient.get(id: string): Promise<IModel>`
  - `ImodelsClient.create(iTwinId: string, input: { name: string; description?: string }): Promise<IModel>`
  - `ImodelsClient.delete(id: string): Promise<void>`
  - `IModel` 类型 re-export 自 `@itwin/imodels-client-management`

- [ ] **Step 1: 失败测试**（mock IModelsClient）
- [ ] **Step 2: 实现**（构造 `new IModelsClient({ api: { baseUrl: \`${env.hubUrl}/imodels\` } })`；authorization 回调走 `getValidAccessToken()`）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): clients/imodels——官方 IModelsClient 封装"
```

---

### Task 4: modules/documents 骨架（查询 hooks + mapper + 侧栏筛选）

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/documents/hooks/useDocuments.ts`
- Create: `luban-cad/apps/web-next/src/modules/documents/hooks/useDocumentFilters.ts`
- Create: `luban-cad/apps/web-next/src/modules/documents/internal/documents.mapper.ts`
- Create: `luban-cad/apps/web-next/src/modules/documents/internal/documents.constants.ts`
- Create: `luban-cad/apps/web-next/src/modules/documents/types.ts`
- Test: `luban-cad/apps/web-next/src/modules/documents/test/documents.mapper.test.ts`
- Test: `luban-cad/apps/web-next/src/modules/documents/test/useDocumentFilters.test.ts`

**Interfaces:**
- Produces:
  - `useDocuments(filter: DocumentFilter): { documents: DocumentSummary[]; isLoading; error }`（react-query）
  - `useDocumentFilters()` — 当前筛选（URL search param `?filter=`）+ 切换
  - `DocumentSummary = { id; name; owner; role; createdAt; modifiedAt; thumbnailUrl? }`（映射自官方 ITwin）
  - `DocumentFilter = 'recent' | 'favorites' | 'my' | 'shared' | 'public'`

- [ ] **Step 1: 失败测试**（mapper：ITwin→DocumentSummary 映射（含 modifiedAt 回退）；useDocumentFilters：URL param 读写）
- [ ] **Step 2: 实现**（useDocuments 内部按 filter 分流：recent→listRecents、favorites→listFavorites、my/shared→list+owner 过滤、public→list+公开标记过滤）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): documents 骨架——查询 hooks+mapper+筛选"
```

---

### Task 5: Documents 中心页（/documents）

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/DocumentsRoute.tsx`
- Create: `luban-cad/apps/web-next/src/routes/DocumentsRoute.css`
- Create: `luban-cad/apps/web-next/src/modules/documents/DocumentsPage.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/DocumentsPage.css`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/DocumentSidebar.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/DocumentToolbar.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/DocumentGrid.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/DocumentTable.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/DocumentTile.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/DocumentInfoPanel.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/CreateDocumentDialog.tsx`
- Create: `luban-cad/apps/web-next/src/modules/documents/components/ShareDocumentDialog.tsx`（移植自旧 ShareITwinDialog）
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`
- Test: `luban-cad/apps/web-next/src/modules/documents/test/DocumentsPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 hooks/mapper；M1 的 AuthSession；iTwinUI 组件
- Produces: `/documents` 完整页（对齐 os-01/02/03/06/40：侧栏五筛选+创建大钮+创建菜单+表格/网格切换+详情侧栏+共享对话框+用户菜单）

- [ ] **Step 1: 失败测试**（DocumentsPage 渲染：侧栏五项、创建按钮、搜索框、表格/网格切换、详情侧栏锚点、共享对话框锚点、用户菜单锚点）
- [ ] **Step 2: 实现**（布局=Header(logo+搜索+用户菜单)+SideNavigation(筛选)+main(工具条+内容)；创建菜单=DropdownMenu(文档/文件夹🟠/导入文件🟠/导入来源🟠/标签🟠)；共享对话框移植旧 ShareITwinDialog 的成员/邀请/链接三页签）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): Documents 中心页——五筛选/创建菜单/表格网格/详情侧栏/共享对话框"
```

---

### Task 6: 文档详情页（/documents/:iTwinId）

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/DocumentDetailsRoute.tsx`
- Create: `luban-cad/apps/web-next/src/modules/document-details/DocumentDetailsPage.tsx`
- Create: `luban-cad/apps/web-next/src/modules/document-details/components/DocumentHero.tsx`
- Create: `luban-cad/apps/web-next/src/modules/document-details/components/ImodelCardGrid.tsx`
- Create: `luban-cad/apps/web-next/src/modules/document-details/components/ImodelCard.tsx`
- Create: `luban-cad/apps/web-next/src/modules/document-details/hooks/useImodels.ts`
- Create: `luban-cad/apps/web-next/src/modules/document-details/internal/imodels.mapper.ts`
- Create: `luban-cad/apps/web-next/src/modules/document-details/types.ts`
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`
- Test: `luban-cad/apps/web-next/src/modules/document-details/test/DocumentDetailsPage.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 ImodelsClient；Task 4 的 ItwinsClient.get
- Produces: `/documents/:iTwinId` 完整页（对齐 os-01 详情区：面包屑+hero（缩略图/名称/元信息/操作）+iModel 卡片网格+创建 iModel 对话框）

- [ ] **Step 1: 失败测试**（DocumentDetailsPage 渲染：面包屑、hero、卡片网格、创建按钮）
- [ ] **Step 2: 实现**（hero=Surface+缩略图+名称+状态 Tag+创建/更新时间+iModel 计数；卡片=IModelCard（缩略图/名称/描述/初始化徽标/创建时间/打开工作空间按钮））
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 文档详情页——hero+iModel 卡片网格"
```

---

### Task 7: 设置页（/settings）

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/SettingsRoute.tsx`
- Create: `luban-cad/apps/web-next/src/modules/settings/SettingsPage.tsx`
- Create: `luban-cad/apps/web-next/src/modules/settings/components/SettingsSidebar.tsx`
- Create: `luban-cad/apps/web-next/src/modules/settings/components/SettingsProfilePanel.tsx`
- Create: `luban-cad/apps/web-next/src/modules/settings/components/SettingsPreferencesPanel.tsx`
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`
- Test: `luban-cad/apps/web-next/src/modules/settings/test/SettingsPage.test.tsx`

**Interfaces:**
- Produces: `/settings` 完整页（对齐 os-48 左导航分区：个人资料/电子邮件/首选项/通知/安全/设备/应用程序/集成/开发者 + 订阅/支付/团队；首选项含深色模式开关）

- [ ] **Step 1: 失败测试**（SettingsPage 渲染：左导航分区、个人资料表单、首选项深色开关）
- [ ] **Step 2: 实现**（左导航=SideNavigation 分区；个人资料=头像+名字/姓氏/用户名/昵称/个人简历；首选项=深色模式开关（联动 ThemeContext）+语言选择）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 设置页——左导航分区+个人资料+首选项"
```

---

### Task 8: 视觉对照验收（os-01~08/40/44/48 并排）

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/documents/test/documents-structure.test.tsx`
- Create: `luban-cad/apps/web-next/src/modules/document-details/test/document-details-structure.test.tsx`
- Create: `luban-cad/apps/web-next/src/modules/settings/test/settings-structure.test.tsx`
- 证据产物（git-ignored）：`.superpowers/sdd/2026-10-21-web-next-m2-documents/` 下三页截图（与 onshape-audit 的 os-01~08/40/44/48 并排比对）

**Interfaces:**
- Produces: 三页结构断言（每页关键区域存在性）+ 视觉对照证据（并排截图）

- [ ] **Step 1: 结构断言测试**（Documents：侧栏/创建按钮/搜索/表格/网格切换/详情侧栏/共享对话框；DocumentDetails：面包屑/hero/卡片网格/创建按钮；Settings：左导航分区/表单/开关）
- [ ] **Step 2: 视觉对照证据**（dev 起三页截图到 `sdd/2026-10-21-web-next-m2-documents/`：documents-next.png / document-details-next.png / settings-next.png；与 onshape-audit 的 os-01/06/40/48 并排读图比对，差异逐项登记——执行者在报告里写明差异清单）
- [ ] **Step 3: Commit**

```bash
git add luban-cad/apps/web-next
git commit -m "test(web-next): M2 三页结构断言+视觉对照证据"
```

---

## M2 完成定义（DoD）

1. 三页可访问（/documents、/documents/:iTwinId、/settings），全部包在 RequireAuth 下
2. 登录成功跳 /documents 后可见真实文档列表（hub 数据）
3. Documents 页五筛选/创建菜单/表格网格切换/详情侧栏/共享对话框全通
4. 文档详情页 hero+iModel 卡片网格全通
5. 设置页左导航分区+个人资料+深色开关全通
6. 全量 vitest + lint + tsc 绿；结构断言 + 视觉对照证据落档
7. 视觉过审：Documents 与 os-01/06/40、详情页与 os-01 详情区、设置页与 os-48 并排对照，差异项全部登记
