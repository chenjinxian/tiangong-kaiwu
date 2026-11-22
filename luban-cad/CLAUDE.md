# 鲁班CAD（LubanCAD）开发准则

**天工开物平台 AI 生成式 CAD 产品。** 平台架构、开发规范与参考标准以主仓 `docs/` 为准。
**开发规则以主仓 `docs/DEVELOPMENT-RULES.md` 为唯一权威**；本文件只做鲁班CAD领域补充，冲突以总册为准。功能开工前必须完成 AIRR 并遵守接口冻结矩阵。

本文件不记录工作进度、发布日志、测试计数或逐功能状态流水账；能力状态与证据登记在 `../docs/README.md` 索引下的能力账本、ADR/AIRR 与专题文档。

## 本仓必须严格遵守的规则

> 平台总册 + `../docs/architecture/{AIRR-TEMPLATE,INTERFACE-FREEZE-MATRIX,CANONICAL-SOURCES,EXCEPTIONS}.md`。
> 本节是鲁班CAD每个 PR/Agent 操作的硬门禁。

1. **先论证后编码（P0-04）**：新工具/新对话框/FeatureOp 参数/RPC/schema/渲染/选择改动，先写 AIRR（复用矩阵 + 跨仓影响 + 测试/回滚）；新包/新 RPC/schema 迁移/渲染管线必须 ADR。禁止“先写代码再补文档”。
2. **单一编辑管道（P0-05）**：参数化建模只走 `LubanFeatureRpcInterface` FeatureOp；直接编辑只走 `EditTools.startCommand` + `basicManipulationIpc`/`solidModelingIpc`；工具必须继承 iTwin 标准基类并遵循生命周期。旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 已删除，禁止以任何形式复活；禁止自定义事件替代 `onCommitted`/`onModelGeometryChanged`。
3. **草图单一数据源（P0-06）**：草图事实源=`params`（entities+constraints+plane）；禁止再写 native geometry stream；前端 `SketchCurvesDecoration` 只是显示投影；旧库必须走迁移 + 旧数据 fixture。
4. **能力唯一（P1-01）**：一个能力只能有一个工具族/选择权威/预览管道。草图创建唯一族=`Sketch.*`（editor vendored `SketchTools` 不再注册）；选择唯一权威=`store.canvas.selection`，`connection.selectionSet` 仅经 `internal/selection-authority.ts` 单向投影。
5. **可撤销或 HITL（P0-10）**：一切用户/Agent 写操作走 `BriefcaseTxns`/`saveChanges`；不可逆操作必须登记例外并做预览→确认→提交+审计；禁止假成功/静默 no-op。
6. **参考优先（P0-03）**：先查 itwinjs-core/editor/imodel-native 官方实现；Onshape 交互以 live 证据/DOM/截图为准；禁止凭空设计或复制第二套实现。
7. **渲染/UX 纪律（P1-05）**：默认使用 iTwin 渲染器/灯光/材质/视图标志；自定义装饰件只做显示增强，不参与拾取/数据事实；DanQing 是独立渲染项目，未接入 LubanCAD，接入必须 ADR。
8. **测试证据（P1-06）**：触碰 iModel/RPC/schema/工具事务的改动必须有真栈 e2e；jsdom-only 不得宣称完成；bug 修复先写失败测试；性能/视觉改动必须有基线。
9. **构建与契约（P0-02/P0-07/P0-08）**：`link:` 源码消费，按 shared → editor → viewer → web 顺序重建；删除/改名 editor 导出后必须重建 viewer `dist`。shared 契约变更 bump `interfaceVersion` 并双端同发布；公共仓不得出现私有源码/密钥/native 证据。
10. **文档真实（P1-09）**：能力状态、测试基线、UI 对齐记录、`docs/README.md` 索引同 PR 更新；已知红必须登记，不得隐藏或改断言放水。

### 开工/完工门禁

- **开工**：AIRR 批准；复用矩阵覆盖 itwinjs-core/editor/viewer/shared/backend；明确 `toolId`/RPC/数据形态；破坏性操作先 HITL 方案。
- **编码**：标准基类 + 标准 IPC + 标准事务/事件；不绕过工具生命周期自管状态；不新增第二套选择/预览/undo。
- **测试**：单元 + StandaloneDb/契约 + 真栈 e2e；失败路径与回滚必须有测试；禁止只跑 jsdom 宣称完成。
- **文档**：能力账本/接口冻结/例外/文档索引同 PR；禁止硬编码过期测试计数。
- **Agent**：未经明确要求不 commit/push/publish；不伪造证据/状态；破坏性操作 HITL。

## 铁律

