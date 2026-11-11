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

### 批次 6（2026-11-11，CAD Drawings Unit 4 / Ex. 3，UI-only 多体）

- 来源：公开只读文档 `CAD Drawings - Unit 4 - Dimensioning`（`07dbf06d…`，
  Ex. 3 element `277b4512…`），无 features 采集数据；从只读 UI 读取特征树
  `Sketch 1 → Extrude 1 → Sketch 2 → Extrude 2`、Extrude 深度 **0.5 in /
  0.375 in**、4 个零件 `Plate 1/Plate 2/Disc 1/Disc 2`、聚合质量体积
  **254,433.368 mm³**（无逐 part 数据）；截图见私有
  `live/dim-unit4/`，单位=英寸（Onshape 文档单位）。
- 只读文档不能保留副本（Free 订阅仅公开数据可编辑；复制对话框的
  “创建公开文档”未完成），因此按 UI 可见尺寸近似草图：
  两块 8×1 in 板（15/8 个 Ø0.5 孔）、Ø4.75/Ø3.5 in 圆盘（12/6 个 Ø0.25
  螺栓孔），厚度精确。
- **能力缺口（产品）**：一个 NEW extrude 选两个不相交面域 → 产出**一个**
  body（两个 lump），Onshape 产出两个 part（实测两特征→2 body，
  94,763.219 + 217,790.608 mm³）。本 spec 用“每个 part 独立草图 + 拉伸”
  绕过（树 8 特征 vs Onshape 4），不改产品语义。
- 真栈 **256,683.401 vs 254,433.368 mm³（+0.884%）**、4 body、8 特征
  全 status=0、push+冷重开一致；live spec 总数 **11**。

### 批次 7（2026-11-11，CAD Drawings Unit 4 / Ex. 1，featurePattern）

- live runner 新增 `featurePattern` 步骤（源特征名、linear/circular、
  count/spacing/angle、任意世界轴、第二方向）。
- Ex. 1 从只读 UI：树 `Sketch 1 → Extrude 1（NEW 0.5 in）→ Extrude 2
  （完全贯穿去材）→ Linear pattern 1（5×1.25 in + 5×0.875 in 两方向）`，
  1 part `Plate`；聚合体积 **531,718.538 mm³**。
- 按 UI 近似 10×7 in 板 + 一个 Ø0.5 种子孔；Onshape 第 3 步用产品 hole
  建模（树类型 hole vs extrude，显式登记），Linear pattern 1 = 5×5 孔网格。
- 真栈 **533,328.178 vs 531,718.538 mm³（+0.303%）**、1 body、4 特征
  status=0、push+冷重开一致；live spec 总数 **12**。
- Ex. 2/Ex. 4 需要 fillet/chamfer 边选择；live runner 尚无几何边选择器，
  列入下一能力切片（dev-only `readEdgeHandles` 可复用）。

### 批次 8（2026-11-11，CAD Drawings Unit 4 / Ex. 2，approx 跳过圆角倒角）

- UI：树 `Sketch 1 → Extrude 1（NEW 0.75 in）→ Fillet 1（4 边 R0.5 in）→
  Sketch 2 → Extrude 2（NEW 0.5 in，全部合并）→ Chamfer 1（4 边 0.2 in）`，
  1 part `Plate`；聚合体积 **1,187,939.713 mm³**；草图长边 12 in、孔/槽/
  凸台位置按截图近似。
- 构建：12×8 in 板 + 两个 Ø1 in 孔 + 4×1 in 槽（矩形近似）+ 4×3 in 凸台
  （圆角省略）+ add 合并；Fillet 1 / Chamfer 1 以 `skipped` 登记（无几何
  边选择器）。真栈 **1,209,724.448 vs 1,187,939.713（+1.834%）**、1 body、
  4 特征树（2 sketch + 2 extrude）status=0、push+冷重开；live spec 总数 **13**。
- Ex. 4 登记 blocked-capability：1 in 厚板 + 0.75 in 倒角 + 1 in 圆角决定
  主体形状，跳过会使体积/形状失真；其沉头孔/螺纹孔参数已从 UI 记录，待
  边选择器后实现。

