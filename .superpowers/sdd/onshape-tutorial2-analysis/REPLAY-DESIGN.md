# 语料回放测试基建设计（corpus-replay）

> 状态：设计稿 v1（2026-10-25）——volume 补提取完成后进入实施。
> 依据：语料实测结构（BTM 树/双形态 massproperties/草图解析几何完整性）+ M6 系列体积金标准方法论。

## 目标

把 137 个 Onshape 官方项目语料（80 个核心特征链 Part Studio）变成我们特征链的**自动化体积对拍回归测试**——「1 个 Tutorial 手工验证」升级为「80 个真实项目持续护栏」。

## 语料实测结构（设计输入，已实证）

- **特征列表**：`features[]` 为 BTM 类型树（BTMSketch-151 / BTMFeature-134 / BTMParameter*）
- **草图几何完整可回放**：`BTMSketch.entities[]` 的 `BTMSketchCurveSegment-155.geometry`：
  - `BTCurveGeometryLine-117 {pntX, pntY, dirX, dirY}` + `startParam/endParam`（参数区间截出线段端点）+ `startPointId/endPointId`
  - 圆/弧形态 `BTCurveGeometryCircle-115`（中心+半径）待实施时逐类型映射
  - `BTMSketch.constraints[]` 约束数组（回放第一波**不用**——见裁决）
- **extrude 参数**：`parameters[]` 的 `endBound=BLIND / depth / oppositeDirection / operationType=NEW|ADD|REMOVE / bodyType=SOLID`（单位=米）
- **体积金标准（双形态）**：massproperties 响应 ①分块 `{message:[chunks]}` join 后 parse；②顶层 `{microversionId, bodies:字典}`——`volume: [精确值, 下界, 上界]` 区间三元组（米³），**金标准=volume[0]**

## 架构（三组件）

