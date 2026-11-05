/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioTopBar（M3 Task 3；T7 挂汉堡菜单 + 共享对话框；M4-T4 挂编辑三钮组；
 * M4-T7 第三钮演进为「保存版本」推送入口）：编辑器顶栏（对齐 os-11/os-24）——
 * - 品牌 LC（回 /documents）+ 汉堡文档菜单（DocumentMenuBar，os-24 位于品牌
 *   右侧、面包屑之前）+ 面包屑（文档 → iTwin 名 → iModel 名，名字经
 *   react-query 双查询：ItwinsClient.get / ImodelsClient.get）；
 * - 分支徽标（Main，os-11 文档名右侧 pill）；
 * - 操作区：**撤销/重做/保存版本三钮组（M4-T4，对齐 os-11 撤消/重做/保存键位，
 *   操作簇头部）**——状态由页面层 useUndoRedo（BriefcaseTxns 标准通道）下传：
 *   canUndo/canRedo/hasUnsavedChanges 驱动 disabled；未接线（props 缺省）时
 *   三钮诚实禁用。T4 评审 Important-1 演进（M4-T7 承接）：本应用工具链每 op
 *   自动 saveChanges，旧「保存」钮点击为 no-op 提交永不回落——第三钮改为
 *   「保存版本」入口，图标/tooltip 对齐 Onshape 版本模型；本地兜底 saveChanges
 *   语义下沉 dock「保存」钮与 Ctrl+S。B-model P0 Task 5 起第三钮开
 *   CreateNamedVersionDialog（canSaveVersion 门：干净态也可命名当前 changeset；
 *   有未保存变更先 pushChanges 再命名），PushChangesetDialog 退居 dock「推送」
 *   专用；
 * - 分享钮（T7 接共享对话框——复用 documents 模块 ShareDocumentDialog，
 *   跨模块经 @modules/documents barrel）+ 帮助钮 + 用户菜单
 *   （我的帐户/深色模式/退出登录，os-03 同口径）。
 * - **B-model P2.4（P2.1 F5 承接）**：`mode` 由页面按 iTwin 标记派生——B 文档
 *   分享传 B `DocumentSummary`（iModel id + project id）+ `imodelId` +
 *   `canManageShare`（iModel 权限对话；不会回落 A iTwin 通道）；汉堡菜单同步
 *   以 iModel 名为文档名（重命名走 ImodelsClient.update）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  MenuItem,
  DropdownMenu,
} from '@itwin/itwinui-react';
import { SvgCheckmark } from '@itwin/itwinui-icons-react';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { ShareDocumentDialog, type DocumentMode, type DocumentSummary } from '@modules/documents';
import { useTheme } from '@app/providers/ThemeContext.js';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import { DocumentMenuBar } from './DocumentMenuBar.js';

export interface PartStudioTopBarProps {
  iTwinId: string;
  iModelId: string;
  /**
   * B/A 文档上下文（P2.1 F5 承接 / P2.4 F1）：**undefined = marker 未定/失败**——
   * 此时分享/重命名禁用，绝不回落 A iTwin 通道（B 文档的分享/改名不得误伤项目）。
   */
  mode?: DocumentMode;
  /** 分享管理门：**iTwin** RBAC `imodels_manage`（服务端 grant/revoke/setSecured 口径，F2）。 */
  canManageShare?: boolean;
  /** 重命名门：**iModel** `imodels_manage`（PATCH /imodels/:id 口径，F2）。 */
  canManageDocument?: boolean;
  /** 撤销可用（BriefcaseTxns.isUndoPossible）；缺省 false（未接线诚实禁用）。 */
  canUndo?: boolean;
  /** 重做可用（BriefcaseTxns.isRedoPossible）；缺省 false。 */
  canRedo?: boolean;
  /** 有未推送本地变更（hasPendingTxns 口径）。保存版本钮的实际门禁是
   *  `canSaveVersion ?? hasUnsavedChanges`（见下方 disabled 表达式与注释）——
   *  本字段仅在 canSaveVersion 缺省（未接线/旧调用）时作为回退门。 */
  hasUnsavedChanges?: boolean;
  /** 保存版本可用性（B-model P0 Task 5）：干净态也可命名当前 changeset，
   * 由页面层以 canEdit ∧ connection 就绪传入；缺省回退 hasUnsavedChanges，
   * 保持既有测试/调用语义（未接线诚实禁用）。 */
  canSaveVersion?: boolean;
  /** 撤销回调（IModelApp.tools.run('Undo') 通道由页面层持有）。 */
  onUndo?: () => void;
  /** 重做回调。 */
  onRedo?: () => void;
  /** 保存版本回调（宿主开 Named Version 对话框；命名/pushChanges 通道由页面层持有）。 */
  onSave?: () => void;
}

