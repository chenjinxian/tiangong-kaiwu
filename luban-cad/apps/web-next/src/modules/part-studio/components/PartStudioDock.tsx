/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioDock（M3 Task 3；M4 Task 7 版本历史真面板）：右侧停靠面板（沿用旧
 * 应用 EditorDockPanel 三类，DockTab='toolSettings' | 'history' | 'display'）——
 * - 三页签条常驻（os-11 右缘条带）；点击页签写 store dock.activeTab 并展开内容，
 *   再点活动页签收合（toggleDock 语义）；
 * - 版本历史页签（M4-T7 真数据）：changesets 官方 SDK 列表（index/描述/日期，
 *   useChangesets react-query 通道）+ 当前版本标记（connection.changeset.id
 *   比对）+「保存」钮（saveChanges 本地兜底，hasUnsavedChanges 徽标/门）+
 *   「推送」钮（宿主开共享 PushChangesetDialog——T4 评审 I-1 裁定的
 *   「保存→版本」收敛入口）；六态完备：loading 骨架 / error（就地错误条 +
 *   重试）/ empty（无 changeset = 初始版本语义）；面板随页签挂载（未开的
 *   占位页签不发起查询）；工具设置/显示设置仍壳期占位（T8+ 接管）；
 * - 页签 aria-controls ↔ 面板 aria-labelledby 双向关联（M4-T8 收 M3 终审
 *   T3-④，a11y：tab→panel 指向 + panel→活动 tab 回指）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ProgressRadial, Text } from '@itwin/itwinui-react';
import { SvgSave, SvgUploadToCloud } from '@itwin/itwinui-icons-react';
import type { Changeset } from '@clients/imodels/ImodelsClient.js';
import { useChangesets } from '../hooks/useChangesets.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { DockTab } from '../types.js';
import { DisplaySettingsPanel } from './DisplaySettingsPanel.js';
import './PartStudioDock.css';

/** 停靠页签在册（id 即 DockTab；labelKey 指向 partStudio.dock.tabs.*）。 */
const DOCK_TABS: { id: DockTab; labelKey: string }[] = [
  { id: 'toolSettings', labelKey: 'partStudio.dock.tabs.toolSettings' },
  { id: 'history', labelKey: 'partStudio.dock.tabs.history' },
  { id: 'display', labelKey: 'partStudio.dock.tabs.display' },
];

export interface PartStudioDockProps {
  /** iModel id（changesets 查询主键；缺省查询门控关闭）。 */
  iModelId?: string;
  /** 当前 briefcase 所在 changeset id（connection.changeset.id 直通；当前版本标记比对源）。 */
  currentChangesetId?: string | null;
  /** 有未推送本地变更（hasPendingTxns 口径；保存/推送钮门 + 未推送徽标）。 */
  hasUnsavedChanges?: boolean;
  /** 本地保存执行中（保存钮加载态 + 防重入）。 */
  isSaving?: boolean;
  /** 本地兜底保存（connection.saveChanges 代理；缺省诚实禁用）。 */
  onSave?: () => void;
  /** 打开推送对话框（宿主 Session 持共享 PushChangesetDialog 实例；缺省诚实禁用）。 */
  onPush?: () => void;
}

