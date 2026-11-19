/**
 * 草图槽（toolId `Sketch.Slot`，ADR-0022 S2 首切片，2026-11-19 live 探针）。
 *
 * live 交互（私有 `ui-evidence/slot-probe-20261119/`）：
 * - 入口在「偏移 ▾」第二项「槽」；激活后直接点击一条曲线。
 * - 点中后立刻显示槽预览（两条平行边界 + 两端半圆帽），默认宽 Ø20（mm 文档）；
 *   Enter 或再次点击提交；原中线保留；宽度尺寸可在提交后双击 Ø 标签修改。
 *
 * 首切片范围：**单条直线中线**。多段相连链、圆弧/整圆中线、闭合环槽等尚未采到
 * live 交互证据（见 ADR-0022 §2.2 与私有探针记录），诚实拒收，不近似冒充。
 *
 * 基建复用 SketchOffsetTool：AccuSnap 取点 + 草图平面架 + Dynamics 预览 +
 * applyUpdate 乐观整体覆写 + id 播种/回滚 + 分阶段提示。
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
import { pickHitLocal, resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { resolveNearestOffsetSeedId } from './sketch-offset-logic.js';
import { DEFAULT_SLOT_WIDTH, SLOT_TOL, buildLineSlotDraft } from './sketch-slot-logic.js';
import type { SlotDraft } from './sketch-slot-logic.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';

const PREVIEW_COLOR = ColorDef.from(0, 120, 215);

export class SketchSlotTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Slot';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-slot';

  private _phase: 'pick' | 'preview' = 'pick';
  private _draft?: SlotDraft;
  private _seedId?: number;
  private _plane!: SketchPlaneFrame;
  private _nextId = 1;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this.initLocateElements(false, true);
    this._seedNextId();
    this.beginDynamics();
    this._outputPrompt('pickCurve');
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    this._draft = undefined;
    this._seedId = undefined;
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    if (this._hintText)
      publishSketchToolHint(this.toolId, this._hintText, this._cursorView);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    if (this._phase === 'preview')
      return this._commit();

    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    const hit = pickHitLocal(ev, this._plane);
    const seedId = resolveNearestOffsetSeedId(sketch.entities, hit);
    const seed = seedId === undefined ? undefined : sketch.entities.find((e) => e.id === seedId);
    if (!seed) {
      this._notify(i18next.t('partStudio.sketch.toasts.noSolvedCoords'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    if (seed.kind !== 'line') {
      // 首切片：live 仅采到单条直线；圆弧/圆/多段链证据缺失，明确拒收。
      this._notify(i18next.t('partStudio.sketch.slot.toasts.unsupportedKind'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    this._seedNextId();
    const built = buildLineSlotDraft({
      line: seed, entities: sketch.entities, width: DEFAULT_SLOT_WIDTH, startId: this._nextId,
    });
    if (!built.ok) {
      this._notify(i18next.t(this._buildErrorToastKey(built.error)), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    this._draft = built.draft;
    this._seedId = seed.id;
    this._phase = 'preview';
    this._outputPrompt('confirm');
    return EventHandled.Yes;
  }

  public override async onKeyTransition(wentDown: boolean, ev: KeyboardEvent): Promise<EventHandled> {
    if (!wentDown)
      return EventHandled.No;
    if (ev.key === 'Enter' && this._phase === 'preview') {
      ev.preventDefault();
      return this._commit();
    }
    return EventHandled.No;
  }

  /** 提交：一次 updateSketch（既有实体/约束原样在前，槽草稿追加）；失败零变更。 */
  private async _commit(): Promise<EventHandled> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || !this._draft) {
      this._notify(i18next.t('partStudio.sketch.create.toasts.systemNotReady'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    this._seedNextId();
    const seed = this._seedId === undefined ? undefined : sketch.entities.find((e) => e.id === this._seedId);
    if (!seed || seed.kind !== 'line') {
      this._notify(i18next.t('partStudio.sketch.slot.toasts.unsolvedLine'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const built = buildLineSlotDraft({
      line: seed, entities: sketch.entities, width: DEFAULT_SLOT_WIDTH, startId: this._nextId,
    });
    if (!built.ok) {
      this._notify(i18next.t(this._buildErrorToastKey(built.error)), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }
    const result = await sketchSystem.applyUpdate(
      [...sketch.entities, ...built.draft.entities],
      [...sketch.constraints, ...built.draft.constraints],
    );
    if (!result.ok) {
      this._notify(result.error ?? i18next.t('partStudio.sketch.create.toasts.updateFailed'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** 预览：槽草稿线/弧直接绘制（点不画；与 live 预览只显轮廓一致）。 */
  public override onDynamicFrame(_ev: BeButtonEvent, context: DynamicsContext): void {
    if (this._phase !== 'preview' || !this._draft) return;
    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    const points = new Map<number, { u: number; v: number }>();
    for (const e of this._draft.entities) {
      if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) points.set(e.id, { u: e.x, v: e.y });
    }
    const resolve = (ref: number | { x: number; y: number }): { u: number; v: number } | undefined =>
      typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
    for (const e of this._draft.entities) {
      if (e.kind === 'line') {
        const p1 = resolve(e.p1);
        const p2 = resolve(e.p2);
        if (!p1 || !p2) continue;
        builder.addLineString([this._plane.toWorld(p1), this._plane.toWorld(p2)]);
      } else if (e.kind === 'arc') {
        const c = resolve(e.center);
        if (!c || e.radius === undefined || e.startAngle === undefined || e.sweepAngle === undefined) continue;
        const arc = Arc3d.createXY(
          Point3d.create(c.u, c.v, 0),
          e.radius,
          AngleSweep.createStartSweepRadians(e.startAngle, e.sweepAngle),
        );
        arc.tryTransformInPlace(this._plane.localToWorld);
        builder.addArc(arc, false, false);
      }
    }
    context.addGraphic(builder.finish());
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._phase === 'preview') {
      this._phase = 'pick';
      this._draft = undefined;
      this._seedId = undefined;
      this._outputPrompt('pickCurve');
    }
    // 右键=画布菜单（首项「退出 <工具>」）；Esc 退出由基类处理。
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SketchSlotTool();
    if (!(await tool.run())) return this.exitTool();
  }

  private _buildErrorToastKey(error: 'unsupportedChain' | 'unsupportedKind' | 'zeroWidth' | 'unsolvedLine'): string {
    switch (error) {
      case 'unsupportedChain':
        return 'partStudio.sketch.slot.toasts.unsupportedChain';
      case 'unsupportedKind':
        return 'partStudio.sketch.slot.toasts.unsupportedKind';
      case 'zeroWidth':
        return 'partStudio.sketch.slot.toasts.zeroWidth';
      case 'unsolvedLine':
        return 'partStudio.sketch.slot.toasts.unsolvedLine';
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

  private _outputPrompt(stage: 'pickCurve' | 'confirm'): void {
    const text = i18next.t(`partStudio.sketch.slot.prompts.${stage}`);
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView)
      publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

let sketchSlotToolsRegistered = false;

export function registerSketchSlotTools(): void {
  if (sketchSlotToolsRegistered) return;
  sketchSlotToolsRegistered = true;
  IModelApp.tools.register(SketchSlotTool);
}

// SLOT_TOL 供工具/测试共享（保留导入以钉住容差常量来源）。
export { SLOT_TOL };
