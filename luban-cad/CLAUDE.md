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
| Editor | `apps/web/src/modules/part-studio/`（编辑器页：ribbon/特征树/参数面板/状态栏五区）+ 基座包 `packages/viewer`（iTwin 启动序列/RPC）+ `packages/editor/frontend`（第一方建模基座，2026-10-22 收编） | ✅ 3D 编辑器；参数化特征 UX ✅（M3-a：特征树/参数面板/圆角/抑制/排序 op（v1 线性链无非恒等合法重排，守卫拒收口径）/预览反馈徽标）；✅ 特征实时预览（2026-11-02：extrude/revolve 参数 → 画布半透明 ghost，随相机重绘，透明度滑杆驱动；fillet 结果走 TileRpc 动态 iMdl 实心结果 + 源体透明 + 橙色 x-ray 选边；提交仍走真实内核）；草图模式 UX ✅（M3-b：俯视/栅格/提示+特征树联动入口）；✅ **Onshape 统一选择**（2026-11-03：默认工具常驻，无模式；悬停 顶点>边>面、单击替换/Ctrl 切换/空白清除、整零件走零件列表/右键；跨 body owner 持久 ref；undo/redo 后按 store 快照恢复高亮；面命中因原生 Face locate 卡死 MS 改用 `getClosestPoint` 兜底）；✅ **iTwin 默认渲染基线**（2026-11-03：core 默认灯光/材质 + 白底 + BRep 全拓扑边 + AO 关 + MSAA 4）；✅ Onshape UI 对齐（2026-11-02：ViewCube/显示设置下拉/默认几何图元树+视口批注；2026-11-05 追加：工具栏下拉 180px/父行+快捷键、ViewCube 逐像素复核 + 交互对齐（面边 58px/屏幕直立标签/三色轴/trigger 44.25×28/Home 仅自由视角/隐藏面轮廓带/角点蓝点/罗盘弧 hover/180ms 相机动画/无拖拽）+完整菜单、左侧「图形首选项」对话框、右侧「外观」面板 + 逐 body 颜色覆盖；详见 `../docs/UI-ONSHAPE-PARITY-2026-11-02.md`）；✅ **官方 iTwin ViewCube 默认**（2026-11-05 用户裁决手感更好：默认官方 `CubeNavigationAid`，`?viewcube=onshape` 回退自研；相机/渲染菜单抽成唯一 `ViewCubeCameraMenu` 挂官方 cube 下方；菜单相机改 `setRotationAboutPoint` 修正交 target 甩飞；宿主修背面命中/箭头可见性/1.5×；事件桥+400ms 跟踪；真栈 itwin 2 passed/ui-parity 2/tutorial2 2）；✅ 完整 BRep 拓扑边/顶点叠加（不修改 iTwin 渲染器/shader；详见 `../docs/BREP-RENDERING-2026-11-03.md`）；editor 基座两处修复：cleanup 幂等 `finishCommand`、`wantGeometry` 按需读取；✅ **X-01/X-02/X-03 第一轮债务清理（2026-11-04）**：旧编辑 RPC 删除、草图工具唯一族 `Sketch.*`、`store.canvas.selection` 单一权威 + `internal/selection-authority.ts` 唯一 SelectionSet 投影 |
| Sketch | `apps/web/src/modules/part-studio/tools/sketch/` | ✅ 草图编辑（M3-b：线/矩形/圆绘制+约束/尺寸工具链+DOF/矛盾面板+先试算后提交）；✅ 2026-11-02 进入草图按 SketchPlane frame 相机定向/实体范围取景，退出恢复；✅ 画布常驻长度/距离/半径尺寸标注 + 绘制中光标旁实时读数/阶段提示；✅ 2026-11-04 草图唯一数据源=params（entities+plane；后端不再写 native geometry stream，求值直接读 params；旧库首开迁移清空几何流，前端 SketchCurvesDecoration 是唯一显示源）；✅ 2026-11-04 草图工具唯一族=`Sketch.*`（editor vendored SketchTools 六件不再注册） |
| Modeling | `apps/web/src/modules/part-studio/tools/modeling/` + `packages/viewer/src/tools/register-edit-tools.ts` | 🟠 实体建模（阵列/MirrorElements 走标准 `basicManipulationIpc` 直改通道；DraftFaces 死工具已删、能力 gated）；参数化特征系统 ✅（M3-a：圆角/抑制/排序 op（v1 线性链无非恒等合法重排，守卫拒收口径）/预览 op——后端在私有仓 luban-backend FeatureService）；✅ 孔（ADR-0006 切片 A/A2/A3，2026-11-05：`HoleDialog` 草图点 + 曲线顶点（线/弧端点、圆心）/孔径/blind/throughAll/沉头孔；shared 1.28.0；真栈简单孔去材 196.349 vs 196.350 mm³、沉头孔 373.064 mm³ 精确；shared 1.32.0 起倒角孔/countersink 启用——锥台 Loft 切除 + HoleDialog 直径/角度，真栈去材 261.794 vs 261.799 mm³；螺纹页签仍禁用）；✅ 倒角 UI（2026-11-05，能力补齐 Slice 1/1b：ribbon「倒角」→ 复用 fillet 视口拾边/owner；类型与字段按 Onshape live 副本对齐「等距离/两个距离/距离和角度」「距离/角度」，等距离/两个距离 `mode=2`、距离和角度 `mode=3`；编辑回显 values1/values2；iOS 3 条 CAP_EDGE 达 Onshape 目标体积、Hand Brake 边 1 mm 精确、Sample Assignment 4 竖边 1.524 mm@45° 精确）；✅ 抽壳 UI（T3，2026-11-06：`ShellDialog` 移除面 + 壁厚 + 内/外方向 + 后端影子预览；面快照在 ribbon 路由时捕获，`ShellParams` 零变更；真栈盒体 1084.000 mm³、undo/redo、双击编辑 1952 mm³、push+重开；Hollow/逐面差异壁厚未支持）；✅ 拉伸第二方向（T4 切片，2026-11-06：`ExtrudeParams.secondDirection` 契约已有，FeatureDialog「第二个方向」复选 + 深度/终止条件 + 编辑回显 + 预览包络；converter 映射 BLIND/THROUGH_ALL；真栈 20×20 拉伸 10+5=6000.000 mm³、push+重开）；✅ 旋转多面域（T4，2026-11-06，shared 1.30.0：`RevolveParams.regions` + 后端逐域 spin/Unite；FeatureDialog revolve 复用 extrude 的视口多选 chips；真栈两互斥环柱 2500π=7853.981 mm³、真实 Hand Brake 7125.270 vs 7125.274）；🟠 基准面 cPlane（ADR-0006 切片 B1，shared 1.29.0，2026-11-05：`CPlaneDialog` 图元/偏移/偏移距离/反转法线；SketchDialog 可选 cPlane 并落平面快照 + `sourceFeatureId`；被草图引用时改参/删除诚实拒收；shared 1.31.0 B2a 增「平面点」世界原点（与 offsetMm 互斥），Handle 真实示例真栈；任意面/边参考、视口平面渲染与改参传播归 B2b）；🟠 faceExtrude 首切片（ADR-0006 切片 D，shared 1.33.0，2026-11-06：持久 `faceRef` → 平面面轮廓沿法向扫掠 + 布尔/孔洞；真栈合成盒体 add 1 mm = **48.000 mm³**、push+重开；**同日纠正：Onshape imprintFace 是草图面/材料面域（根 `<sketchId>.imprint`），不走 faceExtrude——回放改为侧向草图面域（−1 环外/+1 环内），iOS 真栈 157478.901 mm³；faceExtrude 仅保留显式实体面能力，无 converter 映射/UI，published artifact 仍 1.32**）；🟠 featurePattern 首切片（ADR-0007，shared 1.34.0，2026-11-07：FEATURE pattern 以源特征前/后缓存差集为 delta，任意轴线段 linear/circular 变换后按源操作 Unite/Subtract；源限 extrude/revolve/hole add/remove；真栈凸台 3 实例 **16240.000 mm³** push+重开；converter 映射/UI 未接，published artifact 仍 1.32） |
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

