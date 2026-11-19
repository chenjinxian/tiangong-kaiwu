# ADR-0021 — ACIS 暴露面扩展与内核边界

- 状态：**Proposed（草案，2026-11-19；未批准前不新增 PSBRep op/editor IPC/backend evaluator）**
- 日期：2026-11-19
- 关联：`docs/superpowers/plans/2026-11-19-onshape-full-parity.md`（W4）；
  `docs/parity/KERNEL-BOUNDARIES.md`；私有 `imodel-native/docs/audit/ACIS-EXPOSURE-MATRIX.md`；
  `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（批准后登记 op/接口）
- 影响仓：私有 `imodel-native`（native/PSBRep/ctest）、`luban-cad`（editor IPC）、
  私有 `luban-backend`（evaluator）、`luban-cad/packages/shared`（新增 FeatureOp 时）
- 先例：P0-04（ADR 先于编码）、P0-07（shared 双端同发布）、P0-09（ACIS 授权范围）

## 1. 背景

全量 Onshape 复刻需要补齐 draft、deleteFace/deleteEdges、thicken、surface 族、
emboss、split/trim 等特征；当前缺口不是“没有几何代码”，而是三类：

1. `SolidKernel.h` 已有实现、但缺 PSBRep op / editor IPC / backend evaluator
   （TaperFaces、OffsetBody、IntersectSheetFaces、DisjoinBody、ConvertSolidToSheet 等）；
2. 已有 wire 但存在已知缺陷或陈旧假设（DeleteFaces 补洞、TransformSubEntity 的
   backend 注释、ThickenSheet 的许可判定）；
3. 许可/内核边界（ThickenSheet 的 InterOp 嫌疑、普通面删除 healing、多边 blend）。

若无统一协议，容易把“原生能跑”误当成“产品可上线”，或用近似几何冒充 strict。

## 2. 决策

### 2.1 许可与范围

- 只使用 **ACIS Modeler + Polyhedra**；InterOp、healing、STEP 不接线。
- ThickenSheet 维持 `blocked-license`：私有原生测试注记明确其为 InterOp 未授权路径，
  即使原生 smoke 可跑也不产品化。
- 普通盒面 DeleteFaces 维持 `blocked-kernel`：邻面补不拢，需共面分裂种子；不得用
  近似补面。
- 其他目标 op 的许可判定与 v0 结论见 `KERNEL-BOUNDARIES.md`；逐 op 证据在私有矩阵。

### 2.2 暴露协议（强制顺序）

每个新 op 必须依次完成，前一步不通过不得进入下一步：

1. **许可审计**：确认 API 属于 Modeler/Polyhedra；记录 include 与调用点。
2. **原生探针**：新增 ctest（成功、失败、回滚、体积/面数/拓扑断言），不得只写结论。
3. **PSBRep op**：新增 opcode + props + 参数校验 + 幂等/失败回滚。
4. **editor IPC**：在 `EditorBuiltInIpc.ts` 增类型，在 `EditBuiltInCommand.ts` 增方法；
   接口面变更须登记接口冻结矩阵。
5. **backend evaluator**：只走 `FeatureOp`/FeatureTypeRegistry；失败 status=1、保留旧几何；
   可撤销事务。
6. **shared 契约**：仅当需要新特征类型/字段时 bump 版本，shared→backend→web 同批。
7. **真栈 + 示例批次**：目标 spec + 受影响示例 strict/blocked 证据；更新能力账本。

禁止：未探针接线、手改生成产物、第二套几何/建模管道、用 `record/test.fail` 或近似
几何支撑 full/strict。

### 2.3 首批 op 决定

| op | 决定 | 前置 |
|---|---|---|
| TaperFaces（draft/bodyDraft） | `expose` | ctest → PSBRep op（建议 37）→ editor → backend |
| DeleteFaces | `blocked-kernel` | 共面分裂种子或明确边界 |
| DeleteEdges | `expose`（先补 ctest） | 边删除/面合并语义 |
| ThickenSheet | `blocked-license` | 不接线 |
| SweepFaces | `expose`（先补 ctest） | 面扫掠路径/方向/回滚 |
| OffsetBody | `expose` | 新增 editor 方法（原生 smoke 已过） |
| OffsetEdges | `expose`（先补 ctest） | 传播/方向 |
| Emboss | `expose`（先补 ctest） | 工具片方向/失败 |
| IntersectSheetFaces | `expose`（先补 ctest） | 片体求交/空交 |
| TransformSubEntity | `fix` | 更新 backend 陈旧注释；真栈复证 |
| BooleanCut / Sew / BodyFromExtrusionToBody | `existing` | 产品接线按需 |
| DisjoinBody / ConvertSolidToSheet | `expose` | 原生 smoke 已过 |

### 2.4 状态与回滚

- 能力账本 `kernelRef` 只写本 ADR/边界表的结论；不写原始错误码。
- 新 op 以 capability flag/FeatureType 注册为可移除单元；native op 可回退重建，
  backend 旧库不识别新 op = 拒收且零变更。
- 示例 strict 依赖的能力未 full 时不得标 strict；涉及新 op 的示例先 blocked 后晋升。

## 3. 备选方案

1. **真形（TrueForm）直接实现全部缺失族**：长期方向，但当前 M0，无法承担全部特征；
   ACIS 暴露是近期唯一可验证路径。
2. **用近似几何/后处理伪造能力**：违反 P0-10 与“不伪造”，拒绝。
3. **只做 UI gated、不接内核**：无法达到 strict/full，且用户明确要求全量严格复刻，拒绝。

## 4. 后果

- 正向：在不越许可边界的前提下，把已存在的 ACIS 能力产品化；每个 op 有 ctest 与
  fail-closed 证据；能力账本可审计。
- 成本：TaperFaces 等需新增 native op + editor IPC + backend evaluator + 契约，
  跨三仓同批；每个 op 需真栈与示例批次。
- 风险：许可判定错误、native 回滚不干净、backend 旧注释误导、示例近似冒充。
  缓解见 §2.2 与 §2.4；停止条件为“无书面许可/无干净回滚/需放宽断言”。

## 5. 批准门

- 本 ADR 需 Owner 明确批准后，才可修改 native opcode/editor IPC/backend evaluator。
- 批准前允许的只有：静态审计、ctest 探针、文档与能力账本更新（不接产品线）。
- 首个实施切片建议：TaperFaces + draft 特征（示例影响最大、API 已实现、许可内）。
