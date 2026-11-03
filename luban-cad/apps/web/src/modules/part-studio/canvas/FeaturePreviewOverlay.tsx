/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 特征实时预览（2026-11-02 Onshape live 对齐）：
 * - 灰体：GraphicType.WorldDecoration（wantNormals、深度测试开启）——3D 场景内
 *   半透明灰体，与既有实体互相遮挡；
 * - 橙色选中面/边：屏幕空间 canvas（x-ray，even-odd 填充天然消孔）——Onshape
 *   选择高亮透过灰体/实体仍可见（feature-extrude-2 实拍）。
 * 纯显示层，不写库、不调内核。唯一不可见 DOM 为预览 canvas 本身（pointer-events:none）。
 */
import * as React from 'react';
import { ColorDef, FeatureAppearance, FeatureAppearanceProvider, type DynamicGraphicsRequest3dProps } from '@itwin/core-common';
import {
  type BriefcaseConnection,
  type DecorateContext,
  type FeatureOverrideProvider,
  GraphicBranch,
  GraphicType,
  IModelApp,
  type RenderGraphic,
  type RenderGraphicOwner,
  type ScreenViewport,
  readElementGraphics,
} from '@itwin/core-frontend';
import { Transform, type Point3d } from '@itwin/core-geometry';
import type { FeaturePreviewGeometryDto } from '@luban-cad/shared';
import type { FeaturePreviewGeometry } from '../internal/feature-preview.js';
import './FeaturePreviewOverlay.css';

export interface FeaturePreviewOverlayProps {
  viewport: ScreenViewport | null | undefined;
  /** fillet v1.21：后端影子求值几何 → TileRpc 动态图形（需 briefcase 连接）。 */
  connection?: BriefcaseConnection | null;
  geometry: FeaturePreviewGeometry | null | undefined;
  dynamicPreview?: FeaturePreviewGeometryDto | null;
  /** 0..1（对话框透明度滑杆：0→0.42 灰体，100→0.06 近隐形）。 */
  opacity?: number;
  /**
   * fillet 结果预览替换源体（Onshape feature-fillet-1 实拍）：结束拾取后
   * 隐藏源体、动态几何按正常材质阴影显示——避免「灰透明副本叠在源体上」的
   * 深度共面噪点（2026-11-02 演示反馈）。拾取中保持 ghost，源体仍可继续拾边。
   */
  hideSource?: boolean;
  /** 动态结果按正常材质实心渲染（fillet 结果）；false=半透明灰 ghost。 */
  solid?: boolean;
}

const PREVIEW_FILL = ColorDef.from(0xe4, 0xe6, 0xe8);
const PREVIEW_EDGE = ColorDef.from(0x6c, 0x70, 0x75);
/** Onshape 选中橙（实拍核心 ≈ #EBA93D）。 */
const ORANGE_FILL = 'rgba(245, 166, 35, 0.30)';
const ORANGE_EDGE = 'rgba(245, 166, 35, 0.95)';
const DPR_CAP = 2;

function closedLoop(loop: readonly Point3d[]): Point3d[] | undefined {
  if (loop.length < 3) return undefined;
  const points = loop[0]!.isAlmostEqual(loop[loop.length - 1]!, 1e-6) ? loop.slice(0, -1) : loop.slice();
  return points.length >= 3 ? points : undefined;
}

/** 灰体 WorldDecoration（深度测试开启；橙色选择高亮不在此层）。 */
class FeaturePreviewVolumeDecorator {
  private readonly _viewport: ScreenViewport;
  private readonly _geometry: FeaturePreviewGeometry;
  private readonly _opacity: number;
  private readonly _removeListener?: () => void;

  public constructor(viewport: ScreenViewport, geometry: FeaturePreviewGeometry, opacity: number) {
    this._viewport = viewport;
    this._geometry = geometry;
    this._opacity = Math.max(0.04, Math.min(0.6, opacity));
    const manager = IModelApp.viewManager as unknown as { addDecorator?: (decorator: unknown) => () => void };
    this._removeListener = typeof manager?.addDecorator === 'function'
      ? manager.addDecorator(this)
      : undefined;
    if (typeof this._viewport.invalidateDecorations === 'function')
      this._viewport.invalidateDecorations();
  }

  public dispose(): void {
    this._removeListener?.();
  }

