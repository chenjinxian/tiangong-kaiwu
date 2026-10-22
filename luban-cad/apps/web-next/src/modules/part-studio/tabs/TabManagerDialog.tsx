/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * TabManagerDialog（M3 Task 7）：页签管理器（对齐 os-33，底部「+」开合）——
 * - 数据：当前 iTwin 的 iModel 列表（ImodelsClient.list，react-query；
 *   UI-INVENTORY §2.12 裁决：单页签现状下「页签=同文档内 iModel 列表」跳转）；
 * - 列表：图标区分元素类型（partStudio=▦ / assembly=▚ / tutorial=外链），
 *   活动元素（当前 iModel）aria-current 高亮；教程元素为外部链接
 *   （Onshape「Tutorial」页签实为外链的实测口径），经 extras 注入；
 * - 工具条：搜索页签框（大小写不敏感子串）+ 类型筛选 + 列表/网格视图切换；
 * - 底部：所选元素缩略图预览（官方全量表示无缩略图字段——独立二进制端点
 *   需 Authorization 头，img 无法携带，占位图标口径同 ImodelCard）；
 * - 底栏：「页签管理器 (alt+~+t)」快捷键标注 + 「以打开」checkbox
 *   （勾选=新浏览器页签打开，对应 os-17「在新浏览器页签中打开」）；
 * - 打开：单击选中（预览跟随）/ 双击或 Enter 打开（os-33「↵ 以打开」）；
 * - 键盘（M4-T8 a11y 收口）：列表 ↑↓ 行导航（选中+焦点双移动，预览跟随）+
 *   Home/End/PageUp/PageDown 端点跳转（M3 终审 T6-③；挂账清除）。
 *
 * 挂账：alt+~+t 和弦热键由宿主 PartStudioTabs 承接（M4-T8 T7-①）；多页签
 * 并行 briefcase 架构未支持（os-33 完整多开属后续里程碑，本版为同文档
 * iModel 跳转的诚实降级）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  IconButton,
  Input,
  LabeledSelect,
  ProgressRadial,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgCloseSmall,
  SvgGlobe,
  SvgGrid,
  SvgList,
  SvgModel,
  SvgPlaceholder,
} from '@itwin/itwinui-icons-react';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import './TabManagerDialog.css';

/** 页签元素类型（os-33 图标区分：Part Studio/装配/教程链接）。 */
export type TabElementKind = 'partStudio' | 'assembly' | 'tutorial';

/** 页签管理器列表条目（UI 层契约）。 */
export interface TabElement {
  id: string;
  name: string;
  kind: TabElementKind;
  /** partStudio/assembly=文档内路由；tutorial=外部链接地址。 */
  href: string;
}

/** 类型筛选档位（all=不筛）。 */
export type TabManagerFilter = 'all' | TabElementKind;

/** 视图档位（os-33 视图切换：列表/网格）。 */
export type TabManagerView = 'list' | 'grid';

/**
 * 官方 IModel（宽类型读取：displayName/name 双键）→ TabElement。
 * 现网 iModel 一律映射 partStudio；assembly/tutorial 经 extras 注入
 * （完整 UI 面：类型契约全量支持，数据面按可用性供给）。
 */
export function toTabElements(
  imodels: readonly { id: string; displayName?: string; name?: string }[],
  iTwinId: string,
): TabElement[] {
  return imodels.map((imodel) => ({
    id: imodel.id,
    name: imodel.displayName ?? imodel.name ?? '',
    kind: 'partStudio',
    href: `/documents/${iTwinId}/${imodel.id}`,
  }));
}

/** 搜索（大小写不敏感子串）+ 类型筛选叠加（交集）。 */
export function filterTabElements(
  elements: readonly TabElement[],
  query: string,
  filter: TabManagerFilter,
): TabElement[] {
  const normalized = query.trim().toLowerCase();
  return elements.filter((element) => {
    if (filter !== 'all' && element.kind !== filter) return false;
    if (!normalized) return true;
    return element.name.toLowerCase().includes(normalized);
  });
}

