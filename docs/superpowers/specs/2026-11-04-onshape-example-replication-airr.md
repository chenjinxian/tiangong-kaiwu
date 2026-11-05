# AIRR — Onshape 示例复刻与交互/UI 对齐

- 标题：Onshape 示例复刻与 Part Studio 交互/UI 对齐
- 日期：2026-11-04
- Owner：平台团队（LubanCAD）
- 关联需求：把已采集的 Onshape 公开示例在 luban-cad 中复刻；深入研究草图、约束、特征参数化建模的交互与 UI，逐项对齐
- 预计影响仓：`tiangong-kaiwu`（docs / luban-cad）、私有 `luban-backend`、私有 Onshape parity 数据仓；必要时 `imodel-native`
- 是否需要 ADR：**是**。原因：新增 parity 证据/场景契约与跨仓覆盖门禁，属于新的测试与数据契约；若后续引入新的 FeatureOp/schema，必须单独 ADR。

---

## 1. 目标与验收

### 目标

1. 以私有 Onshape parity 数据仓为唯一证据源，把已发现的公开示例逐步复刻为 luban-cad 可回放的 Part Studio 场景；
2. 对草图、约束、尺寸、特征参数化、特征树、预览、选择与对话框交互做证据驱动的 Onshape 对齐；
3. 不新建第二套建模 API：所有模型写入仍走 `LubanFeatureRpcInterface` / `FeatureOp`，直接编辑仍走标准 `EditTools` + 标准 IPC。

### 现状证据

- 发现 526 个文档（Onshape 150 / Onshape Training Repo 361 / Explore Onshape Models 6 / Onshape Training 9）。
- 其中 476 个含 Part Studio，合计 1685 个 Part Studio。
- UI 证据：526/526 文档有浏览器索引；491 个代表 Part Studio 有截图、压缩 DOM 轮廓和 ARIA。
- 结构证据（2026-11-04 收口）：5 个文档有完整 `features + massproperties + parts`；37 个文档有特征树；11 个文档有 parts；118 个文档有聚合 massproperties 文件（完成度以 `manifest/collection-coverage.json` 为准）。
- 逐 body 质量属性：Onshape 默认 massproperties 只返回 `-all-`；已新增 `tools/mass-by-part.mjs` 按 `partId` + `massAsGroup=false` 采集每个 Part/body 的体积/质量/质心，已完成 11 个文档 / 90 个 Part Studio（Batch 1 全覆盖）。
- Tutorial 2「Build a Part」已有 gold fixture，并已迁入同一私有数据仓。

### 第一批验收（Batch 1）

| 示例 | 现状 | 验收 |
|---|---|---|
| Tutorial 2 - Build a Part | gold + strict e2e；当前 known-red：Extrude 2 region 4 | 修复 known-red；体积 ≤0.5% 偏差；特征树/草图/约束/尺寸与 gold 一致 |
| Onshape Quickstart | 4 Part Studio；完整 API + UI | 至少 1 个 Part Studio 完整特征链；多 Part Studio 目录可解析；体积/body 数对拍 |
| Bench Vise | 4 Part Studio；完整 API + UI | 至少 1 个 Part Studio 完整特征链；多 Part/多 body 对拍 |
| Part Feeding Machine | 13 Part Studio；完整 API + UI | 选择 1 个 Part Studio 做完整链；验证大规模多 Part 文档的选择/树/相机 |
| Exercise: Clamp | 2 Part Studio；特征树 + UI（1/2 PS 有 UI） | 草图/尺寸/特征树回放；massproperties/parts 到齐后补体积锚 |
| Tutorial 2 - Build Your First Part - iOS | 1 Part Studio；4 特征（sketch/extrude NEW/extrude ADD/chamfer）；特征树 + UI + parts + 逐 body 质量属性（157.479 cm³） | **几何+约束全量回放已通过**（草图 ok/dof=0，含 4 条 line+circle tangent 与 2 条 DIAMETER）；单 body、四特征 status 0、终体积 **157478.900 mm³ = Onshape 目标**（chamfer UI 已于 2026-11-05 接通并按 CAP_EDGE 语义拾取 3 条边）；剩余近似仅 imprint-face → 面域 ADD。原「Intro to CAD - Skateboard」的 Part Studio 为空（0 特征、0 body），数据不可用，已替换 |