## 验证基线（2026-11-07）

- `apps/web` 全量 vitest：**1389/1389**（2026-11-06 图形首选项默认值校正：AO 20%、
  线宽 2px、v2→v3 迁移 +2；2026-11-05 UI polish：GraphicsPreferencesDialog 5、
  AppearancesPanel 3、useBodyAppearanceOverrides 2、Ribbon 父行/快捷键 1、ViewCube
  标准视图/自由视角 1、Front 面轴原点 1、动画相机 1、viewcube-mode 5；ViewCube/Dock/display-actions
  断言同步更新；此前 cPlane +17、SketchDialog 偏移平面编辑、FeatureDialog endBound、
  chamfer 三种模式/编辑回显；FeatureDialog 单文件 135）；
  shared **160**、editor 29、viewer 127；`tsc`（含 e2e）/lint 绿。
- T11 shell 转换/面选择器（2026-11-07，test-only）：converter 输出 shell；replay
  解析 revolve SWEPT_FACE 端面（线⟂轴、前序圆角容差）→ resolveFaceRef → ShellParams。
  合成真栈 `e2e/examples/shell-face.spec.ts` **2 passed**——实心圆柱移顶面 + 内缩
  2 mm = 开口杯 **1533.097 mm³**，push/重开。Gaiter 真实例 blocked-kernel：
  Fillet 1（8 条整圆边）后 body 零体积（status=0 / mass=0），spec fixme 待内核修复。
