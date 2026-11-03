/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 左侧 40px 面板选择条（2026-11-02 Onshape live 对齐）：版本/历史、创建版本、
 * 评论、文档注释、使用处、性能、AI 顾问。历史/创建版本接现有能力；其余为
 * Onshape UI 占位（保留按钮与图标，不实现行为）。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { OnshapeIconName } from '../icons/onshape-icons.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

export interface PartStudioPanelRailProps {
  onSaveVersion?: () => void;
  canSaveVersion?: boolean;
}

interface RailItem {
  id: string;
  labelKey: string;
  icon: OnshapeIconName;
  enabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}

export function PartStudioPanelRail({ onSaveVersion, canSaveVersion = false }: PartStudioPanelRailProps): React.JSX.Element {
  const { t } = useTranslation();
  const activeTab = usePartStudioStore((s) => s.dock.activeTab);
  const isOpen = usePartStudioStore((s) => s.dock.isOpen);
  const setDockTab = usePartStudioStore((s) => s.setDockTab);
  const openDock = usePartStudioStore((s) => s.openDock);
  const closeDock = usePartStudioStore((s) => s.closeDock);

  const openHistory = React.useCallback(() => {
    if (activeTab === 'history' && isOpen) {
      closeDock();
      return;
    }
    setDockTab('history');
    openDock();
  }, [activeTab, isOpen, closeDock, setDockTab, openDock]);

  const items: RailItem[] = [
    {
      id: 'history',
      labelKey: 'partStudio.panelRail.history',
      icon: 'versions-history-panel',
      active: activeTab === 'history' && isOpen,
      onClick: openHistory,
    },
    {
      id: 'create-version',
      labelKey: 'partStudio.panelRail.createVersion',
      icon: 'create-version-button',
      enabled: canSaveVersion,
      onClick: onSaveVersion,
    },
    { id: 'comments', labelKey: 'partStudio.panelRail.comments', icon: 'comments-panel' },
    { id: 'notes', labelKey: 'partStudio.panelRail.notes', icon: 'notes-panel' },
    { id: 'where-used', labelKey: 'partStudio.panelRail.whereUsed', icon: 'where-used-upgrade' },
    { id: 'performance', labelKey: 'partStudio.panelRail.performance', icon: 'performance-panel' },
    { id: 'ai-advisor', labelKey: 'partStudio.panelRail.aiAdvisor', icon: 'onshape-ai-advisor-button' },
  ];

  return (
    <nav className="part-studio-panel-rail" data-testid="part-studio-panel-rail" aria-label={t('partStudio.panelRail.label')}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.active ? 'part-studio-panel-rail__button part-studio-panel-rail__button--active' : 'part-studio-panel-rail__button'}
          aria-label={t(item.labelKey)}
          title={t(item.labelKey)}
          disabled={item.enabled === false}
          onClick={item.onClick}
          data-testid={`part-studio-panel-rail-${item.id}`}
        >
          <OnshapeIcon name={item.icon} size={20} />
        </button>
      ))}
      <div className="part-studio-panel-rail__bottom">
        <button
          type="button"
          className="part-studio-panel-rail__button"
          aria-label={t('partStudio.tabManager.title')}
          title={t('partStudio.tabManager.title')}
          data-testid="part-studio-panel-rail-tab-manager"
        >
          <OnshapeIcon name="tab-manager" size={20} />
        </button>
      </div>
    </nav>
  );
}
