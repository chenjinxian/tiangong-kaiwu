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
  /** 透传给产品的其它 extrude 字段（symmetric/direction/...）。 */
  extraParams?: Record<string, unknown>;
  note?: string;
}

export interface LiveSkippedStep {
  kind: 'skipped';
  name: string;
  reason: string;
}

export type LiveStep = LiveSketchStep | LiveExtrudeStep | LiveSkippedStep;

export interface LiveSpec {
  schemaVersion: 1;
  id: string;
  title: string;
  status: 'approx' | 'exact' | 'blocked';
  imodelName: string;
  source: LiveSource;
  copy?: LiveCopy;
  steps: LiveStep[];
  expected?: {
    bodyCount?: number;
    volumeMm3?: number;
    /** 相对容差；live 首切片建议 0.02。 */
    tolerance?: number;
  };
  evidence?: string[];
  notes?: string[];
}
