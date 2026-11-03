/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 完整 BRep 拓扑叠加层（2026-11-03）。
 *
 * 背景：native tile 的 `generateAllPolyfaceEdges=false` 只生成折角/轮廓特征边，
 * 光滑边的拓扑边（圆角与相邻面的切线、布尔切缝等）不会出现在 Shaded 图元里。
 * 这里由调用方从后端取**全部拓扑边**的精确曲线（getBodySubEntities(Edge) +
 * getSubEntityGeometry），用 iTwin GraphicBuilder 画成一条 WorldDecoration 图元：
 * - 每条边按自身范围的像素尺度朝相机偏移 ~2px，规避与共面 B 面的 z-fighting；
 *   WorldDecoration 走深度测试，因此被实体挡住的边不会穿透显示（Onshape Shaded
 *   同姿态；Scene 类型在真栈会把共面线完全遮住，故不用）；
 * - 只创建一个图元（非每条边一个），67 条边的 T2 模型实测单帧开销可忽略；
 * - `useCachedDecorations` 缓存渲染图元，拓扑/样式变化时显式失效；
 * - 顶点由同一装饰件以屏幕空间小点绘制（只在 showVertices / 点选择模式开启）。
 *
 * 不修改 iTwin 渲染器或 shader：全部使用公开的 GraphicBuilder/Decorator API。
 */
import {
  ColorDef,
  ElementGeometry,
  type ElementGeometryDataEntry,
} from '@itwin/core-common';
import {
  type DecorateContext,
  GraphicType,
  IModelApp,
  type ScreenViewport,
  type ViewportDecorator,
} from '@itwin/core-frontend';
import {
  type AnyCurvePrimitive,
  type GeometryQuery,
  Point3d,
  Range3d,
  type Range3dProps,
  Transform,
  type Vector3d,
} from '@itwin/core-geometry';

/** 一条 BRep 拓扑边（key 供 diff/诊断用；entry 为世界系 ElementGeometry 条目）。 */
export interface BrepTopologyEdge {
  key: string;
  entry: ElementGeometryDataEntry;
  /** 世界系包络（用于按像素尺度计算朝相机的深度偏移）。 */
  range?: Range3dProps;
}

/** 一个 BRep 拓扑顶点（世界坐标）。 */
export interface BrepTopologyVertex {
  x: number;
  y: number;
  z: number;
}

/** 后端拓扑读面 → 前端显示层的最小数据形态。 */
export interface BrepTopology {
  edges: readonly BrepTopologyEdge[];
  vertices: readonly BrepTopologyVertex[];
}

/** 叠加层显示样式（由显示设置 / 选择模式派生）。 */
export interface BrepTopologyDecorationOptions {
  /** 是否绘制全部拓扑边（shaded-no-edges 等模式由调用方传 false）。 */
  showEdges?: boolean;
  /** 是否绘制全部顶点（默认关闭；点选择模式由调用方打开）。 */
  showVertices?: boolean;
  /** 边色（CSS 颜色；默认 #1f1f1f）。 */
  edgeColor?: string;
  /** 边宽（px；GraphicsBuilder 按整数钳制）。 */
  edgeWidthPx?: number;
  /** 朝相机深度偏移（像素；默认 2）。 */
  edgeOffsetPx?: number;
  /** true = WorldOverlay x-ray（隐藏边也显示，隐藏边可见/半透明模式用）。 */
  xrayEdges?: boolean;
}

const DEFAULT_OPTIONS: Required<BrepTopologyDecorationOptions> = {
  showEdges: true,
  showVertices: false,
  edgeColor: '#1f1f1f',
  edgeWidthPx: 2,
  edgeOffsetPx: 2,
  xrayEdges: false,
};

/** 顶点圆点（屏幕空间；Onshape 顶点选中前的深灰小点）。 */
const VERTEX_FILL = '#33373b';
const VERTEX_STROKE = '#ffffff';
const VERTEX_RADIUS_PX = 2.2;

/**
 * 把拓扑边条目的 ElementGeometry 数据解析成曲线图元并逐条回调。
 * 单条边畸形/解码失败只跳过该边，不影响整层（诚实降级，不抛到装饰链）。
 * 返回成功回调的曲线数（测试/诊断用）。
 */
export function collectBrepEdgeCurves(
  edges: readonly BrepTopologyEdge[],
  onCurve: (curve: AnyCurvePrimitive) => void,
): number {
  let count = 0;
  for (const edge of edges) {
    try {
      const iterator = new ElementGeometry.Iterator({ entryArray: [edge.entry] });
      for (const item of iterator) {
        const geometry = item.toGeometryQuery();
        if (!geometry)
          continue;
        if ('curvePrimitive' === geometry.geometryCategory) {
          onCurve(geometry as AnyCurvePrimitive);
          count++;
        } else if ('curveCollection' === geometry.geometryCategory) {
          for (const child of geometry.children ?? []) {
            if ('curvePrimitive' === child.geometryCategory) {
              onCurve(child as AnyCurvePrimitive);
              count++;
            }
          }
        }
      }
    } catch {
      // 单条边坏数据不阻断整层
    }
  }
  return count;
}

/** 边→相机方向偏移（世界尺度按 edge 中心像素大小换算；无 range 时不偏移）。 */
function offsetForEdge(
  edge: BrepTopologyEdge,
  viewport: ScreenViewport,
  zVector: Vector3d,
  offsetPx: number,
): Transform {
  if (!edge.range)
    return Transform.createIdentity();

  const range = Range3d.fromJSON(edge.range);
  const center = range.center;
  const pixelSize = viewport.getPixelSizeAtPoint(center);
  if (!Number.isFinite(pixelSize) || pixelSize <= 0)
    return Transform.createIdentity();

  // ViewState.getZVector() 指向相机（target→eye）；正偏移把边拉到表面前。
  const offset = zVector.clone();
  offset.scaleToLength(offsetPx * pixelSize, offset);
  return Transform.createTranslation(offset);
}

