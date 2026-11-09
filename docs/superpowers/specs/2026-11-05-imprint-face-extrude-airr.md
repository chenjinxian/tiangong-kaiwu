# AIRR（草稿）：imprint-face extrude / 面轮廓拉伸

- 日期：2026-11-05
- Owner：用户（待签字）
- 关联需求：Onshape 示例逐个复刻为 luban-cad 真实 iModel（Tutorial 2 iOS、Intermediate Drawing、WARNING LABEL 等）
- 预计影响仓：shared、modeling-server（私有）、apps/web、viewer、editor
- 是否需要 ADR：**是**。`ExtrudeParams` 新增可选面轮廓来源属于共享契约变更，需
  ADR-0005 扩展或新 ADR；本文件只是 AIRR 草稿，未批准前不写实现代码。

---

## 1. 目标与验收

### 用户问题

Onshape 的 Extrude 支持把**已有实体的一个平面**（通常是草图 imprint 出来的面）作为
拉伸轮廓；采集数据里这一类 selection 记为 `imprintFace`。当前 luban-cad：

- 前端 FeatureDialog 的拉伸轮廓只支持草图面域（`sketchId + regions`）；
- 共享契约 `ExtrudeParams` 只有 `profile`（内联点集）/`sketchId`/`regions`；
- 私有后端测试域回放器（`ScenarioReplay`）已有近似：**imprintFace → 最近一张草图的
  region 0**，iOS 示例体积 −0.20%；这只是测试域适配，不是产品能力，也不能保证所有面
  都恰好等于某个草图面域。

受影响示例（已采集数据）：

| 示例 | imprintFace 用法 | 目标 |
|---|---|---|
| Tutorial 2 - Build Your First Part - iOS | Extrude 2：从草图内圆 imprint 面拉 50 mm ADD | 完整复刻 157.479 cm³（含后续 chamfer） |
| Exercise: Intermediate Drawing / Update Drawing | 多次 imprint-face add/remove | 先按面轮廓精确复刻，再处理 pattern/hole |
| WARNING LABEL（Bench Vise） | Extrude 1：imprintFace add 0.00254 | 现有“Sketch 1 region 0 ADD”等价映射保留为兜底 |

### 可观察验收标准

> **切片 0 spike 结果（2026-11-05，已执行，未改产品代码）**：
> 对 iOS Extrude 1 后的 body 枚举 8 个面；侧面 `getSubEntityGeometry` 返回 `Loop`（4 段），
> 上/下 cap 返回 `ParityRegion`（3 children：外环 + 2 个孔环），坐标已是世界系。
> **结论：整平面面轮廓提取可行**（Loop/ParityRegion 可直接作为 profile）。
> **但是**：iOS 的 Extrude 2 选的是 imprint **子面**（左环），我们的 body cap 仍是
> 单个 `ParityRegion`（未按草图内圆 split）；`faceRef(整 cap)` 会把整个截面
> 再拉一次，不是左环。因此 `faceRef` 本身不能复刻 imprint 子面，需要额外的
> **face imprint/split** 能力，或继续用“最近草图面域”近似。下面的验收区分二者。

1. **整平面面轮廓（faceRef）**：在 Part Studio 中拾取一个**完整平面面** → 拉伸 →
   可设置终止条件/布尔作用域 → ✓ 提交；带孔面（ParityRegion）轮廓正确；可撤销/重做，
   重开 iModel 后引用可求值。
2. **imprint 子面（单独切片）**：先按草图曲线对实体面做 imprint/split，再选子面拉伸；
   在未实现该切片前，iOS/Intermediate 的 imprint-face 步骤继续使用“最近草图面域”
   近似并在演示页标注，不宣称精确。
3. **契约**：`ExtrudeParams` 新增可选 `faceRef`（或等价形状），与 `sketchId/regions`
   互斥；旧载荷/旧库行为逐字不变。
4. **几何**：整平面 faceRef 示例（Warning Label 类）体积与 Onshape 逐 body 目标误差
   ≤0.5%；非平面/开放面/已删除面诚实拒收，不产生 status=1 死特征。
5. **回归**：现有 sketch-region 拉伸、Tutorial 2、Basic Drawing、Postman、WARNING LABEL、
   Mate Connectors、Intro to CAD 全部保持绿；不得用放宽断言掩盖回归。

### 参考证据

