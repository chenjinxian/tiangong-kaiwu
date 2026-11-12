# ADR-0019 — Multi-section loft on the existing BRepCore Loft channel

- 状态：Proposed（Owner 待签字；实现已落地，未发布）
- 日期：2026-11-12
- 关联：AIRR `docs/superpowers/specs/2026-11-12-loft-multisection-airr.md`；
  `docs/architecture/INTERFACE-FREEZE-MATRIX.md`（shared 1.69.0）
- 影响仓：luban-cad（shared/web）；私有 luban-backend（schema/求值注释/测试）

## 1. 背景

Onshape 放样支持两个以上截面（多截面/引导线）。本产品 `LoftParams.sketchIds` 一直是
`[string, string]` 二元组（B2 v1.11），后端 schema 用 `z.tuple` 钉死长度 2；UI 只给
两个下拉。内核通道并不受限：`BRepGeometryOperation.Loft`（PSBRepOperation
`LoftOperation(filter, profiles, guides, periodic, orderCurves, orientCurves)`）原生
接收 N 个 profile，`evaluateLoftAsync` 本就逐 `sketchIds` 追加外环。

## 2. 决策

1. `LoftParams.sketchIds: string[]`（**≥2**，数组序=截面顺序）——shared
   `interfaceVersion` 1.68.0 → **1.69.0**。旧 `[a,b]` 载荷是合法数组，向后兼容。
2. 后端 zod 由 `z.tuple` 改 `z.array(z.string()).min(2)`；重复草图（任意两节相同）
   由 `superRefine` 拒收（文案“loft 截面草图不得重复（退化放样，无正解）”）。
3. 平行守卫从两法向扩为“全部截面法向与首节法向平行”（`assertLoftSectionsParallel`，
   op 边界与求值层共用）。
4. UI 放样对话框改为有序截面列表：至少两个下拉、`添加截面` 追加、第三项起可移除；
   载荷 `sketchIds` = 已填截面按序过滤；重复/陈旧选择照旧禁提交并提示。
5. 不新增内核通道、不改 `sections` 保留键、不做 guides/端条件/扭转/缩放；
   截面含孔仍按既有口径诚实拒收。

## 3. 备选方案

- **A. 新增 `additionalSketchIds` 字段**：双路径载荷、converter/回放/校验分叉，拒绝。
- **B. 新 FeatureOp（multiLoft）**：同一能力第二入口，违反能力唯一，拒绝。
- **C. 原生新增 PSBRepGeometry op**：内核 Loft 已支持 N profile，无必要，拒绝。

## 4. 验证与回滚

- shared 单测 205/205（含 v1.69 版本钉 + 三截面类型）。
- 后端 `LoftMultiSectionFlow.test.ts` 4/4：三截面 2×2@z=0/1/2 → **体积 8**、
  bbox z∈[0,2]；重复拒收；非平行第三截面拒收；两截面旧载荷 preview 正常。
  `LoftFlow.test.ts` 9/9、`FeatureTypeRegistry.test.ts`+`FeatureRpcImpl.test.ts`
  50/50。
- 真栈 `e2e/loft-multi-section.spec.ts` 2 passed：三截面 20×20@z=0/5/10 →
  **4000 mm³**，重复/非平行拒收，冷重开树 status=0 + 零件体积 4,000 mm³。
- 回滚：单 PR 恢复 `[string,string]`/tuple/两下拉；已落库 `string[]` 载荷在两截面时
  与旧类型同构，回滚不迁移数据。
- 发布门：shared 1.69.0 → 后端产物 → web 同批；本次未发布。
