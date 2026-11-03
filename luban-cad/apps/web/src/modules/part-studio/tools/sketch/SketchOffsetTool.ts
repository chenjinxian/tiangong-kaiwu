/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图偏移工具（M6-c T4，toolId `Sketch.Offset`）——Onshape 同构（实现路径
 * 权威：.superpowers/sdd/onshape-tutorial2-analysis/TUTORIAL2-FULL-STEPS.md
 * §3.1；Tutorial 2 第 7 笔「大弧+左腿+顶切线一次成组」的复刻通道）。
 *
 * 交互态（两相）：
 * 1. 选链：点击起始实体（就近分辨——**弧参与**，resolveNearestOffsetSeedId，
 *   约束工具分辨器的偏移面外延）→ collectOffsetChain 沿焊接图自动扩展相接链
 *   （coincident/共享端点/弧端点几何重合三通道，sketch-offset-logic.ts）；
 *   circle/point 种子 → 拒收 toast「偏移暂只支持线和圆弧」。
 * 2. 定侧定距：橡皮筋预览（Dynamics 通道，SketchCreateTool 同款帧驱动）——
 *   光标到种子实体的垂距 = 偏移距 d，光标在每实体哪侧 = 该实体偏移方向
 *   （线=法向两侧；弧=圆内外）；第二点确认 → buildOffsetDraft 闭式草稿 →
 *   applyUpdate 乐观整体覆写 → 拒收回滚 id + 错误透出（工具存活可再点），
 *   成功 exitTool。
 *
 * 基建复用（SketchCreateTool/SketchAddConstraintTool 同款，见各文件头）：
 * 模块级 accessor getSketchSystem / AccuSnap 热捕捉取点 + 草图平面架投影
 * （pickHitLocal）/ id maxId+1 播种 / outputMessage toast + outputPrompt 提示
 * / 右键两层取消（place→pick→exit）/ onRestartTool 换新实例。
 * 几何/约束展开全在 sketch-offset-logic.ts 纯逻辑模块（零 core 依赖，可测）。
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
import type { GraphicBuilder } from '@itwin/core-frontend';
import { AngleSweep, Arc3d, Point3d } from '@itwin/core-geometry';
import { ColorDef, LinePixels } from '@itwin/core-common';
import i18next from 'i18next';
import type { SketchEntityDto } from '@luban-cad/shared';
import { getSketchSystem } from '../../hooks/useSketchSystem.js';
import { pickHitLocal, resolveSketchPlaneFrame } from './SketchAddConstraintTool.js';
import type { SketchPlaneFrame, SketchPoint2 } from './sketch-plane.js';
import {
  OFFSET_TOL,
  buildOffsetDraft,
  collectOffsetChain,
  offsetMeasureDistance,
  resolveNearestOffsetSeedId,
} from './sketch-offset-logic.js';
import type { OffsetBuildError, OffsetChain } from './sketch-offset-logic.js';
import { sketchToolEvents } from './sketch-tool-events.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';

/** 预览线色（SketchCreateTool 同款——M6-c UI 1:1 批统一校准）。 */
const PREVIEW_COLOR = ColorDef.from(0, 120, 215);

export class SketchOffsetTool extends PrimitiveTool {
  public static override toolId = 'Sketch.Offset';
  public static override namespace = 'LubanCad';
  public static override iconSpec = 'icon-offset';