**Batch 1 数据状态（2026-11-04）**

- Bench Vise、Part Feeding Machine、Onshape Quickstart：4/4、13/13、4/4 Part Studio 均已有 features + parts + 逐 body massproperties + UI（Quickstart 的代表 UI 仅 1/4，目标 SPINDLE 的代表证据待补）。
- Exercise: Clamp、Tutorial 2 iOS：parts 与逐 body massproperties 已补（Clamp 2 PS/6 parts；iOS 1 PS/1 part，体积 157.479 cm³）；UI 覆盖 Clamp 1/2、iOS 1/1。
- 所有体积断言使用逐 body 数据；没有逐 body 数据时只能标记 `blocked-evidence`，不得用聚合值冒充单 body。
- 能力/数据缺口与 ADR 批次：见 `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`。

所有示例都要求：特征树类型/顺序/关键参数可追溯；同一输入的求值确定性；不允许用截图伪造几何结果。

### 非目标

- 不复制 Onshape 商标、图标源文件或账号数据；UI 只按已采集的结构/尺寸/行为做自有实现。
- 不解析或猜测 Onshape 内部二进制 WebSocket 协议；拿不到的结构化数据不进入验收。
- 不在第一阶段实现全部 1685 个 Part Studio；按证据覆盖分批推进。
- 不新增第二套 RPC、schema、选择状态机或渲染平台。

---

## 2. 关联项目能力清单

| 项目/仓 | 相关能力 | 现有 API/工具/实现 | 版本/路径 | 结论 |
|---|---|---|---|---|
| itwinjs-core | BriefcaseTxns、EditTools、ElementSetTool、iModel/BIS | `packages/editor`、viewer host、core-backend | 5.15 fork | 复用 |
| luban-cad/packages/editor | 建模工具基类、编辑命令、草图工具 | `EditTool.ts`、`SolidModelingToolBase.ts`、`Sketch.*` | workspace | 复用；不恢复旧编辑 RPC |
| luban-cad/packages/viewer | 渲染、选择装饰、草图/尺寸装饰 | `render-profile.ts`、`OnshapeSelectTool`、decorations | workspace | 复用 |
| luban-cad/packages/shared | FeatureOp/DTO/契约 | `LubanFeatureRpcInterface` 1.28.0 | workspace | 优先不改；需要新增 op 时 ADR + 版本化 |
| luban-backend/modeling-server | FeatureService、FeatureEngine、massproperties、schema | 私有仓产物；`dist-backend` 消费 | 当前发布列车 | 只为缺失能力扩展，不另开写面 |
| luban-backend/webhook-agent | baseline/webhook | 与复刻无直接关系 | 当前发布列车 | 不适用 |
| imodel-native | SolidKernel/BRep | 私有源码 + Delivery | canonical checkout | 先复用；无必要不改 native |
| imodelhub-services | 文档/iModel 管理 | 私有栈 | 当前镜像 | 复用，不新增旁路 |
| 官方 clients/BisSchemas | REST/BIS 规格 | `docs/api-specs`、官方 clients | 本地检出 | 只用于证据和契约对照 |
| DanQing/参考项目 | 渲染/加载参考 | 独立项目 | 仓外 | 不作为平台建模/渲染第二实现 |

---

## 3. 复用决策矩阵

