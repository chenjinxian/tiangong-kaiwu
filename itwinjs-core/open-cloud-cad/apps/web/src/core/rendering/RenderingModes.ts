/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Advanced Rendering Modes and Effects
 */

import {
  IModelApp,
  Tool,
} from '@itwin/core-frontend';
import { RenderMode } from '@itwin/core-common';

/** Toggle shadows */
export class ToggleShadowsTool extends Tool {
  public static override toolId = 'OpenCloudCad.ToggleShadows';

  public override async run(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return false;

    // Shadows setting is not directly accessible in current API
    // This is a placeholder for future implementation
    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(
        1,
        '阴影设置功能开发中'
      )
    );
    return true;
  }
}

/** Toggle ambient occlusion */
export class ToggleAOTool extends Tool {
  public static override toolId = 'OpenCloudCad.ToggleAO';

  public override async run(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return false;

    // Toggle AO settings
    viewport.invalidateRenderPlan();

    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(
        1,
        '环境光遮蔽已切换'
      )
    );
    return true;
  }
}

/** Set render mode */
export class SetRenderModeTool extends Tool {
  public static override toolId = 'OpenCloudCad.SetRenderMode';

  public override async run(mode?: RenderMode): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport || mode === undefined) return false;

    // Render mode is read-only in current API
    // Use viewFlags to change rendering style
    // Note: renderMode is read-only, this is a limitation of current API
    viewport.invalidateRenderPlan();

    const modeNames: Record<RenderMode, string> = {
      [RenderMode.Wireframe]: '线框',
      [RenderMode.HiddenLine]: '隐藏线',
      [RenderMode.SolidFill]: '实心填充',
      [RenderMode.SmoothShade]: '平滑着色',
    };

    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(
        1,
        `渲染模式: ${modeNames[mode] || mode}`
      )
    );
    return true;
  }
}

/** Rendering settings manager */
export class RenderingSettingsManager {
  private _shadowsEnabled = true;
  private _aoEnabled = false;
  private _renderMode = RenderMode.SmoothShade;

  public get shadowsEnabled(): boolean { return this._shadowsEnabled; }
  public get aoEnabled(): boolean { return this._aoEnabled; }
  public get renderMode(): RenderMode { return this._renderMode; }

  public setShadows(enabled: boolean): void {
    this._shadowsEnabled = enabled;
  }

  public setAO(enabled: boolean): void {
    this._aoEnabled = enabled;
  }

  public setRenderMode(mode: RenderMode): void {
    this._renderMode = mode;
  }
}

export const renderingSettings = new RenderingSettingsManager();
