# ADR-0005：拉伸/旋转特征契约扩展（终止条件、布尔、方向与 draft）

- 状态：已接受（2026-11-04；Phase 1：extrude endBound blind/throughAll、direction、
  startOffsetMm、operation remove/intersect；Phase 2 已落地 revolve new 与 extrude
  secondDirection（shared 1.24.0）；Phase 4 已落地 extrude draft（shared 1.51.0）；
  Phase 5 upToSurface 平行平面目标面（shared 1.52.0；1.54.0 增偏移距离）；
  Phase 6 THIN 薄壁单侧（shared 1.53.0；2026-11-08 增含孔面域与中间平面）+
  upToNext 最近平行面（同批后端/UI）；upToVertex 与 SURFACE/第二厚度待后续）
- 关联：`docs/adr/0004-sketch-contract-onshape-parity.md`、
  `docs/superpowers/specs/2026-11-04-onshape-batch1-gap-matrix.md`
- 决策者：LubanCAD 平台团队

## 背景

Onshape 示例的 extrude/revolve 远超当前 `ExtrudeParams`/`RevolveParams`：

- `ExtrudeParams` 只有 `operation: new|add|remove`（后端明确拒收 remove）、
  `distance`、`symmetric`、`regions`；没有 `endBound`、方向、起始偏移、draft、
  第二方向、面选择。`RevolveParams` 保留 new/remove 枚举但 schema 拒收。
- Part Feeding Machine Pallet 使用 extrude REMOVE、THROUGH_ALL/UP_TO_NEXT/
  UP_TO_SURFACE、draft、第二方向；Exercise: Clamp 使用 REMOVE/INTERSECT 与多种
  终止条件；Bench SPINDLE 使用 revolve NEW/REMOVE。
- Tutorial 2 iOS 的 Extrude 2 是 imprint-face extrude（从草图内圆在实体上的
  imprint 面拉伸 50mm），当前只能用草图面域近似，属于需要明确的能力边界。

按 P0-04/P0-07，任何 FeatureOp 形状变更必须先 ADR + shared 版本 bump。

## 决策

### 1. ExtrudeParams（shared，additive）

新增可选字段：

```ts
endBound?: "blind" | "throughAll" | "upToNext" | "upToSurface" | "upToVertex";
endBoundRef?: { faceKey?: string; bodyKey?: string; vertexKey?: string };
operation: "new" | "add" | "remove" | "intersect"; // 若内核不支持 intersect，schema 明确拒收
direction?: "forward" | "backward";
startOffsetMm?: number;
draftAngleDeg?: number;
draftPullDirection?: boolean;
secondDirection?: {
  endBound: "blind" | "throughAll";
  distanceMm: number;
  direction?: "forward" | "backward";
  draftAngleDeg?: number;
};
```

语义：

- 缺省 `endBound="blind"`、`direction="forward"`、`startOffsetMm=0`，
  旧 params 行为逐字不变。
- `throughAll`/`upToNext`/`upToSurface`/`upToVertex` 必须由内核/几何求值实现，
  不允许前端把终止条件“换算”为固定 distance 伪装支持。
- `upToSurface`/`upToVertex` 需要 `endBoundRef`；缺 ref 在 op 边界拒收。
- `remove` 走 Subtract；`intersect` 只有在后端内核求值路径存在时才接受，否则
  schema 拒收并登记 `blocked-capability`。
- `symmetric` 与 `direction`/第二方向互斥规则需在 schema 明确，禁止静默优先级。
- 起始偏移是沿拉伸方向的 profile 平移；draft 是侧壁角度；两者都需要预览与提交
  共用同一参数。

### 2. RevolveParams

- 启用 `operation: "new" | "add" | "remove"`；当前 schema 对 new/remove 的显式
  拒收删除。
- `mergeScope` 与 extrude 同口径：remove 必须有目标 body；new 不得带 mergeScope。
- FULL 360° 与非全周 angle 语义不变。

### 3. 面选择 / imprint-face extrude

本 ADR **不**新增 `ExtrudeParams.faceRefs`。Tutorial 2 iOS 的 Extrude 2 先在场景
adapter 中映射为对应草图面域（左环面域）；如果映射后的体积/特征树不能对拍，
再开 ADR-0006 增加 face-extrude，而不是在 1.22/1.23 里半实现。

### 4. 版本与发布

- 实际发布序列：ADR-0005 Phase 1 = 1.22.0；ADR-0004 第一切片 = 1.23.0；
  ADR-0005 Phase 2（revolve new 无形状变更、secondDirection 增字段）= **1.24.0**。
