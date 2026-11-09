# ADR-0013：cPlane LINE_ANGLE 基准面（首切片）

- 状态：已接受（2026-11-07；计划 W1.3 / T4 cPlane 补完）。
- 关联：`docs/adr/0006-onshape-new-feature-types.md`（cPlane 家族，B1/B2a 已在
  shared 1.29/1.31 落地）、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`。

## 背景与证据

- 语料 cPlane **271 个特征**，其中 LINE_ANGLE（原始 Onshape 参数
  `cplaneType=LINE_ANGLE`，`entities` 查询 + `offset` + `angle` + `oppositeDirection`/
  `flipAlignment`/`flipNormal`）**34 个**；现有契约只支持三世界基准面 + 法向偏移 +
  平面点，LINE_ANGLE 落库即被 schema 拒收。
- cPlane 家族既有裁决不变（ADR-0006 B1）：**前端是平面快照的唯一计算点**，后端只存
  params 并把上游几何直通；下游草图的 `plane` 是插入时快照，`sourceFeatureId` 指回
  cPlane；被草图引用时改参/删除诚实拒收（快照不传播）。

## 决策（切片 1）

1. **契约（shared 1.40.0）**：`CPlaneParams` 新增
   - `line?: { origin: {x,y,z}; direction: {x,y,z} }`（世界线，direction 须非零）；
   - `angleDeg?: number`（度制，有限数）。
   - 两者**必须成对**出现；与 `offsetMm`/`origin` **互斥**；参考面仍限定
     top/front/right（面/边参考归 B2b）。
2. **平面派生（前端 `internal/cplane.ts`）**：
   - `origin = line.origin`；
   - `u = normalize(n0 − (n0·d)d)`（参考法线在 d⊥ 上的投影；线落在参考面内时即 n0）；
   - `n = u·cosθ + (d × u)·sinθ`（右手定则绕线旋转 θ=angleDeg）；
   - `xDir = normalize(d)` → 平面必然含轴线；`flipNormal` 反转最终法线。
   - 线方向与参考法线平行（`|u|≈0`，无唯一“含线且最近参考面”的解）或任何数值退化
     → 返回 `undefined`（诚实不可解析，不猜）。
3. **后端**：`cPlaneSchema` 严格校验成对/互斥/有限/非零方向；`evaluateCPlaneAsync`
   只做兜底校验并直通上游条目，**不复制平面计算**。
4. **不做**：CPlaneDialog 的 LINE_ANGLE 页签（需 Onshape live 控件证据）、converter
   映射（converter 只映射偏移/平面点）、面/边参考与改参传播（B2b）、
   视口平面渲染。
5. **撤销/事务**：标准 FeatureOp；无不可逆操作。

## 验证与回滚

- 单测：Top+X 轴 45° 法线 (0,−√2/2,√2/2)；Front+X 轴 90° → XY 面；方向归一化/
  反向线；flipNormal；线 ∥ 法线、单给 line/angleDeg、零方向、NaN → undefined。
- 后端：`FeatureTypeRegistry` 校验矩阵（成对/零方向/与 offset/origin 互斥/未知键）。
- 真栈：`e2e/cplane-line-angle.spec.ts`——Top 绕 X 轴 45° 平面草图 20×20 + 拉伸 10
  = **4000.000 mm³**，质心 (10, 3.536, 10.607)；push + 重开一致。
- 回滚：字段 additive；移除 `line/angleDeg` 分支即回到 1.39 行为，旧库无迁移。

## 实现记录（切片 1，2026-11-07）

- 契约 shared **1.40.0**：`CPlaneParams.line/angleDeg`；shared **166/166**。
- 后端 schema/form model 增补；`CPlaneFlow` 3/3、registry/RPC 相关 **50/50**；
  后端全量 **787 passed / 8 skipped**（93 files）。
- Web：`cPlanePlaneFromParams` 增 Rodrigues 分支；`cplane.test.ts` **12/12**；
  web 全量 **1394/1394**。
- 真栈 `e2e/cplane-line-angle.spec.ts` **2 passed**（setup+test，42 s）：
  树 `cPlane → sketch → extrude` 全 status=0，草图平面快照法线/来源指针重开后一致。
- 能力保持 gated（无 UI/converter 映射）；published artifact 仍 1.32。

## 原切片 2 计划（LINE_ANGLE UI 并入切片 3）

- CPlaneDialog LINE_ANGLE 页签（轴线选择器 + 角度 + 方向开关，按 live 证据）；
  面/边参考与改参传播（B2b）；converter 的 `entities`/`oppositeDirection` 语义映射。

## 实现记录（切片 2：LINE_POINT，2026-11-07）

- 契约 shared **1.43.0**：`CPlaneParams.point?: {x,y,z}`；`line` 与 `angleDeg`（LINE_ANGLE）
  或 `point`（LINE_POINT）成对，二者互斥；两者均与 offsetMm/origin 互斥。参考面仍必填
  （本模式不参与计算）。
- 前端 `cPlanePlaneFromParams`：LINE_POINT 平面 = 过线与点的唯一平面，
  `normal = normalize(d × (point − line.origin))`，origin=线原点，xDir=线方向；
  point 在线上（叉积≈0）、缺 line、line+point+angleDeg 同给 → undefined（不猜）。
- 后端 `cPlaneSchema`/`evaluateCPlaneAsync` 形态与守卫同步；求值仍只直通上游条目。
- 单测：web `cplane.test.ts` **15/15**（LINE_POINT 正常/flip/退化）；后端 registry/RPC
  相关 **51/51**；shared 168/168。
- 真栈 `e2e/cplane-line-point.spec.ts` **2 passed**：轴线 X + 过线点 (0,1,1)
  （与 LINE_ANGLE 45° 同一平面）→ 草图 20×20 + 拉伸 10 = **4000.000 mm³**
  质心 (10, 3.536, 10.607)，树/平面快照 push+重开一致。
- 后端全量 **798 passed / 8 skipped**（94 files），web **1418/1418**。
- 能力仍 gated（无 CPlaneDialog LINE_POINT 页签）；converter 未映射
  （3 个 LINE_POINT PS 均非单 blocker）。

## 原切片 3 计划（THREE_POINT 已在下方落地；UI 与 MID_PLANE 仍待）

- CPlaneDialog LINE_ANGLE/LINE_POINT/THREE_POINT 页签（按 live 证据）；MID_PLANE；
  面/边参考与改参传播（B2b）；converter 的 entities/oppositeDirection 语义映射。

## 实现记录（切片 3：THREE_POINT，2026-11-07）

- 契约 shared **1.44.0**：`CPlaneParams.threePoints?: [p1,p2,p3]`；与 line/angleDeg/
  point/offsetMm/origin 全部互斥。参考面仍必填（不参与计算）。
- 前端 `cPlanePlaneFromParams`：origin=p1，normal=normalize((p2−p1)×(p3−p1))，
  xDir=normalize(p2−p1)；三点共线/重合/与其它模式同给 → undefined（不猜）。
- 后端 schema/求值器/表单同步；单测 web `cplane.test.ts` **17/17**、后端
  registry/RPC **52/52**；shared 168/168。
- 真栈 `e2e/cplane-three-point.spec.ts` **2 passed**：三点 (0,0,0)/(1,0,0)/(0,1,1)
  （与 LINE_ANGLE 45° 同一平面）→ 草图 20×20 + 拉伸 10 = **4000.000 mm³**
  质心 (10, 3.536, 10.607)，树/平面快照 push+重开一致。
- 后端全量 **799 passed / 8 skipped**（94 files），web **1420/1420**。
- 能力仍 gated（无 CPlaneDialog THREE_POINT 页签）；converter 未映射（1 个
  THREE_POINT 特征，非单 blocker）。MID_PLANE（7 个特征）仍待——需要双面/双平面
  引用语义，留后续切片。
