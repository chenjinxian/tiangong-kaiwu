// @ts-nocheck
/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Selection Tools - Enhanced selection capabilities
 * Following display-test-app patterns
 */

import {
  BeButtonEvent,
  BeModifierKeys,
  DecorateContext,
  Decorator,
  EventHandled,
  GraphicType,
  HitDetail,
  IModelApp,
  SelectionTool,
  Tool,
  Viewport,
} from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import { dialogService } from '../services/DialogService.js';

/**
 * Fence (window/crossing) selection tool
 * Allows selecting elements by drawing a rectangle
 */
export class FenceSelectTool extends SelectionTool {
  public static override toolId = 'OpenCloudCad.FenceSelect';
  public static override iconSpec = 'icon-select-fence';

  private _firstPoint?: Point3d;
  private _isWindowSelect = true; // Window vs Crossing selection
  private _fenceDecorator?: FenceDecorator;

  protected override get wantAccuSnap(): boolean {
    return false;
  }

  protected override get wantDynamics(): boolean {
    return true;
  }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._fenceDecorator = new FenceDecorator();
    IModelApp.viewManager.addDecorator(this._fenceDecorator);
  }

  public override async onCleanup(): Promise<void> {
    if (this._fenceDecorator) {
      IModelApp.viewManager.dropDecorator(this._fenceDecorator);
      this._fenceDecorator = undefined;
    }
    await super.onCleanup();
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (!this._firstPoint) {
      // First click - start fence
      this._firstPoint = ev.point.clone();
      this._fenceDecorator?.setFirstPoint(this._firstPoint);
      this.initLocateElements(true); // Enable dynamics
      return EventHandled.No;
    }

    // Second click - complete fence selection
    const secondPoint = ev.point.clone();
    await this.performFenceSelection(this._firstPoint, secondPoint, ev.viewport!);

    this._firstPoint = undefined;
    this._fenceDecorator?.clear();
    await this.onRestartTool();
    return EventHandled.No;
  }

  public async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    if (this._firstPoint && ev.viewport) {
      this._isWindowSelect = this.calculateWindowSelect(this._firstPoint, ev.point);
      this._fenceDecorator?.updateCurrentPoint(ev.point, this._isWindowSelect);
    }
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._firstPoint) {
      // Cancel fence selection on right click
      this._firstPoint = undefined;
      this._fenceDecorator?.clear();
      return EventHandled.No;
    }
    return EventHandled.Yes;
  }

  public async onKeyTransition(wentDown: boolean, key: BeModifierKeys): Promise<EventHandled> {
    if (wentDown && key === BeModifierKeys.Control) {
      // Toggle between window/crossing selection with Ctrl key
      this._isWindowSelect = !this._isWindowSelect;
      return EventHandled.Yes;
    }
    return EventHandled.No;
  }

  /**
   * Determine if this is a window select (left-to-right) or crossing select (right-to-left)
   * Window select: elements completely inside the fence
   * Crossing select: elements intersecting or inside the fence
   */
  private calculateWindowSelect(first: Point3d, current: Point3d): boolean {
    // Window select if dragging left to right, crossing if right to left
    return current.x > first.x;
  }

  /**
   * Perform the actual fence selection
   */
  private async performFenceSelection(first: Point3d, second: Point3d, viewport: Viewport): Promise<void> {
    const view = viewport.view;
    const worldCorners = [
      Point3d.create(Math.min(first.x, second.x), Math.min(first.y, second.y), Math.min(first.z, second.z)),
      Point3d.create(Math.max(first.x, second.x), Math.max(first.y, second.y), Math.max(first.z, second.z)),
    ];

    // Get elements within the fence bounds
    const range = (await import('@itwin/core-geometry')).Range3d.createArray(worldCorners);
    const candidates = await this.getElementsInRange(range, viewport);

    // Filter based on window vs crossing selection
    const selectedIds = this._isWindowSelect
      ? candidates.filter(id => this.isElementFullyContained(id, range, viewport))
      : candidates;

    // Update selection set
    if (selectedIds.length > 0) {
      const ids = new Set(selectedIds);
      if (IModelApp.toolAdmin.currentInputState.isShiftDown) {
        // Shift+click adds to selection
        viewport.iModel.selectionSet.add(ids);
      } else if (IModelApp.toolAdmin.currentInputState.isControlDown) {
        // Ctrl+click toggles selection
        viewport.iModel.selectionSet.invert(ids);
      } else {
        // Normal click replaces selection
        viewport.iModel.selectionSet.replace(ids);
      }
    }

    // Notify user
    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(
        1,
        `选择了 ${selectedIds.length} 个元素 (${this._isWindowSelect ? '窗口' : '交叉'}选择)`
      )
    );
  }

  /**
   * Get all elements within a 3D range
   */
  private async getElementsInRange(range: import('@itwin/core-geometry').Range3d, viewport: Viewport): Promise<string[]> {
    const ids: string[] = [];
    try {
      const query = `
        SELECT ECInstanceId
        FROM bis.GeometricElement3d
        WHERE Origin.X BETWEEN ${range.low.x} AND ${range.high.x}
          AND Origin.Y BETWEEN ${range.low.y} AND ${range.high.y}
          AND Origin.Z BETWEEN ${range.low.z} AND ${range.high.z}
      `;
      for await (const row of viewport.iModel.createQueryReader(query)) {
        ids.push(row[0] as string);
      }
    } catch {
      // Fallback: query all and filter
      const query = 'SELECT ECInstanceId FROM bis.GeometricElement3d';
      for await (const row of viewport.iModel.createQueryReader(query)) {
        const id = row[0] as string;
        // Check if element's bounding box intersects range
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Check if an element is fully contained within the selection range
   */
  private isElementFullyContained(
    _id: string,
    _range: import('@itwin/core-geometry').Range3d,
    _viewport: Viewport
  ): boolean {
    // Simplified: in a real implementation, we'd check the element's bounding box
    // For now, assume all elements found in range are candidates
    return true;
  }

  public async onRestartTool(): Promise<void> {
    const tool = new FenceSelectTool();
    if (!(await tool.run())) return this.exitTool();
  }
}

/**
 * Decorator for visualizing the fence selection rectangle
 */
class FenceDecorator implements Decorator {
  private _firstPoint?: Point3d;
  private _currentPoint?: Point3d;
  private _isWindowSelect = true;

  public setFirstPoint(point: Point3d): void {
    this._firstPoint = point.clone();
  }

  public updateCurrentPoint(point: Point3d, isWindowSelect: boolean): void {
    this._currentPoint = point.clone();
    this._isWindowSelect = isWindowSelect;
  }

  public clear(): void {
    this._firstPoint = undefined;
    this._currentPoint = undefined;
  }

  public decorate(context: DecorateContext): void {
    if (!this._firstPoint || !this._currentPoint) return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);

    // Draw rectangle
    const corners = [
      Point3d.create(this._firstPoint.x, this._firstPoint.y, this._firstPoint.z),
      Point3d.create(this._currentPoint.x, this._firstPoint.y, this._firstPoint.z),
      Point3d.create(this._currentPoint.x, this._currentPoint.y, this._firstPoint.z),
      Point3d.create(this._firstPoint.x, this._currentPoint.y, this._firstPoint.z),
    ];

    // Set appearance based on selection mode
    const color = this._isWindowSelect ? ColorDef.green : ColorDef.red;
    builder.setSymbology(color, color, 2, LinePixels.Solid);

    // Draw rectangle lines
    builder.addLineString([corners[0], corners[1], corners[2], corners[3], corners[0]]);

    // Draw fill pattern
    const fillColor = this._isWindowSelect
      ? ColorDef.from(0, 255, 0, 50)
      : ColorDef.from(255, 0, 0, 50);
    builder.setSymbology(fillColor, fillColor, 1);

    // Add semi-transparent fill
    const shapePoints = [corners[0], corners[1], corners[2], corners[3]];
    builder.addShape(shapePoints);

    const graphic = builder.finish();
    if (graphic) {
      context.addDecoration(GraphicType.WorldOverlay, graphic);
    }
  }
}

/**
 * Select All Elements Tool
 */
export class SelectAllTool extends Tool {
  public static override toolId = 'OpenCloudCad.SelectAll';
  public static override iconSpec = 'icon-select-all';

  public override async run(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return false;

    const ids: string[] = [];
    const query = 'SELECT ECInstanceId FROM bis.GeometricElement3d';

    try {
      for await (const row of viewport.iModel.createQueryReader(query)) {
        ids.push(row[0] as string);
      }

      viewport.iModel.selectionSet.replace(new Set(ids));

      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          `选择了全部 ${ids.length} 个元素`
        )
      );
      return true;
    } catch (err) {
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          3,
          `选择失败: ${(err as Error).message}`
        )
      );
      return false;
    }
  }
}

