# 草图/特征能力补齐 backlog（2026-11-05）

> 目标：把已采集 Onshape 示例中缺失的草图约束、草图实体、特征类型逐项补齐，使
> 复刻不再依赖“逐示例 equivalence 重建”。**这是多切片工程**：每片按 P0-04 先写
> AIRR（必要时 ADR/契约 bump），再做实现 + 单测 + StandaloneDb + 真栈 e2e。
> 本文件是排序与验收基线，不代表所有切片已批准。

## 1. 需求规模（140 个已转换 scenario 中的出现次数）

> 同一文档/Part Studio 可能多行计数；用于排序，不是去重文档数。

### 特征/几何能力

| 缺失项 | scenario 出现次数 | 当前状态 |
|---|---:|---|
| fillet（含生成拓扑边） | 50 | 🟠 内核/FeatureOp 已支持；UI 边拾取已有；生成边/跨布尔稳定性不足 |
| importForeign | 30 | ⚪ 未实现 |
| cPlane / Reference Datum | 33 | 🟠 Slice B1 已实现（三基准面 + 偏移 + 反转法线；草图可落在 cPlane；任意参考面/改参传播归 B2） |
| mirror（特征/面镜像） | 36 | 🟠 FeatureOp `mirror` 支持世界平面；面/基准面引用与 UI 映射不足 |
| mateConnector（非几何） | 38 | ⚪ 未实现；孔位/定位语义 |
| hole 引用缺口 | 19 | 🟠 简单孔/顶点孔/沉头已支持；mate-connector/query 孔位未映射 |
| sheet metal（Start/CornerBreak 等） | 20 | ⚪ 未实现（整域） |
| shell | 15 | 🟠 FeatureOp 支持；UI/owner 通道 gated |
| circularPattern | 14 | 🟠 参数化 pattern 后端支持；converter/UI 接线不足 |
| importDerived | 11 | ⚪ 未实现 |
| linearPattern | 9 | 🟠 同上 |
| transform | 8 | ⚪ 未实现 |
| decal | 8 | ⚪ 非几何，优先级低 |
| rib | 6 | ⚪ 未实现 |
| deleteFace | 6 | ⚪ 未实现 |
| offsetSurface | 3 | ⚪ 未实现 |
| chamfer UI 创建链 | 50+（与 fillet 同一批） | ✅ 2026-11-05 接通（ribbon → 视口拾边 → equal distance；iOS 达 Onshape 目标体积） |
| face imprint/split | iOS/Intermediate 等 | ⚪ 依赖 AIRR `2026-11-05-imprint-face-extrude-airr.md` |

### 草图约束/实体

| 缺失项 | 出现次数 | 当前状态 |
|---|---:|---|
| LENGTH | 71 | ⚪/🟠 |
| MIRROR | 60 | ⚪ |
| COINCIDENT point+line | 76 | ⚪（ref 形态） |
| COINCIDENT circle start/end | 67 | ⚪（ref 形态） |
| DISTANCE refs 不足 | 59 | 🟠 部分 distance 已支持 |
| PROJECTED | 57 | ⚪ |
| VERTICAL（单点形态） | 49 | 🟠 约束本体支持，ref 形态不足 |
| ANGLE | 47 | 🟠 两线 angle 已支持；其他 ref 形态不足 |
| HORIZONTAL（单点形态） | 42 | 🟠 同上 |
| MIDPOINT refs 不足 | 35 | 🟠 |
| OFFSET | 34 | ⚪ |
| CENTERLINE_DIMENSION | 22 | ⚪ |
| PERPENDICULAR refs 不足 | 22 | 🟠 |
| TANGENT refs 不足 | 15 | 🟠 |
| EQUAL refs 不足 | 14 | 🟠 |
| SILHOUETTED | 12 | ⚪ |
| PIERCE | 11 | ⚪ |

草图实体缺口（来自 failed/blocked）：ellipse、conic、periodic/N>2 spline、text、DXF
insert 等在 failed 27 中占主要部分。

