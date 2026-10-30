/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * TabManagerDialog（M3 Task 7；B-model P2.4 重写数据面）：页签管理器（对齐
 * os-33 的外观，数据源=**Part Studio 注册表**，不再是 iModel 列表）——
 * - 列表条目 = 当前 B 文档的 Part Studio（`listPartStudios` 经 usePartStudios
 *   上提页面后透传；本组件纯呈现 + 导航，零 registry 调用）；
 * - 行 href = `workspaceRefPath({iTwinId,iModelId,modelId})`（URL 生产者单点；
 *   文档内路由含 `?model=`），单击/双击/Enter 换 URL（不新建 BriefcaseConnection）；
 * - 半图 degraded 条目（`physModelId===''`）标记「损坏」，仍可选中查看，
 *   但编辑器侧只给恢复/删除入口（本组件不发写请求）；
 * - A 旧文档：单页签形态（`tabs.partStudio` 一行），无 `?model=`、无 registry；
 * - 搜索（大小写不敏感子串）+ 列表/网格视图切换 + 「以打开」新浏览器页签；
 * - loading/error/empty 三态诚实呈现（error 带重试）。
 *
 * 移除（P2.4）：iModel 列表查询（ImodelsClient.list）、装配/教程 extras、类型
 * 筛选与缩略图预览——「页签=同文档 Part Studio」的注册表语义落地后旧降级面
 * 全部退役。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Checkbox,
  Dialog,
  IconButton,
  Input,
  ProgressRadial,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgCloseSmall,
  SvgGrid,
  SvgList,
  SvgModel,
  SvgStatusWarning,
} from '@itwin/itwinui-icons-react';
import type { PartStudioInfo } from '@luban-cad/shared';
import type { DocumentMode } from '@modules/documents';
import { workspaceRefPath } from '@common/workspace/workspace-ref.js';
import './TabManagerDialog.css';

/** 视图档位（os-33 视图切换：列表/网格）。 */
export type TabManagerView = 'list' | 'grid';

/** 搜索：大小写不敏感子串（Part Studio 名称）。 */
export function filterPartStudios(
  studios: readonly PartStudioInfo[],
  query: string,
): PartStudioInfo[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...studios];
  return studios.filter((studio) => studio.name.toLowerCase().includes(normalized));
}