- backend/web 同批；`FeatureTypeRegistry` schema、shared DTO、FeatureDialog、
  preview 共用新字段；DSL 白名单同步。
- 旧库 fixture：Tutorial 2 gold + 旧 extrude 参数（无新字段）必须逐字可读；
  新增字段全部可选，无 BIS schema 迁移。
- 回滚：回退 shared/backend/web 到上一版本；旧数据不含新字段，不需要 down 迁移。

### 5. 测试证据

- schema 单测：每个 endBound/operation/direction 组合的接受/拒收；互斥规则。
- StandaloneDb/FeatureService：BLIND vs THROUGH_ALL vs UP_TO_NEXT 的体积差；
  REMOVE/INTERSECT 的 body 数/体积；draft/startOffset/secondDirection 的几何差。
- 真栈 e2e：Pallet/Clamp 的代表特征链；至少一个 REMOVE + 一个 UP_TO_SURFACE。
- 旧 fixture 回归：Tutorial 2 六特征链体积不变（357.568 ±0.5%）。
- 负路径：缺 endBoundRef、remove 无目标 body、intersect 未实现、draft 越界。

## 实现记录（2026-11-04，Phase 1）

- shared 1.22.0：`ExtrudeParams` 增 `endBound`（blind/throughAll 已实现，upTo* 服务端拒收）、
  `direction`、`startOffsetMm`；`FeatureBooleanOperation` 增 `intersect`。
- backend：extrude `remove`→Subtract、`intersect`→内核 Intersect；`throughAll` 用项目范围
  + 上游可转换范围计算距离（BRep flatbuffer 无 GeometryQuery range，不伪装读取）；
  `direction=backward` 反向扫掠；`startOffsetMm` 沿法向平移剖面。
- UI：extrude 的移除/相交页签启用；方向/起始偏移从本地状态进入真实 params。
- 验证：`FeatureOperationSemantics.test.ts`（remove/throughAll/direction/offset 体积与质心）、
  `FeatureTypeRegistry.test.ts` 21/21、`FeatureEngine.test.ts`+语义 14/14、FeatureDialog 130/130、
  shared 151/151、`tsc` 通过。真栈：MS 源码模式 1.22.0 + web 1.22.0 下 `tutorial2.spec.ts`
  **2 passed（4.0 min）**，体积/特征树与 1.21.0 基线一致；产物模式 `dist-backend` 仍是
  1.21.0，发布前必须按 shared→backend→web 重建，否则 RPC 版本门禁会拒绝。
- revolve remove 已落地：`RevolveParams.operation="remove"` → Subtract；UI revolve 移除页签启用。
  验证：`RevolveFlow.test.ts` 9/9（方柱 − 半圆柱 = 64−π）。
- **Phase 2 第一项（v1.23，2026-11-04）：revolve operation="new" 已落地**——NEW-body 行
  不消费上游平铺条目，`AsyncFeatureEval` 直接返回旋转工具体；schema 拒绝 new+mergeScope；
  FeatureService 的 NEW-body 目标规划与 UI 替换/回显同步支持 revolve。验证：
  `FeatureOperationSemantics` 新增「上游已存在时 revolve NEW 产出第二个独立 body」
  （10×20 矩形绕底边 4000π 圆柱，总体积 500+4000π）；`FeatureTypeRegistry` new 接受、
  mergeScope 拒收；FeatureDialog 130/130（revolve 新建页签启用，相交仍禁用）。
- **Phase 2 第二项（shared 1.24.0，2026-11-04）：extrude `secondDirection` 已落地**
  （backend/contract only）。`ExtrudeSecondDirection { endBound: blind|throughAll;
  distanceMm?; direction? }`；缺省方向=主方向相反侧；symmetric 互斥；blind 必填
  distanceMm；throughAll 不得用于 operation=new。求值：两段扫掠体先 Unite 再参与
  add/remove/intersect/new 规划。验证：`FeatureOperationSemantics` 正向 5 + 反向 3
  体积 1600、质心 z=1；`FeatureTypeRegistry` 接受/拒收矩阵；shared 152/152。
  真栈 shared 1.24 复核：`tutorial2` + `tutorial2-tools` 合并 8 passed（8.2 min），
  strict 体积/去材与 1.22 基线一致。
  **UI 仍无 live 证据，不新增第二方向对话框控件**；表单模型以 JSON 只读面暴露。
