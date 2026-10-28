/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioSidebar（M3 Task 3 壳；T5 交接待定树数据；T6 接管编辑路由；
 * M4-T6 真数据源接线）：编辑器左栏（对齐 os-11）——窄图标条（工具类别占位
 * 槽：特征/零件/装配体/导入；T4 ribbon 接管类别联动，壳期本地选中态）+
 * 双段树面板（T5 起整树交 FeatureTree：筛选框 + 特征/零件双段 + 行右键 +
 * 树↔画布联动；段头收起/活动段写 store 等行为随组件迁移，T3 结构断言的
 * testid/可访问名不变式由 FeatureTree 保留）。
 *
 * M4-T6：特征段数据源 = Session useFeatureSystem.tree 直通（entries/loading/
 * error/onRetry 透传 FeatureTree，六态完备）；connection 下传供零件段 iModel
 * 物理元素查询；树上「编辑…」路由接 FeatureDialog——onEdit 写 store.dialog
 * （画布内联非模态面板宿主在 PartStudioCanvas，edit 模式 featureId 即宿主
 * 重挂 key）；零件段节点缺省 type 空串。
 *
 * B6 M-A5 T2：树变异接线——applyOp（Session useFeatureSystem 直通）承载真
 * 删除/抑制 op（特征删除带 targetBodyId、抑制带 suppressed），成功/失败经
 * IModelApp.notifications toast（与保存/推送错误面同管道）；canEdit 总门在
 * 此处防御性拒收（FeatureTree 另持同一门做菜单禁用）。树不乐观改——refresh
 * 由 applyOp 内部 onCommitted 触发。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import {
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
} from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import type { BodyInfo, FeatureOp, FeatureOpResult, FeatureTreeEntry } from '@luban-cad/shared';
import {
  SvgCopy,
  SvgFolderImport,
  SvgHierarchyTree,
  SvgModel,
} from '@itwin/itwinui-icons-react';
import { FeatureTree } from '../tree/FeatureTree.js';
import type { TreeNode } from '../tree/TreeRow.js';
import type { FeatureNode } from '../types.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

export interface PartStudioSidebarProps {
  /** 特征段原始条目（Session useFeatureSystem.tree 直通；缺省空集）。 */
  entries?: readonly FeatureTreeEntry[];
  /** 特征段加载中（useFeatureSystem.loading 透传）。 */
  loading?: boolean;
  /** 特征段加载失败文案（useFeatureSystem.error 透传）。 */
  error?: string;
  /** 特征段错误重试（useFeatureSystem.refresh 直通）。 */
  onRetry?: () => void;
  /** 连接（legacy 零件段物理元素查询数据源；body 读面不可用时回退）。 */
  connection?: BriefcaseConnection;
  /** B6 M-A3.2a：body 读面（仅连接成功读过 getBodies 时下传；undefined=legacy 回退）。 */
  bodies?: readonly BodyInfo[];
  /** body 读面加载中（零件段骨架）。 */
  bodiesLoading?: boolean;
  /** body 读面失败（初次失败可见错误+重试；已加载后刷新失败就地错误条）。 */
  bodiesError?: string;
  /** 视口（I3：consumed 隐藏 effect 依赖真 viewport，晚到/重建须重跑）。 */
  viewport?: ScreenViewport;
  /**
   * B6 M-A5 T2：特征 op 提交面（Session useFeatureSystem.applyOp 直通）——
   * 树删除/抑制的真 op 通道（成功失败 toast 归本组件；不乐观改树，刷新由
   * applyOp 内部 onCommitted 触发）。缺省=未接线（console.warn 兜底）。
   */
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /**
   * B6 M-A5 T2：编辑面总门（canEdit 单点合流）。false 时本组件 handlers 防御性
   * 拒收（不发 applyOp）；FeatureTree 侧另以同一门禁用删除/抑制菜单项。
   * 缺省 true（测试/壳期语义；生产宿主恒显式传参）。
   */
  canEdit?: boolean;
}

/** 图标条类别槽（壳期占位；labelKey 指向 partStudio.sidebar.rail.*）。 */
const RAIL_ITEMS = [
  { id: 'features', labelKey: 'partStudio.sidebar.rail.features', icon: <SvgHierarchyTree key="icon" /> },
  { id: 'parts', labelKey: 'partStudio.sidebar.rail.parts', icon: <SvgModel key="icon" /> },
  { id: 'assemblies', labelKey: 'partStudio.sidebar.rail.assemblies', icon: <SvgCopy key="icon" /> },
  { id: 'import', labelKey: 'partStudio.sidebar.rail.import', icon: <SvgFolderImport key="icon" /> },
] as const;

