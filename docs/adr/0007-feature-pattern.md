# ADR-0007：FEATURE pattern（特征级阵列）第一切片

- 状态：已接受（计划 W1.4 第一切片，2026-11-07）。
- 关联：`docs/adr/0005-extrude-revolve-contract-onshape-parity.md`、
  `docs/adr/0006-onshape-new-feature-types.md`、
  `docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`（W1.4/T10）。

## 背景与证据

Onshape 语料 36 个 Part Studio / 66 个 pattern 特征，其中 **FEATURE pattern 46 个
（circular 27 + linear 18 + curve 1）**，PART 9、FACE 9。产品原 `pattern` 契约
（v1.14 `PatternParams`）只支持 **PART/body 级**、世界 X/Y/Z 平移与世界 Z 过原点
旋转；FEATURE pattern、任意轴引用、曲线阵列明确不支持。真实示例（如 Exercise:
Clamp / Handle Parts）的 linear pattern 为 `patternType=FACE`，不属于本切片。

本切片解决“特征产生的几何增量”这一最小语义，使 replay 能把 Onshape FEATURE
pattern 的源特征 + 轴线段落到产品特征行，而不是伪造 PART pattern 或跳过。

## 决策

1. **新特征类型 `featurePattern`**（不扩展 `PatternParams`，避免污染既有 PART
   阵列的守卫/UI/测试）：
   ```ts
   interface FeaturePatternParams {
     sourceFeatureId: string;          // 同链上游特征（本地 featureId）
     kind: "linear" | "circular";
     count: number;                    // 含原件，2..1000
     spacing?: number;                 // linear >0
     angle?: number;                   // circular (0,360] 度
     axis: { origin: Vec3; direction: Vec3 }; // 任意世界轴线段
   }
   ```
   `count` 含原件；linear 实例 k 沿 `direction` 平移 `k*spacing`；circular 实例 k
   绕轴线段旋转 `k*step`（整周 angle=360 → step=angle/count；部分角 →
   angle/(count−1)，与 `PatternParams` 同口径；右手定则）。
2. **增量语义（缓存差集）**：求值时不重新求值源特征参数，而是读取
   `FeatureOutputCache`：
   - `add`：delta = 源后 − 源前（源新增材料）；
   - `remove`：delta = 源前 − 源后（源去除材料；hole 恒 remove）。
   再对 delta 逐实例变换，按源操作与当前体 Unite/Subtract。
   这样 blind/throughAll/symmetric/多面域源一视同仁，且不依赖内核的 taper/loft 等
   额外能力。
3. **源白名单**：仅 `extrude`/`revolve`/`hole` 且 operation 为 `add`/`remove`。
   NEW 源（无上游/独立造体）、fillet/chamfer/shell/mirror 源（增量语义不成立）、
   抑源、缺失源、缓存冷/失败一律**诚实拒收**（status=1 或 op 拒绝），不静默退化。
4. **无 UI 入口**（backend/contract 先行）：无 Onshape live 特征阵列对话框证据前
   不新增假控件；树行/图标走通用 fallback。UI 切片需采集 FEATURE pattern 对话框
   （源特征列表/方向/轴/实例数/skip）后另批。
5. **转换器后续（源特征字段已定位，映射仍未实现）**：2026-11-07 二次核查 raw
   pattern features——FEATURE 源特征不在 `entities`，而在
   **`BTMParameterFeatureList(instanceFunction).featureIds`**（`entities=[]` 是
   正常形态，不是缺源）；`operationType=NEW` 是 pattern 的新体语义，不等于源特征
   操作。51 个 pattern：34 FEATURE / 6 PART / 11 未知；源为 extrude/revolve
   ADD 5、REMOVE 26、非白名单（sweep/fillet/draft/lighten）18、多源 10。
   后端当前支持单源 extrude/revolve/hole add/remove，因此理论上可覆盖约 31 个
   单源改体 pattern；但转换器尚未发出 pattern 步，轴 query（SWEPT_FACE/sketch
   entity）与多体输出语义未验证。**在转换器/回放轴解析和真实 PS 体积对拍完成前，
   语料 FEATURE pattern 维持 blocked**；不得按“最后一个特征”猜测或默认世界轴。

## 实现（第一切片，shared 1.34.0）

- shared：`LubanFeatureType + "featurePattern"`、`FeaturePatternParams`、
  `PatternAxisLine`、`FeatureParams` 联合、opDsl 白名单、`interfaceVersion 1.34.0`；
  shared 单测 **160/160**（含 v1.34 契约块）。
- 后端（私有仓 `luban-backend`）：
  - registry `featurePatternSchema`（count/spacing/angle 互斥、轴方向非零）；
  - `evaluateFeaturePatternAsync`：源前后缓存差集 → 实例变换（线性/任意轴圆周）→
    源操作 Unite/Subtract；`transformBRepEntry` 与 PART pattern 共用；
  - `FeaturePatternFlow.test.ts` **4/4**：2×2×2 盒 + 0.5³ 凸台线性 3 实例
    **8.75 mm³**；盒 + 对角凸台绕 (1,1,0)+Z 圆周 4 实例 **12 mm³**；源 sketch/NEW/
    缺失、零轴/形态互斥拒收；registry/RPC **46/46**。
