# ADR-0010：Transform（仿射变换）

- 状态：已接受（2026-11-07；计划 W2.7 / T7）。**切片 1（刚体）与切片 2（均匀缩放）
  均已实现**；非均匀缩放/剪切、UI/converter 未做。
- 关联：`docs/superpowers/plans/2026-11-06-example-coverage-continuous.md`、
  `docs/adr/0005-extrude-revolve-contract-onshape-parity.md`。

## 背景与证据

- 语料中 `transform` 约 48 个特征（224 个有 features 的 PS），当前能力 gated，
  无契约/后端/UI。Onshape Transform 支持平移/旋转（可带副本），部分场景含缩放。
- 产品现有 body 级移动能力（CopyElementsTool/标准编辑）不进入参数化特征链；
  Transform 必须是可重建、可撤销的标准 FeatureOp，不能走直改通道。

## 决策（切片 1）

1. **契约（shared 1.36.0）**：`LubanFeatureType + "transform"`，`TransformParams`：
   - `translation?: {x,y,z}`（mm，世界系）；
   - `rotation?: { axisOrigin?: {x,y,z}; axisDirection: {x,y,z}; angleDeg: number }`
     （世界轴线段，右手定则；axisOrigin 缺省原点）；
   - `copy?: boolean`（缺省 false）。
   - 至少提供 translation/rotation 之一；轴方向非零、angle 可为负；旧载荷逐字兼容。
2. **后端求值**：异步预求值类；对目标 body 的上游 BRep 条目施加
   `T = translate ∘ rotateAboutAxis`（先旋转后平移，固定顺序并测试钉死）。
   - `copy=false`：变换后条目替换上游；
   - `copy=true`：原件 + 变换副本一次 Unite（重叠合并、不接触=多 lump 单体，合法）；
   - 非 BRep 条目按 pattern 同款 passthrough 保留；上游无 BRep 诚实拒收。
3. **不做**：缩放/非均匀/剪切（Onshape 缩放语义未取证，切片 2）；草图/面级变换；
   多 body 批量选择；converter 映射与 UI（切片 2，需 live 证据）。首版能力在
   capabilities/ribbon 保持 gated，禁止“full 但点了无反应”。
4. **撤销/事务**：走标准 FeatureOp 事务与 undo/redo；无不可逆操作。

## 验证与回滚

- 单元：平移/旋转/组合/副本体积与 bbox；零轴/零变换/上游非 BRep 拒收。
- 真栈：盒体平移副本体积翻倍、旋转后 bbox 轴交换、push+重开一致。
- 回滚：新 FeatureType/参数为 additive；删除注册与契约即回到 1.35 行为，旧库无迁移。

## 实现记录（切片 1，2026-11-07）

- 契约 shared **1.36.0**；后端注册表 `transform`（requiresUpstream + evaluateAsync）+
  `TransformFlow` **5/5**（平移 30 → bbox x [40,50]；copy → 2000；绕 Z 90° →
  bbox x [-10,0]/y [10,20]；旋转+平移 → x [90,100]/y [10,20]；校验矩阵）。
- 真栈 `e2e/transform.spec.ts` **2 passed**：盒体 (10..20,0..10) 绕 Z 90° 质心
  (-5.000,15.000,5)、体积 1000；旋转+平移 (100,0,0)+copy → **2000.000 mm³**、
  质心 (55.000,10.000,5)；push + 重开后一致。后端全量 **773 passed / 8 skipped**，
  web 1389/1389，shared 163/163。
- 能力仍 gated（无 ribbon/dialog）；converter 未映射。缩放/剪切留切片 2。

## 切片 2（已实现 2026-11-07：均匀缩放）

- 契约 shared **1.38.0**：`TransformParams.scale`（>0）与 `scaleOrigin`（缺省世界原点；
  仅 scale 在场合法的固定点）；固定组合顺序 **scale → rotation → translation**。
  零/负缩放、仅 scale=1、scaleOrigin 无 scale 均在 zod 层拒收。
- 后端 `TransformFlow` **8/8**（新增 scale 2 原点 → 8000 mm³/bbox [20,40]；
  scale 0.5@(5,5,5) → 125 mm³/bbox x [7.5,12.5]；scale 2+平移 → bbox x [120,140]；
  校验矩阵含零缩放/scale=1/scaleOrigin 孤立）。
- 真栈 `e2e/transform-scale.spec.ts` **2 passed**：盒体 1000 mm³ → scale 2
  **8000.000 mm³** 质心 (30,10,10) → scale 0.5@(5,5,5) **125.000** 质心 (10,5,5)
  → scale 2+平移 **8000.000** 质心 (130,10,10)，push+重开一致。
- 能力仍 gated（无 UI/converter）；**非均匀缩放/剪切**未做，留后续切片。

## 切片 3（后续）

- 非均匀缩放/剪切、草图/面级变换、多 body 选择、Onshape 对话框字段与预览、
  converter 映射（需 raw 参数与 UI 证据）。

