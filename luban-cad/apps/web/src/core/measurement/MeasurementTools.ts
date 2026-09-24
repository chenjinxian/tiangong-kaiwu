/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Measurement Tools - Distance, Angle, Area measurement
 * Following display-test-app patterns
 */

import {
  BeButtonEvent,
  DecorateContext,
  Decorator,
  EventHandled,
  GraphicType,
  IModelApp,
  Tool,
} from '@itwin/core-frontend';
import { Point3d, Vector3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';

/** Base class for measurement tools */
abstract class MeasurementTool extends Tool {
  protected _points: Point3d[] = [];
  protected _decorator?: MeasurementDecorator;

  protected async startMeasurement(): Promise<void> {
    this._decorator = new MeasurementDecorator();
    IModelApp.viewManager.addDecorator(this._decorator);
  }

  protected async endMeasurement(): Promise<void> {
    if (this._decorator) {
      IModelApp.viewManager.dropDecorator(this._decorator);
      this._decorator = undefined;
    }
    this._points = [];
  }

  protected addPoint(point: Point3d): void {
    this._points.push(point.clone());
    this._decorator?.setPoints(this._points);
  }

  // Override to exit tool properly
  protected async exitTool(): Promise<void> {
    // Tool.exitTool() doesn't exist in current API
    // Just clean up decorator and stop
    await this.endMeasurement();
  }
}

/** Distance measurement tool */
export class MeasureDistanceTool extends MeasurementTool {
  public static override toolId = 'LubanCad.MeasureDistance';
  public static override iconSpec = 'icon-measure-distance';

  public override async run(): Promise<boolean> {
    const result = await super.run();
    if (result) {
      await this.startMeasurement();
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          '点击两点测量距离'
        )
      );
    }
    return result;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.addPoint(ev.point);

    if (this._points.length === 2) {
      const distance = this._points[0].distance(this._points[1]);
      const dx = Math.abs(this._points[1].x - this._points[0].x);
      const dy = Math.abs(this._points[1].y - this._points[0].y);
      const dz = Math.abs(this._points[1].z - this._points[0].z);

      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          `距离: ${distance.toFixed(4)} m\nDX: ${dx.toFixed(4)}, DY: ${dy.toFixed(4)}, DZ: ${dz.toFixed(4)}`
        )
      );

      await this.endMeasurement();
      await this.onRestartTool();
    }

    return EventHandled.No;
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.endMeasurement();
    return EventHandled.No;
  }

  public async onRestartTool(): Promise<void> {
    const tool = new MeasureDistanceTool();
    await tool.run();
  }
}

/** Angle measurement tool */
export class MeasureAngleTool extends MeasurementTool {
  public static override toolId = 'LubanCad.MeasureAngle';
  public static override iconSpec = 'icon-measure-angle';

  public override async run(): Promise<boolean> {
    const result = await super.run();
    if (result) {
      await this.startMeasurement();
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          '点击三点测量角度 (顶点为第二点)'
        )
      );
    }
    return result;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.addPoint(ev.point);

    if (this._points.length === 3) {
      const v1 = Vector3d.createStartEnd(this._points[1], this._points[0]);
      const v2 = Vector3d.createStartEnd(this._points[1], this._points[2]);

      const angle = v1.angleTo(v2);
      const degrees = angle.degrees;

      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          `角度: ${degrees.toFixed(2)}°`
        )
      );

      await this.endMeasurement();
      await this.onRestartTool();
    }

    return EventHandled.No;
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.endMeasurement();
    return EventHandled.No;
  }

  public async onRestartTool(): Promise<void> {
    const tool = new MeasureAngleTool();
    await tool.run();
  }
}

/** Area measurement tool */
export class MeasureAreaTool extends MeasurementTool {
  public static override toolId = 'LubanCad.MeasureArea';
  public static override iconSpec = 'icon-measure-area';

  public override async run(): Promise<boolean> {
    const result = await super.run();
    if (result) {
      await this.startMeasurement();
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          '点击多点测量面积 (双击完成)'
        )
      );
    }
    return result;
  }

  public async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    this.addPoint(ev.point);
    return EventHandled.No;
  }

  public async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._points.length >= 3) {
      const area = this.calculateArea();
      IModelApp.notifications.outputMessage(
        new (await import('@itwin/core-frontend')).NotifyMessageDetails(
          1,
          `面积: ${area.toFixed(4)} m²`
        )
      );
    }
    await this.endMeasurement();
    await this.onRestartTool();
    return EventHandled.No;
  }

  private calculateArea(): number {
    if (this._points.length < 3) return 0;

    // Project points to best-fit plane and calculate 2D area
    const centroid = Point3d.createZero();
    for (const p of this._points) {
      centroid.x += p.x;
      centroid.y += p.y;
      centroid.z += p.z;
    }
    centroid.scaleInPlace(1 / this._points.length);

    // Simple polygon area calculation (Shoelace formula in XY plane)
    let area = 0;
    const n = this._points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += this._points[i].x * this._points[j].y;
      area -= this._points[j].x * this._points[i].y;
    }

    return Math.abs(area) / 2;
  }

  public async onRestartTool(): Promise<void> {
    const tool = new MeasureAreaTool();
    await tool.run();
  }
}

/** Measurement visualizer decorator */
class MeasurementDecorator implements Decorator {
  private _points: Point3d[] = [];

  public setPoints(points: Point3d[]): void {
    this._points = points.map(p => p.clone());
  }

  public decorate(context: DecorateContext): void {
    if (this._points.length === 0) return;

    const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);

    // Draw measurement line/area
    if (this._points.length >= 2) {
      builder.setSymbology(ColorDef.blue, ColorDef.blue, 2, LinePixels.Solid);
      builder.addLineString(this._points);
    }

    // Draw points
    builder.setSymbology(ColorDef.red, ColorDef.red, 4);
    for (const point of this._points) {
      const size = 0.1;
      builder.addLineString([
        Point3d.create(point.x - size, point.y, point.z),
        Point3d.create(point.x + size, point.y, point.z),
      ]);
      builder.addLineString([
        Point3d.create(point.x, point.y - size, point.z),
        Point3d.create(point.x, point.y + size, point.z),
      ]);
    }

    // Use the correct API to add graphic
    const graphic = builder.finish();
    if (graphic) {
      context.addDecoration(GraphicType.WorldDecoration, graphic);
    }
  }
}

/** Measurement manager for storing and managing measurements */
export class MeasurementManager {
  private static _instance: MeasurementManager;
  private _measurements: Array<{
    id: string;
    type: 'distance' | 'angle' | 'area';
    value: number;
    points: Point3d[];
    timestamp: number;
  }> = [];

  public static get instance(): MeasurementManager {
    if (!this._instance) {
      this._instance = new MeasurementManager();
    }
    return this._instance;
  }

  public addMeasurement(
    type: 'distance' | 'angle' | 'area',
    value: number,
    points: Point3d[]
  ): string {
    const id = `meas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this._measurements.push({
      id,
      type,
      value,
      points: points.map(p => p.clone()),
      timestamp: Date.now(),
    });
    return id;
  }

  public getMeasurements(): ReadonlyArray<{
    id: string;
    type: 'distance' | 'angle' | 'area';
    value: number;
    points: Point3d[];
    timestamp: number;
  }> {
    return this._measurements.slice();
  }

  public clear(): void {
    this._measurements = [];
  }

  public deleteMeasurement(id: string): boolean {
    const index = this._measurements.findIndex(m => m.id === id);
    if (index >= 0) {
      this._measurements.splice(index, 1);
      return true;
    }
    return false;
  }
}

export const measurementManager = MeasurementManager.instance;
