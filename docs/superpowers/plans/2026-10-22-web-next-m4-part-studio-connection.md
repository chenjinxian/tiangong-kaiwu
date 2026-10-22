# web-next M4（Part Studio 连接层——从壳到真建模）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web-next Part Studio 建立 BriefcaseConnection + ScreenViewport 真连接：几何渲染、ribbon 工具真激活、拉伸特征闭环（insertFeature extrude 落库→树刷新→几何出现）、撤销/重做/保存（BriefcaseTxns 通道）、版本历史真实面板，并清偿 M3 终审挂账（必办 5 项 + 波次项）。

**Architecture:** 运行时层落 `packages/viewer-next`（connection/ + viewport/ + tools/，link: vendored itwinjs-core）；编辑会话层落 `modules/part-studio/hooks/`（特征系统/撤销/编辑作用域）；数据客户端扩展 `clients/imodels`（changesets）。移植源全部为旧应用已验证链路（viewer-core 两 hook、Editor.tsx 编排、useFeatureSystem/useFeatureDisplaySync、features/modeling 自定义工具、useChangesets），接口按 web-next 架构重写，**禁止拷贝旧 God Component 结构**。

**Tech Stack:** React 18 + iTwinUI 3.22 + react-query 5 + zustand + Vitest 4；viewer-next link: 消费 vendored itwinjs-core（core-frontend/editor-frontend）；@luban-cad/shared（LubanFeatureRpcInterface/OpDsl）；@itwin/imodels-client-management（changesets）。

**Spec:** `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`（§0 铁律/§3 状态五分法/§5 编辑器壳与查看器/§6 测试门禁）。M4 输入清单 = `.superpowers/sdd/2026-10-21-web-next-m3-part-studio/final-review.md` §五（终审交付，本计划逐项收口）。

**范围沿革（如实注记）：** spec §7 的 M4 原定义「上下文菜单/非模态对话框/草图模式/选择驱动 UI」已由 M3 提前交付（M3-T5/T6）；本计划 M4 = M3 冒烟断点解封所需的**连接层**（终审裁定口径），对照证据不变（os-11/12/26/30/31）。

**移植源（只读参考，勿改）：**
- `luban-cad/packages/viewer-core/src/hooks/useBriefcaseConnection.ts`（连接生命周期）
- `luban-cad/packages/viewer-core/src/hooks/useViewport.ts`（ScreenViewport 创建+类目/模型补全+内容感知取景）
- `luban-cad/apps/web/src/pages/Editor/Editor.tsx`（编排序：权限→连接→工具注册→编辑作用域；:262-309 工具注册、:322-371 编辑作用域、:200-235 editorToolSettings）
- `luban-cad/apps/web/features/editor/registerTools.ts`（工具注册总表）
- `luban-cad/apps/web/features/modeling/{DraftFacesTool,CreateHoleTool,MirrorElementsTool,PatternTools}.ts`（自定义工具类）
- `luban-cad/apps/web/features/editor/hooks/useFeatureSystem.ts`（特征系统中枢）+ `useFeatureDisplaySync.ts`（几何显示同步）
- `luban-cad/apps/web/features/version-control/hooks/useChangesets.ts`（官方 SDK changesets）
- `luban-cad/apps/web/src/core/decorations/ProjectExtentsDecoration.ts`（D4 装饰件）

**参照证据（只读）：** `.superpowers/sdd/2026-10-15-rw4-frontend-ia/onshape-audit/os-11-partstudio.png`（顶栏右侧 undo/redo/save 位）、os-12/26（右键）；M3 冒烟断点记录 `.superpowers/sdd/2026-10-21-web-next-m3-part-studio/smoke-log.md`（S4 后半/S6/S7/S8 BLOCKED、S9 PARTIAL——本计划 DoD 即其解封）。

## Global Constraints

