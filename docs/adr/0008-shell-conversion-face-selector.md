# ADR-0008：shell scenario 转换与移除面解析（test-only 回放层）

- 状态：已接受（计划 W1.2 / T11 第一切片，2026-11-07）。
- 关联：`docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`、
  `docs/adr/0006-onshape-new-feature-types.md`。

## 背景

产品 shell 能力已具备：`ShellParams { defaultDistance, faces: LubanTopologyId[],
distances }`（负距离=内缩、faces 为移除面、distances:0=穿孔移除），
`ShellDialog` + 后端 `hollowFaces` 已通过盒体真栈（1084.000 mm³）。但 parity
converter 不产出 shell 特征（17 个 PS / 21 个 shell 特征停在
`converter-feature:shell`），真实示例无法回放。

Onshape shell 的 `entities` 是面 query（`SWEPT_FACE`/`CAP_FACE` + 草图实体 +
上游 op），不是持久拓扑 id；converter 无几何、不能生成 `LubanTopologyId`。

## 决策

1. **converter 只做语义描述**：输出 `shell` 特征
   `params: { defaultDistance, distances, oppositeDirection, selection: {
   kind: "faceQueries", queries: [{ kind, sketchFeatureId, sketchEntityId,
   sketchEntityKind, operationSourceIds, queryString }] } }`。`isHollow=true`
   如实 dropped（产品无 Hollow 契约）；壁厚表达式无法解析、面 query 无法解析
   时整特征 dropped 并登记，不输出残缺选集。
2. **回放层解析面**（test-only `shellFaceResolver`）：首切片只解析
   **revolve 的 SWEPT_FACE 端面**——草图实体为与回转轴垂直的直线时，绕轴
   旋转得到垂直于轴的平面圆/环。按以下条件在当前 body 平面面集中唯一匹配：
   - 面法向与轴平行（|dot| ≥ 0.999）；
   - 面中心在轴线上、且沿轴平面位置与草图直线位置一致（≤0.05 mm）；
   - 外半径 = 草图直线端点到轴的较大距离；允许前序 fillet/chamfer 圆角把
     外缘缩小（容差=前序最大圆角半径 + 表面 0.5%）。
   零/多候选、非 revolve 源、CAP_FACE/曲面侧面、跨特征面一律
   `BlockedCapabilityError`，绝不任取一面。
3. **translator**：`oppositeDirection=false` → `defaultDistance` 取负（内缩），
   `distances=0`（移除面穿孔）；面引用由 runner 注入，缺引用诚实阻塞。
4. **不新增产品契约/RPC/UI**：本切片只打通“真实 scenario → 标准 ShellParams”
   的回放路径；产品 shell 的 UI/编辑/预览维持既有能力状态。

## 验证

- 合成真栈 `e2e/examples/shell-face.spec.ts` **2 passed**：草图矩形
  [0,10]×[0,10] + 轴线 x=0 → revolve 实心圆柱 R10×10 → shell 移除顶面 +
  内缩 2 mm = 开口杯 **1533.097 mm³**（π(10²·10 − 8²·8)），push/重开一致。
  面解析：轴线/平面/外半径唯一匹配 → resolveFaceRef。
- 真实 Gaiter（Exercise: Hand Brake Update / Gaiter）：
  - converter 输出 6 特征（含 shell），两端面 query 均解析成功；
  - 但前序 **Fillet 1（8 条整圆边、1 mm）后 body 体积归零**（feature status=0，
    massproperties=0；shell 随后触发原生 GeometryStreamError bad allocation）。
    这是**内核 blend 阻塞**，不是 shell 面选择器问题；`gaiter-scenario.spec.ts`
    以 `test.fixme` 保留，任务 #103 跟踪，不伪造示例绿。

## 后续

- 其它 shell 面 query 形态：CAP_FACE 端面、SWEPT_FACE 曲面侧面（需面表面
  匹配）、跨特征派生面；Hollow；逐面差异壁厚。
- #103 内核 fillet 修复后恢复 Gaiter 真栈验收，shell 首切片才有真实绿例。
