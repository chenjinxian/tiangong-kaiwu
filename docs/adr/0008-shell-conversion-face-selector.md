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

## 切片 2（2026-11-07）：capFace 圆端盖 + 多体目标

- converter：shell query 增 `isStart`（CAP_FACE 端盖侧，start=草图平面侧 /
  end=深度端），其余字段不变。
- 回放层 `expectedShellFace` 分派：`sweptFace` 沿用切片 1 的 revolve 垂直端面；
  **`capFace` 新增拉伸圆端盖**静态定位：圆心取草图圆圆心（经草图平面到世界系），
  轴向=草图法向，外半径=圆半径；端盖沿法向偏移
  `start: symmetric ? −d/2 : 0` / `end: symmetric ? +d/2 : opposite ? −d : +d`。
  仅支持 **blind/symmetric 圆端盖**；through-all（端盖由 body 决定）、矩形/环形
  端盖、非拉伸源一律返回 undefined → `BlockedCapabilityError`，不猜面。
- 多体：`resolveScenarioShellFaces` 增 `ShellFaceContext`；>1 active authored
  body 时，从各 query 的 `operationSourceIds`（经 runner 的 bodyKeyBySource）解析
  **唯一目标 bodyKey**；面集裁到目标 body；0/多候选阻塞。单体示例保持切片 1
  行为（目标=唯一 body）。translator `shellOp` 增 `targetBodyId`（runner 注入）。
- 接线：`run-file.ts` 之前只接 edge/imprint resolver，**未接 shellFaceResolver**，
  通用 scenario-file 回放遇 shell 必阻塞；本切片一并接通（含 targetBodyKey）。
- 证据：`e2e/examples/replay/shell-face-expected.spec.ts` **8/8**（5 条端面推导：
  blind start/end、oppositeDirection、symmetric、throughAll/非圆/缺深度拒收、
  未知 kind；3 条多体目标：单体直取、唯一映射、0/多映射/无 body 阻塞）；
  e2e typecheck 干净；translator 30/30。
- **真栈（2026-11-07）`shell-face.spec.ts` 3 passed**：切片 1 的 revolve
  sweptFace 回归 **1533.097 mm³** 不变；新增多体 capFace 用例：两圆柱体
  （R8×10，π·8²·10 = 2010.619），shell 移除第二体底面（isStart）+ 内缩 2 mm
  → 1105.840 / 2010.619 mm³，即 π(8²·10−6²·8)=1105.841，push+重开一致；
  shell step note 含 `targetBody=`。**Hydraulic Components 真实例仍被上游阻塞**
  （Fillet 1 sweptEdge matches=0；Extrude 1 的 imprintFace 复合轮廓未被回放为
  外圆体），不是 capFace 选择器问题；不宣称该真实例绿。

## 实现记录（shell 改参/插入预览，2026-11-08）

- 后端 `previewOp`：`updateParams` shell 用链上游缓存影子求值新壁厚/面集，
  `insertFeature` shell 用目标链尾缓存 + 目标体，回传 `PreviewResult.preview`
  （不写库/不写缓存/无 txn；既有 `ShellDialog` 预览管线此前只拿到 affected）。
- 后端 `ShellFlow` **10/10**：臂 3 增预览断言（preview 非空、
  elementId=目标体、预览后 body 逐字节与树 status/params 不变）。
- 真栈 `e2e/shell.spec.ts` **2 passed**：新建（壁厚 1）与编辑（1→2）对话框
  均出现 `data-dynamic=1` 的 TileRpc 动态预览；体积 1084 mm³ 语义不变。

## 后续

- 其它 shell 面 query 形态：SWEPT_FACE 曲面侧面（需面表面匹配）、跨特征派生面、
  矩形/环形 CAP_FACE 端盖；Hollow；逐面差异壁厚。
- #103 内核 fillet 修复后恢复 Gaiter 真栈验收，shell 首切片才有真实绿例。

## Gaiter fillet 内核复核（2026-11-08）

- 新探针（私有后端临时测试，constraints 置空以对齐 runner `EXAMPLE_SKIP_CONSTRAINTS=1`；
  scratch StandaloneDb + ScenarioReplay，仅 sketch→revolve→fillet 前缀）：
  - revolve 基准 **46039.749 mm³**。
  - 8 边一次性 fillet：**45837.190 mm³**（净 −202.559），并非此前记录的“零体积”。
  - 分组 4+4、8×1 与一次性 8 边**结果逐位相同**（45837.190），说明内核按边效果可加，
    分组不是 workaround 方向。
  - 单边体积（按 selector 顺序）：e0 45766.673 / e1 45877.882 / e2 46014.431 /
    e3 46027.975 / e4 46044.297 / e5 46030.611 / e6 46171.032 / e7 46182.531。
    e4/e6/e7 体积**增加**——可能对应凹边 fillet 的合法增材，但探针未做凸凹
    分类，不能据此断言几何正确；单边净和 −202.560 与 8 边一次结果一致。
- **全链 web 重跑（2026-11-08，scenario-file runner，Gaiter 原始 scenario +
  `EXAMPLE_SKIP_CONSTRAINTS=1`）**：6 特征全部 apply ok，落库树 10 行
  （sketch/revolve/fillet/shell/sketch/extrude）**全部 status=0**，shell 面
  `faces=(2:1,2:15)` 解析成功并有 Body 1，说明构建与 push 已过；但随后
  `getMassProperties` RPC **>7 分钟不返回（HeadersTimeout）**，画布为黑屏
  （viewport canvas 未出现）。直接对该 iModel 用 RPC 读树能返回、读质量属性
  即挂——阻塞点从“fillet 零体积”改判为 **shell/fillet 后 BRep 质量属性不可计算
  （内核状态病态）**。
- 结论：Gaiter 仍 **blocked-kernel**，spec 保持 fixme；不得以分组近似或
  “树 status=0”冒充体积通过。原先“fillet 一次 8 边零体积”的表征不再作为
  唯一证据，保留为历史记录；新证据显示分组结果一致（非 workaround）。
- 临时探针/检查 spec 与临时后端测试均已删除；未改产品/内核代码。
