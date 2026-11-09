/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 鲁班CAD 特征系统 RPC 接口（M1 roadmap T5.8；M3-a 升 v1.1：fillet + suppress/reorder/preview/表单模型；
 * M3-b 升 v1.2：insertSketch/updateSketch op + getSketch/listSketches 读面；
 * RW2-T3 升 v1.3：deleteSketch op（守卫：被任一特征引用即拒收）；
 * RW2-T6 升 v1.4：chamfer 特征类型（ChamferMode 0..4 + 双值倒角参数）；
 * RW2-T7 升 v1.5：shell 特征类型（HollowFaces 抽壳：defaultDistance + 面拓扑 id 集 + distances）
 * + resolveFaceRef 面寻址 RPC（拾取面缓存子实体 id → 持久拓扑 id））。
 * M6-a 升 v1.6：arc 实体 + regions 面域下发 + regionIndex + insertSketch plane。
 * M6-b 升 v1.7：SketchDto +plane（getSketch 回传落库平面——M6-a T7 挂账清偿；
 * 树草图行 params 内 plane 随 JSON 同步下发）。revolve/symmetric 等扩展与本次共用
 * v1.7 版本号（M6-b 计划 T2/T3 分批落字段）。
 * M6-b T2 落 revolve：LubanFeatureType +RevolveParams（草图面域绕草图内轴线旋转）。
 * M6-b T3 落 symmetric：ExtrudeParams +symmetric（对称拉伸，depth 为总深）。
 * M6-c 升 v1.8：ExtrudeParams +regions（多面域选择——Onshape「要拉伸的面和草图面域」多选语义，
 * Tutorial 2 E3 双面域组合拉伸的体积缺口主因修复）；regionIndex 降级 deprecated（单面域简写，
 * 兼容保留一版，服务端 zod 与 regions 互斥拒收）。
 * M6-d 升 v1.9：FilletEdgeRef 纯换为边自身持久 id 单引用 `{edge}`（面对对退役）——M6-d T1 起
 * 内核边创建即赋号（AcisFaceIdAttrib 同款机制，布尔分裂子边继承），op31 对边回自身 id、op36
 * edgesFromOwnId 按 id 直寻（分裂片集合多持）；resolveEdgeRef 产 `{edge}`，求值端
 * edgesFromOwnId 直寻 blend（裂片随形全倒角）。旧面对引用 `{faceA,faceB}` 不兼容：服务端 zod
 * 显式拒收（诚实文案），旧库 fillet/chamfer 特征重算走 status=1 诚实级联（dev 阶段先例同口径）。
 * M7 升 v1.10：布尔草图驱动——BooleanParams（sketchId + regionIndex/regions + distance +
 * operation）单列接口（不塞进 ExtrudeParams：布尔是「以草画面域为工具体、与上游布尔」的独立
 * 语义，掺进拉伸参数会把两条形态的互斥裁决挤进同一接口）。内联 profile 布尔旧路径（M1 起，
 * 语料 REMOVE 映射依赖）逐字保留：BooleanParams 以 sketchId 在场为判别，服务端 zod 与
 * 内联 profile 互斥拒收（同给即拒）。特征类型名不变（booleanAdd/booleanSubtract），
 * operation 与类型名互为真源（booleanAdd⇔unite、booleanSubtract⇔subtract，服务端 zod 一致性拒收）。
 * B2 升 v1.11：loft 放样——LoftParams（两张截面草图 sketchIds 二元组 + 可选 sections +
 * bodyType:'SOLID'）。首版只做**两个平行草图截面**（无 guides/端条件；sections 为保留键，
 * 求值不消费）；求值走 BRepGeometryOperation.Loft=9 的 entryArray（两截面外环 Loop），
 * 单 body 写回。特征类型名 `loft`。
 * B3 升 v1.12：sweep 扫掠——SweepParams（轮廓草图 profileSketchId + 路径草图 pathSketchId +
 * bodyType:'SOLID'）。首版只做**单闭合轮廓沿单条直线路径**（无 twist/scale/lock/guides；
 * 路径草图须恰为一条直线且长度非零，op 边界 txn 之前诚实拒收）；求值走
 * BRepGeometryOperation.Sweep=8 的 entryArray（[剖面外环 Loop, 路径 LineSegment3d]），
 * 单 body 写回。特征类型名 `sweep`。
 * B4 升 v1.13：mirror 平面镜像——MirrorParams（世界平面 XY/YZ/XZ + keepOriginal:true）。
 * 首版仅世界平面（过原点，无任意面/基准面引用）；整条上游体按平面反射后与上游 Unite
 *（保留原体），单 body / 多 lump 写回。特征类型名 `mirror`。
 * B5 升 v1.14：pattern PART/body 级阵列——PatternParams（kind/count/spacing?/angle?/axis）。
 * 首版只做 **PART/body pattern**（FEATURE pattern / 任意轴引用 / 曲线阵列明确不支持）：
 * 整个上游体复制 count 份（**含原件**）并 Union 成单一 body；linear 沿世界 X/Y/Z 位移
 * k*spacing，circular 绕世界 Z 过原点转 k*step（整周 360：step=angle/count 无重叠；
 * 部分角：step=angle/(count-1)，首末实例夹住总角）。特征类型名 `pattern`。
 * B6 M-A3.1 升 v1.15：NEW-body 契约就绪（body 生命周期 + 显式目标 + body 读面）——
 *  - `ExtrudeParams.newBody?`（仅 extrude 消费：true=新建独立 body，不与上游 Unite；
 *    缺省 false=既有 ADD 语义逐字不变）；
 *  - `BodyRef`/`BodyInfo`：body 身份/读面形状（bodyKey=body 元素 id；active/sourceFeatureId/
 *    authored/name 为生命周期读面）；
 *  - `LubanFeatureRpcInterface.getBodies`（只读；authored body，含 consumed 的 active=false）；
 *  - `FeatureOp.insertFeature.targetBodyId?`（N>1 模型 regular insert 的显式目标 body；
 *    `newBody:true` 时它是**锚定链** body，不是新建体；缺省保持 N≤1 legacy 路径）；
 *  - `FeatureOp.deleteFeature.targetBodyId?`（B6 M-A3.2a 增：N>1 模型删除特征显式目标 body，
 *    与 insertFeature 同锚；缺省保持 N≤1 legacy 路径。服务端 planDelete 自 M-A3.1 R1 起
 *    已按真实 FeatureDrives 目标推导并接受本字段——共享面补齐后类型可达，版本不二次升）。
 *  - M-A3.2a 起 web 消费上述新字段：getBodies 零件树/目标实体选择、insertFeature.newBody、
 *    insert + delete 的 targetBodyId（删除入口宿主接线仍归 M3.2b）。
 * B6 M-A4.1 升 v1.16：body boolean 契约就绪（backend/contract only，UI/ribbon 归 M4.2）——
 *  - `LubanFeatureType` + `booleanBodies`；`BooleanBodiesParams`
 *    （`targets`/`tools` BodyRef 数组 + `operation: "unite"|"subtract"|"intersect"` + `keepTools`）；
 *  - v1 收窄（服务端 zod/op 边界诚实拒收，契约类型面保留全形）：`targets` 恰 1、`tools` ≥1、
 *    两集互斥、无重复；unite/subtract/intersect 三操作均由内核执行
 *    （intersect 于 2026-11-07 解锁；UI 相交页签仍按产品节奏启用）；
 *  - 求值语义（服务端）：target ∪/− tools 写回 target（单 BRep）；成功且 `keepTools=false` 时
 *    tools 软删除（active=false，元素/几何保留，可撤销）；失败不消费、target 保留最后几何。
 *  - 无新 RPC 方法（沿用 insertFeature/updateParams/deleteFeature/getBodies；bodyKey 即
 *    `getBodies[].bodyKey`）。**注意**：booleanBodies 的 params 是结构语义键——`updateParams`
 *    不改变 targets/tools/operation（服务端诚实拒收；换 body 请删除特征后重建）。
 * B-model P1 spike 升 v1.17：可选 Part Studio scope——`getFeatureTree`/`applyFeatureOp`/
 * `previewFeatureOp`/`getSketch`/`listSketches`/`getBodies` 末尾增可选 `partStudioId`。
 * 缺省（legacy 路由/旧调用）= 原单工作室行为逐字不变；在场时服务端按该 studio 的
 * def/phys model 分区解析（B-model ADR-0001）。**旧客户端兼容**：参数可选，省略即旧调用；
 * legacy 客户端在含 scoped 分区的库上写 op 会被服务端诚实拒收（防止跨 studio 重排/串链），
 * 错误文案指引携带 partStudioId 重试。
 * B-model P2.2 升 v1.18：Part Studio 注册表——`PartStudioInfo` +
 * `listPartStudios`/`createPartStudio`/`renamePartStudio`/`deletePartStudio`（P2.3/P2.4 消费）。
 * `listPartStudios` 是纯读（不初始化、不建分区、空文档=[]；P1 spike 的无元数据 scoped 标签
 * 以 name=id 列出）；`createPartStudio` 是唯一创建者（空/scoped 文档可建，legacy/mixed/unknown
 * 诚实拒收）；`renamePartStudio` 只改元数据；`deletePartStudio` 拒绝删除最后一个**完整** scope。
 * **写方法 sessionId 必填**（1.18 尚未发布，不保留旧两/三参调用面）：注册表 create/rename/delete
 * 与 applyFeatureOp 同受写租约约束——调用方须先 acquireWriteLease，服务端 assertHeld 通过才写。
 * **删除持久性（P2.2 修复轮 Critical）**：delete 在同一事务写持久 tombstone；该 scope 的惰性
 * 初始化与后续读/写一律拒收，绝不复活已删 scope（`listPartStudios` 也不列 tombstone）。
 * 上面的六个可选 scope 方法逐字不变——注册表不改变旧调用面。
 * v1.19（Tutorial 2 过程级复刻）：草图结构化子实体引用 + 精确样条 + 新约束种类 + 特征 operation
 * 语义 + 质量属性只读面——
 *  - `SketchRef`：数字（显式实体 id，旧形态逐字有效）或结构化子实体引用
 *    `{entity, part:"start"|"end"|"point"|"handle", index?}` / `{origin:true}`。Onshape 的线端点、
 *    圆心、样条拟合点/控制点都是**隐式子元素**，不会膨胀可见实体计数（Tutorial 2 字面 18 实体）；
 *    服务端求解前归一化为内部点实体，写回后仍落 18 实体形态。
 *  - `SketchEntityDto` 增 `spline`（精确三次贝塞尔 controlPoints + fitPoints），line/arc/circle
 *    的端点/圆心可为内联 `{x,y}`。
 *  - `SketchConstraintDto` 增 `length`/`midpoint`/`tangent`/`offset`/`fixed`；distance 支持
 *    point+point / point+line / line+line（后者按初值侧取有符号垂距）。
 *  - `ExtrudeParams`/`RevolveParams` 增 `operation: "new"|"add"|"remove"` + `mergeScope`
 *    （Onshape ADD/REMOVE 是同一特征的内部操作，不再拆独立 booleanAdd 特征行；
 *    `booleanAdd`/`booleanSubtract` 保留给显式布尔工具）。
 *  - `getMassProperties` 只读 RPC（body 体积/质心/表面积），Tutorial 2 几何金标验收用。
 * v1.25（ADR-0004 第二切片）：`SketchConstraintDto.kind` + `angle`（两线夹角，value 弧度）。
 * v1.24（ADR-0005 Phase 2）：`ExtrudeParams.secondDirection`（blind/throughAll）落地。
 * v1.26（ADR-0006 切片 A）：`HoleParams` 简单平底钻孔（位置=草图 point，轴线=草图法向）。
 * v1.29（ADR-0006 切片 B1）：`cPlane` 基准面特征（参考 Top/Front/Right + 偏移 + 反转法线）
 * + `SketchPlaneDto.sourceFeatureId`（草图平面来源）。cPlane 是引用几何特征：求值直通上游
 * 条目、不产生/修改 body 几何；草图平面三向量仍是派生快照，sourceFeatureId 只作来源展示与
 * 引用守卫（本切片不改参传播）。
 * v1.30（ADR-0005 Phase 3）：`RevolveParams.regions` 多面域旋转——与 `ExtrudeParams.regions`
 * 同锚（SketchDto.regions 面积降序下标数组；Onshape「实体/草图面域」多选语义）。逐域旋转体
 * Unite 为单一工具实体后再参与特征内 new/add/remove。`regionIndex` 降级为单面域简写
 * （deprecated，服务端 zod 与 regions 互斥拒收）。旧单面域载荷逐字兼容（缺省 [0]=最大面域）。
 * v1.31（ADR-0006 切片 B2a）：`CPlaneParams.origin` 平面点——世界参考法线 + 自定义世界原点；
 * 首版不支持任意面/边参考（B2b）；旧世界基准面/偏移载荷逐字兼容。
 * v1.32（ADR-0006 切片 A4）：`HoleParams.holeStyle` 增 `countersink`（倒角孔）——
 * `countersinkDiameterMm`（起始面侧锥口直径）+ `countersinkAngleDeg`（包含角，deg，0<angle<180）；
 * 主孔仍由 `diameterMm`/`endBound` 定义，锥台从起始面切到主孔柱面（深度按几何自动求得）。
 * 旧 simple/counterbore 载荷逐字兼容；counterbore/countersink 参数互斥且只在对应 holeStyle 生效。
 * v1.57（ADR-0004 草图约束补齐）：`SketchConstraintDto.kind + "mirror"`——镜像约束，
 * refs 恰 3 个：两个同型 line（整线镜像）或两个 point（端点点对镜像）+ 1 条 axis line
 * （镜像轴）；无 value。求解层按端点/线对展开为关于轴线的对称方程。
 * v1.58（ADR-0011 切片 4）：`FeatureMirrorParams.sourceFeatureIds` 多源特征镜像
 * （与 sourceFeatureId 恰一；逐源差集反射）。
 * v1.59（ADR-0007 切片 9）：`FeaturePatternParams.sourceFeatureIds` 多源特征阵列
 * （与 sourceFeatureId 恰一；逐源差集按同一实例变换）。
 * v1.62（ADR-0007 切片 13）：`PatternParams.secondDirection`——PART/body 线性阵列
 * 第二方向网格（世界轴枚举；总实例 count×secondDirection.count ≤1000；circular 不支持）。
 * v1.51（ADR-0005 Phase 4）：`ExtrudeParams.draftAngleDeg`/`draftPullDirection`——侧壁拔模
 * （中性面=草图平面；仅 sketchId+blind，与 symmetric/secondDirection/throughAll 互斥）。
 * v1.50（ADR-0006 切片 A5）：`HoleParams.tipAngleDeg` 接受 (0,180]——钻尖锥（Onshape
 * 默认 118°）在盲孔圆柱深度之后追加；缺省或 180=平底（旧库逐字兼容），throughAll 忽略钻尖。
 * v1.45（ADR-0010 切片 3）：`TransformParams.scaleAxes`——非均匀缩放（各轴因子，
 * 与 scale 互斥；先缩放→旋转→平移顺序不变）。
 * v1.44（ADR-0013 切片 3）：`CPlaneParams.threePoints`——THREE_POINT 基准面
 * （三点唯一平面；与其余模式互斥，前端派生平面快照）。
 * v1.43（ADR-0013 切片 2）：`CPlaneParams.point`——LINE_POINT 基准面（线与过线点
 * 定义平面；与 LINE_ANGLE 互斥，前端派生平面快照）。
 * v1.49（ADR-0007 切片 6）：`FeaturePatternParams.centered` 与 `PatternParams.centered`——
 * 居中线性阵列，count 仍为总实例数（含原件，centered 时须奇数），实例按
 * (k-(count-1)/2)·spacing 对称。body pattern 的 UI 输入沿用 Onshape「每侧含 seed」
 * 语义（显示 N，payload count=2N−1）。
 * v1.48（ADR-0011 切片 2c）：`MirrorParams.operation`——镜像体与上游体的布尔组合
 * unite（缺省）/subtract/intersect；「新建」独立体依赖多体输出（ADR-0015）不在此切片。
 * v1.47（ADR-0011 切片 3）：`LubanFeatureType + "featureMirror"` 与
 * `FeatureMirrorParams`——镜像单个上游特征的几何增量（任意世界平面；源 add/remove）。
 * v1.46（ADR-0014 切片 2）：`MoveFaceParams.distancesMm`——逐面不同距离（与
 * distanceMm 恰一；faces 顺序对应）。
 * v1.42（ADR-0014 切片 1）：`LubanFeatureType + "moveFace"` 与 `MoveFaceParams`——
 * 目标体持久面沿外法向偏移（内核 OffsetFaces；首版单一距离广播，UI/converter 未接）。
 * v1.41（ADR-0011 切片 2）：`MirrorParams.faceRef`——按目标体持久面所在平面镜像
 * （plane/planeLine/faceRef 恰一；面必须是上游平面面）。
 * v1.40（ADR-0013 切片 1）：`CPlaneParams.line/angleDeg`——LINE_ANGLE 基准面（线为轴，
 * 参考面法线绕线旋转；前端派生平面快照，同 B1/B2a）。
 * v1.39（ADR-0012 切片 1）：`LubanFeatureType + "splitPart"` 与 `SplitPartParams`——世界平面
 * 单侧切割（XY/YZ/XZ + offsetMm + keepSide；大盒半空间 Intersect）。双侧/面驱动/UI 未做。
 * v1.38（ADR-0010 切片 2）：`TransformParams.scale/scaleOrigin` 均匀缩放（固定点可配；
 * 先缩放→旋转→平移）；非均匀/剪切与 UI/converter 仍待。
 * v1.37（ADR-0011 切片 1）：`MirrorParams.planeLine` 任意世界平面（plane 改为可选；
 * plane/planeLine 恰一）；面/基准面引用与 UI/converter 留切片 2。
 * v1.36（ADR-0010 切片 1）：`LubanFeatureType + "transform"` 与 `TransformParams`——目标 body
 * 刚体变换（translation / 绕任意世界轴 rotation，先旋转后平移；copy=true 原件+副本 Unite）。
 * 首版无缩放/剪切、无 UI/converter 映射（能力 gated）。
 * v1.35（ADR-0009 切片 1a）：草图外部引用——`insertSketch.projections` 请求把同 Part Studio
 * 内另一张草图的实体（line/circle/arc/point）投影到本草图平面；合成实体带 `projected`
 * 标记、不参与求解器 DOF，读取时按源草图当前解实时重投影（源改尺寸→下游特征联动）。
 * 切片 1a 仅草图→草图；实体边/面引用与 PIERCE/INTERSECTED/SILHOUETTED 属后续切片。
 * v1.34（ADR-0007 第一切片）：`LubanFeatureType + "featurePattern"` 与
 * `FeaturePatternParams`——FEATURE pattern：源特征（extrude/revolve/hole add/remove）的
 * 几何增量按 linear/circular 任意轴线段阵列，增量=源前/后缓存差集；PART `pattern` 契约
 * 逐字保留。首版无 UI 入口、无 per-instance skip/第二方向。
 * v1.33（ADR-0006 切片 D）：`LubanFeatureType + "faceExtrude"` 与 `FaceExtrudeParams`——
 * 以既有 body 的持久面引用为轮廓，沿面法向拉伸并参与特征内布尔。首版 add/remove/intersect
 * + blind/throughAll；NEW/secondDirection throughAll/非平面面诚实拒收。UI 暂无入口（backend/
 * contract 先行，UI 需 live 面拉伸对话框证据）。
 * 消费方：modeling-server FeatureRpcImpl（服务端）、web part-studio（树/对话框）。
 */