### UI 证据与阻塞评估（2026-11-07，blocked-evidence）

- Onshape live 对话框证据已采集：`ui-evidence/ui-full-audit-20261106/onshape/dialogs/transform.{png,json}`
  ——字段顺序：`要变换或复制的图元` / `按直线平动` / `线或点` / `复制零件` /
  距离滑杆（约 181 px 高）。
- 可平移的后端契约已就绪（translation/rotation/scale/scaleAxes/copy），但对话框的
  **`线或点` 拾取器**是阻塞点：产品现有 `FilletEdgePickTool` 只返回持久边引用
  （`FilletEdgeRef {edge:{nodeId,entityId}}`，无几何），无法在提交前派生方向；
  产品没有线/点选择工具，也没有“按直线平动”的距离方向手柄。
- `复制零件` 亦不能按 Onshape 语义接线：Onshape 复制生成**独立 Part**，产品
  `copy=true` 是原件+副本 Unite（同一 body）；独立副本依赖多体输出（ADR-0015）。
- 结论：UI 保持 `gated`，不以 X/Y/Z 轴输入“差不多”替代 `线或点`；待线/点拾取器
  （含持久引用→方向解析）与 ADR-0015 多体输出后再实现。

## 实现记录（切片 3：非均匀缩放 scaleAxes，2026-11-07）

- 契约 shared **1.45.0**：`TransformParams.scaleAxes?: {x,y,z}`（各轴 >0；全域 1=无缩放）；
  与 `scale` 互斥；`scaleOrigin` 在 scale/scaleAxes 任一时合法。组合顺序不变
  （scale → rotation → translation）。
- 后端 `transformFromParams`：`Transform.createFixedPointAndMatrix(origin,
  Matrix3d.createRowValues(x,0,0, 0,y,0, 0,0,z))`；schema 拒收 scale+scaleAxes 同给、
  零/负轴、全 1 无其它变换、scaleOrigin 无缩放。
- 后端 `TransformFlow` **12/12**（新增 axes (2,1,0.5) 原点 → volume 1000/bbox x [20,40]/
  z [0,5]；绕 (15,5,5) → bbox x [5,25]/z [2.5,7.5]；axes 2+平移 → 8000/bbox [120,140]；
  校验矩阵）。
- 真栈 `e2e/transform-nonuniform.spec.ts` **2 passed**：盒 20×20×10（4000 mm³）→
  axes (2,1,0.5) **4000.000** 质心 (20,10,2.5) → @(5,5,5) **4000.000** 质心 (15,10,5)
  → axes 2+平移 **32000.000** 质心 (120,20,10)，push+重开一致。
- 后端全量 **803 passed / 8 skipped**（94 files），web **1420/1420**，shared **169/169**。
- 能力仍 gated（无 UI/converter）；剪切、草图/面级变换、多 body 选择留后续。

## converter 切片（2026-11-07，test-only）

- 私有 converter 新增 `transform` 映射，首版只支持
  **`TRANSLATION_DISTANCE` + `CAP_FACE` 方向 + 单体目标**：
  - 平移方向 = 端盖外法向：`草图法向 × 拉伸方向符号 × (isStart ? −1 : +1)`，
    再乘 `transform.oppositeDirection`；产物标 `directionApprox=true`（面可能被
    后续特征修改），translator 将整步标近似并在 note 记录；
  - 目标 body = `entities` 查询里唯一可解析的源特征（`makeQuery(id+"F<id>.op…")`
    根；disambiguation 的 `.wireOp` 草图引用不算），runner 在该步时点用 getBodies
    解析 bodyKey，多体模型缺解析即阻塞；
  - `makeCopy=true`（Onshape 独立副本体 ≠ 产品 copy 合并语义）、ROTATION /
    TRANSLATION_ENTITY / TRANSFORM_MATE_CONNECTORS / COPY、对称拉伸端盖方向、
    多 body 查询一律 dropped，不近似。
- 语料 43 个 transform 中仅 2 个满足该形态（`58d046…/60f21…` 单 blocker、
  `664c42…/a3c462…` 另有 Fillet 选择器阻塞）。translator 单测新增 transform
  映射/阻塞断言，`scenario-to-op.spec.ts` 30/30；scenario validator 新增
  transform 类型用例，14/14。
- 后端 `TransformFlow` **13/13**：新增多体显式 `targetBodyId` 用例（两个 box
  body，transform 只平移目标体 30 mm；另一体 bbox 逐字不变），验证 replay 的
  多体目标通道；不动求值器实现。
- 真栈合成 **2 passed**（`transform-target-scenario.spec.ts`）：两个圆柱体
  （π·8²·6 = 1206.371 mm³），scenario `targetSourceFeatureIds` → runner
  `bodyKeyBySource` → `FeatureOp.targetBodyId`；body A 质心 x=0、body B 质心
  x=70，push+重开一致。transform 步骤因 `directionApprox` 如实标近似。
