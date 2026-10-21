/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioSidebar（M3 Task 3 壳；T5 交接待定树数据；T6 接管编辑路由）：
 * 编辑器左栏（对齐 os-11）——窄图标条（工具类别占位槽：特征/零件/装配体/
 * 导入；T4 ribbon 接管类别联动，壳期本地选中态）+ 双段树面板（T5 起整树交
 * FeatureTree：筛选框 + 特征/零件双段 + 行右键 + 树↔画布联动；段头收起/
 * 活动段写 store 等行为随组件迁移，T3 结构断言的 testid/可访问名不变式由
 * FeatureTree 保留）。
 *
 * T6：树上「编辑…」路由接 FeatureDialog——onEdit 写 store.dialog（画布内联
 * 非模态面板宿主在 PartStudioCanvas）；特征段节点带 type（路由 tools.run
 * 的目标 featureType），零件段缺省空串。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import {
  SvgCopy,
  SvgFolderImport,
  SvgHierarchyTree,
  SvgModel,
} from '@itwin/itwinui-icons-react';
import { FeatureTree } from '../tree/FeatureTree.js';
import type { TreeNode } from '../tree/TreeRow.js';
import { usePartStudioStore } from '../stores/part-studio.store.js';

/** 图标条类别槽（壳期占位；labelKey 指向 partStudio.sidebar.rail.*）。 */
const RAIL_ITEMS = [
  { id: 'features', labelKey: 'partStudio.sidebar.rail.features', icon: <SvgHierarchyTree key="icon" /> },
  { id: 'parts', labelKey: 'partStudio.sidebar.rail.parts', icon: <SvgModel key="icon" /> },
  { id: 'assemblies', labelKey: 'partStudio.sidebar.rail.assemblies', icon: <SvgCopy key="icon" /> },
  { id: 'import', labelKey: 'partStudio.sidebar.rail.import', icon: <SvgFolderImport key="icon" /> },
] as const;

export function PartStudioSidebar(): React.JSX.Element {
  const { t } = useTranslation();
  // 图标条选中态：壳期本地态（类别槽尚未接 ribbon；T4 起与工具类别联动）。
  const [activeRail, setActiveRail] = React.useState<string>('features');
  const openFeatureDialog = usePartStudioStore((s) => s.openFeatureDialog);

  // T6：树上「编辑…」→ FeatureDialog（store.dialog 寻址，画布内联渲染）。
  const handleEdit = React.useCallback(
    (node: TreeNode) => {
      openFeatureDialog({
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

      {/* 双段树（T5 起整树交 FeatureTree；数据经 props 注入，壳期空集占位）。 */}
      <FeatureTree onEdit={handleEdit} />
    </aside>
  );
}