export interface TabManagerDialogProps {
  iTwinId: string;
  /** 当前活动 iModel（列表高亮 + 预览初始选中寻址）。 */
  activeIModelId: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * 追加元素（教程外链等）——os-33 的 Tutorial 行即外链注入位；与同 iTwin
   * 的 iModel 列表合并呈现（id 冲突时 extras 后不覆盖，生产注入方自负）。
   */
  extras?: readonly TabElement[];
}

/** 元素类型 → 图标（os-33：图标区分类型）。 */
function kindIcon(kind: TabElementKind): React.JSX.Element {
  switch (kind) {
    case 'assembly':
      return <SvgModel data-kind-icon="assembly" />;
    case 'tutorial':
      return <SvgGlobe data-kind-icon="tutorial" />;
    default:
      return <SvgModel data-kind-icon="partStudio" />;
  }
}

export function TabManagerDialog({
  iTwinId,
  activeIModelId,
  isOpen,
  onClose,
  extras,
}: TabManagerDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<TabManagerFilter>('all');
  const [view, setView] = React.useState<TabManagerView>('list');
  const [selectedId, setSelectedId] = React.useState<string>(activeIModelId);
  const [openAs, setOpenAs] = React.useState(false);

  // 打开即复位（os-33：每次进入都是全新搜索，同 CommandPalette 口径）。
  React.useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFilter('all');
      setSelectedId(activeIModelId);
    }
  }, [isOpen, activeIModelId]);

  const imodelsQuery = useQuery({
    queryKey: ['part-studio', 'tab-manager', 'imodels', iTwinId],
    queryFn: () => new ImodelsClient().list(iTwinId),
    enabled: isOpen && !!iTwinId,
  });

  const elements = React.useMemo(
    () => [...toTabElements(imodelsQuery.data ?? [], iTwinId), ...(extras ?? [])],
    [imodelsQuery.data, iTwinId, extras],
  );
  const visible = React.useMemo(() => filterTabElements(elements, query, filter), [elements, query, filter]);
  const selected = elements.find((element) => element.id === selectedId) ?? null;

  /** 打开元素：tutorial 恒外部新页签；内部路由按「以打开」勾选分路。 */
  const openElement = React.useCallback(
    (element: TabElement) => {
      if (element.kind === 'tutorial' || openAs) {
        window.open(element.href, '_blank', 'noopener');
        return;
      }
      onClose();
      navigate(element.href);
    },
    [openAs, navigate, onClose],
  );

  // 列表键盘导航（M4-T8 T6-③）：↑↓ 相对移动（选中+焦点双移动，预览跟随），
  // Home/End/PageUp/PageDown 端点跳转；选中项被筛走时从端点起（-1 → 首/尾）。
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const moveListSelection = React.useCallback(
    (target: TabElement | undefined) => {
      if (!target) return;
      setSelectedId(target.id);
      // 焦点随行：选中态与 DOM 焦点双移动（键盘用户不丢位置）。
      listRef.current
        ?.querySelector<HTMLElement>(`li[data-element-id="${target.id}"] .tab-manager-row__action`)
        ?.focus();
    },
    [],
  );
  const handleListKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (visible.length === 0) return;
      const currentIndex = visible.findIndex((element) => element.id === selectedId);
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveListSelection(visible[Math.min(currentIndex + 1, visible.length - 1)]);
          return;
        case 'ArrowUp':
          event.preventDefault();
          moveListSelection(visible[Math.max(currentIndex - 1, 0)]);
          return;
        case 'Home':
        case 'PageUp':
          event.preventDefault();
          moveListSelection(visible[0]);
          return;
        case 'End':
        case 'PageDown':
          event.preventDefault();
          moveListSelection(visible[visible.length - 1]);
          return;
        default:
          return;
      }
    },
    [visible, selectedId, moveListSelection],
  );

  if (!isOpen) return null;

  const filterOptions = (['all', 'partStudio', 'assembly', 'tutorial'] as const).map((value) => ({
    value,
    label: t(`partStudio.tabManager.filters.${value}`),
  }));

  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal isDismissible>
      <Dialog.Backdrop />
      <Dialog.Main
        styleType="default"
        title={t('partStudio.tabManager.title')}
        className="tab-manager-dialog"
      >
        <Dialog.TitleBar titleText={t('partStudio.tabManager.title')} />
        <Dialog.Content>
          {/* 工具条：搜索 + 清除 / 类型筛选 / 视图切换（os-33 顶栏三钮组） */}
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
            {/* LabeledSelect：InputGrid 自动 aria-labelledby（裸 Select 的
                aria-label 落不进原生 select，共享对话框同口径挂账）。 */}
            <LabeledSelect
              native
              size="small"
              displayStyle="inline"
              label={t('partStudio.tabManager.filterLabel')}
              value={filter}
              options={filterOptions}
              onChange={(value) => setFilter(value as TabManagerFilter)}
            />
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

          {/* 元素列表（图标区分类型；活动项 aria-current） */}
          {imodelsQuery.isPending ? (
            <div className="tab-manager-status">
              <ProgressRadial size="small" indeterminate />
              <Text variant="small">{t('partStudio.tabManager.loading')}</Text>
            </div>
          ) : imodelsQuery.isError ? (
            <div className="tab-manager-status">
              <Alert type="negative" className="tab-manager-status__alert">
                {t('partStudio.tabManager.loadFailed')}
              </Alert>
              <Button styleType="default" size="small" onClick={() => void imodelsQuery.refetch()}>
                {t('partStudio.tabManager.retry')}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="tab-manager-status">
              <Text variant="body">{t('partStudio.tabManager.empty')}</Text>
            </div>
          ) : (
            <ul
              ref={listRef}
              role="list"
              aria-label={t('partStudio.tabManager.listLabel')}
              data-view={view}
              className="tab-manager-list"
              onKeyDown={handleListKeyDown}
            >
              {visible.map((element) => {
                const isActive = element.id === activeIModelId;
                const isSelected = element.id === selectedId;
                const kindLabel = t(`partStudio.tabManager.kindLabels.${element.kind}`);
                const rowContent = (
                  <>
                    <span className="tab-manager-row__icon" aria-hidden="true">
                      {kindIcon(element.kind)}
                    </span>
                    <span className="tab-manager-row__name">{element.name}</span>
                    <span className="tab-manager-row__kind">{kindLabel}</span>
                  </>
                );
                return (
                  <li
                    key={element.id}
                    role="listitem"
                    data-element-id={element.id}
                    aria-current={isActive ? 'true' : undefined}
                    data-selected={isSelected ? 'true' : undefined}
                    data-kind={element.kind}
                    className="tab-manager-row"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        // os-33「↵ 以打开」：Enter 直开（preventDefault 拦按钮默认 click）。
                        event.preventDefault();
                        openElement(element);
                      }
                    }}
                  >
                    {element.kind === 'tutorial' ? (
                      <a
                        className="tab-manager-row__action"
                        href={element.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => {
                          event.preventDefault();
                          setSelectedId(element.id);
                          window.open(element.href, '_blank', 'noopener');
                        }}
                      >
                        {rowContent}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className="tab-manager-row__action"
                        onClick={() => setSelectedId(element.id)}
                        onDoubleClick={() => openElement(element)}
                      >
                        {rowContent}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* 底部：所选元素缩略图预览（占位口径同 ImodelCard） */}
          <div className="tab-manager-preview" data-testid="tab-manager-preview">
            <Text variant="small" className="tab-manager-preview__label">
              {t('partStudio.tabManager.previewLabel')}
            </Text>
            {selected ? (
              <div className="tab-manager-preview__body">
                <div className="tab-manager-preview__thumb" aria-hidden="true">
                  <SvgPlaceholder />
                </div>
                <div className="tab-manager-preview__meta">
                  <span className="tab-manager-preview__name">{selected.name}</span>
                  <span className="tab-manager-preview__kind">
                    {t(`partStudio.tabManager.kindLabels.${selected.kind}`)}
                  </span>
                  <span className="tab-manager-preview__hint">
                    {t('partStudio.tabManager.noPreview')}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
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
