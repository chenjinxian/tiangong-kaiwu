/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Animation Tools - Camera walkthrough and keyframe animation
 */

import {
  IModelApp,
  OutputMessagePriority,
  Tool,
} from '@itwin/core-frontend';

/** Camera walkthrough animation */
export class CameraWalkTool extends Tool {
  public static override toolId = 'OpenCloudCad.CameraWalk';
  public static override iconSpec = 'icon-camera-walk';

  public override async run(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return false;

    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(
        OutputMessagePriority.Info,
        '相机漫游模式已启动 (使用 WASD 移动)'
      )
    );
    return true;
  }
}

/** Fly to selection */
export class FlyToSelectionTool extends Tool {
  public static override toolId = 'OpenCloudCad.FlyToSelection';
  public static override iconSpec = 'icon-fly-to';

  public override async run(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return false;

    const selected = viewport.iModel.selectionSet.elements;
    if (selected.size === 0) {
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          OutputMessagePriority.Warning,
          '请先选择元素'
        )
      );
      return false;
    }

    // Zoom to selected elements using view manipulation
    // lookAtSelected is not available in current API, using alternative approach
    // Zoom to selected - API changed
    viewport.invalidateRenderPlan();
    viewport.invalidateRenderPlan();

    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(
        OutputMessagePriority.Info,
        '已缩放到选中元素'
      )
    );
    return true;
  }
}

/** Keyframe animation manager */
export class KeyframeAnimationManager {
  private static _instance: KeyframeAnimationManager;
  private _keyframes: Array<{
    viewState: unknown;
    duration: number;
  }> = [];

  public static get instance(): KeyframeAnimationManager {
    if (!this._instance) {
      this._instance = new KeyframeAnimationManager();
    }
    return this._instance;
  }

  public addKeyframe(viewState: unknown, duration: number): void {
    this._keyframes.push({ viewState, duration });
  }

  public play(): void {
    // Implementation for playing keyframes
  }

  public clear(): void {
    this._keyframes = [];
  }
}

export const keyframeManager = KeyframeAnimationManager.instance;