1. **复用优先**：工具类功能继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`…）；编辑走 `EditTools.startCommand` + `basicManipulationIpc`；事务走 `BriefcaseTxns`/`saveChanges`（可撤销硬约束）。禁止旧 `LubanRpcInterface` 编辑通道复活。
2. **状态诚实**：能力声明以主仓 `docs/`、能力账本与代码/测试实测为准；未实现/降级/近似必须显式，禁止假 full/假分享/假成功。
3. **AI 工具注册规约**：Agent 复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL（预览→确认→提交）。
4. **品牌与内核**：产品名 鲁班CAD（LubanCAD）；生成物由 **真形（TrueForm）几何内核** 产出（BRep）；约束求解归绳墨。

## 包边界与架构

| 包/目录 | 职责 | 不承担 |
|---|---|---|
| `apps/web` (`@luban-cad/web`) | 产品宿主、路由、模块 UI、状态编排 | 第二套模型/选择/撤销事实源 |
| `packages/viewer` (`@luban-cad/viewer`) | iTwin 启动序列、视图/渲染基座、工具注册、RPC 连接 | 产品业务状态、私有后端实现 |
| `packages/editor/*` (`@itwin/editor-*`) | 第一方建模基座、标准编辑命令/工具 | 应用业务规则 |
| `packages/shared` (`@luban-cad/shared`) | 跨仓契约（FeatureOp/草图/选择 DTO） | 运行时实现、私有平台代码 |
| 私有 `modeling-server` | 打开 briefcase、FeatureService/EDE、几何求值、IPC/RPC | 平台元数据权威、第二套建模 API |
| 私有 `webhook-agent` | webhook 验签/转发、baseline 生成 | 用户编辑会话 |

### 前端结构

- 模块：`src/modules/{authentication,documents,document-details,part-studio,settings}`；官方 iTwin REST 封装在 `src/clients/`。
- Part Studio 五区壳：ribbon/特征树/视口/参数区/状态区；工具与对话框按功能域分目录。
- 选择：唯一权威 `store.canvas.selection`；`connection.selectionSet` 只做单向投影；装配/多文档/多视口必须使用带 document/occurrence 身份的引用，不得把 `ownerBodyKey + topologyId` 当全局唯一。
- 视口：交互渲染唯一底座 iTwin；装饰件（草图曲线/尺寸/拓扑边/预览）只做显示投影，不参与命中/持久化。
- 对话框：同一功能只有一个入口/一个对话框状态机；创建/编辑共用表单；结构键（源特征/轴/面引用）编辑时只读，除非契约支持。
- Undo：用户可见撤销单位=操作组/事务；FeatureOp、原生直改、草图编辑必须统一语义；禁止两套不互通 undo。

### 特征/草图/几何

- 特征参数以 `params` 为事实源；求值只产生派生几何；禁止把同语义数据同时写 params 与 native geometry stream。
- 特征输入/输出必须显式：源特征、草图、面/边引用、目标 body 不得靠 evaluator 读缓存隐式传递；新特征必须声明结构键与输出。
- 拓扑引用：面/边/顶点必须带 body/scope 与持久 id；插入/删除/分裂后引用失效要 fail-closed，不得静默命中错误拓扑。
- 几何内核只提供几何：实例、Mate、BOM、图纸投影、格式转换在服务层，不塞进 `SolidKernel`。
- 质量属性：产品体积/质心/惯量走精确 native 通道或明确标 approx；不得让体积金标依赖渲染公差。

### 预览

- 预览与提交共享同一份 `validateFeatureOp -> plan`；预览只做影子求值，不写事务、不进 OpLog。
- Onshape 对齐规则以 live 证据为准：新增体积预览=半透明灰体，选中草图面域/边=橙色；fillet 预览=真实圆角结果 + 源体透明 + 橙色选边。未采集证据的工具不凭联想实现。

## 开发流程

### 1. 复用优先（最高优先级）

**所有功能开发必须先在 itwinjs-core 中查找是否已有实现或相关接口。**

- 工具类：优先继承 `ElementSetTool`、`PrimitiveTool`、`CopyElementsTool` 等基类。
- 编辑操作：使用 `basicManipulationIpc`/`solidModelingIpc` 标准 IPC。
- 几何计算：使用 `@itwin/core-geometry` 的 `Transform`/`Matrix3d`/`Placement` 等。
- 事务：`BriefcaseConnection.saveChanges()` + `onCommitted`。
- 工具设置：`@itwin/appui-abstract` 的 `DialogProperty`/`supplyToolSettingsProperties()`。
- Undo/Redo：iTwin 内置 `UndoTool`/`RedoTool`，监听 `BriefcaseTxns` 事件。

禁止：已有标准 API 时自造同类实现；绕过工具生命周期自管状态；用自定义事件替代 `onCommitted`。

### 2. 修改 itwinjs-core

- 必须审查、最小修改、完整记录在 `../docs/ITWINJS_CORE_MODIFICATIONS.md`。
- 修改前必须确认无法通过扩展或配置实现目标。
- editor 已收编本仓 `packages/editor/`；fork 内不再维护 editor/。

### 3. 功能不足时的流程

1. 在 itwinjs-core 搜索相关 API 和实现。
2. 查阅 `../docs/iTwin.js-Tools-Complete-Reference.md` 与 `../docs/Architecture.md`。
3. 分析现有功能是否可通过参数或继承满足。
4. 确认无法复用后：分析 → 讨论方案 → 评估跨仓影响 → ADR/AIRR → 实施验证。

### 4. 代码规范

- 组件 PascalCase，Hooks camelCase，类型 PascalCase。
- 工具类必须继承标准基类并遵循生命周期。
- 工具 ID 唯一：`public static override toolId = 'ToolName'`。
- 需要写入时必须实现 `requireWriteableTarget()`。
- 失败必须显式返回错误；禁止空 catch/静默 no-op。

### 5. 工具开发检查清单

- [ ] 是否搜索了 itwinjs-core 中的类似工具？
- [ ] 是否继承了合适的工具基类？
- [ ] 是否使用了标准 IPC 接口？
- [ ] 是否正确处理了事务保存与 undo？
- [ ] 是否遵循了工具生命周期（onInstall/onPostInstall/onCleanup）？
- [ ] 是否正确设置了工具属性（`requireAcceptForSelectionSetOperation`、`wantDynamics` 等）？
- [ ] 是否只有一个选择权威/预览管道/undo 语义？
- [ ] 是否有真栈 e2e、失败路径与回滚证据？

### 6. AI 工具注册规约（AI+CAD 平台）

- Agent 工具必须复用现有 `toolId`（`packages/viewer/src/tools/register-edit-tools.ts` 注册表 + app `Sketch.*`），禁止新建第二套建模 API。
- Agent 操作与人工操作同权，必须走 BriefcaseTxns/saveChanges 事务管道（可撤销）。
- 破坏性操作必须提供 HITL 确认流（预览→确认→提交）。
- FeatureOp 信封目标字段：`opId/userId/baseChangeset` 等幂等/审计信息；批量操作逐项报告结果，禁止整批假成功。

## 快速开始

```bash
# 1. 启动基础设施（本地 iModel 管理平台及其 Postgres/Azurite/Redis，仓外项目，见其自带编排）
# 2. 安装依赖并构建（首次或改动 itwinjs-core 后先 rush build --to …，见根 CLAUDE.md）
cd luban-cad && corepack pnpm@10 install
corepack pnpm@10 --filter @luban-cad/shared run build
corepack pnpm@10 --filter @itwin/editor-common --filter @itwin/editor-backend --filter @itwin/editor-frontend run build
corepack pnpm@10 --filter @luban-cad/viewer run build
cd apps/web && corepack pnpm@10 dev

# 3. 后台服务（源码在仓外私有仓 luban-backend；公开仓走产物分发）：
#    scripts/fetch-backend.ps1 拉 Releases 产物 → scripts/start-ms-host.ps1 -Detach 起 MS :5401
#    webhook-agent 随 docker compose 容器跑 :5402；源码 dev 见私有仓 README
```

访问 http://localhost:5300

## 核心服务

- **modeling-server (:5401)**：打开模型/briefcase、执行编辑建模命令、提供渲染数据（Express + WebSocket RPC/IPC + Briefcase 管理）。
- **webhook-agent (:5402)**：Webhook 验签接收与转发、baseline 生成、CloudSqlite 上传。

两服务源码均在仓外私有仓 `luban-backend`（产物经 GHCR 镜像 + GitHub Releases 分发，`scripts/fetch-backend.ps1` 拉取）；本仓只消费产物。

## 调试

```powershell
# MS 宿主日志（start-ms-host.ps1 启动时写入）
Get-Content "$env:TEMP\luban-cad-modeling-server.log" -Tail 100 -Wait
```

- e2e 前置：真实栈、会话注入登录、workers=1、按名引用种子库；MS 限流 100 req/15min；运行 e2e/演示期间不要改 `src/**`（Vite HMR 会整页 reload）。
- 组件/工具失败先查：是否是第二套状态、是否绕过标准生命周期、是否是陈旧构建产物（shared/editor/viewer `dist`）。

## 文档

| 文档 | 说明 |
|---|---|
| `../docs/DEVELOPMENT-RULES.md` | 平台开发规则唯一权威（P0/P1） |
| `../docs/architecture/AIRR-TEMPLATE.md` | 功能开工 AIRR 模板 |
| `../docs/architecture/INTERFACE-FREEZE-MATRIX.md` | 接口冻结矩阵 |
| `../docs/architecture/EXCEPTIONS.md` | 例外与债务 |
| `../docs/Architecture.md` | 系统架构 |
| `../docs/ROADMAP.md` | 演进路线 |
| `../docs/ITWINJS_CORE_MODIFICATIONS.md` | 上游修改记录 |
| `../docs/README.md` | 文档总索引 |
| `../docs/research/lubancad-architecture-assessment/08-ARCHITECTURE-EXTENSIBILITY.md` | 可演进性接缝 |
| `../docs/research/lubancad-architecture-assessment/09-INDUSTRIAL-TARGET-ARCHITECTURE.md` | 工业级目标架构 |
| `../docs/research/lubancad-architecture-assessment/10-ARCHITECTURE-HARDENING-PLAN.md` | 架构冻结/开发 Gate |
