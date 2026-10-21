/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentsPage（Task 5）：/documents 文档中心页（对齐 Onshape os-01/02/03/
 * 06/40 采集）——
 * - 顶栏：LC 品牌（回 /documents）+ 居中 SearchBox + 用户菜单
 *   （我的帐户 / 深色模式开关 / 退出登录，os-03）；
 * - 左栏（DocumentSidebar）：创建 ▾ 大钮 + 五筛选（URL ?filter= 为唯一事实源，
 *   Task 4 useDocumentFilters）；
 * - 主区（DocumentToolbar + 网格/表格 + DocumentInfoPanel）：分区标题+计数、
 *   排序菜单（与 Table 表头共用受控 sort 态）、网格/列表切换（localStorage 记忆）、
 *   刷新；行/卡操作 = 打开/详情/重命名/收藏/分享/删除（删除走 HITL 确认框）；
 * - 对话框：CreateDocumentDialog / RenameDocumentDialog / ShareDocumentDialog
 *   （成员/邀请/链接三页签，移植旧 ShareITwinDialog）/ CapabilityDialog
 *   （创建菜单 🟠 gated 项的能力引导面，spec §0 铁律 1）。
 *
 * 数据面：useDocuments(filter)（Task 4）；收藏 add/remove 与分享成员/角色
 * 走模块私有 REST（internal/*.api.ts，官方 SDK 无变更端点——见各文件头注）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  Dialog,
  Flex,
  Header,
  HeaderLogo,
  IconButton,
  InformationPanelWrapper,
  MenuItem,
  NonIdealState,
  DropdownMenu,
  ProgressRadial,
  SearchBox,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgCheckmark,
  SvgCloseSmall,
  SvgDelete,
  SvgFolderOpened,
  SvgInfo,
  SvgRefresh,
  SvgRename,
  SvgSearch,
  SvgShare,
  SvgStar,
  SvgStarHollow,
  SvgStatusError,
} from '@itwin/itwinui-icons-react';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { useTheme } from '@app/providers/ThemeContext.js';
import { useDocuments } from './hooks/useDocuments.js';
import { useDocumentFilters } from './hooks/useDocumentFilters.js';
import type {
  DocumentFilter,
  DocumentSort,
  DocumentSummary,
  DocumentsView,
  GatedCreateAction,
} from './types.js';
import { DocumentSidebar } from './components/DocumentSidebar.js';
import { DocumentToolbar } from './components/DocumentToolbar.js';
import { DocumentGrid } from './components/DocumentGrid.js';
import { DocumentTable, type DocumentRow } from './components/DocumentTable.js';
import { DocumentInfoPanel } from './components/DocumentInfoPanel.js';
import { CreateDocumentDialog } from './components/CreateDocumentDialog.js';
import { RenameDocumentDialog } from './components/RenameDocumentDialog.js';
import { ShareDocumentDialog } from './components/ShareDocumentDialog.js';
import { CapabilityDialog } from './components/CapabilityDialog.js';
import { addToFavorites, removeFromFavorites } from './internal/documents.api.js';
import './DocumentsPage.css';

/** 双视图偏好（Onshape 文档中心 IA：表格/网格记忆）。 */
const VIEW_STORAGE_KEY = 'luban-next-documents-view';

function readStoredView(): DocumentsView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'tile';
  } catch {
    return 'tile';
  }
}

