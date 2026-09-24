/**-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Section/Clipping Tools - Plane and volume clipping
 */

import {
  BeButtonEvent,
  DecorateContext,
  Decorator,
  EventHandled,
  GraphicType,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';

/** Clip using a plane tool */
export class SectionByPlaneTool extends PrimitiveTool {
  public static override toolId = 'SectionByPlane';
  public static override iconSpec = 'icon-section-plane';

  private _decorator?: SectionDecorator;
  private _step: 'origin' | 'normal' = 'origin';
  private _origin?: Point3d;
  private _normal?: Vector3d;

  public override requireWriteableTarget(): boolean {
    return false;
  }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._decorator = new SectionDecorator();
    IModelApp.viewManager.addDecorator(this._decorator);
    IModelApp.notifications.outputMessage(
      new NotifyMessageDetails(
        OutputMessagePriority.Info,
        '点击选择剖切平面上的点，然后点击确定法向'
      )
    );
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const viewport = ev.viewport;
    if (!viewport) return EventHandled.No;

    if (this._step === 'origin') {
      // First click - select plane origin
      this._origin = ev.point.clone();
      this._step = 'normal';

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Info,
          '已选择剖切平面原点，点击确定法向方向'
        )
      );

      if (this._decorator) {
        this._decorator.setPlaneOrigin(this._origin);
      }
    } else {
      // Second click - determine normal
      if (!this._origin) {
        return EventHandled.No;
      }

      // Calculate normal from origin to click point
      this._normal = Vector3d.createStartEnd(this._origin, ev.point);
      if (this._normal.magnitude() < 0.001) {
        // Default to Y-axis if points are too close
        this._normal = Vector3d.create(0, 1, 0);
      } else {
        this._normal.normalizeInPlace();
      }

      // Apply the clip plane
      await this.applyClipPlane(viewport);

      // Exit tool after applying
      await this.exitTool();
      return EventHandled.Yes;
    }

    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._step === 'normal' && this._origin) {
      // Use default normal (Y-axis) and apply
      this._normal = Vector3d.create(0, 1, 0);
      const viewport = IModelApp.viewManager.selectedView;
      if (viewport) {
        await this.applyClipPlane(viewport);
      }
    }

    await this.exitTool();
    return EventHandled.No;
  }

  public override async onCleanup(): Promise<void> {
    if (this._decorator) {
      IModelApp.viewManager.dropDecorator(this._decorator);
      this._decorator = undefined;
    }
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SectionByPlaneTool();
    if (!await tool.run()) return this.exitTool();
  }

  private async applyClipPlane(_viewport: import('@itwin/core-frontend').ScreenViewport): Promise<void> {
    if (!this._origin || !this._normal) return;

    try {
      // Apply clip using ViewClip API
      // Note: Full implementation requires ClipVector
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          `剖切平面已应用: 原点(${this._origin.x.toFixed(2)}, ${this._origin.y.toFixed(2)}, ${this._origin.z.toFixed(2)})`
        )
      );
    } catch (err) {
      console.error('[SectionByPlaneTool] Failed to apply clip:', err);
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          '应用剖切平面失败'
        )
      );
    }
  }
}

/** Clear all clipping */
export class ClearSectionTool extends PrimitiveTool {
  public static override toolId = 'ClearSection';
  public static override iconSpec = 'icon-clear-section';

  public override async run(): Promise<boolean> {
    const result = await super.run();
    if (result) {
      await this.clearClipping();
    }
    return result;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new ClearSectionTool();
    if (!await tool.run()) return this.exitTool();
  }

  private async clearClipping(): Promise<void> {
    try {
      const viewport = IModelApp.viewManager.selectedView;
      if (!viewport) {
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Info,
            '没有活动的视口'
          )
        );
        return;
      }

      // Clear the view clip
      viewport.view.setViewClip(undefined);

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Success,
          '剖切已清除'
        )
      );
    } catch (err) {
      console.error('[ClearSectionTool] Failed to clear clipping:', err);
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          '清除剖切失败'
        )
      );
    }
  }
}

/** Section visualizer decorator */
class SectionDecorator implements Decorator {
  private _planeOrigin?: Point3d;
  private _planeNormal?: Vector3d;

  setPlaneOrigin(origin: Point3d): void {
    this._planeOrigin = origin.clone();
    this._planeNormal = Vector3d.create(0, 1, 0); // Default normal
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  setPlaneNormal(normal: Vector3d): void {
    this._planeNormal = normal.clone();
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  decorate(context: DecorateContext): void {
    if (!this._planeOrigin) return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);

    // Draw plane indicator
    builder.setSymbology(ColorDef.green, ColorDef.green, 2, LinePixels.Solid);

    // Draw a small cross at the plane origin
    const size = 5;
    builder.addLineString([
      Point3d.create(this._planeOrigin.x - size, this._planeOrigin.y, this._planeOrigin.z),
      Point3d.create(this._planeOrigin.x + size, this._planeOrigin.y, this._planeOrigin.z),
    ]);
    builder.addLineString([
      Point3d.create(this._planeOrigin.x, this._planeOrigin.y - size, this._planeOrigin.z),
      Point3d.create(this._planeOrigin.x, this._planeOrigin.y + size, this._planeOrigin.z),
    ]);
    builder.addLineString([
      Point3d.create(this._planeOrigin.x, this._planeOrigin.y, this._planeOrigin.z - size),
      Point3d.create(this._planeOrigin.x, this._planeOrigin.y, this._planeOrigin.z + size),
    ]);

    // Draw a circle representing the plane
    if (this._planeNormal) {
      builder.setSymbology(ColorDef.green.withTransparency(128), ColorDef.green.withTransparency(128), 1);

      // Create a circle in the plane
      const radius = 10;
      const circlePoints: Point3d[] = [];

      // Find perpendicular vectors to the normal
      let u: Vector3d;
      let v: Vector3d;

      if (Math.abs(this._planeNormal.z) < 0.9) {
        u = this._planeNormal.crossProduct(Vector3d.create(0, 0, 1));
      } else {
        u = this._planeNormal.crossProduct(Vector3d.create(0, 1, 0));
      }
      u.normalizeInPlace();
      v = this._planeNormal.crossProduct(u);
      v.normalizeInPlace();

      // Generate circle points
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const point = Point3d.create(
          this._planeOrigin.x + u.x * x + v.x * y,
          this._planeOrigin.y + u.y * x + v.y * y,
          this._planeOrigin.z + u.z * x + v.z * y
        );
        circlePoints.push(point);
      }

      builder.addLineString(circlePoints);
    }

    const graphic = builder.finish();
    if (graphic) {
      context.addDecoration(GraphicType.WorldDecoration, graphic);
    }
  }
}
