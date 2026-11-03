/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 特征树类型图标（2026-11-02 Onshape 对齐）：工具栏同一套 Onshape SVG symbol
 * （ribbon-registry 的 id → icon 映射），不在树里建第二套图标库。part 行用
 * Onshape part 图标；未知特征类型回退 add-feature-type。
 */
import React from 'react';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { OnshapeIconName } from '../icons/onshape-icons.js';
import { onshapeIconFor } from '../ribbon/ribbon-registry.js';
import type { TreeNode } from './TreeRow.js';

/** 特征类型 → ribbon toolId（Onshape 树类型图标语义；一个工具家族共享字形）。 */
const FEATURE_TOOL_IDS: Readonly<Record<string, string>> = {
  sketch: 'newSketch',
  extrude: 'extrude',
  revolve: 'revolve',
  loft: 'loft',
  sweep: 'SweepFaces',
  fillet: 'RoundEdges',
  chamfer: 'ChamferEdges',
  shell: 'HollowFaces',
  mirror: 'MirrorElements',
  pattern: 'LinearPattern',
  booleanAdd: 'booleanBodies',
  booleanSubtract: 'booleanBodies',
  booleanBodies: 'booleanBodies',
  hole: 'CreateHole',
  thread: 'externalThread',
  thicken: 'thicken',
  draft: 'DraftFaces',
  split: 'splitPart',
  transform: 'transform',
};

function iconFor(featureType: string | undefined): OnshapeIconName {
  if (!featureType) return 'part';
  const toolId = FEATURE_TOOL_IDS[featureType] ?? featureType;
  return onshapeIconFor(toolId) ?? 'add-feature-type';
}

export function FeatureTypeIcon({ node }: { node: TreeNode }): React.JSX.Element {
  const featureType = 'type' in node ? node.type : undefined;
  return (
    <span className="part-studio-tree-row__icon" aria-hidden="true">
      <OnshapeIcon name={iconFor(featureType)} size={16} />
    </span>
  );
}