| 需求能力 | 候选复用 | 覆盖度 | 决策 | 理由 | 许可证 |
|---|---|---|---|---|---|
| 示例回放/特征链 | 现有 `FeatureOp`/`FeatureService` | 已有 extrude/revolve/fillet/mirror/pattern/boolean 等 | 复用 | 已有单一建模管道 | 项目自有 |
| 草图/约束/尺寸交互 | `Sketch.*` 工具、`SketchDialog`、`SketchValuePopup` | 部分 | 扩展 | 不为 demo 再造工具 | 项目自有 |
| UI 外壳/特征树/选择 | 现有 Part Studio 组件和 `OnshapeSelectTool` | 已实现 | 复用 | 已有 Onshape 式选择权威 | 项目自有 |
| 证据/覆盖矩阵 | 私有 parity 数据仓 + 现有 e2e | 部分 | 新建测试工件 | 需要统一 scenario schema 与 coverage；不是建模 API | 项目自有 |
| 几何结果对拍 | 现有 `CorpusReplay` / `normalizeBrepGeomJson` / massproperties | 已有 4 例 | 扩展 | 复用既有回放执行器 | 项目自有 |
| 缺失特征（loft/sweep/chamfer/shell 等） | `FeatureOp` + 后端 | 有缺口 | 逐项扩展 | 先证缺口，再 ADR/契约变更 | 项目自有 |
| Onshape UI 视觉 | 已采集截图/DOM/ARIA | 491 个代表 PS | 证据驱动 | 不复制专有资产，不自称无证据的像素级 parity | 私有证据 |

**规则**：任何新增 FeatureOp/schema/native 能力必须先有 AIRR 补充与 ADR；禁止以“复刻 demo”为由绕过标准管道。

---

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| web | 不改首版 | 无 | 无 | scenario-driven e2e | 前端同批 |
| shared | 首版不改 | 无 | 无 | 契约测试 | 若改则 bump + 双端 |
| viewer | 不改首版 | 无 | 无 | UI/渲染基线 | 同批 |
| editor | 不改首版 | 无 | 无 | 工具回归 | 同批 |
| itwinjs-core | 不改 | 无 | 无 | 真栈回归 | 无 |
| imodel-native | 首版不改 | 无 | 无 | ctest + 下游 | 无 |
| modeling-server | 可能扩展缺失特征 | 首版无 | 无 | StandaloneDb + 真栈 | 私有仓发布列车 |
| webhook-agent | 不改 | 无 | 无 | 不适用 | 无 |
| hub/DanQing | 不改 | 无 | 无 | 不适用 | 无 |
| parity 数据仓 | 私有证据契约 | 无产品 schema | 无 | `verify`/coverage | 私有 |

- 版本兼容矩阵：首版不 bump shared；若新增 FeatureOp，按 P0-07 双端同发布。
- 配对 PR：`tiangong-kaiwu` 与私有 `luban-backend`；数据仓独立提交。
- 发布顺序：shared → backend → web（仅在实际改契约时）；否则 web/backend 同批。

---

## 5. 数据/事务/安全

- 数据事实源：iModel/BIS + feature `params`；草图 params 是唯一草图事实源。
- schema/params 变化：首版无；新增特征或迁移必须 ADR + 版本化 + 旧库 fixture + 回滚。
- 旧数据 fixture：Tutorial 2 gold/raw；私有数据仓的 raw features/massproperties/parts。
- 事务边界：所有写操作走 `BriefcaseTxns`/`FeatureService`/`saveChanges`。
- Undo/redo：硬要求；已知 `insertSketch/updateSketch` 整体覆写例外按 X-05 登记，不在本计划中扩大。
- 写租约/权限/限流：沿用现有 `WriteLease`；采集侧只读，不把 Onshape 会话或 token 写入产品仓。
- 密钥/日志/审计：采集证据私有；日志不含 Cookie/XSRF/账号敏感信息；UI 截图仅私有仓。
- 证据完整性：每个场景必须能回溯到 docId/PS id/feature tree/UI 证据/采集时间；缺证据的项标记缺口，不伪造。

---

## 6. 性能与渲染

