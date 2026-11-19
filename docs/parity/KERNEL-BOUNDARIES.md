# 几何内核边界与许可结论（公开脱敏）

> 本文是能力账本 `kernelRef` 的公共判定依据。逐 op 的 API/opcode/原生测试证据
> 与原始错误码只保留在私有 imodel-native 审计仓；本文只写逻辑操作、许可状态与
> 产品结论，不含私有路径、账号或原始内核日志。

## 1. 适用范围

- 几何内核：真形（TrueForm，自研 BRep，当前 M0 脚手架）与过渡期 ACIS。
- ACIS 授权：仅 **Modeler + Polyhedra**；InterOp、healing、STEP 等未授权能力
  一律不接线。任何依赖未授权能力的特征必须标 `blocked-license`。
- 产品接入唯一通道：`SolidKernel.h` / PSBRep op / 标准 editor 命令；禁止第二套
  几何内核旁路或近似几何冒充。

## 2. 操作边界（2026-11-19 v0）

| 操作 | 许可 | 产品结论 | 说明 |
|---|---|---|---|
| 布尔（Unite/Subtract/Intersect） | Modeler | 已用 | 体/面布尔、空交/消费语义已有产品与测试 |
| Sweep/Loft（体） | Modeler | 已用（受限） | 曲线路径、多截面等深度见能力账本 |
| Blend/Chamfer | Modeler | 已用（受限） | 多边全圆链等存在内核边界，按 blocked 登记 |
| Hollow/OffsetFaces/OffsetBody | Modeler | Hollow/OffsetFaces 已用；OffsetBody 待暴露 | OffsetBody 原生 smoke 已通过 |
| Imprint / Sew / Disjoin / ConvertSolidToSheet | Modeler | Imprint/Sew 已用；Disjoin/Convert 待暴露 | Disjoin/Convert 有原生 smoke 证据 |
| DeleteFaces/DeleteEdges | Modeler | 删除面 `blocked-kernel`；删除边待探针 | 普通盒面删除无法补洞，需共面分裂种子；删除边未验证 |
| TaperFaces（拔模） | Modeler | 已用（AX-01，2026-11-19） | 原生 ctest + PSBRep op 37 + editor IPC + backend evaluator + DraftDialog 真栈 3732.051 mm³；独立中性面拾取等 live UI 深度待补 |
| SweepFaces | Modeler | 待暴露（先补测试） | 面扫掠产品化可用于筋/曲面族 |
| OffsetEdges | Modeler | 待暴露（先补测试） | 边偏移传播语义未验证 |
| Emboss | Modeler | 待暴露（先补测试） | 包覆/浮雕候选，禁止用近似算法替代 |
| IntersectSheetFaces | Modeler | 待暴露（先补测试） | 片体求交，服务分割/裁剪 |
| TransformSubEntity | Modeler | 已通原生/编辑器，产品待接线 | 面平移成功；旧“返回 undefined”注释已陈旧 |
| BooleanCut / Cut | Modeler | 内核+编辑器已通，产品待接线 | 片体切割，测试覆盖工具 id/拓扑 |
| BodyFromExtrusionToBody | Modeler | 已用/已测 | 拉伸到体（upTo 语义）内核已覆盖 |

“待暴露”= 在授权范围内、原生已实现，但尚未完成 PSBRep op / editor IPC /
backend evaluator / 产品 UI 全链；**批准前不接线**。

## 3. 明确排除

- **ThickenSheet（加厚）**：私有原生测试注记明确其为 InterOp 未授权路径，
  维持 `blocked-license`；不得因原生可运行而产品化。
- STEP / healing / 导入修复：`excluded-import`，不接 ACIS InterOp。
- 任意 FeatureScript 解释器：`excluded-custom-feature`。
- 钣金、框架、外部螺纹等子系统：独立 ADR/能力，不在本边界内“顺手”实现。

## 4. 产品规则

1. 失败必须 fail-closed：非零状态、保留旧几何、不得假成功或静默 no-op。
2. 近似几何不得支撑 `full` 或 strict 示例；必须降级 `approx`/`blocked`。
3. 新增 ACIS 操作按 `docs/adr/0021-acis-exposure-expansion.md` 的协议执行：
   许可审计 → 原生 ctest → PSBRep op → editor IPC → backend evaluator → 真栈 →
   示例批次。
4. 能力账本中的 `kernelRef` 只引用本表结论；原始证据留在私有仓。

*最后更新：2026-11-19（v0；TaperFaces 已于 AX-01 接线，其余“待暴露”项尚未接线）*