- 全部沿用 M0-M3 地基：别名、ESLint 分层、跨模块只准 barrel、令牌纪律、`<type>(web-next): <中文摘要>` + Co-Authored-By 提交纪律
- **建模管道硬约束**（luban-cad/CLAUDE.md 铁律）：工具继承 iTwin.js 标准基类；编辑走 `basicManipulationIpc`；事务走 `BriefcaseTxns`/`saveChanges`；**Undo/Redo 用 iTwin 内置 UndoTool/RedoTool + 监听 BriefcaseTxns 事件**——旧应用自造 UndoManager **不移植**，按 core 标准通道重写
- 状态五分法：connection/viewport/editingScope 运行时态 = viewer-next hooks，**不进 zustand**；特征树/changesets 服务端态 = react-query（本计划新增两个 queryKey 域，禁拷贝进 store）
- viewer-next 命名：hooks 文件 `use-*.ts` camelCase、工具类文件 PascalCase=类名、测试进 `test/` 子目录
- **权限门裁决（本计划拍板）**：可编辑 = `!store.viewOnly`（M3-T7 仅查看模式切片）；briefcase 默认可写打开。access-control API 权限判定（旧 useIModelPermission）不在本计划——登记 M5/backlog，勿擅自引入 @itwin/access-control-client
- **草图诚实边界**：真实草图绘制链（旧 M3-b useSketchSystem/SketchCreateTool/约束）不在本计划——草图模式 UI 变身（M3 已交付）之外，草图工具接线登记 backlog；拉伸闭环走「空 profile = 拉伸基体」路径（shared opDsl 语义，后端 FeatureService 生成基体）
- 真实栈冒烟前置：dist-backend 产物模式（`scripts/fetch-backend.ps1` + `scripts/start-ms-host.ps1 -Detach`）+ docker compose 栈 + verify-stack 14/14；MS 限流 100/15min——会话注入
- TDD：先写失败测试再实现；每步跑目标测试+全量+lint+tsc

---

### Task 1: viewer-next 连接层——useBriefcaseConnection 移植 + stopViewer 引用计数（T3-③ 必办）

**Files:**
- Create: `luban-cad/packages/viewer-next/src/connection/use-briefcase-connection.ts`
- Create: `luban-cad/packages/viewer-next/src/connection/index.ts`
- Modify: `luban-cad/packages/viewer-next/src/host/web-initializer.ts`（stopViewer → 引用计数 acquire/release）
- Modify: `luban-cad/packages/viewer-next/src/viewport/use-viewport.ts`（挂载 acquire / 卸载 release，替换单连接 stopViewer——**收 M3-T3-③ 必办挂账**）
- Modify: `luban-cad/packages/viewer-next` 包入口 barrel（既有，追加导出）
- Test: `luban-cad/packages/viewer-next/src/connection/test/use-briefcase-connection.test.ts`
- Test: `luban-cad/packages/viewer-next/src/host/test/web-initializer.test.ts`（追加引用计数用例）

**Interfaces:**
- Consumes: `IpcApp.makeIpcProxy<OpenCloudIpcInterface>(openCloudIpcChannel)`（@luban-cad/shared 既有导出）、`BriefcaseConnection.openFile`（core-frontend）
- Produces:
  - `useBriefcaseConnection(options: { iTwinId: string; iModelId: string; readonly?: boolean } | null): { connection: BriefcaseConnection | null; isLoading: boolean; error: Error | null; saveChanges(description?: string): Promise<void>; pushChanges(description: string): Promise<void>; pullChanges(): Promise<void> }`——options=null 时不做 IPC 且关既有连接（权限未载前防竞态的调用姿态与旧应用一致）
  - `acquireViewer(options: StartViewerOptions): Promise<void>` / `releaseViewer(): Promise<void>`——引用计数；计数 1→0 才 shutdown；startViewer 保持幂等初始化语义，stopViewer 收归私有

- [ ] **Step 1: 失败测试**（移植 viewer-core useBriefcaseConnection.test.ts 断言子集 + 新增引用计数用例）

```ts
// connection/test/use-briefcase-connection.test.ts 断言清单：
// 1) options=null：不调 downloadBriefcase、connection 恒 null
// 2) 正常流：downloadBriefcase(iTwinId,iModelId,readonly) 被调 → openFile({fileName,readonly,key:fileName}) → connection 就位
// 3) 卸载：conn.close() 恰一次；isClosing 重入保护（连卸两次只关一次）
// 4) saveChanges/pushChanges/pullChanges 代理到 connection 同名方法
// 5) openFile 拒绝 → error 就位、connection 恒 null、isLoading 归 false
// host/test/web-initializer.test.ts 追加：
// 6) acquire×2 → release×1：IModelApp.shutdown 未调；release 再×1：shutdown 调用
```

