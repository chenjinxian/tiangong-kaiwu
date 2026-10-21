# web-next M3（Part Studio 编辑器壳）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web-next 的 Part Studio 编辑器页达到 Onshape 采集证据（os-11~33）的视觉与交互基准：编辑器布局（顶栏/工具 ribbon/双段树/画布/停靠面板/页签条）、上下文敏感交互（选择驱动 UI/非模态特征对话框/草图模式全 UI 变身）、能力注册表（完整 UI 面 + gated 引导）。

**Architecture:** 模块 `modules/part-studio/`（内分 canvas/ribbon/tree/tabs/dock/dialogs/）；查看器消费 `packages/viewer-next`；zustand 在本里程碑首次引入（编辑器会话态）。本计划同时收掉 M0 钉的 M3 两颗雷（MS CORS 单源 :5300 / startViewer 静态 token 闭包）与 M2 钉的 session 韧性包（bridge 测试/hubFetch 统一 ApiClientError/登录 from 回跳/LubanAuthorizationClient Bearer 前缀）。

**Tech Stack:** React 18 + iTwinUI 3.22 + react-router-dom 6 + react-query 5 + zustand + i18next + Vitest 4；viewer-next link: 消费 vendored itwinjs-core。

**Spec:** `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`（§0 铁律、§1 结构、§2 数据层、§4 质感门禁、§5 编辑器壳、§6 测试门禁）。本计划实现其 M3 行。

**参照证据：**
- Onshape 采集（只读引用）：`.superpowers/sdd/2026-10-15-rw4-frontend-ia/onshape-audit/os-11-partstudio.png`（全页）、`os-12-canvas-context.png`（画布右键 35 项）、`os-15-tree-context.png`（树上右键）、`os-17-tab-context.png`（页签右键）、`os-18-share-dialog.png`（共享对话框）、`os-20-dropdown-*.png`（工具条 8 下拉）、`os-23-command-search.png`（命令搜索）、`os-24-app-menu.png`（汉堡菜单）、`os-26-part-context.png`（零件右键）、`os-30-sketch-mode.png`（草图模式）、`os-31-dialog-extrude.png`（特征对话框）、`os-33-insert-menu.png`（页签管理器）
- 旧应用移植源（只读参考，勿改）：`luban-cad/apps/web/src/pages/Editor/Editor.tsx`（840 行）、`features/editor/shell/*.tsx`、`features/editor/components/CadToolbar.tsx`（515 行，七组 26 工具）、`features/editor/components/FeaturePanel.tsx`（797 行）、`features/editor/components/FeatureTreePanel.tsx`（164 行）

## Global Constraints

- 全部沿用 M0/M1/M2 地基：别名、ESLint 分层、命名规范、令牌纪律
- 编辑器会话态走 zustand 小 store（树选中/展开、停靠页签、当前工具、草图模式）；运行时态（viewport/briefcase）走 viewer-next hooks，不进全局
- 完整 UI 面铁律：所有 Onshape 采集到的菜单/菜单项/对话框形态照常渲染；能力门 `gated` 项照常可点 → 能力引导对话框（不灰化不删减）
- 提交纪律：每任务一提交，`<type>(web-next): <中文摘要>` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- TDD：先写失败测试再实现；每步跑目标测试+全量+lint+tsc

---

### Task 1: M3 首开任务包（session 韧性包 + M0 两颗雷）

**Files:**
- Modify: `luban-cad/apps/web-next/src/app/providers/QueryErrorBridge.tsx`
- Modify: `luban-cad/apps/web-next/src/app/providers/test/QueryErrorBridge.test.tsx`（新增 4 用例）
- Modify: `luban-cad/apps/web-next/src/modules/documents/internal/documents.api.ts`（hubFetch 统一 ApiClientError）
- Modify: `luban-cad/apps/web-next/src/modules/documents/internal/share.api.ts`（同上）
- Modify: `luban-cad/apps/web-next/src/modules/authentication/hooks/useAuthForm.ts`（登录成功回跳 from）
- Modify: `luban-cad/apps/web-next/src/clients/auth/LubanAuthorizationClient.ts`（Bearer 前缀）
- Modify: `luban-cad/apps/web-next/vite.config.ts`（MS 同源代理：`/ipc` ws + RPC 前缀）
- Test: 见下

**Interfaces:**
- Produces:
  - QueryErrorBridge 测试覆盖（401→刷新→重放/重放再 401→清场/嵌套抑制/非 ApiClientError 忽略）
  - hubFetch 统一抛 ApiClientError（收藏/共享两面不再失明）
  - useAuthForm 登录成功读 `location.state?.from?.pathname ?? ROUTE_DOCUMENTS`
  - `LubanAuthorizationClient.getAccessToken()` 返回 `Bearer ${token}`（空 token 短路抛会话过期）
  - vite.config.ts 增 MS 代理：`'/ipc': { target: 'ws://localhost:5401', ws: true }`、`'/api'|'/rpc'`（按 MS 实际 RPC 前缀）同源代理；`startViewer` 的 `backendUrl` 改传同源（`window.location.origin`）

