/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioTopBar（M3 Task 3）：编辑器顶栏（对齐 os-11）——
 * - 品牌 LC（回 /documents）+ 面包屑（文档 → iTwin 名 → iModel 名，名字经
 *   react-query 双查询：ItwinsClient.get / ImodelsClient.get）；
 * - 分支徽标（Main，os-11 文档名右侧 pill）；
 * - 操作区：分享钮（T6+ 接共享对话框，壳期占位可点）+ 帮助钮 + 用户菜单
 *   （我的帐户/深色模式/退出登录，os-03 同口径）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  Header,
  HeaderBreadcrumbs,
  HeaderButton,
  HeaderLogo,
  IconButton,
  MenuItem,
  DropdownMenu,
} from '@itwin/itwinui-react';
import {
  SvgCheckmark,
  SvgChevronLeft,
  SvgHelpCircularHollow,
  SvgShare,
} from '@itwin/itwinui-icons-react';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { useTheme } from '@app/providers/ThemeContext.js';

export interface PartStudioTopBarProps {
  iTwinId: string;
  iModelId: string;
}

export function PartStudioTopBar({ iTwinId, iModelId }: PartStudioTopBarProps): React.JSX.Element {
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

  const handleLogout = React.useCallback(async () => {
    await AuthSession.logout();
    navigate('/login');
  }, [navigate]);

  return (
    <Header
      className="part-studio-top-bar"
      data-testid="part-studio-top-bar"
      appLogo={
        <HeaderLogo
          logo={<div className="part-studio-logo-mark">LC</div>}
          onClick={() => navigate('/documents')}
        >
          {t('common.app.name')}
        </HeaderLogo>
      }
      breadcrumbs={
        <HeaderBreadcrumbs
          items={[
            <HeaderButton
              key="documents"
              name={t('partStudio.topBar.breadcrumb.documents')}
              onClick={() => navigate('/documents')}
              startIcon={<SvgChevronLeft />}
            />,
            <HeaderButton
              key="itwin"
              name={itwinName}
              onClick={() => navigate(`/documents/${iTwinId}`)}
            />,
            <HeaderButton key="imodel" name={imodelName} isActive />,
            // 分支徽标（os-11：文档名右侧 pill；非导航项，作面包屑末位装饰）。
            <span key="branch" className="part-studio-branch-pill">
              {t('partStudio.topBar.branch.main')}
            </span>,
          ]}
        />
      }
      actions={[
        // 分享：壳期占位（T6+ 接共享对话框；按钮可点，完整 UI 面不灰化）。
        <Button
          key="share"
          size="small"
          styleType="high-visibility"
          startIcon={<SvgShare />}
          className="part-studio-share-button"
        >
          {t('partStudio.topBar.share')}
        </Button>,
        <IconButton
          key="help"
          label={t('partStudio.topBar.help')}
          styleType="borderless"
          className="part-studio-help-button"
        >
          <SvgHelpCircularHollow />
        </IconButton>,
        <DropdownMenu
          key="user-menu"
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
          <IconButton label={t('partStudio.topBar.userMenu.open')} styleType="borderless">
            <Avatar
              title={user?.name || user?.email}
              abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
              image={user?.avatar ? <img src={user.avatar} alt="" /> : undefined}
            />
          </IconButton>
        </DropdownMenu>,
      ]}
    />
  );
}
