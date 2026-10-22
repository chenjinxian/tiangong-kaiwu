/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureTree（M3 Task 5；M4 Task 6 真数据源 + 六态完备）：双段树（特征 +
 * 零件，对齐 os-11 左栏）——
 * - 顶部 TreeFilter 语法筛选框（os-20 文本对齐）；
 * - 特征段/零件段：段头按钮（点击写 store.tree.activeTab + 幂等收起，aria-expanded
 *   反映）+ 段头计数（os-11「特征 (17)」）+ 行列表；
 * - 六态完备（M4-T6 拉伸闭环的树刷新呈现面）：特征段 loading 骨架（Session
 *   useFeatureSystem.loading 透传）/ error 就地错误条 + 重试（refresh 直通）/
 *   empty（「暂无特征」）；零件段 loading / error / empty（「暂无零件」）；
 * - 零件段 = iModel 物理元素查询（`SELECT ECInstanceId, CodeValue FROM
 *   BisCore.GeometricElement3d` 经 connection.createQueryReader）——诚实呈现
 *   数量与名（CodeValue 缺失回退「未命名实体 {{id}}」），壳期「假 Part 1」
 *   占位随真数据源接线移除（M3 终审 T5-②③ 收口）；特征刷新（entries 引用
 *   变化）即重查（新特征落库 → 新实体出现）；
 * - 行（TreeRow）：名称 + 错误红显 + 抑制斜体 + 隐藏淡显；行点击选中（树→画布
 *   emphasize 联动的数据源），行右键菜单（os-15 子集：重命名/编辑…/抑制/
 *   删除 HITL，每项左置图标——os-15 V20，M4-T8 D5 收口）；
 * - 特征段头三工具钮（os-11 段头形态；M4-T8 D3 收口）：插入元素/暂停重建/
 *   特征历史——完整 UI 面铁律（照常渲染可点），均无后端面，登记 gated →
 *   能力引导对话框（capabilities.ts 单一真源；full 翻转后接真实路由）；
 * - T6 草图模式：活动草图行红显（os-30 树红显进行中草图，store.sketch 驱动
 *   传 TreeRow sketchActive）；
 * - 数据注入：entries（useFeatureSystem.tree 直通）经 useFeatureTree 映射；
 *   变异出口为回调（onRename/onEdit/onSuppress/onDelete——RPC 变异层接线面）；
 * - 菜单监听一次注册（M4-T8 收 M3 终审 T5-⑤ 同款：挂载期一次到位，menu 经
 *   ref 取用，不随每次右键重挂）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import {
  SvgAdd,
  SvgChevronDown,
  SvgChevronRight,
  SvgClock,
  SvgDelete,
  SvgEdit,
  SvgEditAll,
  SvgHideManuallySuppressed,
  SvgPause,
  SvgVisibilityShow,
} from '@itwin/itwinui-icons-react';
import { CapabilityDialog } from '../ribbon/Ribbon.js';
import { isGated } from '../internal/capabilities.js';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import { useFeatureTree } from '../hooks/useFeatureTree.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { FeatureNode, PartNode, TreeTab } from '../types.js';
import { TreeFilter, parseTreeFilter } from './TreeFilter.js';
import type { TreeNode } from './TreeRow.js';
import { TreeRow } from './TreeRow.js';

