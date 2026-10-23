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
 * 消费方：modeling-server FeatureRpcImpl（服务端）、前端 feature 面板（M3）。
 */
import { RpcInterface, RpcManager } from "@itwin/core-common";

/** 特征类型（M1：拉伸 + 布尔；M3-a 增 fillet；RW2-T6 增 chamfer；RW2-T7 增 shell） */
export type LubanFeatureType = "extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell";

/** 拉伸/布尔共用参数：XY 平面闭合多边形轮廓 + Z 向距离。
 * `sketchId`（M2 T4.5）：轮廓改由草图元素几何流供给（已解算轮廓）；存在时 `profile` 须为空数组
 * （互斥语义，Registry 层 zod 校验锁死）。仅 extrude 接受此字段——布尔类型按类型拒收
 * （Registry booleanSchema，M2 终审 I2；显式支持归 M2-UX 单裁）。
 */
export interface ExtrudeParams {
  profile: Array<{ x: number; y: number }>;
  distance: number;
  sketchId?: string;
  /** M6-a v1.6：sketchId 模式下选面域（SketchDto.regions 下标，面积降序）；缺省 0=最大面域。 */
  regionIndex?: number;
}

/** 内核持久拓扑 id（面语义；op31-34 的 TS 形状，EditBuiltInCommand.ts:418-424） */
export interface LubanTopologyId { nodeId: number; entityId: number }

/** 边引用 = 两邻面拓扑 id 对（op33 EdgesFromId 的边寻址契约，恰 2 元素序无关） */
export interface FilletEdgeRef { faceA: LubanTopologyId; faceB: LubanTopologyId }

export interface FilletParams { radius: number; propagateSmooth: boolean; edges: FilletEdgeRef[] }

/**
 * chamfer 参数（RW2-T6）：倒角模式 + 一/双倒角值 + 邻面对边引用集。
 * mode = 内核 ChamferMode 枚举（editor/common EditorBuiltInIpc.ts）：0=Ranges / 1=Length /
 * 2=Distances / 3=DistanceAngle / 4=AngleDistance；值语义随 mode（Length 只用 values1；
 * Distances=values1/values2 双距离；DistanceAngle=values1 距离+values2 弧度角；
 * AngleDistance 反之）。values 允许标量（全部边同值）或等长于边集的数组（逐边值）——
 * 服务端求值器一律展开为等长数组喂内核（native 标量广播契约经 blendEdges 探针证伪不可信）。
 * edges 寻址与 fillet 完全同构（resolveEdgeRef 的 FilletEdgeRef 邻面对拓扑 id）。
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

export type FeatureParams = ExtrudeParams | FilletParams | ChamferParams | ShellParams;

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
  public static interfaceVersion = "1.7.0";

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
  /** M3-a v1.1：拾取元素子实体 → 邻面对边引用（edgeRefs 表单值的寻址端点） */
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