  public decorate(context: DecorateContext): void {
    if (!context.viewport.view.isSpatialView()) return;
    const geometry = this._geometry;
    if (geometry.quads.length === 0 && geometry.lines.length === 0 && geometry.capLoops.length === 0)
      return;
    const builder = context.createGraphic({
      type: GraphicType.WorldDecoration,
      wantNormals: true,
    });
    const fillAlpha = Math.round(this._opacity * 255);
    const fill = PREVIEW_FILL.withAlpha(fillAlpha);
    builder.setSymbology(fill, fill, 1);
    for (const quad of geometry.quads) {
      if (quad.length >= 3) builder.addShape(quad);
    }
    for (const cap of geometry.capLoops) {
      const loop = closedLoop(cap);
      if (loop) builder.addShape(loop);
    }
    const edge = PREVIEW_EDGE.withAlpha(200);
    builder.setSymbology(edge, edge, 1);
    for (const line of geometry.lines) {
      if (line.length >= 2) builder.addLineString(line.slice());
    }
    context.addDecorationFromBuilder(builder);
  }
}

/**
 * v1.21：后端影子求值几何（fillet 真实结果）→ TileRpc 动态 iMdl → 场景内 RenderGraphic。
 * 灰半透明外观用 GraphicBranch + FeatureAppearanceProvider 覆盖（Onshape 预览灰体）。
 */
class DynamicPreviewGraphicDecorator {
  private readonly _viewport: ScreenViewport;
  private readonly _connection: BriefcaseConnection;
  /** true=替换源体的实心结果预览（正常材质）；false=拾取期灰 ghost。 */
  private readonly _solid: boolean;
  private _owner?: RenderGraphicOwner;
  private _branchGraphicOwner?: RenderGraphicOwner;
  private readonly _removeListener?: () => void;

  public constructor(viewport: ScreenViewport, connection: BriefcaseConnection, solid = false) {
    this._viewport = viewport;
    this._connection = connection;
    this._solid = solid;
    const manager = IModelApp.viewManager as unknown as { addDecorator?: (decorator: unknown) => () => void };
    this._removeListener = typeof manager?.addDecorator === 'function' ? manager.addDecorator(this) : undefined;
  }

  public setGraphic(owner: RenderGraphicOwner | undefined): void {
    this._branchGraphicOwner?.disposeGraphic();
    this._branchGraphicOwner = undefined;
    this._owner?.disposeGraphic();
    this._owner = owner;
    if (typeof this._viewport.invalidateDecorations === 'function')
      this._viewport.invalidateDecorations();
  }

  public dispose(): void {
    this._removeListener?.();
    this._branchGraphicOwner?.disposeGraphic();
    this._branchGraphicOwner = undefined;
    this._owner?.disposeGraphic();
    this._owner = undefined;
  }

  public decorate(context: DecorateContext): void {
    if (!this._owner || !context.viewport.view.isSpatialView()) return;
    if (!this._branchGraphicOwner) {
      const branch = new GraphicBranch(false);
      branch.add(this._owner);
      const options = this._solid ? { iModel: this._connection } : {
        appearanceProvider: FeatureAppearanceProvider.supplement(() => FeatureAppearance.fromJSON({
          rgb: { r: 0xe4, g: 0xe6, b: 0xe8 },
          transparency: 0.55,
          nonLocatable: true,
        })),
        iModel: this._connection,
      };
      const branchGraphic: RenderGraphic = context.createGraphicBranch(branch, Transform.createIdentity(), options);
      // GraphicOwner 防 Viewport 在下一帧自动处置分支包装（底层 owner 已另持）。
      this._branchGraphicOwner = IModelApp.renderSystem.createGraphicOwner(branchGraphic);
    }
    context.addDecoration(GraphicType.Scene, this._branchGraphicOwner);
  }
}

