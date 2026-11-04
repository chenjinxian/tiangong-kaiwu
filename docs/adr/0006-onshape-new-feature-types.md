# ADR-0006：Onshape 新特征类型与引用几何（分切片设计）

- 状态：已接受（2026-11-05 owner 指示“继承实现下一个特征”）。
  **切片 A（hole）已落地 backend/contract（shared 1.26.0）**；切片 B/C/D 仍待逐个批准。
  UI 对话框因缺少 live 证据仍未实现（不凭空发明控件）。
- 关联：`docs/adr/0004-sketch-contract-onshape-parity.md`、
  `docs/adr/0005-extrude-revolve-contract-onshape-parity.md`、
  `docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md`、
  `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`

## 背景与证据

ADR-0004/0005 已覆盖草图约束（construction/diameter/concentric/angle/tangent）、
extrude/revolve 的方向、终止条件子集与布尔操作。对私有数据仓 131 个已采到
`features` 的文档做特征类型清点，当前能力之外的高频项为：

| 能力 | 出现次数（顶层特征） | 典型示例 |
|---|---:|---|
| `hole` | 303 | Bench Vise、Quickstart、Clamp Handle |
| `cPlane` / `cPoint` | 80 / 106 | Bench SPINDLE、Clamp Handle、Pallet |
| `assignVariable` | 48 | Bench/Quickstart SPINDLE、Feeding |
| `draft` | 60 | Pallet、Clamp Parts |
| `rib` | 23 | Clamp Parts |
| `sheetMetalStart` 等 | 79+ | Bench 大 PS、Feeding 多个 PS（明确不在 Batch 1） |
| `faceBlend` / `moveFace` / `replaceFace` | 33+6+9 | 长尾，后续 |

同一批文档的 features JSON 已提供参数名和引用查询串，但不提供草图实体/约束
明细；UI 截图/DOM 只覆盖默认视图，尚未采集特征对话框。因此本 ADR 的每个切片
都必须同时回答“结构化证据是否足够”和“UI 证据是否足够”，缺一即不得宣称 UI 对齐。

## 决策

本 ADR 只批准**范围、顺序和门禁**；每个切片落地前仍需 owner 对具体 DTO/UI 签字。
统一原则：

1. 新增 `LubanFeatureType`/`FeatureParams` 必须走 `@luban-cad/shared` 版本 bump、
   后端 schema、FeatureDialog、表单模型、旧库 fixture、双端同发布。
2. 优先用现有内核能力（Sweep/Unite/Subtract/Intersect/Taper）组合实现；不得为复刻
   示例新建第二套建模 API 或前端本地几何求值。
3. 非几何特征（`decal`、`mateConnector`）不进入几何验收；可在场景中标为
   `non-geometric`，不得伪造 body/体积。
4. 没有 live UI 证据的控件不新增（可以只落 backend/contract，并在 DM 中登记）。

### 切片 A（建议优先）：`hole` 简单钻孔

目标：覆盖 Onshape `SIMPLE` 孔的大部分示例；不包含螺纹、沉头/埋头、多深度表。

DTO（示意，最终以批准稿为准）：

```ts
export interface HoleParams {
  /** 孔位草图：草图内 point 实体（每点一孔）。 */
  sketchId: string;
  /** 孔的轴线：起始面法向（世界系）；首版由草图平面法向给出。 */
  direction?: "forward" | "backward";
  diameterMm: number;
  endBound: "blind" | "throughAll";
  depthMm?: number;          // blind 必填
  tipAngleDeg?: number;      // 118 或 180（平底）；缺省 118
  /** 只做无螺纹光孔；tapped/counterbore/countersink 明确拒收。 */
}
```

- 求值：每个 sketch point 生成一个圆 profile（直径 = diameterMm，平面 = 草图平面），
  沿法向扫掠 depth（blind）或按上游范围 `throughAllDistance`，用 `Subtract` 从上游
  实体去除；tipAngle<180 时在孔底追加锥形工具（由旋转扫掠生成），**不得**用折线近似。
- 引用：首版只接受本 PS 的 sketch point；`startStyle=PART` + `endStyle=UP_TO_ENTITY`
  等 Onshape 高级形态先登记 `blocked-capability`，不静默降级为 blind。
- UI：需要采集 hole 对话框（位置/直径/深度/终止条件/孔类型）后再实现；无证据前
  只落 contract + backend。
- 测试：schema 接受/拒收；StandaloneDb 单孔盲孔体积 πr²h；throughAll 在板上贯通；
  多孔位置；无上游/无点/零直径拒收；真栈代表面板 e2e。
- 版本：shared minor bump；新增类型 `hole`；无 BIS schema 迁移。

### 切片 B：`cPlane` / `cPoint` 与 `assignVariable`

这三项共同决定“引用几何/参数表达式”的数据事实源，不能只做 UI 占位。

