/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 鼠标导航（2026-11-12 live 对拍）：
 * - 右键拖拽 = 旋转（实测 `03-sketch-right-drag`）；
 * - Ctrl+右键拖拽 = 平移（实测 `19-sketch-ctrl-right-drag`）；
 * - 中键平移 / 滚轮缩放沿用上游 `IdleTool`。
 *
 * 上游 `IdleTool` 的 Reset 分支只在没有活动工具时生效；Part Studio 常驻
 * `OnshapeSelectTool`、草图工具也常驻，因此改用本子类替换 `ToolAdmin.idleTool`，
 * 让“活动工具不处理的事件”仍能落到右键导航。视图操作用上游
 * `ViewManip`（`oneShot + isDraggingRequired`，与 `IdleTool` 完全同路径），
 * 不自写相机旋转/平移。
 */
import {
  BeButton,
  EventHandled,
  IdleTool,
  IModelApp,
  ViewHandleType,
} from '@itwin/core-frontend';
import type { BeButtonEvent, ViewManip } from '@itwin/core-frontend';
import { markRightDragMenuSuppression } from '../../internal/right-drag-menu.js';

export class OnshapeIdleTool extends IdleTool {
  public override async onMouseStartDrag(ev: BeButtonEvent): Promise<EventHandled> {
    if (ev.button !== BeButton.Reset)
      return super.onMouseStartDrag(ev);

    const viewport = ev.viewport;
    if (!viewport)
      return EventHandled.No;

    // Onshape：Ctrl+右键平移，其余（含 Shift/无修饰）右键旋转。
    const pan = ev.isControlKey;
    const toolId = pan ? 'View.Pan' : 'View.Rotate';
    const handleId = pan ? ViewHandleType.Pan : ViewHandleType.Rotate;
    markRightDragMenuSuppression();

    const viewTool = IModelApp.tools.create(toolId, viewport, true, true) as ViewManip | undefined;
    if (viewTool && await viewTool.run())
      return viewTool.startHandleDrag(ev, handleId);

    // 导航工具不可用时也吞掉该拖拽，避免随后误弹右键菜单（拖拽已完成）。
    return EventHandled.Yes;
  }
}
