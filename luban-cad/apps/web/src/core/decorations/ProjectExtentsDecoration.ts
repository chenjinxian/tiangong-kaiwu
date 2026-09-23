/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Project Extents Decoration - Displays project extents as a wireframe box
 * Based on @itwin/frontend-devtools implementation
 *--------------------------------------------------------------------------------------------*/

import { AxisAlignedBox3d, ColorDef, LinePixels } from "@itwin/core-common";
import { DecorateContext, GraphicType, IModelApp, IModelConnection, Tool } from "@itwin/core-frontend";

/**
 * ProjectExtentsDecoration displays a wireframe box representing the iModel's project extents.
 * This helps users visualize the boundaries of the project.
 */
export class ProjectExtentsDecoration {
  private static _decorator?: ProjectExtentsDecoration;
  protected _removeDecorationListener?: () => void;
  protected _extents: AxisAlignedBox3d;

  public constructor(iModel: IModelConnection) {
    this._extents = iModel.projectExtents;
    this.updateDecorationListener(true);
  }

  protected stop(): void { this.updateDecorationListener(false); }

  protected updateDecorationListener(add: boolean): void {
    if (this._removeDecorationListener) {
      if (!add) {
        this._removeDecorationListener();
        this._removeDecorationListener = undefined;
      }
    } else if (add) {
      if (!this._removeDecorationListener)
        this._removeDecorationListener = IModelApp.viewManager.addDecorator(this);
    }
  }

  public static get isActive(): boolean {
    return undefined !== ProjectExtentsDecoration._decorator;
  }

  /** This allows the render system to cache and reuse decorations */
  public readonly useCachedDecorations = true;

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;

    const builderAccVis = context.createGraphicBuilder(GraphicType.WorldDecoration);
    const builderAccHid = context.createGraphicBuilder(GraphicType.WorldOverlay);

    // White color that contrasts with background
    const colorAccVis = ColorDef.white.adjustedForContrast(context.viewport.view.backgroundColor);
    const colorAccHid = colorAccVis.withAlpha(100);

    builderAccVis.setSymbology(colorAccVis, ColorDef.black, 3);
    builderAccHid.setSymbology(colorAccHid, ColorDef.black, 1, LinePixels.Code2);

    // Draw the extents box
    builderAccVis.addRangeBox(this._extents);
    builderAccHid.addRangeBox(this._extents);

    context.addDecorationFromBuilder(builderAccVis);
    context.addDecorationFromBuilder(builderAccHid);
  }

  /**
   * Toggle project extents decoration
   * @param imodel The iModel from which to obtain the extents
   * @param enabled If undefined, toggles current state; otherwise sets to enabled
   * @returns true if extents are now ON, false if OFF
   */
  public static toggle(imodel: IModelConnection, enabled?: boolean): boolean {
    if (undefined !== enabled) {
      const alreadyEnabled = undefined !== ProjectExtentsDecoration._decorator;
      if (enabled === alreadyEnabled)
        return alreadyEnabled;
    }

    if (undefined === ProjectExtentsDecoration._decorator) {
      ProjectExtentsDecoration._decorator = new ProjectExtentsDecoration(imodel);
      return true;
    } else {
      ProjectExtentsDecoration._decorator.stop();
      ProjectExtentsDecoration._decorator = undefined;
      return false;
    }
  }
}

/**
 * Enable or disable project extents decoration
 * @param imodel The iModel from which to obtain the extents
 * @param enabled If undefined, toggles current state; otherwise sets to enabled
 * @returns true if extents are now ON, false if OFF
 */
export function toggleProjectExtents(imodel: IModelConnection, enabled?: boolean): boolean {
  return ProjectExtentsDecoration.toggle(imodel, enabled);
}

/**
 * Tool to toggle project extents decoration
 */
export class ToggleProjectExtentsTool extends Tool {
  public static override toolId = "ToggleProjectExtents";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 0; }

  public override async run(): Promise<boolean> {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp && vp.view.isSpatialView()) {
      const enabled = toggleProjectExtents(vp.iModel);
      console.log(`Project extents ${enabled ? 'enabled' : 'disabled'}`);
    }
    return true;
  }
}
