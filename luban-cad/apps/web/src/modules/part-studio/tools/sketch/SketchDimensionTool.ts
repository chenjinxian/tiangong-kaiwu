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
 *
 * W21（2026-11-16 live S1c）：点击已带尺寸的几何（同实体/同一对引用）不追加
 * 第二条尺寸——发候选时带 `existingConstraintId`/`existingValue`（种类取既有
 * 约束，圆/弧半径↔直径等价），值弹层改调 `applyConstraintValue` 原地更新。
 *
 * W22（2026-11-16 live）：两条**非平行**线拾取推断 `angle`（值对话框按度预填，
 * 提交契约仍为弧度）；平行线保持既有 `distance`。平行判定复用本模块既有
 * `lineAngleDeg`（`measureSketchDimension('angle', …)`），阈值判定在
 * `sketch-dimension-logic`。命中既有 angle 约束时沿用 W21 路径（预填显示度、
 * 确认时换算弧度原地改值）。
 */
import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
  NotifyMessageDetails,
  OutputMessagePriority,
  PrimitiveTool,
} from '@itwin/core-frontend';
import type { SketchConstraintDto, SketchEntityDto, SketchRef } from '@luban-cad/shared';
import i18next from 'i18next';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { pickHitLocal, resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame } from './sketch-plane.js';
import { resolveNearestPick } from './sketch-constraint-logic.js';
import type { SketchPick } from './sketch-constraint-logic.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import { sketchToolEvents } from './sketch-tool-events.js';
import type { SketchDimensionKind } from './sketch-tool-events.js';
import { findExistingDimensionConstraint, inferDimensionCompletion } from './sketch-dimension-logic.js';
import type { DimensionCompletion, ExistingDimensionConstraint } from './sketch-dimension-logic.js';
import { dimensionConstraintDisplayValue } from '../../internal/sketch-dimension-value.js';

/** 实体拾取半径（屏幕像素）：空白放置点击不受本阈值影响。 */
const PICK_RADIUS_PIXELS = 8;

// ---------------------------------------------------------------------------
// 值确认框实测值（2026-11-15 Onshape live E1）：候选弹出时预填已解算尺寸，
// 用户确认即用该值。纯几何、显示单位（长度/半径/直径 mm，角度 °）；
// 解算坐标缺失/形态不可测 → undefined（不猜、不伪造）。
// ---------------------------------------------------------------------------

/** 尺寸候选可测量种类（W22 起 angle 已是正式候选通道：两非平行线）。 */
export type MeasurableDimensionKind = SketchDimensionKind;

interface MeasuredPoint { x: number; y: number }
type MeasuredItem =
  | { kind: 'point'; p: MeasuredPoint }
  | { kind: 'line'; a: MeasuredPoint; b: MeasuredPoint }
  | { kind: 'circle'; radius: number };

const MEASURE_EPS = 1e-9;