  /** 交互相：pick=选起始实体；place=定侧定距（链已就绪）。 */
  private _phase: 'pick' | 'place' = 'pick';
  /** 已选链（collectOffsetChain 产出；place 相非空）。 */
  private _chain?: OffsetChain;
  /** 种子实体（偏移距量取基准——光标到它的垂距即 d）。 */
  private _seed?: SketchEntityDto;
  /** place 相确认点的光标命中（方向裁决与精确距离输入后的草稿构建共用）。 */
  private _pendingHit?: SketchPoint2;
  /** 草图平面架（onPostInstall 解析一次）。 */
  private _plane!: SketchPlaneFrame;
  /** 实体/约束 id 计数器（maxId+1；提交前重播种，拒收回滚）。 */
  private _nextId = 1;
  /** 光标视口坐标（标注提示跟随光标）。 */
  private _cursorView?: { x: number; y: number };
  /** 当前阶段提示文本（onMouseMotion 重发）。 */
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this._plane = resolveSketchPlaneFrame();
    // 不 locate 元素但开启 AccuSnap 吸附（约束/绘制工具同款——缺省会关吸附）。
    this.initLocateElements(false, true);
    this._seedNextId();
    this.beginDynamics();
    this._outputPrompt('pickChain');
  }

  public override async onCleanup(): Promise<void> {
    if (this.isDynamicsStarted) this.endDynamics();
    clearSketchToolFeedback(this.toolId);
    this._chain = undefined;
    this._seed = undefined;
    this._pendingHit = undefined;
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
      this._notify(i18next.t('partStudio.sketch.toasts.notOpenOrEmpty'), OutputMessagePriority.Error);
      return EventHandled.Yes;
    }

    const hit = pickHitLocal(ev, this._plane);

    if (this._phase === 'pick') {
      // 种子分辨：就近实体（弧参与；无解算坐标 → undefined）。
      const seedId = resolveNearestOffsetSeedId(sketch.entities, hit);
      if (seedId === undefined) {
        this._notify(i18next.t('partStudio.sketch.toasts.noSolvedCoords'), OutputMessagePriority.Info);
        return EventHandled.Yes;
      }
      const seed = sketch.entities.find((e) => e.id === seedId);
      // 只支持线+弧（circle/point 种子 → 拒收；诚实降级——契约无样条实体）。
      if (!seed || (seed.kind !== 'line' && seed.kind !== 'arc')) {
        this._notify(i18next.t('partStudio.sketch.offset.toasts.unsupportedKind'), OutputMessagePriority.Info);
        return EventHandled.Yes;
      }
      // 相接链自动扩展（焊接图连通闭包；seed 非线/弧已挡）。
      // 切线链：只在光滑相接处扩展（Tutorial 2 基底角不把矩形拉进偏移链）。
      const collected = collectOffsetChain(sketch.entities, sketch.constraints, seed.id, { tangentOnly: true });
      if (!collected.ok) {
        this._notify(i18next.t('partStudio.sketch.offset.toasts.unsupportedKind'), OutputMessagePriority.Info);
        return EventHandled.Yes;
      }
      this._chain = collected.chain;
      this._seed = seed;
      this._phase = 'place';
      this._outputPrompt('confirmSide');
      return EventHandled.Yes;
    }

    // place 相：光标到种子实体的垂距 = 偏移距 d；d≈0（点在实体上）不消耗。
    const distance = this._seed ? offsetMeasureDistance(this._seed, sketch.entities, hit) : undefined;
    if (distance === undefined || !(distance > OFFSET_TOL)) {
      this._notify(i18next.t('partStudio.sketch.offset.toasts.zeroDistance'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    // 先按光标距做一次闭式校验（退化位形在候选之前拒收），但不提交——
    // v1.19：光标只定侧，精确距由面板输入框确认（Onshape 偏移对话框同构；
    // 鼠标距含亚像素误差，直接落库会与后续 DISTANCE 尺寸冲突）。
    const validation = buildOffsetDraft({
      chain: this._chain!,
      entities: sketch.entities,
      distance,
      cursor: hit,
      startId: this._nextId,
    });
    if (!validation.ok) {
      this._notify(i18next.t(this._buildErrorToastKey(validation.error)), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    this._pendingHit = hit;
    this._outputPrompt('enterDistance');
    sketchToolEvents.emit('offsetCandidate', {
      measuredDistance: distance,
      commit: (value) => this._commitOffset(value),
      anchor: { x: ev.viewPoint.x, y: ev.viewPoint.y },
    });
    return EventHandled.Yes;
  }

  /** 面板确认精确偏移距 → 同侧构建草稿并乐观提交；undefined=成功（工具退出）。 */
  private async _commitOffset(distance: number): Promise<string | undefined> {
    const sketchSystem = getSketchSystem();
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || !this._chain || !this._pendingHit)
      return i18next.t('partStudio.sketch.create.toasts.systemNotReady');
    if (!(distance > OFFSET_TOL)) return i18next.t('partStudio.sketch.offset.toasts.zeroDistance');

    this._seedNextId();
    const idBase = this._nextId;
    const built = buildOffsetDraft({
      chain: this._chain,
      entities: sketch.entities,
      distance,
      cursor: this._pendingHit,
      startId: idBase,
    });
    if (!built.ok) {
      this._nextId = idBase;
      return i18next.t(this._buildErrorToastKey(built.error));
    }

    // 乐观提交（整体覆写语义）：既有实体/约束原样在前，偏移草稿追加在后。
    const result = await sketchSystem.applyUpdate(
      [...sketch.entities, ...built.draft.entities],
      [...sketch.constraints, ...built.draft.constraints],
    );
    if (!result.ok) {
      // 后端拒收零变更（库侧无写入）——本地回滚 = 丢弃草稿 + id 计数器复原；
      // 拒收文本原样透出，面板表单保持（可改值再确认）。
      this._nextId = idBase;
      return result.error ?? i18next.t('partStudio.sketch.create.toasts.updateFailed');
    }

    await this.exitTool();
    return undefined;
  }

  /** Dynamics 帧回调（place 相）：光标侧+垂距 → 闭式偏移预览（预览即所得）。 */
  public override onDynamicFrame(ev: BeButtonEvent, context: DynamicsContext): void {
    if (this._phase !== 'place' || !this._chain || !this._seed) return;
    const sketch = getSketchSystem()?.activeSketch;
    if (!sketch) return;
    const cursor = pickHitLocal(ev, this._plane);
    const distance = offsetMeasureDistance(this._seed, sketch.entities, cursor);
    if (distance === undefined || !(distance > OFFSET_TOL)) return;
    const built = buildOffsetDraft({
      chain: this._chain,
      entities: sketch.entities,
      distance,
      cursor,
      startId: this._nextId, // 预览不消耗 id（提交前 _seedNextId 重播种）
    });
    if (!built.ok) return; // 退化位形（弧内偏坍缩等）不绘制

    // 草稿内坐标索引（新线 p1/p2、新弧 center 引用的都是草稿内新 point）。
    const points = new Map<number, { u: number; v: number }>();
    for (const e of built.draft.entities) {
      if (e.kind === 'point' && e.x !== undefined && e.y !== undefined) points.set(e.id, { u: e.x, v: e.y });
    }

    const builder = context.createGraphic({ type: GraphicType.WorldOverlay });
    builder.setSymbology(PREVIEW_COLOR, PREVIEW_COLOR, 2, LinePixels.Solid);
    for (const e of built.draft.entities) {
      const resolvePoint = (ref: number | { x: number; y: number }): { u: number; v: number } | undefined =>
        typeof ref === 'number' ? points.get(ref) : { u: ref.x, v: ref.y };
      if (e.kind === 'line') {
        const p1 = resolvePoint(e.p1);
        const p2 = resolvePoint(e.p2);
        if (!p1 || !p2) continue;
        builder.addLineString([this._plane.toWorld(p1), this._plane.toWorld(p2)]);
      } else if (e.kind === 'arc') {
        const c = resolvePoint(e.center);
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
    if (this._phase === 'place') {
      // 两层取消语义（M3-b）：place → 弃链回 pick（工具存活）；再右键退出。
      this._phase = 'pick';
      this._chain = undefined;
      this._seed = undefined;
      this._pendingHit = undefined;
      this._outputPrompt('pickChain');
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** PrimitiveTool 抽象槽位：外部事件要求重启时换新实例重挂（无选项需透传）。 */
  public override async onRestartTool(): Promise<void> {
    const tool = new SketchOffsetTool();
    if (!(await tool.run())) return this.exitTool(); // 新实例拒装不得留旧实例
  }

  /** 构建拒收 → toast 键（zeroDistance/degenerateRadius/unsupportedKind）。 */
  private _buildErrorToastKey(error: OffsetBuildError): string {
    switch (error) {
      case 'degenerateRadius':
        return 'partStudio.sketch.offset.toasts.degenerateRadius';
      case 'zeroDistance':
        return 'partStudio.sketch.offset.toasts.zeroDistance';
      case 'unsupportedKind':
        return 'partStudio.sketch.offset.toasts.unsupportedKind';
    }
  }

  /** 按 activeSketch 现有全部实体/约束 id 重播种（maxId+1，SketchCreateTool 同式）。 */
  private _seedNextId(): void {
    const sketch = getSketchSystem()?.activeSketch;
    let max = 0;
    if (sketch) {
      for (const e of sketch.entities) max = Math.max(max, e.id);
      for (const c of sketch.constraints) max = Math.max(max, c.id);
    }
    this._nextId = Math.max(this._nextId, max + 1);
  }

  /** 分阶段提示（调用时翻译——i18next 单例直取，回调内不吃闭包旧语）。 */
  private _outputPrompt(stage: 'pickChain' | 'confirmSide' | 'enterDistance'): void {
    const text = i18next.t(`partStudio.sketch.offset.prompts.${stage}`);
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView)
      publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  /** 错误/信息面走 outputMessage（呈现桥 ViewerNotifications → iTwinUI toaster）。 */
  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

/**
 * 注册草图偏移工具（M6-c T4；幂等——模块级 flag）。注册点=PartStudioPage
 * 工具注册编排（registerSketchTools/registerSketchConstraintTools/
 * registerSketchDimensionTools 之后同 try 块）；懒引与幂等语义见
 * registerSketchTools（SketchCreateTool.ts）。
 */
let offsetToolRegistered = false;
export function registerSketchOffsetTools(): void {
  if (offsetToolRegistered) return;
  IModelApp.tools.register(SketchOffsetTool);
  offsetToolRegistered = true;
}
