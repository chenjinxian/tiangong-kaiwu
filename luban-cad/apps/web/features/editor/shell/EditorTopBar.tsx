/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Button,
  Divider,
  Header,
  HeaderBreadcrumbs,
  HeaderButton,
  HeaderLogo,
  IconButton,
} from '@itwin/itwinui-react';
import { SvgExport, SvgInfo, SvgRename, SvgShare } from '@itwin/itwinui-icons-react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { EditorBriefcaseStatus } from '../components/EditorBriefcaseStatus.js';

interface EditorUser {
  name?: string | null;
  email?: string | null;
}

export interface EditorTopBarProps {
  iTwinName?: string;
  iModelName?: string;
  iModelId?: string;
  isIModelLoading: boolean;
  isEditable: boolean;
  connection: BriefcaseConnection | null;
  connectionLoading: boolean;
  connectionError: Error | null;
  user: EditorUser | null;
  onBack: () => void;
  onNavigateToProject: () => void;
  onExport: () => void;
  /** 分享当前项目（复用 ShareITwinDialog，P3 真实现） */
  onShare: () => void;
  /** 重命名当前 iModel（RenameIModelDialog） */
  onRename: () => void;
  /** 版本药丸 → 打开历史停靠 */
  onOpenHistory: () => void;
  /** 当前 changeset 展示标签（如 #12）；缺省不渲染药丸 */
  changesetLabel?: string;
}

/**
 * EditorShell 顶栏（RW4-P4-T4-1）：itwin-ui Header + HeaderBreadcrumbs 承载
 * 「项目列表 / 项目 / 模型」三级面包屑，右侧保留简报状态/导出/主题/头像。
 * 选择器契约：HeaderBreadcrumbs 带 `breadcrumb` class（存量 workflow spec 依赖）；
 * 「项目列表」保持 button 语义（editor.spec/getByRole）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  iTwinName,
  iModelName,
  iModelId,
  isIModelLoading,
  isEditable,
  connection,
  connectionLoading,
  connectionError,
  user,
  onBack,
  onNavigateToProject,
  onExport,
  onShare,
  onRename,
  onOpenHistory,
  changesetLabel,
}) => {
  const { t } = useTranslation('editor');
  const { t: tCommon } = useTranslation('common');
  // 名称回退：displayName（= name，官方 API 口径）→ name → ID 片段（Editor 已做前两级，
  // 此处保留兜底；P5 终审 I4 实测曾只显示 ID 片段）
  const currentModelName = isIModelLoading
    ? t('topbar.loading')
    : (iModelName || iModelId?.slice(0, 8) || '');

  const breadcrumbs = [
    <HeaderButton key="documents" name={t('topbar.projectList')} onClick={onBack} />,
    ...(iTwinName
      ? [<HeaderButton key="itwin" name={iTwinName} onClick={onNavigateToProject} />]
      : []),
    <HeaderButton key="imodel" name={currentModelName} isActive />,
  ];

  const actions: React.ReactNode[] = [
    <EditorBriefcaseStatus
      key="briefcase-status"
      connection={connection}
      isLoading={connectionLoading}
      error={connectionError}
      isEditable={isEditable}
    />,
    ...(changesetLabel
      ? [
          <Button
            key="version-pill"
            styleType="borderless"
            size="small"
            onClick={onOpenHistory}
            title={t('topbar.versionPillTitle')}
          >
            {changesetLabel}
          </Button>,
        ]
      : []),
    // Onshape 签名：顶栏「Share」为带文字的默认按钮，非纯图标
    <Button
      key="share"
      styleType="default"
      size="small"
      startIcon={<SvgShare />}
      onClick={onShare}
    >
      {t('topbar.share')}
    </Button>,
    ...(isEditable
      ? [
          <IconButton
            key="rename"
            styleType="default"
            onClick={onRename}
            label={t('topbar.rename')}
          >
            <SvgRename />
          </IconButton>,
        ]
      : []),
    ...(!isEditable
      ? [
          <IconButton
            key="permission-hint"
            styleType="default"
            disabled
            label={t('topbar.editPermissionRequired')}
          >
            <SvgInfo />
          </IconButton>,
        ]
      : []),
    <IconButton
      key="export"
      styleType="default"
      onClick={onExport}
      label={t('topbar.exportModel')}
    >
      <SvgExport />
    </IconButton>,
    <Divider key="actions-divider" orientation="vertical" />,
    <ThemeToggle key="theme-toggle" />,
    <Avatar
      key="user-avatar"
      title={user?.name || user?.email || undefined}
      abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
    />,
  ];

  return (
    <Header
      className="editor-topbar"
      appLogo={
        <HeaderLogo logo={<span className="logo-mark">LC</span>}>{tCommon('app.name')}</HeaderLogo>
      }
      breadcrumbs={<HeaderBreadcrumbs className="breadcrumb" items={breadcrumbs} />}
      actions={actions}
    />
  );
};

EditorTopBar.displayName = 'EditorTopBar';

export default EditorTopBar;
