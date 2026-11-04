# 鲁班CAD（LubanCAD）开发准则

**天工开物平台 AI 生成式 CAD 产品。** 平台文档与当前结构以主仓 `docs/` 为准。
**开发规则以主仓 `docs/DEVELOPMENT-RULES.md` 为唯一权威**；本文件只做鲁班CAD领域补充，
冲突以总册为准。功能开工前必须完成 AIRR 并遵守接口冻结矩阵。

## 本仓必须严格遵守的规则（按违反频率排序）

> 平台总册 + `docs/architecture/{AIRR-TEMPLATE,INTERFACE-FREEZE-MATRIX,CANONICAL-SOURCES,EXCEPTIONS}.md`。
> 本节是鲁班CAD每个 PR/Agent 操作的硬门禁。

1. **先论证后编码（P0-04）**：新工具/新对话框/FeatureOp 参数/RPC/schema/渲染/选择改动，先写 AIRR（复用矩阵 + 跨仓影响 + 测试/回滚）；新包/新 RPC/schema 迁移/渲染管线必须 ADR。禁止“先写代码再补文档”。
2. **单一编辑管道（P0-05）**：参数化建模只走 `LubanFeatureRpcInterface` FeatureOp；直接编辑只走 `EditTools.startCommand` + `basicManipulationIpc`/`solidModelingIpc`；工具必须继承 iTwin 标准基类并遵循生命周期。**旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 已删除，禁止以任何形式复活**；禁止自定义事件替代 `onCommitted`/`onModelGeometryChanged`。
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
- **编码**：标准工具基类 + 标准 IPC + 标准事务；禁止绕过 ToolAdmin/工具生命周期；新增能力前先删除/冻结旧路径。
- **测试**：受影响包单测 + `apps/web` 真栈 e2e；涉及共享契约/后端行为必须真栈；视觉改动跑视觉钉版。
- **完工**：接口冻结矩阵/例外/能力状态/文档索引同 PR；记录 known-red；发布按 `scripts/rebuild-web.ps1` + `verify-stack.ps1`。

## 铁律

1. **复用优先**：工具类功能继承 iTwin.js 标准基类（`ElementSetTool`/`PrimitiveTool`/`CopyElementsTool`…）；编辑走 `EditTools.startCommand` + `basicManipulationIpc`；事务走 `BriefcaseTxns`/`saveChanges`（可撤销硬约束）。**禁止**旧 `LubanRpcInterface.startEditCommand/callEditMethod/finishEditCommand` 通道（2026-11-04 已删除，shared 1.1.0）
2. **状态诚实**：能力声明带标记 ✅/🟠/⚪/❌，以主仓 `docs/` 与代码/测试实测为锚
3. **AI 工具注册规约**：Agent 复用现有 `toolId`，禁止第二套建模 API；破坏性操作走 HITL（预览→确认→提交）
4. **品牌**：产品名 鲁班CAD（LubanCAD）；生成物由 **真形（TrueForm）几何内核** 产出（BRep）；约束求解归绳墨

## 功能状态

> **路径口径（2026-10-29 收敛）**：正选前端 = `apps/web/`（包名 `@luban-cad/web`，模块在 `src/modules/*`）；基座包 `packages/viewer`（`@luban-cad/viewer`）+ `packages/editor`（第一方建模基座）。历史结构变更见 `../docs/MIGRATION-2026-10-29.md`（根 docs）。