- [ ] **Step 2: 实现**（连接 hook 按旧 viewer-core :48-200 逐行移植，去 God 注释、按 web-next 头注风格重写；引用计数在 web-initializer 内加模块级计数器——acquire 复用 startViewer 幂等体，release 在计数归零时执行原 stopViewer shutdown 体）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): viewer-next 连接层——useBriefcaseConnection 移植+stopViewer 引用计数"
```

---

### Task 2: ScreenViewport 创建——几何渲染主链 + Onshape 底色 + D4 装饰件

**Files:**
- Modify: `luban-cad/packages/viewer-next/src/viewport/use-viewport.ts`（扩 ScreenViewport 创建——options 增 `iModel?: IModelConnection`，result 增 `viewport: ScreenViewport | undefined`；不建第二个 hook）
- Create: `luban-cad/packages/viewer-next/src/viewport/theme-background.ts`
- Create: `luban-cad/packages/viewer-next/src/viewport/decorations/project-extents-decoration.ts`（D4 必办挂账）
- Create: `luban-cad/packages/viewer-next/src/viewport/test/use-viewport.test.ts`、`test/theme-background.test.ts`、`test/project-extents-decoration.test.ts`
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioCanvas.tsx`（viewportRef div 消费新 result；iModel 从 PartStudioPage 下传）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（组合 useBriefcaseConnection + useViewport；viewOnly→readonly）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/test/PartStudioPage.test.tsx`（结构断言演进：连接/视口相位锚点）

**Interfaces:**
- Consumes: Task 1 的 `useBriefcaseConnection`（connection 作 iModel 入参——BriefcaseConnection extends IModelConnection）
- Produces:
  - `useViewport(options: UseViewportOptions): { viewportRef; phase; error; viewport: ScreenViewport | undefined }`——options 扩 `iModel?: IModelConnection`；iModel 就位后：getDefaultViewState（views.queryProps→load，缺省 ViewCreator3d.createDefaultView）→ ensureViewHasCategoriesAndModels → ScreenViewport.create → viewManager.addViewport → setupViewCategoriesAndModels（**ModelState 显式 load + drop/add 触发 refs 重建**——BRep 不渲染两断点，viewer-core useViewport.ts:259-273 注释为权威）→ queryModelRanges 内容感知取景（:282-298）
  - `applyViewportBackground(viewport: ScreenViewport, theme: 'light'|'dark'): void`——亮 (242,244,247) / 暗 (38,38,38)（旧 Editor.tsx:243-260 实测值）；观察 `documentElement[data-theme]` 的接线留在消费侧
  - `toggleProjectExtents(connection, on: boolean): void`（旧装饰件移植，D4）

- [ ] **Step 1: 失败测试**（use-viewport：iModel 就位→viewport 创建/卸载 drop+dispose/StrictMode cancelled 不 setState；theme-background：两主题色值钉死；decoration：toggle 开关状态）
- [ ] **Step 2: 实现**（移植 viewer-core useViewport.ts:34-299 全链 + 背色 + 装饰件；PartStudioPage 组合：`useBriefcaseConnection({iTwinId,iModelId,readonly:viewOnly})` → connection 下传 useViewport → viewport 下传 Canvas；背景接线用 MutationObserver 监听 data-theme 同旧应用）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): ScreenViewport 创建主链——类目/模型补全+内容感知取景+底色+extents 装饰件"
```

---

### Task 3: 工具注册——EditTools.initialize + web-next 注册表 + 自定义工具移植

