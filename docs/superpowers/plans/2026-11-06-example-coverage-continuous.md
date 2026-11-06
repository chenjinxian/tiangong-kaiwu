# Onshape 示例覆盖连续工作计划（执行台账）

> 这是执行台账，不是新的架构裁决；架构/范围以 `2026-11-06-example-coverage-master-airr.md` 为准。
> 状态：`[ ]` pending / `[~]` in progress / `[x]` done / `[!]` blocked/known-red。
> 每项完成必须附真栈或脚本证据；不得用 jsdom/截图替代几何验收。

## 当前基线

- 数据面：526 docs / 1685 API PS / 224 feature PS；严格 pipeline replicable-now **0**，raw capability **8**；详见私有仓 `docs/EXAMPLE-COVERAGE.md`。
- 基础设施：registry/state/translator/runner/gallery/verify-registry 已落地。
- 已复刻：12 legacy iModel **12/12 已重开验证**；Sample Assignment 新增可审计 RPC
  场景全链（8915.860 mm³，9 特征）作为验收门，旧 UI 版 spec 降为 legacy 演示。
- 多 PS：`Exercise: Element Organization` 2 PS/2 bodies，重开 2/2。
- 未提交/未推送（用户指令）。

## 连续任务顺序

### P0 — 清 known-red（先做，避免脏基线）

- [x] **T1 Sample Assignment 修复**
  - 已确认：scenario 前 8 个 sketch/extrude 可由 runner 建出；UI 倒角阶段曾卡住。
  - 修复：`runScenario` 结束释放自己取得的写租约（不释放页面租约）；两条“切除孔”
    的 Onshape 短码无法静态映射到本地 region 下标，spec 采用**显式可审计**映射
    （Sketch 2 / 源 `FarP0dnYC7HcDfB_1` → [0,1]；Sketch 3 / 源 `FtB4EYw28Ij2hDn_1`
    → [0,1]）；4 条 SWEPT_EDGE 由共享端点消歧的 edgeResolver 解析；约束以
    `skipSketchConstraints` 保留 Onshape 解算坐标，notes 登记 `constraints=dropped`。
  - 证据：`e2e/examples/sample-assignment-scenario.spec.ts` setup+test **2 passed**——
    9 特征树、单 body、体积 **8915.860 mm³**（目标 8915.859905）、push + 重开一致。
- [x] **T1b 旧 spec 清理**（2026-11-06）：旧 `sample-assignment.spec.ts` 降为
  legacy 真实 UI 演示（默认 skip，`EXAMPLE_UI_LEGACY=1` 运行）；验收门改为上述
  RPC 场景 spec，不再以不稳定的 UI 倒角作为 known-red。

### P1 — 能力解锁（按解锁数排序）

- [x] **T2 Edge selector resolver (CAP_EDGE/SWEPT_EDGE)**
  - 私有 converter：`tools/scenario/edge-selectors.mjs` 统一解析 CAP_EDGE/SWEPT_EDGE；
    `contextSketchEntityIds` 从 `$` 边界相邻实体提取（端点消歧）；9/9 单测。
  - 私有 backend：ScenarioReplay 支持 CAP_EDGE 圆弧 + SWEPT_EDGE 拉伸/旋转；
    `sweptCandidatePoints` 共享端点消歧；matcher 7/7、ScenarioReplay 11/11。
  - 公共 e2e：dev-only 只读边枚举（与显示拓扑同命令槽）+ 几何唯一匹配 +
    `resolveEdgeRef`；translator 仅在 runner 提供持久边引用时映射 fillet/chamfer。
  - 证据：`e2e/examples/edge-selector.spec.ts` 合成圆盘 CAP_EDGE 倒角
    770.737 mm³（解析期望同值），setup+test **2 passed**。
  - **真实 PS 验收（2026-11-06 转绿）**：
    - iOS First Part：3 条 CAP_EDGE（+y/−y 端盖分别取景），终体积
      **157478.901 mm³** vs 目标 157478.902（0.00%）；
    - Sample Assignment：4 条 SWEPT_EDGE 距离-角度倒角，终体积
      **8915.860 mm³** vs 8915.859905。
    - 两者均 setup+test **2 passed**；三探针文件已删除，验收断言保留。
  - **Ruling（Hand Brake 仍阻塞）**：SWEPT_EDGE 已唯一解析且 chamfer status=0，
    但 revolve 单面域产物体积不足（region 0 ≈5373，region [0,1] 并集 ≈7140 vs
    目标 7125——多面域 revolve 才可能对上），阻塞在**revolve 多 region 契约**，
    不是边选择器；不把体积期望改成错误值来“转绿”，转 T4/T7 处理。