| 模块 | 路径 | 状态 |
|------|------|------|
| Auth | `apps/web/src/modules/authentication/` | ✅ JWT 认证 |
| iTwin | `apps/web/src/modules/documents/`（项目管理与文档中心同页） | ✅ 项目管理 |
| iModel | `apps/web/src/modules/documents/` + `document-details/` | ✅ 模型管理 |
| Editor | `apps/web/src/modules/part-studio/`（编辑器页：ribbon/特征树/参数面板/状态栏五区）+ 基座包 `packages/viewer`（iTwin 启动序列/RPC）+ `packages/editor/frontend`（第一方建模基座，2026-10-22 收编） | ✅ 3D 编辑器；参数化特征 UX ✅（M3-a：特征树/参数面板/圆角/抑制/排序 op（v1 线性链无非恒等合法重排，守卫拒收口径）/预览反馈徽标）；✅ 特征实时预览（2026-11-02：extrude/revolve 参数 → 画布半透明 ghost，随相机重绘，透明度滑杆驱动；fillet 结果走 TileRpc 动态 iMdl 实心结果 + 源体透明 + 橙色 x-ray 选边；提交仍走真实内核）；草图模式 UX ✅（M3-b：俯视/栅格/提示+特征树联动入口）；✅ **Onshape 统一选择**（2026-11-03：默认工具常驻，无模式；悬停 顶点>边>面、单击替换/Ctrl 切换/空白清除、整零件走零件列表/右键；跨 body owner 持久 ref；undo/redo 后按 store 快照恢复高亮；面命中因原生 Face locate 卡死 MS 改用 `getClosestPoint` 兜底）；✅ **iTwin 默认渲染基线**（2026-11-03：core 默认灯光/材质 + 白底 + BRep 全拓扑边 + AO 关 + MSAA 4）；✅ Onshape UI 对齐（2026-11-02：ViewCube/显示设置下拉/默认几何图元树+视口批注；详见 `../docs/UI-ONSHAPE-PARITY-2026-11-02.md`）；✅ 完整 BRep 拓扑边/顶点叠加（不修改 iTwin 渲染器/shader；详见 `../docs/BREP-RENDERING-2026-11-03.md`）；editor 基座两处修复：cleanup 幂等 `finishCommand`、`wantGeometry` 按需读取；✅ **X-01/X-02/X-03 第一轮债务清理（2026-11-04）**：旧编辑 RPC 删除、草图工具唯一族 `Sketch.*`、`store.canvas.selection` 单一权威 + `internal/selection-authority.ts` 唯一 SelectionSet 投影 |
| Sketch | `apps/web/src/modules/part-studio/tools/sketch/` | ✅ 草图编辑（M3-b：线/矩形/圆绘制+约束/尺寸工具链+DOF/矛盾面板+先试算后提交）；✅ 2026-11-02 进入草图按 SketchPlane frame 相机定向/实体范围取景，退出恢复；✅ 画布常驻长度/距离/半径尺寸标注 + 绘制中光标旁实时读数/阶段提示；✅ 2026-11-04 草图唯一数据源=params（entities+plane；后端不再写 native geometry stream，求值直接读 params；旧库首开迁移清空几何流，前端 SketchCurvesDecoration 是唯一显示源）；✅ 2026-11-04 草图工具唯一族=`Sketch.*`（editor vendored SketchTools 六件不再注册） |
| Modeling | `apps/web/src/modules/part-studio/tools/modeling/` + `packages/viewer/src/tools/register-edit-tools.ts` | 🟠 实体建模（阵列/MirrorElements 走标准 `basicManipulationIpc` 直改通道；CreateHole/DraftFaces 死工具已删，能力翻 gated）；参数化特征系统 ✅（M3-a：圆角/抑制/排序 op（v1 线性链无非恒等合法重排，守卫拒收口径）/预览 op——后端在私有仓 luban-backend FeatureService） |
| Markup | —（无模块；工具未注册） | ❌ 降级占位（`@itwin/core-markup` 依赖未配置——启用前需先补 workspace 依赖解析，T2.3 裁决：不预引依赖，等真实需求） |
| Measurement | `packages/viewer/src/tools/register-edit-tools.ts`（注册 core-frontend 测量工具） | ✅ 测量工具 |
| View Clip | `packages/viewer/src/tools/register-edit-tools.ts`（注册 core-frontend 裁剪工具） | ✅ 视图裁剪 |
| AccuDraw | `packages/viewer/src/tools/sketch-accu-snap.ts` + core-frontend AccuDraw | ✅ 精确绘图 |
| Version Control | `apps/web/src/modules/part-studio/hooks/useChangesets.ts` + `dialogs/PushChangesetDialog.tsx` | 🟠 Changeset/Named Version 可用；冲突检测 🟠（mock 数据）、冲突解决 ⚪（no-op 标记） |
| **Pattern (阵列)** | `packages/viewer/src/tools/register-edit-tools.ts`（LinearPattern/CircularPattern 注册；`basicManipulationIpc.insertGeometricElement` 直改通道） | ✅ 线性/圆形阵列（ID 收集 bug 已修+回归测试，RW2-T3） |