**Files:**
- Create: `luban-cad/packages/viewer-next/src/tools/register-edit-tools.ts`（`ensureEditTools(): Promise<void>` 幂等）
- Create: `luban-cad/packages/viewer-next/src/tools/modeling/DraftFacesTool.ts`（移植 apps/web/features/modeling/DraftFacesTool.ts）
- Create: `luban-cad/packages/viewer-next/src/tools/modeling/CreateHoleTool.ts`（同源移植）
- Create: `luban-cad/packages/viewer-next/src/tools/modeling/MirrorElementsTool.ts`（同源移植）
- Create: `luban-cad/packages/viewer-next/src/tools/modeling/PatternTools.ts`（LinearPatternTool/CircularPatternTool 同源移植）
- Create: `luban-cad/packages/viewer-next/src/tools/test/register-edit-tools.test.ts` + `test/modeling/*.test.ts`（四个移植件各一）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（phase ready 后编排：waitForToolAdmin 轮询→ensureEditTools→失败 notifications 可见——Editor.tsx:262-309 序忠实移植含错误通知）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/test/PartStudioPage.test.tsx`

**Interfaces:**
- Consumes: core-frontend 视图/测量/裁剪工具、editor-frontend 基元/编辑/布尔/面边工具（@itwin/editor-frontend——web-next 需新增该依赖进 viewer-next package.json，link: vendored itwinjs-core 的 editor/frontend）
- Produces:
  - `ensureEditTools(): Promise<void>`——幂等（模块级 flag）；注册序同旧 registerTools.ts（视图 7 → 基元 5 → 草图原生 6 → 变换 4 → 面边/布尔/阵列 → 选择 5 → 测量 6 → 裁剪 5+2 → 装饰 4 → 动画 2 → 渲染 3）+ `registerDefaultShortcuts()` 子集移植（src/core/shortcuts/KeyboardManager.ts——仅 Undo/Redo/Delete/Escape 相关键位，全表移植延后）
  - 跳过项（诚实登记，勿静默）：core-markup 12 工具（依赖未配置，同旧应用）；旧 useUndoManager（本计划 T4 走 BriefcaseTxns 标准通道）
- [ ] **Step 1: 失败测试**（注册表完整性：钉 toolId 集合——含 8 个 M3 校准真实 toolId（SweepFaces/RoundEdges/ChamferEdges/DraftFaces/HollowFaces/CreateHole/MirrorElements/LinearPattern）；幂等：二次调用不重复 register；移植工具类行为断言从旧 PatternTools.test.ts 取子集：requireAcceptForSelectionSetOperation=false、wantDynamics=false、exitTool 语义）
- [ ] **Step 2: 实现**（工具类移植保持类名/toolId 不变——Agent 复用规约「同 toolId 禁第二套」要求与旧应用完全同名；PartStudioPage 编排序含 100ms×50 轮询与注册失败通知）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 工具注册——EditTools.initialize+web-next 注册表+四自定义工具移植"
```

---

### Task 4: 编辑作用域 + 撤销/重做/保存顶栏

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useEditingScope.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useUndoRedo.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useEditorKeyboard.ts`
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioTopBar.tsx`（顶栏右侧 undo/redo/save 钮组，对齐 os-11；六态完备）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（组合三 hook）
- Modify: `luban-cad/apps/web-next/src/common/i18n/locales/{zh-CN,en}/part-studio.json` + `test/i18n.test.ts` 对账
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/useEditingScope.test.ts`、`test/useUndoRedo.test.ts`、`test/useEditorKeyboard.test.ts`；`test/PartStudioTopBar.test.tsx`（新增——既有测试文件若无则建）

**Interfaces:**
- Consumes: Task 1 connection、Task 2 viewport；editor-frontend `UndoTool/RedoTool`（Task 3 已注册）
- Produces:
  - `useEditingScope(connection: BriefcaseConnection | undefined, enabled: boolean): { isReady: boolean }`——enter/exit GraphicalEditingScope（Editor.tsx:322-371 忠实移植：existingScope 复用、supportsGraphicalEditing、enter 失败回查 existingScope、卸载退出）
  - `useUndoRedo(connection: BriefcaseConnection | null): { canUndo; canRedo; hasUnsavedChanges; undo(): Promise<void>; redo(): Promise<void>; saveChanges(description?): Promise<void> }`——**BriefcaseTxns 标准通道**：`connection.txns.isUndoPossible/isRedoPossible` + `onUndoRedoChanged`/`onCommit`/`onCommitted` 事件驱动状态；undo/redo 走 `IModelApp.tools.run('Undo'/'Redo')`（内置工具，事务语义由 core 管理）
  - `useEditorKeyboard(enabled: boolean, actions: { undo; redo; save }): void`——Ctrl+Z/Ctrl+Y(+Ctrl+Shift+Z)/Ctrl+S window keydown，editable 门控

- [ ] **Step 1: 失败测试**（useUndoRedo：txns 事件→canUndo/canRedo/hasUnsavedChanges 状态机；undo→tools.run('Undo')；保存代理 saveChanges。useEditingScope：进入/复用/失败回查/卸载退出。TopBar：三钮 disabled 态跟状态、save 点击调 saveChanges、i18n 键）
- [ ] **Step 2: 实现**（旧应用编辑作用域与键盘逻辑移植，undo 状态机按 core 通道重写勿抄旧 UndoManager）
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 编辑作用域+撤销/重做/保存顶栏——BriefcaseTxns 标准通道"
```