- 未实现（Phase 2 当时口径；后续进度见文末 Phase 3/4/5/6 记录）：upToNext/upToSurface/
  upToVertex、draft、face-extrude。**Phase 5 起 upToSurface（平行平面目标面）与 Phase 6
  upToNext（最近平行面）+ UI 已实现；upToVertex 仍待办（缺持久顶点引用契约）。**
  拔模输入框已禁用并给出“尚未实现”提示，禁止接受输入后静默丢弃（FeatureDialog
  测试钉住 disabled）。
- **upTo* 的 UI 证据缺口**：已采集 features JSON 有 `UP_TO_*` 终止条件，但现有 UI
  截图/DOM 未覆盖对应对话框；在补采 live UI 证据前只做后端能力，不凭空发明控件。

## 实现记录（2026-11-06，Phase 3：revolve 多面域）

- **shared 1.30.0**：`RevolveParams` 增 `regions?: number[]`，与 `ExtrudeParams.regions`
  同锚（SketchDto.regions 面积降序下标）；`regionIndex` 降级为 deprecated 单面域简写，
  服务端 zod 与 `regions` 同给即拒收（无静默优先级）。旧单面域载荷逐字兼容（缺省 [0]）。
- **backend**：`FeatureTypeRegistry` revolve schema 增 regions + 互斥 superRefine；
  `resolveRevolveInputs` 归一选集（去重、逐域退化守卫）；`evaluateRevolveAsync` 逐域
  旋转（含孔域沿用域内 CSG）后一次 `Unite` 为单一工具实体，再参与特征内 new/add/remove。
  单面域零新增内核调用。
- **UI**：FeatureDialog 的 revolve 通道改用与 extrude 相同的 `selectedRegions` 多选集
  （视口点选增删 chips；编辑回显 `regions`/旧 `regionIndex`）；载荷发 `regions` 不再发
  `regionIndex`；提交门=选集非空且下标未越界 + 轴已选；预览按选集并集边界生成。
- **验证**：
  - backend `RevolveFlow` 新增两互斥矩形环柱：regions [0,1] 全周体积 2500π；
    `FeatureTypeRegistry` regions 接受/互斥/负数拒收；backend 相关 37/37。
  - 真栈 UI `e2e/revolve-multi-region.spec.ts` setup+test **2 passed**：
    视口点选 2 面域 + 轴 → 体积 **7853.981 mm³**（2500π=7853.982，0.00001%），push+重开。
  - 真实示例 `e2e/examples/hand-brake-scenario.spec.ts` setup+test **2 passed**：
    3 特征全链，revolve regions [0,1]（审计选择：上半轮廓两域；下半镜像域排除）
    + SWEPT_EDGE 1 mm 倒角，体积 **7125.270 mm³** vs 采集 7125.274。
    此前单 region 0 为 5358.127（−24.8%），多面域契约即根因修复。
- **诚实边界**：converter 对多 query 的 Onshape revolve 只能给面积降序前缀
  `[0..n-1]` 的 best-effort（`regionRisk`），示例/replay 必须审计具体面域；
  Hand Brake 的审计选择写在该 spec 的 `withAuditedRevolveRegions`，不冒充通用自动映射。

## 实现记录（2026-11-08，Phase 4：extrude draft）

- **契约 shared 1.51.0**：`ExtrudeParams.draftAngleDeg`（度制，0<|angle|<89）+
  `draftPullDirection`（Onshape「反向」）。中性面=草图平面；有效角为正时远端截面沿
  材料外侧偏置 δ=distance·tan(θ)（外环扩大、孔环缩小），反向键翻转符号。首切片仅
  `sketchId` + `endBound=blind`，与 `symmetric`/`secondDirection`/throughAll 互斥；
  内联 profile 诚实拒收（无可靠 2D 偏置）。
- **后端**：`FeatureEngine` 新增 `loftDraftedLoop`/`sweepSketchRegionDraft`/
  `sweepSketchRegionsDraft`——`CurveOps.constructCurveXYOffset` 在草图 XY 偏置基环，
  远端环沿法向落位后 Loft；含孔面域外环/孔环反向偏置（实测同号会放大孔），逐域
  Unite。`ScenarioReplay` 拔模由阻塞改为映射（弧度→度），并标 `draft(approx sign)`。