完整能力矩阵以上表与代码/测试实测为准（状态标记：✅/🟠/⚪/❌）

## 阵列工具 (Pattern Tools)

基于 `CopyElementsTool` 扩展实现，支持参数化输入和即时执行。

### 实现要点
- 继承 `CopyElementsTool` 复用元素复制和事务管理
- 覆盖 `requireAcceptForSelectionSetOperation = false` 实现选择后立即执行
- 覆盖 `wantDynamics = false` 禁用跟随光标的动态效果
- 使用 `BriefcaseTxns.onCommitted` 事件通知推送按钮状态更新
- 工具执行完成后自动退出 (`exitTool()`)

## 快速开始

```bash
# 1. 启动基础设施（本地 iModel 管理平台及其 Postgres/Azurite/Redis，仓外项目，见其自带编排）
# 2. 安装依赖并构建（首次或改动 itwinjs-core 后先跑 rush build --to …，见根 CLAUDE.md；
#    全新检出还需先构建 workspace 基座包——见 apps/web/README.md「先 build 后 dev」）
cd luban-cad && corepack pnpm@10 install
corepack pnpm@10 --filter @luban-cad/shared run build
corepack pnpm@10 --filter @itwin/editor-common --filter @itwin/editor-backend --filter @itwin/editor-frontend run build
corepack pnpm@10 --filter @luban-cad/viewer run build
cd apps/web && corepack pnpm@10 dev          # 前端 dev :5300（栈内部署经 nginx :5301）

# 3. 后台服务（源码在**仓外私有仓 luban-backend**，公开仓不检出也能跑：
#    公开仓走产物分发——scripts/fetch-backend.ps1 拉 Releases 产物后
#    scripts/start-ms-host.ps1 -Detach 起 MS :5401；webhook-agent 随
#    docker compose 容器跑 :5402。源码 dev 见该私有仓 README）
```

访问 http://localhost:5300

## 核心服务

- **modeling-server (5401)**：图形建模后台——打开模型文件、执行编辑建模命令、供渲染数据（Express + WebSocket RPC/IPC + Briefcase 管理）
- **webhook-agent (5402)**：Webhook 验签接收与转发、baseline 生成、CloudSqlite 上传

> 两服务源码均在**仓外私有仓 luban-backend**（产物经公开仓 GHCR 镜像 + GitHub Releases 分发，`scripts/fetch-backend.ps1` 拉取）；本仓只消费产物。

## 开发准则（强制）

### 1. 复用优先原则（最高优先级）

**所有功能开发必须先在 itwinjs-core 中查找是否已有实现或相关接口。**

- **工具类功能**：优先继承 `ElementSetTool`、`PrimitiveTool`、`CopyElementsTool` 等基类，而非从头实现
- **编辑操作**：使用 `basicManipulationIpc` 提供的标准 IPC 接口
- **几何计算**：使用 `@itwin/core-geometry` 提供的 `Transform`, `Matrix3d`, `Placement` 等类
- **事务管理**：使用 `BriefcaseConnection.saveChanges()` 和 `onCommitted` 事件
- **工具设置**：使用 `@itwin/appui-abstract` 的 `DialogProperty` 和 `supplyToolSettingsProperties()`
- **Undo/Redo**：使用 iTwin.js 内置的 `UndoTool`/`RedoTool`，监听 `BriefcaseTxns` 事件

**禁止事项**：
- 禁止在已有标准 API 的情况下自定义实现类似功能
- 禁止绕过 iTwin.js 工具生命周期自行管理工具状态
- 禁止使用自定义事件替代 iTwin.js 标准事件（如 `onCommitted`）

### 2. 修改 itwinjs-core
- 必须审查、最小修改、完整记录在 `docs/ITWINJS_CORE_MODIFICATIONS.md`（仓库根 docs/）
- 修改前必须确认无法通过扩展或配置实现目标

### 3. 功能不足时的流程
- 在 itwinjs-core 中搜索相关 API 和实现
- 查阅 `docs/iTwin.js-Tools-Complete-Reference.md`（仓库根 docs/）
- 分析现有功能是否可通过参数或继承满足需求
- 确认无法复用后，提出分析 → 讨论方案 → 评估影响 → 文档化 → 实施验证

