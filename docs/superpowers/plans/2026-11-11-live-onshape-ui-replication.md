# Onshape 实时 UI 副本复刻计划（2026-11-11 策略切换）

**状态**：已立项，替代“API 全量采集后再建”的主线；2026-11-11 起执行。

## 1. 背景与裁决

Onshape features API 的 429 窗口已到约 21 小时，且现有 317 个带 features 的
Part Studio 中仍有大量缺口；6244 条 PROJECTED 约束的 `external0` 查询
`queryString` 全为空，只有 deterministicIds，converter 无法从离线数据恢复。
按原路线补齐全部 1685 个 PS 可能要以月/年计。

用户 2026-11-11 裁决：

> 直接打开 Onshape 并创建副本进入编辑模式，分析每个 Part 的特征树、草图和
> 约束，在 luban-cad 中创建对应 Part；UI 可显示的体/面几何属性一并记录。
> 先做出来验证全套技术方案和 BRepCore，无法与 Onshape 完全一致没关系，
> 后续再慢慢对比验证。

因此本计划的目标改为**广度优先的可复刻示例实现**，严格对拍降级为后续验证，
不把 approximate 结果冒充 strict。

## 2. 口径

### 纳入

- 公开、可创建副本的 Onshape 文档中的 Part Studio。
- 原生草图 + 标准特征；一个 Part Studio 的多 body 全部保留。
- 每个复刻结果有：特征树类型/顺序、草图来源、逐 body 数、近似体积/包围盒、
  截图、实现状态和缺口登记。
- 允许近似：草图/约束/尺寸无法从 UI 精确读取时，用可复现的近似并明确标记；
  不得静默丢特征或把近似标成 strict。

### 排除

- 修改公开原文档；只在副本中操作。
- 用 STEP/Parasolid 导入代替特征树复刻（P0-01/P0-09 边界）。
- 私有/无权限文档；装配/工程图本身（只复刻其中独立 Part Studio）。
- API 批量抓取作为主路径；API 仅保留为可选补充，不绕过限流。

### 状态

- `exact`：特征树/草图/几何均由 UI 证据还原，体积/体数在约定容差内。
- `approx`：特征树按 UI 还原，草图/尺寸/选择器有明确近似或缺失，几何可运行。
- `blocked-*`：缺少产品特征/内核能力/UI 证据；必须登记，不伪造。

`/examples` 公共目录仍只收 strict；`approx` 先进入私有 live registry，
通过严格对比后再升级公共目录。

## 3. 流水线

### L0 会话与副本（人工登录一次）

- 使用 `D:\ChromeProfiles\onshape-capture` CDP Chrome（9222）；账号密码不由
  仓库/脚本保存，登录由用户在该窗口完成。
- 每个公开文档只创建**一个**可编辑副本，记录 `docId → copyDocId/copyUrl/
  copiedAt/owner` 到私有 `staging/live-copies.json`（幂等；已存在则复用）。
- 副本统一放在专用文件夹（例如 `LubanCAD live examples`），不污染原文档。
  首个副本 `LubanLivePostman` 暂放在“由我所有”根（复制对话框需先点选
  “由我所有”行才能启用确认）；后续批次先建专用文件夹并复用映射。
- UI 操作限速：单标签串行、无并发复制；遇 429/弹窗按页面实际提示停批。

### L1 特征树与对话框采集

对副本的每个 Part Studio：

1. 打开 Part Studio，等待特征树稳定；采集特征行（名称/类型图标/顺序/
   suppressed/错误标记）。
2. 逐个特征打开编辑对话框，采集 `.os-parameter-list-item` 的
   `parameterId/label/value/selection`、tab、截图；Escape 取消，不写副本。
3. 采集草图入口截图；尽量展开“显示约束”，记录约束图标/尺寸标注；如有
   “导出 DXF/草图”入口则使用 UI 导出，作为草图几何的精确来源。
4. 采集最终体/面属性：Measure/Properties 的逐 body 体积、包围盒、面数、
   面积、质心；截图。
5. 产物写入私有 `live/<docId>/<elementId>/`：`tree.json`、`dialogs.json`、
   `sketch-*.png/dxf`、`body-properties.json`、`screenshots/`。

### L2 归一化

新增私有 `tools/live/normalize-live-spec.mjs`，把 L1 产物转成
`live-spec.json`（schema 复用 ParityScenario 的 feature 形状，新增
`provenance.mode: "live-ui"`、`feature.status`、`approxReasons`）。
草图几何优先来自 DXF/UI 实体；缺失坐标时按截图/尺寸近似并登记。

### L3 luban-cad 建 Part

新增公共 `apps/web/e2e/examples/live/`：

- `build-live-spec.ts`：读 live-spec，经现有 FeatureOp/RPC 建 iModel +
  Part Studio；草图用 `insertSketch`，特征用 `insertFeature`；每个步骤记录
  实际 featureId/status。
