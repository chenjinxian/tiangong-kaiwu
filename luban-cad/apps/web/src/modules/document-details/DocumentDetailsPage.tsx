/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentDetailsPage（Task 6）：/documents/:iTwinId 文档详情页（对齐
 * Onshape os-01 详情区 / 旧应用 ITwinDetail.tsx）——
 * - 顶栏：LC 品牌（回 /documents）+ HeaderBreadcrumbs（文档 → 当前文档名）
 *   + 刷新 + 主题切换 + 用户菜单（我的帐户/深色模式/退出登录，os-03）；
 * - hero（DocumentHero）：Surface + 项目大图 + 名称 + 状态 Tag + 创建/更新
 *   时间 + iModel 计数 + 同步指示（存在待初始化/等待重试 iModel 时）+ 操作区
 *   （新建 iModel / 分享 / 删除）；
 * - 内容：轻量计数行 + iModel 卡片网格（ImodelCardGrid；空态引导创建）；
 * - 对话框：CreateImodelDialog（名称必填 + 描述可选）/ 删除文档确认
 *   （ItwinsClient.delete → 返回 /documents）/ 删除 iModel 确认
 *   （ImodelsClient.delete → 失效网格）/ ShareDocumentDialog
 *   （复用 documents 模块，三页签成员/邀请/链接）。
 *
 * 数据面：useDocumentDetail + useImodels + useITwinPermissions（本模块
 * hooks）；三态裁决——详情加载中整页加载态；详情错误 NonIdealState
 * （重试/返回）；iModel 列表独立 loading 只影响网格区（hero 计数用已知
 * 数据照常渲染；网格区 loading 门先于空态——初载不闪「暂无 iModel」，
 * 零布局跳动违例，I4）。
 *
 * 新建 iModel 授权门（终审 I3）：hub `POST /imodels` 要求目标 iTwin 上的
 * `imodels_manage`。权限未落定 / 查询失败 / 不含该权限时 fail-closed——
 * hero 与空态都不渲染启用态创建入口（Viewer 看不到创建动作；403 另在
 * CreateImodelDialog 内映射为专属 i18n 文案兜底）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  Dialog,
  Header,
  HeaderBreadcrumbs,
  HeaderButton,
  HeaderLogo,
  IconButton,
  MenuItem,
  NonIdealState,
  DropdownMenu,
  ProgressRadial,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgCheckmark,
  SvgChevronLeft,
  SvgModel,
  SvgMoon,
  SvgRefresh,
  SvgStatusError,
  SvgSun,
} from '@itwin/itwinui-icons-react';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { ShareDocumentDialog, type DocumentSummary } from '@modules/documents';
import { useTheme } from '@app/providers/ThemeContext.js';
import { useDocumentDetail, useImodels } from './hooks/useImodels.js';
import { useITwinPermissions } from './hooks/useITwinPermissions.js';
import type { ImodelSummary } from './types.js';
import { DocumentHero } from './components/DocumentHero.js';
import { ImodelCardGrid } from './components/ImodelCardGrid.js';
import { CreateImodelDialog } from './components/CreateImodelDialog.js';
import './DocumentDetailsPage.css';