### 1. IR 转换器（离线，`corpus-to-ir.js`）
docs/*.json（BTM 树）→ `replay-cases/*.json`（每 PS 一用例）：
```jsonc
{
  "id": "adhesive-clip", "doc": "…", "ps": "Adhesive Clip",
  "units": "meter",
  "sketches": [{ "plane": "XY", "entities": [{"kind":"line","p1":[x,y],"p2":[x,y]}, …] }],
  "features": [{ "type":"extrude", "sketchIndex":0, "distance":0.0125, "operation":"NEW" }, …],
  "expectedVolume": 5.0666e-5, "bodyCount": 1
}
```
- **线段端点还原**：p1 = pnt + dir×startParam；p2 = pnt + dir×endParam（含负参数方向）
- **单位**：语料米；我们契约尺寸语义按 IR 保留米（回放用例内部一致即可，不强制 mm）

### 2. 回放执行器（vitest 参数化，私有仓 `src/feature/CorpusReplay.test.ts`）
- 每 IR 一个用例：StandaloneDb → applyOp(insertSketch) → applyOp(insertFeature)×N → body 查询体积 → 断言
- **对拍口径**：`|我们体积 − expectedVolume| / expectedVolume ≤ 1%`（金标准 ±1% 承自 M6-b T7）
- bodyCount>1 的用例标记 `multi-body`（我们单 body 语义——Wave 1 跳过或求和口径裁决后放开）

### 3. 报告器（跑完输出分类）
- 通过 / 体积偏差 / **不可回放清单**（特征类型缺口→路线图）/ multi-body 跳过

## 分级波次

| 波次 | 特征面 | 预估覆盖 | 依赖 |
|---|---|---|---|
| **Wave 1** | sketch（线/圆/弧）+ extrude（BLIND/NEW） | ~30-40 PS | 零新增——M6-a/b/c 已有 |
| Wave 2 | +revolve/symmetric/复合面域 | +10 | 零新增（M6-b/c 已有） |
| Wave 3 | +fillet/chamfer（**边引用解析**：按求值后体的边几何匹配） | +15 | 引用解析器（新） |
| Wave 4 | pattern/mirror/boolean/moveFace | 长尾 | 逐特征评估 |

## 关键裁决

1. **几何直放优先，约束不回放**：Onshape 约束→我们约束类型不是 1:1，且回放验收口径是**体积**而非约束求解路径——第一波按解析坐标直接生成实体+系统默认约束，约束映射做增强层（后续验证 DOF/矛盾面板时再用）
2. **在私有仓落地**（测试基建同仓）：转换器放 hub 仓 `.superpowers`（工具性质），**IR+执行器入私有仓 `src/feature/corpus/`**（StandaloneDb 测试现场）
3. **多体 PS**：Wave 1 跳过（`multi-body` 标记），口径裁决后放开
4. **不可回放特征诚实记账**：每个 PS 转换时遇到缺口特征（如 Beam/wireConnector 生态特征）→ 整链降级为「截断回放」（到缺口特征为止）+ 清单报告——截断体积不可对拍则只跑建链不断言（烟测级）

## 交付物

1. `corpus-to-ir.js`（hub 仓 .superpowers）+ `replay-cases/*.json`（私有仓）
2. `CorpusReplay.test.ts`（私有仓，参数化）
3. 波次报告（通过率/偏差排行/不可回放清单）

## 实施记录（2026-10-25，Wave 1 收口）

### 转换器 v2（hub 仓 `corpus-to-ir.js` 重写）

首跑 3 用例暴露的坑全数根治，根因如下：

1. **extrude depth=0 根因**：`BTMParameterQuantity-147` 的数值真值在 `expression` 字符串
   （`"200 mm"`/`"25.0*in"`/`"100.0*mm"`/`"45.0*degree"` 等四种形态），`value` 恒 0 且
   `units` 恒空。修复=parseQuantity（单位表 mm/millimeter/in/m/deg/rad…换算米/弧度）。
   语料实证：extrude/depth 全量 130 处 129 处可解析，仅 1 处变量表达式 `#Depth`
   （ConfiguredTextButton）→ 参数缺口停链剔除（诚实记账，非静默近似）。
2. **line 端点 null 根因**：`startParam/endParam` 挂在**线段层**（BTMSketchCurveSegment-155），
   不在 geometry（BTCurveGeometryLine-117 只有 pnt/dir 四字段）——v1 读 geometry 层
   undefined→NaN→JSON null。语料 869/869 线段全带段层参数，修复后零丢弃。
3. **arc 中心/角度缺失根因**：`BTCurveGeometryCircle-115` 字段名是 `xCenter/yCenter/xDir/yDir/
   clockwise`（非 v1 假设的 pntX/pntY）。**弧遍历方向实证裁决**：`clockwise` 只编码遍历方向
   （区域几何无关），占用角区间恒为 [startParam, endParam]（(xDir,yDir) 框架、CCW 增向）——
   证据=全语料切线连续性投票：448 处弧-线相接关节（62 个 cw 弧 + 339 个非 cw 对照）全部
   唯一支持该解释（cw 反向解释 0 票）。转出恒正 sweep（我方 arc DTO 正=CCW）。
4. **无几何实体**（BTMSketchPoint-158/Image/Text 共 147 处）不再误判 unsupported——辅助锚跳过。
5. **面域选择语义缺口（登记）**：Onshape extrude 面域选择=`deterministicIds`（文档级不透明
   短码如 "JGG"），与我方「面积降序下标」无静态映射。诚实降级：deterministicIds 空→全面域
   （`regions:"all"`，执行器运行期按实际面域数全选）；非空→best-effort [0]+regionRisk 标记，
   执行器对面域歧义走子集试拍（见下）。
6. **链截断语义**（设计裁决 4 落地）：非 newSketch/extrude(可解析) 特征出现即停链——有 extrude
   前缀→smoke 用例（建链不断言体积）；无前缀→不产用例（stopReasons 记账）。

### 语料漏斗（诚实数字，设计预估「~30-40 PS」的修正）

654 PS（137 文档）→ 172 带特征树 → **76 带体积金标准**（26 文档 80 目标，4 处未落）→
生态特征 19 / importForeign 坯料链 48 → **9 条非生态非导入链** → 非接线特征停链
（loft×2/revolve/chamfer/fillet/sculptFace/driveTrainGen/pipe）→ **Wave 1 全链体积对拍=1**、
截断 smoke=2（Calculate-Bounds 前缀、Sculpt-Surface 前缀；Drive-Train/Pipe 前缀零 extrude 不产）。
**Wave 1 体积对拍覆盖薄是语料构成所致（76 金标准里 88% 是导入坯料链/生态链），非管线缺陷**；
Wave 2 解锁项=revolve 接线（M6-b 已有）+ 面域级金标准补采（deterministicIds 歧义）。

### 执行器（私有仓 `src/feature/CorpusReplay.test.ts` + `src/feature/corpus/*.json` 同仓提交）

- **单位口径定案**：shared 契约几何数值不携单位（既有测试惯例=数字直放、内部一致），IR 语料
  单位=米（Onshape API 原生 SI）→ **米值直放**，体积对拍同单位闭合（米³）。
- 夹具照抄 M6dEdgeId：ensureHostStarted + StandaloneDb（**每用例独立库**——M6b-T1 上游 Unite
  污染教训）+ FeatureService.for + writeLeases.acquire；applyOp insertSketch（零约束直放，
  underconstrained 放行且解=初值）→ applyOp insertFeature extrude（NEW/ADD=无上游直出/有上游
  Unite，与 Onshape 同语义）→ bodyMeshVolume（elementGeometryRequest replaceBReps +
  PolyfaceQuery.sumTetrahedralVolumes）→ `|v−expected|/expected ≤ 1%`。
- **面域歧义子集试拍**：regionRisk 且目标草图 k>1 面域时，在 2^k−1 非空子集上逐个
  updateParams 试拍（k≤3 ≤7 次内核求值），任一子集 ≤1% 命中→「几何保真✓+选择语义缺口」绿
  （报告记命中子集）；全超差→真·体积超差红。求值失败先钉 tree status 再量体积（防陈旧 body
  读数——首跑实测踩中：annulus sweep 失败后三个子集读出同一陈旧体积）。

### SketchRegions 两处修复（语料回放暴露，探针先行）

1. **桥边豁免**（matchLoopEntityIds）：RegionOps 对嵌套环生成桥边（拼环工艺片段，零面积、
   不承载轮廓语义），其中点落在两环之间、对任何源曲线距离≥半环距，恒超 1e-6 回溯容差——
   v1 直接抛错。修复=无归属片段跳过（桥边），仅整环零归属才抛（真实失效防线）。
2. **闭合曲线预拆两半开弧**（sketchRegionsFrom ⓪）：RegionOps `constructAllXYRegionLoops` 对
   闭合输入（全圆）把嵌套双环**桥缝成单连通环**（探针 A：[disk 3 片, 环带 8 片]）——环带面
   产不出「外环+孔」结构，带桥环送内核 Sweep 自交拒收（op=8 status=65542）。预拆成两半开弧
   =松散输入形态→桥边机制不触发（探针 B：[disk04 2 片, disk05 2 片]）→ 嵌套环走包含树
   ParityRegion 既有已验证通道（探针 C/D 与 T3 对照一致）。注意 `CurvePrimitive` 无 `isClosed`
   属性，闭合判定用 `isPhysicallyClosedCurve()`。

### 首跑结果（3 用例逐个，如实）

| 用例 | 模式 | 结果 | 数字 |
|---|---|---|---|
| Arrows—Helical Flow（双同心圆环带×0.2m） | full | **红（体积超差，归因链完整）** | 面域歧义子集试拍：[0]→9.975e-4（+76.40%，内盘误选）、**[1]→5.566e-4（−1.57%，环带面域=唯一合理子集）**、[0,1]→1.5586e-3（+175.62%，全域） |
| Calculate-Bounds 前缀（1 extrude，后继 imprint 面查询 extrude 不可回放） | smoke | **绿** | 链建起、体 1、全特征 status=0 |
| Sculpt-Surface 前缀（1 extrude，后继 sculptFace 不可接线） | smoke | **绿** | 同上 |

**环带 +1.57% 归因（重要发现）**：不是面域错选（76%/176% 的离谱偏差反衬 [1] 是唯一合理子集）、
不是测量通道失真（方柱棱柱体积逐位精确）——是**内核 Sweep 的圆弧细分地板**：
native WireBodyFromCurveVector 把圆弧线串按 ~29 段细分（单圆盘体积 −0.775%，chordTol 1e-7/
angleTol 0.002/maxEdgeLength 1e-5 全部无效=固化在内核 wire 构建里），环带含内外两圆在 CSG
后实测 −1.57%。**与 M6-b T7 台账 −1.56% 完全同源**（当年登记为「复合面域差距」，本基建将其
精确归因到 sweep wire 细分数）。±1% 门禁按设计保持不动；凡曲线轮廓语料用例都骑这条地板——
后续要么内核侧加密细分（imodel-native WireBodyFromCurveVector），要么引入体积真值通道
（BRep mass properties）替代网格化测量，均登记 Wave 2+ 议题。

### 交付与提交

- hub 仓：`corpus-to-ir.js` v2 + `replay-cases/*.json`（3 例）+ 本台账节。
- 私有仓：`src/feature/CorpusReplay.test.ts` + `src/feature/corpus/*.json` + SketchRegions 两修复，
  单独中文 commit；全回归 `npx vitest run` 与 `npx tsc --noEmit` 口径见 commit 说明。

## Wave 2 实施记录（2026-10-25，①②③均已收口）

### ① revolve 接线（hub `e6a5290300` + 私有仓 `a26f904`）

- IR/执行器支持 revolve：轴经语料段 `BTMSketchCurveSegment.entityId` 长码与派生边查询长码精确映射；
  不是面域短码 `deterministicIds` 的猜测映射。轴实体经 `toSketchDto` 的 entityIds 表换算为 DTO id。
- Cable/Wire Routing—Isomantle 转出 sketch→revolve×3（止于 fillet），smoke 绿；其余 revolve 链在 loft
  先停，**新增 1 smoke、0 full**，不虚报覆盖。全量当时 429 passed+8 skipped，tsc 干净。
- 同批修 known-floor 报告格式化分支（此前会误写「红 链失败」）。

### ② 精确 sweep（imodel-native `063ae72d6` + 私有仓 `56c424f`）

- **Wave 1 的「WireBodyFromCurveVector 粗分」归因被进一步证伪并修正**：wire 产精确 ELLIPSE；
  真因是 `BodyFromSweep` 两站蒙皮（api_skin_wires）形成 SPLINE 面+INTC 近似修剪边，网格化体积
  被折线修剪边钉住（单圆 −0.78%、环带 −1.57%），chordTol 等网格参数无效。
- 修复：直线路径优先复制剖面走 `api_sweep_with_options` 沿矢量，得到 CONE/ELLIPSE 精确解析拓扑；
  拒收或类型不符回退原蒙皮。成功路径**不剥周期面缝边端点**（剥后 api_check_entity 不过、保存/facet
  失败）。`bodyFromExtrusion` 的同类 strip 潜伏项另行挂账，不顺手混改。
- 直核：native gtest **BRepCore 53/53 + PSBRepGeometry 14/14**；私有仓 **53 文件 430 passed+8 skipped**；
  `tsc --noEmit` 干净。Arrows 环带 **−1.57%→0.0001%**（回严格 ±1% 门，known-floor=0）；
  Tutorial2VolumeReplay 实测 **360.526 cm³**（M6-c T6 逐位复现；Onshape 358.2 cm³ ±1% 窗内）。
- FilletFlow 贯穿切断言随之诚实化：distance 3→2 的贯穿切在精确几何下同拓扑逐字节不变，
  不再把旧蒙皮的深度相关假变形当不变式。

### ③ 面域金标准可行性探测（文档证据+当前阻断）

**结论（官方 API 层）：有可行通道，不是只能做子集试拍。** 官方文档确认：

1. `evalFeatureScript`（Part Studio `POST .../featurescript?rollbackBarIndex=...`）可对现有 Part Studio
   执行 lambda；无需改文档特征。
2. `qSketchRegion(sketchId, filterInnerLoops?)` 枚举全部闭合草图面域；
   `transientQueriesToStrings(evaluateQuery(...))` 可把查询结果转成 deterministicIds；
   `evArea(context,{entities:region})` 可逐面域求面积。故可形成
   `deterministicId ↔ area/几何边界` 的活体映射，再与 extrude/revolve 的查询 deterministicIds 对齐。
3. 同一 lambda 通道可用 `evVolume` 求体积，`rollbackBarIndex` 可指定特征链位置；下一步可探测
   逐特征体积时间线，而不是只采最终 PS 体积。是否支持按 body 逐项稳定输出、rollback 索引与
   features[] 的精确对应，需活体实证后才能写成采集契约。

**活体实证（2026-10-25 晚间，已登录后完成，③收口）**：

1. **面域映射成立**（`probe-region-eval.js`，只读）：Helical Flow 的 `qSketchRegion` 返回两区——
   - `JGC`：内圆盘，area=`0.00502654824574367 m²`；
   - `JGG`：环带，area=`0.0028274333882308137 m²`。
   extrude 的 entities query 引用正是 `JGG`——与我方子集试拍命中的 `regions=[1]` 环带完全吻合。
   因此 deterministicIds 可从「不透明短码」升级为「id+面积」精确锚；后续 IR 富化可按 id 选域，
   不再依赖子集试拍。面积相同的面域还需补几何签名（可后续探测 evBox3d/边界），本探针未覆盖该边角。
2. **逐特征体积时间线成立**（`probe-volume-timeline.js`，只读）：同一 Helical Flow
   （features[]=newSketch/extrude/arrow，featureCount=3，rollbackIndex=3）上，
   `evVolume(qEverything())/(meter^3)` 结果：rollback 0→0、1→0、2→`5.654866776461628E-4`、
   3→同值、-1→同值。即 **rollbackBarIndex=已应用特征数**（2=extrude 后，3=arrow 后，-1=tip），
   可采每特征后的总体积并定位第一条发散特征；最终值与 massproperties 金标准逐位一致。
3. **调用注意**：官方 `application/json;charset=UTF-8; qs=0.09` 请求头 + 页面 `XSRF-TOKEN`  cookie
   转 `X-XSRF-TOKEN` 头后 POST 200（首版 vendor 内容类型且未带 XSRF 时 401；未单独二分两者谁为必要条件）。
   探针全程只读，未创建副本、未改文档。

**后续可实施（不属于本波次）**：v3 富化采集器——每 PS 存 `regionId→area` 与 `volumeTimeline[]`，
回放执行器由「最终体积对拍」升级为「逐特征体积对拍+首发散点报告」。

**曾经阻断（已解除）**：2026-10-25 18:5x CDP 页签曾落到 `Sign in`；匿名读取公开文档
`/api/v14/documents/b1d910f6c2407f9e1ec854e5` 返回 403（code 1002）。用户重新登录后上述实证完成。

官方来源：
- Features（deterministicIds/queryString、evalFeatureScript 获取 id）：
  https://onshape-public.github.io/docs/api-adv/featureaccess/
- Evaluating FeatureScript（lambda、rollbackBarIndex、evBox3d 示例）：
  https://onshape-public.github.io/docs/api-adv/fs/
- FeatureScript Standard Library（qSketchRegion/evArea/evVolume）：
  https://cad.onshape.com/FsDoc/library.html

## v3 富化与逐特征回放（2026-10-25，设计确认后实施）

### 范围与数据面

- 首批发力点限现有 **4 个回放用例**（1 full+3 smoke），不全量重爬。
- 新增 `enrich-feature-eval.js`：复用只读 FeatureScript 通道，为每个用例采
  `sketchFeatureId → [{deterministicId, areaM2}]` 与 `rollbackBarIndex → volumeM3`；
  写 `corpus/feature-eval/<caseId>.json` sidecar，**不改原始 docs**。`feature-eval-done.json`
  只做本地断点。Arrows 首次出现单次 CDP 空响应，断点重跑后 **4/4 成功、0 失败**。
- `feature-eval-lib.js` 负责 FSValue 树解析与 lambda 构造（node:test 覆盖）；sidecar 验收
  `enrich-feature-eval.test.js` 对 4 个用例逐项检查区域面积和逐特征体积。

### IR 与执行器

- `corpus-to-ir.js`：用例新增 `docId/elementId/volumeTimeline`，op 新增 `sourceFeatureId`；
  可全量解析的 deterministicIds → `regionAreas`，无法解析继续 `regionRisk`。临时沙盒测试
  `corpus-to-ir.test.js` 证明 sidecar 接入，缺 sidecar 时行为不变。
- `CorpusReplaySupport.ts`：`indicesForAreas`（每个期望面积必须唯一命中，否则回退/失败）
  与 `volumeAtFeature` 纯函数，vitest 3 测。
- `CorpusReplay.test.ts`：
  - 面积锚存在时直接选域，锚存在但无法唯一匹配即失败（不再按旧下标猜）。
  - full 的非歧义特征逐 op 对拍 `sourceFeatureId` 对应 Onshape 体积，直接暴露第一条发散；
    有歧义则先建链再解歧。smoke 有截断点体积即升级前缀体积对拍，否则才 smoke。
  - 多歧义目标按特征序逐个解歧；无效候选记排除而非测试失败。
  - **关键修复**：目标之间不得 `FeatureEngine.cacheFor(db).clear()`——会把上一特征输出缓存
    清掉，下一候选 `preEvaluateDirty` 假性「上游输出缺失」。Isomantle 曾因此出现候选全无效假象。
- shared 契约、native、生产 FeatureService 均未改。

### 实测（当前 4 用例）

- Arrows：`JGG` 面积锚直选环带，full 绿，偏差 **0.0001%**，逐特征 **1/1**；不再靠歧义试拍。
- Calculate-Bounds：截断 extrude 后体积偏差 **0.0000%**，前缀体积绿。
- Sculpt-Surface：同为截断 extrude 后 **0.0000%**，前缀体积绿。
- Isomantle：时间线最初暴露第二 revolve **约 15%** 偏差；先补 smoke 歧义解歧与无效候选跳过，
  再定位到多目标间清缓存导致的上游缺失。修复后前缀体积对拍通过。
- 最终分类目标：full 绿 1 + 前缀体积绿 3；全量回归与 tsc 见当次 commit 记录。

### 仍保留的边界

- sidecar 的面域锚来自 `qSketchRegion`；imprint ±1.0 侧选没有静态确定映射，仍走
  `regionRisk` 试拍，只是现在能用各特征自己的 rollback 体积解歧，而非只能看最终体积。
- 面积相同的多面域仍拒绝猜测；后续若扩大语料范围，可补 evBox3d/边界签名。
- v3 富化采集依赖有效 Onshape 会话；sidecar 与生成后的 replay-cases 已留档，离线回放不需要会话。

## Wave 3（转换器 v5）：fillet/chamfer 接线（2026-10-26）

### 前置阻断与根治：回转体边自身持久 id

- **实证**：Isomantle 三 revolve 后 body **7/7 边无自身持久 id**（对照拉伸体 12/12 有）。
  根因：M6-d T1 的边赋号只在创建门面（adoptBodyInto）与布尔/修改 op 的
  AddUnassignedNodeIds 补号；`SpinBody`（换体/在位）与 `SpinFaces` 两条回转路径都不过，
  fillet/chamfer 的 EdgesFromOwnId 直寻不可达。
- **修复**（imodel-native `a45260923`）：两条路径收口后统一补号——有 id 域 →
  `AddUnassignedNodeIds(highest+1)`（只补未赋值载体）；无 id 域（载体剖面裸 wire）→
  `AssignIdsToNewFaces(body, 1)`。gtest `EdgeOwnId_SpinBodyAssignsIds` 覆盖有号/无号两臂；
  BRepCore **54/54**、PSBRepGeometry **14/14** 全绿；dev 二进制已替换（spike 复验 7/7 有 id）。

### 边引用语义（三处独立体积实证）

- 可解析查询形态：`makeQuery(id+"<源>.opRevolve","SWEPT_EDGE",…)` +
  `originalSetDisambiguation([sketchEntityQuery(…EDGE,"<段长码>"), …])`；一条查询通常携
  **2 条相邻草图边**，被选中的是二者**共享顶点**绕轴扫出的圆边（不是某条边的端点）。
- 证据：Fillet 1（seg13+seg14 共享 (0.04,0.007)）→ 仅 r=0.04/y=0.007 圆边使体积命中
  Onshape（Δ 偏差 **6.2e-11 m³**）；Chamfer 1（seg0+seg1 → r=0.058/y=0.015；
  seg9+seg10 → r=0.053/y=−0.07）双查询同判（**9.2e-13 m³**）；Fillet 2
  （seg12+seg13 共享 (0.04,−0.06)）同语义。
- `qCompressed(...)`（Fillet 5/6/7、Chamfer 2）不可静态解析 → 停链
  `edge-query-unresolvable`，不猜。
- 参数：fillet radius + tangentPropagation；chamfer EQUAL_OFFSETS→mode 1、
  TWO_OFFSETS→mode 2、OFFSET_ANGLE→mode 3；oppositeDirection / variable radius /
  非 CIRCULAR 截面 → 停链。

### 执行器（v5）

- **回转面域就地解歧**：fillet/chamfer 依赖确定上游几何，不能把回转面域歧义留到文末
  统一试拍（会把边特征建在 best-effort 错域上）。回转带时间线锚时逐候选
  updateParams + 该特征 rollback 体积命中；无锚且后续是边特征 → 失败。
- **边引用解析**：草图顶点 → world → 投影到源回转轴得圆心/半径 → 载体枚举 body 边
  （自身 id + 曲线几何）→ Arc3d 圆心/半径匹配（5 µm）→ FilletEdgeRef；匹配不到即失败。
- **双体积门**：绝对 ±1%（沿用）+ **逐特征增量门**（|Δ实采−ΔOnshape| ≤ max(5%·|Δ|,
  1e-9 m³)）——fillet/chamfer 体积变化 ≪ 体量，单靠 ±1% 绝对门会放过错边/漏特征。
- 写租约 30s TTL：长链/多候选前逐次 acquire 续租（spike 实证 updateParams 中途
  「写租约未被本会话持有」坑）。
- 报告扩展：`CORPUS_REPLAY_REPORT=<路径>` 落机读 verdicts（含逐特征最大偏差）。

### 实测（4 用例）

| 用例 | 分类 | 数字 |
|---|---|---|
| Arrows | full 绿 | 0.0001%，逐特征 1/1 |
| **Isomantle** | **前缀体积绿（升级）** | **0.3109%**，截断点 Extrude 1（rollback 9）；**逐特征 7 个**（3 revolve + Fillet 1 + Chamfer 1 + Fillet 2 + Extrude 1） |
| Calculate-Bounds | 前缀体积绿 | 0.0000%，1 个 |
| Sculpt-Surface | 前缀体积绿 | 0.00003%，1 个 |

Isomantle 由 v3 的「3 revolve smoke」升级为跨 fillet/chamfer 的前缀体积对拍；
下一条停链=Extrude 2（operation REMOVE，我方 extrude 未接线 REMOVE）。

### 诚实边界（本波不可达，均实证）

- **mirror / pattern / booleanBodies**（2026-10-25 记录，2026-10-27 更新）：当时 shared
  契约无对应 FeatureParams（仅 extrude/revolve/fillet/chamfer/shell），且 76 个带体积语料
  中这些特征的链均为 importForeign 坯料/生态链或无体积——契约与语料双阻断。**B4（mirror
  v1.13）与 B5（pattern v1.14）已补契约**，契约缺口解除；语料仍不可回放，原因分类登记见
  文末「v7」节（mirror 8 例 / pattern 17 例）。
- **Calculate Bounds 的 chamfer**：Extrude 2 为**面域拉伸**（entities query 无 sketch
  featureId → `targets-0-sketches`），需先做 face-based extrude 产品能力，chamfer 不可达。
- **Fillet 5/6/7、Chamfer 2**：qCompressed 边查询不可静态解析。
- **compositePart / deleteFace / splitPart / loft / sweep**：产品契约未接线。
- **快速路径**：若将来实现 qCompressed 解码器，可解锁 Isomantle 后半链（至 compositePart
  前）与更多语料；优先级取决于产品功能路线图。

## v6（2026-10-26）：qCompressed 解码器交付；后半链被**上游几何保真**阻断

### 解码器（能力已交付）

- `qcompressed-lib.js`：`&<n>$base64` 的 `<n>` 是**十六进制**长度；base64→zlib.inflate→`%B5$`
  内联 DSL，全语料 **2219/2219** 解码通过（1989 内联 + 230 zlib）。`parseEdgeQuery` 提取
  唯一源 op、末位 queryType、isStart、`sketchEntityIds`、`sketchFeatureIds`；多源布尔复合链
  （Fillet 6）→ null。
- IR：IR 实体带 `entityId` 短码；CAP_EDGE 引用 = `{kind:'cap-edge', sourceFeatureId, isStart,
  sketchEntityId}`。短码前缀可精确映射到源拉伸草图的实体（Fillet 5：三个 r=3mm 圆，
  `NFV8fKBSOMIU`/`aJJO9wtj73bz`/`whUbq0LCgS1X`）。
- 私有执行器：REMOVE（BLIND）→ booleanSubtract（内联单闭环 polygon）；CAP_EDGE 精确映射
  （盖面 z + 圆/直线几何）；无短码回退「新生边∩盖面 + 增量体积子集」；逐特征边快照；
  写租约续租；报告含逐特征最大偏差。

### 关键实证：解码器不足以解锁后半链

- Fillet 5 的 3 条 CAP_EDGE 在 Extrude 3 的盖面 z=2.5mm 上**不存在**：近盖面实测只有 8 条
  直线（两个小矩形），三个圆边缺失。
- 区域实测（Sketch 4）：3 个圆 + 2 个小矩形，面积和 = 1.0e-4 m²，Extrude 3 体积增量
  （2.5e-7 m³）完全吻合——**体积对但几何位置不对**：上游 Extrude 1 为 `oppositeDirection=true`、
  Extrude 2 为 `UP_TO_SURFACE+oppositeDirection`，且 Sketch 2-7 依赖面贴合平面（`cPlane`
  未接线）；我方一律默认 XY 平面的 +Z 拉伸把这些小特征放到了错误深度/一侧，导致后续圆边
  被淹没或错位。
- 方法论收获：±1% 总量门对占比 0.02% 的小特征无分辨力；v5 的**增量门**（5%·Δ）才暴露问题。
  故不能以「总量绿」宣称几何保真。

### 裁决

- **严格停链**：Isomantle 停在 Extrude 2（`endBound-UP_TO_SURFACE`），保持 v5 的 7 ops /
  0.3109% 前缀体积绿；REMOVE+UP_TO_SURFACE 不做近似放行。
- 解码器/CAP_EDGE/REMOVE(BLIND) 能力保留为基础设施：未来出现 **BLIND REMOVE + 无面贴合**
  的语料即可直接回放；当前 4 用例无可达覆盖（合成转换器测试在案）。
- 解锁后半链所需的真实产品能力（按依赖序）：① face-based extrude（顺带解锁 Calculate
  chamfer）→ ② 草图面贴合平面（cPlane 语义）→ ③ extrude oppositeDirection / UP_TO_SURFACE。
  仅①不足以让 Isomantle 的 Fillet 5 可达（②/③ 仍缺）。


## v6.3（2026-10-26）：草图平面守卫——Calculate 链达 Chamfer 精确，Isomantle 修正假绿

### 草图平面类别（诚实边界）

语料 `newSketch.sketchPlane` 是**查询**而非显式平面。v6.3 分类：

| 形态 | 判定 | 回放 |
|---|---|---|
| 缺省 `sketchPlane`（合成/旧数据） | Front（兼容契约） | 可消费 |
| `dummyQuery(id+"Front/Top/Right.planeOp",...)` | 基准面帧 | 可消费（2D 刚性映射到 XY） |
| qCompressed 内联/压缩载荷中的 `XplaneOp + DUMMY` | 基准面帧（Arrows 同型） | 可消费 |
| `ORIGINAL_DEPENDENCY` / `derivedFrom` / `SWEPT_FACE` 等派生查询 | 面/边贴合平面 | **停链** `sketch-plane-derived` |

同一基准面的所有草图共享同一映射 → 体积/相对几何保真（Sculpt 全 Top、Arrows 全 Front）；
混合基准面时仅 `NEW`（独立新体，体积可加）放行，`ADD/REMOVE` 停链
`sketch-plane-mixed-frames`（相对位姿不可保真）。派生平面在 Onshape 内部有独立 2D 帧，
语料不携带该帧——不做几何猜测。

### Calculate Bounds：Extrude 1→2→Chamfer 1 全精确

- Sketch 1 = **Top** 基准面（`Top.planeOp`）→ Extrude 1 NEW（独立体，体积可加）；
  Sketch 2 = **Front** → Extrude 2 NEW+symmetric（imprint 面 JCC，面积锚）；
  Chamfer 1 = 3 条混合边：可读 CAP_EDGE（isStart=false）+ 压缩 CAP_EDGE（isStart=true）+
  压缩 SWEPT_EDGE（side=left）→ 执行器精确映射 3 边。
- **精确度**：前缀体积偏差 **6.8e-16 m³（0.0000%）**，逐特征 3/3 全 0.0000%（最大
  @Extrude 2 `FxDFjm3Zp0lsMU0_1`）。
- Extrude 3 被 **Sketch 3 派生平面**阻断：Sketch 3 贴合 Sketch 2 实体 `iRVg…` 经
  Extrude 2（`FxDFjm3Zp0lsMU0_1`）扫出的 `SWEPT_FACE`（与 Chamfer 的 CAP_EDGE 同源
  实体），无独立 2D 帧 → 停链（op 数 3，止于 chamfer `FsfZwGob08VCaxD_2`）。

### Isomantle：撤销 v6 的 0.3109% 假绿

- v6 的 7 ops/0.3109% 含 Extrude 1（Sketch 2 派生平面，ADD）；其增量体积误差 ~69%，
  仅被 ±1% 总量门掩盖——又一「体积绿≠几何保真」实例。
- v6.3 在 Extrude 1 消费 Sketch 2（`ORIGINAL_DEPENDENCY/EDGES`）时停链 → **6 ops**
  （3 revolve + Fillet 1/Chamfer 1/Fillet 2），前缀体积偏差 **0.0001%**，逐特征 6/6
  （最大 0.0001% @Chamfer 1 `F9HRmUDfDB3hvIS_3`）。覆盖率换真实几何保真。

### 验收

`npx vitest run src/feature/CorpusReplay.test.ts` → **4/4 绿**（full 1 + 前缀体积 3）：

```
绿 full  Arrows 0.0001%｜逐特征 1/1
绿 前缀体积 Isomantle 0.0001%｜止于 fillet#FD8O1soRMj2W1I7_3；6 检查（最大 0.0001%）
绿 前缀体积 Calculate 0.0000%｜止于 chamfer#FsfZwGob08VCaxD_2；3 检查（最大 0.0000%）
绿 前缀体积 Sculpt 0.0000%｜止于 extrude#FyIgf73qxJbT1sY_0；1 检查
```

转换器测试 28/28（新增 v6.3 三条：派生平面停链、压缩基准 Front 识别 + NEW 放行、
混合基准面 ADD/REMOVE 停链）。

## v7（2026-10-26）：sketch-on-face planes——产品能力已在，回放侧全链接线完成；采集被限流暂缓

### 关键发现：产品契约 M6-b T1 已支持任意平面

`insertSketch plane?`（SketchPlaneDto origin/normal/xDir，v1.6）+ `sketchPlaneTransformFrom`
（Gram-Schmidt 正交架）+ extrude/revolve 均沿平面法向（FeatureEngine planeToWorld）——
**产品侧无需任何改动**。缺口纯在回放侧：执行器不携带 plane 插草图、边匹配钉死 z 轴。

### 回放侧交付（全部绿）

- **纯函数**（CorpusReplaySupport）：`frameFromPlane(plane, opposite)`（匹配帧；opposite 仅翻
  n）、`worldOf(u,v,w)`、`mirrorYForOpposite`（插入侧等效翻转：平面 normal=−n + 草图 v 取负，
  弧角 θ→−(θ+sweep)）。
- **执行器**：草图按 IR plane 插入（opposite 翻转+镜像；同草图多方向诚实拒收）；
  CAP_EDGE/SWEPT_EDGE 精确匹配与子集回退的盖面判定全部帧化（恒等帧逐点等价旧 z 路径）；
  REMOVE+显式平面停链（内联 polygon 仅恒等平面）。
- **hub 转换器**：`corpus/sketch-planes/*.json` sidecar（evPlane 权威帧）→ 基准面建 W 刚体
  映射（R 行=基准面 x/y/n、t=−R·o）→ 派生平面帧经 W 下发 IR `plane`；`oppositeDirection`
  提取透传；对象帧跨基准面 ADD/REMOVE 放行（升级 v6.3 混合帧停链）；**sidecar 缺席时
  v6.3 语义逐字保留**（回归 4/4 零变化）。
- **合成用例真栈验证**（corpus/synthetic-plane-frame、synthetic-opposite-direction）：
  YZ 斜面矩形拉伸+盖棱 chamfer 帧式精确映射 0.0000%；翻转平面圆拉伸 0.0001%。
  私有仓全量 446 passed + 8 skipped、tsc 干净；hub node 测试 38/38。

### Onshape 采集侧（2026-10-26 实测坑，三项）

1. **XSRF-TOKEN 不再暴露在 document.cookie**——必须从 CDP `Network.getCookies` 取值，
   显式带 `X-XSRF-TOKEN` 头，否则 featurescript POST 恒 401（GET 端点不受影响）。
2. **featurescript POST 反滥用窗口极严**：~14 连发触发 429，`retry-after≈30861s（8.6h）`，
   `x-rate-limit-remaining:0`。探针已改为 3s 节流、单 owner（makeId("")）、429 即中止保
   部分结果、Calculate 先行（1 POST 验证形态）。
3. **FeatureScript map 不支持 `out[key]=value` 赋值**（求值失败 result=null 白烧配额）——
   lambda 一律返回数组（append），调用方拼对象。

### 待办（限流解除后，~2026-10-26 19:00 本地）

跑 `probe-sketch-planes.js`（Calculate Sketch 3 + Isomantle 6 派生面 + 三基准面帧）→
`corpus-to-ir.js` 重新生成（预期 Calculate 4 ops 止于 calculateBounds、Isomantle 7 ops 止于
Extrude 2 UP_TO_SURFACE）→ 拷贝私有仓 corpus → CorpusReplay 全套验收。

## v7（2026-10-27，B4/B5）：mirror / pattern 契约已落地——语料仍不可回放（登记）

B4 起 mirror（shared v1.13）与 B5 起 pattern（shared v1.14，**PART/body 级**）已有
FeatureParams；下述阻断中「shared 契约缺口」已解除，剩余为**语义/上游链**类。两批均
**不尝试回放**（控制器裁决：只登记原因）。

### mirror（8 例，全部不可回放）

| 原因类 | 例数 | 说明（逐例见 B4 任务报告 §5） |
|---|---|---|
| 任意面/基准面引用 | 8 | v1 契约仅世界 XY/YZ/XZ 平面；语料 mirrorPlane 全为面/基准面 query（dummyQuery/planeOp） |
| FEATURE/PART + NEW 新体语义 | 8 | Onshape `MirrorType=FEATURE` 或 `PART` + `NewBodyOperationType=NEW`；v1=整条上游体 + 保留原体 Unite |
| 上游链依赖未支持特征 | 8 | importForeign 导入体、FeatureScript Beam/Frame/wireMesh、moveFace、booleanBodies、compositePart、split、配置相关 suppression |

例：LCD（FEATURE/NEW + 面 plane + moveFace）、FeatureScript Beams Table/Custom Frame/
Weldment/Go Kart（PART/NEW + FS Beam/Frame + 面 plane）、VEX Mecanum Wheel（importForeign +
配置 suppression + booleanBodies/moveFace/circularPattern）。

### pattern（17 例 = linearPattern 5 + circularPattern 6 + surfacePattern 5 + fillPattern 1）

| 原因类 | 例数 | 说明（逐例见 B5 任务报告 §4） |
|---|---|---|
| FEATURE pattern 不在首版契约 | 4 | Isomantle Linear 1、Terminal Block Linear 3、Wire Mesh Linear 1/Circular 1——v1 仅 PART/body pattern |
| PART pattern 链不可保真构建 / NEW 语义 | 7 | Terminal Block Linear 1/2、FeatureScript Beams Cross Frame、VEX V5 四轮：importForeign / FS Beam / moveFace / booleanBodies / 变量 `#Count`；且 `operationType=NEW`（独立新体，非整上游体并集） |
| 面级 FS surface/fill pattern | 6 | FeatureScript Surface Pattern 1-5（`surfacePattern` uCount/vCount/gridAngle + bool ADD/SUBTRACT/NEW_BODIES；链含 loft/thicken/splitPart/draft）、Sheet Metal Parts Fill pattern（HEX 钣金面填充） |

结论：v1.14 PART/body pattern 契约只覆盖「世界轴整条上游体的线性/圆周实例并集」；语料中的
pattern 均为 FEATURE 级或面级 FS 特征，且 PART 例的上游链含未支持特征——全部不可回放。