- Onshape 采集 scenario 中的 `selection.kind='imprintFace'`、`deterministicIds`、
  `queryString`（含 imprint/CAP_EDGE 等谓词），见
  `onshape-parity-data/scenarios/Onshape-d4232cec...scenario.json` 等。
- 私有后端测试域回放：iOS 用“最近草图 region 0”近似，单 body 157.165 cm³（−0.20%）；
  仅证明近似可用，不证明面轮廓产品能力。
- 现有测试：`Tutorial2IosReplay.test.ts`（私有）、`verify-imodels.spec.ts`（公开）。
- 前端面拾取：`OnshapeSelectTool` → `solidModelingIpc.getClosestPoint` →
  `LubanFeatureRpcInterface.resolveFaceRef`（已在产品中使用）。
- 后端面寻址：`SolidModelingCommand.topologyIdFromSubEntity`（op31）；`FacesFromId`
  / `facesFromId`（op32）已用于 shell 面寻址。

### 非目标

- 不解析 Onshape WebSocket/二进制内部协议；不把 queryString 当作产品输入。
- 不支持非平面面、曲面面、开放面、多面联合轮廓（首版明确拒收）。
- 不做 `upToNext/upToFace/upToVertex` 终止条件（仍按 ADR-0005 现有范围）。
- 不实现 chamfer/shell/fillet 的新边语义；iOS 的 chamfer 继续按现有 fillet/chamfer
  通道评估。
- 不改动 SelectionSet/选择权威/渲染管线。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | 子实体几何、拓扑 id、面枚举 | `SolidModelingCommand.getSubEntityGeometry` / `topologyIdFromSubEntity` / `getBodySubEntities` | fork 5.15 | 复用；面轮廓提取需 spike 验证 |
| luban-cad/packages/editor | 标准编辑命令、面/边子实体 | `EditorBuiltInIpc`、`EditTools` | workspace | 复用 |
| luban-cad/packages/viewer | 面拾取、选择、高亮 | `OnshapeSelectTool`、`solidModelingIpc.getClosestPoint` | workspace | 复用 |
| luban-cad/packages/shared | 拉伸契约、拓扑 id | `ExtrudeParams`、`LubanTopologyId`、`FeatureOp` | 1.28.0 | **扩展**（可选 faceRef） |
| luban-backend/modeling-server | FeatureEngine/AsyncFeatureEval、面求值、草图面域 | 私有产物；`FeatureEngine.extrude`、`FacesFromId`、`sketchRegionsFrom` | 当前发布列车 | 扩展求值器 |
| luban-backend/webhook-agent | 无直接关系 | — | — | 不适用 |
| imodel-native | BRep/内核 | `SolidKernel.h`、`FacesFromId` | canonical | 复用，不改 native |
| imodelhub-services | 无直接关系 | — | — | 不适用 |
| 官方 clients/BisSchemas | 参考契约 | BisSchemas/官方 editor | 本地 | 参考，不新增 API |
| DanQing/参考项目 | 不作为第二实现 | — | 仓外 | 不适用 |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 | 许可证 |
|---|---|---|---|---|---|
| 面拾取/悬停/选择 | `OnshapeSelectTool` + `getClosestPoint` + `resolveFaceRef` | 已产品化 | 复用 | 已有唯一选择权威与面持久 id | 项目自有 |
| 面持久引用 | `LubanTopologyId`（op31） | 已有 | 复用 | 与 fillet/shell 面寻址同源 | 项目自有 |
| 面轮廓提取 | `getSubEntityGeometry` / `getBodySubEntities` / op32 | 部分 | **spike + 扩展** | 需验证面边界环/孔环能否直接转 `Loop/ParityRegion` | 项目自有 |
| 拉伸求值 | `FeatureEngine.extrude` / `sweepSketchRegion` | 已有 sketch-region 通道 | 扩展 | 同一 Sweep/内核管道，只换 profile 来源 | 项目自有 |
| 前端拉伸对话框 | `FeatureDialog` 的 profile field / `FeatureProfilePicker` | 已有草图面域 | 扩展 | 增加“面”来源，不新建第二套对话框 | 项目自有 |
| 近似映射 | 测试域 ScenarioReplay 的“最近草图 region 0” | 测试专用 | 仅作兜底/证据 | 不能作为产品契约；新能力应精确 | 项目自有 |