- 真栈：`e2e/examples/feature-pattern.spec.ts` **2 passed**——40×40×10 盒 +
  顶面 4×4×5 凸台 + linear 3 实例（spacing 6 沿 X），体积
  **16240.000 mm³**（16000 + 3×80），push 后重开树
  `sketch/extrude/sketch/extrude/featurePattern` 全 status=0、体积一致。
- 发布：**未发布**。shared 1.34 尚未重建/发布 web/MS 产物；发布必须 shared →
  backend → web 同批，且不能与 1.32/1.33 产物混用。

## 风险与后续

- **增量差集成本**：每次 pattern 求值多做两次布尔（源前/后差集）+ 实例并/减；
  大源/大实例数的性能需在真实示例上测量；失败时 status=1 级联，body 保留最后几何。
- **源特征被后续特征改写**：差集基于源特征时刻的前/后缓存，与当前体的后续修改
  无关；若 Onshape 语料的 pattern 引用源在链后仍被编辑，需在回放层登记语义差异。
- **语料映射缺口（进行中）**：源特征字段已定位为 `instanceFunction.featureIds`；
  51 个 pattern 中约 31 个单源 extrude/revolve add/remove 理论上可映射，但转换器
  尚未发出 pattern 步、轴 query/多体输出语义未验证，**当前仍无法证明任何真实语料
  FEATURE pattern 可回放**；需 converter+axis resolver+真实 PS 体积对拍后另立切片，
  不能把后端合成绿当作示例覆盖。
- **FACE/PART 语义**：PART pattern 继续走既有 `pattern`；FACE pattern、曲线阵列、
  per-instance skip、第二方向不在本切片。
- **UI/编辑**：双击编辑、抑制、删除、预览、树图标/名称与表单通道未接；能力状态
  保持 🟠（backend/contract 首切片），不得宣称 UI complete。

## 实现（第二切片：FACE pattern → featurePattern，2026-11-07，test-only）

- **证据**：语料 FACE pattern 的 `faces` 查询 `derivedFrom` 显式指向源特征
  （如 `FOPo..._1.hole-0.boolean.opBoolean` → Hole 1）；`axis` 查询指向一个 extrude
  的 SWEPT_FACE + 草图实体。Universal Joint 族 2 个 PS 的唯一 blocker 即 FACE
  circular pattern（6 实例 / 360° / 圆柱轴）。
- **converter（私有）**：`convertFeaturePattern()` 首切片——仅 circularPattern、
  patternType=FACE、equalSpace、无 skip；源特征须已转换为 hole/extrude/revolve；
  轴线实体按圆/弧解析为「圆心 + 草图法线」世界线段；其余如实 dropped。同时修正
  单位表达式求值：`2.5*inch` / `.76*inch` 去单位时连同乘号去掉（旧实现留下尾部
  `*`，`.76` 又因 fallback 正则要求点前有数字而失败，导致 Extrude 2/4 缺深度）。
- **scenario 契约（test-only）**：schema/validator 增 `featurePattern` 类型；
  `scenario-to-op` 增 `featurePatternOp`——场景里的 Onshape 源 id 经
  `featureIdBySource` 换成本地 featureId，轴线段透传，缺源/非法 count/轴零向量
  `BlockedCapabilityError`。translator **24/24**、validator **12/12**。
- **合成真栈**：`e2e/feature-pattern-face.spec.ts` **2 passed**——40×40×10 板 +
  圆孔切除 + featurePattern（count 6 / 360° / 轴 (20,20)+Z）→
  **14303.541 mm³**（解析 14303.540，6 孔去材 540π），树 5 特征全 status=0，
  push+重开一致。
- **真实 PS 仍 blocked-evidence（不宣称绿）**：Universal Joint 族 2 例转换出
  8 特征（含 featurePattern），但回放中 Extrude 1–3 体积 264448.769 / 688721.726 /
  790461.999 mm³，Extrude 4（REMOVE）与 Hole 1 体积零变化，featurePattern 源增量
  为空（status=1）。根因在上游 **imprintFace 面域选择/回放偏差**，不是 FACE pattern
  映射；真实 PS 待 imprint 语义切片后重试。

## 实现记录（切片 3：FEATURE circular 转换 + 多体锚定，2026-11-07，test-only）

- **converter（私有）**：`convertFeaturePattern()` 扩展 FEATURE 作用域——源特征取
  `instanceFunction.featureIds`（恰 1 个；hole 或 extrude/revolve 的 ADD/REMOVE，
  NEW 拒收），轴线 query 支持**线**（世界线段）与圆/弧（圆心+草图法线）两种轴形态；
  压缩 query 的 `operationId/sketchEntityId` 解析与已有 sketch map 前缀匹配复用。
- **公共 runner**：多 body 无 scope 的 `featurePattern`/`mirror` 纳入
  `MULTI_BODY_ANCHOR_TYPES`，按最近造体谱系显式锚定 targetBodyId（此前产品拒绝
  “多 body 模型插入特征须显式指定 targetBodyId”）。translator/schema 无新变更。
