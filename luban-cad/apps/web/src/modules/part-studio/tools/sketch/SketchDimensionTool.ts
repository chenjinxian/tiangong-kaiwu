/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 单尺寸工具（2026-11-02）：草图工具栏只有一个「尺寸」按钮，无下拉。
 * 同一工具按拾取动态推断（Onshape live）：
 * - 线/圆弧/圆：选中后点击空白处放置 → 长度/半径；
 * - 两个点/线实体：直接成距离；
 * - 点单独无尺寸；两个圆弧不支持距离（不伪造）。
 *
 * 值确认仍走既有 dimensionCandidate 事件桥（工具绝不直接提交——E-4 铁律）；
 * 面板收值后 applyUpdate。旧的距离/长度/半径三工具保留注册以兼容历史入口，
 * 但 ribbon 不再暴露（Onshape 无此飞菜单）。
 */
import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import i18next from 'i18next';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { pickHitLocal, resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { resolveNearestPick } from './sketch-constraint-logic.js';
import type { SketchPick } from './sketch-constraint-logic.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import { sketchToolEvents } from './sketch-tool-events.js';
import { inferDimensionCompletion } from './sketch-dimension-logic.js';
import type { DimensionCompletion } from './sketch-dimension-logic.js';

/** 实体拾取半径（屏幕像素）：空白放置点击不受本阈值影响。 */
const PICK_RADIUS_PIXELS = 8;

export class SketchDimensionTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';
  public static override toolId = 'Sketch.Dimension';
  public static override iconSpec = 'sketch-dimension-button';

  private _picks: SketchPick[] = [];
  private _plane!: SketchPlaneFrame;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this.initLocateElements(false, true);
    this._outputPrompt();
  }

  public override async onCleanup(): Promise<void> {
    clearSketchToolFeedback(this.toolId);
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
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }

    const hit = pickHitLocal(ev, this._plane);
    // 放置点击与实体拾取的分界：8px 对应的世界距离。旧「就近」无阈值会把
    // 远处空白点吸附成实体，导致长度/半径被误判成距离、放置点击丢失。
    const pixelSize = ev.viewport?.getPixelSizeAtPoint(ev.point) ?? 0.01;
    const pick = resolveNearestPick(sketch.entities, { x: hit.u, y: hit.v }, pixelSize * PICK_RADIUS_PIXELS);

    let placementClick = false;
    if (!pick) {
      placementClick = true;
      if (this._picks.length === 0) {
        this._notify(i18next.t('partStudio.sketch.toasts.noSolvedCoords'), OutputMessagePriority.Info);
        return EventHandled.Yes;
      }
    } else if (this._picks.length > 0 && this._picks.length < 2) {
      this._picks.push(pick);
    } else if (this._picks.length === 0) {
      this._picks.push(pick);
    } else {
      return EventHandled.Yes; // 已满两拾取，忽略第三次实体点击
    }

    const completion = inferDimensionCompletion(this._picks, placementClick);
    if (completion.kind === 'pending') {
      this._outputPrompt();
      return EventHandled.Yes;
    }
    if (completion.kind === 'invalid') {
      this._notify(
        i18next.t(`partStudio.sketch.dimension.unified.invalid.${completion.reason}`),
        OutputMessagePriority.Info,
      );
      this._picks = [];
      this._outputPrompt();
      return EventHandled.Yes;
    }

    // Onshape 在完成点击的位置弹出尺寸值确认框（不是左侧常驻面板）。
    await this.emitCandidate(completion, { x: ev.viewPoint.x, y: ev.viewPoint.y });
    return EventHandled.No;
  }

  private async emitCandidate(
    completion: Exclude<DimensionCompletion, { kind: 'pending' } | { kind: 'invalid' }>,
    anchor: { x: number; y: number },
  ): Promise<void> {
    sketchToolEvents.emit('dimensionCandidate', {
      kind: completion.kind,
      refs: completion.refs,
      entityIds: completion.entityIds,
      anchor,
    });
    await this.exitTool();
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._picks.length > 0) {
      this._picks = [];
      this._outputPrompt();
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  public override async onRestartTool(): Promise<void> {
    const tool = new SketchDimensionTool();
    if (!(await tool.run())) return this.exitTool();
  }

  private _outputPrompt(): void {
    const key = this._promptKey();
    const text = i18next.t(key);
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView) publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _promptKey(): string {
    const first = this._picks[0];
    if (!first) return 'partStudio.sketch.dimension.unified.prompts.selectEntity';
    if (first.kind === 'circle' || first.kind === 'arc')
      return 'partStudio.sketch.dimension.unified.prompts.placeRadius';
    if (first.kind === 'point')
      return 'partStudio.sketch.dimension.unified.prompts.secondEntity';
    return 'partStudio.sketch.dimension.unified.prompts.secondOrPlaceLength';
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

let unifiedDimensionRegistered = false;
/** 注册单尺寸工具（幂等）；旧三工具仍由 registerSketchDimensionTools 注册。 */
export function registerUnifiedDimensionTool(): void {
  if (unifiedDimensionRegistered) return;
  IModelApp.tools.register(SketchDimensionTool);
  unifiedDimensionRegistered = true;
}