export interface TabManagerDialogProps {
  /** B 文档=注册表页签；A 旧文档=单页签只读；undefined=marker 未定（不列 legacy）。 */
  mode?: DocumentMode;
  iTwinId: string;
  iModelId: string;
  studios?: readonly PartStudioInfo[];
  /** 活动 Part Studio id（URL `?model=`；列表高亮）。 */
  activeModelId?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function TabManagerDialog({
  mode,
  iTwinId,
  iModelId,
  studios = [],
  activeModelId,
  isLoading = false,
  error = null,
  onRetry,
  isOpen,
  onClose,
}: TabManagerDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState<TabManagerView>('list');
  const [openAs, setOpenAs] = React.useState(false);

  // 打开即复位（os-33：每次进入都是全新搜索，同 CommandPalette 口径）。
  React.useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const visible = React.useMemo(() => filterPartStudios(studios, query), [studios, query]);

  const openHref = React.useCallback(
    (href: string) => {
      if (openAs) {
        window.open(href, '_blank', 'noopener');
        return;
      }
      onClose();
      navigate(href);
    },
    [navigate, onClose, openAs],
  );

  if (!isOpen) return null;

  const legacyHref = workspaceRefPath({ iTwinId, iModelId });
  const legacyRow = (
    <li
      role="listitem"
      data-element-id="legacy"
      aria-current="true"
      className="tab-manager-row"
    >
      <a
        className="tab-manager-row__action"
        href={legacyHref}
        onClick={(event) => {
          event.preventDefault();
          openHref(legacyHref);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            openHref(legacyHref);
          }
        }}
      >
        <span className="tab-manager-row__icon" aria-hidden="true">
          <SvgModel data-kind-icon="partStudio" />
        </span>
        <span className="tab-manager-row__name">{t('partStudio.tabs.partStudio')}</span>
        <span className="tab-manager-row__kind">{t('partStudio.tabManager.kindLabels.partStudio')}</span>
      </a>
    </li>
  );

  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal isDismissible setFocus>
      <Dialog.Backdrop />
      <Dialog.Main
        styleType="default"
        title={t('partStudio.tabManager.title')}
        className="tab-manager-dialog"
      >
        <Dialog.TitleBar titleText={t('partStudio.tabManager.title')} />
        <Dialog.Content>
          {/* 工具条：搜索 + 清除 / 视图切换（os-33 顶栏钮组） */}
          <div className="tab-manager-toolbar">
            <div className="tab-manager-toolbar__search">
              <Input
                placeholder={t('partStudio.tabManager.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <IconButton
                label={t('partStudio.tabManager.clear')}
                styleType="borderless"
                size="small"
                disabled={!query}
                onClick={() => setQuery('')}
              >
                <SvgCloseSmall />
              </IconButton>
            </div>
            <div className="tab-manager-toolbar__views">
              <IconButton
                label={t('partStudio.tabManager.viewList')}
                styleType={view === 'list' ? 'default' : 'borderless'}
                size="small"
                onClick={() => setView('list')}
              >
                <SvgList />
              </IconButton>
              <IconButton
                label={t('partStudio.tabManager.viewGrid')}
                styleType={view === 'grid' ? 'default' : 'borderless'}
                size="small"
                onClick={() => setView('grid')}
              >
                <SvgGrid />
              </IconButton>
            </div>
          </div>

          {/* 列表：A=单页签；B=注册表 Part Studio（活动项 aria-current）；mode
              未定（marker 在途/失败）→ 不列 legacy（F1），只显示解析中。 */}
          {mode === 'A' ? (
            <ul role="list" aria-label={t('partStudio.tabManager.listLabel')} className="tab-manager-list" data-view={view}>
              {legacyRow}
            </ul>
          ) : mode === undefined ? (
            <div className="tab-manager-status" data-testid="tab-manager-unknown-mode">
              <ProgressRadial size="small" indeterminate />
              <Text variant="small">{t('partStudio.scope.loading')}</Text>
            </div>
          ) : isLoading ? (
            <div className="tab-manager-status">
              <ProgressRadial size="small" indeterminate />
              <Text variant="small">{t('partStudio.tabManager.loading')}</Text>
            </div>
          ) : error ? (
            <div className="tab-manager-status">
              <Text color="negative" variant="small">{error}</Text>
              {onRetry && (
                <Button styleType="default" size="small" onClick={onRetry}>
                  {t('partStudio.tabManager.retry')}
                </Button>
              )}
            </div>
          ) : studios.length === 0 ? (
            <div className="tab-manager-status">
              <Text variant="body">{t('partStudio.tabManager.noStudios')}</Text>
            </div>
          ) : visible.length === 0 ? (
            <div className="tab-manager-status">
              <Text variant="body">{t('partStudio.tabManager.empty')}</Text>
            </div>
          ) : (
            <ul role="list" aria-label={t('partStudio.tabManager.listLabel')} className="tab-manager-list" data-view={view}>
              {visible.map((studio) => {
                const damaged = studio.physModelId === '';
                const href = workspaceRefPath({ iTwinId, iModelId, modelId: studio.id });
                const isActive = studio.id === activeModelId;
                return (
                  <li
                    key={studio.id}
                    role="listitem"
                    data-element-id={studio.id}
                    aria-current={isActive ? 'true' : undefined}
                    data-damaged={damaged ? 'true' : undefined}
                    className="tab-manager-row"
                  >
                    <a
                      className="tab-manager-row__action"
                      href={href}
                      onClick={(event) => {
                        event.preventDefault();
                        openHref(href);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          openHref(href);
                        }
                      }}
                    >
                      <span className="tab-manager-row__icon" aria-hidden="true">
                        <SvgModel data-kind-icon="partStudio" />
                      </span>
                      <span className="tab-manager-row__name">{studio.name}</span>
                      {damaged ? (
                        <span className="tab-manager-row__kind" data-damaged="true">
                          <SvgStatusWarning aria-hidden="true" /> {t('partStudio.tabManager.damaged')}
                        </span>
                      ) : (
                        <span className="tab-manager-row__kind">
                          {t('partStudio.tabManager.kindLabels.partStudio')}
                        </span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Dialog.Content>

        {/* 底栏：快捷键标注 + 「以打开」checkbox（os-33）+ 关闭 */}
        <Dialog.ButtonBar className="tab-manager-footer">
          <span className="tab-manager-footer__shortcut">{t('partStudio.tabManager.shortcut')}</span>
          <Checkbox
            label={t('partStudio.tabManager.openAs')}
            checked={openAs}
            onChange={(event) => setOpenAs(event.target.checked)}
          />
          <Button styleType="default" onClick={onClose}>
            {t('partStudio.tabManager.close')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
}
