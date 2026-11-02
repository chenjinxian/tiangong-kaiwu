/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DatumPlanesDecoration锛?026-11-02 Onshape 榛樿鍑犱綍鍥惧厓瀵归綈锛夛細
 * 鍦ㄥ師鐐圭粯鍒?Top(XY) / Front(XZ) / Right(YZ) 涓変釜娴呰摑鍗婇€忔槑鐭╁舰 + Origin 闈跺績锛? * 鏍囩鐢?canvas overlay 淇濇寔灞忓箷鍙銆備笌 `ProjectExtentsDecoration` 鍚? * decorator 妯″紡锛屼絾鐢?apps/web 鐨?datum 鍒囩墖椹卞姩閫愰」鍙鎬с€? *
 * 骞抽潰灏哄鍙栨瀯閫犳椂 view extents 鐨勬瘮渚嬶紙Onshape 鍒濆骞抽潰閾烘弧瑙嗗彛澶у崐锛夛紝
 * 涓嶉殢缂╂斁瀹炴椂鍙樺寲锛涢涓骇浣撶壒寰佸悗鐢?UI 闅愯棌涓夊钩闈€? */
import { ColorDef } from '@itwin/core-common';
import {
  type DecorateContext,
  GraphicType,
  IModelApp,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';

export interface DatumPlaneVisibility {
  origin: boolean;
  top: boolean;
  front: boolean;
  right: boolean;
}

const PLANE_FILL = ColorDef.create(0x8fb8d8).withAlpha(38);
const PLANE_EDGE = ColorDef.create(0x5d8fbe).withAlpha(190);
const LABEL_COLOR = 'rgba(58,110,165,0.95)';
const LABEL_FONT = '600 12px "Segoe UI", "Microsoft YaHei", sans-serif';

function corners(x: number, y: number, z: number): Point3d[] {
  return [
    Point3d.create(x, y, z), Point3d.create(-x, y, z),
    Point3d.create(-x, -y, z), Point3d.create(x, -y, z),
  ];
}

export class DatumPlanesDecoration {
  private readonly _viewport: ScreenViewport;
  private readonly _halfSize: number;
  private _visibility: DatumPlaneVisibility;
  private readonly _removeListener?: () => void;

  public constructor(viewport: ScreenViewport, visibility: DatumPlaneVisibility) {
    this._viewport = viewport;
    this._visibility = { ...visibility };
    const extents = viewport.view.getExtents();
    const extent = Math.max(extents.x, extents.y, extents.z, 1);
    this._halfSize = Math.max(25, extent * 0.42);
    this._removeListener = IModelApp.viewManager.addDecorator(this);
  }

  public setVisibility(visibility: DatumPlaneVisibility): void {
    if (visibility.origin === this._visibility.origin && visibility.top === this._visibility.top
      && visibility.front === this._visibility.front && visibility.right === this._visibility.right)
      return;
    this._visibility = { ...visibility };
    this._viewport.invalidateScene();
  }

  public dispose(): void {
    this._removeListener?.();
  }

  private drawPlane(context: DecorateContext, axis: 'top' | 'front' | 'right', label: string): void {
    const s = this._halfSize;
    const builder = context.createGraphicBuilder(GraphicType.WorldOverlay);
    builder.setSymbology(PLANE_EDGE, PLANE_FILL, 1);
    let pts: Point3d[];
    let labelWorld: Point3d;
    switch (axis) {
      case 'top':
        pts = corners(s, s, 0);
        labelWorld = Point3d.create(-s * 0.86, s * 0.86, 0);
        break;
      case 'front':
        pts = [Point3d.create(-s, 0, -s), Point3d.create(s, 0, -s), Point3d.create(s, 0, s), Point3d.create(-s, 0, s)];
        labelWorld = Point3d.create(-s * 0.86, 0, s * 0.86);
        break;
      default:
        pts = [Point3d.create(0, -s, -s), Point3d.create(0, s, -s), Point3d.create(0, s, s), Point3d.create(0, -s, s)];
        labelWorld = Point3d.create(0, -s * 0.86, s * 0.86);
        break;
    }
    builder.addShape(pts);
    context.addDecorationFromBuilder(builder);
    this.addLabel(context, labelWorld, label);
  }

  private addLabel(context: DecorateContext, world: Point3d, text: string): void {
    const position = context.viewport.worldToView(world);
    context.addCanvasDecoration({
      position,
      drawDecoration: (ctx) => {
        ctx.font = LABEL_FONT;
        ctx.fillStyle = LABEL_COLOR;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 2, 0);
      },
    });
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView()) return;
    if (this._visibility.top) this.drawPlane(context, 'top', 'Top');
    if (this._visibility.front) this.drawPlane(context, 'front', 'Front');
    if (this._visibility.right) this.drawPlane(context, 'right', 'Right');
    if (this._visibility.origin) {
      const pos = vp.worldToView(Point3d.createZero());
      context.addCanvasDecoration({
        position: pos,
        drawDecoration: (ctx) => {
          ctx.beginPath();
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(58,110,165,0.95)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(58,110,165,0.95)';
          ctx.fill();
        },
      });
    }
  }
}

