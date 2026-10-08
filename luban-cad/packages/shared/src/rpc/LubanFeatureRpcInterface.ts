/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 鲁班CAD 特征系统 RPC 接口（M1 roadmap T5.8；M3-a 升 v1.1：fillet + suppress/reorder/preview/表单模型；
 * M3-b 升 v1.2：insertSketch/updateSketch op + getSketch/listSketches 读面）。
 * 消费方：modeling-server FeatureRpcImpl（服务端）、前端 feature 面板（M3）。
 */
import { RpcInterface, RpcManager } from "@itwin/core-common";

/** 特征类型（M1：拉伸 + 布尔；M3-a 增 fillet） */
export type LubanFeatureType = "extrude" | "booleanAdd" | "booleanSubtract" | "fillet";

/** 拉伸/布尔共用参数：XY 平面闭合多边形轮廓 + Z 向距离。
 * `sketchId`（M2 T4.5）：轮廓改由草图元素几何流供给（已解算轮廓）；存在时 `profile` 须为空数组
 * （互斥语义，Registry 层 zod 校验锁死）。仅 extrude 接受此字段——布尔类型按类型拒收
 * （Registry booleanSchema，M2 终审 I2；显式支持归 M2-UX 单裁）。
 */
export interface ExtrudeParams {
  profile: Array<{ x: number; y: number }>;
  distance: number;
  sketchId?: string;
}

/** 内核持久拓扑 id（面语义；op31-34 的 TS 形状，EditBuiltInCommand.ts:418-424） */
export interface LubanTopologyId { nodeId: number; entityId: number }

/** 边引用 = 两邻面拓扑 id 对（op33 EdgesFromId 的边寻址契约，恰 2 元素序无关） */
export interface FilletEdgeRef { faceA: LubanTopologyId; faceB: LubanTopologyId }

export interface FilletParams { radius: number; propagateSmooth: boolean; edges: FilletEdgeRef[] }

export type FeatureParams = ExtrudeParams | FilletParams;

export type FeatureOp =
  | { kind: "insertFeature"; featureType: LubanFeatureType; params: FeatureParams }
  | { kind: "updateParams"; featureId: string; params: FeatureParams }
  | { kind: "deleteFeature"; featureId: string }
  | { kind: "setFeatureSuppressed"; featureId: string; suppressed: boolean }
  | { kind: "reorderFeature"; featureId: string; to: number }  // to=目标序位（1 基）
  /** M2 T4.5：改草图约束尺寸（仅 distance/radius 类约束）→ 重解算 → 草图 params+几何流重写 → EDE 传播 */
  | { kind: "updateSketchConstraint"; sketchId: string; constraintId: number; value: number }
  | { kind: "insertSketch"; entities: SketchEntityDto[]; constraints: SketchConstraintDto[] }
  | { kind: "updateSketch"; sketchId: string; entities: SketchEntityDto[]; constraints: SketchConstraintDto[] }
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

/** M3-a：表单字段种类（前端按 kind 渲染；edgeRefs 由 resolveEdgeRef 寻址） */
export type FeatureFormFieldKind = "number" | "json" | "boolean" | "edgeRefs" | "readonlyText";

export interface FeatureFormField { name: string; label: string; kind: FeatureFormFieldKind; readOnly?: boolean }
export interface FeatureFormModelEntry { fields: FeatureFormField[] }
export type FeatureFormModel = Record<string, FeatureFormModelEntry>;

/**
 * M3-b v1.2：草图实体/约束（solver-neutral，与后端 SolverTypes.ts 同形——两端同源维护，
 * 改一处必须同步另一处）。实体 id/引用为草图内局部编号（非 iModel ElementId）。
 */
export type SketchEntityDto =
  | { kind: "point"; id: number; x?: number; y?: number }
  | { kind: "line"; id: number; p1: number; p2: number }
  | { kind: "circle"; id: number; center: number; radius?: number };
export interface SketchConstraintDto {
  kind: "coincident" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "equal" | "distance" | "radius";
  id: number; refs: number[]; value?: number;
}
export type SketchSolveStatusDto = "ok" | "underconstrained" | "conflicting" | "failed";
export interface SketchSolveStateDto { status: SketchSolveStatusDto; dof: number; failedConstraintIds: number[]; conflictingRank: number[]; redundant?: boolean }
export interface SketchDto { id: string; entities: SketchEntityDto[]; constraints: SketchConstraintDto[]; solve: SketchSolveStateDto }
export interface SketchSummaryDto { id: string; entityCount: number; constraintCount: number }

export abstract class LubanFeatureRpcInterface extends RpcInterface {
  /**
   * 接口名必须是干净标识符：BentleyCloudRpcProtocol 的 URL 操作路径按 "-" 与 "/"
   * 切分解析（itwinjs-core BentleyCloudRpcProtocol.getOperationFromPath），
   * "luban-cad/features-v1" 这类带 "/" "-" 的名字永远无法被 HTTP RPC 寻址
   * （T6.6 连通冒烟实证：解析退化为接口名 "features"）。同 OpenCloudRpcInterface 惯例。
   */
  public static interfaceName = "LubanFeatureRpcInterface";
  public static interfaceVersion = "1.2.0";

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
  /** M3-a v1.1：按特征类型取参数表单模型（前端动态渲染） */
  public async getFeatureFormModel(_iModelKey: string): Promise<FeatureFormModel> { return this.forward(arguments); }

  /** M3-b v1.2：读单张草图（实体+约束+解算状态；不存在返回 undefined） */
  public async getSketch(_iModelKey: string, _sketchId: string): Promise<SketchDto | undefined> { return this.forward(arguments); }
  /** M3-b v1.2：列 iModel 内全部草图（摘要读面） */
  public async listSketches(_iModelKey: string): Promise<SketchSummaryDto[]> { return this.forward(arguments); }
}
