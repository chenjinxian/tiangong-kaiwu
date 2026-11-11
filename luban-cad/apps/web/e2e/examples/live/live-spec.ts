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

/** 基准面：世界基准面 + 偏移/平面点/线角/线点/三点；可选平面快照供后续草图。 */
export interface LiveCPlaneStep {
  kind: 'cPlane';
  name: string;
  reference: 'top' | 'front' | 'right';
  offsetMm?: number;
  origin?: { x: number; y: number; z: number };
  flipNormal?: boolean;
  line?: {
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
  };
  angleDeg?: number;
  point?: { x: number; y: number; z: number };
  threePoints?: [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ];
  /** 后续草图按 planeFeatureName 引用时必需；由 spec 作者按参数推导。 */
  plane?: SketchPlaneDto;
  note?: string;
}

export interface LiveSketchStep {
  kind: 'sketch';
  name: string;
  plane?: SketchPlaneDto;
  /** 按本 spec 前序 cPlane 特征名引用平面快照；与 plane 恰一。 */
  planeFeatureName?: string;
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

export interface LiveLoftStep {
  kind: 'loft';
  name: string;
  /** 两张截面草图名（顺序=loft 方向）。 */
  sketchNames: [string, string];
  sections?: number;
  note?: string;
}

export interface LiveSweepStep {
  kind: 'sweep';
  name: string;
  profileSketchName: string;
  pathSketchName: string;
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

export interface LiveTransformStep {
  kind: 'transform';
  name: string;
  translation?: { x: number; y: number; z: number };
  rotation?: {
    axisOrigin?: { x: number; y: number; z: number };
    axisDirection: { x: number; y: number; z: number };
    angleDeg: number;
  };
  scale?: number;
  scaleAxes?: { x: number; y: number; z: number };
  scaleOrigin?: { x: number; y: number; z: number };
  copy?: boolean;
  /** 多 body 时显式目标 body（该前序特征创建的 body）。 */
  targetBodyFeatureName?: string;
  note?: string;
}

/** faceExtrude：选中平面面轮廓沿法向拉伸并与目标 body 布尔。 */
export interface LiveFaceExtrudeStep {
  kind: 'faceExtrude';
  name: string;
  face: LiveFaceSelector;
  operation: 'add' | 'remove' | 'intersect';
  endBound: 'blind' | 'throughAll';
  depthMm?: number;
  direction?: 'forward' | 'backward';
  startOffsetMm?: number;
  draftAngleDeg?: number;
  draftPullDirection?: boolean;
  /** faceExtrude 必须给出目标 body（该前序特征创建的 body）。 */
  targetBodyFeatureName: string;
  note?: string;
}

/** moveFace：持久面引用沿外法向偏移（正外扩/负内缩）。 */
export interface LiveMoveFaceStep {
  kind: 'moveFace';
  name: string;
  faces: LiveFaceSelector[];
  /** 单一距离广播到全部面（与 distancesMm 恰一）。 */
  distanceMm?: number;
  /** 逐面距离（与 distanceMm 恰一）。 */
  distancesMm?: number[];
  /** 多 body 时显式目标 body（该前序特征创建的 body）。 */
  targetBodyFeatureName?: string;
  note?: string;
}

/** splitPart：世界基准平面单侧切割（产品首切片，双侧/面驱动未接）。 */
export interface LiveSplitPartStep {
  kind: 'splitPart';
  name: string;
  plane: 'XY' | 'YZ' | 'XZ';
  offsetMm?: number;
  keepSide: 'positive' | 'negative';
  /** 多 body 时显式目标 body（该前序特征创建的 body）。 */
  targetBodyFeatureName?: string;
  note?: string;
}

export interface LiveBooleanBodiesStep {
  kind: 'booleanBodies';
  name: string;
  operation: 'unite' | 'subtract' | 'intersect';
  /** 前序特征名，每个特征须恰创建一个 body。 */
  targetBodyFeatureNames: string[];
  toolBodyFeatureNames: string[];
  keepTools?: boolean;
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
  | LiveCPlaneStep
  | LiveSketchStep
  | LiveExtrudeStep
  | LiveRevolveStep
  | LiveLoftStep
  | LiveSweepStep
  | LiveHoleStep
  | LiveFeatureMirrorStep
  | LiveFeaturePatternStep
  | LiveFilletStep
  | LiveChamferStep
  | LiveShellStep
  | LiveFaceExtrudeStep
  | LiveMoveFaceStep
  | LiveSplitPartStep
  | LiveBooleanBodiesStep
  | LiveTransformStep
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