import {
  type ElementGeometryDataEntry, type Placement3dProps, RpcInterface, RpcManager,
} from "@itwin/core-common";

/** 特征类型（M1：拉伸 + 布尔；M3-a 增 fillet；RW2-T6 增 chamfer；RW2-T7 增 shell；M6-b T2 增 revolve；
 * B2 v1.11 增 loft；B3 v1.12 增 sweep；B4 v1.13 增 mirror；B5 v1.14 增 pattern；
 * B6 M-A4.1 v1.16 增 booleanBodies（body boolean）） */
export type LubanFeatureType = "extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep" | "mirror" | "pattern" | "featurePattern" | "featureMirror" | "booleanBodies" | "hole" | "cPlane" | "faceExtrude" | "transform" | "splitPart" | "moveFace";

/** 拉伸/布尔共用参数：XY 平面闭合多边形轮廓 + Z 向距离。
 * `sketchId`（M2 T4.5）：轮廓改由草图元素几何流供给（已解算轮廓）；存在时 `profile` 须为空数组
 * （互斥语义，Registry 层 zod 校验锁死）。本接口的 sketchId 仅 extrude 语义；布尔草图驱动在
 * M7 v1.10 起走独立的 BooleanParams（不共用本接口——见其注），服务端按类型字段集校验。
 */