- shared 1.34.0：featurePattern FEATURE 阵列（ADR-0007 首切片；sourceFeatureId +
  count/spacing?/angle? + 任意轴线段；源限 extrude/revolve/hole add/remove，差集 delta）。
  后端 `FeaturePatternFlow` **4/4**（线性 8.75 mm³、偏轴圆周 12 mm³、校验矩阵）、
  registry/RPC **46/46**；真栈 `e2e/examples/feature-pattern.spec.ts` **2 passed**
  （40×40×10 盒 + 凸台 3 实例 = **16240.000 mm³**，push+重开）；converter 映射/UI
  未接，published artifact 仍 1.32。
- shared 1.33.0：faceExtrude/imprint 纠正（ADR-0006 切片 D；iOS 侧向面域真栈
  157478.901 mm³；合成面拉伸 48.000 mm³）。shared 1.34 前的 1.33 切片未发布。
- shared 1.32.0：hole 倒角孔/countersink（ADR-0006 切片 A4；`countersinkDiameterMm`
  + `countersinkAngleDeg` 包含角，与 counterbore 参数互斥）；后端锥台 Loft 切除，
  HoleDialog 启用「倒角孔」页签；后端 `HoleFlow` **6/6**、web HoleDialog **7/7**、
  真栈 `e2e/hole.spec.ts --grep 倒角孔` **2 passed**（去材 261.794 vs 261.799 mm³）。
- shared 1.31.0：`CPlaneParams.origin` 平面点（ADR-0006 B2a；世界参考法线 + 自定义
  世界原点，与 offsetMm 互斥）；真栈 `e2e/cplane-point.spec.ts` **2 passed**
  （平面点 (1,2,3) → 草图 → 拉伸 4000 mm³，push+重开）。
- shared 1.30.0：`RevolveParams.regions` 多面域旋转（ADR-0005 Phase 3；旧
  `regionIndex` 简写 deprecated 兼容）；shared 159/159。
