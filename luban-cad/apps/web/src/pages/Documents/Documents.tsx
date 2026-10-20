/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Documents 页（RW4-P2-T2-2 Onshape 文档中心 IA 重做）：
 * - 顶栏 Header：HeaderLogo 品牌 + 居中 SearchBox（Onshape IA 核心识别特征）+
 *   新建按钮 + ThemeToggle + Avatar；自绘 topbar 退役
 * - SideNavigation 四筛选；「与我共享」改真数据——listITwins 全量（$top=200+跟页聚合）
 *   派生 `createdBy !== 我`（即 role!=='owner'）过滤，假回落 case 'shared' 已删
 * - 主区 Table/Tile 双视图（SvgList/SvgGrid 切换，localStorage 记忆偏好；默认 Tile——
 *   e2e 契约 `main` 内 Tile role=button 按项目名定位依赖 Tile 形态在场）
 * - Table 列=缩略图(useITwinImage+SvgProject 回退)/名称/所有者/角色 Tag/创建·更新时间；
 *   列头排序（名称/创建/更新，manualSortBy 受控态统一驱动双视图）
 * - 行级 DropdownMenu（右键 onContextMenu + 行尾 IconButton 双触发）：打开/详情/重命名
 *   （EditITwinDialog 复用）/收藏 toggle/分享（占位禁用+「即将上线 P3」）/删除（危险确认
 *   Dialog——window.confirm 不许用）
 * - 右侧 InformationPanel 详情侧栏（选中行：大缩略图/所有者/角色/创建·更新时间/描述）
 * - 空态 NonIdealState 替换 6 个内联 SVG；双 setTimeout 切换动画已删
 * e2e 契约锚点：.section-title（helpers 登录门）/main 内 Tile role=button/
 * 「新建项目」「退出登录」/空态语义 /暂无项目/。
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Column } from '@itwin/itwinui-react/react-table';
import {
  Avatar,
  Button,
  Dialog,
  DropdownMenu,
  Flex,
  Header,
  HeaderLogo,
  IconButton,
  InformationPanel,
  InformationPanelBody,
  InformationPanelHeader,
  InformationPanelWrapper,
  MenuItem,
  NonIdealState,
  ProgressRadial,
  SearchBox,
  SidenavButton,
  SideNavigation,
  Table,
  Tag,
  Text,
  Tile,
} from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgClock,
  SvgCloseSmall,
  SvgDelete,
  SvgExit,
  SvgFolderOpened,
  SvgGrid,
  SvgInfo,
  SvgList,
  SvgMoreVertical,
  SvgProject,
  SvgRefresh,
  SvgRename,
  SvgSearch,
  SvgShare,
  SvgStar,
  SvgStarHollow,
  SvgStatusError,
} from '@itwin/itwinui-icons-react';
import type { ITwin } from '@itwin/itwins-client';
import { useUser } from '../../../app/contexts/UserContext.js';
import {
  useAddToFavoritesMutation,
  useDeleteITwinMutation,
  useFavoriteITwinsQuery,
  useITwinsQuery,
  useRecentITwinsQuery,
  useRemoveFromFavoritesMutation,
} from '../../../features/itwin/hooks/useITwinsQuery.js';
import { CreateITwinDialog } from '../../../features/itwin/components/CreateITwinDialog.js';
import { EditITwinDialog } from '../../../features/itwin/components/EditITwinDialog.js';
import { ThemeToggle } from '../../../features/editor/components/ThemeToggle.js';
import { useAppToast } from '../../../shared/hooks/useAppToast.js';
import { useITwinImage } from '../../../shared/hooks/useITwinImage.js';
import { DocumentsSkeleton } from '../../../shared/components/skeletons/DocumentsSkeleton.js';
import './Documents.css';

// ============================================================================
// Types & constants
// ============================================================================

type FilterType = 'recent' | 'favorites' | 'my' | 'shared';
type ViewMode = 'tile' | 'table';
type SortId = 'name' | 'createdAt' | 'modifiedAt';

interface SortState {
  id: SortId;
  desc: boolean;
}