/** v1.19：特征内布尔操作（Onshape 同一拉伸/旋转特征的「新建/加入/去除/相交」页签）。
 * v1.22：remove/intersect 后端落地（remove=Subtract，intersect=内核 Intersect）。 */
export type FeatureBooleanOperation = "new" | "add" | "remove" | "intersect";

/** v1.22（ADR-0005）：拉伸终止条件。upTo* 在 schema 层暂未实现，服务端诚实拒收；
 * blind/throughAll 已实现。 */
export type ExtrudeEndBound = "blind" | "throughAll" | "upToNext" | "upToSurface" | "upToVertex";

/** v1.22（ADR-0005）：拉伸方向；backward 等价于沿草图法向反向扫掠。 */
export type ExtrudeDirection = "forward" | "backward";

/** v1.24（ADR-0005 Phase 2）：第二方向拉伸。缺省方向=主方向的相反侧；
 * 与 `symmetric` 互斥；throughAll 需要上游实体。首版不支持第二方向 draft/偏移。 */
export interface ExtrudeSecondDirection {
  endBound: "blind" | "throughAll";
  /** blind 必填且 >0；throughAll 忽略。 */
  distanceMm?: number;
  direction?: ExtrudeDirection;
}

/**
 * v1.26（ADR-0006 切片 A）：简单钻孔。位置取草图内的 point 实体（每点一孔），
 * 轴线=草图平面法向；无螺纹孔；v1.50 起 tipAngleDeg 支持 (0,180]（缺省/180=平底）。
 * 沉头/埋头/螺纹/按面引用等 Onshape 高级形态明确拒收，不做静默降级。
 */
/** v1.27（ADR-0006 切片 A2）：孔位也可引用草图曲线顶点（Onshape 常见形态）。 */
export interface HoleVertexRef {
  /** 草图实体 id（line/arc/circle/point）。 */
  entityId: number;
  /** line/arc：start/end；circle/arc/封闭样条：center；point：center。 */
  part: "start" | "end" | "center";
}
export interface HoleParams {
  sketchId: string;
  /** 选中的草图 point 实体 id；缺省=草图内全部 point。
   *  v1.27：与 vertexRefs 同给时只取显式 pointIds（不再默认全选）。 */
  pointIds?: number[];
  /** v1.27：草图曲线顶点孔位。至少 pointIds 或 vertexRefs 之一非空。 */
  vertexRefs?: HoleVertexRef[];
  /** v1.28（ADR-0006 切片 A3）：simple（缺省）| counterbore（沉头孔）。
   *  v1.32（切片 A4）：countersink（倒角孔/锥口）。 */
  holeStyle?: "simple" | "counterbore" | "countersink";
  /** counterbore 必填：沉头孔直径/深度（孔轴线从草图平面起算）。 */
  counterboreDiameterMm?: number;
  counterboreDepthMm?: number;
  /** countersink 必填：起始面侧锥口直径（> diameterMm）。 */
  countersinkDiameterMm?: number;
  /** countersink 必填：包含角（deg，0<angle<180；90=标准沉头）。锥口深度由
   *  (countersinkDiameterMm−diameterMm)/2 / tan(angle/2) 自动求得。 */
  countersinkAngleDeg?: number;
  diameterMm: number;
  /** v1.56（ADR-0006 终止条件增补）：upToNext=沿孔轴到最近的平行面（目标面动态解析）。 */
  endBound: "blind" | "throughAll" | "upToNext";
  /** blind 必填且 >0；throughAll/upToNext 忽略。 */
  depthMm?: number;
  direction?: ExtrudeDirection;
  /** 钻尖角（deg，(0,180]）：118=标准钻尖锥（锥高=r/tan(angle/2)，在 depthMm 圆柱之后追加）；
   *  180 或缺省=平底（旧库语义逐字兼容），throughAll/upToNext 忽略钻尖。 */
  tipAngleDeg?: number;
}

/** v1.60（ADR-0005 Phase 7）：extrude upToVertex 的草图顶点引用。 */
export interface ExtrudeVertexRef {
  /** 顶点所属草图特征 id。 */
  sketchId: string;
  /** 草图实体 id（line/arc/circle/point；spline 端点/点实体的 start/end/center 语义同孔位）。 */
  entityId: number;
  part: "start" | "end" | "center";
}

export interface ExtrudeParams {
  profile: Array<{ x: number; y: number }>;
  distance: number;
  sketchId?: string;
  /** v1.19：特征内布尔操作（缺省按 legacy：newBody=true→"new"，否则 "add"）。
   * `mergeScope` 为显式合并目标（Tutorial 2 E2/E3 = 单 Part 1）；空/缺省=自动（全部上游体）。
   * v1.22：remove/intersect 已落地；new 仍走独立 body 规划。 */
  operation?: FeatureBooleanOperation;
  /** v1.22（ADR-0005）：终止条件。缺省 blind（既有行为）；throughAll 由服务端按上游
   * 实体范围计算扫掠距离。v1.52（ADR-0005 Phase 5）：upToSurface 首切片——与
   * `endFaceRef` 成对，目标面须为上游 body 的平面面且与草图平面平行；扫掠终点按
   * 目标面平面动态解析，`distance` 仅形态占位。v1.56/v1.60：upToNext（自动选最近
   * 平行面）与 upToVertex（`endVertexRef` 草图顶点投影）已支持，`distance` 同样仅占位。 */
  endBound?: ExtrudeEndBound;
  /** v1.52（ADR-0005 Phase 5）：upToSurface 的目标面持久引用（resolveFaceRef 产物）。
   * 仅 `endBound="upToSurface"` 合法；每次求值周期由后端重新解析为世界平面（不落库），
   * 面移动/上游重建后重建即重算。非平面/非平行/多面片/失效引用诚实 status=1。 */
  endFaceRef?: LubanTopologyId;
  /** v1.60（ADR-0005 Phase 7）：upToVertex 的目标顶点（草图实体顶点/点实体）。
   * 仅 `endBound="upToVertex"` 合法；后端按该顶点世界坐标在拉伸方向上的投影
   * 动态求深度（草图改参后重建即重算）。目标顶点可在另一张草图；不支持
   * symmetric/draft/THIN/secondDirection 组合，失效引用/深度非正诚实 status=1。 */
  endVertexRef?: ExtrudeVertexRef;
  /** v1.54（ADR-0005 Phase 5 增补）：upToSurface 偏移距离（mm，>0）——终点平面沿
   * 拉伸方向再偏移该距离（Onshape「偏移距离」+「反向」）。仅 upToSurface 合法；
   * 与 `endOffsetOppositeDirection` 成对（缺省 false=沿拉伸方向继续，true=朝起始端回退）。
   * 目标面仍须为平行平面；偏移后距离非正 → status=1。 */
  endOffsetMm?: number;
  /** v1.54：upToSurface 偏移反向；仅在 `endOffsetMm` 在场时合法。 */
  endOffsetOppositeDirection?: boolean;
  /** v1.22（ADR-0005）：方向。缺省 forward；backward 沿草图法向反向扫掠。 */
  direction?: ExtrudeDirection;
  /** v1.22（ADR-0005）：起始偏移（mm，沿草图法向；可为负）。缺省 0。 */
  startOffsetMm?: number;
  /** v1.24（ADR-0005 Phase 2）：第二方向拉伸；与 symmetric 互斥。 */
  secondDirection?: ExtrudeSecondDirection;
  /** v1.19：合并范围（body 引用）。v1 只支持 0 或 1 个（单 active body）；多目标延后。 */
  mergeScope?: BodyRef[];
  /** @deprecated M6-c v1.8 起被 `regions` 取代（单面域简写）；兼容保留一版——服务端 zod
   * superRefine 与 `regions` 互斥拒收（同给两键即拒，不做静默优先级）。
   * 原 v1.6 语义：sketchId 模式下选面域（SketchDto.regions 下标，面积降序）；缺省 0=最大面域。 */
  regionIndex?: number;
  /** M6-c v1.8：多面域选择——SketchDto.regions 下标数组（sketchRegionsFrom 面积降序，下标
   * 语义与 regionIndex 同锚），Onshape「要拉伸的面和草图面域」多选语义（Tutorial 2 E3 双面域
   * 组合拉伸）。仅 extrude + sketchId 模式语义（内联 profile 模式无面域可指）；数组元素同为
   * 非负整数（形态校验），越界裁决在服务端 op 边界/求值层（面域数是库态语义，与 regionIndex
   * 同口径）；重复下标按集语义去重（并集幂等）。缺省（与 regionIndex 皆不在场）=[0]=最大面域。 */
  regions?: number[];
  /** M6-b v1.7（T3）：对称拉伸——`distance` 为总深，实体沿拉伸方向两侧各半（跨 [−d/2, +d/2]，
   * 中面=草图平面）；sketchId 模式语义与内联 profile 模式同效。缺省 false=单向拉伸（既有行为）。 */
  symmetric?: boolean;
  /** B6 M-A3.1 v1.15：NEW-body——true 时拉伸结果写入**新建的独立 body**（求值器返回工具几何本身，
   * 不与上游 Unite；旧 body 的原边/几何保持不变，新特征仍以既有链尾为依赖/排序锚点）。
   * 缺省 false=既有 ADD 语义（有上游=Unite，逐字不变）。仅 extrude 消费；`updateParams` 不得
   * 翻转本键（服务端诚实拒收——请删除特征后重建）。 */
  newBody?: boolean;
  /** v1.51（ADR-0005 Phase 4）：侧壁拔模角（度制，有限数，0<|angle|<89）。中性面=草图平面：
   * 有效角为正时远端截面沿材料外侧扩大（带锥度），为负时缩小。与 `draftPullDirection` 成对
   * 语义：`draftPullDirection=true` 翻转有效角符号（Onshape「反向」）。本切片仅支持
   * sketchId 模式 + endBound=blind，且与 symmetric/secondDirection 互斥（诚实拒收）。 */
  draftAngleDeg?: number;
  /** v1.51：拔模反向（Onshape「反向」复选）；仅在 `draftAngleDeg` 在场时合法。 */
  draftPullDirection?: boolean;
  /** v1.53（ADR-0005 Phase 6）：结果体类型。缺省 SOLID（旧载荷逐字兼容）；
   * THIN=薄壁拉伸——沿闭合轮廓边界建等壁厚带（含孔面域=外环带+孔壁带）；
   * 单侧向内壁厚（v1.54 增 `thinMidPlane` 双侧居中）。SURFACE 未实现。 */
  bodyType?: "SOLID" | "THIN";
  /** v1.53：薄壁厚度（mm，>0，须小于轮廓可偏置范围）；仅 bodyType=THIN 合法。
   * 第二厚度/非对称双侧仍未实现。 */
  thinThicknessMm?: number;
  /** v1.55（ADR-0005 Phase 6 增补）：薄壁中间平面——厚度以草图边界为中心向两侧各
   * `thinThicknessMm/2`；缺省 false=单侧向内。仅 bodyType=THIN 合法；与 symmetric
   * （深度对称）无关且可共存，但本切片仍禁止 THIN+symmetric 的其他语义组合。
   * 孔壁带同构（孔边界向孔内/材料各半），偏置退化诚实 status=1。 */
  thinMidPlane?: boolean;
}