- shared 1.29.0：ADR-0004（construction/diameter/concentric/driven/整圆相切/angle）
  + ADR-0005 Phase 2（revolve new、extrude secondDirection）
  + ADR-0006 切片 A/A2/A3（hole：backend/contract/UI + 顶点孔位 + 沉头孔 + `e2e/hole.spec.ts` 3 passed）
  + 切片 B1（cPlane：三基准面/偏移/反转法线 + SketchPlaneDto.sourceFeatureId）。
- 后端 sketch：`src/sketch` **92/92**（含 point-on-line coincident v1.31、点+原点 H/V、CENTERLINE_DIMENSION→distance、
  angle 60° 收敛、line+circle tangent、diameter/concentric）；回放
  Tutorial2/iOS/Basic/Postman/Corpus/Fillet/SketchFlow/SketchOps **31/31**；
  hole 流程 6/6（throughAll 4000−40π、blind 多孔、pointIds 精确选位、v1.27 顶点孔位、v1.28 沉头孔 4000−76π、v1.32 倒角孔 4000−152π/3）；
  cPlane 流程 **3/3**（体后插入不改体积；被引用改参/删除拒收、解除后可改删；首特征 +
  草图 + 拉伸 4000 mm³；v1.31 平面点 origin 落库/草图快照 + origin/offset 互斥拒收）；
  `ScenarioReplayCorpus` 3/3（Basic/Warning Label/MateConnectors 建链 + synthetic vertexRefs 体积对拍）；
  **后端全量 88 files / 754 passed / 8 skipped**（2026-11-06，shared 1.32 实测；
  含 point-on-line 与多面域 revolve）。
- 真栈回归（shared 1.28.0 实测）：`tutorial2.spec.ts` **2 passed（4.1 min）**，
  体积与 1.22.0 基线完全一致（无圆角 358.161、终体积 357.739、去材 0.422 cm³）；
  shared 1.24 合并 strict+tools **8 passed（8.2 min）**，tools 含圆直径+共圆相切 UI 链。
- 示例复刻：Tutorial 2、iOS（157.4789 vs 157.4789 cm³，**0.00%**）、
  Exercise: Basic Drawing（2442.2935 vs 2442.2938，-0.00%）、Postman（2.6705 vs 2.6866 cm³，-0.60%）。
- 示例 iModel 分步演示（hub 持久化 + 重开验证）：Tutorial 2、Tutorial 2 - Build Your First
  Part - iOS、Exercise: Basic Drawing、Postman、WARNING LABEL - Bench Vise、
  Exercise - Creating Mate Connectors、Intro to CAD 1.2-1.4、Exercise - Hand Brake Update、
  Sample Assignment（Alignment Plate），
  外加 WARNING LABEL 同几何文档族 3 个 Quickstart 文档与 Top, Ring, Key（各自独立
  iModel，共 13 个 iModel）；演示页 `apps/web/demo-artifacts/examples/`，runner
  `apps/web/e2e/examples/`。
  Postman/警告标签/Mate Connectors/Intro 的草图步骤为采集数据经 RPC 精确复原（页面明确标注），
  特征步骤走真实 UI；Mate Connectors 圆头槽按精确切点弧+切线重建（面域引擎尚不合并重叠闭环）。
  Intro to CAD（cPlane 版，当前 iModel `bb8efb7b-5a07-4eb9-b36a-e0f8a7dfcaaf`，与
  `demo-artifacts/examples/state.json` 同源）：
  UI 建 Plane 1（Front 偏移 −20、反转法线）+ SketchDialog 选 Plane 1 建壳，
  树 `sketch → extrude → cPlane → sketch`，体积 85157.341 mm³；演示截图 001–010。
  重开回归 `e2e/examples/verify-imodels.spec.ts`：**13/13 passed**（逐库特征树 + 体积；
  2026-11-06 用**全新 briefcase cache** 冷开验证，含 Tutorial 2 iOS、Hand Brake、
  Sample Assignment（canonical 场景库 `f52752cb`）、Top, Ring, Key（`09ea16a9`，
  2998.1418 vs 2998.1430 mm³）与 Intro to CAD cPlane 版本）。冷开依赖 hub 的
  `currentOrPrecedingCheckpoint` 回退与 changesets `$orderBy` 支持（2026-11-06 修复；
  公开 GHCR hub 镜像尚未更新时外部冷开会失败）。
  Tutorial 2 iOS 的倒角按 Onshape CAP_EDGE 语义拾取 3 条边（+y/−y 端盖分别取景），
  终体积 157478.900 mm³ 与目标一致；Hand Brake 左端圆边 1 mm 精确；
  Sample Assignment 4 草图 RPC + 4 次 UI 拉伸 + 4 竖边距离-角度倒角，体积 8915.860 mm³（0.00%）。