**规则**：面轮廓是 `ExtrudeParams` 的可选新来源，不新增 RPC、不新增第二套建模 API；
所有写入仍走 `FeatureOp` + `BriefcaseTxns` + 推送。

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 读取/发送可选 `faceRef` | 无 | 无 | 对话框单测 + 真栈 | 同批 |
| shared | `ExtrudeParams.faceRef?` + 版本 bump | 无 | 无 | 契约测试 | 同批发布 |
| viewer | 面拾取复用 | 无 | 无 | 选择回归 | 同批 |
| editor | 面枚举/几何 | 无 | 无 | 编辑命令回归 | 同批 |
| itwinjs-core | 仅消费现有 op31/op32 | 无 | 无 | 已有测试 | 不变 |
| imodel-native | 仅消费 `SolidKernel` 现有面能力 | 无 | 无 | ctest/下游 | 不改 |
| modeling-server | 解析 `faceRef`、提取面轮廓、求值 | 无库 schema 变更 | 无 | 单测 + StandaloneDb + 真栈 | shared 后同批 |
| webhook-agent | 无 | 无 | 无 | — | 不适用 |
| hub/DanQing | 无 | 无 | 无 | — | 不适用 |

- 版本兼容矩阵：旧 web/旧 shared ↔ 新后端：忽略 `faceRef`，行为不变；新 web ↔ 旧后端：
  UI 不提供面轮廓入口。shared 契约 bump 后按 P0-07 双端同发布。
- 配对 PR：shared + web + 私有后端同批；公共仓文档同 PR 更新接口冻结矩阵。
- 发布顺序：shared → modeling-server → viewer/web。

---

## 5. 数据/事务/安全

- 数据事实源：`params.faceRef` 保存**面持久拓扑 id**；几何轮廓每次求值从面重新提取；
  不把面网格写入 params（P0-06 单一数据源）。
- schema/params 变化与迁移：仅新增可选键，无库 schema 变更；旧库无需迁移。
- 旧数据 fixture：保留现有 sketch-region 库；新增 faceRef fixture 覆盖 undo/redo/重开。
- 事务边界：沿用 FeatureOp → FeatureService → BriefcaseTxns/saveChanges；面轮廓提取是
  读操作，不绕过事务。
- Undo/redo：特征可撤销；面引用在 undo/redo 后由 op31 持久 id 恢复；失效时拒收并
  提示重新选面（不得静默 no-op）。
- 写租约/权限/限流：沿用现有租约；面拾取不新增写路径。
- 密钥/日志/审计：不新增密钥；日志不打印私有几何/查询串。

---

## 6. 性能与渲染

- 面轮廓提取按单特征一次，目标 <50 ms（box/典型件）；不得在 hover 每帧提取。
- 面拾取沿用 `getClosestPoint` 兜底，不在原生 Face locate 上回退。
- 预览：面轮廓拉伸复用现有 extrude 半透明 ghost；不新增渲染管线/shader。
- 视觉基线：现有 `BREP-RENDERING-2026-11-03` 不变；面选中高亮沿用选择装饰。

---

## 7. 测试证据

### 单元

- shared：`ExtrudeParams` zod/契约互斥（faceRef 与 sketchId/regions 同给拒收）。
- 后端：面轮廓提取（平面 box 面、带孔面、非平面面、开放面、删除面）→ 体积/拒收文案。
- web：FeatureDialog 面来源 chip、终止条件/布尔作用域组合、空面禁用确认。

### StandaloneDb/契约

- iOS fixture：Sketch → Extrude NEW（sketchRegions）→ Extrude ADD（faceRef）→ 体积
  对拍；chamfer 按现有通道另行验证。
- WARNING LABEL：faceRef ADD 与现有 region-0 ADD 体积一致。
- undo/redo + 重开：面 id 仍能解析。

### 真栈 e2e

- 新增 `e2e/examples/ios-first-part.spec.ts`（或等价）：真实 UI 拾取面 → 拉伸 → chamfer
  现有链路 → 推送 → 重开；至少覆盖一次 undo/redo。
- `verify-imodels.spec.ts` 加入 iOS iModel。
- `tutorial2/basic-drawing/postman/warning-label/mate-connectors/intro-to-cad` 全量回归。

### 视觉/性能

- 面拾取 hover/pick 仍需 `<16 ms` 交互预算（现有选择回归）；
- 预览 ghost 与提交结果视觉一致；无新增 tile 失败。

### 失败注入/负路径

- 面被删除、面变为非平面、面在 undo 后失效、多面联合、无上游实体；
- 全部诚实拒收，禁 status=1 死特征/假成功。

### known-red

