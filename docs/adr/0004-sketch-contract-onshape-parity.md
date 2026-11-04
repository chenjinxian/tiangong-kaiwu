# ADR-0004：草图契约扩展（Onshape 草图/约束/尺寸对齐）

- 状态：已接受（2026-11-04；owner 指示继续，分切片实施；第一切片 point+circle coincident 已落地）
- 关联：`docs/superpowers/specs/2026-11-04-onshape-example-replication-airr.md`、
  `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`
- 决策者：LubanCAD 平台团队

## 背景

Onshape 公开示例的草图大量使用当前 shared 1.21.0 未表达的能力：

- `Tutorial 2 - Build Your First Part - iOS` 的 Sketch 1 有 3 个 **DIAMETER** 尺寸，
  且 4 个 line 端点以 coincident 吸附到**整圆**（不是弧）。
- Bench Vise SPINDLE / Quickstart SPINDLE 有 construction 几何、assignVariable、
  cPlane 和额外约束。
- Part Feeding Machine Pallet、Exercise: Clamp 使用 construction、projected、
  mirror、angle 等约束。

当前事实：

- `SketchEntityDto` 没有 construction 标志；`SketchConstraintDto` 只有
  coincident/horizontal/vertical/parallel/perpendicular/equal/distance/radius/length/
  midpoint/tangent/offset/fixed。
- `SketchWireNormalizer` 的 coincident 只接受 point+point 或 point+arc；line 端点吸附
  整圆会被拒收。
- `SketchRegions` 把所有曲线都当作轮廓几何，construction 线会错误参与面域。
- 尺寸全部是 driving；没有 diameter/angle 尺寸，也没有 driven/reference 标志。

这些是 shared RPC 面（`SketchEntityDto`/`SketchConstraintDto`）和求解器契约
（`SolverTypes.ts`）的变更，按 P0-04/P0-07 必须先 ADR。

## 决策

### 1. 数据模型（shared 1.22.0，向后兼容的 additive 变更）

`SketchEntityDto`：

- line/circle/arc/spline 增加 `construction?: boolean`（默认 false）。
- 不新增 centerline 实体类型；centerline 先表示为 `construction: true` 的线，
  revolve 轴仍引用该线 id。后续若需要中心线专属 UI 语义，再加 `role` 字段。

`SketchConstraintDto`：

- 增加 `kind: "diameter"`：circle/arc；`value` 是直径（模型单位）。
- 增加 `kind: "angle"`：两条 line；`value` 是弧度；UI 显示度。
- 增加 `kind: "concentric"`：两个 circle/arc；等价于圆心 coincident，但保留
  Onshape 语义用于 UI 归因。
- 增加 `kind: "projected"`、`"pierce"`：引用外部几何（草图/实体边）；
  `refs` 之外的投影源放在新增可选字段 `externalRefs?: SketchExternalRefDto[]`。
- 增加 `kind: "mirror"`：被镜像实体 + 镜像线；`value` 不使用。
- 增加 `driven?: boolean`：true 表示参考尺寸，只显示不送入求解器；默认 false。

`SketchDto` 增加可选 `constructionEntityIds?: number[]` 派生字段？不——construction
事实源在实体上，派生字段无必要，禁止重复事实源。

### 2. 求解器（SolverTypes.ts + 冻结清单）

- `SolverTypes` 的约束 union 扩展上述 kind；`value` 语义与 shared 一致。
- 映射：
  - diameter → libslvs `SLVS_C_DIAMETER`，valA = diameter（radius 仍 valA = 2r）。
  - angle → `SLVS_C_ANGLE`（或等价线角方程），value 弧度。
  - concentric → 圆心 point+point coincident；UI 归因保留 concentric。
  - driven → 不生成方程，只参与显示/回读。
