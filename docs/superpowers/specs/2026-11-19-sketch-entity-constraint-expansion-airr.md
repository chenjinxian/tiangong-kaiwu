# AIRR — 草图实体/约束/求解器/外部引用扩展

- 标题：Sketch entity, constraint, solver and external-reference expansion
- 日期：2026-11-19
- Owner：**已批准（2026-11-19）：S1 对称约束 + S2 槽工具**；其余切片仍待批准
- 关联需求：`docs/superpowers/plans/2026-11-19-onshape-full-parity.md` W1–W2；
  `docs/parity/capability-ledger.json` 的 sketch/constraint/entity 行
- 预计影响仓：`luban-cad`（shared/web/viewer tests）、私有 `luban-backend`（solver/registry）
- 是否需要 ADR：**是**（新增约束 kind/实体类型/外部引用异步读路径属于契约级变更；
  按 P0-04 先 ADR，再按切片实现）

> **状态：Approved（S1/S2，2026-11-19）；S3–S6 仍 Proposed**。S1/S2 按
> ADR-0022 实施；其余切片未批准前不写实现代码。

## 1. 目标与验收

- 目标：把 Onshape 草图的实体、约束、求解、外部引用按 live 行为完整对齐；
  每个新增项具备 UI + 契约 + 后端/求解器 + 持久化/撤销 + 真栈证据。
- 可观察验收：
  - 每个实体/约束在能力账本有 `full` 或显式 `blocked-*` 行；
  - 求解器对拍（DOF/status/failed ids）与 libslvs 结果一致；
  - 真栈 e2e 覆盖创建/编辑/删除/undo/冷重开；
  - 受影响示例 strict 批次通过或登记 blocked。
- 非目标（本 AIRR 不做）：
  - 完整 Onshape 约束求解器替换（绳墨仍在研发，继续 solver-neutral 适配）；
  - 钣金/曲面草图、3D 草图、装配约束；
  - 文本字体引擎的完整排版（仅轮廓接入策略）。

## 2. 现状（2026-11-19 审计）

- 实体：`point/line/circle/arc/spline`（spline 仅精确三次 Bézier）。
- 约束：17 种（coincident/horizontal/vertical/parallel/perpendicular/equal/
  distance/radius/diameter/concentric/angle/length/midpoint/tangent/offset/fixed/mirror）；
  libslvs 适配已有槽位，但组合形态与 UI 槽位未全量审计。
- UI 可见但 gated：ellipse/elliptical arc/conic/text/slot/image、spline 控制点、
  normal/pierce/symmetric/curvature/flow、intersection。
- 外部引用：仅草图→草图投影（ADR-0009 切片 1a）；模型边/面、PROJECTED/PIERCE/
  INTERSECTED/SILHOUETTED 未做。
- libslvs 原语（私有 `native/slvs/include/slvs.h`）：point/line/cubic/circle/
  arc-of-circle；约束含 `SLVS_C_SYMMETRIC*`、tangent、equal 等；**没有** ellipse/
  conic/text 实体，也没有 normal/pierce/curvature/flow 约束。

## 3. 复用决策矩阵

| 能力 | 候选复用 | 覆盖度 | 决策 | 理由/许可 |
|---|---|---|---|---|
| 对称约束 | `SLVS_C_SYMMETRIC_LINE`（已在 `mirror` 内部使用） | 点对+轴线；整实体镜像已有映射 | **复用+扩展** | 不新建求解器；新增 `symmetric` kind，槽位=[点A,点B,轴线] |
| 现有 17 约束组合 | SlvsSolver.ts 现有 kind→SLVS 映射 | 部分实体组合/槽位缺失 | **扩展** | 先补组合与 UI 槽位，不改求解器原语 |
| 槽（slot） | 现有 line/arc/circle + 约束 | Onshape slot 本质是两线+两弧 | **复用组合** | 不新增实体；工具一次写多个实体+约束 |
| 椭圆/椭圆弧 | 无 libslvs 原语 | 0 | **新设计（ADR）** | 需选：精确参数实体+自定义方程 vs 三次段近似；近似不得标 strict |
| 圆锥曲线/文本 | 无原语；文本需字体轮廓 | 0 | **blocked-design** | 先做字体/轮廓许可与求解策略 ADR |
| N 点/周期样条 | libslvs 仅单段 cubic | 部分 | **扩展（多 cubic 段）** | 需段间 G1/G2 约束与 DOF 方案 |
| 图像 | 非几何显示 | 0 | **excluded/显示轨道** | 不计几何 strict |
| 外部引用（模型边/面） | ADR-0009 异步读路径 + 现有投影实体 | 草图→草图已通 | **扩展** | 复用读时重投影、DOF 排除、源变更驱动 |
| PIERCE/INTERSECTED/SILHOUETTED | Onshape reference geometry | 0 | **扩展/blocked-design** | 依赖模型边/面投影与曲线求交；无证据不实现 |
| 法向/曲率/流约束 | 无 libslvs 约束 | 0 | **blocked-design** | 需自定义方程或内核曲线法向/曲率接口；不得用近似符号冒充 |
| 交点约束 | 点-曲线/求交 | 部分 | **扩展** | 与 pierce 共用求交基础设施 |