function finitePoint(x: number | undefined, y: number | undefined): MeasuredPoint | undefined {
  return x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function resolveInlinePoint(
  ref: number | { x: number; y: number } | undefined,
  points: ReadonlyMap<number, MeasuredPoint>,
): MeasuredPoint | undefined {
  if (ref === undefined) return undefined;
  return typeof ref === 'number' ? points.get(ref) : finitePoint(ref.x, ref.y);
}

function validRadius(entity: SketchEntityDto | undefined): number | undefined {
  if (!entity || (entity.kind !== 'circle' && entity.kind !== 'arc')) return undefined;
  return entity.radius !== undefined && Number.isFinite(entity.radius) && entity.radius > 0 ? entity.radius : undefined;
}

/** 整实体引用（数字 id）：点/线/圆整引用；样条无尺寸语义。 */
function resolveWholeEntity(entity: SketchEntityDto, points: ReadonlyMap<number, MeasuredPoint>): MeasuredItem | undefined {
  switch (entity.kind) {
    case 'point': {
      const p = finitePoint(entity.x, entity.y);
      return p ? { kind: 'point', p } : undefined;
    }
    case 'line': {
      const a = resolveInlinePoint(entity.p1, points);
      const b = resolveInlinePoint(entity.p2, points);
      return a && b ? { kind: 'line', a, b } : undefined;
    }
    case 'circle':
    case 'arc': {
      const radius = validRadius(entity);
      return radius === undefined ? undefined : { kind: 'circle', radius };
    }
    case 'spline':
      return undefined;
  }
  return undefined;
}

/** 子实体引用（start/end/center/point/handle）→ 局部点。 */
function resolveEntityPart(
  entity: SketchEntityDto,
  ref: Exclude<SketchRef, number | { origin: true }>,
  points: ReadonlyMap<number, MeasuredPoint>,
): MeasuredItem | undefined {
  switch (ref.part) {
    case 'center': {
      if (entity.kind !== 'circle' && entity.kind !== 'arc') return undefined;
      const center = resolveInlinePoint(entity.center, points);
      return center ? { kind: 'point', p: center } : undefined;
    }
    case 'start':
    case 'end': {
      if (entity.kind === 'point') {
        const p = finitePoint(entity.x, entity.y);
        return p ? { kind: 'point', p } : undefined;
      }
      if (entity.kind === 'line') {
        const p = resolveInlinePoint(ref.part === 'start' ? entity.p1 : entity.p2, points);
        return p ? { kind: 'point', p } : undefined;
      }
      if (entity.kind === 'arc') {
        const center = resolveInlinePoint(entity.center, points);
        const radius = validRadius(entity);
        if (!center || radius === undefined || entity.startAngle === undefined || entity.sweepAngle === undefined)
          return undefined;
        const angle = ref.part === 'start' ? entity.startAngle : entity.startAngle + entity.sweepAngle;
        return { kind: 'point', p: { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) } };
      }
      if (entity.kind === 'spline') {
        const control = entity.controlPoints;
        const p = ref.part === 'start' ? control[0] : control[control.length - 1];
        return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { kind: 'point', p: { x: p.x, y: p.y } } : undefined;
      }
      return undefined;
    }
    case 'point':
    case 'handle': {
      if (entity.kind !== 'spline') return undefined;
      const source = ref.part === 'point' ? (entity.fitPoints ?? entity.controlPoints) : entity.controlPoints;
      const p = source[ref.index];
      return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { kind: 'point', p: { x: p.x, y: p.y } } : undefined;
    }
  }
  return undefined;
}

function resolveMeasuredItem(
  ref: SketchRef,
  entities: ReadonlyMap<number, SketchEntityDto>,
  points: ReadonlyMap<number, MeasuredPoint>,
): MeasuredItem | undefined {
  if (typeof ref === 'number') {
    const entity = entities.get(ref);
    return entity ? resolveWholeEntity(entity, points) : undefined;
  }
  if ('origin' in ref) return { kind: 'point', p: { x: 0, y: 0 } };
  const entity = entities.get(ref.entity);
  return entity ? resolveEntityPart(entity, ref, points) : undefined;
}

/** 点到无限长直线距离（点-线尺寸语义，不是线段截断）。 */
function pointToLineDistance(p: MeasuredPoint, line: { a: MeasuredPoint; b: MeasuredPoint }): number | undefined {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > MEASURE_EPS)) return undefined;
  return Math.abs((p.x - line.a.x) * dy - (p.y - line.a.y) * dx) / len;
}

/** 两平行线垂距；非平行/退化 → undefined（距离语义未定，不猜）。 */
function parallelLineDistance(
  a: { a: MeasuredPoint; b: MeasuredPoint },
  b: { a: MeasuredPoint; b: MeasuredPoint },
): number | undefined {
  const adx = a.b.x - a.a.x;
  const ady = a.b.y - a.a.y;
  const bdx = b.b.x - b.a.x;
  const bdy = b.b.y - b.a.y;
  const lenA = Math.hypot(adx, ady);
  const lenB = Math.hypot(bdx, bdy);
  if (!(lenA > MEASURE_EPS) || !(lenB > MEASURE_EPS)) return undefined;
  if (Math.abs(adx * bdy - ady * bdx) > MEASURE_EPS * lenA * lenB) return undefined;
  return Math.abs((b.a.x - a.a.x) * ady - (b.a.y - a.a.y) * adx) / lenA;
}

/** 两线夹角（度，0–90 锐角口径；方向向量符号不参与）。 */
function lineAngleDeg(a: { a: MeasuredPoint; b: MeasuredPoint }, b: { a: MeasuredPoint; b: MeasuredPoint }): number | undefined {
  const adx = a.b.x - a.a.x;
  const ady = a.b.y - a.a.y;
  const bdx = b.b.x - b.a.x;
  const bdy = b.b.y - b.a.y;
  const lenA = Math.hypot(adx, ady);
  const lenB = Math.hypot(bdx, bdy);
  if (!(lenA > MEASURE_EPS) || !(lenB > MEASURE_EPS)) return undefined;
  const cos = Math.abs(adx * bdx + ady * bdy) / (lenA * lenB);
  return (Math.acos(Math.min(1, Math.max(0, cos))) * 180) / Math.PI;
}

