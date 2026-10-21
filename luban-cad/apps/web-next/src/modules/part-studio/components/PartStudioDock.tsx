/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioDock（M3 Task 3）：右侧停靠面板（沿用旧应用 EditorDockPanel 三类，
 * DockTab='toolSettings' | 'history' | 'display'）——
 * - 三页签条常驻（os-11 右缘条带）；点击页签写 store dock.activeTab 并展开
 *   占位内容，再点活动页签收合（toggleDock 语义）；
 * - 页签内容壳期占位（dock.placeholder），真实面板 T6+ 接管。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@itwin/itwinui-react';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import type { DockTab } from '../types.js';

/** 停靠页签在册（id 即 DockTab；labelKey 指向 partStudio.dock.tabs.*）。 */
const DOCK_TABS: { id: DockTab; labelKey: string }[] = [
  { id: 'toolSettings', labelKey: 'partStudio.dock.tabs.toolSettings' },
  { id: 'history', labelKey: 'partStudio.dock.tabs.history' },
  { id: 'display', labelKey: 'partStudio.dock.tabs.display' },
];

export function PartStudioDock(): React.JSX.Element {
  const { t } = useTranslation();
  const activeTab = usePartStudioStore((s) => s.dock.activeTab);
  const isOpen = usePartStudioStore((s) => s.dock.isOpen);
  const setDockTab = usePartStudioStore((s) => s.setDockTab);
  const openDock = usePartStudioStore((s) => s.openDock);
  const closeDock = usePartStudioStore((s) => s.closeDock);

  const handleTabClick = React.useCallback(
    (tab: DockTab) => {
      // Onshape 语义：点非活动页签→切换并展开；点活动页签→收合。
      if (tab === activeTab && isOpen) {
        closeDock();
        return;
      }
      setDockTab(tab);
      openDock();
    },
    [activeTab, isOpen, setDockTab, openDock, closeDock],
  );

  return (
    <aside className="part-studio-dock" data-testid="part-studio-dock">
      <div role="tablist" aria-orientation="vertical" className="part-studio-dock__tabs">
        {DOCK_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={
              activeTab === tab.id && isOpen
                ? 'part-studio-dock__tab part-studio-dock__tab--active'
                : 'part-studio-dock__tab'
            }
            onClick={() => handleTabClick(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {isOpen && (
        <div className="part-studio-dock__body" data-testid="part-studio-dock-body" role="tabpanel">
          {/* 壳期占位：工具设置/版本历史/显示设置真实面板 T6+ 接管。 */}
          <Text isMuted>{t('partStudio.dock.placeholder')}</Text>
        </div>
      )}
    </aside>
  );
}