export interface FeatureTreeProps {
  /**
   * 特征段原始条目（Session useFeatureSystem.tree 直通；缺省空集——empty 态，
   * 壳期占位已随 M4-T6 真数据源接线移除）。
   */
  entries?: readonly FeatureTreeEntry[];
  /** 特征段加载中（useFeatureSystem.loading 透传——骨架行）。 */
  loading?: boolean;
  /** 特征段加载失败文案（useFeatureSystem.error 透传——就地错误条 + 重试）。 */
  error?: string;
  /** 特征段错误重试（useFeatureSystem.refresh 直通）。 */
  onRetry?: () => void;
  /**
   * 连接（零件段物理元素查询数据源；缺省=零件段 empty 态）。查询随特征刷新
   *（entries 引用变化）重跑——新特征落库产生的实体如实出现。
   */
  connection?: BriefcaseConnection;
  /** 重命名提交（缺省 console.warn；RPC 变异层接线后接管）。 */
  onRename?: (node: TreeNode, name: string) => void;
  /** 编辑特征/零件（FeatureDialog 宿主路由接口）。 */
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

/**
 * 特征段头三工具钮（os-11 段头形态；M4-T8 D3）：插入元素/暂停重建/特征
 * 历史——完整 UI 面铁律（照常渲染可点）；三者均无后端面，登记 gated →
 * 能力引导对话框（capabilities.ts 单一真源；翻转 gated→full 时此处零改动，
 * 真实动作在 handleSectionTool 的 full 分支接线）。
 */
const FEATURE_SECTION_TOOLS: { id: string; labelKey: string; capability: string; icon: React.ComponentType }[] = [
  { id: 'insert-elements', labelKey: 'partStudio.tree.insertElements', capability: 'insertElement', icon: SvgAdd },
  { id: 'pause-rebuild', labelKey: 'partStudio.tree.pauseRebuild', capability: 'pauseRebuild', icon: SvgPause },
  { id: 'feature-history', labelKey: 'partStudio.tree.featureHistory', capability: 'featureHistory', icon: SvgClock },
];

/**
 * 零件段物理元素查询（诚实呈现）：全量 GeometricElement3d 的 ECInstanceId +
 * CodeValue。查询失败不静默（就地错误条）；随特征刷新重跑（新实体出现）。
 */
function usePhysicalElements(connection: BriefcaseConnection | undefined, refreshToken: unknown): {
  parts: PartNode[];
  loading: boolean;
  error?: string;
} {
  const { t } = useTranslation();
  const [parts, setParts] = React.useState<PartNode[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!connection) {
      setParts([]);
      setLoading(false);
      setError(undefined);
      return undefined;
    }
    let disposed = false;
    setLoading(true);
    setError(undefined);
    void (async () => {
      try {
        const rows: PartNode[] = [];
        // 诚实呈现数量与名：物理元素全量行（id + CodeValue）。
        const reader = connection.createQueryReader(
          'SELECT ECInstanceId, CodeValue FROM BisCore.GeometricElement3d',
        );
        for await (const row of reader) {
          const id = String(row[0]);
          const codeValue = row[1];
          rows.push({
            id,
            name:
              typeof codeValue === 'string' && codeValue !== ''
                ? codeValue
                : t('partStudio.tree.unnamedElement', { id }),
            isHidden: false,
          });
        }
        if (!disposed) {
          setParts(rows);
          setLoading(false);
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      disposed = true;
    };
    // refreshToken=特征段条目引用：新特征落库 → 树刷新 → 零件段重查。
    //（web-next 未启用 exhaustive-deps 规则，依赖数组为手工口径，意图在此注记。）
  }, [connection, refreshToken, t]);

  return { parts, loading, error };
}

/** 段内加载骨架行（loading 态的统一呈现）。 */
function SkeletonRows(): React.JSX.Element {
  return (
    <li className="part-studio-tree__loading" data-testid="part-studio-tree-loading" role="status">
      <span className="part-studio-tree__loading-bar" aria-hidden="true" />
      <span className="part-studio-tree__loading-bar part-studio-tree__loading-bar--short" aria-hidden="true" />
    </li>
  );
}

export function FeatureTree({
  entries,
  loading,
  error,
  onRetry,
  connection,
  onRename,
  onEdit,
  onSuppress,
  onDelete,
}: FeatureTreeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [filterInput, setFilterInput] = React.useState('');
  const filter = React.useMemo(() => parseTreeFilter(filterInput), [filterInput]);
  // 零件段查询（随特征刷新重跑：entries 引用即 refreshToken）。
  const physical = usePhysicalElements(connection, entries);
  const model = useFeatureTree({ entries, parts: physical.parts, filter });
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
  // 段头三钮的 gated 引导对话框（D3：能力注册表路由的对话框状态）。
  const [gatedCapability, setGatedCapability] = React.useState<string | null>(null);

  // 菜单开合：外部 mousedown / Escape 收合（画布菜单同口径）。
  // M4-T8 收 M3 终审 T5-⑤（同款）：监听一次注册——挂载期一次到位，menu 经
  // ref 取用，不随每次右键（menu 对象重建）重挂一对监听。
  const menuRef = React.useRef<MenuState | null>(null);
  menuRef.current = menu;
  React.useEffect(() => {
    const close = () => {
      if (menuRef.current) setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
    // 监听终身一次挂载；闭包内一律走 ref（意图在此注记，非遗漏依赖）。
  }, []);

  const setActiveTreeTab = usePartStudioStore((s) => s.setActiveTreeTab);

  const handleSectionHeader = React.useCallback(
    (tab: TreeTab) => {
      setActiveTreeTab(tab);
      setCollapsed((prev) => ({ ...prev, [tab]: !prev[tab] }));
    },
    [setActiveTreeTab],
  );

  // 段头工具钮（D3）：能力注册表路由——gated → 能力引导对话框；full → 真实
  // 动作接线位（三者今日均 gated，full 分支诚实占位）。
  const handleSectionTool = React.useCallback((capability: string) => {
    if (isGated(capability)) {
      setGatedCapability(capability);
      return;
    }
    console.warn(`[part-studio] 段头工具 ${capability} 未接线（full 直行通道）`);
  }, []);

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

  /** 段内态行序：loading 骨架 → 就地错误条 → 行/empty（六态统一出口）。 */
  const renderSectionRows = (options: {
    loading: boolean;
    error?: string;
    rows: readonly TreeNode[];
    emptyText: string;
    retryable?: boolean;
  }): React.JSX.Element => {
    const { loading: sectionLoading, error: sectionError, rows, emptyText, retryable } = options;
    if (sectionLoading) return <SkeletonRows />;
    if (sectionError) {
      return (
        <li className="part-studio-tree__error" role="alert" data-testid="part-studio-tree-error">
          <span className="part-studio-tree__error-text">
            {t('partStudio.tree.loadFailed', { message: sectionError })}
          </span>
          {retryable && onRetry && (
            <button
              type="button"
              className="part-studio-tree__retry"
              onClick={onRetry}
            >
              {t('partStudio.tree.retry')}
            </button>
          )}
        </li>
      );
    }
    if (rows.length === 0 && filterInput === '') {
      return <li className="part-studio-tree__empty">{emptyText}</li>;
    }
    return <>{rows.map(renderRow)}</>;
  };

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
              {/* 特征段头三工具钮（os-11 段头形态；D3）：插入元素/暂停重建/特征历史。 */}
              {isFeatures && (
                <div
                  className="part-studio-tree__section-tools"
                  role="group"
                  aria-label={t('partStudio.tree.sectionToolsLabel')}
                >
                  {FEATURE_SECTION_TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <IconButton
                        key={tool.id}
                        size="small"
                        styleType="borderless"
                        label={t(tool.labelKey)}
                        data-testid={`part-studio-tree-tool-${tool.id}`}
                        onClick={() => handleSectionTool(tool.capability)}
                      >
                        <Icon />
                      </IconButton>
                    );
                  })}
                </div>
              )}
            </div>
            {!isCollapsed && (
              <ul className="part-studio-tree__list" data-testid={`part-studio-${section.id === 'features' ? 'feature' : 'part'}-list`}>
                {isFeatures
                  ? renderSectionRows({
                      loading: loading ?? false,
                      error,
                      rows,
                      emptyText: t('partStudio.sidebar.tree.emptyFeatures'),
                      retryable: true,
                    })
                  : renderSectionRows({
                      loading: physical.loading,
                      error: physical.error,
                      rows,
                      emptyText: t('partStudio.sidebar.tree.emptyParts'),
                    })}
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
            <span className="part-studio-menu-item-icon" aria-hidden="true"><SvgEdit /></span>
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
            <span className="part-studio-menu-item-icon" aria-hidden="true"><SvgEditAll /></span>
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
              <span className="part-studio-menu-item-icon" aria-hidden="true">
                {'isSuppressed' in menu.node && menu.node.isSuppressed
                  ? <SvgVisibilityShow />
                  : <SvgHideManuallySuppressed />}
              </span>
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
            <span className="part-studio-menu-item-icon" aria-hidden="true"><SvgDelete /></span>
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

      {/* 段头三钮 gated 引导对话框（D3：能力注册表路由的引导面）。 */}
      <CapabilityDialog capability={gatedCapability} onClose={() => setGatedCapability(null)} />
    </div>
  );
}