/** 距离尺寸实测值：点-点/点-线/平行线；其余形态 undefined。 */
function measureDistance(a: MeasuredItem, b: MeasuredItem): number | undefined {
  if (a.kind === 'point' && b.kind === 'point') return Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y);
  if (a.kind === 'point' && b.kind === 'line') return pointToLineDistance(a.p, b);
  if (a.kind === 'line' && b.kind === 'point') return pointToLineDistance(b.p, a);
  if (a.kind === 'line' && b.kind === 'line') return parallelLineDistance(a, b);
  return undefined;
}

/**
 * 尺寸候选实测值（显示单位）：length=线长 mm；distance=点-点/点-线/平行线 mm；
 * radius=半径 mm；diameter=2×半径 mm；angle=两线夹角 °。
 * 引用解析失败或几何退化 → undefined（值确认框保持空输入 + 占位）。
 */
export function measureSketchDimension(
  kind: MeasurableDimensionKind,
  refs: readonly SketchRef[],
  entities: readonly SketchEntityDto[],
): number | undefined {
  const entityMap = new Map<number, SketchEntityDto>();
  const points = new Map<number, MeasuredPoint>();
  for (const entity of entities) {
    entityMap.set(entity.id, entity);
    if (entity.kind === 'point') {
      const p = finitePoint(entity.x, entity.y);
      if (p) points.set(entity.id, p);
    }
  }
  const resolve = (ref: SketchRef | undefined): MeasuredItem | undefined =>
    ref === undefined ? undefined : resolveMeasuredItem(ref, entityMap, points);

  switch (kind) {
    case 'length': {
      const item = resolve(refs[0]);
      return item?.kind === 'line' ? Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y) : undefined;
    }
    case 'radius': {
      const item = resolve(refs[0]);
      return item?.kind === 'circle' ? item.radius : undefined;
    }
    case 'diameter': {
      const item = resolve(refs[0]);
      return item?.kind === 'circle' ? item.radius * 2 : undefined;
    }
    case 'distance': {
      const a = resolve(refs[0]);
      const b = resolve(refs[1]);
      return a && b ? measureDistance(a, b) : undefined;
    }
    case 'angle': {
      const a = resolve(refs[0]);
      const b = resolve(refs[1]);
      return a?.kind === 'line' && b?.kind === 'line' ? lineAngleDeg(a, b) : undefined;
    }
  }
}

