/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * iTwin detail page（RW4-P3-T3-1 Onshape IA 重做）：
 * - 顶栏 Header + HeaderBreadcrumbs（项目列表 → 当前项目）+ ThemeToggle/设置/刷新
 * - Hero itwin-ui 化：Surface + 真实项目大图（useITwinImage）+ Tag 状态 + 元信息；
 *   操作区=新建 iModel / 分享 / 编辑 / 删除
 * - 删除确认 window.confirm 退役 → itwin-ui Dialog（项目 + iModel 各一，危险操作标准形态）
 * - IModelCard 真实缩略图（useIModelImage）与死 props 清理见 IModelCard.tsx
 * e2e 契约锚点：`.imodel-card` / `.imodel-card__title` / 「打开工作空间」/「新建 iModel」。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  Header,
  HeaderBreadcrumbs,
  HeaderButton,
  HeaderLogo,
  IconButton,
  NonIdealState,
  Surface,
  Tag,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgChevronLeft,
  SvgDelete,
  SvgEdit,
  SvgModel,
  SvgProject,
  SvgRefresh,
  SvgSettings,
  SvgShare,
  SvgStatusError,
} from '@itwin/itwinui-icons-react';
import {
  useDeleteITwinMutation,
  useITwinQuery,
} from '../../../features/itwin/hooks/useITwinsQuery.js';
import {
  type IModel,
  useDeleteIModelMutation,
  useIModels,
} from '../../../features/imodel/hooks/useIModelsQuery.js';
import { useImodelProgressStream } from '../../../features/imodel/hooks/useImodelProgressStream.js';
import { queryKeys } from '../../../app/providers/QueryProvider.js';
import { CreateIModelWorkflow } from '../../../features/imodel/components/CreateIModelWorkflow.js';
import { IModelCard } from '../../../features/imodel/components/IModelCard.js';
import { RenameIModelDialog } from '../../../features/imodel/components/RenameIModelDialog.js';
import { EditITwinDialog } from '../../../features/itwin/components/EditITwinDialog.js';
import { ShareITwinDialog } from '../../../features/itwin/components/ShareITwinDialog.js';
import { ThemeToggle } from '../../../features/editor/components/ThemeToggle.js';
import { useAppToast } from '../../../shared/hooks/useAppToast.js';
import { useITwinImage } from '../../../shared/hooks/useITwinImage.js';
import {
  IModelsListSkeleton,
  ITwinDetailSkeleton,
} from '../../../shared/components/skeletons/ITwinDetailSkeleton.js';
import type { ITwin } from '../../../shared/services/itwins/client.js';
import './ITwinDetail.css';

/** 本 hub 详情实际携带的时间/描述字段（官方 ITwin 之外的超集） */
type DetailITwin = ITwin & {
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  modifiedAt?: string;
  lastModifiedDateTime?: string;
};

