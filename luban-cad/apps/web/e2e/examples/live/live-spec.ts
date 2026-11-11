/**
 * Live UI 复刻 spec（2026-11-11 策略切换）。
 *
 * 数据来源：Onshape 公开文档的可编辑副本，经 UI 特征树/对话框/草图/体属性
 * 人工+自动分析得到。spec 只描述“在 luban-cad 里怎么建”；原始截图/副本 id
 * 与 UI 证据留在私有仓 `live/`。
 *
 * 首切片只支持 sketch + extrude；未知步骤必须报 blocked，不得静默跳过。
 */
import type {
  SketchConstraintDto,
  SketchEntityDto,
  SketchPlaneDto,
} from '@luban-cad/shared';
import type { LiveEdgeSelector } from './edge-select.js';
import type { LiveFaceSelector } from './face-select.js';

export interface LiveSource {
  docId: string;
  elementId: string;
  name?: string;
}

export interface LiveCopy extends LiveSource {
  workspaceId: string;
}

export interface LiveSketchStep {
  kind: 'sketch';
  name: string;
  plane: SketchPlaneDto;
  entities: SketchEntityDto[];
  constraints: SketchConstraintDto[];
  note?: string;
}

export interface LiveExtrudeStep {
  kind: 'extrude';
  name: string;
  /** 本 spec 中前序草图的 name。 */
  sketchName: string;
  depthMm: number;
  operation?: 'new' | 'add' | 'remove' | 'intersect';
  regions?: number[];
  /** 多 body throughAll REMOVE：按这些前序特征各自创建的 body 显式锚定
   * （v1.68 targetBodyIds 单特征逐体求值）。 */
  targetBodyFeatureNames?: string[];
  /** 透传给产品的其它 extrude 字段（symmetric/direction/...）。 */
  extraParams?: Record<string, unknown>;
  note?: string;
}

export interface LiveRevolveStep {
  kind: 'revolve';
  name: string;
  sketchName: string;
  axisSketchEntityId: number;
  operation?: 'new' | 'add' | 'remove' | 'intersect';
  fullRevolve?: boolean;
  angleRad?: number;
  regions?: number[];
  note?: string;
}

/** 孔：孔位来自本 spec 前序草图内的 point 实体（Onshape mateConnector 孔位
 * 在离线数据里只有查询引用，live 轨按 UI/查询位置还原为草图点）。 */
export interface LiveHoleStep {
  kind: 'hole';
  name: string;
  sketchName: string;
  /** 草图 point 实体 id；调用方负责在 sketch step 里定义这些点。 */
  pointEntityIds: number[];
  diameterMm: number;
  holeStyle?: 'simple' | 'counterbore' | 'countersink';
  counterboreDiameterMm?: number;
  counterboreDepthMm?: number;
  countersinkDiameterMm?: number;
  countersinkAngleDeg?: number;
  tipAngleDeg?: number;
  endBound: 'blind' | 'throughAll' | 'upToNext';
  depthMm?: number;
  direction?: 'forward' | 'backward';
  /** 多 body 模型：目标 body 由该特征创建（运行时按 bodyKey 差集解析）。 */
  targetBodyFeatureName?: string;
  note?: string;
}

/** 特征镜像：镜像本 spec 前序特征的几何增量（源特征名→featureId 在运行时解析）。 */
export interface LiveFeatureMirrorStep {
  kind: 'featureMirror';
  name: string;
  sourceFeatureName: string;
  planeLine: { origin: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } };
  /** 多 body：镜像编辑的目标 body（该前序特征创建的 body）。 */
  targetBodyFeatureName?: string;
  note?: string;
}

export interface LiveFeaturePatternSecondDirection {
  count: number;
  spacingMm: number;
  axis: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } };
}

/** 特征阵列：阵列本 spec 前序特征的几何增量。 */
export interface LiveFeaturePatternStep {
  kind: 'featurePattern';
  name: string;
  sourceFeatureName: string;
  patternKind: 'linear' | 'circular';
  count: number;
  spacingMm?: number;
  angleDeg?: number;
  axis: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } };
  secondDirection?: LiveFeaturePatternSecondDirection;
  /** 多 body：pattern 编辑的目标 body（该前序特征创建的 body）。 */
  targetBodyFeatureName?: string;
  note?: string;
}

export interface LiveFilletStep {
  kind: 'fillet';
  name: string;
  radiusMm: number;
  edges: LiveEdgeSelector[];
  propagateSmooth?: boolean;
  note?: string;
}

export interface LiveChamferStep {
  kind: 'chamfer';
  name: string;
  distanceMm: number;
  edges: LiveEdgeSelector[];
  /** 内核 mode：2=等距离（缺省）、3=距离+角度；values1/values2 缺省=等距离。 */
  mode?: number;
  values1?: number;
  values2?: number;
  propagateSmooth?: boolean;
  note?: string;
}

export interface LiveShellStep {
  kind: 'shell';
  name: string;
  thicknessMm: number;
  /** true=外扩；缺省 false=内缩（Onshape oppositeDirection=false）。 */
  oppositeDirection?: boolean;
  faces: LiveFaceSelector[];
  /** 多 body：shell 编辑的目标 body（该前序特征创建的 body）。 */
  targetBodyFeatureName?: string;
  note?: string;
}

export interface LiveSkippedStep {
  kind: 'skipped';
  name: string;
  reason: string;
}

export type LiveStep =
  | LiveSketchStep
  | LiveExtrudeStep
  | LiveRevolveStep
  | LiveHoleStep
  | LiveFeatureMirrorStep
  | LiveFeaturePatternStep
  | LiveFilletStep
  | LiveChamferStep
  | LiveShellStep
  | LiveSkippedStep;

export interface LiveSpec {
  schemaVersion: 1;
  id: string;
  title: string;
  status: 'approx' | 'exact' | 'blocked';
  imodelName: string;
  source: LiveSource;
  copy?: LiveCopy;
  steps: LiveStep[];
  /** true = 草图只保留已解坐标、丢弃约束（产品 normalizer 不支持的约束存在时使用）。 */
  skipConstraints?: boolean;
  expected?: {
    bodyCount?: number;
    volumeMm3?: number;
    /** 相对容差；live 首切片建议 0.02。 */
    tolerance?: number;
  };
  evidence?: string[];
  notes?: string[];
}
