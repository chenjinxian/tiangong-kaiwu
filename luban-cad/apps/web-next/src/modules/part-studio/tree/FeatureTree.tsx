/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureTree（M3 Task 5）：双段树（特征 + 零件，对齐 os-11 左栏）——
 * - 顶部 TreeFilter 语法筛选框（os-20 文本对齐）；
 * - 特征段/零件段：段头按钮（点击写 store.tree.activeTab + 幂等收起，aria-expanded
 *   反映）+ 段头计数（os-11「特征 (17)」）+ 行列表；
 * - 行（TreeRow）：名称 + 错误红显 + 抑制斜体 + 隐藏淡显；行点击选中（树→画布
 *   emphasize 联动的数据源），行右键菜单（os-15 子集：重命名/编辑…/抑制/
 *   删除 HITL）；
 * - T6 草图模式：活动草图行红显（os-30 树红显进行中草图，store.sketch 驱动
 *   传 TreeRow sketchActive）；
 * - 数据由 props 注入（useFeatureTree 派生；壳期空集回退占位「暂无特征 /
 *   Part 1」，T3 结构断言兼容）；变异出口为回调（onRename/onEdit/onSuppress/
 *   onDelete——RPC/react-query 变异层后续接线，壳期缺省 console.warn）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SvgChevronDown, SvgChevronRight } from '@itwin/itwinui-icons-react';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import { useFeatureTree } from '../hooks/useFeatureTree.js';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import type { FeatureNode, PartNode, TreeTab } from '../types.js';
import { TreeFilter, parseTreeFilter } from './TreeFilter.js';
import type { TreeNode } from './TreeRow.js';
import { TreeRow } from './TreeRow.js';

export interface FeatureTreeProps {
  /** 特征段数据（缺省空集——壳期占位）。 */
  features?: readonly FeatureNode[];
  /** 零件段数据（缺省空集——壳期占位）。 */
  parts?: readonly PartNode[];
  /** 重命名提交（壳期缺省 console.warn；RPC 变异层接线后接管）。 */
  onRename?: (node: TreeNode, name: string) => void;
  /** 编辑特征/零件（T6 FeatureDialog 接线口）。 */
  onEdit?: (node: TreeNode) => void;
  /** 抑制/取消抑制（特征段专属菜单项）。 */
  onSuppress?: (node: FeatureNode, suppressed: boolean) => void;
  /** 删除提交（HITL 确认后调用；后端删除接线后接管）。 */
  onDelete?: (node: TreeNode) => void;
}

interface MenuState {
  x: number;
  y: number;
  node: TreeNode;
}

/** 双段配置（id 即 store TreeTab；labelKey 指向 partStudio.sidebar.tree.*）。 */
const TREE_SECTIONS: { id: TreeTab; labelKey: string; testidPrefix: string }[] = [
  { id: 'features', labelKey: 'partStudio.sidebar.tree.features', testidPrefix: 'part-studio-feature' },
  { id: 'parts', labelKey: 'partStudio.sidebar.tree.parts', testidPrefix: 'part-studio-part' },
];