/**
 * iTwin detail page
 * Displays iTwin information and its iModels list
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const ITwinDetail: React.FC = React.memo(() => {
  const { iTwinId } = useParams<{ iTwinId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { showToast } = useAppToast();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [deleteIModelTarget, setDeleteIModelTarget] = useState<IModel | null>(null);
  const [selectedIModel, setSelectedIModel] = useState<IModel | null>(null);

  const deleteITwinMutation = useDeleteITwinMutation();
  const deleteIModelMutation = useDeleteIModelMutation();

  // Use React Query hooks for data fetching
  const {
    data: iTwin,
    isLoading: isITwinLoading,
    error: iTwinError,
    refetch: refetchITwin,
  } = useITwinQuery(iTwinId ?? null);

  const queryClient = useQueryClient();
  const activeITwinId = iTwinId ?? '';
  const projectImage = useITwinImage(iTwinId);

  // Live iModel progress: the modeling-server /ws stream pushes baseline
  // initialization updates; each event invalidates the list so state changes
  // surface immediately. While the stream is live the 5s polling fallback in
  // useIModels is disabled.
  const handleProgressEvent = useCallback(() => {
    if (!activeITwinId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.iModels.list(activeITwinId),
    });
  }, [activeITwinId, queryClient]);
  const { live: progressLive } = useImodelProgressStream({
    onEvent: handleProgressEvent,
  });

  const {
    data: iModels = [],
    isLoading: isIModelsLoading,
    refetch: refetchIModels,
  } = useIModels({ iTwinId: activeITwinId, enabled: !!iTwinId, live: progressLive });

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

  const handleDeleteProject = useCallback(() => {
    setIsDeleteProjectOpen(true);
  }, []);

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!iTwinId) return;
    try {
      await deleteITwinMutation.mutateAsync(iTwinId);
      showToast(t('detail.deleteProject.success'), 'success');
      setIsDeleteProjectOpen(false);
      navigate('/documents');
    } catch (deleteError) {
      const message = deleteError instanceof Error
        ? deleteError.message
        : t('detail.deleteProject.failed');
      showToast(message, 'error');
    }
  }, [iTwinId, deleteITwinMutation, navigate, showToast, t]);

  const handleBack = useCallback(() => {
    navigate('/documents');
  }, [navigate]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const handleOpenIModel = useCallback((iModel: IModel) => {
    navigate(`/documents/${iTwinId}/${iModel.id}`);
  }, [navigate, iTwinId]);

  const handleRequestDeleteIModel = useCallback((iModel: IModel) => {
    setDeleteIModelTarget(iModel);
  }, []);

  const handleConfirmDeleteIModel = useCallback(async () => {
    const target = deleteIModelTarget;
    if (!iTwinId || !target?.id) return;
    try {
      await deleteIModelMutation.mutateAsync({ iModelId: target.id, iTwinId });
      showToast(t('detail.deleteIModel.success'), 'success');
      setDeleteIModelTarget(null);
      void refetchIModels();
    } catch (deleteError) {
      const message = deleteError instanceof Error
        ? deleteError.message
        : t('detail.deleteIModel.failed');
      showToast(message, 'error');
    }
  }, [iTwinId, deleteIModelTarget, deleteIModelMutation, showToast, t, refetchIModels]);

  const handleRenameIModel = useCallback((iModel: IModel) => {
    setSelectedIModel(iModel);
    setIsRenameDialogOpen(true);
  }, []);

  const handleCreated = useCallback(() => {
    setIsCreateDialogOpen(false);
    void refetchIModels();
    void refetchITwin();
  }, [refetchIModels, refetchITwin]);

  const formatDate = useCallback((dateString: string): string => {
    return new Date(dateString).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [i18n.language]);

  // Show full skeleton during initial loading
  if (isLoading) {
    return <ITwinDetailSkeleton />;
  }

  if (!iTwin || error) {
    return (
      <div className="imodels-page">
        <NonIdealState
          className="detail-nonideal"
          svg={<SvgStatusError />}
          heading={error || t('detail.error.title')}
          description={t('detail.error.description')}
          actions={
            <>
              <Button styleType="high-visibility" onClick={handleRefresh} startIcon={<SvgRefresh />}>
                {t('detail.error.retry')}
              </Button>
              <Button styleType="default" onClick={handleBack}>
                {t('detail.error.back')}
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const detailITwin = iTwin as DetailITwin;
  const createdRaw = detailITwin.createdDateTime || detailITwin.createdAt;
  const updatedRaw = detailITwin.lastModifiedDateTime || detailITwin.updatedAt || detailITwin.modifiedAt;
  const createdStr = createdRaw ? formatDate(createdRaw) : null;
  const updatedStr = updatedRaw ? formatDate(updatedRaw) : null;
  const statusLabel = iTwin.status || 'Active';
  const deleteIModelName = deleteIModelTarget?.displayName
    || deleteIModelTarget?.name
    || t('imodelCard.untitled');

  return (
    <div className="imodels-page">
      {/* Topbar — Header + HeaderBreadcrumbs（项目列表 → 当前项目） */}
      <Header
        className="detail-header"
        appLogo={
          <HeaderLogo logo={<div className="logo-mark">CC</div>}>
            {tCommon('app.name')}
          </HeaderLogo>
        }
        breadcrumbs={
          <HeaderBreadcrumbs
            items={[
              <HeaderButton
                key="documents"
                name={t('detail.breadcrumb.documents')}
                onClick={handleBack}
                startIcon={<SvgChevronLeft />}
              />,
              <HeaderButton key="current" name={iTwin.displayName} isActive />,
            ]}
          />
        }
        actions={[
          <IconButton
            key="refresh"
            onClick={handleRefresh}
            label={t('detail.actions.refresh')}
            styleType="borderless"
          >
            <SvgRefresh className={isIModelsLoading ? 'spin' : ''} />
          </IconButton>,
          <ThemeToggle key="theme" />,
          <IconButton
            key="settings"
            label={t('detail.actions.settings')}
            styleType="borderless"
            onClick={handleSettings}
          >
            <SvgSettings />
          </IconButton>,
        ]}
      />

      {/* Hero — Surface + 真实项目大图 + Tag 元信息 */}
      <Surface className="detail-hero" elevation={1}>
        <div className="detail-hero__media">
          {projectImage ? (
            <img className="detail-hero__image" src={projectImage} alt="" />
          ) : (
            <div className="detail-hero__image-fallback">
              <SvgProject />
            </div>
          )}
        </div>
        <div className="detail-hero__content">
          <Text variant="headline" as="h1" className="detail-hero__title">
            {iTwin.displayName}
          </Text>
          <div className="detail-hero__meta">
            <Tag>{statusLabel}</Tag>
            {createdStr && (
              <Text variant="small">{t('detail.createdAt', { date: createdStr })}</Text>
            )}
            {updatedStr && createdStr !== updatedStr && (
              <Text variant="small">{t('detail.updatedAt', { date: updatedStr })}</Text>
            )}
            <Text variant="small">{t('detail.imodelCount', { count: iModels.length })}</Text>
            {hasUninitialized && (
              <span className="sync-indicator" title={t('detail.syncingTitle')}>
                <span className="sync-dot" />
                {t('detail.syncing')}
              </span>
            )}
          </div>
          {detailITwin.description && (
            <Text className="detail-hero__description">{detailITwin.description}</Text>
          )}
        </div>
        <div className="detail-hero__actions">
          <Button
            styleType="high-visibility"
            startIcon={<SvgAdd />}
            onClick={() => setIsCreateDialogOpen(true)}
          >
            {t('detail.actions.createIModel')}
          </Button>
          <IconButton
            label={t('detail.actions.share')}
            styleType="default"
            onClick={() => setIsShareDialogOpen(true)}
          >
            <SvgShare />
          </IconButton>
          <IconButton
            label={t('detail.actions.editProject')}
            styleType="default"
            onClick={handleEditProject}
          >
            <SvgEdit />
          </IconButton>
          <IconButton
            label={t('detail.actions.deleteProject')}
            styleType="default"
            onClick={handleDeleteProject}
          >
            <SvgDelete />
          </IconButton>
        </div>
      </Surface>

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
                  {t('detail.imodelCount', { count: iModels.length })}
                </Badge>
              </div>
            </div>

            {/* Grid */}
            {iModels.length === 0 ? (
              <NonIdealState
                className="detail-nonideal"
                svg={<SvgModel />}
                heading={t('detail.empty.title')}
                description={t('detail.empty.description')}
                actions={
                  <Button
                    styleType="high-visibility"
                    startIcon={<SvgAdd />}
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    {t('detail.actions.createIModel')}
                  </Button>
                }
              />
            ) : (
              <div className="grid">
                {iModels.map((iModel) => (
                  <IModelCard
                    key={iModel.id}
                    iModel={iModel}
                    onOpen={handleOpenIModel}
                    onDelete={handleRequestDeleteIModel}
                    onRename={handleRenameIModel}
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
          showToast(t('detail.editSaved'), 'success');
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
          showToast(t('detail.imodelRenamed'), 'success');
          void refetchIModels();
        }}
      />

      {/* Delete project 危险确认 Dialog（window.confirm 退役） */}
      <Dialog
        isOpen={isDeleteProjectOpen}
        onClose={() => setIsDeleteProjectOpen(false)}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('detail.deleteProject.title')}
          className="detail-delete-dialog"
        >
          <Dialog.TitleBar title={t('detail.deleteProject.title')} />
          <Dialog.Content>
            <Text>{t('detail.deleteProject.message', { name: iTwin.displayName ?? '' })}</Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setIsDeleteProjectOpen(false)}
              disabled={deleteITwinMutation.isPending}
            >
              {t('detail.deleteProject.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="detail-danger-button"
              onClick={handleConfirmDeleteProject}
              loading={deleteITwinMutation.isPending}
              disabled={deleteITwinMutation.isPending}
            >
              {t('detail.deleteProject.confirm')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* Delete iModel 危险确认 Dialog */}
      <Dialog
        isOpen={!!deleteIModelTarget}
        onClose={() => setDeleteIModelTarget(null)}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('detail.deleteIModel.title')}
          className="detail-delete-dialog"
        >
          <Dialog.TitleBar title={t('detail.deleteIModel.title')} />
          <Dialog.Content>
            <Text>{t('detail.deleteIModel.message', { name: deleteIModelName })}</Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setDeleteIModelTarget(null)}
              disabled={deleteIModelMutation.isPending}
            >
              {t('detail.deleteIModel.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="detail-danger-button"
              onClick={handleConfirmDeleteIModel}
              loading={deleteIModelMutation.isPending}
              disabled={deleteIModelMutation.isPending}
            >
              {t('detail.deleteIModel.confirm')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </div>
  );
});

// Display name for debugging
ITwinDetail.displayName = 'ITwinDetail';

export default ITwinDetail;