export class SketchDimensionTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';
  public static override toolId = 'Sketch.Dimension';
  public static override iconSpec = 'sketch-dimension-button';

  private _picks: SketchPick[] = [];
  private _plane!: SketchPlaneFrame;
  private _cursorView?: { x: number; y: number };
  private _hintText?: string;
  /** 值弹层等待态（E1 链式标注）：弹层打开期间工具保持安装、忽略画布拾取。 */
  private _awaitingPopup = false;
  /** dimensionPopupClosed 订阅退订（弹层关闭/清理即退订，防陈旧监听）。 */
  private _offPopupClosed?: () => void;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    this.initLocateElements(false, true);
    this._outputPrompt();
  }

  public override async onCleanup(): Promise<void> {
    this._clearPopupWait();
    clearSketchToolFeedback(this.toolId);
    await super.onCleanup();
  }

  public override async onMouseMotion(ev: BeButtonEvent): Promise<void> {
    await super.onMouseMotion(ev);
    this._cursorView = { x: ev.viewPoint.x, y: ev.viewPoint.y };
    if (this._hintText) publishSketchToolHint(this.toolId, this._hintText, this._cursorView);
  }

  public override async onDataButtonDown(ev: BeButtonEvent): Promise<EventHandled> {
    // 值弹层打开期间忽略画布拾取（Onshape：弹层模态收值，工具保持安装）。
    if (this._awaitingPopup) return EventHandled.Yes;

    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }

    // 2026-11-16 W19：工具在弹层关闭后保持安装，可能在切换活动草图后继续拾取；
    // 每次拾取重新解析当前草图平面，避免沿用上一张草图的投影面（W19 评审）。
    this._plane = resolveSketchPlaneFrame();
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

    // W22：两线拾取时用既有 `lineAngleDeg`（经 measureSketchDimension 的 angle
    // 通道）测夹角，供推断层判定非平行 → angle / 平行 → distance；几何不可测
    //（引用未解算）→ undefined，保持旧 distance 行为。
    const twoLineAngleDeg = this._picks.length === 2
      && this._picks[0]!.kind === 'line'
      && this._picks[1]!.kind === 'line'
      ? measureSketchDimension(
          'angle',
          [this._picks[0]!.ref, this._picks[1]!.ref],
          sketch.entities,
        )
      : undefined;
    const completion = inferDimensionCompletion(this._picks, placementClick, twoLineAngleDeg);
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
    await this.emitCandidate(
      completion,
      { x: ev.viewPoint.x, y: ev.viewPoint.y },
      sketch.entities,
      sketch.constraints,
    );
    return EventHandled.No;
  }

  private async emitCandidate(
    completion: Exclude<DimensionCompletion, { kind: 'pending' } | { kind: 'invalid' }>,
    anchor: { x: number; y: number },
    entities: readonly SketchEntityDto[],
    constraints: readonly SketchConstraintDto[],
  ): Promise<void> {
    // W21（live S1c）：同一实体/同一对引用已有尺寸 → 打开既有尺寸值对话框
    // （既有值预填、确认原地改值），不测量、不追加第二条（避免过约束）。
    const existing = findExistingDimensionConstraint(constraints, completion);
    if (existing) {
      this._emitExistingCandidate(existing, completion, anchor);
      this._awaitPopupClose();
      return;
    }
    // 实测值只做输入框初值；提交仍以用户确认的输入文本为准（无契约变更）。
    const measuredValue = measureSketchDimension(completion.kind, completion.refs, entities);
    sketchToolEvents.emit('dimensionCandidate', {
      kind: completion.kind,
      refs: completion.refs,
      entityIds: completion.entityIds,
      anchor,
      ...(measuredValue !== undefined ? { measuredValue } : {}),
    });
    // W19（2026-11-16 live）：发候选后保持本工具安装（不立即 exitTool），
    // 弹层打开期间忽略画布拾取，关闭后恢复拾取。
    this._awaitPopupClose();
  }

  /**
   * W21：既有尺寸候选——种类取**既有约束**（圆/弧半径↔直径等价时对话框与
   * 提交都按既有种类走），值取约束值（显示单位，angle 弧度→度）。不测新值。
   */
  private _emitExistingCandidate(
    existing: ExistingDimensionConstraint,
    completion: Exclude<DimensionCompletion, { kind: 'pending' } | { kind: 'invalid' }>,
    anchor: { x: number; y: number },
  ): void {
    // W22：推断现在也产生 angle（两非平行线），既有种类全部落在
    // SketchDimensionKind 内；对话框/提交一律按既有约束种类走（圆/弧
    // 半径↔直径等价时也不改判）。既有 angle 的 existingValue 为显示度，
    // 弧度换算在值弹层确认时完成。
    const kind: SketchDimensionKind = existing.kind;
    const existingValue = dimensionConstraintDisplayValue(existing);
    sketchToolEvents.emit('dimensionCandidate', {
      kind,
      refs: [...existing.refs],
      entityIds: completion.entityIds,
      anchor,
      existingConstraintId: existing.id,
      ...(existingValue !== undefined ? { existingValue } : {}),
    });
  }

  /**
   * 等待值弹层关闭（W19，2026-11-16 live）：订阅一次 dimensionPopupClosed；
   * 到达时清等待态、退订、清空拾取并恢复首拾取提示——**保持安装**，下一次
   * 拾取直接开始下一个尺寸（live：✓/✗ 关闭后工具仍 is-active，无需重点
   * ribbon）。重复调用先退旧订阅（重启/重装不留陈旧监听）。
   */
  private _awaitPopupClose(): void {
    this._offPopupClosed?.();
    this._awaitingPopup = true;
    this._offPopupClosed = sketchToolEvents.on('dimensionPopupClosed', () => {
      this._clearPopupWait();
      this._picks = [];
      this._outputPrompt();
    });
  }

  /** 清理等待态（幂等；onCleanup/事件到达时调用）。 */
  private _clearPopupWait(): void {
    this._awaitingPopup = false;
    this._offPopupClosed?.();
    this._offPopupClosed = undefined;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._picks.length > 0) {
      this._picks = [];
      this._outputPrompt();
      return EventHandled.Yes;
    }
    // Onshape live 2026-11-13：右键=画布菜单（首项「退出 <工具>」），不直接退出；Esc 仍退出。
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