export function FeaturePreviewOverlay({
  viewport,
  connection,
  geometry,
  dynamicPreview,
  opacity = 0.42,
  hideSource = false,
  solid = false,
}: FeaturePreviewOverlayProps): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 灰体 3D decorator（与相机同步由场景渲染负责）。
  React.useEffect(() => {
    if (!viewport || !geometry) return;
    const decoration = new FeaturePreviewVolumeDecorator(viewport, geometry, opacity);
    return () => decoration.dispose();
  }, [viewport, geometry, opacity]);

  // fillet 结束拾取后：源体透明化（不是 neverDrawn——那会连带剔除拾取工具
  // 的橙色已选边装饰），实心结果预览成为唯一可见几何。源体仍可定位，用户
  // 可以继续「添加边」；预览动态图形已不挂源 elementId（见下），不受本 override
  // 影响。only 增删本 provider，保留树眼/选择等既有 provider。
  React.useEffect(() => {
    const hiddenId = dynamicPreview?.elementId;
    if (!viewport || !hiddenId || !hideSource) return;
    const provider: FeatureOverrideProvider = {
      addFeatureOverrides: (overrides) => {
        overrides.override({
          elementId: hiddenId,
          appearance: FeatureAppearance.fromJSON({ transparency: 1 }),
        });
      },
    };
    viewport.addFeatureOverrideProvider(provider);
    return () => { viewport.dropFeatureOverrideProvider(provider); };
  }, [viewport, dynamicPreview?.elementId, hideSource]);

  // v1.21 fillet：后端影子求值几何 → TileRpc 动态 iMdl → RenderGraphic。
  // requestElementGraphics 不查/不写 tile cache；旧请求用 canceled 标记丢弃。
  React.useEffect(() => {
    if (!viewport || !connection || !dynamicPreview) return;
    const decorator = new DynamicPreviewGraphicDecorator(viewport, connection, solid);
    let canceled = false;
    const request: DynamicGraphicsRequest3dProps = {
      id: `feature-preview-${crypto.randomUUID()}`,
      type: '3d',
      toleranceLog10: -3,
      placement: dynamicPreview.placement,
      categoryId: dynamicPreview.categoryId,
      ...(dynamicPreview.modelId !== undefined ? { modelId: dynamicPreview.modelId } : {}),
      // 实心替换态不挂源 elementId：TileRpc 动态图形的 features 若继承源元素 id，
      // 会被 neverDrawn（隐藏源体）一并剔除——实测预览整块消失。类别/placement
      // 已足够生成材质；ghost 态保留 elementId 供关联高亮。
      ...(dynamicPreview.elementId !== undefined && !hideSource ? { elementId: dynamicPreview.elementId } : {}),
      geometry: { format: 'flatbuffer', data: dynamicPreview.entries },
    };
    void (async () => {
      try {
        const bytes = await IModelApp.tileAdmin.requestElementGraphics(connection, request);
        if (!bytes || canceled) return;
        const graphic = await readElementGraphics(
          bytes,
          connection,
          dynamicPreview.modelId ?? '0',
          true,
          { noFlash: true, noHilite: true },
        );
        if (!graphic) return;
        if (canceled) {
          graphic.dispose();
          return;
        }
        decorator.setGraphic(IModelApp.renderSystem.createGraphicOwner(graphic));
      } catch {
        // 预览失败静默（提交仍走真实 op 的诚实错误面）
      }
    })();
    return () => {
      canceled = true;
      decorator.dispose();
    };
  }, [viewport, connection, dynamicPreview, solid]);

  // 橙色选中面/边：屏幕空间 x-ray 叠层（even-odd 消孔）。
  const draw = React.useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport || !geometry || typeof viewport.worldToView !== 'function')
      return;
    const viewRect = viewport.viewRect;
    const width = Math.max(1, Math.round(viewRect.width));
    const height = Math.max(1, Math.round(viewRect.height));
    const dpr = Math.min(DPR_CAP, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const project = (point: Point3d): { x: number; y: number } => viewport.worldToView(point);

    if (geometry.fillLoops.length > 0) {
      ctx.beginPath();
      for (const loop of geometry.fillLoops) {
        if (loop.length < 3) continue;
        const points = loop.map(project);
        ctx.moveTo(points[0]!.x, points[0]!.y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
        ctx.closePath();
      }
      ctx.fillStyle = ORANGE_FILL;
      ctx.fill('evenodd');
    }

    ctx.strokeStyle = ORANGE_EDGE;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const edge of geometry.selectionEdges) {
      if (edge.length < 2) continue;
      const points = edge.map(project);
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
      ctx.stroke();
    }
  }, [viewport, geometry]);

  React.useEffect(() => {
    draw();
    const event = viewport?.onViewChanged;
    if (!event || typeof event.addListener !== 'function') return;
    event.addListener(draw);
    return () => { event.removeListener(draw); };
  }, [draw, viewport]);

  React.useEffect(() => {
    const onResize = (): void => draw();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="part-studio-feature-preview"
      data-testid="part-studio-feature-preview"
      data-quads={geometry?.quads.length ?? 0}
      data-fills={geometry?.fillLoops.length ?? 0}
      data-edges={geometry?.selectionEdges.length ?? 0}
      data-dynamic={dynamicPreview !== undefined ? '1' : '0'}
      data-source-hidden={dynamicPreview !== undefined && hideSource ? '1' : '0'}
      aria-hidden="true"
    />
  );
}
