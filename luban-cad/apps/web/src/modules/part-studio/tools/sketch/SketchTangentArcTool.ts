/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 相切圆弧工具（toolId `Sketch.TangentArc`，Onshape 圆弧飞菜单首切片）。
 *
 * 证据：Onshape Help「Tangent Arc」——两次点击：点已有直线的端点定起点/切线，
 * 再点终点；圆弧在起点与直线相切。首切片只接**草图直线端点**（面/边相切属
 * 外部引用）；提交一条 arc + coincident(arc.start, line.endpoint) + tangent(arc, line)。
 * Onshape live（2026-11-13）：绘制工具提交后保持激活——本工具提交成功后回到
 * 「选起点」阶段，继续画下一条弧（Esc 退出工具；右键=画布菜单，菜单首项「退出 <工具>」）。连续链式弧（自动取上一弧
 * 端点作起点）仍未做。
 *
 * 取点沿用草图工具链统一 `pickHitLocal`（sketch-pick：热捕捉 → 光标射线∩草图
 * 平面 → 回退）；世界点经草图平面架投影为局部 (u,v)。提交走 applyUpdate 乐观
 * 整体覆写，拒收只回滚本次 id。
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
import type { SketchConstraintDto, SketchEntityDto } from '@luban-cad/shared';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { usePartStudioStore } from '../../stores/use-part-studio-store.js';
import { pickHitLocal, resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';

const PREVIEW_COLOR = ColorDef.from(0, 120, 215);
const PICK_TOL = 3.0;

interface Pt { u: number; v: number }
interface LineAnchor { lineId: number; part: 'start' | 'end'; point: Pt; direction: Pt }

function pointOf(ref: number | { x: number; y: number } | undefined, points: Map<number, Pt>): Pt | undefined {
  if (ref === undefined) return undefined;
  return typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
}

export class SketchTangentArcTool extends PrimitiveTool {
  public static override toolId = 'Sketch.TangentArc';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-tangent-arc';

  private _plane!: SketchPlaneFrame;
  private _nextId = 1;
  private _start?: LineAnchor;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this._seedNextId();
    this.beginDynamics();
    this._outputPrompt('start');
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    this._start = undefined;
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    if (this._hintText) publishSketchToolHint(this.toolId, this._hintText, this._cursorView);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch) {
      this._notify(i18next.t('partStudio.sketch.tangentArc.toasts.sketchEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const hit = pickHitLocal(ev, this._plane);
    if (!this._start) {
      const anchor = this._pickLineEndpoint(sketch.entities, hit);
      if (!anchor) {
        this._notify(i18next.t('partStudio.sketch.tangentArc.toasts.startOnEndpoint'), OutputMessagePriority.Info);
        return EventHandled.Yes;
      }
      this._start = anchor;
      this._outputPrompt('end');
      return EventHandled.Yes;
    }

    const built = this._buildArc(this._start, hit);
    if (!built) {
      this._notify(i18next.t('partStudio.sketch.tangentArc.toasts.degenerate'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    this._seedNextId();
    const idBase = this._nextId;
    const construction = usePartStudioStore.getState().sketch.constructionMode;
    const arc: SketchEntityDto = {
      kind: 'arc', id: idBase,
      center: { x: built.center.u, y: built.center.v },
      radius: built.radius, startAngle: built.startAngle, sweepAngle: built.sweepAngle,
      ...(construction ? { construction: true } : {}),
    };
    const constraints: SketchConstraintDto[] = [
      {
        kind: 'coincident', id: idBase + 1,
        refs: [{ entity: arc.id, part: 'start' }, { entity: this._start.lineId, part: this._start.part }],
      },
      { kind: 'tangent', id: idBase + 2, refs: [arc.id, this._start.lineId] },
    ];
    const result = await sketchSystem.applyUpdate(
      [...sketch.entities, arc],
      [...sketch.constraints, ...constraints],
    );
    if (!result.ok) {
      this._notify(result.error ?? i18next.t('partStudio.sketch.tangentArc.toasts.updateFailed'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    this._nextId = idBase + 3;
    // Onshape（2026-11-13 live）：提交后保持激活，回到起点拾取继续画下一条弧。
    this._start = undefined;
    this._outputPrompt('start');
    return EventHandled.Yes;
  }

  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    const hit = pickHitLocal(ev, this._plane);
    const start = this._start;
    if (start) {
      builder.addLineString([this._plane.toWorld(start.point), this._plane.toWorld(start.point)]);
      const built = this._buildArc(start, hit);
      if (built) {
        const arc = Arc3d.createXY(
          Point3d.create(built.center.u, built.center.v, 0),
          built.radius,
          AngleSweep.createStartSweepRadians(built.startAngle, built.sweepAngle),
        );
        arc.tryTransformInPlace(this._plane.localToWorld);
        builder.addArc(arc, false, false);
      }
    }
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    // Onshape live 2026-11-13：右键=画布菜单（首项「退出 <工具>」），不直接退出；Esc 仍退出。
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SketchTangentArcTool();
    if (!(await tool.run())) return this.exitTool();
  }

  private _pickLineEndpoint(entities: readonly SketchEntityDto[], hit: Pt): LineAnchor | undefined {
    const points = new Map<number, Pt>();
    for (const e of entities) {
      if (e.kind === 'point' && e.x !== undefined && e.y !== undefined)
        points.set(e.id, { u: e.x, v: e.y });
    }
    let best: LineAnchor | undefined;
    let bestDistance = PICK_TOL;
    for (const e of entities) {
      if (e.kind !== 'line') continue;
      const p1 = pointOf(e.p1, points);
      const p2 = pointOf(e.p2, points);
      if (!p1 || !p2) continue;
      const d1 = Math.hypot(hit.u - p1.u, hit.v - p1.v);
      const d2 = Math.hypot(hit.u - p2.u, hit.v - p2.v);
      if (d1 <= bestDistance) {
        bestDistance = d1;
        best = { lineId: e.id, part: 'start', point: p1, direction: { u: p2.u - p1.u, v: p2.v - p1.v } };
      }
      if (d2 <= bestDistance) {
        bestDistance = d2;
        best = { lineId: e.id, part: 'end', point: p2, direction: { u: p1.u - p2.u, v: p1.v - p2.v } };
      }
    }
    return best;
  }

  private _buildArc(start: LineAnchor, end: Pt): {
    center: Pt; radius: number; startAngle: number; sweepAngle: number;
  } | undefined {
    const dx = end.u - start.point.u;
    const dy = end.v - start.point.v;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) return undefined;
    const tLen = Math.hypot(start.direction.u, start.direction.v);
    if (tLen < 1e-12) return undefined;
    const tx = start.direction.u / tLen;
    const ty = start.direction.v / tLen;
    // 圆心在线起点处的垂线上；选指向终点的法向，r 由 |E−C|=r 反解。
    let nx = -ty;
    let ny = tx;
    if (dx * nx + dy * ny < 0) { nx = -nx; ny = -ny; }
    const denom = dx * nx + dy * ny;
    if (denom < 1e-9) return undefined; // 终点落在切线上（退化）
    const radius = len2 / (2 * denom);
    if (!(radius > 0) || !Number.isFinite(radius)) return undefined;
    const center = { u: start.point.u + nx * radius, v: start.point.v + ny * radius };
    const startAngle = Math.atan2(start.point.v - center.v, start.point.u - center.u);
    const endAngle = Math.atan2(end.v - center.v, end.u - center.u);
    let sweep = endAngle - startAngle;
    while (sweep <= -Math.PI) sweep += Math.PI * 2;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    if (Math.abs(sweep) < 1e-9) return undefined;
    return { center, radius, startAngle, sweepAngle: sweep };
  }

  private _seedNextId(): void {
    const sketch = getSketchSystem()?.activeSketch;
    let max = 0;
    if (sketch) {
      for (const e of sketch.entities) max = Math.max(max, e.id);
      for (const c of sketch.constraints) max = Math.max(max, c.id);
    }
    this._nextId = Math.max(this._nextId, max + 2);
  }

  private _outputPrompt(stage: 'start' | 'end'): void {
    const text = i18next.t(`partStudio.sketch.tangentArc.prompts.${stage}`);
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView) publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

let tangentArcRegistered = false;
export function registerSketchTangentArcTools(): void {
  if (tangentArcRegistered) return;
  IModelApp.tools.register(SketchTangentArcTool);
  tangentArcRegistered = true;
}
