# AIRR — 多截面放样（loft N sections）

- 状态：Implemented（shared 1.69.0 工作树；未发布）
- 关联：ADR-0019；接口冻结矩阵 v1.69；私有 luban-backend
- 目标：让 Onshape 的多截面放样在鲁班CAD 可用，复用 BRepCore 既有 Loft N-profile
  通道，不新增 native/渲染/选择状态。

## 复用矩阵

| 关注面 | 复用 | 新增 |
|---|---|---|
| 内核 | `BRepGeometryOperation.Loft`（LoftOperation profiles 向量） | 无 |
| 后端求值 | `evaluateLoftAsync` 逐 sketchIds 追加外环后一次 Loft | 仅 schema/守卫泛化 |
| 契约 | `LoftParams`（改 sketchIds 类型） | 版本 bump 1.68→1.69 |
| UI | FeatureDialog loft 通道（下拉/预览/提交门禁） | 有序截面列表 + 添加/移除 |
| 数据 | Feature params 原样落库（无 schema 迁移） | 无 |

## 范围

- `sketchIds` ≥2 有序数组；每草图取 `regions[0]` 外环（含孔仍拒收）；全部截面须平行。
- UI 支持任意多个截面（受草图数限制），顺序=选择序列；重复/陈旧选择禁提交。
- 非目标：guides/端条件/扭转/缩放/曲面体/多面域截面。

## 测试

- shared：205/205。
- backend：`LoftMultiSectionFlow.test.ts` 4/4（8 mm³ 棱柱、重复/非平行拒收、旧载荷
  preview）、`LoftFlow.test.ts` 9/9、registry/rpc 50/50。
- 真栈：`e2e/loft-multi-section.spec.ts` 2 passed（4000 mm³、冷重开一致）。
- UI：FeatureDialog 多截面 3 用例（三节载荷、重复禁用、移除）。

## 风险 / 回滚

- 旧两截面载荷是合法数组；回滚到 tuple 不产生数据迁移。
- 多截面几何由内核 Loft 决定（截面间蒙皮形态内核裁决），不承诺与 Onshape 逐点一致；
  体积断言只覆盖同形棱柱案例（8 / 4000 mm³）。
- 未发布：发布需 shared → backend → web 同批与 verify-stack。
