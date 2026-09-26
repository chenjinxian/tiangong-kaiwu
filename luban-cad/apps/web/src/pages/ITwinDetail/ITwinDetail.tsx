/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  IconButton,
  Badge,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgChevronLeft,
  SvgDelete,
  SvgEdit,
  SvgRefresh,
  SvgSettings,
  SvgModel,
  SvgStatusError,
} from '@itwin/itwinui-icons-react';
import {
  useITwinQuery,
  useDeleteITwinMutation,
} from '../../../features/itwin/hooks/useITwinsQuery.js';
import {
  useIModels,
  useDeleteIModelMutation,
} from '../../../features/imodel/hooks/useIModelsQuery.js';
import {
  getDownloadUrl,
  retryIModel,
} from '../../../features/imodel/services/client.js';
import { CreateIModelWorkflow } from '../../../features/imodel/components/CreateIModelWorkflow.js';
import { IModelCard } from '../../../features/imodel/components/IModelCard.js';
import { RenameIModelDialog } from '../../../features/imodel/components/RenameIModelDialog.js';
import { CopyIModelDialog } from '../../../features/imodel/components/CopyIModelDialog.js';
import { EditITwinDialog } from '../../../features/itwin/components/EditITwinDialog.js';
import { ShareITwinDialog } from '../../../features/itwin/components/ShareITwinDialog.js';
import { ThemeToggle } from '../../../features/editor/components/ThemeToggle.js';
import { useToast } from '../../../shared/components/ui/ToastContainer.js';
import {
  IModelsListSkeleton,
  ITwinDetailSkeleton,
} from '../../../shared/components/skeletons/ITwinDetailSkeleton.js';
import type { IModel } from '../../../features/imodel/hooks/useIModelsQuery.js';
import './ITwinDetail.css';