- **point+circle coincident**：`SketchWireNormalizer` 接受 point + circle，生成
  `SLVS_C_PT_ON_CIRCLE`（ptA=point，entityA=circle，wrkpl=工作平面）。
  `SolverTypes.ts` 的 coincident 形状校验同步接受 `point+circle`/`circle+point`。
  这是 **SolverTypes 冻结契约的变更**（hash 更新，见
  `luban-backend/docs/architecture/interface-freeze.json`），但 shared DTO 形状不变；
  必须有双跑求解器语料覆盖。line+整圆 tangent 未实现，仍按 arc 拆分或后续扩展。
- projected/pierce/mirror 的方程涉及外部几何/对称约束，**不在第一个版本落地**：
  先只接受 DTO 并标记 `blocked-capability`，避免半实现导致错误几何。

### 3. 面域生成

- `SketchRegions` 过滤 `construction === true` 的曲线：construction 曲线参与约束和
  显示，但不参与面域轮廓/孔洞。
- 旧草图没有该字段 → false，行为不变。

### 4. UI 对齐（证据驱动，不自由发挥）

- 草图 ribbon：construction 切换、Use/Project、Mirror、Centerline 按已采集 Onshape
  UI 证据实现；没有证据的交互先不做。
- 尺寸工具：圆默认直径/弧默认半径等默认行为需用 live Onshape 采集确认后钉死；
  未确认前保留“可切换 radius/diameter”的最小实现，不宣称像素级对齐。
- 角度尺寸、参考尺寸的显示与编辑；所有尺寸仍走 `updateSketchConstraint`，不新建
  第二套尺寸 RPC。

### 5. 版本与发布

- shared `LubanFeatureRpcInterface.interfaceVersion` 从 1.21.0 **minor bump 到 1.22.0**。
- backend / web 同批发布；`SolverTypes.ts` 冻结清单更新为新 hash，并附双跑语料。
- 旧数据：新增字段全部可选，旧 params 直接可读；提供 Tutorial 2 gold 旧 fixture
  回归 + 旧库首开测试。
- 回滚：旧客户端忽略新字段；若求解器回归，回退到 1.21.0 并保留新字段透传（不写
  新约束）。

## 备选方案

- **只做回放映射，不改 shared**：diameter→radius/2、construction 丢弃。能跑部分示例，
  但 UI 仍无法创建/显示 Onshape 的能力，且 construction 会污染面域，拒绝。
- **前端本地求值**：违反 P0-06/P0-05，拒绝。
- **引入第二套 sketch schema**：违反 P0-07，拒绝。

## 后果

- 需要 shared/backend/web 三端同批，工作量集中在求解器 conformance 与 UI 证据。
- iOS 示例在 ADR 落地前只能做 blocked-capability 场景；不得宣称完整复刻。
- construction 过滤会改变含 construction 曲线的面域结果——这是修复，不是回归；
  必须用旧 fixture 证明无 construction 的草图结果不变。

## 实现记录（2026-11-04，第一切片）

- 已实现 point+circle coincident：`SketchWireNormalizer.ts`（point+circle 通过）、
  `SlvsSolver.ts`（PT_ON_CIRCLE 构建 + 初值检查）、`SolverTypes.ts`（形状校验 +
  冻结 hash `bc9143…`）、`interface-freeze.json` 同步。
- 验证：`SlvsSolver.test.ts` + `SolverTypes.test.ts` **78/78 passed**；
  `SketchWireNormalizer.test.ts` **5/5 passed**；`tsc --noEmit` 通过。
- iOS 几何回放：私有后端 `Tutorial2IosReplay.test.ts` 通过——DIAMETER→radius/2、
  省略 4 条 line+整圆 tangent（dof=4）、E1 三材料面域 25mm NEW、E2 左环 symmetric
  50mm ADD、Chamfer 2mm 三边；终体积 157.165 cm³（目标 157.479，-0.20%）。
  证明 point+circle coincident 已可用，但完整约束 parity 仍需 tangent+整圆。
- 未实现：tangent line+整圆、construction、DIAMETER/ANGLE/CONCENTRIC 等 shared DTO
  字段；这些仍按本 ADR 后续批次执行。iOS UI 创建链（chamfer/DIAMETER）也待补。
