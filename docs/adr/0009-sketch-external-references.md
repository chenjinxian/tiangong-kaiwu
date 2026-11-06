# ADR-0009：草图外部引用（PROJECTED/PIERCE/INTERSECTED/SILHOUETTED）

- 状态：已接受（计划 W1.5 / 队列 #3；第一切片设计，2026-11-07）。
- 关联：`docs/adr/0004-sketch-contract-onshape-parity.md`、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`。

## 背景与证据

- 语料 224 个有 features 的 Part Studio 中，草图约束缺口最大类：
  **PROJECTED 4775、PIERCE 469、INTERSECTED 210、SILHOUETTED**（另 OFFSET 等）。
  converter 目前把它们统一登记为 `未映射`，几何用 Onshape 已解算坐标保留。
- 对**回放几何**而言，多数场景的投影曲线已包含在 `newSketch` 的已解算实体中
  （例：UJ Drawing Sketch 8 = 17 线 + 4 弧，与 sketches.json 一致），因此这些
  约束缺口主要影响**约束树/参数化完整度**，不是当前多数回放的直接阻塞；
  UJ Drawing 的真阻塞仍是 imprint 实体子面（ADR-0006 切片 D 修正记录）。
- 但产品能力上，草图没有外部引用就无法做“Use/Project”工作流，也无法在
  改上游几何时自动更新投影；这是 W1.5 的产品缺口。

## 决策（分切片）

### 切片 1：外部边投影为固定构造几何（本 ADR 首个实现目标）

1. **契约（shared 增量）**：`SketchEntityDto` 增可选
   `projected?: { source: SketchExternalRef; role: "projected" }` 或新增
   `kind: "projectedCurve"`（二选一在实现前用 schema 实验定；原则是不破坏
   旧实体形态）。`SketchExternalRef = { bodyId: string; kind: "edge" | "face";
   topologyRef: LubanTopologyId; }`（复用持久拓扑 id；面引用取边界边集）。
2. **后端求值**：草图的投影曲线在**求解前**由外部拓扑读取并落为**固定构造
   几何**（不参与 DOF；solver-neutral 输入是固定曲线，不新增求解器约束）。
   读取外部几何走既有 `SolidModelingCommand`（与 faceExtrude 同通道，异步）；
   草图求值需在异步预求值路径完成投影快照。投影曲线带 `source` 引用与
   `sourceHash`（拓扑版本），上游变化时重投影；读取失败=sketch status=1，
   不静默丢弃。
3. **参数化/持久化**：投影结果是派生显示/求解输入，**不是第二套草图事实源**；
   事实源仍是 `params`（含 source 引用与投影快照），重建时按 source 重新投影。
   旧库无该字段=无投影，逐字兼容。
4. **约束**：PROJECTED 约束本切片只作为“产生投影曲线”的来源，不新增求解器
   关系；PIERCE/INTERSECTED/SILHOUETTED 需要点-曲线关系，归切片 2。
5. **UI**：切片 1 不做新工具（无 live 证据前不造控件）；先打通契约/后端/
   回放，UI 的 Use/Project 选择器与标注需采集 Onshape live 证据后另批。

### 切片 2（后续）
- PIERCE（点落曲线）、INTERSECTED（投影交线）、SILHOUETTED（轮廓投影）的
  几何语义与约束关系；曲线族覆盖（弧/样条/椭圆）。
- UI：Use/Project 工具、选择过滤器、投影线样式、失败提示；投影更新传播。
- converter：把 `PROJECTED` 等约束映射为外部引用（无法解析时保持 dropped，
  不猜）；回放时投影曲线作为固定几何加入草图，约束树仍如实登记缺口。

## 非目标

- 不做任意 FeatureScript 查询求值；不做跨文档派生/导入几何（excluded-import）。
- 不改变“草图事实源=params”与“前端 SketchCurvesDecoration 唯一显示源”。
- 不以投影近似替代真实 face split/imprint（ADR-0006 修正记录的边界仍成立）。

## 验证与回滚

- 单元：投影快照生成/更新/失败路径、旧库 fixture、solver-neutral 输入不变。
- 真栈：合成“盒体边 → 新草图投影 → 拉伸”体积验收；真实 PS 至少一个
  PROJECTED 步骤在 tree/status 上诚实（几何对拍优先）。
- 回滚：字段 additive；关闭投影时按旧 params 求值；旧库无需迁移。