- **真实 PS 证据（dfc6e33c / 006ab003，2 body）**：转换出 10 特征（含 FEATURE
  circular 16 实例、轴线 (18,0,36.5)→−Z；Mirror FEATURE_ALL）；回放建链成功、
  body 数 2 正确，体积：
  - 期望 body 64,831.091 / 13,917.196 mm³；
  - 实际 65,731.774 / 14,544.246 mm³（+1.39% / +4.50%）。
  **仍 blocked-evidence（2026-11-07 复核）**：Extrude 3 的 Sketch 4 回放实际只有
  1 个面域（3.175×3.175 mm 矩形，面积 10.081 mm²），种子切 28 mm³ 与几何一致；
  converter 的 [0,1] 只是 deterministicIds 计数伪影，runner regionAudit 正确收敛到
  [0]——**不是面域选择错误**。真正缺口：seed 切 28 mm³ 后 pattern 仅再切 ~28 mm³
  （16 实例绕轴多数不与当前体相交，与 Onshape 期望仍有 1.39%/4.50% 偏差），且
  `Mirror 1` 是 FEATURE mirror（fullFeaturePattern=true）被 converter 近似为**整 body
  镜像 Union**，对含切除的特征会加回材料（body1 65,675→65,731）。**FEATURE mirror
  的 body 级近似不成立**，需 feature 级镜像或标 blocked；本 PS 不宣称绿。
- 回归：translator **24/24**、FACE 合成真栈 `feature-pattern-face.spec.ts`
  **2 passed** 不变。

## 实现记录（切片 4：hole 源绕圆柱轴的真实语料验证，2026-11-07）

- **语料**：`Exercise: Intermediate Drawing / Drive Sleeve`（PS 8509862e，8 特征：
  sketch/extrude×4/sketch/hole/circularPattern）。`Circular pattern 1` 为
  `patternType=FACE`、6 实例、360°、equalSpace，`faces` 查询 `derivedFrom` 指向
  Hole 1（`FOPoKze0Om2PwH7_1`），`axis` query 是 Extrude 2 的 SWEPT_FACE + 草图圆
  （圆柱面 → 圆心 + 草图法线 (0,0,1)）。用当前 converter 重转：**8 特征全部映射，
  circularPattern 不再 dropped**（仅剩 Sketch 1 MIRROR / Sketch 2 CONCENTRIC 约束
  缺失），此前 work-queue 的“circularPattern 单 blocker”是旧产物。
- **后端新增用例**（`FeaturePatternFlow.test.ts`）：30×30×2 板（1800 mm³）+
  (10,0) φ4 throughAll 孔（去 8π）+ featurePattern hole 源 circular count 6 /
  360° / 轴原点+Z → **1800−48π ≈ 1649.204 mm³**，单 active body、树全 status=0。
  该用例覆盖“孔特征作为 pattern 源”的 remove delta 旋转阵列，与 Drive Sleeve
  语义同构。`FeaturePatternFlow` **5/5**。
- **离线真实链回放（2026-11-07，backend StandaloneDb）**：扩展
  `test/ScenarioReplay.ts` 支持 featurePattern/featureMirror + 与公共 runner 同口径的
  imprintFace 多查询面域解析（已解析面域照用、未解析查询写日志），新增
  `DriveSleeveScenarioReplay.test.ts`。结果 **known-red**：逐段体积
  Extrude 1 **264448.7** → +Extrude 2 **688721.7** → +Extrude 3 **790461.9** mm³；
  Extrude 4（remove）零去材；孔方向按目标体质心推断（质心在草图法线负侧 →
  backward）后 Hole 1 正常去材，featurePattern status=0 但不再去材，
  最终 **774611.7 vs 采集 1175024.3（−34.08%）**。
  树/单 body 正确，但几何不可宣称复刻——根因是 imprintFace 多查询面域近似把
  **基础轮廓选成小面域拼集**（应为大材料面域/实体 imprint 面），同一查询集在
  Onshape 是实体 imprint/face split，草图面域无法等价表达。测试用 `it.fails`
  诚实登记 known-red；待真正 imprint 语义修正后改回 `it` 并收紧断言，不得调松
  tolerance。
- **公共 web 真栈（2026-11-07，hub 恢复后首跑）**：同一场景
  `drive-sleeve-scenario.spec.ts` 以 `test.fail` 运行——失败发生在
  `featurePattern` 求值：MS 日志 `内核 op 失败: op=1 status=0`（实例化孔与错误
  基础体不相交，Subtract 回包空），树 status≠0，尚未到体积断言。测试保持
  `test.fail`，修复后若意外通过会报 unexpected pass。
  hub 恢复后仍需跑公共 runner 真栈确认同一偏差。
- 未做：FACE pattern 的复数 faces（pattern 一份面集）、skipInstances、第二方向、
  PART pattern 的 cylindrical axis 变体；这些仍按 dropped 登记。

## 实现记录（切片 5：linear FACE/FEATURE pattern 转换，2026-11-07，test-only）