### 批次 9（2026-11-11，live fillet/chamfer 几何边选择）

- 新增 `live/edge-select.ts`：dev-only `readEdgeHandles` 枚举 body 边曲线
  （mm 世界系），按 `curveKind` / `direction`（线方向，正负均可）/
  `midpoint` / `lengthMm` + 容差唯一匹配，再走既有 `resolveEdgeRef` RPC
  换持久边引用；零命中/多命中/跨 body 一律失败，不猜任意边 id。
- live runner 新增 `fillet` / `chamfer` 步骤；chamfer 等距离用 mode=2、
  values1=values2=distance，`propagateSmooth` 缺省 true。
- Ex. 2 从“跳过圆角倒角”升级为真实特征：Fillet 1 选 4 条竖角边 R0.5 in、
  Chamfer 1 选 4 条凸台顶边 0.2 in（等距离）；真栈
  **1,202,673.243 vs 1,187,939.713 mm³（+1.240%）**、1 body、6 特征树
  全 status=0、push+冷重开。仍为 approx：槽用矩形近似、凸台圆角省略、
  板尺寸/孔位取自 UI 截图。

### 批次 10（2026-11-11，CAD for Robotics FTC / Flat Spacer）

- 公开文档 `CAD for Robotics - Intro to Onshape - FTC`（`659db894…`），
  Parts element `eb2b4354…`；UI 树 `Sketch 1 → Extrude 1`、1 part
  `Flat Spacer`；已采集 features 给出精确同心圆 Ø19.05/Ø7.874 mm 与
  0.1 in 拉伸，无 Onshape mass 数据。
- 私有 `live-specs/ftc-flat-spacer.json`；真栈 **600.267 vs 解析
  600.274 mm³（0.001%）**、1 body、2 特征 status=0、push+冷重开；
  expected 为解析值（π(9.525²−3.937²)×2.54），已在 spec notes 标注。
  live spec 总数 **14**。

### 批次 11（2026-11-11，Intro to CAD 1.2-1.4 / Extrude Remove）

- 公开文档 `Intro to CAD - 1.2-1.4`（`dfc6e33c…`），Extrude Remove element
  `caa02e4e…`；UI 树 `Sketch 1 → Extrude 1 → Sketch 2`、1 part `Part 1`；
  已采集 features/per-part 给出精确 keyhole 草图（大圆 R25、小圆 R12.5
  在 x=80、两条切线）与 NEW blind 20 mm；体积 **85,157.342 mm³**。
- **区域引擎缺口**：直接提交“整圆 + 两条切线”只识别出大圆区域
  （39,269.699 mm³，−53.9%）；产品不做整圆/直线混合轮廓的求交裁剪。
- 按采集曲线重建**显式圆弧 + 直线**闭合环（大圆外弧 198.1°、小圆外弧
  −171.0°、切线在切点处闭合）→ 真栈 **85,157.178 vs 85,157.342 mm³
  （0.000%）**、1 body、3 特征树 status=0、push+冷重开。Sketch 2 保留为
  未消费草图。live spec 总数 **15**。

### 批次 12（2026-11-11，Suspension / Frame 侧向孔轴修正）

- 之前 Frame 的孔轴全部按拉伸法向近似，只切出边界部分圆柱（+0.930%）。
  按 8 个 mateConnector 解出的 5 个唯一轴重建：
  - 2 个 CAP_VERTEX 端盖法向孔（轴 world X）；
  - 2 个侧面中点孔，轴 **world Z**（对应草图局部 y）；
  - 1 个侧面中点孔，轴 **world Y**（对应草图局部 x）。
- 产品 throughAll 只沿草图平面法向单向切除，因此把辅助草图平面放在
  body 外侧（端盖 x=−20、侧向 Z z=−120、侧向 Y y=−250），用 3 组辅助
  草图 + 3 个 hole 特征表达。