---

### Task 5: 特征系统中枢——useFeatureSystem 移植 + 显示同步

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useFeatureSystem.ts`
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useFeatureDisplaySync.ts`
- Test: `luban-cad/apps/web-next/src/modules/part-studio/test/useFeatureSystem.test.ts`、`test/useFeatureDisplaySync.test.ts`

**Interfaces:**
- Consumes: `LubanFeatureRpcInterface`（@luban-cad/shared 既有）、Task 1 connection
- Produces:
  - `useFeatureSystem(connection: BriefcaseConnection | undefined, opts?: { enabled?: boolean }): { tree: FeatureTreeEntry[]; loading: boolean; error?: string; leaseOk: boolean; refresh(): Promise<void>; applyOp(op: FeatureOp): Promise<FeatureOpResult> }`——旧 useFeatureSystem.ts:56+ 子集移植：读树（connection.key）、写租约（acquire/10s renew/失能 release/拒收 leaseOk:false）、onCommitted 刷新、applyOp 成功自动 refresh。**显式延后并登记**：previewOp/resolveEdgeRef/resolveFaceRef/formModel（特征对话框增强 backlog，本版 extrude 用 `params: { profile: [], distance }` 直提交——shared opDsl 语义「空 profile=拉伸基体」）
  - `useFeatureDisplaySync(connection: BriefcaseConnection | undefined): void`——geometryGuid 三步失效（guid 更新/dispose tile tree owners/refreshForModifiedModels + 未加载补载），旧 useFeatureDisplaySync.ts 忠实移植

- [ ] **Step 1: 失败测试**（从旧 useFeatureSystem.test.ts 取子集：applyOp 成功→refresh 调用/失败→error 且不 refresh；租约 acquire→leaseOk=true、拒收→false 且读树不阻断；onCommitted→refresh；displaySync：onModelGeometryChanged→guid 写回+dispose 调用+重绘）
- [ ] **Step 2: 实现**
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 特征系统中枢——useFeatureSystem 移植+几何显示同步"
```

---

### Task 6: 拉伸闭环接线——特征树真数据 + FeatureDialog 提交 + T6-① key 必办

**Files:**
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useFeatureTree.ts`（真数据源=useFeatureSystem.tree；壳期占位移除——T5-②③ 收口）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useCanvasSelection.ts`（**T5-① 必办**：树真数据接线时一并收——emphasizedNodeIds `join('')` 碰撞改 `JSON.stringify` 稳定序列化 + unmount 清空 emphasize）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/tree/FeatureTree.tsx`（loading/error/empty 六态；零件段=iModel 物理元素查询（`SELECT ECInstanceId,CodeValue FROM BisCore.GeometricElement3d` 经 connection.createQueryReader，诚实呈现数量与名））
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/FeatureDialog.tsx`（提交接线：`applyOp({ kind: 'insertFeature', featureType, params: { profile: [], distance } })`；成功 toast+关闭+树自动刷新；失败就地 Alert 六态 error；✓/✗ 语义保持）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/stores/part-studio.store.ts`（dialog 切片扩创建模式：`{ mode: 'new'; featureType: LubanFeatureType } | { mode: 'edit'; featureId: string }`）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/ribbon/Ribbon.tsx`（useToolActivation 增 extrude 特例路由开 FeatureDialog——同 newSketch→SketchDialog 姿态）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/PartStudioPage.tsx`（**T6-① 必办**：FeatureDialog 挂 `key={dialog.mode==='edit' ? dialog.featureId : 'new-'+dialog.featureType}`）
- Test: 更新 `test/FeatureDialog.test.tsx`、`test/FeatureTree.test.tsx`、`test/Ribbon.test.tsx`（如无则建对应）、`test/part-studio.store.test.ts`