- [ ] **Step 1: 失败测试**（QueryErrorBridge 四用例 + useAuthForm from 回跳 + LubanAuthorizationClient Bearer）
- [ ] **Step 2: 实现**（四处修复 + vite 代理）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): M3 首开任务包——session 韧性（bridge 测试/hubFetch 统一/登录回跳/Bearer 前缀）+ MS 同源代理"
```

---

### Task 2: modules/part-studio 骨架 + zustand store

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/types.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/stores/part-studio.store.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/internal/capabilities.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/index.ts`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/part-studio.store.test.ts`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/capabilities.test.ts`

**Interfaces:**
- Produces:
  - `usePartStudioStore()` — zustand store（树选中/展开、停靠页签、当前工具、草图模式、命令搜索开关）
  - `capabilities.ts` — 能力注册表：`Capability = 'full' | 'gated'`；`TOOL_CAPABILITIES: Record<string, Capability>`；`isGated(toolId)`；`CAPABILITY_GUIDANCE: Record<string, { titleKey; messageKey }>`
  - 类型：`PartStudioState` / `DockTab` / `TreeTab` / `CanvasSelection`

- [ ] **Step 1: 失败测试**（store 初始态/切换；capabilities isGated/guidance 键）
- [ ] **Step 2: 实现**（zustand 依赖加入 package.json + pnpm install；store 按 spec §3 拆分小 store：tree store / dock store / tool store / sketch store / command-palette store；capabilities 注册表按 spec §5 初始 gated 集合）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): part-studio 骨架——zustand store+能力注册表"
```

---

### Task 3: 编辑器布局壳（顶栏/树/画布/停靠/页签）

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/PartStudioRoute.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.css`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioTopBar.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioSidebar.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioCanvas.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioDock.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioTabs.tsx`
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/PartStudioPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 store；viewer-next 的 `startViewer`/`useViewport`（viewer-next 需补 useViewport hook——若无则本任务内补）
- Produces: `/documents/:iTwinId/:iModelId` 完整编辑器页（对齐 os-11：顶栏/树/画布/停靠/页签五区）

- [ ] **Step 1: 失败测试**（五区结构断言）
- [ ] **Step 2: 实现**（布局=Header(面包屑+文档菜单+共享+用户菜单)+左侧竖条+双段树(特征+零件)+中央画布+右侧停靠+底部页签条；视口=viewer-next useViewport；页签=Part Studio 1 + 禁用「+」）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): Part Studio 编辑器布局壳——五区结构+页签条"
```

---

### Task 4: 工具 ribbon（27 工具 + 8 下拉 + 命令搜索）

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/ribbon/Ribbon.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/ribbon/RibbonDropdown.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/ribbon/ribbon-registry.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/ribbon/CommandPalette.tsx`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/ribbon-registry.test.ts`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/CommandPalette.test.tsx`

**Interfaces:**
- Produces:
  - `Ribbon.tsx` — 工具条（27 工具分组渲染，对齐 os-11）
  - `ribbon-registry.ts` — 注册表：`RibbonTool = { id, icon, labelKey, shortcut?, capability, group, dropdownItems? }`；8 个下拉飞菜单（对齐 os-20）
  - `CommandPalette.tsx` — 命令搜索面板（alt+/ 打开，对齐 os-23）
  - `useToolActivation(toolId)` — 激活工具（走 viewer-next 的 IModelApp.tools.run）

- [ ] **Step 1: 失败测试**（注册表完整性：27 工具+8 下拉全在册；CommandPalette 搜索过滤）
- [ ] **Step 2: 实现**（注册表按 os-11/os-20 采集的工具清单；gated 项渲染照常+点击开 CapabilityDialog；命令搜索=输入过滤+回车激活）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 工具 ribbon——27 工具+8 下拉+命令搜索"
```

---

### Task 5: 上下文敏感交互（画布右键/树上右键/选择驱动）

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/canvas/CanvasContextMenu.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/tree/FeatureTree.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/tree/TreeRow.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/tree/TreeFilter.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useCanvasSelection.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useFeatureTree.ts`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/CanvasContextMenu.test.tsx`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/FeatureTree.test.tsx`

**Interfaces:**
- Produces:
  - `CanvasContextMenu.tsx` — 画布右键菜单（空白态=适应/标准视图/显示设置；选中态=按拾取类型重构，对齐 os-12）
  - `FeatureTree.tsx` — 双段树（特征+零件，对齐 os-11 左栏）
  - `TreeFilter.tsx` — 语法筛选框（:errors/:hidden/:suppressed/:type/:variable/:warnings，对齐 os-20 文本）
  - `useCanvasSelection()` — 画布选择集（viewport pick → store）
  - `useFeatureTree()` — 树数据（features + parts）

- [ ] **Step 1: 失败测试**（CanvasContextMenu 选中态/空白态切换；FeatureTree 双段渲染+错误红显；TreeFilter 语法解析）
- [ ] **Step 2: 实现**（画布右键按拾取类型（part/face/edge/feature）重构菜单；树上右键（重命名/编辑/抑制/删除 HITL）；树↔画布联动单向流：树选中→viewport emphasize，画布 pick→回流 store）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 上下文敏感交互——画布右键/树上右键/选择驱动"
```