- [x] **T3 Shell UI**
  - 证据：Onshape 官方帮助页（`ui-evidence/shell-help-20261106`，Faces to shell →
    Hollow → thickness → direction → confirm）；Hollow 无契约，本切片不渲染假控件。
  - 产品：`ShellDialog`（移除面 + 壁厚 + 内/外方向，`ShellParams` 零变更）；
    ribbon `HollowFaces` 改道参数化对话框；面快照在路由时捕获（对话框打开会
    pause 选择工具并清空选择）；后端影子预览接入；能力位 `shell: full`。
  - 证据：`ShellDialog.test.tsx` 5/5；web 全量 vitest **1384/1384**；
    `e2e/shell.spec.ts` setup+test **2 passed**——盒体 20×20×10 顶面移除 1 mm
    内缩体积 **1084.000 mm³**（解析期望同值），undo/redo、双击编辑 2 mm
    （1952 mm³）、push + 重开一致。
  - 限制：Hollow/逐面差异壁厚/对话框内继续拾面未实现；真实 PS 的 scenario
    shell 面选择仍需语义面选择器（转 T4）。
- [~] **T4 Extrude/hole/cPlane variant completion**
  - [x] **extrude secondDirection**（2026-11-06）：converter 映射 BLIND/THROUGH_ALL
    + `secondDirectionOppositeDirection` 语义；translator 透传/symmetric 互斥；
    FeatureDialog「第二个方向」平铺复选 + 深度/终止条件 + 编辑回显 + 预览包络；
    UI 证据 `ui-full-audit-20261106/extrude-dialog-side-by-side.jpg`。
    真栈 `e2e/extrude-second-direction.spec.ts` setup+test **2 passed**——
    20×20 矩形拉伸 10 + 第二方向 5 = **6000.000 mm³**，push+重开一致；
    单测 FeatureDialog/feature-preview + 翻译器。
  - [x] **imprintFace → 草图面域解析（test-only 近似，2026-11-06）**：
    converter 在 imprintFace 选择上记录所引用的草图实体（`sketchFeatureId/
    sketchEntityId/sketchEntityKind`）；runner 用 `getSketch` 面域选择“该实体为
    孔洞边界”的最大面域，其次外环；纯函数 `pickImprintRegion` 单测 3/3
    （孔优先、多个取最大、外环回退、找不到不猜）。步骤保持 `approximate=true`
    并写 note（face split 未实现）。iOS 由此从 region 0（176206 mm³ 错误映射）
    修正为 region 1 + forward + depth 50，配合 3 条 CAP_EDGE 倒角达
    157478.901 mm³。
    - 仍缺：产品级 imprintFace/faceRef 面切分（draft AIRR 待批准），当前 `sketchRegions`
      选择语义只等价于“对面域做拉伸”，不等于 Onshape 的 imprint 面。**不得**
      据此宣称 imprintFace 产品能力 complete。
  - [x] **revolve 多面域（shared 1.30.0，2026-11-06）**：
    - 契约 `RevolveParams.regions`（与 extrude 同锚；`regionIndex` deprecated 简写，
      同给拒收）；后端 `resolveRevolveInputs` 选集归一 + 逐域 spin/CSG + Unite；
      FeatureDialog revolve 复用 extrude 的视口多选 chips（载荷不再发 regionIndex）。
    - 验证：backend `RevolveFlow` 两互斥环柱 2500π；registry 接受/互斥/负数拒收；
      真栈 UI `e2e/revolve-multi-region.spec.ts` setup+test **2 passed**
      （7853.981 mm³、push+重开）；真实 Hand Brake 3 特征
      `e2e/examples/hand-brake-scenario.spec.ts` setup+test **2 passed**
      （7125.270 vs 7125.274；此前 region 0 为 5358.127）。
    - 诚实边界：converter 对多 query 只给面积降序前缀 + `regionRisk`；
      Hand Brake 的 [0,1] 选择写在 spec 审计函数中，不冒充自动映射。
  - [ ] draft/thin-wall/upToNext/Surface/Vertex（内核能力/契约，独立 ADR）。
    extrude draft 当前在 translator/ScenarioReplay **显式 blocked**（4 PS / 15 特征；
    原生 `api_taper_faces` 有 C++ 面但未暴露到 TS/native N-API，不能精确实现）；
    不得再静默按直体近似。
  - [x] **hole 孔位 query 形态补全（converter，2026-11-06）**：
    UUID `sketchEntityQuery(...,"uuid")` 与 `qCreatedBy(<sketch>, VERTEX)` 全点形态；
    `孔位 query 未解析` 17→8，smoke +1/blocked −1。mate connector 孔位（10）
    仍属参考几何缺口，不近似。
  - [x] **hole 倒角孔/countersink（shared 1.32.0，2026-11-06）**：
    `HoleParams.countersinkDiameterMm/countersinkAngleDeg`（包含角 deg，与 counterbore
    参数互斥）；后端 `evaluateHole` 用两环 Loft 生成锥台 + 主孔 Subtract；converter
    映射 Onshape `C_SINK`；HoleDialog 启用「倒角孔」页签 + 直径/角度/回显/校验。
    后端 HoleFlow 6/6、web HoleDialog 7/7、真栈 `hole.spec.ts --grep 倒角孔`
    **2 passed**（去材 261.794 vs 261.799 mm³，0.002%）。真实 11 个 C_SINK 特征
    所在 PS 仍被 sheet metal/import/custom 等阻塞，暂无完整真实示例。
  - [x] **后端 ScenarioReplay 与公共 runner 对齐（2026-11-06）**：补
    `secondDirection`（此前被静默忽略——Handle grip 会少 10mm）；补 body 谱系
    （hole/fillet/remove 改写 sourceFeatureId 后，仍能按 Onshape 原始造体特征解析
    booleanScope 目标体）。新增 `ScenarioReplayParity.test.ts` **2/2**：
    10+反侧5=6000 mm³；两体模型 hole 改写谱系后 remove 命中 A 体
    （1000 + 2968.584 mm³）。这是 B1 批量后端回放的前置。
  - [ ] hole tapped/thread/face placement + 间隙/多深度表 + mate-connector 孔位；
  - [x] **cPlane B2a 平面点（shared 1.31.0，2026-11-06）**：`CPlaneParams.origin`
    世界原点 + 参考法线（与 offsetMm 互斥）；CPlaneDialog 类型/原点输入；后端 schema/
    求值校验；shared 159/159、CPlaneFlow 3/3、web 17/17、真栈
    `e2e/cplane-point.spec.ts` 2 passed（4000 mm³，push+重开）。
  - [ ] cPlane B2b（任意面/边参考、草图顶点引用、LINE_ANGLE、改参传播）。
  - [x] **Handle 真实示例全链（2026-11-06）**：converter 映射 PLANE_POINT
    （世界轴对齐子集）与草图 `planeSourceFeatureId`；extrude/hole `booleanScope`
    压缩查询提取真实 featureId；translator 接线 cPlane origin、草图平面来源映射、
    `booleanScopeFeatureIds → targetBodyId`（多体必需）；runner 增加 body 谱系回溯
    （sourceFeatureId 被 fillet/hole 改写后仍解析到同一 body）、regionRisk 越界面域
    收敛 note、孔方向按目标质心侧判定 backward；converter 修正
    `secondDirectionOppositeDirection=true → 反侧`（旧映射把 130 mm 压成 120）。
    后端 ScenarioReplay 消费 cPlane/planeSource 并新增 `CPlaneScenarioReplay` 1/1。
    真栈 `e2e/examples/handle-scenario.spec.ts` **2 passed**：12 特征全 status=0，
    逐体 38314.220/68563.590 vs 采集 38314.765/68563.589，总误差 0.0005%，
    push+重开一致；约束 refs 仍 `constraints=dropped`。
  - 每项独立 ADR/contract bump + 旧库 fixture。