- 真栈：`newbody`（选择/删除/undo/redo）、`part-studio`（五区/ribbon 激活）、`hole`
  （简单孔 + 沉头孔，树 `sketch/extrude/hole` 全 status=0，去材误差 <0.001%）通过。
- T3 Shell UI（2026-11-06）：`e2e/shell.spec.ts` setup+test **2 passed**——盒体
  20×20×10 顶面移除 1 mm 内缩 **1084.000 mm³**（解析期望同值），undo/redo、
  双击编辑 2 mm（1952 mm³）、push + 重开一致；`ShellDialog.test.tsx` 5/5。
- T4 拉伸第二方向（2026-11-06）：`e2e/extrude-second-direction.spec.ts`
  setup+test **2 passed**——20×20 矩形拉伸 10 + 第二方向 5 = **6000.000 mm³**；
  FeatureDialog/feature-preview/翻译器单测同批。
- T4 旋转多面域（2026-11-06，shared 1.30.0）：`e2e/revolve-multi-region.spec.ts`
  setup+test **2 passed**——视口点选 2 个互斥环柱面域 + 轴，体积 **7853.981 mm³**
  （2500π），push+重开；FeatureDialog 137/137（含多面域编辑回显）。
  真实 Hand Brake：`e2e/examples/hand-brake-scenario.spec.ts` setup+test **2 passed**——
  sketch + revolve regions [0,1] + SWEPT_EDGE 1 mm 倒角，**7125.270 mm³** vs 采集
  7125.274；首版单 region 0 为 5358.127（−24.8%，根因即单面域契约）。
  converter 多 query 仅给面积降序前缀（regionRisk），真实面域选择在 spec 中审计。
- T4b Handle 真实示例（2026-11-06，Exercise: Hand Brake Update / Handle）：
  `e2e/examples/handle-scenario.spec.ts` setup+test **2 passed**——12 特征
  （PLANE_POINT、secondDirection 10+120、2 个多体 remove、3 点沉头孔、fillet 30）
  全 status=0；逐体 **38314.220 / 68563.590** vs 采集 **38314.765 / 68563.589**
  （总 106877.810 vs 106878.354，**0.0005%**），push+重开一致。converter 新增
  PLANE_POINT/草图 `planeSourceFeatureId`/booleanScope featureId 提取；修正
  `secondDirectionOppositeDirection=true → 反侧`（旧映射把 130 压成 120）；runner
  增加 body 谱系回溯、regionRisk 越界面域收敛 note、按目标质心侧定孔方向；
  后端 `CPlaneScenarioReplay` 1/1；translator 17/17。约束 refs 仍
  `constraints=dropped`，不宣称约束树完整。
- T5 mirror 首切片（2026-11-06）：`e2e/examples/mirror.spec.ts` setup+test
  **2 passed**——偏置盒体 YZ 世界平面整件镜像 **8000.000 mm³**（2×4000），
  push+重开一致；converter 仅映射 PART / fullFeaturePattern=true，局部镜像如实
  dropped。