- **语料**：30 个 linearPattern——25 非居中、5 `isCentered=true`；18 FEATURE 单源、
  5 FACE、6 PART。方向 query 形态：CAP_EDGE（12，含嵌套 sketchEntityQuery）、
  草图线 wireOp（6）、派生边/导入边/面（其余）。
- **converter（私有）**：`convertFeaturePattern()` 扩展到 `linearPattern`：
  - 仅 FACE/FEATURE（PART 仍走 body pattern，不在本切片）；
  - 要求 `isCentered=false`（产品 featurePattern 以 seed 为原位、count 含 seed，
    无 seed 居中语义）、`hasSecondDir=false`（无第二方向契约）；
  - `distance` 静态求值为 mm 间距；`instanceCount` 含 seed；
  - 方向 query 复用统一 `resolvePatternQueryEntity()`（明文/compact 两种 query），
    取草图直线 p1→p2 的世界方向；`oppositeDirection` 取反；方向为零/实体非直线
    如实 dropped；重复边方向符号以 `directionRisk` 登记。
- **translator（公共）**：`featurePatternOp` 读取 `directionRisk` → 步骤
  `approximate=true` + note「方向取自草图线 p1→p2，与 Onshape edge 方向一致性未验证」；
  `scenario-to-op.spec.ts` 新增 linear 用例（spacing/轴透传 + approximate），
  **26/26**。schema/validator 无需变更，转换产物校验通过。
- **真实语料证据（非绿）**：Wheel Chock（1e071ddd）重转后 Linear pattern 1 映射为
  `kind=linear count=19 spacing=25 axis origin(0,-370.096,0) dir(0,-1,0)`；
  该 PS 整体属 sheet metal（excluded），不构成示例完成。Pallet 的 linear 因
  `hasSecondDir=true`、Base Frame Bar 的方向实体为圆、GANTRY 转换在草图层即失败，
  均如实 dropped/blocked。**当前没有因本切片转绿的 PS**；等 stack 恢复后按
  真栈体积对拍验证方向符号。
- 未做：isCentered（seed 居中）、第二方向、PART linear、方向边真实朝向采集。

## 实现记录（切片 15：linear directionOne 的 SWEPT_FACE 面法向，2026-11-11）

- **证据（Handle Parts 真栈）**：Linear pattern 1 是 FACE pattern，`directionOne`
  指向上游 Revolve 3（Threaded Shaft）的 SWEPT_FACE；converter 旧逻辑把被选草图线
  （径向线）的 p1→p2 方向映射为世界 +Z。15 个 remove 实例全部落在轴外，Threaded
  Shaft 仅少 27.993 mm³；最终 32,236.419 vs 采集 30,931.280（+4.2%）。
- **修正（私有 converter）**：当 `directionOne` 含 `SWEPT_FACE` 且派生自
  `...opRevolve` 时，从上游 revolve 的旋转轴草图线取世界轴方向；符号由该 revolve
  的 `profileEntityIds` 轮廓在轴上的跨度中点决定（不能取整张草图——同图可含多个
  body 的轮廓与 construction 轴，Handle Parts 实测会把符号带反）。修正后方向为
  -X，最终 Threaded Shaft 30,944.712 vs 30,931.280（+0.043%），整链 +0.009%。
- **诚实边界**：方向仍是静态推导，保持 `directionRisk: true`/回放 approximate；
  只覆盖 FACE linear + revolve SWEPT_FACE 方向；其他面/边方向形态仍按 dropped，
  不用本规则猜。
- 验收：Handle Parts strict（`handle-parts-scenario.spec.ts`）三体逐体 1% 门 +
  树/status/冷重开；公共 catalog 第 22 例。

## 实现记录（切片 6：centered 线性阵列，2026-11-08）

- **证据（官方帮助页 + 论坛）**：Onshape Linear Pattern 的「居中」把 seed 作为中心，
  输入的实例数 N 是**每侧含 seed**，总实例数 = **2N−1**；seed 不移动，偶数总实例不可
  由居中产生（Onshape Help `linear_pattern.htm`；forum 120358）。此前 blocked-evidence
  的“偏移语义未采集”由此关闭。
- **契约 shared 1.49.0**：`FeaturePatternParams.centered?: boolean`。`count` 仍是
  **总实例数（含原件）**；centered 时须为奇数，实例偏移
  `(k − (count−1)/2)·spacing`（k=0 为原件，已在体中）。
- **后端**：`featurePatternSchema` 增 centered；linear+centered 偶数 count 拒收、
  circular+centered 拒收。`featurePatternTransforms` 居中时从
  `−(count−1)/2` 到 `(count−1)/2` 生成变换（跳过 k=0）；formFields 补 centered。
  `FeaturePatternFlow` **7/7**（centered count 3 spacing 0.6 → 变换 ±0.6、
  体 8.75；偶数/圆周 centered 拒收）。后端 registry/RPC 表单一致性 56/56。
- **translator（公共）**：`featurePatternOp` 透传 centered（linear+奇数校验，
  notes 标「居中阵列」）；`scenario-to-op.spec.ts` **34/34**。