/**
 * body 引用（B6 M-A3.1 v1.15）：bodyKey = body 元素（LubanCAD.BodySolid）的 ECInstanceId。
 * 元素 id 在冷重开/原生 undo/redo 下稳定；硬删除后不复用（生命周期走软删除保 id）。
 * 本版只作为契约形状（body boolean/显式 bodyRef 输入在后续里程碑接线）。
 */
export interface BodyRef { bodyKey: string }

/**
 * body 读面（B6 M-A3.1 v1.15，`getBodies` 条目）：
 * - `bodyKey`：body 元素 id（同 BodyRef）；
 * - `name`：生命周期名称（服务端 marker；旧库缺省=元素 userLabel）；
 * - `active`：false = 已被消费/软删除（元素与 id 保留，几何保留；不可作写目标）；
 * - `sourceFeatureId`：驱动该 body 的唯一特征（无源/消费态省略）；
 * - `authored`：生命周期托管 body（直改副本/orphan 不在读面）。
 */
/** v1.19：body 质量属性（只读；Tutorial 2 几何金标验收）。
 * 单位随 iModel 世界系（当前栈内部=mm 口径由调用方/显示层换算）；volume=体积，
 * centroid=体积质心，surfaceArea 可选（内核面面积和）。 */
export interface MassPropertiesDto {
  bodyKey: string;
  volume: number;
  centroid: { x: number; y: number; z: number };
  surfaceArea?: number;
}
export interface BodyInfo {
  bodyKey: string;
  name?: string;
  active: boolean;
  sourceFeatureId?: string;
  authored?: boolean;
}

/**
 * Part Studio 注册表条目（B-model P2.2 v1.18；P2.3/P2.4 页签消费）。
 * - `id`：注册表创建的 scope id 是 UUID；P1 spike 遗留的 metadata-less 分区沿用其标签后缀
 *   （如 `ps-1`），列表以 `name=id` 呈现，保证旧 e2e/直连 RPC 可继续寻址。
 * - `name`：用户可见名称（创建/重命名时 trim，非空且 ≤120 字符）。
 * - `order`：创建序（注册表创建从 1 递增；无元数据的 P1 标签按 0 呈现）。
 * - `defModelId`/`physModelId`：该 scope 的 def/phys model 的 ECInstanceId（字符串）。
 *   **B-model P2.4 半图扩展**：`listPartStudios` 对「只有 def 分区、缺 phys model」的
 *   degraded scope 返回 `physModelId === ''`（name=id、order 0；其余字段照常）——UI 以空
 *   phys 为唯一判据显示「损坏的 Part Studio」恢复/删除入口，**绝不可当作可打开 scope**
 *   （open 需完整 scope；rename 对该 scope 服务端拒收；删除不受最后一个完整 scope 守卫阻断）。
 */
export interface PartStudioInfo {
  id: string;
  name: string;
  order: number;
  defModelId: string;
  physModelId: string;
}

/**
 * body boolean 参数（B6 M-A4.1 v1.16）：以 body（而非上游链）为操作对象——target 体与 tool 体
 * 经 `BodyRef`（bodyKey=`getBodies[].bodyKey`）寻址，运算结果写回 target（目标链尾）。
 * - `targets`：v1 **恰 1 个**（语料也只有 0/1 target；多 target 服务端诚实拒收）。
 * - `tools`：≥1；v1 全部按 bodyKey 升序作为 kernel tools（target 恒在前）。
 * - `operation`：`unite | subtract | intersect`；三操作均由内核执行
 *   （`intersect` = 内核 Intersect；2026-11-07 起不再拒收）
 *   （与 B1「相交页签禁用」同口径，不做静默降级）。
 * - `keepTools`：false=成功后 tools 软删除（`active=false`，元素/几何/id 保留，可撤销）；
 *   true=tools 保留为独立 body。**失败（内核/空结果/缓存缺失）一律不消费**，target 保留最后几何。
 * - 结构语义键：`updateParams` 不得改本 params（targets/tools/operation 变更需删除特征后重建）；
 *   服务端 apply+preview 同文案拒收。
 * - v1 约束：targets∩tools=∅、无重复 bodyKey、全部 body 必须 authored/active/有唯一源特征。
 */
export interface BooleanBodiesParams {
  targets: BodyRef[];
  tools: BodyRef[];
  operation: "unite" | "subtract" | "intersect";
  keepTools: boolean;
}

/**
 * 布尔草图驱动参数（M7 v1.10）：草图面域作工具体，与上游特征输出布尔。
 * - `sketchId`：草图元素 id；`profile` 键**不得同时出现**（内联 profile 旧路径与草图驱动
 *   两形态互斥——Registry zod superRefine 拒收，无静默优先级）。
 * - `regions`/`regionIndex`：面域选择（SketchDto.regions 下标，面积降序；语义与
 *   ExtrudeParams 同锚：regions 多选优先、regionIndex 为单面域简写，两键同给拒收；
 *   两键皆缺省=[0]=最大面域）。
 * - `distance`：工具体拉伸距离（正值）；工具体=草画面域沿草图法向扫掠 distance。
 * - `operation`：布尔运算——必须与特征类型名一致（booleanAdd⇔`unite`、
 *   booleanSubtract⇔`subtract`；服务端 zod 一致性拒收，类型名即真源）。
 * 求值通道与 extrude 草图驱动同源（FeatureEngine sketchId 消费口），差异只在末步
 * operation=Unite/Subtract（注册表 booleanOp）。UI 的布尔作用域页签映射：加入→booleanAdd、
 * 移除→booleanSubtract（相交无后端类型，M7 首版不支持）。
 */
export interface BooleanParams {
  sketchId: string;
  /** @deprecated M7 v1.10 起降级为单面域简写（与 ExtrudeParams.regionIndex 同口径）：多面域用
   * `regions`，两键同给由 zod 拒收（无静默优先级）。 */
  regionIndex?: number;
  regions?: number[];
  distance: number;
  operation: "unite" | "subtract";
}

/**
 * loft 放样参数（B2 v1.11）：两个草图截面沿世界系放样成单一实体。
 * - `sketchIds`：**恰好两张**草图元素 id 的二元组（单草图/同草图重复由服务端 zod 拒收——
 *   放样至少需要两个截面；同一草图两次是退化放样，无正解）。
 * - `sections`：保留键（分段数）——首版求值不消费（无 guides/端条件，见下）；形态校验
 *   只做正整数，未来扩「多段插值」时启用。
 * - `bodyType`：首版只产实体（`'SOLID'`；曲面/薄壁放样不在此契约内）。
 * 求值语义（服务端）：每张草图取最大面域（regions[0]）外环，经草图 plane 变换到世界系，
 * 两 Loop 作 entryArray 送 BRepGeometryOperation.Loft=9；有上游时与上游 Unite（ADD 语义，
 * 同 revolve），单 body 写回。截面须平行（首版守卫，内核裁决兜底）。
 */
export interface LoftParams {
  sketchIds: [string, string];
  sections?: number;
  bodyType: "SOLID";
}

/**
 * sweep 扫掠参数（B3 v1.12）：单闭合轮廓沿单条直线路径扫掠成单一实体。
 * - `profileSketchId`：轮廓草图——首版取该草图最大面域（regions[0]）外环；含孔截面
 *   诚实拒收（同 loft 首版口径，不做静默丢孔降级）。
 * - `pathSketchId`：路径草图——首版**曲线实体恰为一条直线**（含圆/弧/多段/闭合均拒收）
 *   且长度非零、**方向须沿轮廓平面法向有非零投影**（路径落于轮廓平面内=退化扫掠，内核
 *   会退化出零体积 sheet）——服务端 op 边界 txn 之前拒收，文案见
 *   SketchRegions.resolveSweepPathForProfile；一般倾斜/斜交直线路径合法。
 * - `bodyType`：首版只产实体（`'SOLID'`；曲面/薄壁扫掠不在此契约内）。
 * 求值语义（服务端）：轮廓外环经草图 plane 变换到世界系、路径直线经其草图 plane
 * 变换到世界系，两条目作 entryArray 送 BRepGeometryOperation.Sweep=8；有上游时与
 * 上游 Unite（ADD 语义，同 revolve/loft），单 body 写回。
 * 首版范围裁决（B3 控制器）：无 twist/scale/lock/guides；profile 与 path 不得是同一
 * 草图（同 id 由 zod 拒收——同一草图不能同时充当轮廓与路径；不同草图但同/平行平面的
 * 面内路径另由方向守卫拒收，两处文案不混用）。
 */