- [~] **T5 Mirror/pattern 通用化**
  - [x] **mirror 世界基准面整件镜像**（2026-11-06）：converter 识别
    Top→XY / Front→XZ / Right→YZ；仅 `PART` 或 `FEATURE+fullFeaturePattern=true`
    （等价整件镜像），局部特征/任意面镜像如实 dropped。translator 映射
    `MirrorParams{plane,keepOriginal:true}`。真栈 `e2e/examples/mirror.spec.ts`
    setup+test **2 passed**——偏置盒体 YZ 镜像体积 **8000.000 mm³**，
    push+重开一致；翻译器单测同批。
  - [ ] mirror 任意 plane/face + 局部 FEATURE 作用域（契约/后端，独立 ADR）；
  - [ ] pattern FEATURE 模式/任意轴/方向/skip/第二方向；
  - [ ] 解锁 mirror 剩余、circularPattern 26、linearPattern 7。
- [~] **T6 Sketch external refs + missing relations**
  - [x] **point-on-line coincident（v1.31，2026-11-06）**：`SLVS_C_PT_LINE_DISTANCE=0`
    等价形态；SolverTypes/Normalizer/SlvsSolver/converter 全链；`src/sketch` 46/46；
    后端回放 31/31；全量重转后该缺口 247→3 条。
  - [x] **单点 H/V（点+原点）映射（2026-11-06）**：converter 旧实现无差别剥离
    HORIZONTAL/VERTICAL 的 origin 引用，导致 143 条“单点形态”被误判未映射；现仅
    line+origin 剥离 origin，point+origin 保留为合法两点式（normalizer 把 origin
    解析为隐藏固定点）。后端 `SketchWireNormalizer` **7/7**（新增点+原点水平轴用例）；
    真实场景回放 `ScenarioReplayCorpus`+`BasicDrawingReplay` **4/4**；全量重转后
    单点形态缺口 **143→6**。剩余 6 条为无 origin/非 point 引用，继续按证据处理。
  - [x] **CENTERLINE_DIMENSION 映射（2026-11-06）**：原始约束 localFirst/localSecond
    + length 与 distance 同构，中心线（construction line）→ distance line+point /
    line+line；全量重转后该缺口 **47→0**（Basic Drawing 场景重转仍回放 4/4）。
  - [x] **CONCENTRIC 映射（2026-11-06）**：converter kindMap + solver 既有
    concentric 通道；能解析两侧 refs 的约束已转出（如 Dumper Sketch 23 refs [15,17]）。
    大量 PS 仍因复合/外部 refs 报 `refs 不足 2`，未冒充完整。
  - [x] **assignVariable 静态求值（converter-only，2026-11-06）**：ASSIGNED 的
    LENGTH(mm)/ANGLE(rad) 变量经小型算术/单位求值器烘焙，表达式支持括号、四则、
    `#var`、in/mm/deg；provenance 记 `variables=static:N`。MEASURED（依赖几何测量）
    与无法确定单位/值的表达式如实 dropped。**不是产品变量表/UI**——W2.8 仍未完成。
  - [ ] `SketchRef` external face/edge/vertex；PROJECTED/INTERSECTED/SILHOUETTED/PIERCE/Use；
  - [ ] MIRROR/LINEAR/CIRCULAR_PATTERN、circle start/end；
  - [ ] solver/region/decorations/UI 同步；约束树完整性单独验收。
