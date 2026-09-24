/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ACS (Auxiliary Coordinate System) Triad Decoration
 * Displays the ACS triad at the ACS origin
 *--------------------------------------------------------------------------------------------*/

import { ColorDef } from "@itwin/core-common";
import { DecorateContext, GraphicType, IModelApp, IModelConnection, Tool } from "@itwin/core-frontend";
import { Point3d } from "@itwin/core-geometry";

/**
 * ACS Triad Decoration - Displays the auxiliary coordinate system triad
 */
export class ACSDecoration {
  private static _decorator?: ACSDecoration;
  protected _removeDecorationListener?: () => void;
  protected _iModel: IModelConnection;
  protected _size: number = 2; // Size in meters

  public constructor(iModel: IModelConnection, size: number = 2) {
    this._iModel = iModel;
    this._size = size;
    this.updateDecorationListener(true);
  }

  protected stop(): void {
    this.updateDecorationListener(false);
  }

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
    return undefined !== ACSDecoration._decorator;
  }

  public readonly useCachedDecorations = true;

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;

    // Create graphic builder
    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);

    // Draw triad axes at origin
    const origin = Point3d.create(0, 0, 0);
    const xColor = ColorDef.red;
    const yColor = ColorDef.green;
    const zColor = ColorDef.blue;

    // Draw X axis (red)
    builder.setSymbology(xColor, ColorDef.black, 2);
    builder.addLineString([
      origin,
      Point3d.create(this._size, 0, 0)
    ]);

    // Draw Y axis (green)
    builder.setSymbology(yColor, ColorDef.black, 2);
    builder.addLineString([
      origin,
      Point3d.create(0, this._size, 0)
    ]);

    // Draw Z axis (blue)
    builder.setSymbology(zColor, ColorDef.black, 2);
    builder.addLineString([
      origin,
      Point3d.create(0, 0, this._size)
    ]);

    // Add decorations
    context.addDecorationFromBuilder(builder);
  }

  /**
   * Toggle ACS triad display
   * @param iModel The iModel connection
   * @param enabled If undefined, toggles current state
   * @returns true if ACS is now ON, false if OFF
   */
  public static toggle(iModel: IModelConnection, enabled?: boolean, size?: number): boolean {
    if (undefined !== enabled) {
      const alreadyEnabled = undefined !== ACSDecoration._decorator;
      if (enabled === alreadyEnabled)
        return alreadyEnabled;
    }

    if (undefined === ACSDecoration._decorator) {
      ACSDecoration._decorator = new ACSDecoration(iModel, size);
      return true;
    } else {
      ACSDecoration._decorator.stop();
      ACSDecoration._decorator = undefined;
      return false;
    }
  }
}

/**
 * Enable or disable ACS triad decoration
 * @param iModel The iModel connection
 * @param enabled If undefined, toggles current state
 * @returns true if ACS is now ON, false if OFF
 */
export function toggleACS(iModel: IModelConnection, enabled?: boolean): boolean {
  return ACSDecoration.toggle(iModel, enabled);
}

/**
 * Tool to toggle ACS triad
 */
export class ToggleACSTool extends Tool {
  public static override toolId = "ToggleACS";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 0; }

  public override async run(): Promise<boolean> {
    const vp = IModelApp.viewManager.selectedView;
    if (undefined !== vp && vp.view.isSpatialView()) {
      const enabled = toggleACS(vp.iModel);
      console.log(`ACS triad ${enabled ? 'enabled' : 'disabled'}`);
    }
    return true;
  }
}