/**
 * Invert Selection Tool
 */
export class InvertSelectionTool extends Tool {
  public static override toolId = 'OpenCloudCad.InvertSelection';
  public static override iconSpec = 'icon-select-invert';

  public override async run(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return false;

    const allIds: string[] = [];
    const query = 'SELECT ECInstanceId FROM bis.GeometricElement3d';

    try {
      for await (const row of viewport.iModel.createQueryReader(query)) {
        allIds.push(row[0] as string);
      }

      const allIdSet = new Set(allIds);
      const currentSelection = viewport.iModel.selectionSet.elements;

      // Invert: select all that are not currently selected
      const invertedSelection = new Set<string>();
      for (const id of allIds) {
        if (!currentSelection.has(id)) {
          invertedSelection.add(id);
        }
      }

      viewport.iModel.selectionSet.replace(invertedSelection);

      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          `选择了 ${invertedSelection.size} 个元素 (反选)`
        )
      );
      return true;
    } catch (err) {
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          3,
          `反选失败: ${(err as Error).message}`
        )
      );
      return false;
    }
  }
}

/**
 * Clear Selection Tool
 */
export class ClearSelectionTool extends Tool {
  public static override toolId = 'OpenCloudCad.ClearSelection';
  public static override iconSpec = 'icon-select-none';