- **converter（私有）**：linear isCentered 不再 dropped；按 `count = 2N−1` 映射
  （N=Onshape 实例数），`centered:true` 透传。语料 5 个 centered linear 的
  count/distance 表达式可静态求值（3/38、4/50、5/30）；但 4 个在 Small/Large Step
  的源特征非 hole/extrude/revolve、1 个在 Wheel Chock 为多源/sheet metal →
  **本切片未新增绿例**，仅解除 centered 语义缺口。
- **真栈**：`e2e/examples/feature-pattern-centered.spec.ts` **2 passed**——40×40×10 盒
  + 4×4×5 凸台，centered count 5 spacing 6 → 体积 **16400.000 mm³**、质心 x=0.0000，
  树 `sketch/extrude/sketch/extrude/featurePattern` 全 status=0，params
  `{centered:true,count:5,spacing:6}`，push+重开一致。
- **未做（本切片时）**：body `PatternParams`/FeatureDialog 居中复选框、第二方向、
  跳过实例、PART linear；converter 的真正 centered 绿例需源特征为单 source 的
  extrude/revolve/hole。

## 实现记录（切片 7：body PatternParams 居中 + FeatureDialog UI，2026-11-08）

- **契约 shared 1.49.0**：`PatternParams.centered?: boolean`（与
  `FeaturePatternParams` 同批）；`count` 仍为**总实例数（含原件）**，居中时须奇数；
  circular 不支持居中。
- **后端**：`patternSchema` 增 centered（linear+centered 偶数拒收、circular+centered
  拒收）；`patternInstanceTransforms` 居中偏移 `(k−(count−1)/2)·spacing`
  （k=0 跳过，seed 原位）；formFields 补 centered（boolean）。`PatternFlow` 增
  (b2) updateParams centered count=3 spacing=10 → 体 24、bbox x [−10,12]；
  (b3) 偶数/圆周 centered 拒收。registry/RPC 表单一致性 74/74（4 文件）。
- **UI（FeatureDialog pattern 通道）**：live 证据
  `ui-evidence/feature-dialogs-20261108/onshape/linear-pattern.json`（「实例数」+
  「居中」）；勾选后输入语义切换为**每侧 N（含 seed）**（标签「每侧实例数（含原件）」+
  提示「总实例数 2N−1」），载荷 `count = 2N−1` 且 `centered:true`（非居中不发键，
  旧载荷兼容）；N 域 2–500（总数 ≤999）；圆周形态禁用并复位居中；编辑回显
  `N=(count+1)/2`（脏偶数原值显示交校验拒收）；updateParams 仍发总 count。
- **真栈**：`e2e/pattern-centered-ui.spec.ts` **2 passed**——4×4×5 盒（80 mm³）→
  ribbon「线性阵列」→ 勾选居中、N=3、spacing=6 → params
  `{kind:'linear',count:5,spacing:6,axis:'X',centered:true}` → 5 个互不重叠盒
  **400.000 mm³**、质心 (2.000,2.000,2.500)，树全 status=0，push+重开一致。
  `FeatureDialog.test.tsx` **148/148**（+4：载荷换算/边界/圆周复位/编辑回显）。
- **插入/改参预览（2026-11-08 补）**：后端 `previewOp` 的 `insertFeature` 与
  `updateParams` 均覆盖 body pattern（上游链尾缓存存在时影子求值，零写回传
  `PreviewResult.preview`）；`PatternFlow` 增 (a2) 插入与 (b1) count 3→4 改参
  用例（预览非空、elementId=目标体、体与树零写）。FeatureDialog pattern 通道
  用提交同一载荷 150ms 防抖预览；**edit 模式打开即调用 `previewOp updateParams`**。
  真栈 `e2e/pattern-centered-ui.spec.ts`：插入预览 `data-dynamic=1`（400.000 mm³），
  push+重开后双击「阵列」行编辑对话框再次 `data-dynamic=1`，取消后体积不变。
  单测 FeatureDialog **156/156**（含 edit 打开即预览）。
- **未做**：第二方向、跳过实例（UI 仍禁用占位）；body PART pattern 的 converter
  映射（converter 仍只转 FACE/FEATURE）；圆周居中（Onshape 语义未采集）。

## 实现记录（切片 8：featurePattern 树行编辑 UI，2026-11-08）

- **入口**：特征树行双击 → `FeaturePatternDialog`（ADR-0007 切片 7 同源证据：
  `ui-evidence/feature-dialogs-20261108/onshape/linear-pattern.{json,png}` 的
  阵列类型/实例数/距离/字段语义）。不新开 ribbon 入口（featurePattern 由回放/
  转换器创建）。
- **只读结构引用**：`sourceFeatureId` 与 `axis` 是 updateParams 的结构引用，
  对话框只读展示（源特征 id + 轴原点/方向）并提示不可更改；可编辑
  `kind`/`count`/`spacing?`/`angle?`，`centered` 保持落库值并强制总数为奇数。
  不渲染方向/面拾取等产品未支持的假控件（无 live 证据）。
- **产品侧**：走标准 `updateParams`（无 shared/RPC 契约变更）；
  `sourceFeatureId` 原样回传，避免结构漂移。
