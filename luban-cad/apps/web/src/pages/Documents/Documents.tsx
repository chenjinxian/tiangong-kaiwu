/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  IconButton,
  Input,
  Tile,
  Avatar,
  Text,
  ProgressRadial,
  SideNavigation,
  SidenavButton,
  Flex,
} from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgChevronRight,
  SvgClock,
  SvgClose,
  SvgExit,
  SvgFolder,
  SvgRefresh,
  SvgSearch,
  SvgShare,
  SvgStar,
  SvgProject,
} from '@itwin/itwinui-icons-react';
import { useUser } from '../../../app/contexts/UserContext.js';
import {
  useRecentITwinsQuery,
  useFavoriteITwinsQuery,
  useITwinsQuery,
} from '../../../features/itwin/hooks/useITwinsQuery.js';
import type { ITwin } from '@itwin/itwins-client';
import { CreateITwinDialog } from '../../../features/itwin/components/CreateITwinDialog.js';
import { ThemeToggle } from '../../../features/editor/components/ThemeToggle.js';
import { DocumentsSkeleton } from '../../../shared/components/skeletons/DocumentsSkeleton.js';
import './Documents.css';

type FilterType = 'recent' | 'favorites' | 'my' | 'shared';

interface ProjectData {
  projects: ITwin[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

interface EmptyStateConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Documents page - OnShape style document center
 * Uses iTwinUI components for consistent design
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const Documents: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { user, logout, isLoading: isUserLoading } = useUser();

  const [activeFilter, setActiveFilter] = useState<FilterType>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const transitionTimerRef = useRef<number | null>(null);

  // Use React Query hooks based on active filter
  const myProjects = useITwinsQuery({ enabled: activeFilter === 'my' });
  const recentProjects = useRecentITwinsQuery(activeFilter === 'recent');
  const favoriteProjects = useFavoriteITwinsQuery(activeFilter === 'favorites');

  // Cleanup transition timers on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const getCurrentData = (): ProjectData => {
    switch (activeFilter) {
      case 'recent':
        return {
          projects: recentProjects.data ?? [],
          isLoading: recentProjects.isLoading,
          error: recentProjects.error,
          refresh: () => recentProjects.refetch(),
        };
      case 'favorites':
        return {
          projects: favoriteProjects.data ?? [],
          isLoading: favoriteProjects.isLoading,
          error: favoriteProjects.error,
          refresh: () => favoriteProjects.refetch(),
        };
      case 'my':
      case 'shared':
      default:
        return {
          projects: myProjects.data ?? [],
          isLoading: myProjects.isLoading,
          error: myProjects.error,
          refresh: () => myProjects.refetch(),
        };
    }
  };

  const { projects, isLoading, error, refresh } = getCurrentData();

