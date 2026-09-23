/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Grid Settings Tool
 * Controls grid display in the viewport
 *--------------------------------------------------------------------------------------------*/

import { GridOrientationType } from "@itwin/core-common";
import { IModelApp, Tool } from "@itwin/core-frontend";

/**
 * Grid Settings - Configure and toggle grid display
 */
export interface GridSettings {
  spacingX: number;
  spacingY: number;
  gridsPerRef: number;
  orientation: GridOrientationType;
}

// Default grid settings
// const DEFAULT_SETTINGS: GridSettings = {
//   spacingX: 1,
//   spacingY: 1,
//   gridsPerRef: 10,
//   orientation: GridOrientationType.WorldXY,
// };

/**
 * Enable or disable grid display
 * @param enabled If undefined, toggles current state
 * @returns true if grid is now ON, false if OFF
 */
export function toggleGrid(enabled?: boolean): boolean {
  const vp = IModelApp.viewManager.selectedView;
  if (!vp) return false;

  const currentState = vp.viewFlags.grid;

  if (enabled === undefined) {
    enabled = !currentState;
  }

  if (enabled !== currentState) {
    vp.viewFlags = vp.viewFlags.with("grid", enabled);
    vp.invalidateScene();
  }

  return enabled;
}

/**
 * Set grid spacing
 */
export function setGridSpacing(spacingX: number, spacingY?: number): void {
  const vp = IModelApp.viewManager.selectedView;
  if (!vp) return;

  vp.view.details.gridSpacing = {
    x: spacingX,
    y: spacingY ?? spacingX,
  };
  vp.invalidateScene();
}

/**
 * Set grids per reference line
 */
export function setGridsPerRef(gridsPerRef: number): void {
  const vp = IModelApp.viewManager.selectedView;
  if (!vp) return;

  vp.view.details.gridsPerRef = gridsPerRef;
  vp.invalidateScene();
}

/**
 * Set grid orientation
 */
export function setGridOrientation(orientation: GridOrientationType): void {
  const vp = IModelApp.viewManager.selectedView;
  if (!vp) return;

  vp.view.details.gridOrientation = orientation;
  vp.invalidateScene();
}

/**
 * Get current grid settings
 */
export function getGridSettings(): GridSettings | null {
  const vp = IModelApp.viewManager.selectedView;
  if (!vp) return null;

  return {
    spacingX: vp.view.details.gridSpacing.x,
    spacingY: vp.view.details.gridSpacing.y,
    gridsPerRef: vp.view.details.gridsPerRef,
    orientation: vp.view.details.gridOrientation,
  };
}

/**
 * Tool to toggle grid display
 */
export class ToggleGridTool extends Tool {
  public static override toolId = "ToggleGrid";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 0; }

  public override async run(): Promise<boolean> {
    const enabled = toggleGrid();
    console.log(`Grid ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }
}

/**
 * Tool to change grid settings
 */
export class GridSettingsTool extends Tool {
  public static override toolId = "GridSettings";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 4; }

  public override async run(
    spacing?: number,
    ratio?: number,
    gridsPerRef?: number,
    orientation?: GridOrientationType
  ): Promise<boolean> {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp) return false;

    if (spacing !== undefined) {
      vp.view.details.gridSpacing = { x: spacing, y: spacing };
    }

    if (ratio !== undefined) {
      const currentX = vp.view.details.gridSpacing.x;
      vp.view.details.gridSpacing = { x: currentX, y: currentX * ratio };
    }

    if (gridsPerRef !== undefined) {
      vp.view.details.gridsPerRef = gridsPerRef;
    }

    if (orientation !== undefined) {
      vp.view.details.gridOrientation = orientation;
    }

    vp.invalidateScene();
    return true;
  }
}

// Grid orientation labels
export const GRID_ORIENTATIONS = [
  { value: GridOrientationType.View, label: "视图 (View)" },
  { value: GridOrientationType.WorldXY, label: "世界 XY (World XY)" },
  { value: GridOrientationType.WorldYZ, label: "世界 YZ (World YZ)" },
  { value: GridOrientationType.WorldXZ, label: "世界 XZ (World XZ)" },
  { value: GridOrientationType.AuxCoord, label: "辅助坐标 (ACS)" },
];
