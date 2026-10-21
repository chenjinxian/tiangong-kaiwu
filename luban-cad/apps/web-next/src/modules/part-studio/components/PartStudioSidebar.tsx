/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioSidebar（M3 Task 3）：编辑器左栏（对齐 os-11）——
 * - 窄图标条（工具类别占位槽：特征/零件/装配体/导入；T4 ribbon 接管类别
 *   联动，壳期本地选中态）；
 * - 双段树面板：特征段 / 零件段（os-11 左栏 IA）——段头按钮点击写 store
 *   tree.activeTab 并幂等收起/展开该段（aria-expanded 反映）；段内容壳期
 *   占位（特征段空态文案、零件段默认 Part 1），树数据/行交互 T4+ 接管。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import {
  SvgChevronDown,
  SvgChevronRight,
  SvgCopy,
  SvgFolderImport,
  SvgHierarchyTree,
  SvgModel,
} from '@itwin/itwinui-icons-react';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import type { TreeTab } from '../types.js';

/** 图标条类别槽（壳期占位；labelKey 指向 partStudio.sidebar.rail.*）。 */
const RAIL_ITEMS = [
  { id: 'features', labelKey: 'partStudio.sidebar.rail.features', icon: <SvgHierarchyTree key="icon" /> },
  { id: 'parts', labelKey: 'partStudio.sidebar.rail.parts', icon: <SvgModel key="icon" /> },
  { id: 'assemblies', labelKey: 'partStudio.sidebar.rail.assemblies', icon: <SvgCopy key="icon" /> },
  { id: 'import', labelKey: 'partStudio.sidebar.rail.import', icon: <SvgFolderImport key="icon" /> },
] as const;

/** 双段树段配置（id 即 store TreeTab；labelKey 指向 partStudio.sidebar.tree.*）。 */
const TREE_SECTIONS: { id: TreeTab; labelKey: string }[] = [
  { id: 'features', labelKey: 'partStudio.sidebar.tree.features' },
  { id: 'parts', labelKey: 'partStudio.sidebar.tree.parts' },
];

export function PartStudioSidebar(): React.JSX.Element {
  const { t } = useTranslation();
  // 读侧在 T4（树内容按活动段渲染）；T3 壳期段头点击只写 activeTab + 本地收起。
  const setActiveTreeTab = usePartStudioStore((s) => s.setActiveTreeTab);
  // 图标条选中态：壳期本地态（类别槽尚未接 ribbon；T4 起与工具类别联动）。
  const [activeRail, setActiveRail] = React.useState<string>('features');
  // 双段收起态：本地态（幂等翻转）；aria-expanded = !collapsed[id]。
  const [collapsed, setCollapsed] = React.useState<Record<TreeTab, boolean>>({
    features: false,
    parts: false,
  });

  const handleSectionHeader = React.useCallback(
    (tab: TreeTab) => {
      setActiveTreeTab(tab);
      setCollapsed((prev) => ({ ...prev, [tab]: !prev[tab] }));
    },
    [setActiveTreeTab],
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

      {/* 双段树：特征段 / 零件段（os-11 左栏） */}
      <div className="part-studio-tree" data-testid="part-studio-tree">
        {TREE_SECTIONS.map((section) => {
          const isCollapsed = collapsed[section.id];
          return (
            <section key={section.id} className="part-studio-tree__section">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                className="part-studio-tree__section-header"
                onClick={() => handleSectionHeader(section.id)}
              >
                {isCollapsed ? <SvgChevronRight /> : <SvgChevronDown />}
                <span>{t(section.labelKey)}</span>
              </button>
              {!isCollapsed && section.id === 'features' && (
                <ul className="part-studio-tree__list" data-testid="part-studio-feature-list">
                  {/* 树数据 T4+ 接管；壳期空态占位（零布局跳动：ul 常渲染）。 */}
                  <li className="part-studio-tree__empty">{t('partStudio.sidebar.tree.emptyFeatures')}</li>
                </ul>
              )}
              {!isCollapsed && section.id === 'parts' && (
                <ul className="part-studio-tree__list" data-testid="part-studio-part-list">
                  <li className="part-studio-tree__part">{t('partStudio.sidebar.tree.defaultPart')}</li>
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