- 复用 iTwin 默认渲染、现有 BRep 拓扑叠加和选择工具；不引入自定义 shader/第二渲染路径。
- 性能预算沿用现有 hover/pick、tile、重建与 IPC 基线；大规模 Part Feeding Machine 作为压力样本。
- 视觉基线：UI 证据是参考，不承诺无证据的像素级 parity；对比采用结构/布局/关键控件 + 截图人工复核。
- 大模型：先选 1-3 个多 Part Studio 文档做规模回归；不在首版全量 1685 PS 压测。

---

## 7. 测试证据

- 单元：scenario schema、coverage 计算、feature-tree→replay 转换、缺失项分类。
- StandaloneDb：每批至少一个完整特征链；massproperties 到齐后加体积断言。
- 真栈 e2e：Tutorial 2 strict + 首批 5 个示例的代表 Part Studio；真实 ribbon/canvas/dialog 路径。
- 视觉/交互：每批代表 Part Studio 截图、DOM outline、ARIA；关键差异人工确认。
- 失败注入/负路径：缺特征、缺面域、未支持特征、429/额度耗尽、UI 加载失败。
- known-red：Tutorial 2 Extrude 2 region 4（X-14）必须在 Batch 1 转绿；sketch-extrude 无 closed region 仍按现有登记跟踪。

---

## 7.1 逐示例 iModel 与分步演示（2026-11-05 补充）

### 需求

每个 Onshape 示例在 luban-cad 中都必须有**对应的真实 iModel**（不是临时测试库、不是截图），
并生成与 Tutorial 2 同形态的分步演示：每一步真实 UI 操作 + 截图/说明，最终模型可从
文档中心重新打开。

### 设计

- **示例项目**：专用 B 标记项目 `Onshape 示例复刻`
  （`data.luban = { modelMode:'B', schemaVersion:1 }`），每个 Part Studio 示例一个 iModel，
  名称 `<owner>/<document>/<Part Studio>` 的稳定 slug。
- **持久化**：通过 web 编辑器打开 iModel → 真实 UI 构建 → dock「推送」写入 hub changeset；
  重开同一 iModel 后特征树/草图/body 必须仍在。构建前不删除已存在示例库；显式 `--reset`
  才重建。
- **演示产物**：`luban-cad/apps/web/demo-artifacts/examples/<slug>/`
  - `001-<step>.png` … 每步截图；
  - `index.html` 画廊 + 步骤说明 + 体积/特征树校验；
  - `demo.webm`（可选，Playwright 录制）；
  - `manifest.json`（iModel id、项目 id、场景 id、推送 changeset、校验结果）。
- **通用 runner**：`e2e/examples/` 下按 scenario 驱动真实 UI：
  - 草图：平面选择 → 绘制点/线/圆/弧 → 约束/尺寸（scenario 中已支持的 kind）→ 完成；
  - 特征：按类型走现有对话框（extrude/revolve/hole），面域/孔位按 scenario 元数据选择；
  - 每步调用统一 `step()` 截屏 + 记录 caption；
  - 不支持的约束/特征不得静默跳过：写入运行报告，示例标为 `blocked-capability`，不生成“完成”演示。
- **首批**：Basic Drawing（Right 平面 sketch → 全周 revolve）作为第一个新示例；
  随后 Postman、WARNING LABEL、Mate Connectors，再按能力扩展。
- **门槛**：演示必须来自真栈（真实 Briefcase/iModel + FeatureService 求值）；jsdom/StandaloneDb
  只能作为前置校验。最终体积与 scenario expected 对拍，iModel 重开后读回一致。
- **混合构建规则（2026-11-05 补充）**：当精确几何在 UI 拾取阈值以下（如 Postman 的
  r=1.60176 mm 角圆），草图可经 `applyFeatureOpRpc` 的 `insertSketch` 按采集数据精确复原，
  但仍走同一 `LubanFeatureRpcInterface` FeatureOp 管道、事务与推送；演示页必须显式标注
  哪一步是数据驱动、哪一步是真实 UI 操作，不得把 RPC 步骤冒充成鼠标绘制。特征步骤
  （拉伸/旋转等）优先走真实 UI 对话框。