- **居中开关（2026-11-08 补）**：linear 可切换「居中」（与 body pattern
  对话框同语义）——勾选后实例数输入切为**每侧 N（含原件）**，载荷
  `count = 2N−1` + `centered:true`；回显 `N=(count+1)/2`，N 域 2–500；
  圆周形态禁用并复位居中（后端 zod 同口径拒收）。
- **改参预览（2026-11-08 补）**：后端 `previewOp` 的 `updateParams` 分支对
  `featurePattern` 用当前源/上游缓存影子求值新参数，回传
  `PreviewResult.preview`（entries/category/placement/model/elementId；不写库、
  不写缓存、无 txn）。目标 body 按「源为 featureId」匹配 active authored body，
  次按 `sourceFeatureId`；缓存缺失/主体不可达静默无预览。后端
  `FeaturePatternFlow.test.ts` **8/8**（新增预览用例：preview 非空、
  elementId=目标体、预览后树 params/体体积不变）。UI 对话框改参 250ms 防抖
  调 `previewOp`，经既有 `FeaturePreviewOverlay` 门户渲染 TileRpc 动态几何；
  真栈断言 `data-dynamic=1`。
- **单测**：`FeaturePatternDialog.test.tsx` **8/8**（回显/updateParams 载荷/
  居中开关与每侧换算/数值域/圆周 switch/源轴缺失/canEdit/预览调用）。
- **真栈**：`e2e/feature-pattern-edit-ui.spec.ts` **2 passed**——40×40×10 盒 +
  4×4×5 凸台 + linear count 3 spacing 6（16240 mm³）→ 树行双击 →
  源/轴只读、实例数 3→4 → **16320.000 mm³**，树/status=0、params
  `{sourceFeatureId, count:4, spacing:6}`；再双击勾选「居中」、每侧 N=3
  → params `{count:5, spacing:6, centered:true}` → **16400.000 mm³**；
  两次打开对话框均出现动态预览（`data-dynamic=1`）；push+重开一致。
- **未做**：方向/面选择（无产品通道与 live 证据）、多源 featurePattern。

## 实现记录（切片 9：树行抑制/删除通道验收，2026-11-08）

- **通用树通道复用**：featurePattern 行无需专用菜单——`FeatureTree` 的
  「抑制/取消抑制/删除」走既有 `setFeatureSuppressed`/`deleteFeature`
  op（`PartStudioSidebar` 接线），本切片补真栈验收。
- **BODY_PRODUCING_FEATURE_TYPES 完备**：体修改型新特征
  （featurePattern/featureMirror/moveFace/faceExtrude/transform/splitPart）
  与体产出型同列，服务 `hasBodies` legacy 回退（无 body 读面时插入后取景/
  消隐回退）；不是第二套体模型，均为标准 `insertFeature` 输出。
  `body-producing.test.ts` **3/3** 钉住条目与排除项（sketch/fillet/chamfer/
  hole/shell 不列入）。
- **真栈**：`e2e/feature-pattern-tree-ops.spec.ts` **3 passed**（setup + 主例 +
  known-red）——40×40×10 盒 + 4×4×5 凸台 + linear count 3 spacing 6
  （16240 mm³）→ 右键「抑制」→ **16080.000 mm³**、行 `data-suppressed=true`
  →「取消抑制」→ **16240.000 mm³** → 右键「删除」→ HITL dialog「删除 特征阵列」
  确认 → 树剩 `sketch/extrude/sketch/extrude`、push+重开树形一致。
- **已知缺口（M1 语义，RW2-T9 backlog）**：`deleteFeature` 不触发 body 再生
  （私有后端 `ChamferFlow.test.ts`「10. 删除链尾」同口径钉住），因此删除
  featurePattern 后 live/冷重开体积仍为删除前的 **16240.000 mm³**，源凸台
  单独存在时应为 16080。已用第二用例 `test.fail` 钉正确期望（16080），
  后端修复再生后翻红提示摘除；不是本切片的 UI 缺陷。
- **未做**：删除后实时 body 再生（M1 backlog）、多源 featurePattern。
  改参预览已在切片 8 补齐（同一 `PreviewResult.preview` 通道）。

## 实现记录（切片 9：featurePattern 多源，2026-11-09，shared 1.59.0）

- **动机**：语料中存在一个 FEATURE pattern 选中多个源特征（`instanceFunction.featureIds`
  长度 >1）；切片 1 只映射单源，converter 整条 dropped。
- **契约（shared 1.59.0）**：`FeaturePatternParams` 增 `sourceFeatureIds?: string[]`，
  与 `sourceFeatureId?` **恰一**；多源非空且不得重复。旧单源载荷逐字兼容。
- **后端**：schema 对单/多源恰一、重复做 zod 校验；`evaluateFeaturePatternAsync`
  按参数顺序逐源取前/后缓存差集 → 同一实例变换 → 按源操作 Unite/Subtract。
  源限仍为 extrude/revolve/hole 的 add/remove；任一源缺失/抑制/无上游/增量空
  即 status=1，不做部分静默成功。语义按“顺序累积”登记（独立源与集合阵列等价；
  重叠源顺序敏感，首版不归并）。