function parseDate(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function DocumentsPage(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  // 会话由 RequireAuth 门保证在场；getStoredAuth 同步直读（登出即跳走，无需订阅）。
  const user = AuthSession.getStoredAuth()?.user;

  const { filter, setFilter } = useDocumentFilters();
  const { documents, isLoading, isFetching, error } = useDocuments(filter);
  // 收藏集合常开（favorites 档即真值；其余档星标状态也须真实——旧应用
  // useFavoriteITwinsQuery(true) 同口径；同 queryKey 与列表查询去重）。
  const { documents: favoriteDocuments } = useDocuments('favorites');

  const [searchQuery, setSearchQuery] = React.useState('');
  const [view, setView] = React.useState<DocumentsView>(readStoredView);
  const [sort, setSort] = React.useState<DocumentSort>({ id: 'modifiedAt', desc: true });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<DocumentSummary | null>(null);
  const [shareTarget, setShareTarget] = React.useState<DocumentSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DocumentSummary | null>(null);
  const [deleteError, setDeleteError] = React.useState('');
  const [gatedAction, setGatedAction] = React.useState<GatedCreateAction | null>(null);

  const favoriteMutation = useMutation({
    mutationFn: (input: { id: string; favorite: boolean }) =>
      input.favorite ? addToFavorites(input.id) : removeFromFavorites(input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => new ItwinsClient().delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  // 收藏集合：favorites 档常开查询即真值（星标/取消星标的显示与提交都基于它）。
  const favoriteIds = React.useMemo(
    () => new Set(favoriteDocuments.map((doc) => doc.id)),
    [favoriteDocuments],
  );

  // -----------------------------------------------------------------------
  // 搜索（当前筛选内）→ 排序（受控态统一驱动 Table 表头与工具条排序菜单）
  // -----------------------------------------------------------------------
  const isSearching = searchQuery.trim().length > 0;

  const visibleDocuments = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? documents.filter((doc) => doc.name.toLowerCase().includes(query))
      : documents;
    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort.id === 'name') {
        return dir * a.name.localeCompare(b.name, i18n.language, { sensitivity: 'base' });
      }
      return dir * (parseDate(sort.id === 'createdAt' ? a.createdAt : a.modifiedAt)
        - parseDate(sort.id === 'createdAt' ? b.createdAt : b.modifiedAt));
    });
  }, [documents, searchQuery, sort, i18n.language]);

  const rows = React.useMemo<DocumentRow[]>(() => {
    const unnamed = t('documents.states.unnamed');
    return visibleDocuments.map((doc) => {
      const created = parseDate(doc.createdAt);
      return {
        id: doc.id,
        name: doc.name || unnamed,
        owner: doc.owner,
        role: doc.role,
        createdAt: created,
        modifiedAt: parseDate(doc.modifiedAt) || created,
        doc,
      };
    });
  }, [visibleDocuments, t]);

  const selectedDoc = React.useMemo(
    () => visibleDocuments.find((doc) => doc.id === selectedId) ?? null,
    [visibleDocuments, selectedId],
  );

  const formatDate = React.useCallback(
    (value: number | string | null): string => {
      const time = typeof value === 'number' ? value : parseDate(value);
      if (!time) return t('documents.states.noDate');
      return new Date(time).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    [i18n.language, t],
  );

  const formatModified = React.useCallback(
    (doc: DocumentSummary): string =>
      t('documents.states.modifiedAt', { date: formatDate(doc.modifiedAt) }),
    [formatDate, t],
  );

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleFilterChange = React.useCallback(
    (next: DocumentFilter) => {
      setFilter(next);
      setSelectedId(null);
    },
    [setFilter],
  );

  const handleViewChange = React.useCallback((next: DocumentsView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // localStorage 不可用（隐私模式等）——仅跳过持久化
    }
  }, []);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
  }, [queryClient]);

  const handleLogout = React.useCallback(async () => {
    await AuthSession.logout();
    navigate('/login');
  }, [navigate]);

  const openDocument = React.useCallback(
    (doc: DocumentSummary) => {
      if (doc.id) {
        navigate(`/documents/${doc.id}`);
      }
    },
    [navigate],
  );

  const toggleFavorite = React.useCallback(
    (doc: DocumentSummary) => {
      const wasFavorite = favoriteIds.has(doc.id);
      favoriteMutation.mutate(
        { id: doc.id, favorite: !wasFavorite },
        {
          onError: (mutationError) => {
            // web-next 暂无全局 toast 设施——失败态 console 留痕（旧应用 toast 的降级）。
            console.error(t('documents.states.favoriteFailed'), mutationError);
          },
        },
      );
    },
    [favoriteIds, favoriteMutation, t],
  );

  const handleDeleteConfirm = React.useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (deleteFailure) {
      // 失败不静默：内联呈现错误并保持对话框在场承接重试（RenameDialog 同口径）。
      setDeleteError(
        deleteFailure instanceof Error && deleteFailure.message
          ? deleteFailure.message
          : t('documents.states.deleteFailed'),
      );
    }
  }, [deleteTarget, deleteMutation, selectedId, t]);

  // 行/卡操作菜单（Table 行尾 + Tile moreOptions 共用）
  const buildMenuItems = React.useCallback(
    (doc: DocumentSummary, close: () => void): React.JSX.Element[] => {
      const isFavorite = favoriteIds.has(doc.id);
      return [
        <MenuItem
          key="open"
          startIcon={<SvgFolderOpened />}
          onClick={() => {
            close();
            openDocument(doc);
          }}
        >
          {t('documents.actions.open')}
        </MenuItem>,
        <MenuItem
          key="details"
          startIcon={<SvgInfo />}
          onClick={() => {
            close();
            setSelectedId(doc.id);
          }}
        >
          {t('documents.actions.details')}
        </MenuItem>,
        <MenuItem
          key="rename"
          startIcon={<SvgRename />}
          onClick={() => {
            close();
            setRenameTarget(doc);
          }}
        >
          {t('documents.actions.rename')}
        </MenuItem>,
        <MenuItem
          key="favorite"
          startIcon={isFavorite ? <SvgStarHollow /> : <SvgStar />}
          onClick={() => {
            close();
            toggleFavorite(doc);
          }}
        >
          {isFavorite ? t('documents.actions.unfavorite') : t('documents.actions.favorite')}
        </MenuItem>,
        <MenuItem
          key="share"
          startIcon={<SvgShare />}
          onClick={() => {
            close();
            setShareTarget(doc);
          }}
        >
          {t('documents.actions.share')}
        </MenuItem>,
        <MenuItem
          key="delete"
          className="documents-menu-item-danger"
          startIcon={<SvgDelete />}
          onClick={() => {
            close();
            setDeleteError('');
            setDeleteTarget(doc);
          }}
        >
          {t('documents.actions.delete')}
        </MenuItem>,
      ];
    },
    [favoriteIds, openDocument, toggleFavorite, t],
  );

  // -----------------------------------------------------------------------
  // 内容六态：加载 / 错误 / 搜索空 / 筛选空 / 表格 / 网格
  // -----------------------------------------------------------------------
  const loadingState = (
    <div className="documents-loading">
      <ProgressRadial size="large" indeterminate />
      <Text>{t('documents.states.loading')}</Text>
    </div>
  );

  const errorState = (
    <NonIdealState
      className="documents-nonideal"
      svg={<SvgStatusError />}
      heading={t('documents.states.errorTitle')}
      description={error instanceof Error ? error.message : undefined}
      actions={
        <Button styleType="high-visibility" onClick={refresh} startIcon={<SvgRefresh />}>
          {t('documents.actions.retry')}
        </Button>
      }
    />
  );

  const searchEmptyState = (
    <NonIdealState
      className="documents-nonideal"
      svg={<SvgSearch />}
      heading={t('documents.search.noResults')}
      description={t('documents.search.noResultsHint')}
      actions={
        <Button styleType="default" startIcon={<SvgCloseSmall />} onClick={() => setSearchQuery('')}>
          {t('documents.actions.clearSearch')}
        </Button>
      }
    />
  );

  const filterEmptyState = (
    <NonIdealState
      className="documents-nonideal"
      svg={<SvgSearch />}
      heading={t(`documents.empty.${filter}Title`)}
      description={t(`documents.empty.${filter}Description`)}
      actions={
        filter === 'my' ? (
          <Button
            styleType="high-visibility"
            startIcon={<SvgAdd />}
            onClick={() => setIsCreateOpen(true)}
          >
            {t('documents.createMenu.newDocument')}
          </Button>
        ) : undefined
      }
    />
  );

  const sectionTitle = isSearching
    ? t('documents.section.searchResults', { query: searchQuery })
    : t(`documents.filters.${filter}`);

  const renderContent = (): React.ReactNode => {
    if (isLoading) return loadingState;
    if (error) return errorState;
    if (visibleDocuments.length === 0) return isSearching ? searchEmptyState : filterEmptyState;
    if (view === 'table') {
      return (
        <DocumentTable
          rows={rows}
          sort={sort}
          emptyContent={filterEmptyState}
          formatDate={formatDate}
          buildMenuItems={buildMenuItems}
          onSortChange={setSort}
          onRowClick={(doc) => setSelectedId(doc.id)}
          onRowOpen={openDocument}
          isSelected={(id) => selectedId === id}
        />
      );
    }
    return (
      <DocumentGrid
        documents={visibleDocuments}
        isFavorite={(id) => favoriteIds.has(id)}
        isSelected={(id) => selectedId === id}
        formatModified={formatModified}
        buildMenuItems={buildMenuItems}
        onOpen={openDocument}
        onToggleFavorite={toggleFavorite}
      />
    );
  };

  return (
    <div className="documents-page">
      {/* 顶栏 — Onshape IA：品牌（回文档首页）/ 居中搜索 / 用户菜单（os-03） */}
      <Header
        className="documents-header"
        appLogo={
          <HeaderLogo
            logo={<div className="documents-logo-mark">LC</div>}
            onClick={() => navigate('/documents')}
          >
            {t('common.app.name')}
          </HeaderLogo>
        }
        actions={[
          <DropdownMenu
            key="user-menu"
            menuItems={[
              <MenuItem key="account" onClick={() => navigate('/settings')}>
                {t('documents.userMenu.account')}
              </MenuItem>,
              <MenuItem
                key="theme"
                onClick={toggleTheme}
                startIcon={theme === 'dark' ? <SvgCheckmark /> : undefined}
              >
                {t('documents.userMenu.darkMode')}
              </MenuItem>,
              <MenuItem key="logout" onClick={() => void handleLogout()}>
                {t('documents.userMenu.logout')}
              </MenuItem>,
            ]}
          >
            <IconButton label={t('documents.userMenu.open')} styleType="borderless">
              <Avatar
                title={user?.name || user?.email}
                abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
                image={user?.avatar ? <img src={user.avatar} alt="" /> : undefined}
              />
            </IconButton>
          </DropdownMenu>,
        ]}
      >
        <SearchBox
          className="documents-search"
          inputProps={{
            placeholder: t('documents.search.placeholder'),
            value: searchQuery,
            onChange: (event) => setSearchQuery(event.target.value),
            'aria-label': t('documents.search.placeholder'),
          }}
        />
      </Header>

      {/* 主体：左栏（创建 ▾ + 五筛选）+ 主区（工具条 + 内容 + 详情侧栏） */}
      <Flex className="documents-content" flexDirection="row">
        <DocumentSidebar
          activeFilter={filter}
          onFilterChange={handleFilterChange}
          onCreateDocument={() => setIsCreateOpen(true)}
          onGatedAction={setGatedAction}
        />

        <main className="documents-main">
          <DocumentToolbar
            title={sectionTitle}
            count={visibleDocuments.length}
            showCount={!isLoading && !error}
            sort={sort}
            onSortChange={setSort}
            view={view}
            onViewChange={handleViewChange}
            onRefresh={refresh}
            isRefreshing={isFetching}
          />

          <div className="documents-body">
            <InformationPanelWrapper className="documents-body__wrapper">
              {renderContent()}
              {selectedDoc && (
                <DocumentInfoPanel
                  doc={selectedDoc}
                  formatDate={formatDate}
                  onClose={() => setSelectedId(null)}
                />
              )}
            </InformationPanelWrapper>
          </div>
        </main>
      </Flex>

      {/* 新建文档 */}
      <CreateDocumentDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={refresh}
      />

      {/* 重命名 */}
      <RenameDocumentDialog
        key={renameTarget?.id}
        doc={renameTarget}
        isOpen={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={refresh}
      />

      {/* 分享（成员/邀请/链接三页签） */}
      <ShareDocumentDialog
        doc={shareTarget}
        isOpen={!!shareTarget}
        onClose={() => setShareTarget(null)}
      />

      {/* 删除确认（危险操作 HITL；失败内联呈现错误，不静默） */}
      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => {
          setDeleteError('');
          setDeleteTarget(null);
        }}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('documents.deleteDialog.title')}
          className="documents-dialog"
        >
          <Dialog.TitleBar titleText={t('documents.deleteDialog.title')} />
          <Dialog.Content>
            {deleteError && (
              <Text color="negative" className="documents-dialog__error">
                {deleteError}
              </Text>
            )}
            <Text>
              {t('documents.deleteDialog.message', { name: deleteTarget?.name ?? '' })}
            </Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              {t('documents.deleteDialog.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="documents-danger-button"
              onClick={() => void handleDeleteConfirm()}
              loading={deleteMutation.isPending}
              disabled={deleteMutation.isPending}
            >
              {t('documents.deleteDialog.confirm')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* 创建菜单 🟠 gated 项能力引导 */}
      <CapabilityDialog action={gatedAction} onClose={() => setGatedAction(null)} />
    </div>
  );
}
