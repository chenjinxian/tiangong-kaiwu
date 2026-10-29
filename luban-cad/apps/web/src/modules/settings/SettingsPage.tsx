/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SettingsPage（M2 Task 7）：/settings 设置页（对齐 Onshape os-48 账户设置页）——
 * - 顶栏：LC 品牌（回 /documents）+ HeaderBreadcrumbs（返回「文档」→ 当前「设置」）
 *   + 主题切换 + 用户菜单（我的帐户/深色模式/退出登录，os-03）；
 * - 左栏（SettingsSidebar）：帐户九项 + 订阅三项 + 团队一项的分区导航；
 * - 主区：选中分区面板——个人资料（SettingsProfilePanel）/ 首选项
 *   （SettingsPreferencesPanel）为真实内容，其余分区渲染「即将推出」
 *   占位（NonIdealState，导航结构完整对齐 os-48）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Header,
  HeaderBreadcrumbs,
  HeaderButton,
  HeaderLogo,
  IconButton,
  MenuItem,
  NonIdealState,
  DropdownMenu,
  Flex,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgCheckmark,
  SvgChevronLeft,
  SvgMoon,
  SvgSettings,
  SvgSun,
} from '@itwin/itwinui-icons-react';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { useTheme } from '@app/providers/ThemeContext.js';
import type { SettingsSectionId } from './types.js';
import { SettingsSidebar } from './components/SettingsSidebar.js';
import { SettingsProfilePanel } from './components/SettingsProfilePanel.js';
import { SettingsPreferencesPanel } from './components/SettingsPreferencesPanel.js';
import './SettingsPage.css';

export function SettingsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  // 会话由 RequireAuth 门保证在场；getStoredAuth 同步直读（登出即跳走，无需订阅）。
  const user = AuthSession.getStoredAuth()?.user;

  const [selected, setSelected] = React.useState<SettingsSectionId>('profile');

  const handleLogout = React.useCallback(async () => {
    await AuthSession.logout();
    navigate('/login');
  }, [navigate]);

  const renderPanel = (): React.ReactNode => {
    if (selected === 'profile') {
      return <SettingsProfilePanel user={user} />;
    }
    if (selected === 'preferences') {
      return <SettingsPreferencesPanel />;
    }
    return (
      <SurfacePlaceholder />
    );
  };

  return (
    <div className="settings-page">
      {/* 顶栏 — 品牌（回文档首页）+ 面包屑（文档 → 设置）+ 主题/用户菜单 */}
      <Header
        className="settings-header"
        appLogo={
          <HeaderLogo
            logo={<div className="settings-logo-mark">LC</div>}
            onClick={() => navigate('/documents')}
          >
            {t('common.app.name')}
          </HeaderLogo>
        }
        breadcrumbs={
          <HeaderBreadcrumbs
            items={[
              <HeaderButton
                key="back"
                name={t('settings.breadcrumb.back')}
                onClick={() => navigate('/documents')}
                startIcon={<SvgChevronLeft />}
              />,
              <HeaderButton
                key="current"
                name={t('settings.breadcrumb.current')}
                isActive
              />,
            ]}
          />
        }
        actions={[
          <IconButton
            key="theme"
            label={t('settings.userMenu.darkMode')}
            styleType="borderless"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SvgSun /> : <SvgMoon />}
          </IconButton>,
          <DropdownMenu
            key="user-menu"
            menuItems={[
              <MenuItem key="account" onClick={() => navigate('/settings')}>
                {t('settings.userMenu.account')}
              </MenuItem>,
              <MenuItem
                key="theme-toggle"
                onClick={toggleTheme}
                startIcon={theme === 'dark' ? <SvgCheckmark /> : undefined}
              >
                {t('settings.userMenu.darkMode')}
              </MenuItem>,
              <MenuItem key="logout" onClick={() => void handleLogout()}>
                {t('settings.userMenu.logout')}
              </MenuItem>,
            ]}
          >
            <IconButton label={t('settings.userMenu.open')} styleType="borderless">
              <Avatar
                title={user?.name || user?.email}
                abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
                image={user?.avatar ? <img src={user.avatar} alt="" /> : undefined}
              />
            </IconButton>
          </DropdownMenu>,
        ]}
      />

      {/* 主体：左导航（分区）+ 主面板 */}
      <Flex className="settings-content" flexDirection="row">
        <SettingsSidebar selected={selected} onSelect={setSelected} />
        <main className="settings-main" data-testid="settings-panel">
          {renderPanel()}
        </main>
      </Flex>
    </div>
  );
}

/** 占位分区面板（导航渲染完整，内容后续版本提供）。 */
function SurfacePlaceholder(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="settings-panel settings-panel--placeholder">
      <NonIdealState
        svg={<SvgSettings />}
        heading={t('settings.placeholder.title')}
        description={<Text>{t('settings.placeholder.description')}</Text>}
      />
    </div>
  );
}