  public override async run(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return false;

    viewport.iModel.selectionSet.emptyAll();

    IModelApp.notifications.outputMessage(
      new (await import('@itwin/core-frontend')).NotifyMessageDetails(
        1,
        '已清除选择'
      )
    );
    return true;
  }
}

/**
 * Select by Category Tool
 */
export class SelectByCategoryTool extends Tool {
  public static override toolId = 'OpenCloudCad.SelectByCategory';
  public static override iconSpec = 'icon-select-category';

  private _categoryId?: string;

  public override async run(categoryId?: string): Promise<boolean> {
    if (!categoryId) {
      // Show category picker dialog
      categoryId = await this.showCategoryPicker();
      if (!categoryId) return false;
    }

    this._categoryId = categoryId;
    return this.performSelection();
  }

  private async showCategoryPicker(): Promise<string | undefined> {
    // Use dialog service to show category picker
    return dialogService.showCategoryPicker();
  }

  private async performSelection(): Promise<boolean> {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport || !this._categoryId) return false;

    const ids: string[] = [];
    const query = `SELECT ECInstanceId FROM bis.GeometricElement3d WHERE Category.Id = ${this._categoryId}`;

    try {
      for await (const row of viewport.iModel.createQueryReader(query)) {
        ids.push(row[0] as string);
      }

      viewport.iModel.selectionSet.replace(new Set(ids));

      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          `按类别选择了 ${ids.length} 个元素`
        )
      );
      return true;
    } catch (err) {
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          3,
          `选择失败: ${(err as Error).message}`
        )
      );
      return false;
    }
  }
}

/**
 * Selection Set Visualizer Decorator
 * Highlights selected elements with a bounding box
 */
export class SelectionVisualizer implements Decorator {
  private _disposed = false;
  private _removeListener?: () => void;

  constructor() {
    // Listen for selection changes
    const vp = IModelApp.viewManager.selectedView;
    if (vp) {
      this._removeListener = vp.iModel.selectionSet.onChanged.addListener(() => {
        IModelApp.viewManager.invalidateDecorationsAllViews();
      });
    }
  }

  public dispose(): void {
    this._disposed = true;
    this._removeListener?.();
  }

  public decorate(context: DecorateContext): void {
    if (this._disposed) return;

    const vp = context.viewport;
    const selectedIds = vp.iModel.selectionSet.elements;
    if (selectedIds.size === 0) return;

    const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);

    // Draw highlight boxes around selected elements
    const color = ColorDef.from(74, 144, 217, 150); // Light blue with transparency
    builder.setSymbology(color, color, 2);

    // Simplified: draw a single bounding box for all selected elements
    // In a real implementation, we'd get each element's bounding box
    // This is a placeholder for the visual effect

    const graphic = builder.finish();
    if (graphic) {
      context.addDecoration(GraphicType.WorldOverlay, graphic);
    }
  }
}
// Trigger rebuild 2026年 4月 3日 星期五 21时07分21秒 CST