- **验证**：
  - backend `FeaturePatternFlow` **9/9**（新增两凸台源一次 linear count 3 →
    8 + 2×3×0.25 = **9.5**；单/多源并存、重复拒绝）；后端全量
    **867 passed / 1 expected fail / 8 skipped**。
  - translator `scenario-to-op` **46/46**（多源映射、单/多源并存/重复 blocked）。
  - 真栈 `e2e/examples/feature-pattern.spec.ts` **3 passed（1.0 min）**：40×40×10
    板 + 两个 4×4×5 凸台，一次 linear count 3 spacing 6 → **16480.000 mm³**，
    树/status/push+冷重开一致；单源 16240 仍绿。
  - shared **170/170**、web **1509/1509**、tsc/e2e tsc/lint 绿。
- **converter（test-only）**：FEATURE pattern 的 `featureIds.length > 1` 不再 dropped，
  逐源校验类型/操作/已转换后写 `sourceFeatureIds`；batch 164 场景计数不变
  （complete 7 / geometry 12 / smoke 7 / blocked 75 / failed 50 / skipped 48），
  语料暂无同时满足全部源校验的多源场景。
- **未做**：UI 多源选择/编辑（FeaturePatternDialog 仍单源；树行编辑单源）；多源
  重叠集合归并；FACE pattern 多源。
- 回滚：additive 参数；旧库无 `sourceFeatureIds` 键，移除 schema/求值分支即回到
  1.58 单源行为。

## 实现记录（2026-11-09，切片 10：linear 第二方向网格）

- **契约 shared 1.61.0**：`FeaturePatternParams.secondDirection?`（仅 kind=linear）：
  `{ count, spacing?, centered?, axis }`，`axis` 为世界轴线段；两方向平移叠加，
  总变换数 = count × secondDirection.count − 1（seed 已存在于当前体），总实例数
  ≤1000；第二方向 centered 时 count 须奇数。shared interfaceVersion 1.61.0。
- **后端**：`FeaturePatternFlow`/registry schema 接受第二方向并拒收圆周+第二方向、
  缺第二方向 spacing、总实例超限、零轴；`featurePatternTransforms` 生成二维网格
  偏移（非居中 0..N−1，居中 −m..m，排除 (0,0)）。
- **回放**：translator 透传 secondDirection（圆周/非法 count/零轴阻塞）；converter
  按 raw `hasSecondDir/instanceCountTwo/distanceTwo/oppositeDirectionTwo/
  isCenteredTwo/directionTwo` 映射（directionTwo 为 import 边等不可解析时仍 blocked）。
- **验证**：后端 `FeaturePatternFlow` **10/10**（新 3×2 网格用例：5 变换、体 9.5）；
  translator **48/48**；真栈 `e2e/examples/feature-pattern.spec.ts --grep 第二方向`
  **2 passed（38.6 s）**——40×40×10 盒 + 4×4×5 凸台 3×2 网格 **16480.000 mm³**
  push+冷重开；batch 重转 164 场景计数不变（无新绿）。
- **未做**：FeaturePatternDialog 第二方向 UI（无 live 证据）；per-instance skip；
  circular 第二方向（Onshape 不提供）。

## 实现记录（2026-11-09，切片 11：第二方向编辑 UI）

- **证据**：`ui-evidence/feature-dialogs-20261108/onshape/linear-pattern.json`
  （私有仓）行 `hasSecondDir` = 「第二个方向」、`isCentered` = 「居中」；本切片
  只对**已带 secondDirection** 的阵列开放编辑，不新增无轴的第二方向创建入口。
- **UI**：`FeaturePatternDialog` 在 linear 下显示「第二个方向」复选框（落库有值
  即勾选）；展开后编辑第二方向 count/spacing/centered（居中语义同主方向：输入
  每侧 N，载荷 2N−1），第二方向轴作为结构引用只读回显；取消勾选提交时从载荷
  移除 `secondDirection`（可撤销），切圆周自动取消并禁用；两方向总实例 >1000、
  计数/间距非法、轴退化时禁提交并给出诚实提示。非第二方向阵列不渲染该区。
- **验证**：`FeaturePatternDialog` **11/11**（回显/改值/取消/圆周/总量校验）；
  真栈 `e2e/feature-pattern-edit-ui.spec.ts` **3 passed（1.4 min）**（含既有
  单源编辑与居中用例）：3×2 网格 16480 mm³ → 第二方向 2→3、间距 8→5 →
  3×3 **16720.000 mm³**，树/params/push+冷重开一致；web **1518/1518**、tsc/
  e2e tsc/lint 绿。
- **未做**：为无落库轴的特征新增第二方向（需要方向/轴选择器与 live 证据）；
  per-instance skip；圆周第二方向（Onshape 不提供）。
- 回滚：纯 UI 读取既有 1.61.0 契约，无 schema/版本变更；移除该区即回到切片 10 UI。

## 实现记录（2026-11-09，切片 12：多源编辑 UI）

- **证据**：`ui-evidence/feature-dialogs-20261108/onshape/linear-pattern.json`
  行 `entities` = 「要阵列化的图元」（复数集合字段）。