- T2 边选择器（2026-11-06）：`e2e/examples/edge-selector.spec.ts` setup+test **2 passed**
  （合成圆盘 CAP_EDGE 倒角 770.737 mm³ = 解析期望；iOS First Part 3 条 CAP_EDGE
  终体积 **157478.901 mm³** vs 157478.902）；私有 converter 解析 9/9、
  backend matcher 7/7、ScenarioReplay 11/11。**同日 imprint 侧向**：converter
  保留全部 imprint queries + `imprintSign`（−1 环外/+1 环内），iOS 走 side=outside
  → region 1（真栈 2 passed）；`pickImprintRegion`/sign 解析单测 5/5、
  translator 21/21、scenario schema 11/11。同日修 converter 明文 CAP_EDGE
  `"isStart":true` 解析（edge-selectors 13/13）与 runner 多体无 scope 显式
  谱系锚定；Rear Shock 探针仍 blocked（Extrude 1 为 5 条混合侧向 imprint，
  线侧是实体子面，需真 imprint/face split），回归 Handle/Hand Brake/Sample
  Assignment/Element Organization **5 passed**。Hand Brake 仍受 revolve 单 region
  契约阻塞（region 0 ≈5372.779、[0,1] 并集 ≈7139.92 vs 7125.274），不以错值转绿。
- T1/T4 imprintFace 面域解析（2026-11-06，test-only 近似）：
  `e2e/examples/sample-assignment-scenario.spec.ts` setup+test **2 passed**——
  9 特征、体积 **8915.860 mm³** vs 8915.859905，push+重开一致；两条切除孔用
  显式可审计 region 映射，4 条 SWEPT_EDGE 并集端点消歧，约束登记
  `constraints=dropped`。`pickImprintRegion` 单测 3/3（孔优先/最大/外环回退/不猜）。
  产品 face split 仍未实现，步骤保持 `approximate=true`；旧 UI 版
  `sample-assignment.spec.ts` 降为 legacy（`EXAMPLE_UI_LEGACY=1` 才跑）。
- **known-red**：`sketch-extrude` 仍红（草图无拉链面域）。`tutorial2` X-14 已于 2026-11-04 关闭：`tutorial2.spec.ts` 2 passed（setup+strict，3.8 min；六特征 status 0，无圆角 358.161 cm³、终 357.739 cm³、去材 0.422 cm³），证据 `apps/web/test-results/t2-strict-after.log`。不得把 known-red 当绿，也不得通过放宽断言“修复”。

*最后更新: 2026-11-06（全 UI live 复核：文档中心/新建/登录/文档详情 + 220px 特征对话框统一皮肤；公开产品介绍页 `/showcase` + 4K WebP/1080p WebM；示例 iModel 12 个 + 分步演示；cPlane 基准面/平面点 + 草图落在自定义平面（shared 1.31.0，Intro to CAD + Handle 真栈）；chamfer UI 等距/双距离/距离-角度及编辑回显；Sample Assignment 真实 UI 链；SketchDialog 偏移平面编辑；FeatureDialog endBound 完全贯穿；官方 iTwin ViewCube 默认 + 相机/渲染菜单（`?viewcube=onshape` 回退；真栈 itwin/ui-parity/tutorial2 均绿）；图形首选项默认 AO 20%/线宽 2px；T3 抽壳 UI 真栈 1084.000 mm³ + 编辑/重开；T4 拉伸第二方向真栈 6000.000 mm³ + 旋转多面域 7853.981 mm³/Hand Brake 7125.270 mm³；T4b Handle 真栈逐体 38314.220/68563.590 vs 38314.765/68563.589；T5 mirror 真栈 8000.000 mm³；T6 point-on-line + 单点 H/V + CENTERLINE_DIMENSION 约束映射（缺口 143→6、47→0）；shared 1.32 倒角孔真栈 261.794 vs 261.799 mm³；验证基线 1389）*