**Interfaces:**
- Consumes: Task 5 useFeatureSystem（tree/applyOp）
- Produces: 拉伸闭环全链——ribbon「拉伸」→ FeatureDialog(new/extrude) → 提交 → insertFeature 落库（后端 FeatureService 求值）→ onCommitted+refresh → 树新条目 → 显示同步使几何出现

- [ ] **Step 1: 失败测试**（FeatureDialog：new 模式提交调 applyOp 形状钉死（insertFeature/extrude/{profile:[],distance}）；成功关对话框+toast；失败 Alert 就地。FeatureTree：entries 渲染/loading 骨架/error 态/empty 态；零件段元素数。Ribbon：拉伸点击→对话框开而非 tools.run。store：dialog 切片两模式读写。T6-①：key 存在性（不同 featureId 切换重挂））
- [ ] **Step 2: 实现**
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 拉伸闭环——特征树真数据+FeatureDialog 提交接线"
```

---

### Task 7: 版本历史真实面板——changesets + 推送

**Files:**
- Modify: `luban-cad/apps/web-next/src/clients/imodels/ImodelsClient.ts`（增 `listChangesets(iModelId: string): Promise<Changeset[]>`——官方 `iModelsClient.changesets.getRepresentationList` 迭代器收集，旧 useChangesets.ts:48 为准）
- Create: `luban-cad/apps/web-next/src/modules/part-studio/hooks/useChangesets.ts`（react-query；queryKey `['part-studio','changesets',iModelId]`）
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/components/PartStudioDock.tsx`（版本历史页签真内容：changeset 列表（index/描述/日期）+ 当前版本标记（`connection.changeset.id` 比对）+「保存」钮（hasUnsavedChanges 徽标）+「推送」钮+描述对话框（旧 PushChangesetDialog 形态移植））
- Create: `luban-cad/apps/web-next/src/modules/part-studio/dialogs/PushChangesetDialog.tsx`
- Test: `luban-cad/apps/web-next/src/clients/imodels/test/ImodelsClient.test.ts`（追加）、`test/useChangesets.test.ts`、`test/PartStudioDock.test.tsx`（追加）、`test/PushChangesetDialog.test.tsx`

**Interfaces:**
- Consumes: Task 1 connection（changeset.id/saveChanges/pushChanges）、Task 4 hasUnsavedChanges
- Produces: `ImodelsClient.listChangesets(iModelId): Promise<Changeset[]>`；`useChangesets(iModelId: string | null)`；dock 版本历史 = 真数据六态完备

- [ ] **Step 1: 失败测试**（client：SDK mock 断言调用形状+迭代收集；hook：queryKey/启用门控；dock：列表渲染/当前标记/保存推送接线/加载与空态；推送对话框：描述必填+确认调 pushChanges）
- [ ] **Step 2: 实现**
- [ ] **Step 3: 全绿 + Commit**

```bash
git commit -m "feat(web-next): 版本历史真实面板——changesets+保存推送"
```

---

### Task 8: M3 终审挂账清偿——菜单波次 + a11y + 视觉 + store 命名拍板