## 2. 切片排序（按“解锁示例数 ÷ 风险”）

### Slice 1：chamfer UI 创建链（✅ 2026-11-05 完成）

- 复用 `fillet` 的边拾取/owner/target 通道；开放 `ChamferParams` 到 FeatureDialog；
  ribbon「倒角」改道 new/chamfer。
- Slice 1b：等距/双距离（mode=2）与距离-角度（mode=3）+ 编辑回显。
- 不改 shared 契约（ChamferParams 已有）；只补 UI/门禁/测试。
- 验收证据：Hand Brake 1 条边/1 mm → 7125.270 mm³；iOS 3 条 CAP_EDGE/2 mm →
  **157478.900 mm³ = Onshape 目标**（0.00%）；Sample Assignment 4 竖边
  距离-角度 1.524 mm/45° → 8915.860 mm³（0.00%）；in-session undo/redo 5↔4 特征；
  12/12 iModel 重开回归；web 1344/1344、e2e typecheck/lint 绿。
- AIRR：`2026-11-05-chamfer-ui-airr.md` + `2026-11-05-chamfer-modes-airr.md`
  （均已批准并记录实施证据）。

### Slice 2：草图约束 ref 形态 + 常用缺失约束（下一步）

- 先补 ref 形态（COINCIDENT point+line、circle start/end、HORIZONTAL/VERTICAL 单点、
  DISTANCE/MIDPOINT/PERPENDICULAR 多 ref、EQUAL/TANGENT 补 ref）；
- 再补 PROJECTED/MIRROR/PIERCE/SILHOUETTED/OFFSET/LENGTH/CENTERLINE_DIMENSION。
- 需要 shared `SketchConstraintDto`/solver/backend 同步；ADR-0004 扩展。
- 验收：逐一用 scenario 的约束全量回放，dof/status/几何体积对拍；UI 约束工具可用。

### Slice 3：cPlane/基准面 + 草图落在自定义平面

- **B1 已完成（2026-11-05，shared 1.29.0）**：`cPlane` 特征（Top/Front/Right +
  偏移 + 反转法线）+ `CPlaneDialog` + SketchDialog 平面列表 + 编辑态来源回显；
  `SketchPlaneDto.sourceFeatureId`；被引用时改参/删除拒收；Intro to CAD 真栈 2 passed。
- 复用 `SketchPlaneDto`/草图落库 plane；参考面/边 + 改参传播 + 视口半透明平面渲染归 B1b/B2。

### Slice 3b：cPlane 参考几何扩展（B2）

- 参考图元扩展为面/边/其他 cPlane（持久 id）；cPlane 改参时驱动已引用草图重定位
  （重写 `plane` 快照 + 重解算 + 下游传播）；视口平面渲染/拾取。
- 验收：Mate Connectors 的 x=2/4 平面可由 UI 一次建成；改偏移后草图与下游特征跟随。

### Slice 4：pattern / mirror / hole 引用扩展

- 把 converter 的 linearPattern/circularPattern/mirror/mate-connector 孔位映射到现有
  FeatureOp（pattern/mirror/hole），补 UI 面/轴/基准面引用；
- 验收：对应 blocked 示例逐批可回放。

### Slice 5：face imprint/split（imprint-face 真语义）

- 依赖 `2026-11-05-imprint-face-extrude-airr.md` 的切片 2；实现面 imprint/split 后
  接 `faceRef` 子面选择；iOS/Intermediate 可由近似转精确。

### Slice 6：imports / sheet metal / shell / rib / deleteFace / transform / offsetSurface

- 每一项单独 ADR/AIRR：数据来源/许可、schema、内核能力、UI、迁移/回滚。
- imports 需先确认 STEP/Parasolid 数据来源与授权；sheet metal 是独立子系统。

### Slice 7：草图实体扩展

- ellipse/conic/periodic spline/text/DXF insert；同步 converter→shared→solver→UI→e2e。