export interface SweepParams {
  profileSketchId: string;
  pathSketchId: string;
  bodyType: "SOLID";
}

/**
 * mirror 平面镜像参数（B4 v1.13）：整条上游体按**世界平面**反射后与上游 Unite（保留原体）。
 * - `plane`：`'XY' | 'YZ' | 'XZ'`——过世界原点的三个主平面（XY: z=0、YZ: x=0、XZ: y=0）。
 *   首版**不支持任意面/基准面引用**（不做草图面/面拾取寻址）。
 * - `keepOriginal`：字面量 `true`——镜像体与上游原体 Unite（保留原体）。首版不提供
 *   「仅镜像体」形态（镜像体自身带负体积/内翻法向，必须与正向前体并集由内核归正——
 *   求值层次序钉死「原体在前、镜像体在后」，反序会使并集体整体内翻）。
 * 求值语义（服务端）：上游 entryArray 的每个 BRep 条目以反射变换（负行列式）重写
 * entityTransform（ElementGeometry.toBRep → 组合反射 → fromBRep），再
 * `BRepGeometryOperation.Unite=0` 与上游并集；无上游/含非 BRep displayable 几何由
 * 服务端诚实拒收（不做静默降级）。特征名 `mirror`。
 */
/** v1.37（ADR-0011 切片 1）：任意世界平面（origin 在平面上；normal 非零，服务端归一化）。 */
export interface MirrorPlaneLine {
  origin: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

/**
 * 镜像参数。`plane`（世界基准面）、`planeLine`（任意世界平面）与
 * `faceRef`（v1.41 持久面引用，按该面所在平面反射）**恰一**：
 * v1.37 起 plane 可缺省；三者同给/都不给由服务端 zod 拒收（无静默优先级）。
 * `faceRef` 的面必须是上游目标体上的平面面；非平面/多面片/解析失败诚实拒收。
 * `keepOriginal` 首版恒 true（保留原体并与镜像体 Unite）。
 */
export interface MirrorParams {
  plane?: "XY" | "YZ" | "XZ";
  planeLine?: MirrorPlaneLine;
  faceRef?: LubanTopologyId;
  keepOriginal: true;
  /** v1.48（ADR-0011 切片 2c）：镜像体与上游体的布尔组合——unite（缺省，加入）/
   * subtract（移除）/ intersect（相交）。「新建」（独立体）需多体输出（ADR-0015），
   * 不在本切片；operation 缺省=unite 旧载荷逐字兼容。 */
  operation?: "unite" | "subtract" | "intersect";
}

/**
 * pattern PART/body 级阵列参数（B5 v1.14）：**整个上游体**复制 count 份（含原件）并
 * Union 成单一 body。
 * - `kind`：`'linear' | 'circular'`。
 * - `count`：实例总数（**含原件**），整数 2..1000（上限防误输入/裸 RPC 构造海量实例）。
 * - `spacing`：仅 linear（必填）——沿 `axis` 的实例间距（>0）；实例 k 位移 k*spacing。
 * - `angle`：仅 circular（必填）——度制总角 (0,360]；绕**世界 Z 过原点**，实例 k 角度
 *   k*step：**整周 360 → step=angle/count**（无重叠闭合）；**部分角 < 360 →
 *   step=angle/(count-1)**（首末实例夹住「总角度」；count=2 即 0 与 angle——与 Onshape
 *   PART circular pattern 的 count-includes-seed 语义对齐）。
 * - `axis`：世界轴 `'X'|'Y'|'Z'`；linear 三轴可选，circular 首版只 `'Z'`（**须显式
 *   'Z'**，其它值服务端 zod 拒收——不静默忽略）。
 * 两形态键集互斥：linear 不得携带 angle、circular 不得携带 spacing（同给即拒，无静默
 * 优先级）。首版**不支持 FEATURE pattern / 任意轴引用 / 曲线阵列 / per-instance 变换**；
 * 非 BRep/非实体上游由服务端诚实拒收。互不接触的实例并集为多 lump 单 body（合法产物）。
 */
export interface PatternParams {
  kind: "linear" | "circular";
  count: number;
  spacing?: number;
  angle?: number;
  axis: "X" | "Y" | "Z";
  /** v1.49（ADR-0007 切片 6）：居中线性阵列——count 为总实例数（含原件，须奇数），
   * 实例以 (k−(count−1)/2)·spacing 对称分布；circular 不支持 centered。 */
  centered?: boolean;
  /** v1.62（ADR-0007 切片 13）：线性阵列第二方向网格。count 含原件；
   *  仅 kind=linear 合法；两方向总实例 count×secondDirection.count ≤1000；
   *  centered 时第二方向 count 须奇数（与第一方向同语义）。 */
  secondDirection?: PatternSecondDirection;
  /** v1.63（ADR-0007 切片 14）：第一方向反向（仅 linear；沿 axis 负向平移）。 */
  oppositeDirection?: boolean;
}

/** v1.62：PART/body 线性阵列的第二方向（世界轴枚举，与第一方向同轴口径）。 */
export interface PatternSecondDirection {
  count: number;
  spacing?: number;
  centered?: boolean;
  axis: "X" | "Y" | "Z";
}

/** v1.34：featurePattern 的轴线段（世界坐标；方向须非零，服务端归一化）。 */
export interface PatternAxisLine {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

/**
 * v1.34（ADR-0007 第一切片）：**FEATURE pattern**——阵列某个上游特征产生的几何增量，
 * 而不是整个 body（区别于 `PatternParams` 的 PART/body 阵列）。
 *
 * - `sourceFeatureId`：同链上游特征（本地 featureId）。首版仅支持
 *   `extrude`/`revolve`/`hole` 且 operation 为 add/remove；NEW 源、fillet/chamfer 源、
 *   shell/mirror 源诚实拒收（增量语义不成立）。
 * - 增量 = 源特征求值前后缓存差集（add：after−before；remove：before−after），
 *   逐实例变换后按源操作 Unite/Subtract 回当前体——不重新求值源特征参数。
 * - `count`：实例总数（含原件），2..1000；`spacing` 仅 linear、`angle` 仅 circular
 *   （度制 (0,360]；整周 angle/count，部分角 angle/(count-1)，与 PatternParams 同口径）。
 * - `axis`：任意世界轴线段；linear 沿 direction 平移，circular 绕该轴旋转（右手定则）。
 * - v1.61（ADR-0007 切片 10）：`secondDirection`——linear 阵列第二方向网格；
 *   与第一方向同口径（count/spacing/axis/centered），两方向平移叠加；总实例数
 *   count×secondDirection.count ≤ 1000；circular 不支持第二方向。
 * - UI 无第二方向入口、无 per-instance skip；发布需 shared/后端双端同批。
 */
export interface FeaturePatternSecondDirection {
  /** 第二方向实例总数（含原件），2..1000；centered 时须为奇数。 */
  count: number;
  /** 第二方向间距（mm，>0）；linear 第二方向必填。 */
  spacing?: number;
  /** 第二方向世界轴线段；沿其 direction 平移（方向翻转由调用方取反 direction 表达）。 */
  axis: PatternAxisLine;
  /** 第二方向居中（偏移 (k-(count-1)/2)·spacing；count 须奇数）。 */
  centered?: boolean;
}

export interface FeaturePatternParams {
  /** 单源（与 sourceFeatureIds 恰一；旧载荷兼容）。v1.59 起改可选。 */
  sourceFeatureId?: string;
  /** v1.59（ADR-0007 切片 9）：多源特征阵列——与 sourceFeatureId 恰一；
   * 逐源取几何增量、按同一实例变换阵列并按源操作应用（源限
   * extrude/revolve/hole 的 add/remove；NEW/intersect 诚实拒收）。 */
  sourceFeatureIds?: string[];
  kind: "linear" | "circular";
  count: number;
  spacing?: number;
  angle?: number;
  axis: PatternAxisLine;
  /** v1.49（ADR-0007 切片 6）：居中阵列。`count` 仍是**总实例数（含原件）**，
   * 实例沿轴以 `(k - (count-1)/2) · spacing` 对称分布；centered 时 count 必须为奇数。
   * Onshape 的「居中」实例数 N 为每侧含 seed，转换器按 `count = 2N-1` 映射。 */
  centered?: boolean;
  /** v1.61（ADR-0007 切片 10）：linear 第二方向；仅 kind=linear 合法。 */
  secondDirection?: FeaturePatternSecondDirection;
}

/**
 * v1.47（ADR-0011 切片 3）：FEATURE mirror——镜像一个上游特征产生的几何增量，
 * 而不是整 body。语义与 featurePattern 的源增量一致（源须 extrude/revolve/hole 的
 * add/remove），镜像变换为任意世界平面反射（I − 2n̂n̂ᵀ + 2(o·n̂)n̂）。
 * `planeLine` 的 normal 须非零；面/基准面引用留后续切片。
 * v1.58（ADR-0011 切片 4）：`sourceFeatureIds` 多源——与 `sourceFeatureId` 恰一；
 * 逐源按顺序取几何增量、反射并应用源操作（add=Unite / remove=Subtract），
 * 等价于 Onshape 一个 FEATURE mirror 选中多个源特征（源集合仍限
 * extrude/revolve/hole 的 add/remove；NEW/intersect 诚实拒收）。
 */
export interface FeatureMirrorParams {
  /** 单源（与 sourceFeatureIds 恰一；旧载荷兼容）。 */
  sourceFeatureId?: string;
  /** v1.58：多源（非空、去重；与 sourceFeatureId 恰一）。 */
  sourceFeatureIds?: string[];
  planeLine: MirrorPlaneLine;
}

/**
 * v1.36（ADR-0010 切片 1）：**Transform**——目标 body 的刚体变换（平移/绕任意世界轴旋转）。
 * - `translation`/`rotation`/`scale` 至少提供一项；`rotation.angleDeg` 度制、右手定则，
 *   轴过 `axisOrigin`（缺省世界原点）；`scale` 均匀缩放（>0），以 `scaleOrigin`
 *   （缺省世界原点）为不动点；固定顺序：先缩放、再旋转、最后平移。
 * - `scaleOrigin` 仅在 `scale` 存在时合法；`scale=1` 单独出现=无操作拒收。
 * - `copy=true`：原件 + 变换副本 Unite（重叠合并；不接触=多 lump 单体）。
 * - v1.36 不做非均匀缩放/剪切、草图/面级变换；converter 映射/UI 未接（能力保持 gated）。
 */
export interface TransformParams {
  translation?: { x: number; y: number; z: number };
  rotation?: {
    axisOrigin?: { x: number; y: number; z: number };
    axisDirection: { x: number; y: number; z: number };
    angleDeg: number;
  };
  /** v1.38（ADR-0010 切片 2）：均匀缩放因子（>0；1=无缩放）。 */
  scale?: number;
  /** v1.45（ADR-0010 切片 3）：非均匀缩放各轴因子（均 >0；全域 1=无缩放）。
   * 与 `scale` 互斥；固定点仍用 `scaleOrigin`（缺省原点）。 */
  scaleAxes?: { x: number; y: number; z: number };
  /** v1.38：缩放的固定点（世界坐标；缺省原点）。scale/scaleAxes 存在时合法。 */
  scaleOrigin?: { x: number; y: number; z: number };
  copy?: boolean;
}

/**
 * v1.39（ADR-0012 切片 1）：**SplitPart 单侧世界平面切割**。
 * - `plane: "XY"|"YZ"|"XZ"`（法向 Z/Y/X）；`offsetMm` 沿法向偏移（缺省 0）；
 * - `keepSide: "positive"|"negative"` 保留平面正/负侧（Onshape keepBothSides=false 的
 *   单侧形态）；双侧（双 body 输出）不在本切片，服务端诚实拒收。
 * - 首版无 UI/converter 映射；能力 gated。
 */
export interface SplitPartParams {
  plane: "XY" | "YZ" | "XZ";
  offsetMm?: number;
  keepSide: "positive" | "negative";
}

/**
 * v1.42（ADR-0014 切片 1）：moveFace 面偏移参数。
 * - `faces`：目标体持久面引用（`resolveFaceRef` 产物；≥1，服务端逐引用解析，
 *   面分裂碎片全部入集）；
 * - `distanceMm`：沿各面外法向的偏移距离（正=外扩、负=内缩，0 拒收）；
 *   首版单一距离广播到全部选中面，逐面不同距离留切片 2。
 * 非平面面/封闭实体/内核拒绝等由内核裁决，失败诚实转 status=1（不假成功）。
 */
export interface MoveFaceParams {
  faces: LubanTopologyId[];
  /** 单一距离广播到全部选中面（与 distancesMm 互斥）。 */
  distanceMm?: number;
  /** v1.46：逐面距离（长度必须等于 faces；与 distanceMm 互斥；各值非零有限）。 */
  distancesMm?: number[];
}

/** 内核持久拓扑 id（面语义；op31-34 的 TS 形状，EditBuiltInCommand.ts:418-424） */
export interface LubanTopologyId { nodeId: number; entityId: number }

/**
 * v1.33（ADR-0006 切片 D）：face-extrude/imprint-face 参数。
 *
 * 与 `ExtrudeParams` 的差异仅在轮廓来源：本类型取既有 body 的**持久面引用**
 * （`resolveFaceRef` 产物）作为轮廓环，沿该面法向拉伸；面边界环由后端
 * SolidModeling 命令 `getSubEntityGeometry` 读取（spike 2026-11-06：返回
 * Loop/ParityRegion 世界坐标曲线）。不回写 native geometry stream。
 *
 * - `bodyId`：面所属 body 的 BIS 元素 id（`getBodies.bodyKey`）；
 * - `faceRef`：跨重建稳定的面拓扑 id；
 * - `operation`：首版 add/remove/intersect（NEW 面源自既有体，诚实拒收）；
 * - `endBound`：blind（须 `depthMm>0`）/ throughAll（按上游体范围）；
 * - `direction`：相对面法向；缺省 forward；
 * - `secondDirection`：复用 extrude 同形，首版仅 blind；
 * - `mergeScope`：多体目标（与 ExtrudeParams.mergeScope 同语义）。
 *
 * 非平面面、零/多环歧义、面引用失效由服务端在 txn 前诚实拒收，不静默降级。
 */
export interface FaceExtrudeParams {
  bodyId: string;
  faceRef: LubanTopologyId;
  operation: "add" | "remove" | "intersect";
  endBound: Extract<ExtrudeEndBound, "blind" | "throughAll">;
  depthMm?: number;
  direction?: ExtrudeDirection;
  secondDirection?: ExtrudeSecondDirection;
  mergeScope?: BodyRef[];
}

/**
 * 边引用 = 边自身持久拓扑 id 单引用（M6-d v1.9 纯换，面对对退役）。
 * `edge` = op31 topologyIdFromSubEntity 对**边子实体**回的边自身 id（创建即赋号，布尔分裂
 * 子边继承同 id）；求值端 op36 edgesFromOwnId 按 id 直寻缓存边子实体——分裂片同 id 集合
 * 多持，全部入 blend 集（裂片随形全倒角语义，M6-d T1 裁决）。旧面对形态 `{faceA,faceB}`
 * 自 v1.9 起不兼容（服务端 zod 诚实拒收，不做静默转换）。
 */
export interface FilletEdgeRef { edge: LubanTopologyId }

export interface FilletParams { radius: number; propagateSmooth: boolean; edges: FilletEdgeRef[] }

/**
 * chamfer 参数（RW2-T6）：倒角模式 + 一/双倒角值 + 邻面对边引用集。
 * mode = 内核 ChamferMode 枚举（editor/common EditorBuiltInIpc.ts）：0=Ranges / 1=Length /
 * 2=Distances / 3=DistanceAngle / 4=AngleDistance；值语义随 mode（Length 只用 values1；
 * Distances=values1/values2 双距离；DistanceAngle=values1 距离+values2 弧度角；
 * AngleDistance 反之）。values 允许标量（全部边同值）或等长于边集的数组（逐边值）——
 * 服务端求值器一律展开为等长数组喂内核（native 标量广播契约经 blendEdges 探针证伪不可信）。
 * edges 寻址与 fillet 完全同构（M6-d v1.9 起 FilletEdgeRef=边自身持久 id 单引用，同批纯换）。
 */
export interface ChamferParams {
  mode: number;
  propagateSmooth: boolean;
  edges: FilletEdgeRef[];
  values1: number | number[];
  values2?: number | number[];
}

/**
 * shell 参数（RW2-T7）：内核 HollowFaces=19 的消费形态（editor/common EditorBuiltInIpc.ts）。
 * defaultDistance = 未列入 faces 的其余面的统一偏置距离；faces = 需单独定距的面持久拓扑 id 集
 * （min 1；op32 facesFromId 求值期解析，面分裂时多片全入）；distances 标量（全部指定面同距）
 * 或等长于 faces 的数组（逐面定距）——服务端求值器一律展开等长数组喂内核（blendEdges 探针
 * 证伪的标量广播纪律，RW2-T6 起全异步类型遵守）。
 * 【距离符号语义（内核注记）】正 = 沿面法向外扩、负 = 内缩、0 = 穿孔移除该面——故 defaultDistance
 * 与 distances 值域为全体实数（含 0），形态校验不做正数约束（与 chamfer 正值域刻意不同）；
 * 组合最终合法性由内核裁决（同 fillet/chamfer 引用失效的求值层裁决口径）。
 */
export interface ShellParams {
  defaultDistance: number;
  faces: LubanTopologyId[];
  distances: number | number[];
}

/** M6-b v1.7（T2）：旋转参数——草图面域绕草图内轴线旋转成体。
 * `axis` = 草图内 line 实体 id（须与面域共面——结构上草图线恒在草图面内，服务端求值期
 * 守卫兜底）；`fullRevolve=true` 走 360° 全周（`angle` 忽略），否则 `angle` 弧度制必填。
 * `regions` 语义与 extrude 同（SketchDto.regions 下标数组，面积降序；多选逐域旋转并 Unite）。
 * M6-c T2 起语义=ADD（Onshape Add 同语义：有上游=与上游布尔并为单一并集体——离群两体为
 * 多 lump 单体，合法；无上游=新建体直出）。v1 的「只 NEW」挂账已清偿——服务端裁决见
 * modeling-server AsyncFeatureEval.evaluateRevolveAsync 头注。 */
export interface RevolveParams {
  sketchId: string;
  /** @deprecated v1.30 起被 `regions` 取代（单面域简写，兼容保留）；服务端 zod
   * superRefine 与 `regions` 互斥拒收（同给两键即拒，不做静默优先级）。
   * 原 v1.7 语义：选面域（SketchDto.regions 下标，面积降序）；缺省 0=最大面域。 */
  regionIndex?: number;
  /** v1.30：多面域选择——SketchDto.regions 下标数组（面积降序，语义与 regionIndex 同锚）。
   * 逐域旋转（含孔域沿用域内 CSG）后 Unite 为单一工具实体；重复下标按集语义去重。
   * 缺省（与 regionIndex 皆不在场）=[0]=最大面域。 */
  regions?: number[];
  axis: { sketchEntityId: number };
  fullRevolve: boolean;
  angle?: number;
  /** v1.19：特征内布尔操作（缺省 "add"=既有 ADD 语义逐字不变）。 */
  operation?: FeatureBooleanOperation;
  /** v1.19：合并范围（同 ExtrudeParams.mergeScope；v1 只支持 0/1 个）。 */
  mergeScope?: BodyRef[];
}

/**
 * v1.29（ADR-0006 切片 B1）：基准面参考图元。首版只支持三世界基准面；面/边/其他 cPlane
 * 作为参考归 B2。偏移沿参考面法向（可负），`flipNormal` 同时反转法线与 xDir 手性。
 */
export type CPlaneReference = "top" | "front" | "right";
export interface CPlaneParams {
  reference: CPlaneReference;
  /** 沿参考面法向的偏移距离（mm，有限数；缺省 0）。与 `origin` 互斥。 */
  offsetMm?: number;
  /** v1.31（B2a）：平面点——世界坐标原点（mm）。给定时忽略 `offsetMm`，
   * 平面过该点、法线取 `reference` 世界基准面法线（`flipNormal` 可反转）。 */
  origin?: { x: number; y: number; z: number };
  /** true=法线与 xDir 反向（草图正面朝另一侧）。 */
  flipNormal?: boolean;
  /** v1.40（ADR-0013 切片 1）：LINE_ANGLE 旋转轴（世界系线；direction 须非零）。
   * 与 angleDeg 成对出现；与 offsetMm/origin 互斥。平面过该线，法线由参考面法线
   * 绕该线旋转 angleDeg（右手定则），xDir=线方向。 */
  line?: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } };
  /** v1.40：绕 `line` 的旋转角（度制，有限数；0=参考面方向）。
   * v1.43（ADR-0013 切片 2）：LINE_POINT 与 angleDeg 互斥。 */
  angleDeg?: number;
  /** v1.43：LINE_POINT 的过线点（世界坐标；与 line 成对、与 angleDeg 互斥）。
   * 平面 = 过 `line` 与 `point` 的唯一平面；point 在线上时退化（前端返回 undefined）。 */
  point?: { x: number; y: number; z: number };
  /** v1.44：THREE_POINT——三点唯一平面（p1=原点，normal=(p2−p1)×(p3−p1)，xDir=p2−p1）。
   * 与其余模式字段全部互斥；三点共线退化（前端返回 undefined）。 */
  threePoints?: [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ];
}