**规则**：任何“近似椭圆/样条/文本”不得支撑 strict；若采用近似，必须降级 approx
并在能力账本/示例 registry 明示。

## 4. 跨仓影响

| 仓/层 | 契约 | schema/迁移 | native/接口 | 测试 | 发布 |
|---|---|---|---|---|---|
| shared | 新增 constraint kind / entity kind / fields，版本 additive bump | 旧载荷兼容 | — | DTO/opDsl 单测 | 与 backend/web 同批 |
| backend | SlvsSolver 映射、SketchWireNormalizer、regions/tessellation | params 兼容；无 BIS schema 变更 | libslvs 原语不变 | solver conformance/StandaloneDb | 与 shared 同批 |
| web | 工具/拾取/标注/约束 glyph/撤销 | 无 | — | 真栈 e2e | 与 shared/backend 同批 |
| viewer | 新实体渲染/拾取（若新增实体） | — | — | 视觉/拾取 | 随 web |
| imodel-native | 无（本 AIRR 不走几何内核） | — | — | — | — |

- 版本：shared `LubanFeatureRpcInterface` 按切片 additive bump；旧后端收到未知
  kind 必须明确拒收且零变更（不得静默忽略）。
- 发布顺序：shared → backend → web；未批准切片不发布。

## 5. 数据/事务/安全

- 数据事实源：草图 `params`（实体/约束 JSON）+ 求解结果是派生数据，不落库。
- 写路径：`insertSketch`/`updateSketch` 单一 FeatureOp；wholesale 更新；失败零变更。
- 撤销：一次 `updateSketch` 一个事务；工具确认时提交，取消不落库。
- 写租约/限流：沿用现有写租约与 MS 限流；不新增绕过。
- 错误：未知 kind/失效引用/求解失败返回结构化错误并本地化；不得假成功。

## 6. 性能与渲染

- 每新增实体/约束：拾取/悬停 O(实体数)，regions 计算不引入二次爆炸；
- 大草图（≥500 实体）基准：求解/渲染/撤销计时；
- 渲染走现有 iTwin 草图曲线层；不新增第二套渲染管线；
- 视觉基线：约束 glyph/尺寸标注与 live 对齐。

## 7. 测试证据

| 切片 | 单元 | 求解器 | 真栈 | 示例 |
|---|---|---|---|---|
| S1 对称约束 | shared DTO/UI 槽位 | `SYMMETRIC_LINE` DOF/status | 两线/两点+轴线、undo、冷重开 | 受影响草图 |
| S2 槽工具 | 组合实体/约束 | 闭合区域 | 4 种 slot 形态、undo | 含 slot 的 PS |
| S3 现有约束组合 | 槽位矩阵 | 冲突/欠定/冗余 | 各实体组合 | 受影响批次 |
| S4 外部引用（边/面） | 读路径/DOF | 不参与求解 | use/project、源变更、删除级联 | 投影示例 |
| S5 椭圆族（如 ADR 选精确） | DTO/regions | 自定义方程对拍 | 创建/编辑/拉伸 | 含椭圆 PS |
| S6 法向/曲率/流 | 槽位/错误 | 方程/DOF（若可行） | 失败/成功路径 | 受影响 PS |

失败注入：未知 kind、失效引用、求解冲突、写租约过期、冷重开失败；全部 fail closed。

## 8. 回滚与发布

- 能力 flag/gating：新 kind 未批准前保持 gated；shared 未知 kind 拒收。
- 版本兼容：additive；旧库 fixture 读取不崩。
- 回滚：移除工具入口 + shared 版本回退；已写入的新 kind 数据由 migration
  拒绝（或保留只读），不得静默丢弃。
- 发布门：本 AIRR 批准 → 每切片 ADR → shared/backend/web 同批 → 真栈/示例证据。

## 9. 评审结论

- 复用矩阵完成：是（本文件）
- 跨仓影响明确：是
- P0 例外：无（如采用近似椭圆，需登记例外并降级 approx）
- ADR：需要（每个切片一个；S1/S2 可合并）
- Owner 签字：2026-11-19 批准 S1 对称约束 + S2 槽工具
- 结论：**S1/S2 批准；S3–S6 待批准**

## 10. 建议首批切片

1. **S1 对称约束**：`symmetric` kind，refs=[点/实体A, 点/实体B, 轴线]；
   `SLVS_C_SYMMETRIC_LINE`；UI 三槽位；真栈两线与两点用例。
2. **S2 槽工具**：中心-中心/总长/三点等 live 变体，组合现有 line/arc；不新增实体。
3. **S3 约束组合补全**：先审计 17 种约束的实体组合与 UI 槽位，补缺口与冲突测试。
4. **S4 外部引用**：模型边/面投影与 PIERCE 前置；按 ADR-0009 异步路径。
5. 椭圆/conic/text/N 点样条：先出求解策略 ADR，不在首批编码。