### 4. 代码规范
- 组件: PascalCase, Hooks: camelCase, 类型: PascalCase
- 工具类必须继承标准基类，遵循其生命周期
- 工具 ID 必须唯一，使用 `public static override toolId = 'ToolName'`
- 必须实现 `requireWriteableTarget()` 当工具需要写入权限

### 5. 工具开发检查清单
- [ ] 是否搜索了 itwinjs-core 中的类似工具？
- [ ] 是否继承了合适的工具基类？
- [ ] 是否使用了标准 IPC 接口？
- [ ] 是否正确处理了事务保存？
- [ ] 是否遵循了工具生命周期（onInstall/onPostInstall/onCleanup）？
- [ ] 是否正确设置了工具属性（requireAcceptForSelectionSetOperation, wantDynamics 等）？

### 6. AI 工具注册规约（AI+CAD 平台）
- Agent 工具必须复用现有 `toolId`（`packages/viewer/src/tools/register-edit-tools.ts` 注册表 + app `Sketch.*`），禁止新建第二套建模 API
- Agent 操作与人工操作同权，必须走 BriefcaseTxns/saveChanges 事务管道（可撤销）
- 破坏性操作必须提供 HITL 确认流（预览→确认→提交）
- 架构规约见本节与 `../docs/Architecture.md`

## 文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 项目介绍 |
| [docs/DEVELOPMENT-RULES.md](../docs/DEVELOPMENT-RULES.md) | 平台开发规则唯一权威（P0/P1） |
| [docs/architecture/AIRR-TEMPLATE.md](../docs/architecture/AIRR-TEMPLATE.md) | 功能开工 AIRR 模板 |
| [docs/architecture/INTERFACE-FREEZE-MATRIX.md](../docs/architecture/INTERFACE-FREEZE-MATRIX.md) | 接口冻结矩阵 |
| [docs/architecture/EXCEPTIONS.md](../docs/architecture/EXCEPTIONS.md) | 例外与债务 |
| [docs/Architecture.md](../docs/Architecture.md) | 系统架构 |
| [docs/ROADMAP.md](../docs/ROADMAP.md) | 演进路线 |
| [docs/ITWINJS_CORE_MODIFICATIONS.md](../docs/ITWINJS_CORE_MODIFICATIONS.md) | 上游修改记录 |
| [docs/README.md](../docs/README.md) | 文档总索引 |

## 调试

```powershell
# MS 宿主日志（start-ms-host.ps1 启动时写入）
Get-Content "$env:TEMP\luban-cad-modeling-server.log" -Tail 100 -Wait
```

## 验证基线（2026-11-04）

- `apps/web` 全量 vitest：1334/1334；shared 152、editor 29、viewer 127；四包 `tsc`/lint 绿。
- shared 1.26.0：ADR-0004（construction/diameter/concentric/driven/整圆相切/angle）
  + ADR-0005 Phase 2（revolve new、extrude secondDirection）
  + ADR-0006 切片 A（hole，backend/contract only）。
- 后端 sketch：89/89（含 angle 60° 收敛、line+circle tangent、diameter/concentric）；
  hole 流程 3/3（throughAll 4000−40π、blind 多孔、pointIds 精确选位）。
- 真栈回归（shared 1.26.0 实测）：`tutorial2.spec.ts` **2 passed（4.0 min）**，
  体积与 1.22.0 基线完全一致（无圆角 358.161、终体积 357.739、去材 0.422 cm³）；
  shared 1.24 合并 strict+tools **8 passed（8.2 min）**，tools 含圆直径+共圆相切 UI 链。
- web 全量 1334/1334；shared 153/153。
- 真栈：`newbody`（选择/删除/undo/redo）、`part-studio`（五区/ribbon 激活）通过。
- **known-red**：`sketch-extrude` 仍红（草图无拉链面域）。`tutorial2` X-14 已于 2026-11-04 关闭：`tutorial2.spec.ts` 2 passed（setup+strict，3.8 min；六特征 status 0，无圆角 358.161 cm³、终 357.739 cm³、去材 0.422 cm³），证据 `apps/web/test-results/t2-strict-after.log`。不得把 known-red 当绿，也不得通过放宽断言“修复”。

*最后更新: 2026-11-04（平台 P0/P1 门禁 + X-01/X-02/X-03 单一管道/草图/选择规则；验证基线）*