export type FeatureParams = ExtrudeParams | FilletParams | ChamferParams | ShellParams | RevolveParams | BooleanParams | LoftParams | SweepParams | MirrorParams | PatternParams | BooleanBodiesParams | HoleParams | CPlaneParams | FaceExtrudeParams | FeaturePatternParams | TransformParams | SplitPartParams | MoveFaceParams | FeatureMirrorParams;

export type FeatureOp =
  /** `targetBodyId`（B6 M-A3.1 v1.15）：N>1 模型 regular insert 的显式目标 body
   * （authored/active；缺省在 N≤1 走 legacy 默认体）。`params.newBody===true` 时它是**锚定链**
   * body（新体由本 op 创建，不写入该 body）；无 target 时锚定全局链尾。 */
  | { kind: "insertFeature"; featureType: LubanFeatureType; params: FeatureParams; targetBodyId?: string }
  | { kind: "updateParams"; featureId: string; params: FeatureParams }
  /** `targetBodyId`（B6 M-A3.2a v1.15）：N>1 模型删除特征的显式目标 body（authored/active；
   * 缺省在 N≤1 走 legacy 路径）。服务端只把它作**门禁令牌**并校验与特征真实 body 边一致；
   * 绝不消费该字段指向的 body（软删除资格只认特征自己的 FeatureDrives 目标）。 */
  | { kind: "deleteFeature"; featureId: string; targetBodyId?: string }
  | { kind: "setFeatureSuppressed"; featureId: string; suppressed: boolean }
  | { kind: "reorderFeature"; featureId: string; to: number }  // to=目标序位（1 基）
  /** M2 T4.5：改草图约束尺寸（仅 distance/radius 类约束）→ 重解算 → 草图 params+几何流重写 → EDE 传播 */
  | { kind: "updateSketchConstraint"; sketchId: string; constraintId: number; value: number }
  /** v1.35（ADR-0009 切片 1a）：`projections` 指定从**其它草图实体**投影到本草图平面。
   * 后端在求解前从源草图当前解合成曲线（line/circle/arc/point），合成实体带 `projected`
   * 标记且不参与求解器 DOF；读取时按源实时重投影（改源草图→下游特征联动）。
   * 切片 1a 不支持实体边/面引用（后续切片）。 */
  | { kind: "insertSketch"; entities: SketchEntityDto[]; constraints: SketchConstraintDto[]; plane?: SketchPlaneDto; projections?: SketchProjectionRequest[] }
  | { kind: "updateSketch"; sketchId: string; entities: SketchEntityDto[]; constraints: SketchConstraintDto[] }
  /** RW2-T3 v1.3：删草图（守卫：被任一特征引用即拒收——服务端按 sketch→feature 边检查） */
  | { kind: "deleteSketch"; sketchId: string }
  | { kind: "undo" } | { kind: "redo" };