- 真栈 **1,429,774.692 vs 1,422,701.032 mm³（+0.497%）**（原 +0.930%），
  1 body、9 特征树全 status=0、push+冷重开；剩余 +0.497% 可能来自
  3 个重复 mateConnector 条目对应的额外/不同深度孔，未凭空加孔凑体积。
  Onshape 树仍是单个 Hole 1；本 spec 的 3 草图 + 3 孔为显式近似登记。

### 批次 13（2026-11-11，副本创建修正 + DXF 精确草图 + Ex. 4 转绿）

- **副本创建的正确 UI 流程**（此前失败根因）：点击“创建副本以编辑” → 填名称 →
  **在“复制文档到”区域双击“由我所有”行**（单点只会让 OK 显示“待定”；
  双击后 OK 文案变为“创建公开文档”）→ 点击创建。由此得到可编辑副本
  `LubanLiveDimUnit4`（doc `c7e39a98…`，workspace `d1f99f24…`）。
- **DXF 精确草图通道**：可编辑副本中右键草图 → “导出为 DXF/DWG…” →
  格式 DXF → 导出（下载）；解析 LINE/ARC/CIRCLE 得到精确坐标（英寸）。
  这是 live UI 草图最可靠的来源，不再依赖截图估算。
- Ex. 4 重建：Sketch 1 精确轮廓 + 3.5×0.75 槽；Extrude 1 NEW 1 in；
  Chamfer 1 顶左竖边 0.75 in；Fillet 1 左下/右下竖边 R1 in；Sketch 2 两
  孔位（同 y、间距 2 in，点坐标近似）；Hole 1 Ø0.594 沉孔 Ø0.875×82°、
  Hole 2 Ø0.484 沉孔 Ø0.675×82°，均 blind 0.5 in。
- live runner 增加 hole 的 counterbore/countersink/tip 参数透传。真栈
  **510,179.884 vs 509,763.309 mm³（+0.082%）**、1 body、7 特征树全
  status=0、push+冷重开；live spec 总数 **16**。
- 后续：用同一 DXF 通道替换 Ex.1/2/3 的近似草图，逐例升级。

### 批次 14（2026-11-11，Unit 4 Ex.1/2/3 DXF 精确升级）

- 全部草图来自 `LubanLiveDimUnit4` 的 DXF 导出（英寸→毫米）；用
  `LIVE_DEBUG=1` 读取产品 sketch regions，按面积/实体 id 选择正确面域。
- **Ex. 1**：12×6 板 + 右侧竖槽 + 种子圆；Extrude 1 选 plate+circle
  两个面域、Extrude 2 through-all 去种子圆，Linear pattern 5×1.25 in +
  5×0.875 in（第二方向 −Y）→ 真栈 **531,719.415 vs 531,718.538 mm³
  （0.000%）**、1 body、4 特征全 status=0、push+冷重开。
- **Ex. 2**：12×8 板 + 4×0.75 槽 + 两 Ø0.75 孔，Fillet 四竖角 R0.5 in，
  boss 1.75×4.5×0.5 in，Chamfer 四顶边 0.2 in → 真栈
  **1,184,673.352 vs 1,187,939.713 mm³（−0.275%）**、1 body、6 特征。
- **Ex. 3**：两块 8×1 板（15/10 孔）+ 两个 Ø4 圆盘（6/12 孔）；产品多区域
  NEW 合并 body，按 part 拆成 4 草图 + 4 拉伸 → 真栈
  **254,433.650 vs 254,433.368 mm³（0.000%）**、**4 body**、8 特征。
- 三个 spec 均 push+冷重开一致；Ex.1/2/3 的截图近似版本已被精确版本替换。

### 批次 15（2026-11-11，副本流程复用到 COAP Q1）

- 用同一 double-click 流程创建 `LubanLiveCOAPQ1`（doc `5889c03a…`，
  workspace `50e0d584…`）；Base Sketch 导出 DXF 精确坐标。
- 探测：50×50×200 实体 − 40×40×180 型腔 = **212,000 mm³**，与产品
  region [0,1,2] / [0] 实测完全一致；UI mass **205,214.15987 mm³**，
  差值 **6,785.84 mm³** 恰为 2 个 Ø12×30 孔。
