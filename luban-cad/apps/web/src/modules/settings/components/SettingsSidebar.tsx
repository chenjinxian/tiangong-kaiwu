/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SettingsSidebar（M2 Task 7）：设置页左导航（对齐 Onshape os-48 分区结构）——
 * 帐户（个人资料/电子邮件/首选项/通知/安全/设备/应用程序/集成/开发者）+
 * 订阅（订阅/支付选项/支付记录）+ 团队（团队）。SideNavigation 承载，
 * 展开态常开（expander 隐藏）；分区标题为非交互 Text，项为 SidenavButton。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SideNavigation, SidenavButton, Text } from '@itwin/itwinui-react';
import {
  SvgComputer,
  SvgDeveloper,
  SvgEmail,
  SvgGroup,
  SvgLink,
  SvgLock,
  SvgNotification,
  SvgPlugin,
  SvgSettings,
  SvgStar,
  SvgStarHollow,
  SvgUser,
} from '@itwin/itwinui-icons-react';
import type { SettingsNavSection, SettingsSectionId } from '../types.js';

/** 分区模型（os-48 采集；labelKey 挂 settings.nav.sections.* 词库）。 */
export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = [
  {
    id: 'account',
    labelKey: 'settings.nav.sections.account',
    items: [
      'profile', 'email', 'preferences', 'notifications', 'security',
      'devices', 'applications', 'integrations', 'developer',
    ],
  },
  {
    id: 'subscription',
    labelKey: 'settings.nav.sections.subscription',
    items: ['subscription', 'paymentOptions', 'paymentHistory'],
  },
  {
    id: 'team',
    labelKey: 'settings.nav.sections.team',
    items: ['team'],
  },
];

/** 各项图标（装饰性；订阅组无支付语义的现成图标，取星标族中性承载）。 */
const SECTION_ICONS: Record<SettingsSectionId, React.JSX.Element> = {
  profile: <SvgUser />,
  email: <SvgEmail />,
  preferences: <SvgSettings />,
  notifications: <SvgNotification />,
  security: <SvgLock />,
  devices: <SvgComputer />,
  applications: <SvgPlugin />,
  integrations: <SvgLink />,
  developer: <SvgDeveloper />,
  subscription: <SvgStar />,
  paymentOptions: <SvgStarHollow />,
  paymentHistory: <SvgNotification />,
  team: <SvgGroup />,
};

export interface SettingsSidebarProps {
  selected: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}

export function SettingsSidebar({ selected, onSelect }: SettingsSidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  const items = SETTINGS_NAV_SECTIONS.map((section) => (
    <div className="settings-sidebar__section" key={section.id}>
      <Text variant="small" className="settings-sidebar__section-title">
        {t(section.labelKey)}
      </Text>
      {section.items.map((id) => (
        <SidenavButton
          key={id}
          startIcon={SECTION_ICONS[id]}
          isActive={selected === id}
          onClick={() => onSelect(id)}
        >
          {t(`settings.nav.items.${id}`)}
        </SidenavButton>
      ))}
    </div>
  ));

  return (
    <SideNavigation
      className="settings-sidebar__nav"
      data-testid="settings-sidebar"
      isExpanded
      expanderPlacement="hidden"
      items={items}
      wrapperProps={{ 'aria-label': t('settings.breadcrumb.current') }}
    />
  );
}
