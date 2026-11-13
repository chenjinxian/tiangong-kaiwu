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
 * 本工具按同一交互：点击草图角点（直线-直线 / 直线-圆弧 / 两线延长交点）→
 * 默认半径 `DEFAULT_SKETCH_FILLET_RADIUS_MM` 生成圆角（arc + 端点/源弧回缩 +
 * coincident×2 + tangent×2 + radius 约束）；随后双击现有 R 尺寸即可改半径。
 * 提交走 `updateSketch` 乐观整体覆写（可撤销）。几何与约束展开在
 * `internal/sketch-fillet.ts` 纯逻辑（三线以上共点/整圆/样条暂不支持）。
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
  computeFilletLineArcGeometry,
  filletSketchCorner,
  filletSketchLineArcCorner,
  filletSketchLinePair,
  findSketchFilletCorners,
  findSketchLineArcCorners,
  nextSketchId,
  type FilletCorner,
  type FilletFailureReason,
  type FilletLineArcCorner,
} from '../../internal/sketch-fillet.js';
import { sketchEntitiesToWorldPolylines } from '../../internal/sketch-curves.js';
import { hitTestSketchEntity } from '../../internal/sketch-entity-picker.js';

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
  /** Onshape「点两条曲线」：第一击选中的直线；第二击在延长交点倒角。 */
  private _firstLineId?: number;

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
    this._firstLineId = undefined;
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

    // Onshape Fillet 两种拾取：共享角点（一击立即倒角）或依次点两条曲线
    // （二击，在延长线交点倒角）。
    const corner = this._nearestCorner(sketch, ev.viewPoint, PICK_PX);
    if (corner) {
      await this._applyCorner(sketchSystem, sketch, corner);
      this._firstLineId = undefined;
      this._publishPrompt();
      return EventHandled.Yes;
    }

    const lineArcCorner = this._nearestLineArcCorner(sketch, ev.viewPoint, PICK_PX);
    if (lineArcCorner) {
      await this._applyLineArcCorner(sketchSystem, sketch, lineArcCorner);
      this._firstLineId = undefined;
      this._publishPrompt();
      return EventHandled.Yes;
    }

    const lineId = this._hitLine(sketch, ev.viewPoint);
    if (lineId === undefined) {
      this._notify(i18next.t('partStudio.sketch.fillet.noCorner'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    if (this._firstLineId === undefined) {
      this._firstLineId = lineId;
      this._publishSecondPrompt();
      return EventHandled.Yes;
    }
    if (this._firstLineId === lineId) {
      this._notify(i18next.t('partStudio.sketch.fillet.chooseAnotherLine'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    const firstLineId = this._firstLineId;
    this._firstLineId = undefined;
    this._seedNextId(sketch);
    const result = filletSketchLinePair(
      sketch.entities,
      sketch.constraints,
      firstLineId,
      lineId,
      DEFAULT_SKETCH_FILLET_RADIUS_MM,
      this._nextId,
      { construction: usePartStudioStore.getState().sketch.constructionMode },
    );
    if (!result.ok) {
      this._notifyLinePairFailure(result.reason);
      this._publishPrompt();
      return EventHandled.Yes;
    }
    const applied = await sketchSystem.applyUpdate(result.entities, result.constraints);
    if (!applied.ok) {
      this._notify(applied.error ?? i18next.t('partStudio.sketch.fillet.failed'), OutputMessagePriority.Error);
      this._publishPrompt();
      return EventHandled.Yes;
    }
    this._nextId = result.nextId;
    this._publishPrompt();
    return EventHandled.Yes;
  }

  private async _applyCorner(
    sketchSystem: NonNullable<ReturnType<typeof getSketchSystem>>,
    sketch: SketchDto,
    corner: FilletCorner,
  ): Promise<void> {
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
      return;
    }
    const applied = await sketchSystem.applyUpdate(result.entities, result.constraints);
    if (!applied.ok) {
      this._notify(applied.error ?? i18next.t('partStudio.sketch.fillet.failed'), OutputMessagePriority.Error);
      return;
    }
    this._nextId = result.nextId;
  }

  private async _applyLineArcCorner(
    sketchSystem: NonNullable<ReturnType<typeof getSketchSystem>>,
    sketch: SketchDto,
    corner: FilletLineArcCorner,
  ): Promise<void> {
    this._seedNextId(sketch);
    const result = filletSketchLineArcCorner(
      sketch.entities,
      sketch.constraints,
      corner,
      DEFAULT_SKETCH_FILLET_RADIUS_MM,
      this._nextId,
      { construction: usePartStudioStore.getState().sketch.constructionMode },
    );
    if (!result.ok) {
      this._notifyLineArcFailure(result.reason);
      return;
    }
    const applied = await sketchSystem.applyUpdate(result.entities, result.constraints);
    if (!applied.ok) {
      this._notify(applied.error ?? i18next.t('partStudio.sketch.fillet.failed'), OutputMessagePriority.Error);
      return;
    }
    this._nextId = result.nextId;
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const sketch = getSketchSystem()?.activeSketch;
    if (!sketch)
      return;
    const corner = this._nearestCorner(sketch, ev.viewPoint, HOVER_PX);
    if (corner) {
      const geometry = computeFilletGeometry(corner, DEFAULT_SKETCH_FILLET_RADIUS_MM);
      if (geometry.ok) {
        this._drawPreviewArc(
          context,
          geometry.geometry.center,
          geometry.geometry.radius,
          geometry.geometry.startAngle,
          geometry.geometry.sweepAngle,
        );
      }
      return;
    }
    const lineArc = this._nearestLineArcCorner(sketch, ev.viewPoint, HOVER_PX);
    if (lineArc) {
      const geometry = computeFilletLineArcGeometry(lineArc, DEFAULT_SKETCH_FILLET_RADIUS_MM);
      if (geometry.ok) {
        this._drawPreviewArc(
          context,
          geometry.geometry.center,
          geometry.geometry.radius,
          geometry.geometry.startAngle,
          geometry.geometry.sweepAngle,
        );
      }
      return;
    }
    // 两线拾取：第一线已选时，悬停第二线预览延长交点圆角。
    if (this._firstLineId === undefined)
      return;
    const hovered = this._hitLine(sketch, ev.viewPoint);
    if (hovered === undefined || hovered === this._firstLineId)
      return;
    const preview = filletSketchLinePair(
      sketch.entities,
      sketch.constraints,
      this._firstLineId,
      hovered,
      DEFAULT_SKETCH_FILLET_RADIUS_MM,
      1,
    );
    if (!preview.ok)
      return;
    const arcEntity = preview.entities.find((entity) => entity.id === preview.arcId);
    if (!arcEntity || arcEntity.kind !== 'arc')
      return;
    const center = arcEntity.center;
    if (typeof center === 'number' || typeof arcEntity.radius !== 'number')
      return;
    this._drawPreviewArc(
      context,
      center,
      arcEntity.radius,
      arcEntity.startAngle ?? 0,
      arcEntity.sweepAngle ?? 0,
    );
  }

  private _drawPreviewArc(
    context: DynamicsContext,
    center: { x: number; y: number },
    radius: number,
    startAngle: number,
    sweepAngle: number,
  ): void {
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    const arc = Arc3d.createXY(
      Point3d.create(center.x, center.y, 0),
      radius,
      AngleSweep.createStartSweepRadians(startAngle, sweepAngle),
    );
    arc.tryTransformInPlace(this._plane.localToWorld);
    builder.addArc(arc, false, false);
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    // Onshape live 2026-11-13：右键=画布菜单（首项「退出 <工具>」），不直接退出；Esc 仍退出。
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

  private _nearestLineArcCorner(
    sketch: SketchDto,
    viewPoint: { x: number; y: number },
    maxDistance: number,
  ): FilletLineArcCorner | undefined {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport)
      return undefined;
    let best: FilletLineArcCorner | undefined;
    let bestDistance = maxDistance;
    for (const corner of findSketchLineArcCorners(sketch.entities, sketch.constraints)) {
      const view = viewport.worldToView(this._plane.toWorld({ u: corner.point.x, v: corner.point.y }));
      const distance = Math.hypot(view.x - viewPoint.x, view.y - viewPoint.y);
      if (distance <= bestDistance) {
        best = corner;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** 屏幕点命中草图直线（两线拾取/预览共用；非曲线/圆/弧/样条不选）。 */
  private _hitLine(sketch: SketchDto, viewPoint: { x: number; y: number }): number | undefined {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport)
      return undefined;
    const geometry = {
      polylines: sketchEntitiesToWorldPolylines(sketch.entities, sketch.plane),
      controlPoints: [],
    };
    const project = (world: Point3d): { x: number; y: number } => {
      const view = viewport.worldToView(world);
      return { x: view.x, y: view.y };
    };
    const hit = hitTestSketchEntity(geometry, viewPoint, project, sketch.id);
    if (!hit || hit.part !== 'curve')
      return undefined;
    const entity = sketch.entities.find((candidate) => candidate.id === hit.entityId);
    if (!entity || entity.kind !== 'line' || entity.projected)
      return undefined;
    return entity.id;
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

  private _publishSecondPrompt(): void {
    const text = i18next.t('partStudio.sketch.fillet.secondPrompt', { radius: DEFAULT_SKETCH_FILLET_RADIUS_MM });
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView)
      publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notifyFilletFailure(reason: FilletFailureReason): void {
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
    else if (reason === 'outside-segment')
      this._notify(i18next.t('partStudio.sketch.fillet.outsideSegment'), OutputMessagePriority.Info);
    else
      this._notify(i18next.t('partStudio.sketch.fillet.noCorner'), OutputMessagePriority.Info);
  }

  private _notifyLineArcFailure(reason: FilletFailureReason): void {
    if (reason === 'degenerate')
      this._notify(i18next.t('partStudio.sketch.fillet.lineArcDegenerate'), OutputMessagePriority.Info);
    else if (reason === 'outside-segment')
      this._notify(i18next.t('partStudio.sketch.fillet.outsideSegment'), OutputMessagePriority.Info);
    else if (reason === 'radius-too-large')
      this._notify(
        i18next.t('partStudio.sketch.fillet.radiusTooLarge', { radius: DEFAULT_SKETCH_FILLET_RADIUS_MM }),
        OutputMessagePriority.Warning,
      );
    else if (reason === 'invalid-radius')
      this._notify(i18next.t('partStudio.sketch.fillet.invalidRadius'), OutputMessagePriority.Info);
    else if (reason === 'unsupported')
      this._notify(i18next.t('partStudio.sketch.fillet.unsupported'), OutputMessagePriority.Info);
    else
      this._notify(i18next.t('partStudio.sketch.fillet.noCorner'), OutputMessagePriority.Info);
  }

  private _notifyLinePairFailure(reason: FilletFailureReason): void {
    if (reason === 'degenerate')
      this._notify(i18next.t('partStudio.sketch.fillet.parallel'), OutputMessagePriority.Info);
    else if (reason === 'outside-segment')
      this._notify(i18next.t('partStudio.sketch.fillet.outsideSegment'), OutputMessagePriority.Info);
    else if (reason === 'radius-too-large')
      this._notify(
        i18next.t('partStudio.sketch.fillet.radiusTooLarge', { radius: DEFAULT_SKETCH_FILLET_RADIUS_MM }),
        OutputMessagePriority.Warning,
      );
    else if (reason === 'invalid-radius')
      this._notify(i18next.t('partStudio.sketch.fillet.invalidRadius'), OutputMessagePriority.Info);
    else if (reason === 'unsupported')
      this._notify(i18next.t('partStudio.sketch.fillet.unsupported'), OutputMessagePriority.Info);
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