- **UI**：FeatureDialog extrude 平铺「拔模」复选启用，勾选后出现「拔模角度」（缺省 3°）
  与「反向」；edit 模式回显并走 updateParams 合并/删除键。live 证据
  `ui-evidence/draft-dialog-20261108`（Onshape 拔模 → 角度 3 deg → 反向）。
  拔模预览（2026-11-08 补）：`buildExtrudePreview` 新增 `draft`
  参数，远端环按 δ=|d|·tan(θ) 沿环右法线/角平分线偏置（外环扩、孔环缩），
  pullDirection 翻转；拔模角非法时不画（不伪造锥度）。单测
  `feature-preview.test.ts` **10/10**（外扩/反向/反向拉伸/孔环收缩）；真栈
  `extrude-draft-ui.spec.ts` 断言对话框拔模预览叠层可见（2 passed）。
- **验证**：后端 `ExtrudeDraftFlow` **4/4**（矩形 10° 外扩=棱台公式、反向收窄、
  含孔面域外环扩/孔缩、7 组形态拒收）；`ScenarioReplayParity` 拔模用例 4/4；
  shared **170/170**；web FeatureDialog **160/160**；真栈
  `e2e/extrude-draft-ui.spec.ts` **2 passed**——10×10 深 10，10° →
  **1394.109 mm³**，双击编辑改 5° → **1185.18 mm³**，push+重开一致。
- **诚实边界**：Onshape `draftPullDirection` 的方向符号只按字段直接映射，尚未用 live
  几何独立校准；converter/translator 对该步标 approximate，不据此宣称示例 complete。
  同样未做：第二方向拔模、symmetric 拔模、throughAll 拔模、内联 profile 偏置。

## 备选方案

- **前端换算终止条件**：会伪造几何，拒绝。
- **新增第二套 extrude RPC**：违反 P0-05/P0-07，拒绝。
- **只做 Blind**：无法覆盖 Pallet/Clamp，Batch 1 无法完成，拒绝。

## 后果

- 内核/后端需要真正实现终止条件与 draft，不只是 DTO 透传；工作量主要在几何求值。
- FeatureDialog 的“终止条件/方向/起始偏移/拔模”从本地 UI 状态变为真实参数；
  现有仅 UI 状态必须删除或接线，禁止双事实源。
- iOS 的 imprint-face 仍是已知边界；adapter 失败时登记 `blocked-capability`，
  不宣称完整复刻。

## 后续（ADR-0006）

以下能力不在本 ADR：hole、draft 特征、rib、feature/face pattern、非世界平面
mirror、cPlane、assignVariable、sheet metal、custom FeatureScript。它们需要各自的
几何/变量系统设计，按 Batch 1 缺口矩阵另行立项。

## 实现记录（2026-11-08，Phase 5：extrude upToSurface 平面目标面首切片）

- **范围（第一切片）**：`endBound="upToSurface"` + 持久面引用 `endFaceRef`
  （`LubanTopologyId`，目标面属上游 body）。仅支持**与草图平面平行**的平面面；
  非平行面、曲面、多面片、失效引用诚实 status=1。`upToNext`/`upToVertex` 继续拒收。
- **语义**：扫掠终点=目标面所在平面与草图法向的相交距离；`startOffsetMm` 从该距离中
  扣除；结果必须为正。载荷中的 `distance` 在该模式下仅为形态占位（与 throughAll 同口径，
  服务端不使用）。`symmetric` / `draftAngleDeg` / `secondDirection` 与 upToSurface 互斥。
- **动态解析（不是参数快照）**：目标面在每次求值周期由持久 `endFaceRef` 重新解析为世界
  平面（scratch carrier + `facesFromId` + `CurveOps.isPlanar`，复用 mirror faceRef 通道），
  解析结果只进求值期内存映射，不写 params/不写库；上游几何/面移动后重建即重解析。
  异步预解析挂在 preEvaluateDirty / rebuildAll / evaluateChainForPreview 的求值循环前；
  同步 EDE 求值只消费该映射，缺失即 status=1（冻结旧几何，不静默用旧距离）。
- **契约 shared 1.52.0**：`ExtrudeParams.endFaceRef?: LubanTopologyId`；
  zod：`endFaceRef` 仅与 `endBound="upToSurface"` 成对出现；upToSurface 要求
  `sketchId`、上游实体、非 new/newBody；upToNext/upToVertex 仍拒收。