**Files（逐项对应 final-review.md §五）:**
- Modify: `tree/FeatureTree.tsx`——**D3** 特征段头三工具钮（os-11 左栏段头形态；visual-diff.md D3 行为准）
- Modify: `canvas/CanvasContextMenu.tsx`——**D5** 菜单项图标；**T5-⑥** 占位 kind 治理（四项占位逐一赋真实 kind；文件头注加「gated→full 翻转检查单：占位 kind 清零」条目）
- Modify: `hooks/useCanvasSelection.ts`——**T5-⑤** setAnchor 重构（监听一次注册）
- Modify: `components/PartStudioDock.tsx`——**T3-④** dock tab aria-controls
- Modify: `components/PartStudioTabs.tsx` 或 TabManagerDialog——**T6-③** 页签方向键导航；**T7-①** alt+~+t 和弦热键 + 列表 ↑↓ 行导航
- Modify: `components/PartStudioTopBar.tsx`——**D2** 分享钮形态（非全高直角）
- Modify: `app/App.tsx` 或 logo 组件——**T3-①** logo 渐变令牌化（裸色→--lx-* 变量）；**T3-②** help-button 死类清理
- Modify: `modules/documents/internal/{documents,share}.api.ts` + `clients/http/*`——**T1-①** hubFetch 透出 `retryAfterSeconds`（ApiClientError 已有字段，hubFetch 429/Retry-After 分支填入）；**T1-③** `app/guards/RequireAuth.tsx` navigate(undefined) 形状守卫（from 非 Location 形状时回退 ROUTE_DOCUMENTS）
- Rename: `stores/part-studio.store.ts` → `stores/use-part-studio-store.ts`（**store 命名口径拍板落地**：hook 主导出文件=camelCase use-*，与 use-viewport.ts 同规；全仓 import 更新）
- Test: 上述每项一个断言；重截 D2/D3 对照图

**Interfaces:**
- Consumes: M3 全部既有组件；visual-diff.md 27 条中「偏差-待修」清单
- Produces: M3 终审挂账（非 M4 必办部分）全部闭环或显式再登记

- [ ] **Step 1: 失败测试**（逐项：段头三钮渲染与动作、菜单图标存在、kind 枚举钉死、aria-controls 关联、方向键导航、和弦热键、分享钮形态类锚点、渐变无裸色（token guard 断言）、store 重命名后全量导入解析）
- [ ] **Step 2: 实现**（先重命名 store（一次性机械提交内完成，勿与行为修复混提交——分两笔：rename 一笔、行为清偿一笔）
- [ ] **Step 3: 全绿 + Commit（两笔）**

```bash
git commit -m "refactor(web-next): store 文件重命名 use-part-studio-store——hook 文件 camelCase 口径拍板"
git commit -m "fix(web-next): M3 挂账清偿——D3 段头钮/D5 菜单图标/T5-⑤⑥/T3-①②④/D2/T6-③/T7-①"
```

---

### Task 9: 结构断言扩展 + 真实栈全链冒烟 + 浮层探针

**Files:**
- Modify: `luban-cad/apps/web-next/src/modules/part-studio/test/part-studio-structure.test.tsx`（新锚点：undo/redo/save 钮、连接相位、视口挂载、特征树真数据钩子位）
- 证据产物（git-ignored）：`.superpowers/sdd/2026-10-22-web-next-m4-part-studio-connection/` 下冒烟日志/截图/探针 JSON

**Interfaces:**
- Produces: M4 DoD 验收证据——T8 冒烟 S4 后半/S6/S7/S8/S9 全解封 + 浮层探针标准化

- [ ] **Step 1: 结构断言更新**（演进既有 13 用例 + 新锚点；jsdom mock 面扩 connection/viewport）
- [ ] **Step 2: 真实栈全链冒烟**（起栈顺序见 Global Constraints；Playwright :5310 会话注入）：登录→/documents（S1 保持 PASS 不回归）→开 E2E Seed→编辑器→**几何可见**（视口非空像素断言）→工具真激活（RoundEdges：`tools.run` 返回 true+console 无警告）→**拉伸闭环**（拉伸→对话框→提交→树新条目→画布像素变化）→**撤销**（Ctrl+Z→树条目消失）→**保存**（顶栏保存→hasUnsavedChanges 归 false）→**版本历史**（dock 列表出现新 changeset）。逐步截图+机读 JSON，任何一步真实失败如实登记（铁律：不弱化断言凑绿）
- [ ] **Step 3: 浮层探针复测**（复用 M3-T8 的 c2-dropdown-probe.mjs 作标准动作：8 下拉逐一展开断言可点——D1 回归守卫）
- [ ] **Step 4: Commit**

