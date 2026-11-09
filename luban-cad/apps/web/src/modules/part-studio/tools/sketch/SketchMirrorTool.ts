/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图镜像工具（Onshape Sketch Mirror 首切片，toolId `Sketch.Mirror`）。
 *
 * 证据：Onshape Help「Sketch Mirror」（cad.onshape.com/help/Content/Sketch/
 * sketch_mirror.htm）——可选两种流程；本切片实现「先点 Mirror，再选镜像线，
 * 之后逐个点实体即时镜像，Esc/右键退出」的流程（免预选多选状态；预选流程后续
 * 可用同一 draft 逻辑补齐）。镜像线只接草图直线；实体接 line/point/circle/arc
 * （circle 为圆心对称 + 等半径；arc 为圆心/起/终点反射 + mirror 三对点；
 * spline 控制点对称语义未冻结，诚实 toast）。
 *
 * 交互两相：axis（选镜像线）→ entities（点实体即时提交）。每次提交走
 * `applyUpdate` 乐观整体覆写，拒收只回滚本次 id/草稿；工具继续存活。
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
import { AngleSweep, Arc3d, BezierCurve3d, Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import i18next from 'i18next';
import type { SketchEntityDto } from '@luban-cad/shared';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { pickHitLocal, resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import {
  buildMirrorDraft,
  resolveNearestMirrorSeedId,
  type MirrorError,
} from './sketch-mirror-logic.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';

const PREVIEW_COLOR = ColorDef.from(0, 120, 215);
const AXIS_COLOR = ColorDef.from(230, 140, 0);

export class SketchMirrorTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Mirror';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-mirror';

  private _phase: 'axis' | 'entities' = 'axis';
  private _axis?: SketchEntityDto;
  private _plane!: SketchPlaneFrame;
  private _nextId = 1;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;
  private readonly _mirrored = new Set<number>();

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this.initLocateElements(false, true);
    this._seedNextId();
    this.beginDynamics();
    this._outputPrompt('pickAxis');
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    this._axis = undefined;
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
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._notify(i18next.t('partStudio.sketch.mirror.toasts.sketchEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const hit = pickHitLocal(ev, this._plane);
    const pickedId = resolveNearestMirrorSeedId(sketch.entities, hit);
    if (pickedId === undefined) {
      this._notify(i18next.t('partStudio.sketch.mirror.toasts.nothingPicked'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const picked = sketch.entities.find((e) => e.id === pickedId);

    if (this._phase === 'axis') {
      if (!picked || picked.kind !== 'line') {
        this._notify(i18next.t('partStudio.sketch.mirror.toasts.axisMustBeLine'), OutputMessagePriority.Info);
        return EventHandled.Yes;
      }
      this._axis = picked;
      this._phase = 'entities';
      this._outputPrompt('pickEntities');
      return EventHandled.Yes;
    }

    if (!picked || !this._axis) return EventHandled.Yes;
    if (this._mirrored.has(picked.id)) {
      this._notify(i18next.t('partStudio.sketch.mirror.toasts.alreadyMirrored'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    this._seedNextId();
    const idBase = this._nextId;
    const built = buildMirrorDraft({
      source: picked,
      axis: this._axis,
      entities: sketch.entities,
      startId: idBase,
    });
    if (!built.ok) {
      this._notify(i18next.t(this._errorToastKey(built.error)), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const result = await sketchSystem.applyUpdate(
      [...sketch.entities, ...built.draft.entities],
      [...sketch.constraints, ...built.draft.constraints],
    );
    if (!result.ok) {
      this._nextId = idBase;
      this._notify(result.error ?? i18next.t('partStudio.sketch.mirror.toasts.updateFailed'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    this._nextId = built.draft.nextId;
    this._mirrored.add(picked.id);
    this._notify(i18next.t('partStudio.sketch.mirror.toasts.mirrored'), OutputMessagePriority.Info);
    return EventHandled.Yes;
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const sketch = getSketchSystem()?.activeSketch;
    const axis = this._axis;
    if (!sketch || !axis || axis.kind !== 'line') return;
    const hit = pickHitLocal(ev, this._plane);
    const pickedId = resolveNearestMirrorSeedId(sketch.entities, hit);
    const source = pickedId === undefined ? undefined : sketch.entities.find((e) => e.id === pickedId);
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(AXIS_COLOR, AXIS_COLOR, 2, LinePixels.Solid);
    const axisP1 = this._resolvePoint(axis.p1, sketch.entities);
    const axisP2 = this._resolvePoint(axis.p2, sketch.entities);
    if (axisP1 && axisP2)
      builder.addLineString([this._plane.toWorld(axisP1), this._plane.toWorld(axisP2)]);
    if (source && source.id !== axis.id && !this._mirrored.has(source.id)) {
      const built = buildMirrorDraft({
        source,
        axis,
        entities: sketch.entities,
        startId: this._nextId,
      });
      if (built.ok) {
        builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
        for (const e of built.draft.entities) {
          if (e.kind === 'line') {
            const p1 = this._resolvePoint(e.p1, sketch.entities);
            const p2 = this._resolvePoint(e.p2, sketch.entities);
            if (p1 && p2) builder.addLineString([this._plane.toWorld(p1), this._plane.toWorld(p2)]);
          } else if (e.kind === 'circle') {
            const center = this._resolvePoint(e.center, sketch.entities);
            if (center && e.radius !== undefined)
              builder.addArc(this._pointMarker(center.u, center.v, e.radius), false, false);
          } else if (e.kind === 'spline') {
            const controls = e.controlPoints.map((pt) => Point3d.create(pt.x, pt.y, 0));
            const sampled: Point3d[] = [];
            if (controls.length === 4) {
              const curve = BezierCurve3d.create(controls);
              if (curve) {
                for (let i = 0; i <= 32; i++) sampled.push(curve.fractionToPoint(i / 32));
              }
            }
            const pts = sampled.length > 0 ? sampled : controls;
            builder.addLineString(pts.map((pt) => this._plane.toWorld({ u: pt.x, v: pt.y })));
          } else if (e.kind === 'arc') {
            const center = this._resolvePoint(e.center, sketch.entities);
            if (center && e.radius !== undefined && e.startAngle !== undefined && e.sweepAngle !== undefined) {
              const preview = Arc3d.createXY(
                Point3d.create(center.u, center.v, 0), e.radius,
                AngleSweep.createStartSweepRadians(e.startAngle, e.sweepAngle),
              );
              preview.tryTransformInPlace(this._plane.localToWorld);
              builder.addArc(preview, false, false);
            }
          } else if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) {
            builder.addArc(this._pointMarker(e.x, e.y, 0.6), false, false);
          }
        }
      }
    }
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SketchMirrorTool();
    if (!(await tool.run())) return this.exitTool();
  }

  private _resolvePoint(
    ref: number | { x: number; y: number },
    entities: readonly SketchEntityDto[],
  ): { u: number; v: number } | undefined {
    if (typeof ref !== 'number') return { u: ref.x, v: ref.y };
    const point = entities.find((e) => e.id === ref);
    if (!point || point.kind !== 'point' || point.x === undefined || point.y === undefined) return undefined;
    return { u: point.x, v: point.y };
  }

  private _pointMarker(u: number, v: number, r: number): Arc3d {
    const arc = Arc3d.createXY(Point3d.create(u, v, 0), r, AngleSweep.createStartSweepRadians(0, Math.PI * 2));
    arc.tryTransformInPlace(this._plane.localToWorld);
    return arc;
  }

  private _errorToastKey(error: MirrorError): string {
    switch (error) {
      case 'unsupportedKind': return 'partStudio.sketch.mirror.toasts.unsupportedKind';
      case 'sameEntity': return 'partStudio.sketch.mirror.toasts.axisSourceSame';
      case 'degenerateAxis': return 'partStudio.sketch.mirror.toasts.degenerateAxis';
      case 'degenerateEntity': return 'partStudio.sketch.mirror.toasts.degenerateEntity';
    }
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

  private _outputPrompt(stage: 'pickAxis' | 'pickEntities'): void {
    const text = i18next.t(`sketch.mirror.prompts.${stage}`);
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView) publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

let mirrorToolRegistered = false;
export function registerSketchMirrorTools(): void {
  if (mirrorToolRegistered) return;
  IModelApp.tools.register(SketchMirrorTool);
  mirrorToolRegistered = true;
}
