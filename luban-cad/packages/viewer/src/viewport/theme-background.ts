/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 式视口底色（M4 Task 2；2026-11-02 live 采集修正）：
 * 亮色主题纯白 (255,255,255)、暗色主题深灰 (38,38,38)——数据模型里的 view 背景
 * 默认黑，观感与 Onshape 差距最大的一处。本模块只提供纯应用函数；观察
 * `documentElement[data-theme]` 的接线（MutationObserver 监听属性变化）留在
 * 消费侧（apps/web PartStudioPage，与旧应用同姿态——不用 useTheme，
 * 页面测试无 ThemeProvider）。
 */

import { ColorDef } from '@itwin/core-common';
import type { ScreenViewport } from '@itwin/core-frontend';

/** 视口主题（消费侧从 documentElement[data-theme] 解析；缺省 light）。 */
export type ViewportTheme = 'light' | 'dark';

/** 亮色主题底色（2026-11-02 live Onshape 采集：画布纯白 #ffffff）。 */
const LIGHT_BACKGROUND = ColorDef.from(255, 255, 255);
/** 暗色主题底色（Onshape 实测 #262626）。 */
const DARK_BACKGROUND = ColorDef.from(38, 38, 38);

/**
 * Apply the Onshape-style viewport background color for the given theme.
 * 写 displayStyle.backgroundColor 后 invalidateScene 触发重绘。
 */
export function applyViewportBackground(viewport: ScreenViewport, theme: ViewportTheme): void {
  viewport.view.displayStyle.backgroundColor = theme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  viewport.invalidateScene();
}