/**
 * iTwin detail page
 * Displays iTwin information and its iModels list
 * Uses iTwinUI components for consistent design
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const ITwinDetail: React.FC = React.memo(() => {
  const { iTwinId } = useParams<{ iTwinId: string }>();
  const navigate = useNavigate();
  const { showToast, ToastContainer } = useToast();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [selectedIModel, setSelectedIModel] = useState<IModel | null>(null);

  const deleteITwinMutation = useDeleteITwinMutation();
  const deleteIModelMutation = useDeleteIModelMutation();
  const downloadAnchorRef = useRef<HTMLAnchorElement>(null);

  // Use React Query hooks for data fetching
  const {
    data: iTwin,
    isLoading: isITwinLoading,
    error: iTwinError,
    refetch: refetchITwin,
  } = useITwinQuery(iTwinId ?? null);

  const {
    data: iModels = [],
    isLoading: isIModelsLoading,
    refetch: refetchIModels,
  } = useIModels({ iTwinId: iTwinId ?? '', enabled: !!iTwinId });

  const isLoading = isITwinLoading || isIModelsLoading;
  const isPartialLoading = !isITwinLoading && isIModelsLoading;
  const error = iTwinError?.message || null;

  // Check for uninitialized iModels and setup auto-refresh with backoff
  const hasUninitialized = useMemo(() => {
    return iModels.some((im) => {
      const state = String(im.state).toLowerCase();
      return state === 'notinitialized' || state === 'initializing' || state === 'scheduled';
    });
  }, [iModels]);

  // Use ref to avoid effect re-running when refetchIModels reference changes
  const refetchIModelsRef = useRef(refetchIModels);
  refetchIModelsRef.current = refetchIModels;

  // Track refresh attempts for exponential backoff
  const refreshAttemptsRef = useRef(0);
  const maxRefreshAttempts = 60; // Stop after ~5 minutes (with backoff)
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasUninitialized) {
      refreshAttemptsRef.current = 0;
      return;
    }

    // Stop if max attempts reached
    if (refreshAttemptsRef.current >= maxRefreshAttempts) {
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, 10s (cap), with some jitter
    const baseDelay = Math.min(2000 * Math.pow(1.5, refreshAttemptsRef.current), 10000);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    const timeout = setTimeout(() => {
      if (isMountedRef.current) {
        void refetchIModelsRef.current();
        refreshAttemptsRef.current++;
      }
    }, delay);

    return () => clearTimeout(timeout);
  }, [hasUninitialized]);

  const handleRefresh = useCallback(() => {
    void refetchITwin();
    void refetchIModels();
  }, [refetchITwin, refetchIModels]);

  const handleEditProject = useCallback(() => {
    setIsEditDialogOpen(true);
  }, []);

  const handleDeleteProject = useCallback(async () => {
    if (!iTwinId) return;
    const confirmed = window.confirm('确定要删除此项目吗？此操作不可撤销，项目下的所有 iModel 也将被删除。');
    if (!confirmed) return;

    try {
      await deleteITwinMutation.mutateAsync(iTwinId);
      showToast('项目已删除', 'success');
      navigate('/itwins');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败，请重试';
      showToast(message, 'error');
    }
  }, [iTwinId, deleteITwinMutation, navigate, showToast]);

  const handleBack = useCallback(() => {
    navigate('/itwins');
  }, [navigate]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const handleOpenIModel = useCallback((iModel: IModel) => {
    navigate(`/workspace/${iTwinId}/${iModel.id}`);
  }, [navigate, iTwinId]);

  const handleDeleteIModel = useCallback(async (iModel: IModel) => {
    if (!iTwinId || !iModel.id) return;
    const confirmed = window.confirm(`确定要删除 iModel "${iModel.displayName || iModel.name || '未命名'}" 吗？此操作不可撤销。`);
    if (!confirmed) return;

    try {
      await deleteIModelMutation.mutateAsync({ iModelId: iModel.id, iTwinId });
      showToast('iModel 已删除', 'success');
      void refetchIModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败，请重试';
      showToast(message, 'error');
    }
  }, [iTwinId, deleteIModelMutation, showToast, refetchIModels]);

  const handleDownloadIModel = useCallback(async (iModel: IModel) => {
    if (!iModel.id) return;
    try {
      const url = await getDownloadUrl(iModel.id);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('下载请求失败');
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = downloadAnchorRef.current;
      const fileName = `${iModel.displayName || iModel.name || 'imodel'}.bim`;
      if (anchor) {
        anchor.href = blobUrl;
        anchor.download = fileName;
        anchor.click();
      } else {
        const tempAnchor = document.createElement('a');
        tempAnchor.href = blobUrl;
        tempAnchor.download = fileName;
        tempAnchor.click();
      }
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载失败，请重试';
      showToast(message, 'error');
    }
  }, [showToast]);

  const handleRetryIModel = useCallback(async (iModel: IModel) => {
    if (!iTwinId || !iModel.id) return;
    try {
      await retryIModel(iModel.id, iTwinId, iModel.displayName || iModel.name);
      showToast('已发起重试，请稍候', 'success');
      void refetchIModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : '重试失败，请稍后再试';
      showToast(message, 'error');
    }
  }, [iTwinId, showToast, refetchIModels]);

  const handleRenameIModel = useCallback((iModel: IModel) => {
    setSelectedIModel(iModel);
    setIsRenameDialogOpen(true);
  }, []);

  const handleCopyIModel = useCallback((iModel: IModel) => {
    setSelectedIModel(iModel);
    setIsCopyDialogOpen(true);
  }, []);

  const handleCreated = useCallback(() => {
    setIsCreateDialogOpen(false);
    void refetchIModels();
    void refetchITwin();
  }, [refetchIModels, refetchITwin]);

  const formatDate = useCallback((dateString: string): string => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  // Show full skeleton during initial loading
  if (isLoading) {
    return <ITwinDetailSkeleton />;
  }

  if (!iTwin || error) {
    return (
      <div className="imodels-page">
        <div className="error-state">
          <div className="error-icon">
            <SvgStatusError className="icon-large" />
          </div>
          <Text variant="title" as="h2">{error || '项目未找到'}</Text>
          <Text>无法加载项目信息</Text>
          <div className="error-actions">
            <Button styleType="high-visibility" onClick={handleRefresh} startIcon={<SvgRefresh />}>
              重试
            </Button>
            <Button styleType="default" onClick={handleBack}>
              返回项目列表
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="imodels-page">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo-mark">CC</div>
          <nav className="breadcrumb">
            <Button styleType="borderless" onClick={handleBack} startIcon={<SvgChevronLeft />}>
              项目列表
            </Button>
            <Text className="breadcrumb-sep">/</Text>
            <Text className="breadcrumb-current">{iTwin.displayName}</Text>
          </nav>
        </div>
        <div className="topbar-actions">
          <IconButton
            onClick={handleRefresh}
            label="刷新"
            title="刷新"
            styleType="borderless"
          >
            <SvgRefresh className={isIModelsLoading ? 'spin' : ''} />
          </IconButton>
          <ThemeToggle />
          <div style={{ position: 'relative' }}>
            <IconButton
              label="设置"
              styleType="borderless"
              onClick={handleSettings}
            >
              <SvgSettings />
            </IconButton>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <div className="hero">
        <div className="hero-content">
          <div className="hero-left">
            <div className="hero-icon">
              <SvgModel className="icon-large" />
            </div>
            <div className="hero-info">
              <div className="hero-name">{iTwin.displayName}</div>
              <div className="hero-meta">
                <Badge backgroundColor="positive">{iTwin.status === 'Active' ? 'Active' : iTwin.status || 'Active'}</Badge>
                {(() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const t = iTwin as any;
                  const created = t.createdDateTime || t.createdAt;
                  const updated = t.lastModifiedDateTime || t.updatedAt || t.modifiedAt;
                  const createdStr = created ? formatDate(created) : null;
                  const updatedStr = updated ? formatDate(updated) : null;
                  return (
                    <>
                      {createdStr && <span>创建于 {createdStr}</span>}
                      {updatedStr && createdStr !== updatedStr && (
                        <><span className="separator">·</span><span>更新于 {updatedStr}</span></>
                      )}
                    </>
                  );
                })()}
                <span className="separator">·</span>
                <span>
                  {iModels.length} 个 iModel
                  {hasUninitialized && (
                    <span className="sync-indicator" title="有 iModel 正在初始化">
                      <span className="sync-dot" />
                      同步中
                    </span>
                  )}
                </span>
              </div>
              {/* Description - safely check if it exists */}
              {(iTwin as { description?: string }).description && (
                <div className="hero-description">
                  {(iTwin as { description?: string }).description}
                </div>
              )}
            </div>
          </div>
          <div className="hero-actions">
            <Button
              styleType="high-visibility"
              startIcon={<SvgAdd />}
              onClick={() => setIsCreateDialogOpen(true)}
            >
              新建 iModel
            </Button>
            <IconButton label="编辑项目" styleType="default" onClick={handleEditProject}>
              <SvgEdit />
            </IconButton>
            <IconButton label="删除项目" styleType="default" onClick={handleDeleteProject}>
              <SvgDelete />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Content wrapper - scrollable area */}
      <div className="content-wrapper">
        {/* Partial loading skeleton */}
        {isPartialLoading && <IModelsListSkeleton />}

        {/* Content */}
        {!isPartialLoading && (
          <>
            {/* Toolbar */}
            <div className="toolbar">
              <div className="toolbar-left">
                <Badge backgroundColor="primary">
                  {`${iModels.length} 个 iModel${hasUninitialized ? ' *' : ''}`}
                </Badge>
              </div>
            </div>

            {/* Grid */}
            {iModels.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <SvgModel className="icon-large" />
                </div>
                <Text variant="title" as="h3" className="empty-title">暂无 iModel</Text>
                <Text className="empty-desc">开始创建您的第一个 iModel</Text>
                <Button
                  styleType="high-visibility"
                  startIcon={<SvgAdd />}
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  新建 iModel
                </Button>
              </div>
            ) : (
              <div className="grid">
                {iModels.map((iModel) => (
                  <IModelCard
                    key={iModel.id}
                    iModel={iModel}
                    onOpen={handleOpenIModel}
                    onDelete={handleDeleteIModel}
                    onDownload={handleDownloadIModel}
                    onRetry={handleRetryIModel}
                    onRename={handleRenameIModel}
                    onCopy={handleCopyIModel}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Dialog */}
      <CreateIModelWorkflow
        iTwinId={iTwinId ?? ''}
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreated={handleCreated}
      />

      {/* Edit Dialog */}
      <EditITwinDialog
        key={iTwin?.id}
        iTwin={iTwin || null}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSaved={() => {
          showToast('项目信息已更新', 'success');
          void refetchITwin();
        }}
      />

      <ShareITwinDialog
        iTwin={iTwin || null}
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
      />

      {/* Rename Dialog */}
      <RenameIModelDialog
        iModel={selectedIModel}
        iTwinId={iTwinId ?? ''}
        isOpen={isRenameDialogOpen}
        onClose={() => setIsRenameDialogOpen(false)}
        onRenamed={() => {
          showToast('iModel 已重命名', 'success');
          void refetchIModels();
        }}
      />

      {/* Copy Dialog */}
      <CopyIModelDialog
        iModel={selectedIModel}
        currentITwinId={iTwinId ?? ''}
        isOpen={isCopyDialogOpen}
        onClose={() => setIsCopyDialogOpen(false)}
        onCopied={() => {
          showToast('iModel 复制成功', 'success');
          void refetchIModels();
        }}
      />

      {/* Hidden anchor for programmatic downloads */}
      <a ref={downloadAnchorRef} style={{ display: 'none' }} />

      <ToastContainer />
    </div>
  );
});

// Display name for debugging
ITwinDetail.displayName = 'ITwinDetail';

export default ITwinDetail;