- **UI**：`FeaturePatternDialog` 读取树行已落库的 `sourceFeatureIds`（shared 1.59），
  以只读 chips 回显全部源特征；`sourceMissing` 判定改为“单源或多源至少一个”，
  多源不再被误判为缺失而禁提交。updateParams 按落库形状保留键（多源写
  `sourceFeatureIds`、单源写 `sourceFeatureId`），可编辑 count/spacing/centered
  （含第二方向切片 11 的字段）。源特征集合的增删需要特征选择器，本切片不提供
  （不渲染假控件），仅显示结构引用提示。
- **验证**：`FeaturePatternDialog` **12/12**（多源 chips/保形载荷）；真栈
  `e2e/feature-pattern-edit-ui.spec.ts` **4 passed（1.9 min）**——两凸台多源
  3→2 → **16320.000 mm³**（3 时 16480），树 params 保留
  `sourceFeatureIds`/无 `sourceFeatureId`，push+冷重开一致；web **1519/1519**、
  tsc/e2e tsc/lint 绿。
- **未做**：多源集合增删/重排（需特征选择器与 live 证据）；FACE pattern 多源；
  多源与第二方向同用的编辑已由通用字段支持但无独立真栈用例（组合由后端 10/10
  覆盖变换层）。
- 回滚：纯 UI 读取既有 1.59/1.61 契约，无 schema/版本变更。

## 实现记录（2026-11-09，切片 13：body pattern 第二方向）

- **动机**：featurePattern 已有第二方向（切片 10），但 PART/body 级 `PatternParams`
  仍只有单方向；Onshape 线性阵列对话框的 `hasSecondDir`（私有仓
  `ui-evidence/feature-dialogs-20261108/onshape/linear-pattern.json`）同时适用于
  part pattern。
- **契约（shared 1.62.0）**：`PatternParams.secondDirection?: PatternSecondDirection`
  `{ count, spacing?, axis: 'X'|'Y'|'Z', centered? }`；仅 kind=linear 合法；
  两方向总实例 count×secondDirection.count ≤1000；第二方向 centered 时 count 须奇数。
- **后端**：`patternSchema` 拒收圆周+第二方向、缺 spacing、总实例超限、居中偶数；
  `patternInstanceTransforms` 生成完整网格（identity（0,0）也由 transform 列表承载，
  与 featurePattern 的“源已在链上”语义不同）；`patternFormFields` 补
  secondDirection（表单名集 ≡ zod shape 键集）。
- **UI**：FeatureDialog pattern 通道启用原「第二个方向」占位——linear 下可勾选，
  编辑第二方向 count/spacing/axis/centered（居中输入每侧 N，载荷 2N−1）；
  切圆周可见地取消并禁用；总实例/域校验在确认出口诚实拒收；编辑回显。
- **验证**：shared **171/171**；后端 `PatternFlow` **22/22**（3×2 网格 48 mm³、
  bbox 0..22/0..7；拒收矩阵）、`FeatureTypeRegistry` 表单一致性；后端全量
  **882 passed / 1 expected fail / 8 skipped**（101 files）；FeatureDialog
  **179/179**、web **1526/1526**、tsc/e2e tsc/lint 绿；真栈
  `e2e/pattern-second-direction-ui.spec.ts` **2 passed（53.5 s）**——4×4×5 盒
  3×2 网格 **480.000 mm³** 质心 (14,8,2.5) → 树行编辑 3×3 **720.000 mm³**
  质心 (14,9,2.5)，插入/编辑预览 data-dynamic=1，push+冷重开一致。
- **未做**：per-instance skip、PART/body 圆周第二方向（Onshape 不提供）、
  converter/translator 映射（测试语料 PART pattern 仍被上游缺口阻塞）。
- 回滚：additive 字段；旧库无 secondDirection 键，移除 schema/求值/UI 分支即回 1.61。

## 实现记录（2026-11-09，切片 14：body pattern 第一方向反向）

- **契约（shared 1.63.0）**：`PatternParams.oppositeDirection?: boolean`——仅
  kind=linear；沿 `axis` 负向平移；circular 暂不支持（zod 拒收）。
- **后端**：`patternSchema` 圆周+反向拒收；`patternInstanceTransforms` 线性
  （含第二方向网格）第一方向位移乘 −1；`patternFormFields` 补 oppositeDirection。
- **UI**：FeatureDialog 线性阵列「反向」复选框（轴下拉旁）；载荷与预览携带；
  edit 回显；切圆周自动复位。
- **验证**：shared 171/171；后端 `PatternFlow` **23/23**（反向 count 3 → bbox
  x∈[-20,2]、体积 24；圆周反向拒收）、registry 表单一致性；后端全量
  **883 passed / 1 expected fail / 8 skipped**；FeatureDialog **179/179**、web
  **1527/1527**、tsc/e2e tsc/lint 绿；真栈
  `e2e/pattern-second-direction-ui.spec.ts` **2 passed（46.5 s）**——3×3 网格
  720 mm³ → 勾选反向 → 体积不变、质心 x=-6，push+冷重开一致。
- 回滚：additive 字段；无 oppositeDirection 键的旧库行为逐字不变。