- **验证（本切片停止点）**：
  - 后端 `UpToSurfaceFlow` **5/5**：板 20×20×5（2000 mm³）+ 10×10 切除 →
    upToSurface 顶面 remove **1500.000 mm³**（占位 distance=1 未被使用）；冷重建
    （清缓存 + rebuildAll）重解析后仍 1500；失效 faceRef / 非平行右面 → status=1、
    体保持 2000；schema 矩阵 8 组拒收（缺 endFaceRef、upToNext/upToVertex、
    blind+endFaceRef、symmetric、draft、secondDirection、operation=new）。
    后端全量 **842 passed / 1 expected fail / 8 skipped**（98 files）。
  - shared **170/170**（interfaceVersion 1.52.0）；web **1484/1484**。
  - 真栈 `e2e/extrude-up-to-surface.spec.ts` **2 passed（53.7 s）**：直接 RPC 建板 +
    视口拾取顶面 faceRef=(1,6) + 内嵌草图 upToSurface remove → **1500.000 mm³**，
    树 `sketch/extrude/sketch/extrude` 全 status=0、params 保留
    `{endBound:'upToSurface', endFaceRef, distance:1}`，push + 冷重开一致。
- **UI（2026-11-08 补，live 证据 `ui-evidence/feature-dialogs-20261108/onshape/`
  `extrude-endbound-menu.json` / `extrude-endbound-surface.json`）**：终止条件下拉增
  「成形到面」（与 Onshape 的 给定深度/成形到下一个面/成形到面/成形到零件/成形到顶点/
  完全贯穿 同序列，但本切片只启用成形到面）；目标面=ribbon 路由时快照的**唯一选中面**
  （无面/多选禁用选项并提示，不猜面）；面行只读显示 `nodeId:entityId`；载荷发
  `{endBound:'upToSurface', endFaceRef}`；距离框禁用。Onshape 的 `hasOffset`（偏移距离）
  与面拾取器本切片不渲染（无产品通道/证据，不造假控件）。edit 模式回显落库
  `endFaceRef` 只读；切回盲孔/完全贯穿时删除 endFaceRef 落库键。
- **UI 真栈** `e2e/extrude-up-to-surface-ui.spec.ts` **2 passed（1.1 min）**：板
  20×20×5 + 内嵌 10×10 草图 → 视口选顶面 → ribbon「拉伸」→ 草图 2/移除/成形到面 →
  **1500.000 mm³**，params `{endBound:'upToSurface', endFaceRef:(1,6), operation:'remove'}`，
  push+重开一致；web **1487/1487**（FeatureDialog **167/167**，+3 UI 单测）。
- **回滚**：additive 字段/分支；移除 schema 分支与预解析即回到 1.51 行为；旧库无迁移。

## 实现记录（2026-11-08，Phase 6：extrude THIN 薄壁首切片）

- **契约 shared 1.53.0**：`ExtrudeParams.bodyType?: "SOLID" | "THIN"` +
  `thinThicknessMm?: number`（>0）。缺省 SOLID（旧载荷逐字兼容）。THIN 首切片：
  仅 `sketchId` 模式、单侧向内壁厚、无孔面域；与 `symmetric`/`draftAngleDeg`/
  `secondDirection`/`upToSurface`（及其它 upTo*）互斥（zod 诚实拒收）。
- **后端求值**（`FeatureEngine`）：外环 Sweep − 向内偏置 `thinThicknessMm` 的内环
  Sweep（`CurveOps.constructCurveXYOffset`，与 draft 同通道）→ 空心体；逐面域
  Unite；含孔面域/偏置退化诚实抛错 status=1。主体积/方向/起始偏移沿用主路径。
- **UI**（live 证据 `ui-evidence/feature-dialogs-20261108/onshape/extrude-upto2-thin.png`）：
  结果类型页签「实体/薄壁」启用、曲面禁用（无 SURFACE 通道）；薄壁页签出现「壁厚」
  输入（缺省 1 mm）+ 单侧说明；与 symmetric/draft/第二方向/成形到面互斥并主动复位；
  载荷发 `{bodyType:"THIN", thinThicknessMm}`。Onshape 的第二厚度/中间平面不渲染。
- **验证**：后端 `ExtrudeThinWallFlow` **4/4**（10×10×10：壁厚 1 → **360 mm³**、
  壁厚 2 → 640、超厚 status=1 不产体、schema 7 组拒收）；shared **170/170**；
  web **1490/1490**（FeatureDialog **170/170**，+3 薄壁 UI 测试）；真栈
  `e2e/extrude-thin-wall-ui.spec.ts` **2 passed（51.8 s）**——薄壁 1 mm
  **360.000 mm³**，树 params `{bodyType:"THIN", thinThicknessMm:1}`，push+重开一致。
