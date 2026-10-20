/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Divider,
  Header,
  HeaderBreadcrumbs,
  HeaderButton,
  HeaderLogo,
  IconButton,
} from '@itwin/itwinui-react';
import { SvgExport, SvgInfo } from '@itwin/itwinui-icons-react';
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
}) => {
  const { t } = useTranslation('editor');
  const { t: tCommon } = useTranslation('common');
  const currentModelName = isIModelLoading
    ? t('topbar.loading')
    : (iModelName ?? iModelId?.slice(0, 8) ?? '');

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