/** 本 hub 列表项实际携带的时间/描述/创建者字段（官方 SDK ITwin 之外的超集） */
type DocumentITwin = ITwin & {
  description?: string;
  createdAt?: string;
  modifiedAt?: string;
  lastModifiedDateTime?: string;
};

/**
 * Table 行数据（type 而非 interface——itwinui Table 泛型约束为
 * `T extends Record<string, unknown>`，interface 无隐式索引签名（可被增补），
 * type alias 的对象字面量形态才满足约束）。标量字段供 accessor 排序，富内容进 Cell 渲染。
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- 见上：Table 泛型约束要求 type alias
type DocumentRow = {
  id: string;
  name: string;
  ownerLabel: string;
  role: 'owner' | 'member';
  createdAt: number;
  modifiedAt: number;
  description: string;
  itwin: DocumentITwin;
};

interface ProjectData {
  projects: DocumentITwin[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

/** 双视图偏好（Onshape 文档中心 IA：表格/网格记忆） */
const VIEW_STORAGE_KEY = 'luban-cad-documents-view';

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'tile';
  } catch {
    return 'tile';
  }
}

function formatDate(timestamp: number, language: string): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function parseDate(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// ============================================================================
// Presentational subcomponents
// ============================================================================

/** 缩略图：useITwinImage 认证加载，无图/失败回退 SvgProject 占位 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const ProjectThumbnail: React.FC<{ iTwinId: string | null | undefined; large?: boolean }> = ({
  iTwinId,
  large,
}) => {
  const objectUrl = useITwinImage(iTwinId);
  if (objectUrl) {
    return <img className={large ? 'doc-thumb-img doc-thumb-img--large' : 'doc-thumb-img'} src={objectUrl} alt="" />;
  }
  return <SvgProject className={large ? 'doc-thumb-icon doc-thumb-icon--large' : 'doc-thumb-icon'} />;
};

/** 搜索命中高亮（保留旧版行为） */
// eslint-disable-next-line @typescript-eslint/naming-convention
const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="doc-search-highlight">{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};

/** 角色标签：owner=正面 / member=中性（诚实口径：本 hub 成员 roles 恒空，
 * editor/viewer 细分待 P3 Share 波接真实成员数据后补） */
// eslint-disable-next-line @typescript-eslint/naming-convention
const RoleTag: React.FC<{ role: DocumentRow['role']; label: string }> = ({ role, label }) => (
  <Tag className={role === 'owner' ? 'doc-role doc-role--owner' : 'doc-role doc-role--member'}>
    {label}
  </Tag>
);

// ============================================================================
// Page
// ============================================================================

// eslint-disable-next-line @typescript-eslint/naming-convention
const Documents: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { user, logout, isLoading: isUserLoading } = useUser();
  const { showToast } = useAppToast();

  const [activeFilter, setActiveFilter] = useState<FilterType>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [sort, setSort] = useState<SortState>({ id: 'modifiedAt', desc: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: DocumentRow } | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

  // Use React Query hooks based on active filter（全量列表常开——shared 筛选从它派生）
  const allProjects = useITwinsQuery();
  const recentProjects = useRecentITwinsQuery(activeFilter === 'recent');
  const favoriteProjects = useFavoriteITwinsQuery(true);

  const deleteITwinMutation = useDeleteITwinMutation();
  const addToFavoritesMutation = useAddToFavoritesMutation();
  const removeFromFavoritesMutation = useRemoveFromFavoritesMutation();

  // -----------------------------------------------------------------------
  // Role / shared derivation（真数据：createdBy 即 owner，否则为共享成员）
  // -----------------------------------------------------------------------
  const isOwnerOf = useCallback(
    (project: ITwin) => !!user?.id && !!project.createdBy && project.createdBy === user.id,
    [user?.id],
  );

  const sharedProjects = useMemo(
    () => (allProjects.data ?? []).filter((project) => !isOwnerOf(project)),
    [allProjects.data, isOwnerOf],
  );

  const favoriteIds = useMemo(
    () => new Set((favoriteProjects.data ?? []).map((project) => project.id)),
    [favoriteProjects.data],
  );

  const getCurrentData = (): ProjectData => {
    switch (activeFilter) {
      case 'recent':
        return {
          projects: (recentProjects.data ?? []),
          isLoading: recentProjects.isLoading,
          error: recentProjects.error,
          refresh: async () => recentProjects.refetch(),
        };
      case 'favorites':
        return {
          projects: (favoriteProjects.data ?? []),
          isLoading: favoriteProjects.isLoading,
          error: favoriteProjects.error,
          refresh: async () => favoriteProjects.refetch(),
        };
      case 'shared':
        return {
          projects: sharedProjects,
          isLoading: allProjects.isLoading,
          error: allProjects.error,
          refresh: async () => allProjects.refetch(),
        };
      case 'my':
      default:
        return {
          projects: (allProjects.data ?? []).filter(isOwnerOf),
          isLoading: allProjects.isLoading,
          error: allProjects.error,
          refresh: async () => allProjects.refetch(),
        };
    }
  };

  const { projects, isLoading, error, refresh } = getCurrentData();

  // -----------------------------------------------------------------------
  // Rows: filter (search) → sort（受控排序态统一驱动 Table 表头与 Tile 网格）
  // -----------------------------------------------------------------------
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter((project) =>
      project.displayName?.toLowerCase().includes(query) ||
      (project).description?.toLowerCase().includes(query),
    );
  }, [projects, searchQuery]);

  const rows = useMemo<DocumentRow[]>(() => {
    const unnamed = t('states.unnamed');
    return filteredProjects.map((project) => {
      const owner = isOwnerOf(project);
      const created = parseDate(project.createdDateTime ?? project.createdAt);
      return {
        id: project.id ?? '',
        name: project.displayName || unnamed,
        ownerLabel: owner ? (user?.name || user?.email || '—') : (project.createdBy ?? '—'),
        role: owner ? 'owner' : 'member',
        createdAt: created,
        modifiedAt: parseDate(project.lastModifiedDateTime ?? project.modifiedAt) || created,
        description: (project).description ?? '',
        itwin: project,
      };
    });
  }, [filteredProjects, isOwnerOf, t, user?.name, user?.email]);

  const sortedRows = useMemo<DocumentRow[]>(() => {
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sort.id === 'name') {
        return dir * a.name.localeCompare(b.name, i18n.language, { sensitivity: 'base' });
      }
      return dir * (a[sort.id] - b[sort.id]);
    });
  }, [rows, sort, i18n.language]);

  const selectedRow = useMemo(
    () => sortedRows.find((row) => row.id === selectedId) ?? null,
    [sortedRows, selectedId],
  );

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleFilterChange = useCallback((filter: FilterType) => {
    setActiveFilter(filter);
    setSelectedId(null);
  }, []);

  const handleViewChange = useCallback((next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // localStorage 不可用（隐私模式等）——仅跳过持久化
    }
  }, []);

  // 列头排序回调（manualSortBy 受控态：onSort 回传 react-table 状态）
  const handleTableSort = useCallback(
    (state: { sortBy: ReadonlyArray<{ id?: string; desc?: boolean }> }) => {
      const first = state.sortBy[0];
      if (first?.id && (first.id === 'name' || first.id === 'createdAt' || first.id === 'modifiedAt')) {
        setSort({ id: first.id, desc: first.desc ?? false });
      }
    },
    [],
  );

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const handleProjectClick = useCallback((project: { id?: string }) => {
    if (project.id) {
      navigate(`/documents/${project.id}`);
    }
  }, [navigate]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const toggleFavorite = useCallback(
    (row: DocumentRow) => {
      const wasFavorite = favoriteIds.has(row.id);
      const mutate = wasFavorite ? removeFromFavoritesMutation : addToFavoritesMutation;
      mutate.mutate(row.id, {
        onSuccess: () => {
          showToast(t(wasFavorite ? 'states.unfavoriteSuccess' : 'states.favoriteSuccess'), 'success');
        },
        onError: () => showToast(t('states.favoriteFailed'), 'error'),
      });
    },
    [favoriteIds, addToFavoritesMutation, removeFromFavoritesMutation, showToast, t],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteITwinMutation.mutateAsync(deleteTarget.id);
      showToast(t('states.deleteSuccess'), 'success');
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch {
      showToast(t('states.deleteFailed'), 'error');
    }
  }, [deleteTarget, deleteITwinMutation, showToast, t, selectedId]);

  // 右键菜单（Table 行 + Tile 卡共用）：定位到光标处打开
  const openContextMenu = useCallback(
    (row: DocumentRow, event: { clientX: number; clientY: number; preventDefault: () => void }) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, row });
      setIsContextMenuOpen(true);
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setIsContextMenuOpen(false);
    setContextMenu(null);
  }, []);

  // 行点击选中（Table 要求 handler memoized）；双击导航/右键菜单走 rowProps
  const handleRowClick = useCallback(
    (_event: unknown, row: { original: DocumentRow }) => setSelectedId(row.original.id),
    [],
  );

  const handleRowProps = useCallback(
    (row: { original: DocumentRow }) => ({
      className: selectedId === row.original.id ? 'doc-table-row doc-table-row--selected' : 'doc-table-row',
      onContextMenu: (event: React.MouseEvent) => openContextMenu(row.original, event),
      onDoubleClick: () => handleProjectClick(row.original),
    }),
    [selectedId, openContextMenu, handleProjectClick],
  );

  const buildRowMenuItems = useCallback(
    (row: DocumentRow, close: () => void): React.JSX.Element[] => {
      const isFavorite = favoriteIds.has(row.id);
      return [
        <MenuItem
          key="open"
          startIcon={<SvgFolderOpened />}
          onClick={() => {
            close();
            handleProjectClick(row);
          }}
        >
          {t('actions.open')}
        </MenuItem>,
        <MenuItem
          key="details"
          startIcon={<SvgInfo />}
          onClick={() => {
            close();
            setSelectedId(row.id);
          }}
        >
          {t('actions.details')}
        </MenuItem>,
        <MenuItem
          key="rename"
          startIcon={<SvgRename />}
          onClick={() => {
            close();
            setEditTarget(row);
          }}
        >
          {t('actions.rename')}
        </MenuItem>,
        <MenuItem
          key="favorite"
          startIcon={isFavorite ? <SvgStarHollow /> : <SvgStar />}
          onClick={() => {
            close();
            toggleFavorite(row);
          }}
        >
          {isFavorite ? t('actions.unfavorite') : t('actions.favorite')}
        </MenuItem>,
        <MenuItem key="share" disabled startIcon={<SvgShare />} sublabel={t('share.comingSoon')}>
          {t('actions.share')}
        </MenuItem>,
        <MenuItem
          key="delete"
          className="doc-menu-item-danger"
          startIcon={<SvgDelete />}
          onClick={() => {
            close();
            setDeleteTarget(row);
          }}
        >
          {t('actions.delete')}
        </MenuItem>,
      ];
    },
    [favoriteIds, handleProjectClick, t, toggleFavorite],
  );

  // -----------------------------------------------------------------------
  // Table columns
  // -----------------------------------------------------------------------
  // react-table 的 Column API 要求 PascalCase 键（Header/Cell）——库契约，非本项目命名
  /* eslint-disable @typescript-eslint/naming-convention */
  const columns = useMemo<Column<DocumentRow>[]>(() => [
    {
      id: 'name',
      Header: t('table.name'),
      accessor: 'name',
      Cell: ({ row }) => (
        <span className="doc-name-cell">
          <ProjectThumbnail iTwinId={row.original.id} />
          <span className="doc-name-text">
            <HighlightText text={row.original.name} query={searchQuery} />
          </span>
        </span>
      ),
    },
    {
      id: 'owner',
      Header: t('table.owner'),
      accessor: 'ownerLabel',
      disableSortBy: true,
    },
    {
      id: 'role',
      Header: t('table.role'),
      accessor: 'role',
      disableSortBy: true,
      Cell: ({ row }) => (
        <RoleTag role={row.original.role} label={t(row.original.role === 'owner' ? 'role.owner' : 'role.member')} />
      ),
    },
    {
      id: 'createdAt',
      Header: t('table.createdAt'),
      accessor: 'createdAt',
      Cell: ({ row }) => <>{formatDate(row.original.createdAt, i18n.language)}</>,
    },
    {
      id: 'modifiedAt',
      Header: t('table.modifiedAt'),
      accessor: 'modifiedAt',
      Cell: ({ row }) => <>{formatDate(row.original.modifiedAt, i18n.language)}</>,
    },
    {
      id: 'actions',
      Header: '',
      disableSortBy: true,
      Cell: ({ row }) => (
        // stopPropagation：菜单按钮不触发行选中/双击导航
        <div className="doc-row-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <DropdownMenu menuItems={(close) => buildRowMenuItems(row.original, close)}>
            <IconButton label={t('table.rowActions')} styleType="borderless">
              <SvgMoreVertical />
            </IconButton>
          </DropdownMenu>
        </div>
      ),
    },
  ], [t, searchQuery, i18n.language, buildRowMenuItems]);
  /* eslint-enable @typescript-eslint/naming-convention */

  // -----------------------------------------------------------------------
  // Sidebar / empty states
  // -----------------------------------------------------------------------
  // 渲染组件引用按 PascalCase 惯例命名（`Icon`），非数据字段
  /* eslint-disable @typescript-eslint/naming-convention */
  const sidebarItems = [
    { id: 'recent' as FilterType, label: t('filters.recent'), Icon: SvgClock },
    { id: 'favorites' as FilterType, label: t('filters.favorites'), Icon: SvgStar },
    { id: 'my' as FilterType, label: t('filters.my'), Icon: SvgFolderOpened },
    { id: 'shared' as FilterType, label: t('filters.shared'), Icon: SvgShare },
  ];
  /* eslint-enable @typescript-eslint/naming-convention */

  const getFilterLabel = useCallback((f: FilterType): string => t(`filters.${f}`), [t]);

  // 空态配置的 `Icon` 键承载组件引用（惯例 PascalCase），非数据字段
  /* eslint-disable @typescript-eslint/naming-convention */
  const emptyState = (() => {
    switch (activeFilter) {
      case 'recent':
        return {
          Icon: SvgClock,
          title: t('empty.recentTitle'),
          description: t('empty.recentDescription'),
        };
      case 'favorites':
        return {
          Icon: SvgStar,
          title: t('empty.favoritesTitle'),
          description: t('empty.favoritesDescription'),
          secondaryAction: { label: t('empty.viewAll'), onClick: () => handleFilterChange('my') },
        };
      case 'shared':
        return {
          Icon: SvgShare,
          title: t('empty.sharedTitle'),
          description: t('empty.sharedDescription'),
        };
      case 'my':
      default:
        return {
          Icon: SvgFolderOpened,
          title: t('empty.myTitle'),
          description: t('empty.myDescription'),
          action: { label: t('actions.create'), onClick: () => setIsCreateDialogOpen(true) },
        };
    }
  })();
  /* eslint-enable @typescript-eslint/naming-convention */

  const searchEmptyState = (
    <NonIdealState
      className="doc-nonideal"
      svg={<SvgSearch />}
      heading={t('search.noResults')}
      description={t('search.noResultsHint')}
      actions={
        <Button
          styleType="default"
          startIcon={<SvgCloseSmall />}
          onClick={() => setSearchQuery('')}
        >
          {t('actions.clearSearch')}
        </Button>
      }
    />
  );

  const filterEmptyState = (
    <NonIdealState
      className="doc-nonideal"
      svg={<emptyState.Icon />}
      heading={emptyState.title}
      description={emptyState.description}
      actions={
        <>
          {emptyState.action && (
            <Button styleType="high-visibility" startIcon={<SvgAdd />} onClick={emptyState.action.onClick}>
              {emptyState.action.label}
            </Button>
          )}
          {emptyState.secondaryAction && (
            <Button styleType="default" onClick={emptyState.secondaryAction.onClick}>
              {emptyState.secondaryAction.label}
            </Button>
          )}
        </>
      }
    />
  );

  const errorState = (
    <NonIdealState
      className="doc-nonideal"
      svg={<SvgStatusError />}
      heading={t('states.errorTitle')}
      description={error?.message}
      actions={
        <Button styleType="high-visibility" onClick={refresh} startIcon={<SvgRefresh />}>
          {t('actions.retry')}
        </Button>
      }
    />
  );

  const loadingState = (
    <div className="doc-loading">
      <ProgressRadial size="large" indeterminate />
      <Text>{t('states.loading')}</Text>
    </div>
  );

  const isSearching = searchQuery.trim().length > 0;

  const renderContent = () => {
    if (isLoading) return loadingState;
    if (error) return errorState;
    if (sortedRows.length === 0) return isSearching ? searchEmptyState : filterEmptyState;

    if (view === 'table') {
      return (
        <Table<DocumentRow>
          className="doc-table"
          columns={columns}
          data={sortedRows}
          emptyTableContent={isSearching ? searchEmptyState : filterEmptyState}
          isSortable
          manualSortBy
          onSort={handleTableSort}
          initialState={{ sortBy: [{ id: sort.id, desc: sort.desc }] }}
          onRowClick={handleRowClick}
          rowProps={handleRowProps}
        />
      );
    }

    return (
      <div className="doc-grid">
        {sortedRows.map((row) => (
          <Tile
            key={row.id}
            name={<HighlightText text={row.name} query={searchQuery} />}
            description={t('states.createdAt', { date: formatDate(row.createdAt, i18n.language) })}
            thumbnail={<ProjectThumbnail iTwinId={row.id} />}
            isActionable
            onClick={() => handleProjectClick(row)}
            onContextMenu={(event: React.MouseEvent) => openContextMenu(row, event)}
          />
        ))}
      </div>
    );
  };

  // Show skeleton during initial loading
  if (isUserLoading) {
    return <DocumentsSkeleton view={view} />;
  }

  return (
    <div className="itwins-page">
      {/* Topbar — Onshape IA：品牌 / 居中搜索 / 右侧动作 */}
      <Header
        className="documents-header"
        appLogo={
          <HeaderLogo logo={<div className="logo-mark">CC</div>}>{tCommon('app.name')}</HeaderLogo>
        }
        actions={[
          <Button
            key="create"
            styleType="high-visibility"
            startIcon={<SvgAdd />}
            onClick={() => setIsCreateDialogOpen(true)}
          >
            {t('actions.create')}
          </Button>,
          <ThemeToggle key="theme" />,
          <IconButton
            key="user"
            label={t('actions.settings')}
            styleType="borderless"
            onClick={handleSettings}
          >
            <Avatar
              title={user?.name || user?.email}
              abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
            />
          </IconButton>,
        ]}
      >
        <SearchBox
          className="documents-search"
          inputProps={{
            placeholder: t('search.placeholder'),
            value: searchQuery,
            onChange: (event) => setSearchQuery(event.target.value),
            'aria-label': t('search.placeholder'),
          }}
        />
      </Header>

      {/* Body */}
      <Flex className="content" flexDirection="row">
        {/* Sidebar — 四筛选（与我共享=真数据） */}
        <SideNavigation
          className="sidebar"
          items={sidebarItems.map((item) => (
            <SidenavButton
              key={item.id}
              startIcon={<item.Icon />}
              isActive={activeFilter === item.id}
              onClick={() => handleFilterChange(item.id)}
            >
              {item.label}
            </SidenavButton>
          ))}
          secondaryItems={[
            <SidenavButton key="logout" startIcon={<SvgExit />} onClick={handleLogout}>
              {t('actions.logout')}
            </SidenavButton>,
          ]}
        />

        {/* Main */}
        <main className="main">
          <div className="section-header">
            <div className="section-title-wrapper">
              <Text variant="title" as="h2" className="section-title">
                {isSearching ? t('section.searchResults', { query: searchQuery }) : getFilterLabel(activeFilter)}
              </Text>
              {!isLoading && !error && (
                <Text variant="small" className="item-count">
                  {t('section.count', { count: sortedRows.length })}
                </Text>
              )}
            </div>
            <div className="view-controls">
              <IconButton
                onClick={() => handleViewChange('tile')}
                isActive={view === 'tile'}
                label={t('view.tile')}
                styleType="borderless"
              >
                <SvgGrid />
              </IconButton>
              <IconButton
                onClick={() => handleViewChange('table')}
                isActive={view === 'table'}
                label={t('view.table')}
                styleType="borderless"
              >
                <SvgList />
              </IconButton>
              <IconButton
                onClick={refresh}
                disabled={isLoading}
                label={t('actions.refresh')}
                styleType="borderless"
              >
                <SvgRefresh className={isLoading ? 'spin' : ''} />
              </IconButton>
            </div>
          </div>

          <InformationPanelWrapper className="content-area">
            {renderContent()}

            {/* 详情侧栏：选中行 → 大缩略图/所有者/角色/时间/描述 */}
            <InformationPanel
              isOpen={!!selectedRow}
              orientation="vertical"
              className="doc-info-panel"
            >
              <InformationPanelHeader
                onClose={() => setSelectedId(null)}
                className="doc-info-panel-header"
              >
                <Text variant="subheading">{t('info.title')}</Text>
              </InformationPanelHeader>
              <InformationPanelBody>
                {selectedRow && (
                  <div className="doc-info-body">
                    <div className="doc-info-thumb">
                      <ProjectThumbnail iTwinId={selectedRow.id} large />
                    </div>
                    <Text variant="title" as="h3" className="doc-info-name">
                      {selectedRow.name}
                    </Text>
                    <dl className="doc-info-list">
                      <dt>{t('info.owner')}</dt>
                      <dd>{selectedRow.ownerLabel}</dd>
                      <dt>{t('info.role')}</dt>
                      <dd>
                        <RoleTag
                          role={selectedRow.role}
                          label={t(selectedRow.role === 'owner' ? 'role.owner' : 'role.member')}
                        />
                      </dd>
                      <dt>{t('info.createdAt')}</dt>
                      <dd>{formatDate(selectedRow.createdAt, i18n.language)}</dd>
                      <dt>{t('info.modifiedAt')}</dt>
                      <dd>{formatDate(selectedRow.modifiedAt, i18n.language)}</dd>
                      <dt>{t('info.description')}</dt>
                      <dd>{selectedRow.description || t('info.noDescription')}</dd>
                    </dl>
                  </div>
                )}
              </InformationPanelBody>
            </InformationPanel>
          </InformationPanelWrapper>
        </main>
      </Flex>

      {/* 右键菜单：固定定位锚点 + 受控 DropdownMenu（Table/Tile 双视图共用） */}
      {contextMenu && (
        <DropdownMenu
          menuItems={(close) => buildRowMenuItems(contextMenu.row, close)}
          visible={isContextMenuOpen}
          onVisibleChange={(open) => (open ? setIsContextMenuOpen(true) : closeContextMenu())}
          placement="bottom-start"
        >
          <span
            aria-hidden="true"
            className="doc-context-menu-anchor"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          />
        </DropdownMenu>
      )}

      {/* Create Dialog（逻辑保留，文案进 documents ns） */}
      <CreateITwinDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreated={refresh}
      />

      {/* Rename Dialog（EditITwinDialog 复用） */}
      <EditITwinDialog
        key={editTarget?.id}
        iTwin={editTarget?.itwin ?? null}
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          showToast(t('states.editSaved'), 'success');
          setEditTarget(null);
          void refresh();
        }}
      />

      {/* Delete 危险确认 Dialog（window.confirm 退役） */}
      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main styleType="default" title={t('deleteDialog.title')} className="doc-delete-dialog">
          <Dialog.TitleBar title={t('deleteDialog.title')} />
          <Dialog.Content>
            <Text>{t('deleteDialog.message', { name: deleteTarget?.name ?? '' })}</Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteITwinMutation.isPending}
            >
              {t('deleteDialog.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="doc-danger-button"
              onClick={handleDeleteConfirm}
              loading={deleteITwinMutation.isPending}
              disabled={deleteITwinMutation.isPending}
            >
              {t('deleteDialog.confirm')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </div>
  );
});

Documents.displayName = 'Documents';

export default Documents;