```bash
git commit -m "test(web-next): M4 结构断言+真实栈全链冒烟+浮层探针"
```

---

### Task 10: editor 模块收编 luban-cad（用户裁决 2026-10-22）

> 背景：用户裁定 itwinjs-core 的 editor 模块归属 luban-cad 自有（上游不再更新建模功能）；所有建模功能修改/新增在此模块上做，必要时整体搬入 luban-cad。

**Files:**
- Move: `itwinjs-core/editor/*`（frontend/backend 等）→ `luban-cad/packages/editor/*`（第一方包；源文件原样搬迁，git 历史经 docs 注记追溯）
- Modify: `luban-cad/packages/viewer-next/package.json`（@itwin/editor-frontend link: 路径改指新家）+ lockfile
- Move: `luban-cad/packages/viewer-next/src/tools/modeling/*`（T3 移植的四工具）→ editor-frontend 包内（建模功能归位）
- Modify: `docs/UPSTREAM_SYNC.md`（登记：editor/* 从 fork 删除；后续 subtree pull 后须再删上游带回的 editor 目录——同步检查单新条目）
- Modify: `docs/ITWINJS_CORE_MODIFICATIONS.md`（归属变更注记：editor 模块不再是 fork 修改而是第一方）
- Test: 搬迁后 viewer-next + apps/web-next 双包全量门禁绿；`rush build --to @itwin/core-frontend`（core 不再依赖 editor——验证 rush 链完好）

**Interfaces:**
- Produces: `luban-cad/packages/editor/frontend`（包名暂保 `@itwin/editor-frontend`，最小化私有仓 modeling-server 的 `link:` 搅动；改名另立决策）；建模功能的新家

- [ ] **Step 1: 搬迁**（目录原样 move + package.json/tsconfig 适配 pnpm workspace + viewer-next link: 重定向）
- [ ] **Step 2: 四工具随迁**（viewer-next/src/tools/modeling → editor-frontend；registration 引用更新）
- [ ] **Step 3: 文档 + itwinjs-core 删除 editor**（UPSTREAM_SYNC 同步检查单 + MODIFICATIONS 归属注记；fork 内 editor/ 删除，验证 rush build 链完好）
- [ ] **Step 4: 全量门禁 + Commit**

```bash
git commit -m "feat(web-next): editor 模块收编 luban-cad——第一方建模基座落地（用户裁决 2026-10-22）"
```

---

## M4 完成定义（DoD）

1. 编辑器建立 BriefcaseConnection + ScreenViewport，真实栈几何渲染（视口非空）
2. ribbon 在册 full 工具中已注册子集真激活（tools.run 成功无警告）；gated 引导行为不回归
3. 拉伸闭环：拉伸→FeatureDialog→提交→insertFeature extrude 落库→树刷新→几何出现
4. 撤销/重做/保存顶栏（BriefcaseTxns 标准通道）+ Ctrl+Z/Y/S 键盘流
5. 版本历史面板真实 changesets + 保存/推送
6. M3 终审挂账：必办 5 项（T3-③/T5-①/T6-①/SketchDialog ✗ 语义/D4）全收——注：SketchDialog ✗ 语义经查 M4 无草图编辑态路径，**维持挂账至草图链里程碑**（终审口径允许）；波次项 Task 8 全清或显式再登记
7. 全量 vitest + lint + tsc 绿
8. 真实栈冒烟 S4 后半/S6/S7/S8/S9 全 PASS + 浮层探针 8/8

**外部挂账（不阻塞 M4 收口）：** hub allowedHeaders 增 `x-itwin-query-scope`（跨仓 backlog）；access-control 权限判定（M5）；真实草图绘制链（独立里程碑，SketchDialog ✗ 语义随此收口）；core-markup 12 工具依赖；页签缩略图端点（T7-②）；工作区单位制（T7-③，内核里程碑）；多页签并行 briefcase（T7-⑤，后续里程碑）；特征对话框增强（previewOp/formModel/边面引用寻址，随圆角等特征对话框深化）。