export interface FeatureTreeEntry {
  id: string;
  featureType: string;
  orderKey: number;
  suppressed: boolean;
  status: number;
  params: unknown;
}

export type FeatureOpResult =
  | { ok: true; featureId?: string }
  | { ok: false; error: string };

/**
 * v1.21：预览几何（新特征影子求值结果）。前端把 `entries` 原样作为
 * `DynamicGraphicsRequest3dProps.geometry = { format: 'flatbuffer', data }`
 * 交给 TileRpc `requestElementGraphics`，由后端 Visualization 生成 iMdl，
 * 前端 `readElementGraphics` 显示——瞬态预览，不进 tile cache/不落库。
 */
export interface FeaturePreviewGeometryDto {
  /** BRep/flatbuffer 几何流（`ElementGeometryDataEntry[]`）。 */
  entries: ElementGeometryDataEntry[];
  /** 3D 类别（后端取目标 body 的 category；动态请求契约要求持久类别）。 */
  categoryId: string;
  /** 几何流局部坐标系 → 世界（目标 body 的 placement，已去 bbox）。 */
  placement: Omit<Placement3dProps, "bbox">;
  /** 关联模型（可选；可为 transient id）。 */
  modelId?: string;
  /** 关联元素（可选；目标 body，供选中/高亮语义）。 */
  elementId?: string;
}

/** M3-a：预览结果（HITL 预览→确认→提交；不落库，仅回报受影响特征及内核状态码）。
 * v1.21：fillet 首切片附带 `preview`（影子求值的真实结果几何），供 TileRpc 动态预览。 */
export interface PreviewResult {
  ok: boolean;
  error?: string;
  affected: Array<{ featureId: string; status: number }>;
  preview?: FeaturePreviewGeometryDto;
  /** 预览几何计算失败的诚实信息（不影响 ok/affected 的校验结论）。 */
  previewError?: string;
}

/** M3-a：表单字段种类（前端按 kind 渲染；edgeRefs 由 resolveEdgeRef 寻址；RW2-T7 增 faceRefs——由 resolveFaceRef 寻址） */
export type FeatureFormFieldKind = "number" | "json" | "boolean" | "edgeRefs" | "faceRefs" | "readonlyText";

export interface FeatureFormField { name: string; label: string; kind: FeatureFormFieldKind; readOnly?: boolean }
export interface FeatureFormModelEntry { fields: FeatureFormField[] }
export type FeatureFormModel = Record<string, FeatureFormModelEntry>;

/**
 * M3-b v1.2：草图实体/约束（solver-neutral，与后端 SolverTypes.ts 同形——两端同源维护，
 * 改一处必须同步另一处）。实体 id/引用为草图内局部编号（非 iModel ElementId）。
 * M6-a v1.6 增 arc：center 引用 point id（与 circle 同）；startAngle/sweepAngle 为弧度制；
 * radius/startAngle/sweepAngle 缺省 = 待后端解算；三点弧工具由前端换算为本形态后提交。
 */
/** v1.19：草图内联几何（隐式子元素；不占可见实体计数）。 */
export interface SketchPointDto { x: number; y: number }

/** v1.19：结构化子实体引用。数字 = 显式实体 id（旧形态，逐字有效）。
 * - `start`/`end`：line 端点；arc 起/止端点；spline 首/末控制点（曲线端点）；point 自身。
 * - `center`：circle/arc 圆心（内联圆心不占可见实体；约束寻址用）。
 * - `point` + `index`：spline 拟合点 index（T2 = 端点拟合点 0/1）。
 * - `handle` + `index`：spline 控制点（0..3，三次贝塞尔句柄）。
 * - `origin`：草图原点（服务端归一化为隐藏锁定点，不占可见实体）。 */
export type SketchRef =
  | number
  | { entity: number; part: "start" | "end" | "center" }
  | { entity: number; part: "point"; index: number }
  | { entity: number; part: "handle"; index: number }
  | { origin: true };

/** v1.35（ADR-0009 切片 1a）：草图外部引用。当前唯一形态=同 Part Studio 内另一张
 * 草图的实体（源实体类型决定投影结果：line/circle/arc/point）。实体边/面引用属后续切片。 */
export interface SketchExternalRef {
  kind: "sketchEntity";
  sketchId: string;
  entityId: number;
}

/** v1.35：投影实体标记（后端合成并落 params）。携带该标记的实体不参与求解器 DOF；
 * 每次读取按 `source` 的当前解实时重投影（源草图改尺寸→引用草图/下游特征联动）。
 * 派生点实体与曲线实体携带同一标记（source 指向源曲线实体）。 */
export interface SketchProjectedMarker {
  kind: "projected";
  source: SketchExternalRef;
  /** true=派生点（端点/圆心；由所属曲线统一刷新与求解排除）。根实体省略。 */
  derived?: boolean;
}

/** v1.35：insertSketch 投影请求。`entityId`=合成曲线实体 id（后端保留 id+1/+2 给
 * 派生端点/圆心点）；与既有实体 id 冲突即拒收。 */
export interface SketchProjectionRequest {
  sourceSketchId: string;
  sourceEntityId: number;
  entityId: number;
}