- **upToNext（同日增补）**：`endBound="upToNext"` 无需 `endFaceRef`——后端在求值周期
  枚举上游 BRep 面，取沿拉伸方向最近、且与草图平面平行的平面面（在起始偏移前方）；
  无候选/非平行面 → status=1。延续 UpToPlane 动态解析映射（不落库）。schema：
  sketchId/上游必需，与 new/symmetric/draft/secondDirection 互斥，不接受 endFaceRef。
  UI 终止条件增「成形到下一个面」（无需先选面）。验证：`UpToSurfaceFlow` 组合 **8/8**
  （upToNext 板顶 remove **1500**、无前方面 status=1 体不变、schema 5 组拒收）；真栈
  `e2e/extrude-up-to-next-ui.spec.ts` **2 passed（53.1 s）** 1500 mm³ push+重开。
- **诚实边界**：双厚度/中间平面、薄壁拔模/第二方向、SURFACE 结果体、upToVertex、
  upTo* 组合未实现；`batch`/converter 的 THIN 仍 blocked（产品仅 RPC/UI 单面域首切片）。
  upToNext 仅平行平面面参与（斜面/曲面不当作下一个面）。
- **回滚**：additive 字段/分支；移除 THIN 分支即回到 1.52 行为，旧库无迁移。

## 实现记录（2026-11-08，Phase 6 增补：THIN 含孔面域）

- **语义**：含孔面域的薄壁 = 外环带（外环 − 向内偏置厚度）先减去孔实体，
  再与孔壁带（孔边界**向外**偏置厚度的 Sweep − 孔边界 Sweep，并与外形体求交）
  Unite；孔壁带方向取负偏移（外环/孔环的 `constructCurveXYOffset` 正方向均为环内）。
  偏置退化/孔环非闭合 → status=1，不产退化体。
- **验证**：后端 `ExtrudeThinWallFlow` **5/5**（新增 4×4 外矩形 + r=0.5 圆孔、
  t=0.5、depth=2 → **18.712 mm³**：外环带 7 + 孔壁带 0.75π，体积×2）；
  真栈 `e2e/extrude-thin-wall-ui.spec.ts` **3 passed（46.8 s）** 同体积 18.712，
  tree status=0、push+重开一致；既有 10×10 薄壁 1 mm **360 mm³** 回归不变。
- **未做**：多孔=逐孔循环已支持但无独立验收；孔边界与外轮廓间距小于厚度时的
  合并/自交由内核裁决（失败如实 status=1）；双厚度（非对称两侧）与中间平面
  见下节（中间平面已落）。
- **回滚**：只改 THIN 求值分支，无契约/库迁移；移除孔壁带分支即回到无孔首切片。

## 实现记录（2026-11-08，Phase 6 增补：THIN 中间平面）

- **契约 shared 1.55.0**：`ExtrudeParams.thinMidPlane?: boolean`——薄壁厚度以草图
  边界为中心，向两侧各 `thinThicknessMm/2`；仅 `bodyType=THIN` 合法（否则 zod 拒收）。
  与 `symmetric`（深度方向对称）无关，但仍拒绝 THIN+symmetric 的其他语义组合。
- **求值**：外环带=外扩半厚 Sweep − 内收半厚 Sweep；孔壁带同构（孔边界外扩半厚 −
  内收半厚），并裁剪到外扩外形；含孔时先挖孔实体再 Unite 孔壁带。偏置退化/非闭合
  诚实 status=1。无新增库/schema 迁移。
- **UI**：薄壁页签按 live 证据行序先渲染「中间平面」复选，再「壁厚」；载荷发
  `{bodyType:"THIN", thinThicknessMm, thinMidPlane:true}`；edit 回显并支持切换/删除旧键。
- **验证（本切片停止点）**：
  - 后端 `ExtrudeThinWallFlow` **7/7**：10×10、t=1、depth=10 中间平面 →
    **400 mm³**（11²−9²）×10；含孔中间平面 4×4/r0.5、t=0.5、depth=2 →
    **19.142 mm³**；schema 非 THIN 带 thinMidPlane 拒收。
  - 真栈 `e2e/extrude-thin-wall-ui.spec.ts` **4 passed（1.1 min）**：薄壁 1mm **360**、
    中间平面 1mm **400**、含孔 **18.712** 均 push+重开一致；后端全量
    **857 passed / 1 expected fail / 8 skipped（99 files）**。
  - shared **170/170**（interfaceVersion 1.55.0）；web **1496/1496**（FeatureDialog **176/176**）。
