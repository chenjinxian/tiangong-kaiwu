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
 * 消费方：modeling-server FeatureRpcImpl（服务端）、前端 feature 面板（M3）。
 */
import { RpcInterface, RpcManager } from "@itwin/core-common";

/** 特征类型（M1：拉伸 + 布尔；M3-a 增 fillet；RW2-T6 增 chamfer；RW2-T7 增 shell；M6-b T2 增 revolve；
 * B2 v1.11 增 loft；B3 v1.12 增 sweep） */
export type LubanFeatureType = "extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep";

/** 拉伸/布尔共用参数：XY 平面闭合多边形轮廓 + Z 向距离。
 * `sketchId`（M2 T4.5）：轮廓改由草图元素几何流供给（已解算轮廓）；存在时 `profile` 须为空数组
 * （互斥语义，Registry 层 zod 校验锁死）。本接口的 sketchId 仅 extrude 语义；布尔草图驱动在
 * M7 v1.10 起走独立的 BooleanParams（不共用本接口——见其注），服务端按类型字段集校验。
 */
export interface ExtrudeParams {
  profile: Array<{ x: number; y: number }>;
  distance: number;
  sketchId?: string;
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

/** 内核持久拓扑 id（面语义；op31-34 的 TS 形状，EditBuiltInCommand.ts:418-424） */
export interface LubanTopologyId { nodeId: number; entityId: number }

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
 * `regionIndex` 语义与 extrude 同（SketchDto.regions 下标，面积降序；缺省 0=最大面域）。
 * M6-c T2 起语义=ADD（Onshape Add 同语义：有上游=与上游布尔并为单一并集体——离群两体为
 * 多 lump 单体，合法；无上游=新建体直出）。v1 的「只 NEW」挂账已清偿——服务端裁决见
 * modeling-server AsyncFeatureEval.evaluateRevolveAsync 头注。 */
export interface RevolveParams {
  sketchId: string;
  regionIndex?: number;
  axis: { sketchEntityId: number };
  fullRevolve: boolean;
  angle?: number;
}

export type FeatureParams = ExtrudeParams | FilletParams | ChamferParams | ShellParams | RevolveParams | BooleanParams | LoftParams | SweepParams;

export type FeatureOp =
  | { kind: "insertFeature"; featureType: LubanFeatureType; params: FeatureParams }
  | { kind: "updateParams"; featureId: string; params: FeatureParams }
  | { kind: "deleteFeature"; featureId: string }
  | { kind: "setFeatureSuppressed"; featureId: string; suppressed: boolean }
  | { kind: "reorderFeature"; featureId: string; to: number }  // to=目标序位（1 基）
  /** M2 T4.5：改草图约束尺寸（仅 distance/radius 类约束）→ 重解算 → 草图 params+几何流重写 → EDE 传播 */
  | { kind: "updateSketchConstraint"; sketchId: string; constraintId: number; value: number }
  | { kind: "insertSketch"; entities: SketchEntityDto[]; constraints: SketchConstraintDto[]; plane?: SketchPlaneDto }
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

/** M3-a：预览结果（HITL 预览→确认→提交；不落库，仅回报受影响特征及内核状态码） */
export interface PreviewResult { ok: boolean; error?: string; affected: Array<{ featureId: string; status: number }> }

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
export type SketchEntityDto =
  | { kind: "point"; id: number; x?: number; y?: number }
  | { kind: "line"; id: number; p1: number; p2: number }
  | { kind: "circle"; id: number; center: number; radius?: number }
  | { kind: "arc"; id: number; center: number; radius?: number; startAngle?: number; sweepAngle?: number };
export interface SketchConstraintDto {
  kind: "coincident" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "equal" | "distance" | "radius";
  id: number; refs: number[]; value?: number;
}
export type SketchSolveStatusDto = "ok" | "underconstrained" | "conflicting" | "failed";
export interface SketchSolveStateDto { status: SketchSolveStatusDto; dof: number; failedConstraintIds: number[]; conflictingRank: number[]; redundant?: boolean }
/** M6-a v1.6：草图面域（几何流写回后经 sketchRegionsFrom 识别下发，面积降序）。
 * regionIndex 语义 = 本数组下标。outerEntityIds=外环构成实体 id 集；holeEntityIds=孔环（可缺省）。 */
export interface SketchRegionDto { area: number; outerEntityIds: number[]; holeEntityIds?: number[] }
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
 * 草图实体/解算仍在局部 2D（u,v）；特征求值时经本变换到世界系。 */
export interface SketchPlaneDto { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; xDir: { x: number; y: number; z: number } }

export abstract class LubanFeatureRpcInterface extends RpcInterface {
  /**
   * 接口名必须是干净标识符：BentleyCloudRpcProtocol 的 URL 操作路径按 "-" 与 "/"
   * 切分解析（itwinjs-core BentleyCloudRpcProtocol.getOperationFromPath），
   * "luban-cad/features-v1" 这类带 "/" "-" 的名字永远无法被 HTTP RPC 寻址
   * （T6.6 连通冒烟实证：解析退化为接口名 "features"）。同 OpenCloudRpcInterface 惯例。
   */
  public static interfaceName = "LubanFeatureRpcInterface";
  public static interfaceVersion = "1.12.0";