- `sketch-extrude.spec.ts` 既有红保持登记；不得因本能力顺手改断言放水。

---

## 8. 回滚与发布

- 回滚方式：移除 UI 面来源入口 + 后端忽略 `faceRef`；旧 sketch-region 路径不变。
- 数据迁移回滚：无迁移；新增键可被旧版本忽略。
- 产物/镜像 provenance：私有后端产物与 shared 版本同批发布，记录 digest。
- 兼容窗口：shared bump 后一个发布列车；双端同发布。
- 发布门：`verify-stack`、真栈 e2e、9 个现有 iModel 重开回归、契约测试全绿。

---

## 9. 评审结论（草稿）

- 复用矩阵完成：是（待面轮廓提取 spike 补充细节）
- 跨仓影响明确：是
- P0 例外已登记：否（本能力本身不新增例外；面引用失效按拒收处理）
- ADR：需要（shared 契约 bump；建议 ADR-0005 Phase 3 或新 ADR）
- Owner 签字：**待用户批准**
- 结论：**草稿，未批准；批准前不写实现代码**。

### 建议切片

1. **切片 0（已完成，只研究/不写产品代码）**：iOS E1 body 面枚举 → 侧面 `Loop`、
   cap `ParityRegion(3 children)`；证明整平面面轮廓可提取，同时证明 cap 未按内圆
   split，`faceRef(整 cap)` ≠ iOS imprint 左环。
2. **切片 1（可选，整平面 faceRef）**：shared `faceRef` + 后端整平面面轮廓 + 前端面来源；
   用 Warning Label 类“整面 = 目标 profile”的示例验收；iOS/Intermediate 不作为本切片验收。
3. **切片 2（imprint 子面的前置）**：研究/实现面 imprint/split（按草图曲线在实体面上
   切出子面），再让 faceRef 指向子面；这是 iOS/Intermediate 真复刻的前置。
   在切片 2 之前，这两例的 imprint-face 步骤继续用“最近草图面域”近似并在演示页标注。
4. **切片 3**：多环/带孔面、非平面拒收、撤销重开、全量回归。

---

## 7. 2026-11-07 证据更新：静态“草图面域”近似已到边界

hub 恢复后的真栈与 backend StandaloneDb 离线回放给出了同一结论：对
“同一草图被多次 imprint、每次落在不同 body 面/起始面”的链，按单 query 选草图
材料面域的近似会选错基础轮廓，不能靠调 picker/tolerance 修复。

- **Drive Sleeve（8509862e）**：4 段 imprintFace extrude + hole + FACE circular
  pattern。backend 离线逐段 264448.7 → 688721.7 → 790461.9 mm³，Extrude 4
  remove 零去材；最终 774611.7 vs 采集 1175024.3（−34.08%）。web 真栈在
  featurePattern 求值以 `内核 op 失败: op=1 status=0` 失败（实例化孔与错误基础体
  不相交）。两 runner 失败形态不同，根因同为 imprint 基础轮廓。
- **Universal Joint Drawing（246cb5ff）**：Extrude 11 的 Sketch 10 全为构造/投影线，
  草图 0 面域；web 真栈 `面域下标越界: regionIndex=0（草图共 0 个面域）` 拒收。
- **Universal Joint Assembly（8d892a47）**：Extrude 10/11/12 后 1,690,674.783 mm³
  vs 最终期望 602,047.386；Chamfer 10 的 `sweptFace` 实际是 boolean 面 INTERSECT
  交线，converter 按首个 derivedFrom 面近似后 matches=0。
- **Rear Shock（08e8de59）**：imprint 基础体偏差 + 前序 fillet 分割边，CAP_EDGE/
  SWEPT_EDGE 在错误体上零匹配。

### 切片建议（在原切片 0/1/2 基础上的收敛）

1. **A1（test-only 回放）**：非 NEW imprintFace extrude 用
   `readFaceHandles`（已有 dev-only hook）匹配当前 body 的共面实体面；当面与所选
   草图区域整体一致时走 `faceExtrude(faceRef, operation, depth, direction)`
   （产品能力已有，ADR-0006 切片 D）。合成“盒顶面 imprint add/remove”真栈。
2. **A2**：起始面/方向符号与多面选择；Drive Sleeve 全链逐段体积；Universal Joint
   Drawing 的实体面选择。
3. **B**：face split 能力查证——先查 `SolidModelingCommand`/BRepCore 是否暴露
   split/imprint API；未暴露则登记 blocked-kernel（TaperFaces 同样无 NAPI 绑定）。