- **未做**：第二厚度/非对称双侧、薄壁拔模/第二方向、SURFACE、upToVertex、
  converter THIN 映射（仍 blocked）；多孔独立验收。
- **回滚**：additive 字段/分支；移除中间平面分支即回到 1.54 行为，旧库无迁移。

## 取证记录（2026-11-08，upToSurface 对话框内面拾取：blocked-capability）

- **尝试**：复用 `store.canvas.selection` 让 FeatureDialog 在打开后接收单面选择
  （与 MoveFaceDialog 同源），替代“打开前必须在路由快照里有面”的限制。
- **真栈反证**：无预选面时打开拉伸 → 点选板顶面 → `成形到面` 仍禁用、store
  selection 仍为空（`e2e/extrude-up-to-surface-ui.spec.ts` 临时 live-pick 用例；
  test-results 截图 `打开对话框后在画布点选目标面`）。根因：`useOnshapeSelection`
  的 paused effect 在任意 dialog/草图打开期间 `clearCanvasSelection` 并
  `tool.pause(true)`（X-03 唯一投影写点裁决），画布拾取不回流。
- **定级**：blocked-capability，不是字段证据缺口。现有产品姿态=打开前选面
  （路由快照）；面拾取器/对话框内点选需要 dialog-scoped pick mode（或对特定
  面字段临时解除 paused），涉及选择权威/工具生命周期设计，另立 ADR 切片。
  不渲染“在视口点选”假按钮。
- **可重复证据**：`FeatureDialog.tsx` 中 `upToFaceSnapshot` 仅取 `initialFaces`；
  `useOnshapeSelection.ts` 的 paused effect 清选择；临时 live-pick e2e 已回退，
  未进入绿门。

## 实现记录（2026-11-08，Phase 5 增补：upToSurface 偏移距离）

- **语料与 UI 证据**：148 个 upToSurface 中 14 个 `hasOffset=true`（4 个
  `offsetOppositeDirection=true`；值域 1–3.35 mm/英制 0.025–0.5 in）。live UI
  证据 `ui-evidence/feature-dialogs-20261108/onshape/extrude-endbound-surface.json`
  有 `hasOffset` 行（「偏移距离」）；raw 字段 `hasOffset/offsetDistance/
  offsetOppositeDirection` 同日统计。converter 仍不映射 upToSurface（目标面查询未采集）。
- **契约 shared 1.54.0**：`ExtrudeParams.endOffsetMm?: number`（mm，>0）+
  `endOffsetOppositeDirection?: boolean`。仅 `endBound="upToSurface"` 合法；反向键仅在
  距离在场时合法；upToNext/盲拉/完全贯穿携带偏移一律 zod 拒收（首切片仅成形到面）。
- **语义**：目标面平面沿拉伸方向平移 `±endOffsetMm`（反向=朝起始端回退），再扣
  `startOffsetMm`；偏移后距离非正 → status=1。目标面仍须与草图平面平行；面平面
  每次求值周期动态解析（同 Phase 5），偏移不写 params 外的几何快照。
- **验证（本切片停止点）**：
  - 后端 `UpToSurfaceFlow` **12/12**：新增偏移 +5 add（板 2000 → **2500 mm³**）、
    偏移反向 2 remove（顶面 z=5 → 终点 z=3，**1700 mm³**）、updateParams
    1500→1700→关闭 1500、schema 5 组拒收（盲拉/upToNext/反向孤键/0/负值）；
    后端全量 **855 passed / 1 expected fail / 8 skipped（99 files）**。
  - shared **170/170**（interfaceVersion 1.54.0）；web **1494/1494**；FeatureDialog **174/174**
    （+3：插入偏移载荷、非正禁用、edit 回显/合并）。
  - 真栈 `e2e/extrude-up-to-surface-offset-ui.spec.ts` **2 passed（1.1 min）**：
    板 20×20×5 + 内嵌 10×10 草图 → 视口选顶面 → 移除/成形到面/偏移 2/反向 →
    **1700.000 mm³**，树 params 保留 `{endOffsetMm:2, endOffsetOppositeDirection:true}`，
    push+冷重开一致。
- **未做**：偏移与 upToNext/upToSurface 面选择器组合、偏移方向相对面法向的
  Onshape 像素级确认、converter 映射（目标面查询仍缺）。不把 14 个语料特征标绿。
- **回滚**：additive 字段/分支；移除偏移项即回到 1.53 行为，旧库无迁移。

## 实现记录（2026-11-09，Phase 7：extrude upToVertex 草图顶点终止）