export function FeatureTree({
  features,
  parts,
  onRename,
  onEdit,
  onSuppress,
  onDelete,
}: FeatureTreeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [filterInput, setFilterInput] = React.useState('');
  const filter = React.useMemo(() => parseTreeFilter(filterInput), [filterInput]);
  const model = useFeatureTree({ features, parts, filter });
  // 树→画布 emphasize 联动（hook 内 effect：selectedNodeIds → viewport）。
  useCanvasSelection();
  // T6 草图模式：活动草图行红显（os-30 树红显进行中草图）。
  const sketchActive = usePartStudioStore((s) => s.sketch.isActive);
  const activeSketchId = usePartStudioStore((s) => s.sketch.activeSketchId);

  const [collapsed, setCollapsed] = React.useState<Record<TreeTab, boolean>>({
    features: false,
    parts: false,
  });
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<TreeNode | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // 菜单开合：外部 mousedown / Escape 收合（画布菜单同口径）。
  React.useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  const setActiveTreeTab = usePartStudioStore((s) => s.setActiveTreeTab);

  const handleSectionHeader = React.useCallback(
    (tab: TreeTab) => {
      setActiveTreeTab(tab);
      setCollapsed((prev) => ({ ...prev, [tab]: !prev[tab] }));
    },
    [setActiveTreeTab],
  );

  const handleRowContextMenu = React.useCallback(
    (node: TreeNode, event: React.MouseEvent) => {
      event.preventDefault();
      // 右键即选中（os-15：右键行先成选中态再弹菜单）。
      model.selectNodes([node.id]);
      setMenu({ x: event.clientX, y: event.clientY, node });
    },
    [model],
  );

  const handleRename = React.useCallback(
    (node: TreeNode, name: string) => {
      setEditingId(null);
      if (onRename) {
        onRename(node, name);
      } else {
        console.warn(`[part-studio] 重命名 ${node.name} → ${name}（onRename 未接线）`);
      }
    },
    [onRename],
  );

  const isFeatureNode = (node: TreeNode): node is FeatureNode => 'isSuppressed' in node;

  const renderRow = (node: TreeNode): React.JSX.Element => (
    <TreeRow
      key={node.id}
      node={node}
      selected={model.selectedNodeIds.includes(node.id)}
      sketchActive={sketchActive && activeSketchId === node.id}
      onSelect={(n) => model.selectNodes([n.id])}
      onContextMenu={handleRowContextMenu}
      editing={editingId === node.id}
      onCommitRename={handleRename}
      onCancelRename={() => setEditingId(null)}
    />
  );

  return (
    <div className="part-studio-tree" data-testid="part-studio-tree">
      <TreeFilter value={filterInput} onChange={setFilterInput} />

      {TREE_SECTIONS.map((section) => {
        const isCollapsed = collapsed[section.id];
        const isFeatures = section.id === 'features';
        const rows = isFeatures ? model.featureRows : model.partRows;
        return (
          <section key={section.id} className="part-studio-tree__section">
            <div className="part-studio-tree__section-header-row">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                className="part-studio-tree__section-header"
                onClick={() => handleSectionHeader(section.id)}
              >
                {isCollapsed ? <SvgChevronRight /> : <SvgChevronDown />}
                <span>{t(section.labelKey)}</span>
              </button>
              <span
                className="part-studio-tree__count"
                data-testid={`${section.testidPrefix}-count`}
              >
                ({rows.length})
              </span>
            </div>
            {!isCollapsed && isFeatures && (
              <ul className="part-studio-tree__list" data-testid="part-studio-feature-list">
                {rows.length === 0 && filterInput === '' ? (
                  <li className="part-studio-tree__empty">{t('partStudio.sidebar.tree.emptyFeatures')}</li>
                ) : (
                  (rows as readonly FeatureNode[]).map(renderRow)
                )}
              </ul>
            )}
            {!isCollapsed && !isFeatures && (
              <ul className="part-studio-tree__list" data-testid="part-studio-part-list">
                {rows.length === 0 && filterInput === '' ? (
                  <li className="part-studio-tree__part">{t('partStudio.sidebar.tree.defaultPart')}</li>
                ) : (
                  (rows as readonly PartNode[]).map(renderRow)
                )}
              </ul>
            )}
          </section>
        );
      })}

      {/* 行右键菜单（os-15 子集：重命名/编辑…/抑制/删除）。 */}
      {menu && (
        <div
          className="part-studio-tree-menu"
          role="menu"
          aria-label={t('partStudio.tree.contextMenuLabel')}
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            onClick={() => {
              setMenu(null);
              setEditingId(menu.node.id);
            }}
          >
            {t('partStudio.tree.rename')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item"
            onClick={() => {
              setMenu(null);
              if (onEdit) {
                onEdit(menu.node);
              } else {
                console.warn(`[part-studio] 编辑 ${menu.node.name}（onEdit 未接线）`);
              }
            }}
          >
            {t('partStudio.tree.edit')}
          </button>
          {isFeatureNode(menu.node) && (
            <button
              type="button"
              role="menuitem"
              className="part-studio-tree-menu__item"
              onClick={() => {
                const node = menu.node;
                setMenu(null);
                if (isFeatureNode(node)) {
                  if (onSuppress) {
                    onSuppress(node, !node.isSuppressed);
                  } else {
                    console.warn(`[part-studio] ${node.isSuppressed ? '取消抑制' : '抑制'} ${node.name}（onSuppress 未接线）`);
                  }
                }
              }}
            >
              {'isSuppressed' in menu.node && menu.node.isSuppressed
                ? t('partStudio.tree.unsuppress')
                : t('partStudio.tree.suppress')}
            </button>
          )}
          <div className="part-studio-tree-menu__separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="part-studio-tree-menu__item part-studio-tree-menu__item--danger"
            onClick={() => {
              setPendingDelete(menu.node);
              setMenu(null);
            }}
          >
            {t('partStudio.tree.delete')}
          </button>
        </div>
      )}

      {/* 删除 HITL 确认（预览=目标具名提示；确认后才提交 onDelete）。 */}
      {pendingDelete && (
        <div className="part-studio-dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('partStudio.tree.deleteTitle', { name: pendingDelete.name })}
            className="part-studio-capability-dialog"
          >
            <h2 className="part-studio-capability-dialog__title">
              {t('partStudio.tree.deleteTitle', { name: pendingDelete.name })}
            </h2>
            <p className="part-studio-capability-dialog__message">
              {t('partStudio.tree.deleteMessage', { name: pendingDelete.name })}
            </p>
            <div className="part-studio-capability-dialog__actions part-studio-capability-dialog__actions--split">
              <button
                type="button"
                className="part-studio-capability-dialog__secondary"
                onClick={() => setPendingDelete(null)}
              >
                {t('partStudio.tree.cancel')}
              </button>
              <button
                type="button"
                className="part-studio-capability-dialog__danger"
                onClick={() => {
                  const node = pendingDelete;
                  setPendingDelete(null);
                  if (onDelete) {
                    onDelete(node);
                  } else {
                    console.warn(`[part-studio] 删除 ${node.name}（onDelete 未接线）`);
                  }
                }}
              >
                {t('partStudio.tree.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