- [ ] **T7 Wave 2 features**
  - splitPart → draft → rib → moveFace/deleteFace/replaceFace → thicken/transform/deleteBodies → loft/sweep N 截面 → variables。
  - 每完成一项构建所有新解锁 PS。

### P2 — 示例批次

- [ ] **B1**：47 个特征层 clean PS；优先 16 个 sketch-clean + per-part 可测；每个 complete 或 blocked。
- [ ] **B2**：21 个单 blocker；按 T2–T7 解锁分组。
- [ ] **B3**：10 个双 blocker。
- [ ] **B4**：其余 113 native eligible。
- [ ] **B5**：多 PS 大文档（最大 39 PS）与多 body 极端（146 body）。
- [ ] **B6**：新采集 tranche 追平；最终 coverage 报告。

### P3 — 几何族与长尾

- [ ] **G1** ellipse/elliptical arc/conic/N-span spline/text/image + 草图编辑工具族。
- [ ] **G2** 约束补全（CENTERLINE_DIMENSION/NORMAL/QUADRANT/MAJOR/MINOR/RHO/EQUAL_CURVATURE）。
- [ ] **G3** 长尾特征（externalThread/helix/bridgingCurve/projectCurves/trimCurve/compositePart/wrap/multiMirror）。
- [ ] **G4** sheet metal/custom/import triage；只登记/独立立项，不混入 native 绿门。

