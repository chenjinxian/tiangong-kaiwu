/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioDock（M3 Task 3；M4 Task 7 版本历史真面板）：右侧停靠面板（沿用旧
 * 应用 EditorDockPanel 三类，DockTab='toolSettings' | 'history' | 'display'）——
 * - 三页签条常驻（os-11 右缘条带）；点击页签写 store dock.activeTab 并展开内容，
 *   再点活动页签收合（toggleDock 语义）；
 * - 版本历史页签（M4-T7 真数据；B-model P0 Task 5 增命名版本分组）：
 *   Named Versions 列表（useNamedVersions 通道；仅名称/描述——hub 仅元数据
 *   命名，不宣称 checkpoint/缩略图）+ changesets 官方 SDK 列表（index/描述/
 *   日期，useChangesets react-query 通道）+ 当前版本标记（connection.changeset.id
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
import type { BodyInfo } from '@luban-cad/shared';
import type { Changeset } from '@clients/imodels/ImodelsClient.js';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import { useChangesets } from '../hooks/useChangesets.js';
import { useNamedVersions } from '../hooks/useNamedVersions.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { DockTab } from '../types.js';
import { AppearancesPanel } from './AppearancesPanel.js';
import type { AppearanceSketchItem } from './AppearancesPanel.js';
import './PartStudioDock.css';

/** Onshape 右缘 5 钮（live：appearances / configuration-table / featurescript-table /
 * model-based-definition / variable-table）。appearances 接既有显示设置面板；
 * 其余为 Onshape UI 占位（保留按钮与图标，不实现行为）。 */
const DOCK_PALETTE: {
  id: string;
  labelKey: string;
  icon: 'appearances-button' | 'configuration-table-button' | 'featurescript-table-button' | 'model-based-definition' | 'variable-table-button';
  tab?: DockTab;
}[] = [
  { id: 'appearances', labelKey: 'partStudio.dock.tabs.appearances', icon: 'appearances-button', tab: 'display' },
  { id: 'configurations', labelKey: 'partStudio.dock.tabs.configurations', icon: 'configuration-table-button' },
  { id: 'featurescript-table', labelKey: 'partStudio.dock.tabs.featurescriptTable', icon: 'featurescript-table-button' },
  { id: 'model-based-definition', labelKey: 'partStudio.dock.tabs.modelBasedDefinition', icon: 'model-based-definition' },
  { id: 'variable-table', labelKey: 'partStudio.dock.tabs.variableTable', icon: 'variable-table-button' },
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
  /** 外观面板：库内实体读面（active authored）。 */
  bodies?: readonly BodyInfo[];
  /** 外观面板：草图列表（树 sketch 行映射）。 */
  sketches?: readonly AppearanceSketchItem[];
  /** 外观面板：逐 body 颜色（bodyKey → #rrggbb）。 */
  bodyColors?: Readonly<Record<string, string>>;
  /** 外观面板：颜色变更回调（宿主应用 FeatureOverride）。 */
  onBodyColorChange?: (bodyKey: string, color: string) => void;
}

export function PartStudioDock({
  iModelId,
  currentChangesetId,
  hasUnsavedChanges = false,
  isSaving = false,
  onSave,
  onPush,
  bodies = [],
  sketches = [],
  bodyColors = {},
  onBodyColorChange,
}: PartStudioDockProps): React.JSX.Element {
  const { t } = useTranslation();
  const activeTab = usePartStudioStore((s) => s.dock.activeTab);
  const isOpen = usePartStudioStore((s) => s.dock.isOpen);
  const setDockTab = usePartStudioStore((s) => s.setDockTab);
  const openDock = usePartStudioStore((s) => s.openDock);
  const closeDock = usePartStudioStore((s) => s.closeDock);

  const handlePaletteClick = React.useCallback(
    (tab?: DockTab) => {
      if (!tab) return; // Onshape UI 占位（未实现，点击无行为）
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
      <div className="part-studio-dock__tabs">
        {DOCK_PALETTE.map((item) => {
          const active = item.tab !== undefined && activeTab === item.tab && isOpen;
          return (
            <button
              key={item.id}
              type="button"
              id={`part-studio-dock-tab-${item.tab ?? item.id}`}
              aria-label={t(item.labelKey)}
              title={t(item.labelKey)}
              aria-pressed={active}
              aria-controls={item.tab ? 'part-studio-dock-body' : undefined}
              className={
                active
                  ? 'part-studio-dock__tab part-studio-dock__tab--active'
                  : 'part-studio-dock__tab'
              }
              onClick={() => handlePaletteClick(item.tab)}
              data-testid={`part-studio-dock-tab-${item.id}`}
            >
              <OnshapeIcon name={item.icon} size={20} />
            </button>
          );
        })}
      </div>
      {isOpen && (
        <div
          className={activeTab === 'display'
            ? 'part-studio-dock__body part-studio-dock__body--appearances'
            : 'part-studio-dock__body'}
          data-testid="part-studio-dock-body"
          role="tabpanel"
          id="part-studio-dock-body"
          aria-labelledby={activeTab === 'display' ? 'part-studio-dock-tab-display' : undefined}
          aria-label={activeTab === 'history' ? t('partStudio.dock.tabs.history') : undefined}
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
            <AppearancesPanel
              bodies={bodies}
              sketches={sketches}
              bodyColors={bodyColors}
              onBodyColorChange={onBodyColorChange}
            />
          ) : (
            /* 工具设置仍为壳期占位。 */
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
  // B-model P0 Task 5：Named Versions 列表（hub 仅元数据命名——行内只呈现
  // 名称/描述，不宣称 checkpoint/缩略图；空集不渲染分组，六态语义不变）。
  const { namedVersions } = useNamedVersions(iModelId);

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
        {namedVersions.length > 0 && (
          <div className="part-studio-dock-history__named" data-testid="part-studio-named-versions">
            <Text isMuted>{t('partStudio.dock.history.namedVersions')}</Text>
            <ul>
              {namedVersions.map((version) => (
                <li key={version.id} data-testid="part-studio-named-version-row">
                  <span className="part-studio-dock-history__description">{version.name}</span>
                  {version.description && (
                    <span className="part-studio-dock-history__date">{version.description}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
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
