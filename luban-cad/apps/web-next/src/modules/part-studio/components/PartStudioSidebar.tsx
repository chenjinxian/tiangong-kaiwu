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
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import {
  SvgCopy,
  SvgFolderImport,
  SvgHierarchyTree,
  SvgModel,
} from '@itwin/itwinui-icons-react';
import { FeatureTree } from '../tree/FeatureTree.js';
import type { TreeNode } from '../tree/TreeRow.js';
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
  /** 连接（零件段 iModel 物理元素查询数据源；缺省=零件段 empty 态）。 */
  connection?: BriefcaseConnection;
}

/** 图标条类别槽（壳期占位；labelKey 指向 partStudio.sidebar.rail.*）。 */
const RAIL_ITEMS = [
  { id: 'features', labelKey: 'partStudio.sidebar.rail.features', icon: <SvgHierarchyTree key="icon" /> },
  { id: 'parts', labelKey: 'partStudio.sidebar.rail.parts', icon: <SvgModel key="icon" /> },
  { id: 'assemblies', labelKey: 'partStudio.sidebar.rail.assemblies', icon: <SvgCopy key="icon" /> },
  { id: 'import', labelKey: 'partStudio.sidebar.rail.import', icon: <SvgFolderImport key="icon" /> },
] as const;

export function PartStudioSidebar({ entries, loading, error, onRetry, connection }: PartStudioSidebarProps): React.JSX.Element {
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
        onEdit={handleEdit}
      />
    </aside>
  );
}
