/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 鲁班CAD 特征系统 M1 RPC 接口（roadmap T5.8）。
 * 消费方：modeling-server FeatureRpcImpl（服务端）、前端 feature 面板（M3）。
 */
import { RpcInterface } from "@itwin/core-common";

/** v1 特征类型（M1：拉伸 + 布尔；fillet 等 M3 再加） */
export type LubanFeatureType = "extrude" | "booleanAdd" | "booleanSubtract";

/** 拉伸/布尔共用参数：XY 平面闭合多边形轮廓 + Z 向距离。
 * `sketchId`（M2 T4.5）：轮廓改由草图元素几何流供给（已解算轮廓）；存在时 `profile` 须为空数组
 * （互斥语义，Registry 层 zod 校验锁死），布尔类型不消费此字段（内联 profile 照旧）。
 */
export interface ExtrudeParams {
  profile: Array<{ x: number; y: number }>;
  distance: number;
  sketchId?: string;
}

export type FeatureOp =
  | { kind: "insertFeature"; featureType: LubanFeatureType; params: ExtrudeParams }
  | { kind: "updateParams"; featureId: string; params: ExtrudeParams }
  | { kind: "deleteFeature"; featureId: string }
  /** M2 T4.5：改草图约束尺寸（仅 distance/radius 类约束）→ 重解算 → 草图 params+几何流重写 → EDE 传播 */
  | { kind: "updateSketchConstraint"; sketchId: string; constraintId: number; value: number }
  | { kind: "undo" }
  | { kind: "redo" };

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

export abstract class LubanFeatureRpcInterface extends RpcInterface {
  public static interfaceName = "luban-cad/features-v1";
  public static interfaceVersion = "1.0.0";

  public async getFeatureTree(_iModelKey: string): Promise<FeatureTreeEntry[]> { return this.forward(arguments); }
  public async applyFeatureOp(_iModelKey: string, _op: FeatureOp, _sessionId: string): Promise<FeatureOpResult> { return this.forward(arguments); }
  public async acquireWriteLease(_iModelKey: string, _sessionId: string, _user?: string): Promise<{ ok: boolean; holder?: string }> { return this.forward(arguments); }
  public async releaseWriteLease(_iModelKey: string, _sessionId: string): Promise<void> { return this.forward(arguments); }
}