4. **C（保底）**：无法唯一匹配实体面时抛 `BlockedCapabilityError('imprint-face')`，
   删除 region 0/小面域拼集回退；不伪造几何。

**回滚**：全部在 `e2e/examples/replay` test-only 层，不改产品契约/内核；删除 resolver
分支即回到当前近似行为。**不做**：UI Use/imprint 工具、任意曲面 imprint、face split
产品级能力。

### A1 实现记录（2026-11-07，test-only）

- 新增 `e2e/examples/replay/imprint-face-resolver.ts`：`readFaceHandles` 枚举
  当前 active authored body 的平面面；草图区域外环/孔环与面环按面积/质心匹配
  （1% / 1% span 容差），面法向与草图法向平行且点共面（0.02 mm），单区域、
  单 body、唯一候选才经 `resolveFaceRef` 产出持久面引用。
- `run.ts` 新增 `imprintFaceResolver` 选项：非 NEW、单区域、blind/throughAll 的
  imprintFace 拉伸在整面匹配成功时改走产品 `faceExtrude`；失败回退既有草图面域
  近似并写 note。`run-file.ts` 已接线；后续步骤 `type` 保留场景逻辑类型，
  另记 `opFeatureType` 供树对拍。
- **合成真栈绿**：`e2e/examples/imprint-face.spec.ts` **2 passed**——20×20×10 盒
  + 顶面同边界 20×20 草图 imprint ADD 2 mm → **4800.000 mm³**，树
  `sketch/extrude/sketch/faceExtrude`，push+重开一致；A1 机制成立。
- **真实例现状（不转绿）**：Drive Sleeve 仅在 Extrude 4（单区域 remove）触发
  A1，fallback=“无共面且边界一致的面”（基础体已被前序错误近似）；Extrude 1 是
  NEW、Extrude 2/3 是多区域选择，A1 按设计不处理。iOS scenario 经 A1 回归
  **2 passed**（157478.901 mm³），未发生替换（树仍 extrude），无回归。
- A2 仍需：NEW/多区域选择的实体面/起始面语义、face split；A1 不改产品契约。

### A2 首步：NEW 拉伸主导面域收敛（2026-11-07，test-only）

- **规则**：仅对 `operation=new` 的 imprintFace 拉伸，当逐 query pick 出多个面域、
  且同一大材料面包含**全部被查询实体**（外环或孔环）、面积 ≥ 已选面域最大面积的
  4 倍时，收敛到该主导面域。add/remove 不收敛（imprint 落在已演化 body 的子面，
  静态收敛会过选 +59.5% 实测）。
- **实现**：公共 `imprint-region.ts` 新增 `dominantImprintRegion()`（+4 单测，
  8/8）；`run.ts` 在 NEW 拉伸应用；backend `ScenarioReplay` 同口径复刻。
- **Drive Sleeve 结果（仍 known-red）**：Extrude 1 由 264448.7 → **1190513.2 mm³**
  （主导 region 0）；backend 离线整链 **1357113.4 vs 1175024.3（+15.50%）**
  （此前 −34.08%），web 真栈约 **+20.1%**。剩余偏差：Extrude 2 仍把
  regions [0,1,2] 当独立 prism 加料（+424k）、Extrude 4 按 region 0 整面切除
  （−305k），需要 add/remove 的**子面/起始面**语义与 face split。
- **回归**：iOS scenario **2 passed**（157478.901 mm³，主导规则未触发，无退化）；
  合成 A1 **2 passed**。

### A2 阻塞证据：face split / imprint 内核入口未暴露（2026-11-07）

- `imodel-native/iModelCore/BRepCore/PublicAPI/BRepCore/SolidKernel.h` 已提供
  `ImprintCurveVectorOnFace` / `ImprintCurveVectorOnBody`（AcisModify 侧对应
  `api_imprint` / `api_project_wire_to_body`）。
- **修正（2026-11-07 内核查证）**：TS 绑定**存在**——第一方 editor backend
  `EditBuiltInCommand.ts:1105` 的 `SolidModelingCommand.imprintBody`
  （`ImprintProps`，`OperationType.Imprint=28`，native `PSBRepEdit.cpp`
  `imprintBody`）；此前“grep 0 命中”的判断只覆盖了旧路径，已作废。
