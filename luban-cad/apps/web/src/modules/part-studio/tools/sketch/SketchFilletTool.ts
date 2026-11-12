/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图圆角工具（toolId `Sketch.Fillet`，Onshape Fillet 首切片 2026-11-12）。
 *
 * Live 证据（2026-11-12，自家 LubanLivePostman 副本空白矩形）：点击圆角按钮后
 * 点击矩形角点，Onshape **立即**生成相切圆弧并显示可编辑的 R 尺寸，没有单独
 * 的半径对话框；工具保持激活可连续倒角，Esc/右键结束。
 *
 * 本工具按同一交互：点击两条直线共享的角点 → 默认半径
 * `DEFAULT_SKETCH_FILLET_RADIUS_MM` 生成圆角（arc + 两线端点回缩 + coincident×2
 * + tangent×2 + radius 约束）；随后双击现有 R 尺寸即可改半径。提交走
 * `updateSketch` 乐观整体覆写（可撤销）。几何与约束展开在
 * `internal/sketch-fillet.ts` 纯逻辑（显式点端点/线弧组合暂不支持，诚实提示）。
 */
import {
  BeButtonEvent,
  DynamicsContext,
  EventHandled,
  GraphicType,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import { AngleSweep, Arc3d, Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import i18next from 'i18next';
import type { SketchDto } from '@luban-cad/shared';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import {
  computeFilletGeometry,
  filletSketchCorner,
  findSketchFilletCorners,
  nextSketchId,
  type FilletCorner,
} from '../../internal/sketch-fillet.js';

/**
 * 默认圆角半径（毫米）。Live 证据为英寸文档 0.25 in（= 6.35 mm）；本产品草图
 * 以毫米为单位，取 Onshape 公制文档的常见默认 5 mm。可编辑 R 尺寸允许用户
 * 立即改值，默认值不改变契约。
 */
export const DEFAULT_SKETCH_FILLET_RADIUS_MM = 5;

const PICK_PX = 12;
const HOVER_PX = 24;
const PREVIEW_COLOR = ColorDef.from(247, 148, 30);

export class SketchFilletTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Fillet';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-fillet';

  private _plane!: SketchPlaneFrame;
  private _nextId = 1;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this._seedNextId();
    this.beginDynamics();
    this._publishPrompt();
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted)
      this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    // 清 ribbon 激活态（否则退出后 SketchEntityPicker/尺寸编辑器仍被 store 门挡住）。
    // 仅当当前激活态仍是本工具时清，避免切换工具时抹掉新工具刚写入的 id。
    if (usePartStudioStore.getState().tool.activeToolId === 'sketchFillet')
      usePartStudioStore.getState().setActiveTool(null);
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    if (this._hintText)
      publishSketchToolHint(this.toolId, this._hintText, this._cursorView);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch) {
      this._notify(i18next.t('partStudio.sketch.fillet.notOpen'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }

    const corner = this._nearestCorner(sketch, ev.viewPoint, PICK_PX);
    if (!corner) {
      this._notify(i18next.t('partStudio.sketch.fillet.noCorner'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    this._seedNextId(sketch);
    const result = filletSketchCorner(
      sketch.entities,
      sketch.constraints,
      corner,
      DEFAULT_SKETCH_FILLET_RADIUS_MM,
      this._nextId,
      { construction: usePartStudioStore.getState().sketch.constructionMode },
    );
    if (!result.ok) {
      this._notifyFilletFailure(result.reason);
      return EventHandled.Yes;
    }
    const applied = await sketchSystem.applyUpdate(result.entities, result.constraints);
    if (!applied.ok) {
      this._notify(applied.error ?? i18next.t('partStudio.sketch.fillet.failed'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    this._nextId = result.nextId;
    // 工具保持激活（Onshape 同款：可连续倒角）；不弹成功 toast。
    this._publishPrompt();
    return EventHandled.Yes;
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const sketch = getSketchSystem()?.activeSketch;
    if (!sketch)
      return;
    const corner = this._nearestCorner(sketch, ev.viewPoint, HOVER_PX);
    if (!corner)
      return;
    const geometry = computeFilletGeometry(corner, DEFAULT_SKETCH_FILLET_RADIUS_MM);
    if (!geometry.ok)
      return;
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    const arc = Arc3d.createXY(
      Point3d.create(geometry.geometry.center.x, geometry.geometry.center.y, 0),
      geometry.geometry.radius,
      AngleSweep.createStartSweepRadians(geometry.geometry.startAngle, geometry.geometry.sweepAngle),
    );
    arc.tryTransformInPlace(this._plane.localToWorld);
    builder.addArc(arc, false, false);
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    await this.exitTool();
  }

  private _nearestCorner(
    sketch: SketchDto,
    viewPoint: { x: number; y: number },
    maxDistance: number,
  ): FilletCorner | undefined {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport)
      return undefined;
    let best: FilletCorner | undefined;
    let bestDistance = maxDistance;
    for (const corner of findSketchFilletCorners(sketch.entities, sketch.constraints)) {
      const view = viewport.worldToView(this._plane.toWorld({ u: corner.point.x, v: corner.point.y }));
      const distance = Math.hypot(view.x - viewPoint.x, view.y - viewPoint.y);
      if (distance <= bestDistance) {
        best = corner;
        bestDistance = distance;
      }
    }
    return best;
  }

  private _seedNextId(sketch?: SketchDto): void {
    const active = sketch ?? getSketchSystem()?.activeSketch;
    if (active)
      this._nextId = Math.max(this._nextId, nextSketchId(active.entities, active.constraints));
  }

  private _publishPrompt(): void {
    const text = i18next.t('partStudio.sketch.fillet.prompt', { radius: DEFAULT_SKETCH_FILLET_RADIUS_MM });
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView)
      publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notifyFilletFailure(reason: 'no-corner' | 'unsupported' | 'degenerate' | 'radius-too-large' | 'invalid-radius'): void {
    if (reason === 'unsupported')
      this._notify(i18next.t('partStudio.sketch.fillet.unsupported'), OutputMessagePriority.Info);
    else if (reason === 'radius-too-large')
      this._notify(
        i18next.t('partStudio.sketch.fillet.radiusTooLarge', { radius: DEFAULT_SKETCH_FILLET_RADIUS_MM }),
        OutputMessagePriority.Warning,
      );
    else if (reason === 'degenerate')
      this._notify(i18next.t('partStudio.sketch.fillet.degenerate'), OutputMessagePriority.Info);
    else if (reason === 'invalid-radius')
      this._notify(i18next.t('partStudio.sketch.fillet.invalidRadius'), OutputMessagePriority.Info);
    else
      this._notify(i18next.t('partStudio.sketch.fillet.noCorner'), OutputMessagePriority.Info);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

let sketchFilletRegistered = false;
export function registerSketchFilletTools(): void {
  if (sketchFilletRegistered)
    return;
  IModelApp.tools.register(SketchFilletTool);
  sketchFilletRegistered = true;
}
