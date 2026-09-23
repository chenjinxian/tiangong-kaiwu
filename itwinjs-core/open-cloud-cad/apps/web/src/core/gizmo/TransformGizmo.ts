/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * TransformGizmo — Decorator that draws X/Y/Z axis arrows for transform operations.
 *
 * Draws colored axis lines at the gizmo center. Supports pickable decorations
 * for hover/selection feedback.
 */

import {
  DecorateContext,
  GraphicType,
  IModelApp,
  type Decorator,
  ScreenViewport,
} from '@itwin/core-frontend';
import { ColorDef, LinePixels } from '@itwin/core-common';
import { Point3d, Vector3d } from '@itwin/core-geometry';

export type GizmoAxis = 'x' | 'y' | 'z';
export type GizmoMode = 'move' | 'rotate' | 'scale';

interface TransformGizmoOptions {
  /** World-space position of the gizmo origin */
  center: Point3d;
  /** Active hover/selected axis */
  activeAxis: GizmoAxis | null;
  /** Transform mode */
  mode: GizmoMode;
  /** Axis length in meters */
  axisLength?: number;
}

const AXIS_COLORS: Record<GizmoAxis, ColorDef> = {
  x: ColorDef.from(255, 60, 60),
  y: ColorDef.from(60, 255, 60),
  z: ColorDef.from(60, 120, 255),
};

const AXIS_IDS: Record<GizmoAxis, string> = {
  x: 'gizmo-x',
  y: 'gizmo-y',
  z: 'gizmo-z',
};

const AXIS_DIRS: Record<GizmoAxis, Vector3d> = {
  x: Vector3d.unitX(),
  y: Vector3d.unitY(),
  z: Vector3d.unitZ(),
};

export class TransformGizmo implements Decorator {
  private _options: TransformGizmoOptions;

  constructor(options: TransformGizmoOptions) {
    this._options = options;
  }

  public update(options: TransformGizmoOptions): void {
    this._options = options;
    IModelApp.viewManager.invalidateCachedDecorationsAllViews(this);
  }

  public dispose(): void {
    IModelApp.viewManager.dropDecorator(this);
  }

  public decorate(context: DecorateContext): void {
    const viewport = context.viewport;
    if (!(viewport instanceof ScreenViewport)) return;

    const { center, activeAxis, axisLength = 1.0 } = this._options;

    // Draw each axis line
    (['x', 'y', 'z'] as GizmoAxis[]).forEach((axis) => {
      const isActive = activeAxis === axis;
      const color = AXIS_COLORS[axis];
      const dir = AXIS_DIRS[axis];
      const end = center.plus(dir.scale(axisLength));

      const builder = context.createGraphicBuilder(
        GraphicType.WorldOverlay,
        undefined,
        AXIS_IDS[axis]
      );

      // Line width: thicker when active
      const width = isActive ? 4 : 2;
      builder.setSymbology(color, color, width, LinePixels.Solid);
      builder.addLineString([center, end]);

      // Draw arrow head (small cone/pyramid approximation with line segments)
      const headSize = axisLength * 0.12;
      const headBase = end.plus(dir.scale(-headSize));
      const perp1 = dir.crossProduct(Vector3d.unitZ()).normalize();
      const perp2 = dir.crossProduct(perp1 ?? Vector3d.unitX()).normalize();
      const p1 = perp1 ? headBase.plus(perp1.scale(headSize * 0.4)) : headBase;
      const p2 = perp2 ? headBase.plus(perp2.scale(headSize * 0.4)) : headBase;
      const p3 = perp1 ? headBase.plus(perp1.scale(-headSize * 0.4)) : headBase;
      const p4 = perp2 ? headBase.plus(perp2.scale(-headSize * 0.4)) : headBase;

      builder.addLineString([end, p1]);
      builder.addLineString([end, p2]);
      builder.addLineString([end, p3]);
      builder.addLineString([end, p4]);

      context.addDecorationFromBuilder(builder);
    });

    // Draw center point
    const centerBuilder = context.createGraphicBuilder(
      GraphicType.WorldOverlay,
      undefined,
      'gizmo-center'
    );
    centerBuilder.setSymbology(ColorDef.white, ColorDef.white, 6);
    centerBuilder.addPointString([center]);
    context.addDecorationFromBuilder(centerBuilder);
  }

  public testDecorationHit(id: string): boolean {
    return Object.values(AXIS_IDS).includes(id) || id === 'gizmo-center';
  }

  /** Project gizmo center and axis endpoints to view (screen) coordinates. */
  public projectToView(viewport: ScreenViewport): {
    center: Point3d;
    axes: Record<GizmoAxis, { start: Point3d; end: Point3d }>;
  } {
    const { center, axisLength = 1.0 } = this._options;
    const projCenter = Point3d.create();
    viewport.worldToView(center, projCenter);

    const axes = {} as Record<GizmoAxis, { start: Point3d; end: Point3d }>;
    (['x', 'y', 'z'] as GizmoAxis[]).forEach((axis) => {
      const end = center.plus(AXIS_DIRS[axis].scale(axisLength));
      const projEnd = Point3d.create();
      viewport.worldToView(end, projEnd);
      axes[axis] = { start: projCenter.clone(), end: projEnd };
    });

    return { center: projCenter, axes };
  }

  /** Find the closest axis to the given screen point (in pixels). */
  public pickAxis(viewport: ScreenViewport, screenPoint: Point3d, threshold = 12): GizmoAxis | null {
    const { axes } = this.projectToView(viewport);
    let bestAxis: GizmoAxis | null = null;
    let bestDist = threshold;

    (['x', 'y', 'z'] as GizmoAxis[]).forEach((axis) => {
      const dist = pointToSegmentDistance(screenPoint, axes[axis].start, axes[axis].end);
      if (dist < bestDist) {
        bestDist = dist;
        bestAxis = axis;
      }
    });

    return bestAxis;
  }
}

/** Distance from point p to line segment ab (all in same coordinate space). */
function pointToSegmentDistance(p: Point3d, a: Point3d, b: Point3d): number {
  const ab = Vector3d.createStartEnd(a, b);
  const ap = Vector3d.createStartEnd(a, p);
  const abLenSq = ab.magnitudeSquared();
  if (abLenSq === 0) return ap.magnitude();

  let t = ap.dotProduct(ab) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  const closest = a.plusScaled(ab, t);
  return p.distance(closest);
}