export type SketchEntityDto =
  | { kind: "point"; id: number; x?: number; y?: number; projected?: SketchProjectedMarker }
  | { kind: "line"; id: number; p1: number | SketchPointDto; p2: number | SketchPointDto; construction?: boolean; projected?: SketchProjectedMarker }
  | { kind: "circle"; id: number; center: number | SketchPointDto; radius?: number; construction?: boolean; projected?: SketchProjectedMarker }
  | { kind: "arc"; id: number; center: number | SketchPointDto; radius?: number; startAngle?: number; sweepAngle?: number; construction?: boolean; projected?: SketchProjectedMarker }
  /** v1.19：精确三次贝塞尔样条（Tutorial 2 为单条三次曲线；controlPoints 恰 4 个）。
   * fitPoints 为 Onshape 拟合点语义（端点与 curve start/end 重合）；服务端求解以 controlPoints
   * 为真源，fitPoints 仅用于结构化引用对齐与读面保真。N>2 拟合点/周期样条延后。 */
  | { kind: "spline"; id: number; fitPoints?: SketchPointDto[]; controlPoints: SketchPointDto[]; periodic?: boolean; construction?: boolean; projected?: SketchProjectedMarker };
export interface SketchConstraintDto {
  /** v1.25（ADR-0004）：angle=两线夹角（value 弧度，direction-vector 语义）；diameter/concentric；
   * driven=参考尺寸（不送求解器）。 */
  kind: "coincident" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "equal" | "distance" | "radius" | "diameter" | "concentric" | "angle" | "length" | "midpoint" | "tangent" | "offset" | "fixed" | "mirror";
  id: number; refs: SketchRef[]; value?: number; driven?: boolean;
}
export type SketchSolveStatusDto = "ok" | "underconstrained" | "conflicting" | "failed";
export interface SketchSolveStateDto { status: SketchSolveStatusDto; dof: number; failedConstraintIds: number[]; conflictingRank: number[]; redundant?: boolean }
/** M6-a v1.6：草图面域（几何流写回后经 sketchRegionsFrom 识别下发，面积降序）。
 * regionIndex 语义 = 本数组下标。outerEntityIds=外环构成实体 id 集；holeEntityIds=孔环（可缺省）。
 * v1.20：outerBoundary/holeBoundaries = 后端**有序环采样点**（草图局部 2D，闭合、首尾不重复）——
 * 预览橙色面填充消费；实体 id 集不足以重建带交点/孔环的面域边界。 */
export interface SketchRegionDto {
  area: number;
  outerEntityIds: number[];
  holeEntityIds?: number[];
  outerBoundary?: SketchPointDto[];
  holeBoundaries?: SketchPointDto[][];
}
export interface SketchDto {
  id: string;
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  solve: SketchSolveStateDto;
  /** M6-a v1.6：草图面域集（可选——旧后端不下发时前端按无面域处理）。 */
  regions?: SketchRegionDto[];
  /** M6-b v1.7（T1）：落库草图平面回传（insertSketch op 携带的 plane 原样存取）。
   * 可选——旧库/旧后端无 plane 时省略键，前端按缺省 XY@z=0 语义处理（与 insertSketch
   * op 省略 plane 键同义）。 */
  plane?: SketchPlaneDto;
}
export interface SketchSummaryDto { id: string; entityCount: number; constraintCount: number }

/** M6-a v1.6：草图平面（世界系米制；缺省=XY@z=0 保持 M3-b 语义）。
 * 草图实体/解算仍在局部 2D（u,v）；特征求值时经本变换到世界系。
 * v1.29：`sourceFeatureId` 记录派生来源（cPlane 特征 id）。三向量仍是插入时快照；
 * 本切片 sourceFeatureId 只用于来源展示与「被引用时禁止改参/删除」守卫。 */
export interface SketchPlaneDto {
  origin: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  xDir: { x: number; y: number; z: number };
  /** v1.29：平面来源特征（cPlane）。旧库/基准面无此键。 */
  sourceFeatureId?: string;
}

export abstract class LubanFeatureRpcInterface extends RpcInterface {
  /**
   * 接口名必须是干净标识符：BentleyCloudRpcProtocol 的 URL 操作路径按 "-" 与 "/"
   * 切分解析（itwinjs-core BentleyCloudRpcProtocol.getOperationFromPath），
   * "luban-cad/features-v1" 这类带 "/" "-" 的名字永远无法被 HTTP RPC 寻址
   * （T6.6 连通冒烟实证：解析退化为接口名 "features"）。同 LubanRpcInterface 惯例。
   */
  public static interfaceName = "LubanFeatureRpcInterface";
  public static interfaceVersion = "1.63.0";

  /** 前端消费方入口（同 LubanRpcInterface.getClient 模式） */
  public static getClient(): LubanFeatureRpcInterface {
    return RpcManager.getClientForInterface(LubanFeatureRpcInterface);
  }

  /**
   * B-model P2.2 v1.18：列 Part Studio 注册表（纯读——不初始化、不建分区；空文档=[]）。
   * 顺序=metadata.order 升序、同序按分区 ECInstanceId；无元数据的 P1 标签 name=id/order=0。
   */
  public async listPartStudios(_iModelKey: string): Promise<PartStudioInfo[]> { return this.forward(arguments); }
  /**
   * B-model P2.2 v1.18：创建 Part Studio（唯一创建者）——显式初始化 def/phys model + init
   * BodySolid，并在 def 分区 JsonProperties.luban.partStudio 写注册表元数据。
   * 空/scoped 文档可建；legacy/mixed/unknown 文档诚实拒收；名称 trim 后非空且 ≤120 字符。
   * `sessionId` 必填且须持有该 iModel 的写租约（assertHeld 失败→拒收，不建任何东西）。
   */
  public async createPartStudio(_iModelKey: string, _name: string, _sessionId: string): Promise<PartStudioInfo> { return this.forward(arguments); }
  /**
   * B-model P2.2 v1.18：重命名 Part Studio（仅改元数据；id/order/createdAt 保持）。
   * 不存在/legacy scope 诚实拒收；名称校验同 createPartStudio；`sessionId` 必填且须持写租约。
   */
  public async renamePartStudio(_iModelKey: string, _partStudioId: string, _name: string, _sessionId: string): Promise<PartStudioInfo> { return this.forward(arguments); }
  /**
   * B-model P2.2 v1.18：删除 Part Studio（只删本 scope 的 features/sketches/bodies/OpLog/
   * def+phys models/分区；共享 SpatialCategory 与其它 scope 不受影响）。**最后一个完整 scope
   * 拒删**（抛错）；**同一事务写持久 tombstone**——已删 scope 的惰性初始化/读写不得复活。
   * `sessionId` 必填且须持写租约。
   */
  public async deletePartStudio(_iModelKey: string, _partStudioId: string, _sessionId: string): Promise<void> { return this.forward(arguments); }

  /** B-model v1.17：可选 `partStudioId`——缺省=legacy 单工作室读面（旧行为逐字）。 */
  public async getFeatureTree(_iModelKey: string, _partStudioId?: string): Promise<FeatureTreeEntry[]> { return this.forward(arguments); }
  /** B-model v1.17：可选 `partStudioId`——缺省=legacy 写路径（含 legacy 写保护：库内有 scoped 分区即拒收）。 */
  public async applyFeatureOp(_iModelKey: string, _op: FeatureOp, _sessionId: string, _partStudioId?: string): Promise<FeatureOpResult> { return this.forward(arguments); }
  public async acquireWriteLease(_iModelKey: string, _sessionId: string, _user?: string): Promise<{ ok: boolean; holder?: string }> { return this.forward(arguments); }
  public async releaseWriteLease(_iModelKey: string, _sessionId: string): Promise<void> { return this.forward(arguments); }

  /** M3-a v1.1：op 预览（不提交事务，回报受影响特征）；B-model v1.17 可选 `partStudioId`（缺省=legacy 读面） */
  public async previewFeatureOp(_iModelKey: string, _op: FeatureOp, _sessionId: string, _partStudioId?: string): Promise<PreviewResult> { return this.forward(arguments); }
  /** M3-a v1.1：拾取元素子实体 → 边引用（edgeRefs 表单值的寻址端点；M6-d v1.9 起
   * ref=边自身持久 id 单引用——邻接通道门禁 + op31 边语义换号，面对对已退役）。 */
  public async resolveEdgeRef(_iModelKey: string, _elementId: string, _subEntityId: number): Promise<{ ok: boolean; ref?: FilletEdgeRef; error?: string }> { return this.forward(arguments); }
  /** RW2-T7 v1.5：拾取元素面 → 持久拓扑 id（faceRefs/shell faces 表单值的寻址端点；op31 topologyIdFromSubEntity） */
  public async resolveFaceRef(_iModelKey: string, _elementId: string, _subEntityId: number): Promise<{ ok: boolean; ref?: LubanTopologyId; error?: string }> { return this.forward(arguments); }
  /** M3-a v1.1：按特征类型取参数表单模型（前端动态渲染） */
  public async getFeatureFormModel(_iModelKey: string): Promise<FeatureFormModel> { return this.forward(arguments); }

  /** M3-b v1.2：读单张草图（实体+约束+解算状态；不存在返回 undefined）；B-model v1.17 可选 `partStudioId` */
  public async getSketch(_iModelKey: string, _sketchId: string, _partStudioId?: string): Promise<SketchDto | undefined> { return this.forward(arguments); }
  /** M3-b v1.2：列 iModel 内全部草图（摘要读面）；B-model v1.17 可选 `partStudioId`（缺省=legacy 全库读面） */
  public async listSketches(_iModelKey: string, _partStudioId?: string): Promise<SketchSummaryDto[]> { return this.forward(arguments); }

  /** B6 M-A3.1 v1.15：body 读面（只读，无租约门禁）——authored body（含 consumed 的 active=false），
   * 按 bodyKey 升序；直改副本/orphan 不在读面。M3.2 的树/参数面板消费。 */
  public async getBodies(_iModelKey: string, _partStudioId?: string): Promise<BodyInfo[]> { return this.forward(arguments); }

  /** v1.19：body 质量属性只读面（无租约门禁；authored/active body 逐个体积/质心/表面积）。
   * 缺省 Part Studio=legacy 单工作室读面（与 getBodies 同锚）。 */
  public async getMassProperties(_iModelKey: string, _partStudioId?: string): Promise<MassPropertiesDto[]> { return this.forward(arguments); }
}
