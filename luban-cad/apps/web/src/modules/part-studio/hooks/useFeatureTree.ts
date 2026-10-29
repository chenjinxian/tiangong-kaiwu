/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useFeatureTree（M3 Task 5；M4 Task 6 真数据源接线）：双段树视图模型的唯一
 * 出口。M4-T6 起特征段数据源 = useFeatureSystem.tree（FeatureTreeEntry[] 直通，
 * 本 hook 映射为视图模型行）——
 * - 条目 → 行映射：同 featureType 按 orderKey 序自增命名（「拉伸 1/拉伸 2」，
 *   类型标签走 partStudio.tree.featureTypes.* 词库，未知类型回退原始值——
 *   诚实呈现）；status ≠ 0 → hasError（旧应用 FeaturePanel 同语义）；
 *   suppressed → isSuppressed；isHidden 恒 false（隐藏属会话态，见下）；
 * - 行状态叠加：画布隐藏集 store.canvas.hiddenIds 叠到节点 isHidden 上
 *   （画布「隐藏」与 :hidden 筛选同源）；
 * - 可选语法筛选（TreeFilter 解析产物 TreeFilterQuery 进入，matchFeature/
 *   matchPart 逐行判定）；
 * - store 绑定：选中/展开读写 store.tree（selector 粒度订阅）。
 *
 * 零件段仍由消费方注入（FeatureTree 内部 iModel 物理元素查询的产物）。
 * 壳期「假 Part 1 / 暂无特征即空集」占位随真数据源接线移除（M3 终审
 * T5-②③ 收口）——空集即渲染 empty 态，不再伪造数据行。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { FeatureNode, PartNode } from '../types.js';
import type { TreeFilterQuery } from '../tree/TreeFilter.js';
import { matchFeature, matchPart } from '../tree/TreeFilter.js';

/** useFeatureTree 入参（数据注入口径）。 */
export interface UseFeatureTreeOptions {
  /**
   * 特征段原始条目（useFeatureSystem.tree 直通；缺省空集——empty 态，
   * 壳期占位已随 M4-T6 真数据源接线移除）。
   */
  entries?: readonly FeatureTreeEntry[];
  /** 零件段数据（iModel 物理元素查询产物注入；缺省空集）。 */
  parts?: readonly PartNode[];
  /** 语法筛选（TreeFilter 解析产物；缺省全量）。 */
  filter?: TreeFilterQuery;
}

/** 双段树视图模型。 */
export interface FeatureTreeModel {
  /** 特征段行（已映射 + 已叠加隐藏集 + 已过滤）。 */
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

/**
 * FeatureTreeEntry[] → FeatureNode[] 视图模型映射：orderKey 升序（后端已序，
 * 防御性再排——旧应用 FeaturePanel 同纪律）+ 同类型序号自增命名。
 */
export function mapFeatureEntries(
  entries: readonly FeatureTreeEntry[],
  typeLabel: (featureType: string) => string,
): FeatureNode[] {
  const perTypeCounter = new Map<string, number>();
  return [...entries]
    .sort((a, b) => a.orderKey - b.orderKey)
    .map((entry) => {
      const seq = (perTypeCounter.get(entry.featureType) ?? 0) + 1;
      perTypeCounter.set(entry.featureType, seq);
      return {
        id: entry.id,
        name: `${typeLabel(entry.featureType)} ${seq}`,
        type: entry.featureType,
        hasError: entry.status !== 0,
        isSuppressed: entry.suppressed,
        isHidden: false,
      };
    });
}

export function useFeatureTree({ entries, parts, filter }: UseFeatureTreeOptions = {}): FeatureTreeModel {
  const { t } = useTranslation();
  const selectedNodeIds = usePartStudioStore((s) => s.tree.selectedNodeIds);
  const expandedNodeIds = usePartStudioStore((s) => s.tree.expandedNodeIds);
  const selectNodes = usePartStudioStore((s) => s.setSelectedNodeIds);
  const toggleExpanded = usePartStudioStore((s) => s.toggleNodeExpanded);
  // 画布隐藏集叠加（:hidden 与行淡显的数据源之一）。
  const hiddenIds = usePartStudioStore((s) => s.canvas.hiddenIds);

  // 类型标签运行时解析（语言切换即生效；未知类型回退原始 featureType——
  // 诚实呈现，旧应用 FeaturePanel.getFeatureTypeLabel 同口径）。
  const typeLabel = React.useCallback(
    (featureType: string): string => {
      const key = `partStudio.tree.featureTypes.${featureType}`;
      const label = t(key);
      return label === key ? featureType : label;
    },
    [t],
  );

  const hiddenSet = React.useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const applyHidden = React.useCallback(
    <T extends { id: string; isHidden: boolean }>(node: T): T =>
      hiddenSet.has(node.id) && !node.isHidden ? { ...node, isHidden: true } : node,
    [hiddenSet],
  );

  const featureRows = React.useMemo(() => {
    const rows = mapFeatureEntries(entries ?? [], typeLabel).map(applyHidden);
    return filter ? rows.filter((node) => matchFeature(node, filter)) : rows;
  }, [entries, typeLabel, hiddenSet, filter, applyHidden]);

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
