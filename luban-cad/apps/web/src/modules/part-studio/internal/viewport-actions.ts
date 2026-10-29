/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio viewport 动作映射（M3 Task 5，internal/ 菜单构建纯函数与能力
 * 映射一族）——画布右键/页签条的视图命令出口。全部 **no-op 安全**：壳期
 * 无真实 ScreenViewport（T6 接管创建），`IModelApp.viewManager.selectedView`
 * 缺席时静默返回；真 viewport 在场时按旧应用 Editor.tsx 同口径执行。
 */

import { IModelApp, StandardViewId } from '@itwin/core-frontend';

/** 标准视图方位（内部模型枚举；调用点映射 core-frontend StandardViewId）。 */
export type StandardViewKind = 'top' | 'front' | 'right' | 'iso';

/** 视口子集（避开 Viewport 全类型，便于测试注入 fake）。 */
interface ViewportLike {
  view: {
    lookAtViewAlignedVolume: (volume: unknown, aspect: number) => void;
    computeFitRange: () => unknown;
    is3d: () => boolean;
    turnCameraOff: () => void;
  };
  viewRect: { aspect: number };
  synchWithView: (args: Record<string, never>) => void;
  setStandardRotation: (id: StandardViewId) => void;
}

function selectedView(): ViewportLike | undefined {
  // viewManager 壳期（ viewer 未启动 / 测试态）可能未初始化——可选链静默缺席。
  return IModelApp.viewManager?.selectedView as ViewportLike | undefined;
}

/** 适应视图：全模型取景（旧应用 Editor.tsx handleFitView 同口径）。 */
export function fitView(): void {
  const viewport = selectedView();
  if (!viewport) return;
  viewport.view.lookAtViewAlignedVolume(viewport.view.computeFitRange(), viewport.viewRect.aspect);
  viewport.synchWithView({});
}

/** 标准视图：正交旋转 + 3D 关相机（旧应用 handleStandardView 同口径）。 */
export function standardView(view: StandardViewKind): void {
  const viewport = selectedView();
  if (!viewport) return;
  // 惰性映射：模块加载不触 StandardViewId（部分 mock 的测试文件友好）。
  const standardViewIds: Record<StandardViewKind, StandardViewId> = {
    top: StandardViewId.Top,
    front: StandardViewId.Front,
    right: StandardViewId.Right,
    iso: StandardViewId.Iso,
  };
  viewport.setStandardRotation(standardViewIds[view]);
  if (viewport.view.is3d()) {
    viewport.view.turnCameraOff();
  }
}

/**
 * 缩放到合适大小（选中对象取景）——os-12 选中态菜单项。T5 拾取通道未接线
 * （无选中几何 extents 可取景），先等价适应视图；T6 pick 通道落地后改为
 * 按选择集 extents 取景。
 */
export function zoomToSelection(): void {
  fitView();
}

/**
 * 视图垂直于（面法向取景）——os-12 选中态菜单项。需要拾取面法向（T6 接线），
 * 当前无几何输入，静默跳过并留警告钩子；菜单项照常渲染（完整 UI 面）。
 */
export function viewNormalToSelection(): void {
  // T6：读 store.canvas.selection 的面法向 → viewport.view.lookAt + synchWithView。
}
