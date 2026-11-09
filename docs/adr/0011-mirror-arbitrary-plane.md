# ADR-0011：Mirror 任意世界平面

- 状态：已接受（2026-11-07；计划 W1.4）。
- 关联：`docs/adr/0005-extrude-revolve-contract-onshape-parity.md`、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`。

## 背景与证据

- 语料 mirror 约 202 个特征；现有 `MirrorParams` 只支持世界基准面 XY/YZ/XZ
  （`plane: "XY"|"YZ"|"XZ"` + `keepOriginal: true`），10 个 PS 因“镜像面非世界基准面”
  被阻塞，更多 PS 的 mirror 引用面/局部基准。
- 现求值器用 `mirrorTransformForPlane` 构造对角反射矩阵；任意平面反射是同一原语的推广，
  无新内核能力、无数据迁移。

## 决策（切片 1）

1. **契约（shared 1.37.0）**：`MirrorParams` 增可选
   `planeLine?: { origin: {x,y,z}; normal: {x,y,z} }`，`plane` 改为可选；两者**恰一**
   （同时给出/都不给在 zod 层拒收，不静默优先级）。法向须非零（服务端归一化）。
   `keepOriginal: true` 字面量不变（首版恒保留原体并 Unite）。
2. **求值**：任意平面反射
   `T(p) = p − 2·((p−o)·n̂)·n̂`（矩阵 `I − 2·n̂n̂ᵀ` + 平移 `2(o·n̂)n̂`）；
   与既有世界平面路径同一 BRep entityTransform 重编码 + Unite 次序（原件在前）。
   非 BRep displayable/非 Solid 上游沿用既有诚实拒收。
3. **不做**：面/基准面引用解析（`planeRef`）、镜像特征/面范围（仅整 body）、UI 控件、
   converter 映射（面引用需选择器证据后再接；当前 FACE 仍如实 blocked）。
4. **撤销/事务**：标准 FeatureOp；无不可逆操作。

## 验证与回滚

- 单元：对角平面/偏置平面反射的体积与 bbox；法向归一化；plane/planeLine 互斥与零法向拒收。
- 真栈：盒体绕 45° 偏置平面镜像 → 体积翻倍、bbox 对称；push+重开一致。
- 回滚：字段 additive；删除 planeLine 分支即回到 1.36 行为，旧库无迁移。

## 实现记录（切片 1，2026-11-07）

- 契约 shared **1.37.0**：`MirrorParams.plane` 可选 + `planeLine`；zod 恰一/零法向拒收。
- 后端 `mirrorTransformForPlaneLine`（I−2n̂n̂ᵀ + 2(o·n̂)n̂）；`MirrorFlow` 新增
  **4/4**（对角 x=y 反射 16 mm³/bbox [0,5]²；偏置 x=2 → bbox [-1,5]；法向 (2,-2,0)
  归一化同效；形态矩阵）。mirror 全套 **10/10**。
- 真栈 `e2e/mirror-plane-line.spec.ts` **2 passed**：盒 (3..5,0..2) 对角平面 →
  16.000 mm³ 质心 (2.5,2.5)；改偏置 x=2 → 16.000 mm³ 质心 (2,1)；push+重开一致。
- 后端全量 **777 passed / 8 skipped**，shared 164/164，web 1390/1390。
- 无 planeLine 创建 UI（ribbon 镜像仍只做世界平面）；编辑已存在的 planeLine 镜像时，
  对话框显示只读提示并禁用下拉/提交（`mirrorPlaneLineReadOnly`，FeatureDialog 138/138），
  不会用世界平面下拉静默覆盖。converter 的 mirror FACE 仍如实 blocked（切片 2 接面/基准面引用）。

## 实现记录（切片 2：faceRef 面镜像，2026-11-07）

- 契约 shared **1.41.0**：`MirrorParams.faceRef?: LubanTopologyId`；
  `plane`/`planeLine`/`faceRef` **恰一**（zod 同给/都不给拒收）。
- 后端：faceRef 经 scratch 载体 `facesFromId` → `getSubEntityGeometry` →
  `CurveOps.isPlanar` 得世界平面（复用 faceExtrude 面寻址通道），再走切片 1 的
  反射变换；非平面/多面片/失效引用诚实拒收。`MirrorFlow` 新增 **4/4**
  （顶面 z=2 → 体积 16/bbox z [0,4]/单 BRep；右面 x=2 → bbox x [0,4]；
  失效引用 status≠0；schema 三模式恰一），mirror 全套 **14/14**。
- 真栈 `e2e/mirror-face.spec.ts` **2 passed**：盒 20×20×10 → 视口点选顶面
  （产品同一 `resolveFaceRef` 通道，faceRef=(1,6)）→ 镜像 **8000.000 mm³**
  质心 (10,10,10)，树 `sketch/extrude/mirror` 全 status=0，push+重开一致。
- 后端全量 **791 passed / 8 skipped**（93 files），shared **167/167**，web 1394/1394。
- 能力仍 gated：无镜像面选择 UI（ribbon 镜像仍只做世界平面），converter 的 mirror
  FACE 仍如实 blocked（面引用需回放期持久面解析，不能从 Onshape 查询静态映射）。

## 实现记录（切片 2b：镜像面选择 UI，2026-11-07）

- 证据：`ui-evidence/ui-full-audit-20261106/onshape/dialogs/mirror.{png,json}`——Onshape
  镜像字段 `零件镜像 / 新建加入移除相交 / 要镜像的图元 / 镜像平面`；镜像平面可直接
  在视口选面。
- ribbon `MirrorElements` 路由在打开对话框前快照 `store.canvas.selection` 的面
  （对话框打开会暂停选择工具/清空选择，与 shell 同口径），经 `dialog.inputFaces`
  传入 FeatureDialog。
- FeatureDialog mirror 通道：`镜像平面` 下拉增加 `选中的面`；恰一个面快照时缺省
  选 FACE，显示 `nodeId:entityId`；多选面明确提示且 FACE 选项禁用（不猜）；N>1
  时目标实体缺省取该面所属 body，用户改到别的 body → owner mismatch 提示 + 禁提交；
  edit 落库 `faceRef` 只读回显 + 禁提交（planeLine 同姿态）。载荷
  `{faceRef, keepOriginal:true}`；世界平面路径逐字不变。
- 单测：FeatureDialog +5（FACE 缺省/载荷、多选拒绝、edit 只读、owner mismatch）、
  Ribbon +1（路由快照）；定向 **177/177**，web 全量 **1437/1437**。
- 真栈 `e2e/mirror-face-ui.spec.ts` **2 passed（39.5 s）**：盒 20×20×10 → 视口点选
  顶面 faceRef=(1,6) → 镜像对话框 FACE → **8000.000 mm³** 质心 (10,10,10)，
  树 `sketch/extrude/mirror` 全 status=0，push+重开一致。
- 仍未做：converter mirror FACE 回放期面解析（保持 blocked）、多选面批量镜像、
  FEATURE 作用域镜像 UI。

## 实现记录（切片 3：featureMirror 特征级镜像，2026-11-07）

- 契约 shared **1.47.0**：新增独立 FeatureType `featureMirror` 与
  `FeatureMirrorParams { sourceFeatureId; planeLine }`（源为前序特征 id，平面用
  `MirrorPlaneLine {origin,normal}`；源非空、normal 非零）。不复用 `MirrorParams`：
  两者语义不同（整 body 镜像 vs 单特征 delta 镜像），字段不可混用。
- 后端 `evaluateFeatureMirrorAsync`：读取源特征输出前后缓存差集（与 featurePattern
  同源 delta 通道）→ 对 delta 施加切片 1 的反射变换 → 按源操作 Unite/Subtract 回
  当前体。源限 extrude/revolve/hole 且操作 add/remove；NEW 源、草图源、失效源、
  缺失源诚实拒收。`FeatureMirrorFlow` **3/3**（孔切除镜像 16000−180π、凸台镜像
  16000+90π、守卫矩阵）。
- 场景链路：`parity-scenario.schema.json`/`scenario.mjs` 增 `featureMirror`；
  translator `featureMirrorOp`（源 raw id → 本地 featureId 映射）translator
  **26/26**。converter：FEATURE 单源 mirror → `featureMirror`；多源在切片 3 时
  如实 dropped（切片 4 / shared 1.58 已支持，见下）；FEATURE_ALL 整 body mirror
  标 `featureAllApproximation: true`（切除语义不保真）。
- 真栈 `e2e/feature-mirror.spec.ts` **2 passed**：40×40×10 板 + 圆孔切除 (10,20) r3
  → 镜像 YZ x=20 = **15434.514 mm³**（解析 16000−180π = 15434.513），
  树 `sketch/extrude/sketch/extrude/featureMirror` 全 status=0，push+重开一致。
- 真实 PS dfc6e33c/006ab003（Mirror 1）**blocked-capability**：源为
  Extrude 2(REMOVE) + Extrude 3(REMOVE) + Circular pattern 1(FEATURE) 三源，且分属
  两个 body 谱系；当前 featureMirror 单源、源白名单无 featurePattern，converter
  丢该特征后回放 body1/body2 **65,675.220 / 14,544.246 mm³** vs 采集
  **64,831.091 / 13,917.196**（−1.30% / −4.51%），如实 known-red。
- 未做（切片 3 时点）：多源 `sourceFeatureIds`（切片 4 已补）与逐源 body 归属；
  featurePattern 作为镜像源；镜像特征的选择 UI；真实 PS 转绿需先修上游
  imprintFace/pattern 语义。
- 回滚：新 FeatureType additive；移除 registry/evaluator 分支即回到 1.46 行为，
  旧库无迁移。

## 实现记录（切片 4：CAP_FACE 镜像面静态推导，2026-11-07，test-only）

- **语料**：123 个 mirror 的 `mirrorPlane` 中 66 个是默认基准面 DUMMY、11 个是
  CAP_FACE/SWEPT_FACE 派生面、其余为 plane 特征/实体面/导入引用。CAP_FACE 的
  mirrorPlane query 引用前序 extrude 的端盖（如
  `IdA1S11.9$F5jLNCZTLSijQSj_5opExtrude...$CAP_FACE`）。
- **converter（私有）**：`deriveCapFaceMirrorPlaneLine()`——从 query 取 extrude 源
  特征 id + `isStart`，用该拉伸的已解算深度/`symmetric`/`oppositeDirection` 与
  草图平面快照推出端盖世界平面：
  `offset = symmetric ? ±depth/2 : (isStart ? 0 : ±depth)`，平面法向取草图法向
  （反射与法向正负无关）。through-all/缺深度/未转换草图如实 dropped；up-to-*
  使用语料已解算深度（与回放 blind(solvedDepth) 同口径）。
- **translator（公共）**：`mirrorOp` 支持 scenario `planeLine`（任意世界平面），
  `planeApprox=true` → 步骤 `approximate=true` + note「端盖静态推导」；
  `featureMirrorOp` 同样识别 `planeApprox`。新增 2 条 translator 用例，
  **28/28**。
- **真实语料证据（非绿）**：`Exercise: Intermediate Assembly / Multi Part Build`
  （5e615183）重转后 Mirror 1 从 dropped 变为
  `planeLine origin(0,25,0) normal(0,1,0) planeApprox=true`，特征数 12→13；
  该 PS 仍被 `cPlane Midplane`、第二方向 UP_TO_SURFACE、booleanBodies tool body
  阻塞，不能宣称示例绿。
- 未做：SWEPT_FACE 平面推导、plane 特征（自定义/偏移面）引用、面被后续特征修改
  时的实体面复核（当前 planeApprox 即登记此风险）。

## 实现记录（切片 2c：mirror operation 加入/移除/相交，2026-11-07）

- 证据：`ui-evidence/ui-full-audit-20261106/onshape/dialogs/mirror.{png,json}` 的
  `新建 / 加入 / 移除 / 相交` 页签；切片 2b 已落镜像平面选择，本切片补操作语义。
- 契约 shared **1.48.0**：`MirrorParams.operation?: "unite"|"subtract"|"intersect"`
  （缺省 `unite`，旧载荷逐字兼容）；后端 zod 同枚举，未知值拒收。
- 后端 `evaluateMirrorAsync`：原件恒保留（`keepOriginal:true`）的前提下，把
  `[上游体, 镜像体]` 按 operation 映射到 `BRepGeometryOperation`
  Unite/Subtract/Intersect；条目顺序保持上游在前，避免法向翻转。`MirrorFlow`
  新增 intersect/subtract 平面线用例（偏置面 x=4.2、盒 x[3,5]）：交集 **6.4 mm³**、
  差集 **1.6 mm³**；zod 拒绝 `operation:"union"`。mirror 全套 **16/16**。
- FeatureDialog mirror 通道：平面选择器上方新增 `镜像操作` tablist（加入/移除/相交，
  标签复用 `booleanScopes`）；「新建」（独立镜像体）需多体输出（ADR-0015）禁用并
  显示提示。载荷仅在非 unite 时写 `operation`，unite 保持旧载荷不变。编辑回显
  `operation`；FeatureDialog 单测新增「新建禁用；移除/相交可提交 operation」。
- 真栈 `e2e/mirror-operation-ui.spec.ts` **2 passed（47.5 s）**：盒
  x[-5,10]×y[0,20]×z[0,10]（3000 mm³）→ ribbon「镜像」→ 平面 YZ → 操作「相交」→
  **2000.000 mm³**（原体 ∩ 镜像体 x[-5,5]×20×10），树
  `sketch/extrude/mirror` 全 status=0，params `{plane:'YZ',keepOriginal:true,
  operation:'intersect'}`，push+重开一致。
- **插入/改参预览（2026-11-08 补）**：后端 `previewOp` 的 `insertFeature` 与
  `updateParams` 均覆盖 mirror（上游链尾缓存存在时影子求值，零写回传
  `PreviewResult.preview`，平面/面引用/操作同提交口径）；`MirrorFlow` 增插入与
  平面 XZ→YZ 改参预览用例（预览非空、elementId=目标体、体与树零写；与
  PatternFlow 合计 38 passed）。FeatureDialog mirror 通道 150ms 防抖预览，
  **edit 模式打开即调用 `previewOp updateParams`**。真栈
  `e2e/mirror-operation-ui.spec.ts`：插入预览 `data-dynamic=1`（相交 2000.000 mm³），
  push+重开后双击「镜像」行编辑对话框再次 `data-dynamic=1`，取消后体积不变。
- web 全量 **1474/1474**、shared **170/170**、e2e 类型检查绿。
- converter（test-only）：读 `operationType`——ADD→缺省 unite；REMOVE→`operation:
  "subtract"`；INTERSECT→`operation:"intersect"`；NEW（独立镜像体）→ 保留旧
  unite 几何但标 `newBodyApproximation:true`，translator 记为 approximate 并提示
  ADR-0015，不再静默冒充合并。全库 79 个 mirror：NEW 53（PART 18/FEATURE 35）、
  ADD 21、缺 operationType 5，**REMOVE/INTERSECT 0**——本映射先为未来语料/真实 UI
  对齐，当前不新增绿例。translator 单测 **33/33**（含 subtract/intersect 透传、
  unite 缺省不写键、NEW 近似、非法 `union` 拒收）。
- 未做：「新建」独立镜像体（需多体输出，ADR-0015）；多选面批量镜像。

## 实现记录（切片 5：featureMirror 选择 UI，2026-11-08）

- **证据**：live 副本镜像对话框 `ui-evidence/mirror-feature-scope-20261108/
  mirror-scope.json`（私有仓）——范围下拉 零件镜像/特征镜像；特征镜像行
  「要镜像的特征 / 镜像平面 / 重新应用特征」；面镜像行「要镜像的面 / 镜像平面」。
- **UI（FeatureDialog mirror 通道）**：
  - 「镜像范围」下拉 body/feature（缺省零件镜像，edit 只读）。
  - 特征作用域：「要镜像的特征」下拉，宿主 `PartStudioCanvas` 自 `featureEntries`
    经 `mapFeatureEntries` 命名后过滤未抑制 `extrude/revolve/hole` 下传（与树命名
    同源）；无候选时显示空源提示并禁用提交。
  - 特征作用域隐藏「镜像操作」页签与「选中的面」选项（首版 featureMirror 无
    operation 键、面无 face→planeLine 解析，不渲染假控件）。
  - 载荷：`insertFeature featureMirror {sourceFeatureId, planeLine}`；世界平面
    XY/YZ/XZ → 过原点、法向 Z/X/Y（与 body mirror 的 plane 同口径）。
  - 预览 effect 按提交口径发起 `previewOp insertFeature featureMirror`；后端
    `previewOp` 影子求值白名单已扩 featureMirror（2026-11-08，源差分缓存直读 +
    当前链尾 Unite/Subtract，零写回），真栈切到特征作用域后预览先清空、选源+平面后
    `data-dynamic=1`（MS 日志 `preview-featureMirror`）。
  - 侧栏双击 featureMirror 行 → Info toast「暂不支持参数编辑，请删除重建」；
    避免通用 FeatureDialog 显示与载荷不匹配的距离/草图字段。
- **后端守卫（真栈实证）**：source 不能是无上游的 NEW 体（MS 日志
  `featureMirror 源特征无上游（NEW 体不可镜像）`），因此验收几何用「板 +
  顶面凸台（第二拉伸 operation=add）」作源，而非第一个造体拉伸。
- **后端**：`FeatureMirrorFlow` **4/4**（新增插入预览用例：preview.entries 非空、
  previewError 缺省、体体积/树行零变更；后端全量 **837 passed / 1 expected fail /
  8 skipped**，97 files）。
- **真栈** `e2e/feature-mirror-ui.spec.ts` **2 passed（56.2 s）**：40×40×10 板
  （16000）+ 顶面 Φ6×10 凸台（+90π）→ 范围 特征镜像、源 拉伸 2、平面 YZ x=20 →
  **16565.486 mm³** vs 解析 16000+2×90π = 16565.487（单 body）；树
  `sketch/extrude/sketch/extrude/featureMirror` 全 status=0，params
  `{sourceFeatureId, planeLine {origin(0,0,0), normal(1,0,0)}}`，插入预览
  `data-dynamic=1`（切换特征作用域时 body preview 清空 → 选源后 featureMirror
  预览重新出现），push+重开一致。
- **单测**：FeatureDialog **164/164**（+4：缺省零件镜像/切特征隐藏操作页签与面选项/
  源+YZ 载荷/空源禁用/预览调用）；web 全量 **1484/1484**；tsc/eslint 绿。
- **未做**：面镜像作用域（`faceRef → planeLine` 解析）；多源特征镜像的选择 UI
  （切片 4 已接后端/converters，UI 仍单源）；featureMirror updateParams（编辑）；
  后端 featureMirror 预览；真实 PS 转绿（上游 imprintFace/pattern 语义仍阻塞）。
- 回滚：纯前端通道 + 无契约变更；移除 scope 下拉/feature 分支即恢复 body mirror，
  已落库 featureMirror 仍可读（树/求值不受影响）。

## 实现记录（切片 4：featureMirror 多源，2026-11-09，shared 1.58.0）

- **动机**：语料中存在一个 FEATURE mirror 选中多个源特征（`instanceFunction.featureIds`
  长度 >1）；切片 3 只映射单源，converter 将多源整条 dropped。
- **契约（shared 1.58.0）**：`FeatureMirrorParams` 增 `sourceFeatureIds?: string[]`，
  与 `sourceFeatureId?` **恰一**；多源非空且不得重复。旧单源载荷逐字兼容。
- **后端**：`featureMirrorSchema` 对单/多源恰一、重复、`planeLine.normal` 非零做
  zod 校验；`evaluateFeatureMirrorAsync` 按参数顺序逐源取前/后缓存差集 → 世界平面
  反射 → 按源操作对当前体 Unite/Subtract。源限仍为 extrude/revolve/hole 的
  add/remove；任一源缺失/抑制/无上游/增量空即 status=1，不做部分静默成功。
  语义按“顺序累积”登记（独立源与集合镜像等价；重叠源顺序敏感，首版不归并）。
- **converter（test-only）**：FEATURE mirror 的 `featureIds.length > 1` 不再 dropped，
  逐源校验类型/操作/已转换后写 `sourceFeatureIds`；任一源不可回放则整条 blocked。
  batch 重转 164 场景计数不变（complete 7 / geometry 12 / smoke 7 / blocked 75 /
  failed 50 / skipped 48）；新增 1 个场景携带多源（Jackhammer，仍被 moveFace/
  THIN/PROJECTED 等上游缺口阻塞，不转绿）。
- **translator**：多源逐个 `featureIdBySource` 换本地 id，载荷写
  `{sourceFeatureIds, planeLine}`；单/多源并存、重复、未建链均抛
  `BlockedCapabilityError`。`scenario-to-op` **44/44**。
- **验证**：
  - backend `FeatureMirrorFlow` **5/5**（新增两孔切除一次镜像 16000−4×90π；
    单/多源并存、重复拒绝）。
  - 真栈 `e2e/feature-mirror.spec.ts` **3 passed（1.4 min）**：板 + 两个 Φ6 切除，
    一个 featureMirror `sourceFeatureIds:[cut-a,cut-b]` → **14869.064 vs
    14869.027 mm³**（4×90π 去材），树/status/push+冷重开一致。
  - shared **170/170**、web **1503/1503**、backend `FeatureTypeRegistry` **29/29**、
    tsc/e2e tsc/lint 绿。
- **未做**：UI 多源选择/编辑（FeatureDialog 仍单源；侧栏 featureMirror 编辑本就
  诚实拒收）；多源中包含 featurePattern/面镜像源；重叠源集合语义归并。
- 回滚：additive 参数；旧库无 `sourceFeatureIds` 键，移除 schema/求值分支即回到
  1.57 单源行为。
