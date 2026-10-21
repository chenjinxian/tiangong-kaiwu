/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * settings 模块 barrel（spec 规则 4：跨模块只准 import 模块入口
 * `@modules/<name>`）——对外出口 SettingsPage 与契约类型（M2 Task 7；
 * routes 层 SettingsRoute 经本 barrel 消费页面）。
 */

export { SettingsPage } from './SettingsPage.js';
export type { SettingsNavSection, SettingsSectionId } from './types.js';