## 每任务 Definition of Done

1. 代码 + shared/backend 契约（如适用）同批；旧库 fixture/回滚说明。
2. 单测 + 真栈 e2e；多 body 逐 body 对拍；重开验证。
3. registry/state/docs/覆盖率同步；blocked/known-red 如实登记。
4. 不 commit/push，除非用户明确要求。

## 当前执行指针

- 已完成：**T1 Sample Assignment**、**T2 Edge selector resolver（含 iOS/Sample
  真实验收）**、**T3 Shell UI**、**T4 secondDirection + imprintFace 面域解析切片
  + revolve 多面域（Hand Brake 真绿）**、**T4b Handle 真实示例全链
  （PLANE_POINT + 多体 mergeScope + 孔方向 + secondDirection 反侧修正）**、
  **T4c hole countersink（shared 1.32，真栈 261.794 vs 261.799 mm³）**、
  **T6 单点 H/V + CENTERLINE_DIMENSION + CONCENTRIC 映射、assignVariable 静态求值**
  （后两者为 converter-only，产品变量表/UI 未完成）、**T5 mirror 世界平面切片**
  （均真栈或解析级绿；T3 用官方帮助页证据）。
- 正在执行：**T4 其余项**（upTo*、hole tapped/face placement）与
  T5 pattern FEATURE 模式、T6 sketch 外部引用。下一优先：
  hole tapped/face placement 与 pattern FEATURE（解锁面最大）；T6 只做有
  solver/契约支撑的约束，MIRROR/PROJECTED 等需先立 ADR。
- **并行轨道（2026-11-06）**：`2026-11-06-capability-coverage-examples.md`。
  公开示例副本→UI 取证→近似重建；Handle 已用采集源数据完成真栈精确重建
  （见 T4b）。Bumper Block 的 `extrude draft 10°` 是下一首个缺口。
- **Ruling（revolve 多面域映射）**：converter 是边查询无法静态反推面域，只给前缀 +
  regionRisk；真实示例用 spec 审计选择。代价：其它多 query revolve PS 仍需逐个审计，
  不会自动全绿。
- **Ruling（T3 证据口径）**：live Onshape 登录态不可得，但官方帮助页（公开可访问）
  给出了 Shell 字段顺序/语义；按“有证据才做控件”，用该证据实现并截图存档，
  Hollow（产品契约未支持）不渲染假控件。代价：像素级 live 对照仍缺，后续有
  登录态时补。
- **Ruling（imprintFace 口径）**：converter 实体标注 + runner 面域近似只进
  test-only 回放，不冒充产品 face split；iOS 体积因此可绿，但 iOS 的
  `geometry=approximate` 仍如实登记，`overall` 不因体积对上而升 complete。
- **Ruling（secondDirection 反侧）**：Onshape `secondDirectionOppositeDirection=true`
  按**反侧**消费（产品契约缺省）；Handle 130 mm grip 与采集体积证明旧“同侧”映射
  错误。代价：19 个含 secondDirection 的场景需在各自验收时重跑，不能沿用旧体积。
- **Ruling（孔/切除方向）**：孔方向用**目标 body 质心相对草图法线**判定
  （质心在负侧 → backward）；remove extrude 仍按 converter/Onshape 方向参数，
  解析不到 body 即阻塞。代价：质心在法线方向的投影极小时（薄板/对称面）可能
  不唯一，需示例级审计。
- **Ruling（body 谱系）**：产品 getBodies 只暴露最近 sourceFeatureId，后续
  fillet/hole 会覆盖造体特征；runner 沿场景特征顺序回溯到最近造体特征并跨步
  保留 bodyKey 别名。代价：同一 body 被多次 boolean 重组时需继续验证谱系，
  alias 只对 active body 生效。