## 3. 每片 Definition of Done

1. AIRR 批准（新契约/schema/native/渲染/求解器另需 ADR）；
2. shared 契约变更 bump + 双端同发布（如涉及）；
3. 后端单测 + StandaloneDb/契约 + 真栈 e2e（不得 jsdom-only 宣称完成）；
4. 至少一个真实 Onshape 示例从 blocked 转为完成 iModel，体积/特征树对拍；
5. 更新能力矩阵、接口冻结矩阵、例外登记、演示画廊与验证基线；
6. 回滚：旧路径保留/新键可选；旧库 fixture + 撤销重开证据。

## 4. 2026-11-05 语料复核（决定下一片）

对 `D:\Github\onshape-parity-data\scenarios` 的 140 个 scenario 直接聚合，得到：

- `provenance.status`：**complete 3 / blocked-capability 137**；已转换的 feature 类型只有
  `sketch 719、extrude 615、chamfer 104、revolve 84、hole 35` 五种。
- `provenance.missing` 聚合（按出现次数，同一文档/PS 会重复计数）：
  `fillet` ≈ 168、`sketch LENGTH` 71、`COINCIDENT point+line` 76、
  `MIRROR` 60、`PROJECTED` 57、`VERTICAL/HORIZONTAL 单点` 91、
  `DISTANCE refs 不足` 59、`chamfer 生成拓扑边` 50、`mirror 特征` 70、
  `importForeign` 41、`hole 变体` 47、`cPlane` 33、`pattern` 39、`sheet metal` 20、
  `shell` 15、`assignVariable` 17、`boolean` 19 等。
- **关键判读**：其中 `fillet`、`mirror`、`pattern`、`boolean`、`shell`、`cPlane`
  等多数在 luban-cad **已有 FeatureOp/UI 面**（capabilities.ts 为 full 或后端已支持），
  scenario 标 blocked 主要因为 **v2 converter 未映射**；另有部分文档的 scenario
  `features[]` 不含 raw 树中的 Fillet/Hole/Rib 等特征（converter 直接跳过），
  这类场景不能按 scenario 的 expected 体积手搓复刻。
- 结论（下一片优先级）：
  1. **先补 converter 的既有能力映射**（LENGTH/ANGLE/midpoint refs、fillet 边查询、
     hole 位置、mirror/pattern/boolean 参数）——这是把 137 个 blocked 变成可回放/
     可验证的最低风险路径，不改产品契约。
     已落地第一刀（2026-11-05）：LENGTH、ANGLE、单 line DISTANCE→LENGTH；
     本地重转 82 个受影响 scenario，全部成功，**missing 条目减少 435 条**；
     但由于每个场景仍有其它 blocking 特征，**bucket 变化为 0**（尚无一例
     直接变为 complete）。
     已落地第二刀（2026-11-05）：fillet EDGE 进入 scenario + CAP_EDGE 语义
     选择器（草图实体 + isStart + 上游 op）；私有后端 ScenarioReplay 用
     carrier + SolidModelingCommand 解析为持久边 id，fillet/chamfer 均通过
     合成 StandaloneDb 场景（status=0、体积差 <0.2%）。SWEPT_EDGE、full-round、
     face fillet 仍未支持；真实 CAP_EDGE 场景尚因其它特征不能整链回放。
  2. 产品侧继续按用户可见缺口补 UI（cPlane/自定义平面、2-distance/距离-角度倒角、
     shell owner 通道、face imprint/split）；
  3. 手搓示例只对 scenario 的 `features[]` 与 raw 树一致的 Part Studio 执行，
     不从“被 converter 丢过特征”的 scenario 直接对拍体积。

## 5. 当前不做的项

- 不解析 Onshape WebSocket/二进制协议；不绕过限流。
- 不以“跳过不支持的步骤”伪装完成；blocked 示例继续如实标记。
- 不在未批准前改 shared 契约或后端求值语义。
