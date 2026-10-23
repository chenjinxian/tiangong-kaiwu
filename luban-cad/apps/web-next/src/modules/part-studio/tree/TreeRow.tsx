/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * TreeRow（M3 Task 5）：双段树行——名称呈现三态（os-11 采集对齐）：
 * - 错误红显（data-error，重生成失败的特征红色显示）；
 * - 抑制斜体（data-suppressed）；
 * - 隐藏淡显（data-hidden，画布隐藏集叠加后的有效态）。
 * T6 增：活动草图红显（data-sketch-active——os-30 草图模式树红显进行中草图；
 * store.sketch 驱动，FeatureTree 传入）。
 * M6-a T7 增：草图节点行图标（SvgDraw——iTwinUI 既有图标库中最贴近草图的
 * 铅笔/绘制形，采集的 Onshape 草图 SVG 复用评估归 M6-c UI 1:1 再校）+
 * 行双击路由（onDoubleClick——sketch 节点进草图模式，FeatureTree 裁决注入）。
 * 行点击选中（写 store.tree.selectedNodeIds → 画布 emphasize 联动）、行右键
 * 交 FeatureTree 弹菜单。重命名内联编辑态（editing）由 FeatureTree 驱动。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SvgDraw } from '@itwin/itwinui-icons-react';
import type { FeatureNode, PartNode } from '../types.js';

/** 树行节点（特征段 | 零件段并集口径）。 */
export type TreeNode = FeatureNode | PartNode;

/** M6-a T7：草图节点判型（特征段且 type='sketch'——图标/双击/菜单三路共用）。 */
export function isSketchNode(node: TreeNode): boolean {
  return 'type' in node && node.type === 'sketch';
}

export interface TreeRowProps {
  node: TreeNode;
  /** 选中态（store.tree.selectedNodeIds 含本行 id）。 */
  selected: boolean;
  /** 活动草图态（os-30：草图模式红显活动草图行；T6 增）。 */
  sketchActive?: boolean;
  /** 行点击（FeatureTree 写 store + 关菜单）。 */
  onSelect: (node: TreeRowProps['node']) => void;
  /** 行右键（FeatureTree 打开上下文菜单）。 */
  onContextMenu: (node: TreeRowProps['node'], event: React.MouseEvent) => void;
  /** 行双击（M6-a T7：sketch 节点进草图模式编辑；非 sketch 节点 FeatureTree 不注入）。 */
  onDoubleClick?: (node: TreeRowProps['node']) => void;
  /** 重命名内联编辑态（null=非编辑；初始值=当前名）。 */
  editing: boolean;
  onCommitRename: (node: TreeNode, name: string) => void;
  onCancelRename: () => void;
}

/** 节点有效隐藏态（data-hidden 呈现依据）。 */
export function isNodeHidden(node: TreeNode): boolean {
  return node.isHidden;
}

export function TreeRow({
  node,
  selected,
  sketchActive = false,
  onSelect,
  onContextMenu,
  onDoubleClick,
  editing,
  onCommitRename,
  onCancelRename,
}: TreeRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const suppressed = 'isSuppressed' in node && node.isSuppressed;
  const errored = 'hasError' in node && !!node.hasError;

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommitRename(node, event.currentTarget.value.trim());
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancelRename();
    }
  };

  const className = [
    'part-studio-tree-row',
    selected ? 'part-studio-tree-row--selected' : '',
    errored ? 'part-studio-tree-row--error' : '',
    suppressed ? 'part-studio-tree-row--suppressed' : '',
    isNodeHidden(node) ? 'part-studio-tree-row--hidden' : '',
    sketchActive ? 'part-studio-tree-row--sketch-active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          className="part-studio-tree-row__input"
          aria-label={t('partStudio.tree.rename')}
          defaultValue={node.name}
          onKeyDown={handleRenameKeyDown}
          onBlur={(event) => {
            const name = event.currentTarget.value.trim();
            if (name !== '' && name !== node.name) {
              onCommitRename(node, name);
            } else {
              onCancelRename();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={className}
          data-testid={`tree-row-${node.id}`}
          data-error={errored ? 'true' : undefined}
          data-suppressed={suppressed ? 'true' : undefined}
          data-hidden={isNodeHidden(node) ? 'true' : undefined}
          data-sketch-active={sketchActive ? 'true' : undefined}
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(node)}
          onContextMenu={(event) => onContextMenu(node, event)}
          onDoubleClick={onDoubleClick ? () => onDoubleClick(node) : undefined}
        >
          {/* M6-a T7：草图节点行图标（SvgDraw 占位；M6-c 按采集 SVG 再校）。 */}
          {isSketchNode(node) && (
            <span className="part-studio-tree-row__icon" aria-hidden="true">
              <SvgDraw />
            </span>
          )}
          <span className="part-studio-tree-row__name">{node.name}</span>
        </button>
      )}
    </li>
  );
}
