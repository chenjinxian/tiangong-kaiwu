/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 树/侧栏事件作用域守卫（ADR-0020 S3b review P1-2）。
 *
 * 草图覆盖层（SketchEntityPicker / SketchDimensionEditor）在 window 捕获段
 * 监听 Delete/Backspace 删除选中的草图实体/尺寸。特征树与侧栏也在同一窗口
 * 上；变量行聚焦后按 Delete 应删除变量，而不是草图里仍处于选中态的实体/
 * 尺寸。草图覆盖层在动手前先按事件 target 是否位于树/侧栏内让位（单一
 * 选择器常量，避免两处各写一套 closest）。
 */

/** 特征树/侧栏容器（FeatureTree 根与 PartStudioSidebar 根）。 */
export const TREE_OR_SIDEBAR_SELECTOR =
  '[data-testid="part-studio-tree"], [data-testid="part-studio-sidebar"]';

/** 事件 target 是否位于特征树/侧栏内（jsdom 无 Element 环境返回 false）。 */
export function isTreeOrSidebarTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element))
    return false;
  return target.closest(TREE_OR_SIDEBAR_SELECTOR) !== null;
}