  // Handle filter change with animation
  const handleFilterChange = useCallback((filter: FilterType) => {
    if (filter === activeFilter) return;

    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }

    setIsTransitioning(true);
    transitionTimerRef.current = window.setTimeout(() => {
      setActiveFilter(filter);
      transitionTimerRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
        transitionTimerRef.current = null;
      }, 50);
    }, 150);
  }, [activeFilter]);

  // Filter and search projects
  const filteredProjects = React.useMemo(() => {
    let result = projects;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((project: ITwin) =>
        project.displayName?.toLowerCase().includes(query) ||
        (project as { description?: string }).description?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [projects, searchQuery]);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const handleProjectClick = useCallback((project: { id?: string }) => {
    if (project.id) {
      navigate(`/itwins/${project.id}`);
    }
  }, [navigate]);

  const getFilterLabel = useCallback((f: FilterType): string => {
    switch (f) {
      case 'recent':
        return '最近打开';
      case 'favorites':
        return '收藏项目';
      case 'my':
        return '我的项目';
      case 'shared':
        return '与我共享';
      default:
        return '项目';
    }
  }, []);

  // Inline SVG empty-state illustrations
  const recentIllustration = (
    <svg className="empty-state-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="32" cy="32" r="24" />
      <path d="M32 20v12l8 8" />
    </svg>
  );
  const favoritesIllustration = (
    <svg className="empty-state-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M32 12l6 16h16l-13 10 5 16-14-10-14 10 5-16-13-10h16z" />
    </svg>
  );
  const sharedIllustration = (
    <svg className="empty-state-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="20" cy="32" r="6" />
      <circle cx="48" cy="20" r="6" />
      <circle cx="48" cy="44" r="6" />
      <path d="M26 29l16-8M26 35l16 8" />
    </svg>
  );
  const folderIllustration = (
    <svg className="empty-state-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 16h20l6 8h22v28H8z" />
      <path d="M8 24h48" />
    </svg>
  );
  const searchIllustration = (
    <svg className="empty-state-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="28" cy="28" r="14" />
      <path d="M38 38l12 12" />
      <path d="M16 28h24" strokeDasharray="4 2" />
    </svg>
  );
  const errorIllustration = (
    <svg className="empty-state-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="32" cy="32" r="24" />
      <path d="M22 22l20 20M42 22L22 42" />
    </svg>
  );

  // Get empty state configuration based on filter
  const getEmptyStateConfig = useCallback((): EmptyStateConfig => {
    switch (activeFilter) {
      case 'recent':
        return {
          icon: recentIllustration,
          title: '暂无最近项目',
          description: '您打开的项目将显示在这里',
        };
      case 'favorites':
        return {
          icon: favoritesIllustration,
          title: '暂无收藏项目',
          description: '点击项目卡片上的星标来收藏',
          secondaryAction: {
            label: '查看所有项目',
            onClick: () => handleFilterChange('my'),
          },
        };
      case 'shared':
        return {
          icon: sharedIllustration,
          title: '暂无共享项目',
          description: '其他用户分享给您的项目将显示在这里',
        };
      case 'my':
      default:
        return {
          icon: folderIllustration,
          title: '暂无项目',
          description: '创建您的第一个 iTwin 项目',
          action: {
            label: '新建项目',
            onClick: () => setIsCreateDialogOpen(true),
          },
        };
    }
  }, [activeFilter, handleFilterChange]);

  const sidebarItems = [
    /* eslint-disable @typescript-eslint/naming-convention */
    { id: 'recent' as FilterType, label: '最近打开', Icon: SvgClock },
    { id: 'favorites' as FilterType, label: '收藏项目', Icon: SvgStar },
    { id: 'my' as FilterType, label: '我的项目', Icon: SvgFolder },
    { id: 'shared' as FilterType, label: '与我共享', Icon: SvgShare },
    /* eslint-enable @typescript-eslint/naming-convention */
  ];

  // Show skeleton during initial loading
  if (isUserLoading) {
    return <DocumentsSkeleton />;
  }

  const emptyState = getEmptyStateConfig();
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="itwins-page">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="logo-mark">CC</div>
          <Text className="logo-text">Open Cloud CAD</Text>
        </div>

        {/* Search bar */}
        <div className="search-bar">
          <SvgSearch className="search-icon" />
          <Input
            placeholder="搜索项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <IconButton
              onClick={() => setSearchQuery('')}
              label="清除搜索"
              aria-label="清除搜索"
              styleType="borderless"
            >
              <SvgClose />
            </IconButton>
          )}
        </div>

        <div className="topbar-actions">
          <Button
            styleType="high-visibility"
            startIcon={<SvgAdd />}
            onClick={() => setIsCreateDialogOpen(true)}
          >
            新建项目
          </Button>
          <ThemeToggle />
          <IconButton
            label="设置"
            styleType="borderless"
            onClick={handleSettings}
          >
            <Avatar
              title={user?.name || user?.email}
              abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
            />
          </IconButton>
        </div>
      </header>

      {/* Body */}
      <Flex className="content" flexDirection="row">
        {/* Sidebar - Using iTwinUI SideNavigation */}
        <SideNavigation
          className="sidebar"
          isExpanded={isExpanded}
          onExpanderClick={() => setIsExpanded((prev) => !prev)}
          items={sidebarItems.map((item) => (
            <SidenavButton
              key={item.id}
              startIcon={<item.Icon />}
              isActive={activeFilter === item.id}
              onClick={() => handleFilterChange(item.id)}
              style={!isExpanded ? { justifyContent: 'center', paddingInline: '0.75rem' } : { justifyContent: 'flex-start', paddingInline: '1.5rem' }}
            >
              {isExpanded ? item.label : null}
            </SidenavButton>
          ))}
          secondaryItems={[
            <SidenavButton
              key="logout"
              startIcon={<SvgExit />}
              onClick={handleLogout}
              style={!isExpanded ? { justifyContent: 'center', paddingInline: '0.75rem' } : { justifyContent: 'flex-start', paddingInline: '1.5rem' }}
            >
              {isExpanded ? '退出登录' : null}
            </SidenavButton>,
          ]}
        />

        {/* Main */}
        <main className="main">
          <div className="section-header">
            <div className="section-title-wrapper">
              <Text variant="title" as="h2" className="section-title">
                {isSearching ? `搜索: "${searchQuery}"` : getFilterLabel(activeFilter)}
              </Text>
              {!isLoading && !error && (
                <Text variant="small" className="item-count">
                  {filteredProjects.length} 个项目
                </Text>
              )}
            </div>
            <div className="view-controls">
              <IconButton
                onClick={refresh}
                disabled={isLoading}
                label="刷新"
                title="刷新"
                styleType="borderless"
              >
                <SvgRefresh className={isLoading ? 'spin' : ''} />
              </IconButton>
            </div>
          </div>

          <div className={`content-area ${isTransitioning ? 'transitioning' : ''}`}>
            {isLoading ? (
              <div className="loading-state">
                <ProgressRadial size="large" indeterminate />
                <Text>加载项目中...</Text>
              </div>
            ) : error ? (
              <div className="error-state">
                <div className="error-icon">
                  {errorIllustration}
                </div>
                <Text variant="title">加载失败</Text>
                <Text>{error.message}</Text>
                <Button styleType="high-visibility" onClick={refresh} startIcon={<SvgRefresh />}>
                  重试
                </Button>
              </div>
            ) : filteredProjects.length === 0 ? (
              isSearching ? (
                <div className="empty-state">
                  <div className="empty-icon">{searchIllustration}</div>
                  <Text variant="title" as="h3" className="empty-title">未找到匹配的项目</Text>
                  <Text className="empty-desc">尝试使用其他关键词搜索</Text>
                  <div className="empty-actions">
                    <Button
                      styleType="default"
                      startIcon={<SvgClose />}
                      onClick={() => setSearchQuery('')}
                    >
                      清除搜索
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">{emptyState.icon}</div>
                  <Text variant="title" as="h3" className="empty-title">{emptyState.title}</Text>
                  <Text className="empty-desc">{emptyState.description}</Text>
                  <div className="empty-actions">
                    {emptyState.action && (
                      <Button
                        styleType="high-visibility"
                        startIcon={<SvgAdd />}
                        onClick={emptyState.action.onClick}
                      >
                        {emptyState.action.label}
                      </Button>
                    )}
                    {emptyState.secondaryAction && (
                      <Button
                        styleType="default"
                        endIcon={<SvgChevronRight />}
                        onClick={emptyState.secondaryAction.onClick}
                      >
                        {emptyState.secondaryAction.label}
                      </Button>
                    )}
                  </div>
                </div>
              )
            ) : (
              <div className="grid">
                {filteredProjects.map((project, index) => (
                  <Tile
                    key={project.id}
                    name={isSearching ? (
                      <HighlightText text={project.displayName || '未命名项目'} query={searchQuery} />
                    ) : (
                      project.displayName || '未命名项目'
                    )}
                    description={`创建于 ${new Date((project as any).createdDateTime || (project as any).createdAt || Date.now()).toLocaleDateString('zh-CN')}`}
                    thumbnail={<SvgProject className="thumb-icon" />}
                    isActionable
                    onClick={() => handleProjectClick(project)}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </Flex>

      {/* Create Dialog */}
      <CreateITwinDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreated={refresh}
      />
    </div>
  );
});

/**
 * Highlight search query in text
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="search-highlight">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
};

// Display name for debugging
Documents.displayName = 'Documents';

export default Documents;