- **但该绑定对本切片不可用（blocked-kernel）**：StandaloneDb 探针（同一 scratch
  cache + 显式顶面）显示：
  - **开放线段** imprint（盒体顶面跨线）返回 1 条结果几何（可用）；
  - **闭合 Loop（圆 / 矩形）CurveCollection** imprint **直接使 vitest worker
    崩溃**（多次复现，偏移 +显式 face/方向同样崩溃，非 JS 异常）；
  - **闭合 Arc3d CurvePrimitive**（整圆）imprint 不崩溃但**返回 undefined/no-op**
    （面数不变）。单独 `ElementGeometry.fromGeometryQuery(closed Loop)` 编码正常
    （opcode=8/344B），确认问题在 native imprint 闭合 wire 路径而非编码。
  native `ImprintCurveVectorOnFace` 的闭合 wire 路径在当前 native 构建内不可用。
- **替代通道也否定（2026-11-07）**：以 carrier 元素承载闭合 Loop 作 profile，
  调用第一方 editor `cutSolid`（Blind/Backward/ProfileClosure.Auto + target/tool
  hint + writeChanges）同样返回 undefined（no-op，面数不变）；Emboss/裁切通道
  对当前 profile 元素形态不可用。未找到绕过闭合 wire imprint 的安全通道。
  故 add/remove imprint 的 face split 仍登记 **blocked-kernel（闭合 wire 崩溃）**；
  A1（整面一致）+ NEW 主导面域是当前可用安全子集。开放曲线 imprint 可另立切片。
- 若后续要做：native 侧定位闭合 wire 崩溃 → ADR → ctest + synthetic face split →
  Drive Sleeve/Universal Joint 全链；完成前不得用近似几何宣称示例绿。
- **追加证据（2026-11-07 收口批次）**：两例在 face split 缺失下更早阻塞：
  - `Exercise: Basic Assembly / Hydraulic Components`（58d046/60f21）：Extrude 1
    是 imprintFace 复合轮廓（外圆 + 内接六边形 + 内圆），回放按主导面域只得到
    部分轮廓；Fillet 1 的 sweptEdge（Sketch 1#1，source=Extrude 1）**matches=0**。
  - `Intro to CAD 1.2-1.4 / Rear Shock`（dfc6e33c/08e8de）：Extrude 1 为
    imprintFace ADD（5 条 query，35 实体草图）；Fillet 3 的 sweptEdge
    （Sketch 1#17，source=Extrude 1）**matches=0**。
  - `Exercise: Inserting a BOM / Hydraulic Components`（664c42/a3c462，
    25 特征/4 body，与上一例同源躯干）：真栈同样在 **Fillet 1**
    `sweptEdge Sketch 1#1 source=Extrude 1 matches=0` 阻塞（同一外圆+六边形+
    内圆复合轮廓）；其后的 shell/Fillet 4 OFFSET_EDGE 缺口被此上游阻塞遮住，
    暂不单独立项。
  两者都不是 transform/shell/边解析器的独立缺陷，根因同为本切片的 imprint
  子面/复合轮廓语义；在 native face split 落地前保持 blocked。
- **追加证据（2026-11-07，2 点插值样条转换后）**：`Tutorial 2 - Build a Part /
  First Part`（576aef66/46033ccd，6 特征：sketch → 3×extrude → revolve → fillet）
  的草图含 1 条 2 插值点样条；converter 现按 endDerivative=3·(P3−endHandle)
  精确转三次贝塞尔（单测 6/6），整链 scenario 转换成功、树/status 全 0。**但离线
  回放 2,444,863.6 vs 采集 357,568.2 mm³（+584%）**：3 个 imprintFace extrude 在
  已演化 body 的面上选材（queries=1/2/1、regionRisk=false），回放按草图面域
  整体拉伸，远超目标。证明样条不是该例阻塞；它与其他例同属本片 face split
  的 add/remove 子面语义，保持 blocked-converter（索引未假绿）。
- **追加证据（2026-11-07，能力覆盖轨 Bumper Block）**：Bumper Block 的
  Extrude 2（imprintFace ADD）被 A1 解析器匹配到当前 body 的整面，改走
  `faceExtrude`；10° 拔模按直壁近似后整链真栈可行（树 6/status 全 0/单 body/
  push+重开），但体积 **346,770.496 vs 636,731.499 mm³（−45.54%）**。说明 A1
  对演化体面“整面一致”也不等于 Onshape imprint 子面语义，只能作能力链覆盖，
  不能作为 face split 的替代；严格轨仍 blocked。