### 已落地状态（2026-11-05）

| 示例 | iModel | changeset | 结果 |
|---|---|---|---|
| Tutorial 2 - Build a Part | `f2278180-4f57-43b2-98f5-2cc8f76fd24f` | `Onshape example: Tutorial 2 - Build a Part` | 357.716 cm³；5.0 min 录像 |
| Tutorial 2 - Build Your First Part - iOS | `f49b33ab-d07d-4e76-9aef-80812e8784cf` | `Onshape example: Tutorial 2 - Build Your First Part - iOS` | 157478.900 vs 157478.9 mm³（**0.00%**）；17 约束草图 RPC + 2 次 UI 拉伸 + UI 倒角（3 条 CAP_EDGE，2 mm） |
| Exercise - Hand Brake Update | `33f8feb0-ea05-4e7d-9f88-38c30def30e8` | `Onshape example: Exercise - Hand Brake Update` | 7125.270 vs 7125.274 mm³（−0.00006%）；并集外边界草图 RPC + UI 全周旋转 + UI 倒角（左端圆边 1 mm） |
| Sample Assignment · Alignment Plate | `a9eacfe5-825f-421e-93c3-bf55466c27cf` | `Onshape example: Sample Assignment` | 8915.860 vs 8915.8599 mm³（0.00%）；4 草图 RPC + 4 次 UI 拉伸（含完全贯穿移除）+ UI 距离-角度倒角（4 竖边 1.524 mm / 45°，mode=3） |
| Exercise: Basic Drawing | `3f90c416-34c3-4c02-8ce3-0cdbb98c1761` | `Onshape example: Exercise - Basic Drawing` | 2446.3125 vs 2442.2938 cm³（+0.164%）；纯 UI |
| Postman | `828fc683-c679-40d3-b75c-e6dbe5911eae` | `Onshape example: Postman` | 2.6705 vs 2.6866 cm³（−0.60%）；草图 RPC + UI 拉伸 |
| WARNING LABEL - Bench Vise | `2e2fd3e3-607b-4b20-b8e1-937db350a89f` | `Onshape example: WARNING LABEL - Bench Vise` | 0.819353 vs 0.8193532 mm³（−0.00002%）；3 草图 RPC + 2 次 UI 拉伸；imprintFace add 映射为面域 ADD |
| Exercise - Creating Mate Connectors | `b261311a-3f3a-4800-bebf-1d66bdc8eb93` | `Onshape example: Exercise - Creating Mate Connectors` | 21900.405 vs 21743.326 mm³（+0.72%）；2 body（11861.2 vs 11704.085，+1.34%；10039.2 vs 10039.241）；3 草图 RPC + 3 次 UI 拉伸（含反向移除/完全贯穿/目标实体） |
| Intro to CAD 1.2-1.4 | `342ec346-971f-428f-ae1b-c42517876b6e` | `Onshape example: Intro to CAD 1.2-1.4` | 85157.341 vs 85157.342 mm³（−0.000001%）；单 body；2 草图 RPC（含背面偏移未拉伸草图）+ 1 次 UI 多面域拉伸 |
| WARNING LABEL · Onshape Training ×3 | `f3867be8…`、`8ed53b20…`、`86c7a96f…` | `Onshape example: WARNING LABEL - <doc>` | 三个文档的同一 Part Studio（features JSON sha256 一致）；各 0.8193532 mm³；独立 iModel + changeset，共用同构 9 步演示 |

十二个（9 个独立示例 + 3 个同几何文档）iModel 均已在 hub 中重开验证；重开回归
`e2e/examples/verify-imodels.spec.ts` 一次性 12/12 passed（逐库特征树 + 体积），
证据图在 `apps/web/demo-artifacts/examples/_verify/`；演示页在
`luban-cad/apps/web/demo-artifacts/examples/`。