export function PartStudioTopBar({
  iTwinId,
  iModelId,
  mode,
  canManageShare = false,
  canManageDocument = false,
}: PartStudioTopBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  // 会话由 RequireAuth 门保证在场；getStoredAuth 同步直读（登出即跳走，无需订阅）。
  const user = AuthSession.getStoredAuth()?.user;

  // 面包屑双查询（服务端态归 react-query，spec §3）；名字未到位时空串渲染，
  // 数据到位经一轮微任务回填（结构测试走 findBy* 异步断言）。
  const itwinQuery = useQuery({
    queryKey: ['part-studio', 'breadcrumb', 'itwin', iTwinId],
    queryFn: () => new ItwinsClient().get(iTwinId),
    enabled: !!iTwinId,
  });
  const imodelQuery = useQuery({
    queryKey: ['part-studio', 'breadcrumb', 'imodel', iModelId],
    queryFn: () => new ImodelsClient().get(iModelId),
    enabled: !!iModelId,
  });
  const itwinName = itwinQuery.data?.displayName ?? '';
  const imodelName = imodelQuery.data?.displayName ?? imodelQuery.data?.name ?? '';

  const [shareOpen, setShareOpen] = React.useState(false);

  /**
   * 分享目标（P2.1 F5 承接 / P2.4 DoD）：B 文档 = iModel 级 ACL（doc.id=iModelId、
   * projectId=iTwinId、mode='B'）；A 旧文档 = iTwin 通道。真实模式由页面按 iTwin
   * 标记注入，不再回落硬编码 A。useMemo 钉引用（对话框打开态不因父级重渲染重置）。
   */
  const shareDoc = React.useMemo<DocumentSummary | null>(() => {
    // F1：mode 未定/失败时**不构造任何 A 通道文档**——分享钮禁用，杜绝“未知
    // 当 A”把 B 文档操作送进 iTwin 项目 ACL。
    if (mode === 'B') {
      return {
        id: iModelId,
        name: imodelName,
        owner: '',
        role: '',
        createdAt: '',
        modifiedAt: null,
        mode: 'B',
        projectId: iTwinId,
        projectName: itwinName,
      };
    }
    if (mode === 'A') {
      return {
        id: iTwinId,
        name: itwinName,
        owner: '',
        role: '',
        createdAt: '',
        modifiedAt: null,
        mode: 'A',
        projectId: iTwinId,
      };
    }
    return null;
  }, [mode, iTwinId, iModelId, itwinName, imodelName]);

  const handleLogout = React.useCallback(async () => {
    await AuthSession.logout();
    navigate('/login');
  }, [navigate]);

  return (
    <>
      <header className="part-studio-top-bar" data-testid="part-studio-top-bar">
        <div className="part-studio-top-bar__leading">
          <button
            type="button"
            className="part-studio-brand"
            aria-label={t('common.app.name')}
            onClick={() => navigate('/documents')}
          >
            <span className="part-studio-logo-mark" aria-hidden="true">鲁</span>
            <span className="part-studio-brand__name">{t('common.app.name')}</span>
          </button>
          <DocumentMenuBar
            iTwinId={iTwinId}
            iModelId={iModelId}
            mode={mode}
            documentName={mode === 'B' ? imodelName : itwinName}
            canManage={canManageDocument}
          />
          <div className="part-studio-crumbs" aria-label={t('partStudio.topBar.breadcrumb.label')}>
            <button
              type="button"
              className="part-studio-crumb"
              onClick={() => navigate('/documents')}
            >
              {t('partStudio.topBar.breadcrumb.documents')}
            </button>
            <span className="part-studio-crumb__sep" aria-hidden="true">/</span>
            <button
              type="button"
              className="part-studio-crumb"
              onClick={() => navigate(`/documents/${iTwinId}`)}
            >
              {itwinName}
            </button>
            <span className="part-studio-crumb__sep" aria-hidden="true">/</span>
          </div>
          <div className="part-studio-doc-heading">
            <button
              type="button"
              className="part-studio-doc-title"
              onClick={() => navigate(`/documents/${iTwinId}`)}
            >
              {imodelName || itwinName}
            </button>
            <span className="part-studio-branch-pill">
              {t('partStudio.topBar.branch.main')}
            </span>
            <button
              type="button"
              className="part-studio-doc-action"
              aria-label={t('partStudio.topBar.copyLink')}
              title={t('partStudio.topBar.copyLink')}
              onClick={() => void navigator.clipboard?.writeText(window.location.href)}
            >
              <OnshapeIcon name="document-links" size={20} />
            </button>
            <span className="part-studio-doc-kind" aria-hidden="true">
              <OnshapeIcon name="public" size={16} />
            </span>
          </div>
        </div>
        <div className="part-studio-top-bar__actions">
          <button
            type="button"
            className="part-studio-topbar-placeholder part-studio-topbar-explore"
            aria-label={t('partStudio.topBar.explore')}
            title={t('partStudio.topBar.explore')}
            onClick={() => navigate('/showcase')}
          >
            <OnshapeIcon name="explore-onshape" size={18} />
            <span>{t('partStudio.topBar.explore')}</span>
          </button>
          <button
            type="button"
            className="part-studio-topbar-placeholder part-studio-topbar-notifications"
            aria-label={t('partStudio.topBar.notifications')}
            title={t('partStudio.topBar.notifications')}
          >
            <OnshapeIcon name="navbar-notifications" size={20} />
          </button>
          <button
            type="button"
            className="part-studio-topbar-placeholder part-studio-topbar-appstore"
            aria-label={t('partStudio.topBar.appStore')}
            title={t('partStudio.topBar.appStore')}
          >
            <OnshapeIcon name="navbar-app-store" size={20} />
          </button>
          <button
            type="button"
            className="part-studio-topbar-placeholder part-studio-topbar-learning"
            aria-label={t('partStudio.topBar.learningCenter')}
            title={t('partStudio.topBar.learningCenter')}
          >
            <OnshapeIcon name="navbar-learning-center" size={20} />
          </button>
          <button
            type="button"
            className="part-studio-topbar-placeholder part-studio-topbar-help"
            aria-label={t('partStudio.topBar.help')}
            title={t('partStudio.topBar.help')}
          >
            <OnshapeIcon name="navbar-help" size={20} />
          </button>
          <button
            type="button"
            className="part-studio-share-button"
            disabled={!shareDoc || (mode === 'B' && !canManageShare)}
            data-testid="part-studio-share-button"
            onClick={() => setShareOpen(true)}
          >
            {t('partStudio.topBar.share')}
          </button>
          <DropdownMenu
            menuItems={[
              <MenuItem key="account" onClick={() => navigate('/settings')}>
                {t('partStudio.topBar.userMenu.account')}
              </MenuItem>,
              <MenuItem
                key="theme-toggle"
                onClick={toggleTheme}
                startIcon={theme === 'dark' ? <SvgCheckmark /> : undefined}
              >
                {t('partStudio.topBar.userMenu.darkMode')}
              </MenuItem>,
              <MenuItem key="logout" onClick={() => void handleLogout()}>
                {t('partStudio.topBar.userMenu.logout')}
              </MenuItem>,
            ]}
          >
            <button
              type="button"
              className="part-studio-user-button"
              aria-label={t('partStudio.topBar.userMenu.open')}
            >
              <Avatar
                title={user?.name || user?.email}
                abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
                image={user?.avatar ? <img src={user.avatar} alt="" /> : undefined}
              />
              <span className="part-studio-user-name">{user?.name || user?.email || ''}</span>
              <span className="part-studio-user-caret" aria-hidden="true">▾</span>
            </button>
          </DropdownMenu>
        </div>
      </header>
      {/* 共享对话框（T7；P2.4 B/A 分流）：B 文档 = iModel 级权限（成员/邀请，
          无链接分享；canManageShare=imodels_manage fail-closed）；A = iTwin
          成员/邀请/链接三页签（旧行为不变）。 */}
      <ShareDocumentDialog
        doc={shareDoc}
        imodelId={mode === 'B' ? iModelId : undefined}
        canManageShare={mode === 'B' ? canManageShare : undefined}
        isOpen={shareOpen && !!shareDoc}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}