export function PartStudioDock({
  iModelId,
  currentChangesetId,
  hasUnsavedChanges = false,
  isSaving = false,
  onSave,
  onPush,
}: PartStudioDockProps): React.JSX.Element {
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
            id={`part-studio-dock-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls="part-studio-dock-body"
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
        <div
          className="part-studio-dock__body"
          data-testid="part-studio-dock-body"
          role="tabpanel"
          id="part-studio-dock-body"
          aria-labelledby={`part-studio-dock-tab-${activeTab}`}
        >
          {activeTab === 'history' ? (
            <ChangesetsPanel
              iModelId={iModelId ?? null}
              currentChangesetId={currentChangesetId ?? null}
              hasUnsavedChanges={hasUnsavedChanges}
              isSaving={isSaving}
              onSave={onSave}
              onPush={onPush}
            />
          ) : activeTab === 'display' ? (
            /* 显示设置真面板（渲染对齐阶段 2，2026-10-26）——壳期占位到此兑现。 */
            <DisplaySettingsPanel />
          ) : (
            /* 壳期占位：工具设置真实面板 T8+ 接管。 */
            <Text isMuted>{t('partStudio.dock.placeholder')}</Text>
          )}
        </div>
      )}
    </aside>
  );
}

interface ChangesetsPanelProps {
  iModelId: string | null;
  currentChangesetId: string | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSave?: () => void;
  onPush?: () => void;
}

/**
 * 版本历史面板（M4-T7）：changesets 列表 + 当前版本标记 + 保存/推送动作钮。
 * 面板级挂载（页签未开不占查询），六态完备。
 */
function ChangesetsPanel({
  iModelId,
  currentChangesetId,
  hasUnsavedChanges,
  isSaving,
  onSave,
  onPush,
}: ChangesetsPanelProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { changesets, isLoading, error, refetch } = useChangesets(iModelId);

  // 本地化短日期（官方 pushDateTime ISO 串 → 语言感知显示；解析失败诚实回退原串）。
  const formatDate = React.useCallback(
    (pushDateTime: string): string => {
      const date = new Date(pushDateTime);
      if (Number.isNaN(date.getTime())) return pushDateTime;
      return date.toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    [i18n.language],
  );

  return (
    <div className="part-studio-dock-history" data-testid="part-studio-dock-history">
      <div className="part-studio-dock-history__content">
        {isLoading ? (
          <div className="part-studio-dock-history__loading" data-testid="part-studio-changesets-loading">
            <div className="part-studio-tree__loading-bar" />
            <div className="part-studio-tree__loading-bar part-studio-tree__loading-bar--short" />
          </div>
        ) : error ? (
          <div className="part-studio-tree__error" data-testid="part-studio-changesets-error" role="alert">
            <span>
              {t('partStudio.dock.history.loadFailed', {
                message: error instanceof Error ? error.message : String(error),
              })}
            </span>
            <button type="button" className="part-studio-tree__retry" onClick={refetch}>
              {t('partStudio.dock.history.retry')}
            </button>
          </div>
        ) : changesets.length === 0 ? (
          /* 无 changeset = 初始版本语义（诚实空态，不伪造历史行）。 */
          <Text isMuted className="part-studio-dock-history__empty" data-testid="part-studio-changesets-empty">
            {t('partStudio.dock.history.empty')}
          </Text>
        ) : (
          <ul
            className="part-studio-dock-history__list"
            data-testid="part-studio-changesets-list"
            aria-label={t('partStudio.dock.history.listLabel')}
          >
            {changesets.map((cs) => (
              <ChangesetRow
                key={cs.id}
                changeset={cs}
                isCurrent={cs.id === currentChangesetId}
                formatDate={formatDate}
              />
            ))}
          </ul>
        )}
      </div>
      {/* 动作钮行：保存（本地兜底 saveChanges）与推送（开描述对话框 → pushChanges）
          语义分离保留（T4 评审 I-1 裁定的 dock 侧分工）。 */}
      <div className="part-studio-dock-history__actions" data-testid="part-studio-dock-history-actions">
        <Button
          size="small"
          startIcon={
            isSaving ? <ProgressRadial size="x-small" indeterminate /> : <SvgSave />
          }
          disabled={!hasUnsavedChanges || isSaving || !onSave}
          onClick={onSave}
          data-testid="part-studio-dock-save-button"
        >
          {t('partStudio.dock.history.save')}
          {hasUnsavedChanges && !isSaving && (
            <Badge backgroundColor="warning" data-testid="part-studio-dock-unpushed-badge">
              {t('partStudio.dock.history.unpushed')}
            </Badge>
          )}
        </Button>
        <Button
          size="small"
          styleType="high-visibility"
          startIcon={<SvgUploadToCloud />}
          disabled={!hasUnsavedChanges || !onPush}
          onClick={onPush}
          data-testid="part-studio-dock-push-button"
        >
          {t('partStudio.dock.history.push')}
        </Button>
      </div>
    </div>
  );
}

/** changeset 行：index + 描述/日期 + 当前版本标记（Badge 仅命中行渲染）。 */
function ChangesetRow({
  changeset,
  isCurrent,
  formatDate,
}: {
  changeset: Changeset;
  isCurrent: boolean;
  formatDate: (pushDateTime: string) => string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <li
      className={
        isCurrent
          ? 'part-studio-dock-history__row part-studio-dock-history__row--current'
          : 'part-studio-dock-history__row'
      }
      data-testid="part-studio-changeset-row"
    >
      <span className="part-studio-dock-history__index">{changeset.index}</span>
      <span className="part-studio-dock-history__info">
        <span className="part-studio-dock-history__description">
          {changeset.description || changeset.displayName || t('partStudio.dock.history.noDescription')}
        </span>
        <span className="part-studio-dock-history__date">{formatDate(changeset.pushDateTime)}</span>
      </span>
      {isCurrent && <Badge backgroundColor="positive">{t('partStudio.dock.history.current')}</Badge>}
    </li>
  );
}