- **语义**：`endBound="upToVertex"` + `endVertexRef`（`{sketchId, entityId, part}`）——
  目标顶点可在另一张草图；后端按该顶点世界坐标在拉伸方向上的投影减去
  `startOffsetMm` 得深度。`distance` 仅形态占位。草图改参后重建即重算（不落几何快照）。
  目标顶点复用孔位顶点解析语义：point=点本身；line=start/end/center；
  arc/circle=start/end/center；spline=首/末点（center 拒收）。
- **契约 shared 1.60.0**：`ExtrudeParams.endVertexRef?: ExtrudeVertexRef`。仅
  `endBound="upToVertex"` 合法，且必须带 `sketchId`；与 symmetric/draft/THIN/
  secondDirection/endFaceRef/endOffsetMm 互斥（zod 拒收）。失效草图/实体、
  投影深度非正 → 求值 status=1，体保留最后几何。
- **converter/translator（test-only）**：私有 converter 将 `endBoundEntityVertex` 单查询
  的 **SKETCH_ENTITY 顶点**解析为 `endVertexRef{sketchFeatureId,entityId,part}`
  （compressed 查询去点定位 sourceId，取其后第一个 start/end/center；CAP_VERTEX/
  上游 op 派生顶点、多查询/未解析一律 dropped 不猜）；公共 translator 经
  `sketchIdBySource` 换成产品局部 sketchId 并直通 `endBound="upToVertex"`；
  缺引用/坏引用回退既有静态深度近似或阻塞。batch 重转 164 场景计数不变
  （complete 7 / geometry 12 / smoke 7 / blocked 75 / failed 50 / skipped 48）；
  13 个含 UP_TO_VERTEX 的 PS 仍被草图平面/imprint/laserJoint 等其它缺口阻塞，
  无新增绿例；cf562… 场景携带 3 个 `endVertexRef`（entity 1/2, part=end）。
- **UI 未接（本切片停止点）**：FeatureDialog 终止条件下拉尚无「成形到顶点」。本切片不宣称 UI 完成。
  **更新 2026-11-12**：ADR-0017 Stage G1 已接通该 UI——终止条件「成形到顶点」+
  目标顶点下拉（候选=全部草图点/线端点/弧端点/圆心），真栈
  `e2e/extrude-up-to-vertex-ui.spec.ts` 移除 1700.000 mm³、push+冷重开一致；
  视口直接拾取模型顶点仍未做。
- **验证（本切片停止点）**：
  - 后端 `UpToVertexFlow` **6/6**：板 20×20×5（2000 mm³）+ z=0 内嵌 10×10 草图 +
    z=3 顶点草图点 (5,5) → 深度 3、remove **1700 mm³**（distance 占位 1 未被使用）；
    冷重建清缓存 + rebuildAll 仍 1700；坏实体/坏草图/共面零深度均 status=1 体保持 2000；
    schema 9 组拒收。
  - 真栈 `e2e/extrude-up-to-vertex.spec.ts` **2 passed（39.1 s）**：5 行树
    `sketch/extrude/sketch/sketch/extrude` 全 status=0，params 保留
    `{endBound:"upToVertex", endVertexRef, operation:"remove", distance:1}`，
    **1700.000 mm³**，push+冷重开一致。
  - shared **170/170**（interfaceVersion 1.60.0）。
- **回滚**：additive 字段/分支；移除 upToVertex 分支即回到 1.59 行为，旧库无迁移。

## 语料裁决（2026-11-09：SURFACE bodyType / 双厚度薄壁）

- **SURFACE（曲面体）**：全语料 109 个 `features.json` 扫描到 **59 个** `bodyType=SURFACE`
  特征，分布在 **13 个 Part Studio**（多数为 NEW，少量 ADD）。产品管道是实体 BRep 单链
  （BRepGeometry 体 + 质量属性/选择/tile 都假设闭合实体），没有开放曲面的体表示、显示、
  选择与质量语义。首切片不做“按 SOLID 扫掠”的近似（会把曲面件误标实体），登记为
  **blocked-kernel**；converter 继续显式 dropped。
- **双厚度薄壁**：扫描 `thickness2` 非零的 extrude 特征为 **0**（33 个文件出现该参数，
  全部为 0）；当前单厚度 `thinThicknessMm`/`thinMidPlane` 覆盖语料实际使用。双厚度
  `thickness2` 需 live 对话框证据与产品契约，**零语料收益**，暂缓，不冒充已支持。
