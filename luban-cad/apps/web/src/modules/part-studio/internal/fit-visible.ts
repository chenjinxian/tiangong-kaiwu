/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 「缩放到合适大小」应用出口（2026-11-13 Onshape live 对齐）：
 * 只取视口中**可见**内容——当前 scope 的模型几何 ∪ 活动草图实体；空场景才用
 * 基准面装饰兜底。不改旋转、绝不回退 projectExtents。
 *
 * live 证据（私有 ui-evidence/sketch-camera-fit-20261113）：
 * - f 键/适应窗口不旋转相机；草图编辑时取景草图实体；
 * - 有实体 + 空草图时取景实体范围，空草图本身不改变取景；
 * - 空的草图/场景中基准面边框可越过视口，说明基准面装饰不并入实体取景。
 */

import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchDto } from '@luban-cad/shared';
import {
  fitViewToVisibleContent,
  type FitVisibleContentPadding,
} from '@luban-cad/viewer';
import { sketchWorldRange } from '../canvas/sketch-camera.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

/** 草图对话框打开时的留白：左侧避让面板（与旧草图取景口径一致）。 */
export const SKETCH_FIT_PADDING: FitVisibleContentPadding = {
  left: 0.22,
  right: 0.05,
  top: 0.08,
  bottom: 0.08,
};

/** 非草图态的通用留白（与特征后自动取景/页签条适应视图一致）。 */
export const MODEL_FIT_PADDING: FitVisibleContentPadding = {
  left: 0.06,
  right: 0.06,
  top: 0.08,
  bottom: 0.08,
};

/**
 * 按可见内容取景。`sketch` 仅在草图编辑态传入（活动草图装饰是该态唯一草图
 * 图形）；非草图态其他草图不渲染，因此不参与。
 * @returns true = 已写相机；false = 无可见内容/视口不可用（相机保持）。
 */
export async function fitVisibleContent(
  viewport: ScreenViewport | null | undefined,
  sketch?: SketchDto | null,
  paddingPercent: FitVisibleContentPadding = sketch ? SKETCH_FIT_PADDING : MODEL_FIT_PADDING,
): Promise<boolean> {
  if (!viewport)
    return false;
  const models = typeof viewport.view.isSpatialView === 'function' && viewport.view.isSpatialView()
    ? [...viewport.view.modelSelector.models]
    : [];
  const datum = usePartStudioStore.getState().datum.visibility;
  return fitViewToVisibleContent(viewport, {
    modelIds: models,
    sketchRange: sketch ? sketchWorldRange(sketch.plane, sketch.entities) : undefined,
    datumPlanesVisible: datum.top || datum.front || datum.right,
    paddingPercent,
  });
}