/** 当前应绘制的样式（纯函数；调用方测试/诊断可单独使用）。 */
export function effectiveBrepOptions(
  base?: BrepTopologyDecorationOptions,
): Required<BrepTopologyDecorationOptions> {
  return { ...DEFAULT_OPTIONS, ...base };
}

/**
 * BRep 拓扑叠加装饰件。构造即注册到 viewManager；dispose 反注册。
 * 使用 cached decorations：拓扑/样式变更必须调用 setTopology/setOptions 触发失效，
 * 不要直接改对象内部字段。
 */
export class BrepTopologyDecoration implements ViewportDecorator {
  public readonly id = 'luban.brep-topology';
  public readonly useCachedDecorations = true as const;

  private readonly _viewport: ScreenViewport;
  private _topology?: BrepTopology;
  private _options: Required<BrepTopologyDecorationOptions>;
  private readonly _removeListener?: () => void;
  private _invalidateQueued = false;
  /** 诊断：最近一次 decorate 成功加入 builder 的曲线数/首条错误（真栈排障/测试用）。 */
  public lastCurveCount = 0;
  public lastError?: string;

  public constructor(viewport: ScreenViewport, options?: BrepTopologyDecorationOptions) {
    this._viewport = viewport;
    this._options = effectiveBrepOptions(options);
    this._removeListener = IModelApp.viewManager.addDecorator(this);
  }

  public setTopology(topology: BrepTopology | undefined): void {
    this._topology = topology;
    this.invalidate();
  }

  public setOptions(options: BrepTopologyDecorationOptions): void {
    const next = effectiveBrepOptions({ ...this._options, ...options });
    if (
      next.showEdges === this._options.showEdges
      && next.showVertices === this._options.showVertices
      && next.edgeColor === this._options.edgeColor
      && next.edgeWidthPx === this._options.edgeWidthPx
      && next.edgeOffsetPx === this._options.edgeOffsetPx
      && next.xrayEdges === this._options.xrayEdges
    ) {
      return;
    }
    this._options = next;
    this.invalidate();
  }

  public dispose(): void {
    this._removeListener?.();
  }

  private invalidate(): void {
    this.invalidateNow();
    // 拓扑读面常在首帧渲染过程中返回：此时 DecorationsCache.prohibitRemoval
    // 为真，立即失效会被吞掉，缓存里只剩「空装饰」。再排一帧（渲染结束后）
    // 重发失效，保证初载无需用户移动相机就能看到叠加层。
    if (this._invalidateQueued || typeof requestAnimationFrame !== 'function')
      return;
    this._invalidateQueued = true;
    requestAnimationFrame(() => {
      this._invalidateQueued = false;
      this.invalidateNow();
    });
  }

  private invalidateNow(): void {
    IModelApp.viewManager.invalidateCachedDecorationsAllViews(this);
    this._viewport.invalidateDecorations();
    this._viewport.invalidateScene();
  }

  public decorate(context: DecorateContext): void {
    const vp = context.viewport;
    if (!vp.view.isSpatialView())
      return;

    const topology = this._topology;
    if (!topology)
      return;

    if (this._options.showEdges && topology.edges.length > 0)
      this.drawEdges(context, topology.edges);

    if (this._options.showVertices && topology.vertices.length > 0)
      this.drawVertices(context, topology.vertices);
  }

  private drawEdges(context: DecorateContext, edges: readonly BrepTopologyEdge[]): void {
    const vp = context.viewport;
    const builder = context.createGraphic({
      type: this._options.xrayEdges ? GraphicType.WorldOverlay : GraphicType.WorldDecoration,
    });
    const color = ColorDef.fromString(this._options.edgeColor);
    builder.setSymbology(color, color, this._options.edgeWidthPx);

    // 只在深度测试模式下做朝相机偏移；x-ray 模式不需要（WorldOverlay 关深度）。
    const zVector = vp.view.getZVector();
    this.lastCurveCount = 0;
    this.lastError = undefined;
    for (const edge of edges) {
      try {
        const offset = this._options.xrayEdges
          ? Transform.createIdentity()
          : offsetForEdge(edge, vp, zVector, this._options.edgeOffsetPx);
        collectBrepEdgeCurves([edge], (curve) => {
          const transformed: GeometryQuery | undefined = curve.cloneTransformed(offset);
          if (transformed && 'curvePrimitive' === transformed.geometryCategory) {
            builder.addCurvePrimitive(transformed as AnyCurvePrimitive);
            this.lastCurveCount++;
          }
        });
      } catch (err) {
        this.lastError ??= err instanceof Error ? err.message : String(err);
      }
    }
    context.addDecorationFromBuilder(builder);
  }

  private drawVertices(context: DecorateContext, vertices: readonly BrepTopologyVertex[]): void {
    const vp = context.viewport;
    context.addCanvasDecoration({
      drawDecoration: (ctx) => {
        ctx.fillStyle = VERTEX_FILL;
        ctx.strokeStyle = VERTEX_STROKE;
        ctx.lineWidth = 1;
        for (const vertex of vertices) {
          const view = vp.worldToView(Point3d.fromJSON(vertex));
          if (!Number.isFinite(view.x) || !Number.isFinite(view.y))
            continue;
          ctx.beginPath();
          ctx.arc(view.x, view.y, VERTEX_RADIUS_PX, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      },
    });
  }
}