- 两个 “Outside Face Holes Sketch” 仅含点，DXF 不导出点；孔位/方向待
  UI 证据，COAP Q1 暂不计入 live registry（base/cavity 已可复现）。

### 批次 16（2026-11-11，Top, Ring, Key）

- 文档 `c969987a…` / element `7ccba0a5…` 为只读公开源，但私有 corpus 已有
  `features.json` + `sketches.json` + per-part mass，故无需创建副本；DXF
  仍可导出，所有草图坐标以 raw sketch（米→mm）为准。
- Top (12)：Sketch1 → Extrude 8 mm NEW → Fillet R3（底边两端竖边）→
  Sketch2 → Revolve FULL ADD（R4.5 内孔，Z8..11 外径 8.5→6）→ Sketch3 →
  Hole C_BORE Ø2.2/Ø4.4×2 THROUGH 三点 → Sketch4 → Extrude through-all
  REMOVE → Sketch5 → Extrude through-all REMOVE（x=−10 面五边形）→
  Chamfer 1 mm（Ø9 孔 start cap 圆边）。
- `live/edge-select.ts` 新增整圆弧 `center` + `radiusMm` 匹配通道及测试。
- 真栈 **2,998.141 vs 2,998.143 mm³（0.000%）**、1 body、12 特征树全
  status=0、push+冷重开；live spec 总数 **17**。

### 批次 17（2026-11-11，Hand Brake Master Cylinder Piston）

- 文档 `91f152e2…` / element `031b0afd…` 的 raw corpus：1 sketch + FULL
  revolve + 1 mm chamfer；75×5 筒身 + R7.5 圆头，绕底部直线旋转。
- 产品的 region 分解为 4 块（筒身 340.501、下半圆 88.357、圆头外段
  53.858、矩形/圆重叠 34.499 mm²），轴以上并集 = [0,2,3]。
- Chamfer 选 revolve 后 x=0 的 R5 整圆弧边（center/radius 通道）。
- 真栈 **7,125.132 vs 7,125.274 mm³（0.002%）**、1 body、3 特征树全
  status=0、push+冷重开；约束 dropped（approx）；live spec 总数 **18**。

### 批次 18（2026-11-11，Creating Mate Connectors / Links）

- raw corpus 的两块链接板：R10 外 stadium + R5 孔，Sketch1 y=0、Sketch2
  y=2 mm，各 NEW 2 mm；Sketch3 在 y=4 mm 用 Ø10 through-all 打开贯穿孔。
- 区域构建经验：外轮廓必须用**精确端点**（raw 浮点）且按 **CCW** 方向；
  3 位小数或顺时针时产品只识别出两个圆区域。
- live runner 新增 `extrude.targetBodyFeatureNames`：解析前序特征各自的
  创建体 → shared v1.68 `targetBodyIds`，单特征逐体求值。
- 真栈 **21,743.327 vs 21,743.326 mm³（0.000%）**、**2 body**
  （11,704.087 / 10,039.240）、3 特征树全 status=0、push+冷重开；
  live spec 总数 **19**。

### 批次 19（2026-11-11，COAP Q1 / Long Fixture Block）

- 可编辑副本 `LubanLiveCOAPQ1`（doc `5889c03a…`，workspace `50e0d584…`）。
  Base Sketch DXF 50×50、Block Extrude symmetric 200；40×40×180 型腔在
  产品里用显式草图重建（源用 Base Sketch imprint 面），base/cavity
  **212,000 mm³** 精确。
- UI 法向视图：两侧面各两个 Ø12 点，位于面中心线、距端部 25/25 mm；
  四个侧壁通孔沿 ±X 贯穿，每个切两段 5 mm 壁（40 mm 材料）。渲染图
  顶/底对齐孔揭示还有一个 Ø12 轴向通孔，贯穿两端 10 mm 端盖
  （20 mm 材料），补齐 UI 质量差 6,785.84 的最后 2,261.8 mm³。