- **真实例 Hydraulic Components 仍被上游阻塞**：真栈回放在 Fillet 1
  （sweptEdge，sketch Sketch 1#1，source=Extrude 1）`matches=0`；该 PS 的
  Extrude 1 是 imprintFace 复合轮廓（外圆+内六边形+内圆），回放器按主导面域
  只拉伸了其中一个区域，外圆侧边不存在 → fillet 边解析失败。这是 imprintFace
  复合/face split 的上游能力缺口，不是 transform/shell 通道问题；该示例不宣称绿。`58d046…/60f21…`（24 特征 / 4 body）的真栈
  逐 body 体积验收待批次窗口，结果另行登记；在此之前不宣称该示例 complete。

## UI 取证复核（2026-11-08，blocked-capability 定级）

- 新增 live 证据（私有仓）：
  `ui-evidence/feature-dialogs-20261108/onshape/transform-picker.json` 与
  `transform-picker-{initial,entity-active,rotation,axis-active,scale,scale-point-active}.png`
  （CDP 连入已登录 Onshape 副本，未写文档，采集后取消）。
- 精确字段序列：
  - 按直线平动：`要变换或复制的图元` / `按直线平动` / **`线或点`** 拾取器 / `复制零件`。
  - 旋转：`要变换或复制的图元` / `旋转` / **`轴`** 拾取器 / `角度` / `复制零件`。
  - 缩放：`要变换或复制的图元` / `缩放` / `均匀缩放` / `缩放` / **`点或配合连接器`**
    拾取器 / `复制零件`。
- 结论从 blocked-evidence 改判 **blocked-capability**：产品 `CanvasSelection`
  （face/edge/vertex）只携带持久拓扑 id/所属 body，不带坐标/方向；`resolveEdgeRef`
  也只返回持久边引用。要实现这些行必须新增“线/点→3D 几何”解析通道（边方向与端点、
  顶点坐标、或配合连接器位置）以及对应的拾取工具，并定义其在特征参数改参后的失效
  语义；这不是“补一个 X/Y/Z 输入框”能等价表达的能力。
- `复制零件` 仍是 Onshape 独立 Part 语义，产品 `copy=true` 为原件+副本 Unite；
  独立副本依赖 ADR-0015 多体输出。
- UI 继续 gated；不以近似控件替代。待线/点拾取解析与多体输出立项后再做。

## 实现记录（2026-11-09，UI 切片：XYZ 平动 / 世界轴旋转 / 均匀缩放 + 预览）

- **范围裁决**：本切片不复活 ADR 曾判定 blocked-capability 的 `线或点` / `轴` /
  `点或配合连接器` 几何拾取通道，也不伪造这些选择器；只渲染 Onshape 证据中
  已有字段且后端契约精确支持的模式子集：
  - **按 XYZ 平动**（`translation`；证据 `transform-modes.json` 的 dx/dy/dz 行）；
  - **世界 X/Y/Z 轴旋转**（`rotation.axisDirection`；轴以世界轴下拉表达，任意
    边/自定义轴只读保留，不改写）；
  - **均匀缩放**（`scale`；世界原点固定点，`scaleOrigin` 只读保留，非均匀
    `scaleAxes` 禁编辑但可切其它模式）；
  - **复制零件**（`copy`）：UI 明示首版语义为原件+副本 **Unite 到同一实体**，
    独立零件副本仍依赖 ADR-0015 多体输出，不冒充 Onshape 独立 Part。
  - 多分量 transform（平移+旋转+缩放同存）禁改参并提示重建；目标实体插入时
    单选（N≤1 自动），编辑时结构只读。
- **后端**：`previewOp` 的 update/insert 白名单加入 `transform`（影子求值 →
  `PreviewResult.preview`），前端经 TileRpc 动态预览；无 schema/契约变更。
- **验证**：
  - 后端 `TransformFlow` **15/15**（新增 p1 updateParams 预览、p2 insertFeature
    预览：entries>0、树/体零写）；后端全量 **878 passed / 1 expected fail /
    8 skipped**（101 files）。
  - Web `TransformDialog` **6/6**（载荷/回显/无操作/目标/自定义轴/多分量与非均匀）；
    web 全量 **1522/1522**、tsc/e2e tsc/lint 绿。
  - 真栈 `e2e/transform-ui.spec.ts` **2 passed（44.3 s）**：盒 1000 mm³ →
    ΔX=30+复制 **2000.000 mm³** 质心 (30,5,5) → 树行编辑旋转 Z 90° **1000.000
    mm³** 质心 (-5,15,5)，插入/编辑预览 `data-dynamic=1`，push+冷重开一致。
- **能力状态**：`transform` 由 gated 翻 full（converter 仍未接；线/点/配合连接器
  拾取、独立零件副本、多分量组合编辑仍 blocked）。
- 回滚：纯 UI + 预览白名单；无 shared/后端 schema 变更。