export function PartStudioSidebar({
  entries,
  loading,
  error,
  onRetry,
  connection,
  bodies,
  bodiesLoading,
  bodiesError,
  viewport,
  applyOp,
  canEdit = true,
}: PartStudioSidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  // 图标条选中态：壳期本地态（类别槽尚未接 ribbon；T4 起与工具类别联动）。
  const [activeRail, setActiveRail] = React.useState<string>('features');
  const openFeatureDialog = usePartStudioStore((s) => s.openFeatureDialog);

  // T6：树上「编辑…」→ FeatureDialog（store.dialog 寻址，画布内联渲染；
  // M4-T6 起 edit 模式——featureId 即宿主重挂 key，featureName/featureType
  // 供标题与后续 updateParams 路由）。
  const handleEdit = React.useCallback(
    (node: TreeNode) => {
      openFeatureDialog({
        mode: 'edit',
        featureId: node.id,
        featureName: node.name,
        featureType: 'type' in node ? node.type : '',
      });
    },
    [openFeatureDialog],
  );

  // B6 M-A5 T2：toast 通道（FeatureDialog/保存错误面同款 IModelApp.notifications）。
  const notify = React.useCallback(
    (priority: OutputMessagePriority, message: string) => {
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
    },
    [],
  );

  /**
   * 特征删除（HITL 已在 FeatureTree 确认）：真实 op 载荷 = deleteFeature，
   * targetBodyId 仅在映射存在时携带（N≤1 legacy 缺省）；成功/失败 toast，
   * 不乐观改树（refresh 归 applyOp 内 onCommitted）。canEdit=false 防御性拒收。
   */
  const handleDelete = React.useCallback(
    async (node: TreeNode, targetBodyId?: string): Promise<void> => {
      if (!canEdit) return;
      if (!applyOp) {
        console.warn(`[part-studio] 删除 ${node.name}（applyOp 未接线）`);
        return;
      }
      try {
        const result = await applyOp({
          kind: 'deleteFeature',
          featureId: node.id,
          ...(targetBodyId ? { targetBodyId } : {}),
        });
        if (result.ok) {
          notify(OutputMessagePriority.Success, t('partStudio.tree.deleteSuccess', { name: node.name }));
        } else {
          notify(OutputMessagePriority.Error, t('partStudio.tree.deleteFailed', { message: result.error }));
        }
      } catch (err) {
        notify(
          OutputMessagePriority.Error,
          t('partStudio.tree.deleteFailed', { message: err instanceof Error ? err.message : String(err) }),
        );
      }
    },
    [applyOp, canEdit, notify, t],
  );

  /**
   * 特征抑制/取消抑制：真实 op 载荷 = setFeatureSuppressed；toast 与删除同口径。
   * canEdit=false 防御性拒收（菜单项已在 FeatureTree 侧禁用）。
   */
  const handleSuppress = React.useCallback(
    async (node: FeatureNode, suppressed: boolean): Promise<void> => {
      if (!canEdit) return;
      if (!applyOp) {
        console.warn(`[part-studio] ${suppressed ? '抑制' : '取消抑制'} ${node.name}（applyOp 未接线）`);
        return;
      }
      try {
        const result = await applyOp({ kind: 'setFeatureSuppressed', featureId: node.id, suppressed });
        if (result.ok) {
          notify(OutputMessagePriority.Success, t('partStudio.tree.suppressSuccess', { name: node.name }));
        } else {
          notify(OutputMessagePriority.Error, t('partStudio.tree.suppressFailed', { message: result.error }));
        }
      } catch (err) {
        notify(
          OutputMessagePriority.Error,
          t('partStudio.tree.suppressFailed', { message: err instanceof Error ? err.message : String(err) }),
        );
      }
    },
    [applyOp, canEdit, notify, t],
  );

  return (
    <aside className="part-studio-sidebar" data-testid="part-studio-sidebar">
      {/* 窄图标条：工具类别槽（os-11 最左竖条） */}
      <nav
        className="part-studio-icon-rail"
        data-testid="part-studio-icon-rail"
        aria-label={t('partStudio.sidebar.railLabel')}
      >
        {RAIL_ITEMS.map((item) => (
          <IconButton
            key={item.id}
            label={t(item.labelKey)}
            styleType="borderless"
            aria-pressed={activeRail === item.id}
            className={
              activeRail === item.id
                ? 'part-studio-icon-rail__button part-studio-icon-rail__button--active'
                : 'part-studio-icon-rail__button'
            }
            onClick={() => setActiveRail(item.id)}
          >
            {item.icon}
          </IconButton>
        ))}
      </nav>

      {/* 双段树（T5 起整树交 FeatureTree；M4-T6 起真数据源经 props 直通）。 */}
      <FeatureTree
        entries={entries}
        loading={loading}
        error={error}
        onRetry={onRetry}
        connection={connection}
        bodies={bodies}
        bodiesLoading={bodiesLoading}
        bodiesError={bodiesError}
        viewport={viewport}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onSuppress={handleSuppress}
        canEdit={canEdit}
      />
    </aside>
  );
}