- 不支持的特征/选择器 → 停止该 Part，登记 `blocked-capability`，不丢步骤。
- 允许“近似几何”步骤，但必须写入 `approxReasons`，且不得用 strict 断言。

### L4 验证与目录

- 硬门：树类型/顺序、status=0、body 数；软门：逐体体积/包围盒偏差、面数。
- 每例输出截图、tree/body 证据、spec hash、验证时间。
- 私有 live registry 记录 `exact/approx/blocked`；公共 `/examples` 只升级
  通过严格对拍的例子。
- 不修改既有 22 个 strict 示例的断言。

## 4. 批次顺序

1. **L-first（先做 5 个）**：≤5 特征、1 body、无 import/sheet metal/
   custom FeatureScript。优先从现有 index 的 `geometry-ready` 和简单
   `blocked-converter` 中选，例如 Postman / Brain Screen、Intro to CAD
   Extrude Remove、O-Ring 类小件。
2. **L-core**：现有 22 个 strict 示例之外的简单原生 PS，按特征数/体数升序。
3. **L-gap**：按缺失特征频次推进 draft/rib/deleteBodies/moveFace/splitPart/
   PROJECTED 等；每补一个能力，重跑受影响批次。
4. **L-wide**：多 PS 文档、多 body、较大特征树；先做打开/复制/截图性能基线。
5. **L-strict**：对已实现的 approx 例逐批做严格对拍，升级公共目录。

## 5. 首个纵向切片（立即执行）

目标：**Postman / Brain Screen**（Sketch 1 → Extrude 1 → Decal 1，1 body，
目标约 2686.59 mm³；公开文档 `30416b6b359a60a141297ad9`，PS
`33a4bc9ff219a1b984926eb4`）。

步骤：

1. 在 CDP Chrome 登录 Onshape（人工），复制该文档到 live 文件夹。
2. 采集特征树、Extrude 1 对话框、草图截图/DXF、最终 body 属性。
3. 归一化 live-spec；在 luban-cad 建 Part Studio；
   `decal` 作为非几何跳过并登记。
4. 验证：树 `sketch/extrude/(decal skipped)`、1 body、体积/包围盒近似；
   截图 + 证据入私有 live registry。
5. 记录 UI 选择器/复制流程中遇到的问题，固化 `tools/live/*`。

### 首切片执行记录（2026-11-11）

- 已通过 CDP Chrome 打开公开 Postman 文档并点击“创建副本以编辑”，创建
  `LubanLivePostman`（copy doc `07814477…`，workspace `3e7d2f8b…`）；
  Brain Screen 副本 element `413fd0fa…`。复制流程：点击按钮 → 填文档名 →
  **必须点击目标文件夹行“由我所有”**（否则确认按钮保持 disabled）→ 确认。
- UI 证据：特征树 `Sketch 1 → Extrude 1 → Decal 1`；Extrude 1 为实体/新建/
  给定深度 0.02 in；质量属性体积 0.164 in³、曲面面积 16.891 in²；选中面
  面积 8.328 in²；brain.png 471×268。草图平面是 Context 1 面，草图无可见
  尺寸标注，矩形按面面积 + 贴图比例推得 97.155×55.296 mm。
- luban-cad：新增公共 `e2e/examples/live/{live-spec,run-live}.ts` 与
  `live-registry.spec.ts`；私有 `live-specs/postman-brain-screen.json`。
  建 Sketch 1（XY 近似平面）+ 0.5 mm 新建拉伸，Decal 记为 skipped；
  真栈 **2686.141 vs 2686.592 mm³（0.017%）**，1 body、树/status 0、
  push+冷重开一致。
- 结论：live UI → 私有 spec → luban-cad 的通路已闭环；下一步按 L-first
  扩展到更多 ≤5 特征/1 body 的公开 PS，并把 2-feature Pin/Bushing 类
  作为批次 2。

### 批次 2（2026-11-11，corpus-assisted live specs）

新增 5 个 2-feature 原生 PS，使用已采集 features（converter complete）生成
live-spec，不新增 API 采集：

| 示例 | 特征 | 结果 |
|---|---|---|
| Exercise: Branching / Pin | Sketch Ø44.45 → 139.7 symmetric NEW | 216,783.995 vs 216,785.294（0.001%） |
| Exercise: Engine / Pin | 同上 | 216,783.995（0.001%） |
| Tutorial 1 / Bushing | R5 → 41.5036 symmetric NEW | 3,259.620 vs 3,259.685（0.002%） |
| CAD for Robotics / Parts | 同心圆 → 2.54 NEW | 树/体数/冷重开通过；region 0 近似，待 UI mass |
| COAP Question 2 / Press-Fit Cap | 24×24 → 25 NEW | 树/体数/冷重开通过；待 UI mass |

