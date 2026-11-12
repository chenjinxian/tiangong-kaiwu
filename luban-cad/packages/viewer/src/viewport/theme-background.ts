/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 式视口底色（2026-11-02 live 采集；2026-11-12 收敛到 shared 默认值）：
 * 亮色主题纯白、暗色主题 #262626——数据模型里的 view 背景默认黑，观感与
 * Onshape 差距最大的一处。本模块提供纯 ViewState 应用器（首帧前调用）与
 * viewport 包装器；观察 `documentElement[data-theme]` 的接线留在消费侧
 * （apps/web PartStudioPage，不用 useTheme，页面测试无 ThemeProvider）。
 */

import { ColorDef } from '@itwin/core-common';
import type { ScreenViewport, ViewState } from '@itwin/core-frontend';
import { RENDER_DEFAULTS, type RenderTheme } from '@luban-cad/shared';

/** 视口主题（消费侧从 documentElement[data-theme] 解析；缺省 light）。 */
export type ViewportTheme = RenderTheme;

function backgroundColor(theme: ViewportTheme): ColorDef {
  const rgb = RENDER_DEFAULTS.background[theme];
  return ColorDef.from(rgb.r, rgb.g, rgb.b);
}

/**
 * 纯 ViewState 背景：在 `ScreenViewport.create` / `addViewport` 前调用，
 * 保证首帧即为主题底色（不出现黑底再切白）。
 */
export function applyViewStateBackground(view: ViewState, theme: ViewportTheme): void {
  view.displayStyle.backgroundColor = backgroundColor(theme);
}

/**
 * Apply the Onshape-style viewport background color for the given theme.
 * 写 displayStyle.backgroundColor 后 invalidateScene 触发重绘。
 */
export function applyViewportBackground(viewport: ScreenViewport, theme: ViewportTheme): void {
  applyViewStateBackground(viewport.view, theme);
  viewport.invalidateScene();
}