function parseDate(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function DocumentDetailsPage(): React.JSX.Element {
  const { iTwinId } = useParams<{ iTwinId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const user = AuthSession.getStoredAuth()?.user;

  const {
    document,
    isLoading: isDocLoading,
    error: docError,
    refetch: refetchDoc,
  } = useDocumentDetail(iTwinId);
  const {
    imodels,
    isLoading: isImodelsLoading,
    isFetching: isImodelsFetching,
    refetch: refetchImodels,
  } = useImodels(iTwinId);
  const {
    permissions: iTwinPermissions,
    isLoading: isPermissionLoading,
    error: permissionError,
  } = useITwinPermissions(iTwinId);

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isShareOpen, setIsShareOpen] = React.useState(false);
  const [isDeleteDocOpen, setIsDeleteDocOpen] = React.useState(false);
  const [deleteDocError, setDeleteDocError] = React.useState('');
  const [deleteImodelTarget, setDeleteImodelTarget] = React.useState<ImodelSummary | null>(null);
  const [deleteImodelError, setDeleteImodelError] = React.useState('');

  const deleteDocMutation = useMutation({
    mutationFn: (id: string) => new ItwinsClient().delete(id),
  });

  const deleteImodelMutation = useMutation({
    mutationFn: (id: string) => new ImodelsClient().delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'imodels'] });
    },
  });

  /** 存在待初始化/等待重试 iModel → hero 同步指示（列表自动刷新由失效驱动）。
   *  失败/缺文件/未知不呈现「同步中」（现状诚实：失败不是进行中）。 */
  const syncing = React.useMemo(
    () => imodels.some((im) => im.state === 'notInitialized' || im.state === 'retryScheduled'),
    [imodels],
  );

  /** 新建 iModel 权限门（终审 I3）：仅 `imodels_manage` 放行；权限未落定
   *  或查询失败一律 fail-closed（不呈现启用态创建入口，避免诱导 403）。 */
  const canCreateImodel =
    !isPermissionLoading &&
    !permissionError &&
    iTwinPermissions.includes('imodels_manage');

  const formatDate = React.useCallback(
    (value: string | null | undefined): string | null => {
      const time = parseDate(value);
      if (!time) return null;
      return new Date(time).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },
    [i18n.language],
  );

  const createdLabel = React.useMemo(() => {
    const date = formatDate(document?.createdAt);
    return date ? t('documents.detail.meta.createdAt', { date }) : null;
  }, [document?.createdAt, formatDate, t]);

  const updatedLabel = React.useMemo(() => {
    const date = formatDate(document?.updatedAt);
    return date ? t('documents.detail.meta.updatedAt', { date }) : null;
  }, [document?.updatedAt, formatDate, t]);

  const formatCreated = React.useCallback(
    (imodel: ImodelSummary): string => {
      const date = formatDate(imodel.createdAt);
      return date ? t('documents.detail.meta.createdAt', { date }) : t('documents.states.noDate');
    },
    [formatDate, t],
  );

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleBack = React.useCallback(() => navigate('/documents'), [navigate]);

  const handleRefresh = React.useCallback(() => {
    refetchDoc();
    refetchImodels();
  }, [refetchDoc, refetchImodels]);

  const handleLogout = React.useCallback(async () => {
    await AuthSession.logout();
    navigate('/login');
  }, [navigate]);

  const handleOpenImodel = React.useCallback(
    (imodel: ImodelSummary) => {
      if (iTwinId && imodel.id) {
        navigate(`/documents/${iTwinId}/${imodel.id}`);
      }
    },
    [navigate, iTwinId],
  );

  const handleDeleteDocConfirm = React.useCallback(async () => {
    if (!document) return;
    setDeleteDocError('');
    try {
      await deleteDocMutation.mutateAsync(document.id);
      setIsDeleteDocOpen(false);
      navigate('/documents');
    } catch (error) {
      // 失败不静默：内联呈现错误并保持对话框在场承接重试（DocumentsPage 同口径）。
      setDeleteDocError(
        error instanceof Error && error.message
          ? error.message
          : t('documents.states.deleteFailed'),
      );
    }
  }, [document, deleteDocMutation, navigate, t]);

  const handleDeleteImodelConfirm = React.useCallback(async () => {
    if (!deleteImodelTarget) return;
    setDeleteImodelError('');
    try {
      await deleteImodelMutation.mutateAsync(deleteImodelTarget.id);
      setDeleteImodelTarget(null);
    } catch (error) {
      setDeleteImodelError(
        error instanceof Error && error.message
          ? error.message
          : t('documents.states.deleteFailed'),
      );
    }
  }, [deleteImodelTarget, deleteImodelMutation, t]);

  // -----------------------------------------------------------------------
  // 三态：详情加载中 / 详情错误 / 正常渲染
  // -----------------------------------------------------------------------
  if (isDocLoading && !document) {
    return (
      <div className="document-details-page">
        <div className="document-details-loading">
          <ProgressRadial size="large" indeterminate />
          <Text>{t('documents.detail.states.loading')}</Text>
        </div>
      </div>
    );
  }

  if (docError && !document) {
    return (
      <div className="document-details-page">
        <NonIdealState
          className="document-details-nonideal"
          svg={<SvgStatusError />}
          heading={docError instanceof Error ? docError.message : t('documents.detail.states.errorTitle')}
          description={t('documents.detail.states.errorDescription')}
          actions={
            <>
              <Button styleType="high-visibility" onClick={handleRefresh} startIcon={<SvgRefresh />}>
                {t('documents.detail.states.retry')}
              </Button>
              <Button styleType="default" onClick={handleBack}>
                {t('documents.detail.states.back')}
              </Button>
            </>
          }
        />
      </div>
    );
  }

  // document 在场（docError 缺席或已有缓存数据）——正常渲染。
  const shareDoc: DocumentSummary | null = document
    ? {
        id: document.id,
        name: document.name,
        owner: '',
        role: '',
        createdAt: document.createdAt,
        modifiedAt: document.updatedAt ?? document.createdAt,
      }
    : null;

  return (
    <div className="document-details-page">
      {/* 顶栏 — 品牌（回文档首页）+ 面包屑（文档 → 当前文档名）+ 刷新/主题/设置/用户菜单 */}
      <Header
        className="document-details-header"
        appLogo={
          <HeaderLogo
            logo={<div className="document-details-logo-mark">LC</div>}
            onClick={handleBack}
          >
            {t('common.app.name')}
          </HeaderLogo>
        }
        breadcrumbs={
          <HeaderBreadcrumbs
            items={[
              <HeaderButton
                key="documents"
                name={t('documents.detail.breadcrumb.documents')}
                onClick={handleBack}
                startIcon={<SvgChevronLeft />}
              />,
              <HeaderButton
                key="current"
                name={document?.name ?? t('documents.states.unnamed')}
                isActive
              />,
            ]}
          />
        }
        actions={[
          <IconButton
            key="refresh"
            label={t('documents.actions.refresh')}
            styleType="borderless"
            onClick={handleRefresh}
          >
            {/* 旋转信号用 isFetching（首载+refetch 恒真）；isLoading 仅首载为真，
                有缓存数据的刷新期间恒假——用它刷新钮永不转圈（终审 I3）。 */}
            <SvgRefresh className={isImodelsFetching ? 'spin' : undefined} />
          </IconButton>,
          <IconButton
            key="theme"
            label={t('documents.userMenu.darkMode')}
            styleType="borderless"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SvgSun /> : <SvgMoon />}
          </IconButton>,
          <DropdownMenu
            key="user-menu"
            menuItems={[
              <MenuItem key="account" onClick={() => navigate('/settings')}>
                {t('documents.userMenu.account')}
              </MenuItem>,
              <MenuItem
                key="theme-toggle"
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
      />

      {/* Hero — Surface + 大图 + 名称 + 状态 Tag + 元信息 + 操作区 */}
      {document && (
        <DocumentHero
          name={document.name || t('documents.states.unnamed')}
          statusLabel={document.status || t('documents.detail.status.active')}
          description={document.description}
          thumbnailUrl={document.thumbnailUrl}
          createdLabel={createdLabel}
          updatedLabel={updatedLabel}
          imodelCount={imodels.length}
          syncing={syncing}
          canCreateImodel={canCreateImodel}
          onCreateImodel={() => setIsCreateOpen(true)}
          onShare={() => setIsShareOpen(true)}
          onDelete={() => {
            setDeleteDocError('');
            setIsDeleteDocOpen(true);
          }}
        />
      )}

      {/* 内容 — 计数行 + 卡片网格 / 空态 */}
      <div className="document-details-content">
        <div className="document-details-toolbar">
          <Text variant="small" className="document-details-count">
            {t('documents.detail.imodelCount', { count: imodels.length })}
          </Text>
        </div>
        {/* 网格三态门：初载 loading → ProgressRadial 占位先于空态（终审 I4——
            空态先于加载门会在首载瞬间闪「暂无 iModel」再跳网格，违零布局跳动）；
            空态引导创建；常态卡片网格。hero 计数行用已知数据照常渲染。 */}
        {isImodelsLoading ? (
          <div className="document-details-grid-loading">
            <ProgressRadial size="large" indeterminate />
          </div>
        ) : imodels.length === 0 ? (
          <NonIdealState
            className="document-details-nonideal"
            svg={<SvgModel />}
            heading={t('documents.detail.empty.title')}
            description={t('documents.detail.empty.description')}
            actions={
              // 权限门（终审 I3）：无 imodels_manage / 权限未落定 → 空态不呈现
              // 创建入口（Viewer 无创建动作；不诱导注定 403 的提交）。
              canCreateImodel ? (
                <Button
                  styleType="high-visibility"
                  startIcon={<SvgAdd />}
                  onClick={() => setIsCreateOpen(true)}
                >
                  {t('documents.detail.actions.createIModel')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ImodelCardGrid
            imodels={imodels}
            formatCreated={formatCreated}
            onOpen={handleOpenImodel}
            onDelete={(imodel) => {
              setDeleteImodelError('');
              setDeleteImodelTarget(imodel);
            }}
          />
        )}
      </div>

      {/* 新建 iModel */}
      <CreateImodelDialog
        iTwinId={iTwinId ?? ''}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          refetchDoc();
          refetchImodels();
        }}
      />

      {/* 分享（复用 documents 模块三页签对话框） */}
      <ShareDocumentDialog
        doc={shareDoc}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      {/* 删除文档确认（危险操作 HITL；失败内联呈现，不静默）。setFocus
          （review-8 I-1 P2 补齐）：打开即焦点入对话框——Escape 关闭挂对话框
          元素 onKeyDown，焦点不在其内则击键永不可达。 */}
      <Dialog
        isOpen={isDeleteDocOpen}
        onClose={() => {
          setDeleteDocError('');
          setIsDeleteDocOpen(false);
        }}
        portal
        setFocus
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('documents.deleteDialog.title')}
          className="document-details-dialog"
        >
          <Dialog.TitleBar titleText={t('documents.deleteDialog.title')} />
          <Dialog.Content>
            {deleteDocError && (
              <Text color="negative" className="document-details-dialog__error">
                {deleteDocError}
              </Text>
            )}
            <Text>
              {t('documents.deleteDialog.message', { name: document?.name ?? '' })}
            </Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setIsDeleteDocOpen(false)}
              disabled={deleteDocMutation.isPending}
            >
              {t('documents.deleteDialog.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="document-details-danger-button"
              onClick={() => void handleDeleteDocConfirm()}
              loading={deleteDocMutation.isPending}
              disabled={deleteDocMutation.isPending}
            >
              {t('documents.deleteDialog.confirm')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* 删除 iModel 确认（危险操作 HITL）。setFocus（review-8 I-1 P2 补齐）：
          打开即焦点入对话框——Escape 关闭挂对话框元素 onKeyDown，焦点不在
          其内则击键永不可达。 */}
      <Dialog
        isOpen={!!deleteImodelTarget}
        onClose={() => {
          setDeleteImodelError('');
          setDeleteImodelTarget(null);
        }}
        portal
        setFocus
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('documents.detail.card.deleteTitle')}
          className="document-details-dialog"
        >
          <Dialog.TitleBar titleText={t('documents.detail.card.deleteTitle')} />
          <Dialog.Content>
            {deleteImodelError && (
              <Text color="negative" className="document-details-dialog__error">
                {deleteImodelError}
              </Text>
            )}
            <Text>
              {t('documents.detail.card.deleteMessage', {
                name: deleteImodelTarget?.name ?? '',
              })}
            </Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setDeleteImodelTarget(null)}
              disabled={deleteImodelMutation.isPending}
            >
              {t('documents.deleteDialog.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="document-details-danger-button"
              onClick={() => void handleDeleteImodelConfirm()}
              loading={deleteImodelMutation.isPending}
              disabled={deleteImodelMutation.isPending}
            >
              {t('documents.deleteDialog.confirm')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </div>
  );
}
