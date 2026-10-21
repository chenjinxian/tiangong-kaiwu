/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useFeatureTree（M3 Task 5）：双段树数据 hook——特征段 + 零件段视图模型
 * 的唯一出口。数据由消费方注入（壳期空集；RPC 接线后经 react-query 供给，
 * 服务端态禁拷贝进 store——spec §3），本 hook 只做派生：
 * - 行状态叠加：画布隐藏集 store.canvas.hiddenIds 叠到节点 isHidden 上
 *   （画布「隐藏」与 :hidden 筛选同源）；
 * - 可选语法筛选（TreeFilter 解析产物 TreeFilterQuery 进入，matchFeature/
 *   matchPart 逐行判定）；
 * - store 绑定：选中/展开读写 store.tree（selector 粒度订阅）。
 */

import React from 'react';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import type { FeatureNode, PartNode } from '../types.js';
import type { TreeFilterQuery } from '../tree/TreeFilter.js';
import { matchFeature, matchPart } from '../tree/TreeFilter.js';

/** useFeatureTree 入参（数据注入口径）。 */
export interface UseFeatureTreeOptions {
  /** 特征段数据（缺省空集——壳期占位）。 */
  features?: readonly FeatureNode[];
  /** 零件段数据（缺省空集——壳期占位）。 */
  parts?: readonly PartNode[];
  /** 语法筛选（TreeFilter 解析产物；缺省全量）。 */
  filter?: TreeFilterQuery;
}

/** 双段树视图模型。 */
export interface FeatureTreeModel {
  /** 特征段行（已叠加隐藏集 + 已过滤）。 */
  featureRows: readonly FeatureNode[];
  /** 零件段行（同口径）。 */
  partRows: readonly PartNode[];
  /** 段头计数（os-11「特征 (17)」；过滤后行数）。 */
  featureCount: number;
  partCount: number;
  /** 树选中集（store.tree.selectedNodeIds 只读镜像）。 */
  selectedNodeIds: readonly string[];
  /** 树选中写入（FeatureTree 行点击）。 */
  selectNodes: (nodeIds: readonly string[]) => void;
  /** 展开/收起折叠（store.tree.expandedNodeIds）。 */
  toggleExpanded: (nodeId: string) => void;
  expandedNodeIds: readonly string[];
}

export function useFeatureTree({ features, parts, filter }: UseFeatureTreeOptions = {}): FeatureTreeModel {
  const selectedNodeIds = usePartStudioStore((s) => s.tree.selectedNodeIds);
  const expandedNodeIds = usePartStudioStore((s) => s.tree.expandedNodeIds);
  const selectNodes = usePartStudioStore((s) => s.setSelectedNodeIds);
  const toggleExpanded = usePartStudioStore((s) => s.toggleNodeExpanded);
  // 画布隐藏集叠加（:hidden 与行淡显的数据源之一）。
  const hiddenIds = usePartStudioStore((s) => s.canvas.hiddenIds);

  const hiddenSet = React.useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const applyHidden = React.useCallback(
    <T extends { id: string; isHidden: boolean }>(node: T): T =>
      hiddenSet.has(node.id) && !node.isHidden ? { ...node, isHidden: true } : node,
    [hiddenSet],
  );

  const featureRows = React.useMemo(() => {
    const rows = (features ?? []).map(applyHidden);
    return filter ? rows.filter((node) => matchFeature(node, filter)) : rows;
  }, [features, hiddenSet, filter, applyHidden]);

  const partRows = React.useMemo(() => {
    const rows = (parts ?? []).map(applyHidden);
    return filter ? rows.filter((node) => matchPart(node, filter)) : rows;
  }, [parts, hiddenSet, filter, applyHidden]);

  return {
    featureRows,
    partRows,
    featureCount: featureRows.length,
    partCount: partRows.length,
    selectedNodeIds,
    selectNodes,
    toggleExpanded,
    expandedNodeIds,
  };
}