- `cPlane`/`cPoint`：作为特征树中的**引用几何元素**还是草图/特征的参数？本 ADR
  倾向前者：新增引用几何实体（BIS 元素或 Feature 行），所有 sketch plane / axis /
  face 引用通过持久 id 指向它们；禁止把平面坐标复制进每个下游 params。
- `assignVariable`：需要表达式子集（数字、`#var`、四则、括号）和变量求值顺序。
  变量事实源必须是 BIS/params；禁止前端本地求值后再落库（否则改一个变量无法可靠
  重建）。首版可只支持“数字变量 + 下游 params 中的 `{{var}}` 占位”，并在后端
  统一展开；表达式 DSL 需单独 ADR。
- UI：需要 live 证据（变量对话框、基准面创建）后实现。
- 门禁：未批准表达式/引用模型前，不得用 `assignVariable` 行做“空转成功”。

### 切片 C：`draft`/`rib`/非世界平面 `mirror`/feature-face pattern

- `draft`：内核有 `api_taper_faces` 路径，但 TS `createBRepGeometry` 未暴露；需要
  先评估 native 接口扩展（P0-08 溯源）或作为后处理图元。ADR-0005 的 extrude
  `draftAngleDeg` 仍未实现，UI 输入已禁用。
- `rib`：需要筋板轮廓、厚度、拉伸方向与合并规则；不能复用简单 extrude 静默近似。
- 非世界平面 mirror：当前 B4 只做世界 XY/YZ/XZ；任意平面引用依赖切片 B。
- feature/face pattern：当前只有 body pattern；face pattern 需要拓扑引用与内核复制。
- 以上均在切片 A/B 之后逐项立项，不批量实现。

### 切片 D：face-extrude / imprint-face

Tutorial 2 iOS 的 Extrude 2 仍用草图左环面域近似（几何等价，−0.20%）。通用实现
需要“选择实体面 + 轮廓投影 + 沿面法向扫掠”，依赖稳定的 face 引用与 face 轮廓提取；
目前 `resolveFaceRef` 提供持久 face id，但面轮廓提取/扫掠尚未验证。该切片必须有
iOS 场景的全量对拍（不能只靠截图）后再批准。

### 切片 A 实现记录（2026-11-05，shared 1.26.0）

- `LubanFeatureType + "hole"`；`HoleParams`：`sketchId`、`pointIds?`、`diameterMm`、
  `endBound: blind|throughAll`、`depthMm?`、`direction?`、`tipAngleDeg?`。
- 后端：`FeatureTypeRegistry` 注册（同步 `/` `booleanOp=subtract`、`requiresUpstream=true`）；
  `FeatureEngine.evaluateHole` 取草图 point → 两段半圆弧圆 profile → 沿草图法向 Sweep →
  一次 Subtract；throughAll 复用 `throughAllDistance`。首版仅平底（tipAngle 非 180 拒收），
  螺纹/沉头/埋头/up-to-entity 明确拒收。`FeatureService` 跳过 hole 的面域选择校验。
- 验证：`HoleFlow.test.ts` 3/3——throughAll φ4 方块 4000−40π；blind φ2 深 4 两位置；
  `pointIds` 精确选位与非法 id 落 status=1；`FeatureTypeRegistry` schema 正/负路径；
  shared 153/153；web 1334/1334；shared 1.26 真栈 T2 strict 2 passed（体积不变）。
  web `tsc` 绿（暂无 hole 对话框）。
- 仍未实现：hole UI 对话框（需 live 证据）、钻尖/螺纹/沉头/按面 up-to 终止条件。

## 不在本 ADR

- sheet metal、assembly mate、drawing、自定义 FeatureScript（`myFeature`、logoMaker、
  thread）——明确不进入 Batch 1。
- 导入几何（`importForeign`/`importDerived`）的产品化：需要独立的数据导入/许可设计。
- 非几何特征（decal/mateConnector）不产生 body/体积断言。

## 版本、测试与回滚

- 每个切片独立 shared minor bump；不允许把多个无关 FeatureType 捆在一个版本里。
- 旧库：新类型行不存在于旧库；schema additive；提供旧 fixture 首开回归。
- 回滚：删除新类型注册与 UI 入口；旧数据不包含新 params，无需 down migration。
- 测试门禁：schema 正/负路径、StandaloneDb 体积/body 数、真栈 e2e、UI 证据可追溯；
  未采集 UI 证据的切片只能以 backend/contract 状态合并。

## 结果

- 首个建议批准并实施的是切片 A（hole）；它能覆盖 Bench/Quickstart/Clamp 的常见
  钻孔，且无需新增 native API。
- 切片 B（cPlane/variables）是 Bench/Quickstart SPINDLE 完整复刻的前置，需要单独
  的表达式/引用模型签字。
- 在 owner 批准具体切片前，不写产品代码；本 ADR 仅作为待批准设计。