`live-registry.spec.ts` 共 6 个 spec；逐例独立 iModel。symmetry 语义：
Onshape `symmetric=true` 时忽略 `oppositeDirection`（产品 direction 与
symmetric 互斥）。

### 批次 3（2026-11-11，revolve）

- Tutorial 1 / O-Ring：line+circle 轮廓绕构造轴全周旋转，**454.910 vs
  454.927 mm³（0.004%）**，1 body、冷重开一致。
- Worm Gear Shaft / Shaft：多段轮廓全周旋转；草图含产品 normalizer 不支持的
  line+line coincident，spec 设 `skipConstraints: true` 保留已解坐标（approx）；
  树/体数/冷重开通过，待 UI mass。
- live runner 增加 `revolve` 步骤与 spec 级 `skipConstraints`；现共 8 个
  live spec。下一步：hole/chamfer/mirror 支持与 geometry-ready 批次。

### 批次 4（2026-11-11，Suspension / Frame，live UI 副本 + hole）

- 通过 UI 创建 Suspension 公开文档的可编辑副本 `LubanLiveSuspension`
  （doc `1f38a35f…`，workspace `1fa8e3a…`）；Frame element `d7700526…`。
- UI 证据：特征树 `Origin/Top/Front/Right/Sketch 1/Extrude 2/Hole 1/Sketch 2`、
  1 body；mass 面板体积 **1,422,701.03235 mm³**、曲面面积
  148,707.62744 mm²；Hole 1 对话框 8 个 mateConnector、ISO M5 间隙孔
  Ø5.5、完全贯穿；截图 `live/suspension/frame/`。
- 从 features.json 解码 Sketch 1：25 条直线构成单一闭合轮廓（局部坐标
  −195…275 × −95…100 mm）；Extrude 2 NEW symmetric 30 mm；Hole 1 的 8 个
  mateConnector 按查询解出 5 个唯一位置（3 个重复：两条横边中点、一条竖边
  中点、两个 CAP_VERTEX）→ 草图点。
- live runner 新增 `hole` 步骤（`pointEntityIds` + `diameterMm` +
  `endBound`），私有 `live-specs/suspension-frame.json`；真栈构建
  **1,435,929.669 vs 1,422,701.032（+0.930%）**，树 4 特征全 status=0、
  1 body、push+冷重开一致。
- **近似边界（显式）**：孔轴未还原 mateConnector 法向——Onshape 的侧
  面孔实际沿草图边法向横穿，本切片按草图和拉伸法向打孔且点位在轮廓边界，
  只切出部分圆柱；因此体积恰在 1% 内但孔形/孔向不等于 Onshape。约束未采集。
  后续若需侧向孔，应新增“辅助平面草图 + 挤出切除”步骤或孔轴扩展。

### 批次 5（2026-11-11，featureMirror：DRILL HOTD / ENG_BEARING）

- live runner 新增 `featureMirror` 步骤（`sourceFeatureName` 运行时解析、
  任意世界平面 `planeLine`）；特征名→featureId 映射覆盖全部步骤。
- 私有 `live-specs/eng-bearing.json`（corpus-assisted，已采集 features +
  per-part 质量）：同心圆 Ø27.5/Ø12、NEW symmetric 8 mm；顶盖环槽
  Ø25/Ø15 REMOVE 2 mm（z=4 近似平面、backward）；Mirror 1 = 对 Extrude 2
  做 FEATURE mirror（Top 平面，operation NEW → 镜像切除）。
- 真栈 **2590.224 vs 2590.243 mm³（0.001%）**，5 特征树全 status=0、
  1 body、push+冷重开一致；解析校验
  π(13.75²−6²)·8 − 2·π(12.5²−7.5²)·2 = 2589.86 mm³。
- 近似：Sketch 2 平面固定 z=4（Onshape 为端盖面引用）；约束未采集。
  live spec 总数 **10**。

## 6. 风险与门禁

- **登录/会话**：账号密码不入库；会话失效即停批，请用户重新登录。
- **复制配额/文档所有权**：副本只建在专用文件夹；重复运行必须复用映射。
- **UI 变化**：Onshape DOM 可能更新；选择器集中在 `tools/lib/onshape-ui.mjs`，
  失败时截图并停批，不盲改。
- **草图精度**：UI 尺寸/约束可能不完整；approx 必须显式，先用几何形状与
  体数验证 BRepCore，后续再补严格对比。
- **P0**：仍走 FeatureOp/标准事务；不改公开原文档；不引入第二套建模管道。
- **提交**：只提交代码/脱敏文档；原始截图/坐标/副本 id 留私有仓。

## 7. 交付指标

- 新增 `approx` 示例数、逐例树/体数/体积偏差。
- 由 live UI 证据覆盖的特征类型/草图实体/约束统计。
- 因产品能力或内核阻塞的 feature 清单（用于 B5/B7 优先级）。
- 至少 1 个 live 示例完成“复制→采集→建 Part→验证→证据”闭环后，再扩批。