**已证实的面域引擎缺口（2026-11-05）**：本仓 sketchRegionsFrom 不合并重叠闭环；
Onshape 对“完整圆 + 切线”重叠几何按并集生成单一外环。示例层用精确切点角度的线+半圆弧
重建外环（Mate Connectors 已验证，体积差 +0.72%）；产品层若要直接回放原始实体，需要
面域并集能力（后端改动，需 ADR/回归）。

**union 语义原型结论（2026-11-05，仅研究，未改后端）**：用 core-geometry
`constructAllXYRegionLoops` + `regionBooleanXY(Union, simplifyUnion)` 合并全部排列面，
再把“完整圆边界全部 strict-inside 并集”的圆环作为孔减去，可在 Mate Connectors 原始
实体上精确得到 5930.5823 mm²（外环−两孔），即该例的 Onshape 面域。但对 Quickstart：
Spindle 全排列面并集 Pappus 体积 27816.75 vs 期望 22162.97；Handle 4673.59 vs 8215.94，
说明 Onshape 的 region 0 不是“全部闭环并集”，而是特定连通/嵌套子集；通用 union 改动
不足以复刻，仍需逐示例 profile 映射或更完整的面域引擎。该结论避免重复研究。

**imprint-face 切片 0 spike（2026-11-05，仅研究）**：iOS E1 body 的
`getSubEntityGeometry` 面几何可取：侧面为 `Loop(4)`、上下 cap 为
`ParityRegion(3 children)`（世界系）。整平面 faceRef 可行；但 iOS Extrude 2 选的是
imprint 后的左环**子面**，我们的 cap 尚未按内圆 split，`faceRef(整 cap)` 不等价。
在实现 face imprint/split 之前，iOS/Intermediate 的 imprint-face 步骤继续用“最近草图
面域”近似并在演示页标注；详见 `2026-11-05-imprint-face-extrude-airr.md`（草稿）。

**被动 UI 抓包 probe（2026-11-05，仅研究）**：扫描 `onshape-parity-data` 下 1023 个
browser capture 文件、47486 条 HTTP 条目，**0 条 feature endpoint**。UI 的 HTTP JSON
只有文档/元素/工具栏/权限等元数据，特征树/参数不在其中（大概率在 WebSocket/二进制通道）。
按本 AIRR 非目标不解析内部二进制协议，因此抓包不能替代 features API；UI 抓包只用于
截图/DOM/ARIA 证据。采集限流只能按 `retry-after` 等待并降速，不做客户端规避。

### 回滚

示例 iModel 是测试/演示数据，可删除重建；不涉及产品 schema/迁移。runner 与新项目不改变
生产建模管道。

## 8. 回滚与发布

- 回滚：场景/覆盖矩阵是测试工件，不改生产数据；回退对应提交即可。
- 数据迁移回滚：首版无迁移；若后续新增 schema，按 ADR 提供 down/旧库 fixture。
- 产物/镜像 provenance：实际发版仍走现有 release owner；数据仓提交/tag 独立留痕。
- 兼容窗口：shared/backend 若变更，按 P0-07 同批；否则无需兼容窗口。
- 发布门：`verify-stack`、真栈 e2e、coverage 门禁、known-red 清单全部更新。

---

## 9. 评审结论

- 复用矩阵完成：是
- 跨仓影响明确：是
- P0 例外已登记：现有 X-05/X-14 等仍需跟踪；本 AIRR 不新增例外
- ADR：需要（parity scenario/evidence 契约；以及任何 FeatureOp/schema 变更）
- Owner 签字：用户（2026-11-04 已确认 AIRR）
- 结论：**APPROVED（2026-11-04）**。Batch 1 表格已将数据为空的 Skateboard 替换为
  Tutorial 2 iOS；复用矩阵、单一建模管道、跨仓/发布边界不变。新增 FeatureOp/约束
  仍须单独 ADR + shared 版本 bump。
