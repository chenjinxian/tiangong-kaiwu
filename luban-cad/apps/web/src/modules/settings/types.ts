/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * settings 模块契约类型（M2 Task 7）。
 */

/** 左导航分区项 id（对齐 Onshape os-48 账户设置页 IA）。
 * 仅 profile / preferences 有真实面板，其余渲染「即将推出」占位。 */
export type SettingsSectionId =
  | 'profile'
  | 'email'
  | 'preferences'
  | 'notifications'
  | 'security'
  | 'devices'
  | 'applications'
  | 'integrations'
  | 'developer'
  | 'subscription'
  | 'paymentOptions'
  | 'paymentHistory'
  | 'team';

/** 左导航分区（os-48：帐户 / 订阅 / 团队）。 */
export interface SettingsNavSection {
  id: 'account' | 'subscription' | 'team';
  /** i18n 键（settings.nav.sections.<id>）。 */
  labelKey: string;
  items: SettingsSectionId[];
}
