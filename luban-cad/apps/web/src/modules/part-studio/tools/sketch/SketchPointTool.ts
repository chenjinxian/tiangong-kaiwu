/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图点工具（toolId `Sketch.Point`，Onshape 草图「点」工具首切片）。
 *
 * 交互：点击放置一个点，工具保持存活可连续放点；Esc/右键结束。点不参与面域，
 * 但可作为孔位/定位参考（HoleDialog 的草图点孔位通道消费）。取点沿用草图工具链
 * 标准 AccuSnap 热捕捉（getCurrSnapDetail → adjustedPoint，回落 ev.point），
 * 世界点经草图平面架投影为局部 (u,v)。提交走 `applyUpdate` 乐观整体覆写，
 * 拒收只回滚本次 id；不手写命中测试/第二套事务。
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
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import { autoWeldConstraints } from './sketch-auto-weld.js';

const PREVIEW_COLOR = ColorDef.from(0, 120, 215);

export class SketchPointTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Point';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-point';

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
    this._outputPrompt();
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    if (this._hintText) publishSketchToolHint(this.toolId, this._hintText, this._cursorView);
  }

  public override async onDataButtonDown(_ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch) {
      this._notify(i18next.t('partStudio.sketch.point.toasts.sketchEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const snap = IModelApp.accuSnap?.getCurrSnapDetail();
    const world = snap && snap.isHot ? snap.adjustedPoint : _ev.point;
    const local = this._plane.toLocal(world);
    if (!Number.isFinite(local.u) || !Number.isFinite(local.v)) {
      this._notify(i18next.t('partStudio.sketch.point.toasts.invalidPoint'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    this._seedNextId();
    const id = this._nextId;
    const point = { kind: 'point' as const, id, x: local.u, y: local.v };
    const weld = autoWeldConstraints([point], sketch.entities, sketch.constraints, { startConstraintId: id + 1 });
    const result = await sketchSystem.applyUpdate(
      [...sketch.entities, point],
      [...sketch.constraints, ...weld],
    );
    if (!result.ok) {
      this._notify(result.error ?? i18next.t('partStudio.sketch.point.toasts.updateFailed'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    this._nextId = Math.max(id + 1, ...weld.map((c) => c.id + 1));
    return EventHandled.Yes;
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    const local = this._plane.toLocal(ev.point);
    const arc = Arc3d.createXY(Point3d.create(local.u, local.v, 0), 0.8, AngleSweep.createStartSweepRadians(0, Math.PI * 2));
    arc.tryTransformInPlace(this._plane.localToWorld);
    builder.addArc(arc, false, false);
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SketchPointTool();
    if (!(await tool.run())) return this.exitTool();
  }

  private _seedNextId(): void {
    const sketch = getSketchSystem()?.activeSketch;
    let max = 0;
    if (sketch) {
      for (const e of sketch.entities) max = Math.max(max, e.id);
      for (const c of sketch.constraints) max = Math.max(max, c.id);
    }
    this._nextId = Math.max(this._nextId, max + 1);
  }

  private _outputPrompt(): void {
    const text = i18next.t('partStudio.sketch.point.prompts.place');
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView) publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

let pointToolRegistered = false;
export function registerSketchPointTools(): void {
  if (pointToolRegistered) return;
  IModelApp.tools.register(SketchPointTool);
  pointToolRegistered = true;
}