---

### Task 6: 非模态特征对话框 + 草图模式

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/FeatureDialog.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/SketchDialog.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/FeatureDialog.css`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/SketchDialog.css`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/FeatureDialog.test.tsx`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/SketchDialog.test.tsx`

**Interfaces:**
- Produces:
  - `FeatureDialog.tsx` — 非模态内联面板（✓/✗ 顶置+布尔作用域页签+折叠段+芯片选择+fast-pick，对齐 os-31）
  - `SketchDialog.tsx` — 草图模式对话框（草图平面选择+四开关，对齐 os-30）
  - 草图模式全 UI 变身：ribbon 切换为草图工具组、栅格/约束覆盖层、树红显活动草图

- [ ] **Step 1: 失败测试**（FeatureDialog 非模态/页签/折叠段/芯片选择；SketchDialog 四开关）
- [ ] **Step 2: 实现**（非模态=对话框打开期间画布可持续拾取+视图可旋转缩放；草图模式=store 切换 ribbon 工具组+覆盖层+树红显）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 非模态特征对话框+草图模式"
```

---

### Task 7: 页签管理器 + 文档汉堡菜单 + 共享对话框复用

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/tabs/TabManagerDialog.tsx`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/components/DocumentMenuBar.tsx`
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioTopBar.tsx`（挂共享对话框复用）
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/TabManagerDialog.test.tsx`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/DocumentMenuBar.test.tsx`

**Interfaces:**
- Produces:
  - `TabManagerDialog.tsx` — 页签管理器（文档元素列表+搜索+筛选+缩略图预览，对齐 os-33）
  - `DocumentMenuBar.tsx` — 汉堡文档菜单（重命名/详细信息/工作区单位/仅查看/关闭，对齐 os-24）
  - PartStudioTopBar 挂共享对话框（复用 modules/documents 的 ShareDocumentDialog）

- [ ] **Step 1: 失败测试**（TabManagerDialog 列表+搜索+筛选；DocumentMenuBar 菜单项）
- [ ] **Step 2: 实现**（页签管理器=当前文档的 iModel 列表+缩略图预览；汉堡菜单=DropdownMenu；共享对话框复用）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 页签管理器+文档汉堡菜单+共享对话框复用"
```

---

### Task 8: 视觉对照验收（os-11~33 并排）+ 真实栈冒烟

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/test/part-studio-structure.test.tsx`
- 证据产物（git-ignored）：`.superpowers/sdd/2026-10-21-web-next-m3-part-studio/` 下编辑器截图（与 onshape-audit 的 os-11~33 并排比对）

**Interfaces:**
- Produces: 编辑器结构断言（五区/ribbon/树/画布/页签/对话框锚点）+ 视觉对照证据 + 真实栈冒烟（登录→开文档→进编辑器→工具激活→草图→拉伸→撤销→保存）

- [ ] **Step 1: 结构断言测试**（五区/ribbon 27 工具/树双段/画布/页签/对话框锚点）
- [ ] **Step 2: 视觉对照证据**（dev 起编辑器页截图到 `sdd/2026-10-21-web-next-m3-part-studio/`：editor-next.png / ribbon-next.png / tree-next.png / canvas-context-next.png；与 os-11/12/15/20 并排读图比对，差异逐项登记）
- [ ] **Step 3: 真实栈冒烟**（复用 demo-flow 场景：登录→开文档→进编辑器→工具激活→草图→拉伸→撤销→保存→版本历史；Playwright 从 apps/web 借驱动）
- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next
git commit -m "test(web-next): Part Studio 结构断言+视觉对照证据+真实栈冒烟"
```

---

## M3 完成定义（DoD）

1. `/documents/:iTwinId/:iModelId` 完整编辑器页可访问（RequireAuth 下）
2. 五区结构（顶栏/树/画布/停靠/页签）+ 工具 ribbon（27 工具+8 下拉）+ 命令搜索（alt+/）
3. 上下文敏感交互（画布右键选中态/空白态、树上右键、树↔画布联动）
4. 非模态特征对话框 + 草图模式全 UI 变身
5. 页签管理器 + 汉堡文档菜单 + 共享对话框复用
6. 全量 vitest + lint + tsc 绿；结构断言 + 视觉对照证据落档
7. 真实栈冒烟：登录→开文档→进编辑器→工具激活→草图→拉伸→撤销→保存→版本历史
8. 视觉过审：编辑器与 os-11~33 并排对照，差异项全部登记