- 真栈 **205,214.310 vs 205,214.160 mm³（0.000%）**、1 body、10 特征
  status=0、push+冷重开。型腔与轴向孔是对 mateConnector/imprint 源的
  显式草图/孔重建，结构 approx。
- live spec 总数 **20**。

### 批次 20（2026-11-11，Bottom Bracket）

- raw corpus：支架全轮廓 revolve（区域 806.82 mm²）+ Ø13×4.5 in 销 NEW
  symmetric + 顶面方形沉孔（内方 10.795 mm 区域）+ 3.175 mm keyway
  的 16× 圆周阵列。
- live runner：revolve 后也跟踪创建 body；`featurePattern`/
  `featureMirror` 新增 `targetBodyFeatureName`；单目标自动用
  `targetBodyId`，多目标用 v1.68 `targetBodyIds`。
- 真栈 **78,972.042 vs 78,748.287 mm³（+0.284%）**、2 body
  （65,281.074 +0.69% / 13,690.969 −1.63%）、9 特征 status=0、
  push+冷重开。**Mirror 1 skipped**：产品 featureMirror 以
  featurePattern 为源为 status=1，未伪造。
- live spec 总数 **21**。

### 批次 21（2026-11-11，Hand Brake / Stirrup）

- raw corpus 两体件：R10 圆柱两向拉伸（35 mm + 50 mm）、中央 9 mm
  槽贯穿、R6 端部凸台、R5×30 端孔、六边形 8 mm 端部切除、
  Ø8×30 对称 Pin。
- 关键：sketchMatrix 是世界系基的**跨列**排列（col0=xDir、
  col1=yDir、col2=normal），不是连续行；按此还原 Sketch3 的 y=−40
  端部凸台与 Sketch4/5 的 y=35 端面。
- 真栈 **14,569.425 vs 15,107.141 mm³（+3.559%）**、2 body
  （13,061.498 / 1,507.927，Pin 0.000%）、12 特征 status=0、
  push+冷重开。
- **approx**：Extrude 4（销孔）/Extrude 6/Fillet 1–3 跳过；约
  538 mm³ 材料差未解，未通过改深度硬凑。live spec 总数 **22**。

### 批次 22（2026-11-11，Universal Joint Flange）

- raw corpus：R60 圆柱（30+120 两向）+ Sketch8 布尔轮廓 REMOVE
  （region1）+ Sketch9 精确轮廓 INTERSECT（region0，through-all
  双向）+ 四个 Ø22×30 顶面螺栓孔。
- 布尔主形 **527,382.652 mm³**；顶孔后真栈 **512,749.542 vs
  483,080.261 mm³（+6.142%）**、1 body、8 特征 status=0、
  5 项 skipped、push+冷重开。
- **approx**：耳孔、Chamfer 10、Fillet 1 与 Sketch10-imprint 的
  Extrude13/14 完整行为未解；仅用于广度/布尔验证，不进 strict
  catalog。live spec 总数 **23**。

### 批次 23（2026-11-11，live shell 面选择通道）

- 新增 `live/face-select.ts`：`readFaceHandles` → 面中心/法向/环数唯一
  匹配 → `resolveFaceRef`；runner 增加 `shell` step。产品语义：
  `defaultDistance=-thickness`（内缩）、`distances=0`；正值为外扩。
- 公共真栈回归 `e2e/examples/live-shell.spec.ts`：20×20×10 盒移除顶面、
  内缩 2 mm → **1952.000 vs 1952.000 mm³（0.000%）**、status=0、
  push+冷重开；面选择器纯匹配测试 3/3。
- Gaiter 已能通过 shell（status=0），但 Fillet 1 仍 blocked-kernel，
  15,703.926 vs 12,270.212（+27.98%），留私有 probes 不计数。
- Universal Joint Assembly 变体区域拓扑与 Flange 不同，探针
  1,008,815.5 vs 602,047.4 mm³，留私有 probes 待重解。
- live spec 总数仍 **23**（shell 为通道能力，暂未新增计数示例）。

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
