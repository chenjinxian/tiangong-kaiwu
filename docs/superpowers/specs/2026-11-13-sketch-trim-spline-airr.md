# AIRR — 草图修剪支持三次贝塞尔样条

日期：2026-11-13
状态：**已实现（2026-11-13）**（用户指令：继续实现全部缺口）

## 1. 证据

- Onshape 官方 Trim 帮助（`https://cad.onshape.com/help/Content/Sketch/trim.htm`，
  经搜索摘要读取；本机 WebFetch 被域名策略拦截）：Trim 修剪曲线到最近交点/边界；
  无交点整删；文档明确提到 **Bezier curves**——修剪后的剩余部分保留原次数与
  控制点语义。未在 live 副本上单独复采样条修剪（本切片以官方帮助为据，如实登记）。
- 本产品 `spline` 契约即三次贝塞尔（`controlPoints` 恰 4，v1.19；fitPoints 仅
  结构化引用对齐，服务端以 controlPoints 为真源）。

## 2. 范围（本切片）

1. `trimSketchAt` 目标类型扩展 `spline`（仅三次、非 periodic、非投影）。
2. 交点检测：样条按 128 段折线细分后与线/圆/弧/样条逐段求交（近似口径）；
   交点参数经折线最近点反解。
3. 切除段构造：**de Casteljau 精确分裂**（保持三次、控制点语义；移除中间段时
   左右两段分别构造，第一段沿用原 id，第二段新 id）；fitPoints 丢弃（契约
   真源为 controlPoints；引用该实体的约束按既有裁剪纪律移除）。
4. 无内部交点 → 整删（与线/圆/弧同语义）；点击段所在区间移除。
5. 诚实拒收：periodic、controlPoints ≠ 4、投影样条、控制点非法——
   `unsupported`，工具给 i18n 提示，不改数据。

**非目标**
- 精确解析交点（样条×圆/样条×样条）——本切片折线近似；误差随曲线尺度增大，
  档内登记。
- fitPoints/周期样条保真、修剪后重建约束。

## 3. 复用矩阵

| 依赖 | 复用 | 说明 |
|---|---|---|
| `sketch-trim` 既有线/圆/弧区间移除 | 交点收集、约束清理、整删语义 | 只加 spline 分支与几何工具函数 |
| `SketchTrimTool` | 拾取/坐标反解/`applyUpdate` 提交 | 无工具生命周期改动 |
| shared 契约 | `SketchEntityDto.spline.controlPoints`（三次） | 无契约变更 |

## 4. 测试

- 单测 `sketch-trim.test.ts` **12/12**：样条两线中段移除（控制点精确端点）、
  点击首段保留其余、无交点整删、圆↔样条双向修剪、约束清理、非三次/periodic/
  投影拒收。
- 真栈 `e2e/sketch-trim.spec.ts --grep 三次贝塞尔样条` **2 passed（37.9 s）**：
  RPC 建共线三次样条 + 两条截断线 → 进入草图 → 修剪点击中段 →
  两段控制点端点 ≈(-10,-3)/(3,10)、切割线不动。
- 回归：既有线/圆/弧 trim 用例同文件通过；web 全量单测/lint/tsc 见提交记录。

## 5. 跨仓影响 / 回滚

无 shared/后端/RPC/schema 变更，纯前端纯逻辑。回滚=移除 spline 分支与测试；
不涉及数据迁移。

## 6. P0 对照

- P0-03/P0-05：复用既有 `Sketch.Trim` 工具与 `applyUpdate` 事务，无第二套编辑 API。
- P0-06：仍只写草图 params（entities/constraints），一次 `updateSketch` 可撤销。
- P0-10：提交走既有乐观覆写 `applyUpdate`；拒收不留半成品。