  /** 前端消费方入口（同 OpenCloudRpcInterface.getClient 模式） */
  public static getClient(): LubanFeatureRpcInterface {
    return RpcManager.getClientForInterface(LubanFeatureRpcInterface);
  }

  public async getFeatureTree(_iModelKey: string): Promise<FeatureTreeEntry[]> { return this.forward(arguments); }
  public async applyFeatureOp(_iModelKey: string, _op: FeatureOp, _sessionId: string): Promise<FeatureOpResult> { return this.forward(arguments); }
  public async acquireWriteLease(_iModelKey: string, _sessionId: string, _user?: string): Promise<{ ok: boolean; holder?: string }> { return this.forward(arguments); }
  public async releaseWriteLease(_iModelKey: string, _sessionId: string): Promise<void> { return this.forward(arguments); }

  /** M3-a v1.1：op 预览（不提交事务，回报受影响特征） */
  public async previewFeatureOp(_iModelKey: string, _op: FeatureOp, _sessionId: string): Promise<PreviewResult> { return this.forward(arguments); }
  /** M3-a v1.1：拾取元素子实体 → 边引用（edgeRefs 表单值的寻址端点；M6-d v1.9 起
   * ref=边自身持久 id 单引用——邻接通道门禁 + op31 边语义换号，面对对已退役）。 */
  public async resolveEdgeRef(_iModelKey: string, _elementId: string, _subEntityId: number): Promise<{ ok: boolean; ref?: FilletEdgeRef; error?: string }> { return this.forward(arguments); }
  /** RW2-T7 v1.5：拾取元素面 → 持久拓扑 id（faceRefs/shell faces 表单值的寻址端点；op31 topologyIdFromSubEntity） */
  public async resolveFaceRef(_iModelKey: string, _elementId: string, _subEntityId: number): Promise<{ ok: boolean; ref?: LubanTopologyId; error?: string }> { return this.forward(arguments); }
  /** M3-a v1.1：按特征类型取参数表单模型（前端动态渲染） */
  public async getFeatureFormModel(_iModelKey: string): Promise<FeatureFormModel> { return this.forward(arguments); }

  /** M3-b v1.2：读单张草图（实体+约束+解算状态；不存在返回 undefined） */
  public async getSketch(_iModelKey: string, _sketchId: string): Promise<SketchDto | undefined> { return this.forward(arguments); }
  /** M3-b v1.2：列 iModel 内全部草图（摘要读面） */
  public async listSketches(_iModelKey: string): Promise<SketchSummaryDto[]> { return this.forward(arguments); }
}
