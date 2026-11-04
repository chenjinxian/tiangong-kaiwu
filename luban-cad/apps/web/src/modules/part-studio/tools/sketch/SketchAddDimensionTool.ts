/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图尺寸创建工具×2（M6-b T5）：distance / radius——拾取 + 值确认桥。
 *
 * 语义骨架移植自退役仓 apps/web/features/sketch/tools/SketchAddDimensionTool.ts
 * （M3-b T5，溯源注记）。**尺寸不直接提交铁律**原样保留（裁决 E-4）：工具
 * 满槽后经事件桥（sketch-tool-events.ts，M3-b sketchToolEvents 同构——拆独立
 * 模块的理由见该文件头）把**候选约束**发给面板，面板收值（>0 校验）并走
 * applyUpdate 提交；工具只发候选，**绝不直接提交**，发完即 exitTool。
 *
 * 槽位规则与后端 SolverTypes.ts 冻结契约一致：distance=2 point、radius=
 * 1 circle（value>0 由面板收）。槽位校验/右键两层取消与 SketchAddConstraintTool
 * 全同（就近实体分辨/取点投影/模块级 accessor/notifications 通道均复用其基建，
 * 见该文件头溯源注记，此处不重复）。
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
import type { SketchPick, SketchPickKind } from './sketch-constraint-logic.js';
import { sketchToolEvents } from './sketch-tool-events.js';
import type { SketchDimensionCandidate, SketchDimensionKind } from './sketch-tool-events.js';
import { clearSketchToolFeedback, publishSketchToolHint } from './sketch-tool-feedback.js';
import { registerUnifiedDimensionTool } from './SketchDimensionTool.js';

export { sketchToolEvents } from './sketch-tool-events.js';
export type { SketchDimensionCandidate, SketchDimensionKind } from './sketch-tool-events.js';


/** 槽判定产出（acceptPick 同构）。 */
export interface DimensionPickVerdict {
  ok: boolean;
  complete: boolean;
}

/**
 * 槽位形状表（SolverTypes 冻结契约）：
 * - distance：2 个 point/line 组合（point+point / point+line / line+line）；
 * - radius：1 个 circle/arc；
 * - length：1 条 line。
 * value 不在工具侧——面板收值提交。
 */
export type DimensionPickKind = 'point' | 'line' | 'circle' | 'arc';
export const DIMENSION_SLOTS: Record<SketchDimensionKind, { kinds: readonly DimensionPickKind[]; count: number }> = {
  distance: { kinds: ['point', 'line'], count: 2 },
  radius: { kinds: ['circle', 'arc'], count: 1 },
  diameter: { kinds: ['circle', 'arc'], count: 1 },
  length: { kinds: ['line'], count: 1 },
};

/** 槽位接收判定（纯函数，测试直击）。 */
export function acceptDimensionPick(kind: SketchDimensionKind, pickedCount: number, next: SketchPickKind): DimensionPickVerdict {
  const { kinds, count } = DIMENSION_SLOTS[kind];
  if (!kinds.includes(next as DimensionPickKind)) return { ok: false, complete: false };
  return { ok: true, complete: pickedCount + 1 >= count };
}

/** 分阶段提示键（调用时翻译）。 */
export function pickDimensionPrompt(kind: SketchDimensionKind, pickedCount: number): { key: string; params: Record<string, unknown> } {
  const label = i18next.t(`partStudio.sketch.vocabulary.dimensionKinds.${kind}`);
  const { kinds, count } = DIMENSION_SLOTS[kind];
  const slotLabel = kinds.map((k) => i18next.t(`partStudio.sketch.vocabulary.entityKinds.${k}`)).join('/');
  if (pickedCount === 0) {
    return { key: 'partStudio.sketch.dimension.prompts.first', params: { label, slot: slotLabel, count } };
  }
  return {
    key: 'partStudio.sketch.dimension.prompts.next',
    params: { label, slot: slotLabel, remaining: count - pickedCount },
  };
}

/**
 * 草图尺寸创建工具抽象基类：满槽 → 发 dimensionCandidate 事件移交面板
 * （工具侧零提交——值确认桥的铁律）。
 */
export abstract class SketchAddDimensionTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';

  /** 尺寸种类（子类固定）。 */
  protected abstract readonly dimensionKind: SketchDimensionKind;

  /** 已拾取结构化引用（满槽 → 发候选事件 → 退出）。 */
  private _picks: SketchPick[] = [];
  /** 草图平面架（onPostInstall 解析：store 当前活动草图 plane → 缺省 XY@z=0）。 */
  private _plane!: SketchPlaneFrame;
  /** 光标视口坐标（标注提示跟随光标）。 */
  private _cursorView?: { x: number; y: number };
  /** 当前阶段提示文本（onMouseMotion 重发）。 */
  private _hintText?: string;

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    // 平面架：取点投影数据源（与约束工具同式，SketchDialog 确认链下发的 plane）。
    this._plane = resolveSketchPlaneFrame();
    this.initLocateElements(false, true);
    this._outputPrompt(pickDimensionPrompt(this.dimensionKind, 0));
  }

  public override async onCleanup(): Promise<void> {
    clearSketchToolFeedback(this.toolId);
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

    // v1 单草图假设（M3-b 铁律保留）：不校验命中元素 id，就近分辨活动草图实体。
    const pick = resolveNearestPick(sketch.entities, { x: hit.u, y: hit.v });
    if (!pick) {
      this._notify(i18next.t('partStudio.sketch.toasts.noSolvedCoords'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    if (this._picks.some((p) => JSON.stringify(p.ref) === JSON.stringify(pick.ref))) {
      this._notify(i18next.t('partStudio.sketch.toasts.alreadyPicked'), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    const verdict = acceptDimensionPick(this.dimensionKind, this._picks.length, pick.kind);
    if (!verdict.ok) {
      // 拒收不消耗点击，继续拾取。
      const { kinds } = DIMENSION_SLOTS[this.dimensionKind];
      this._notify(i18next.t('partStudio.sketch.dimension.reject.slotMismatch', {
        label: i18next.t(`partStudio.sketch.vocabulary.dimensionKinds.${this.dimensionKind}`),
        slot: kinds.map((k) => i18next.t(`partStudio.sketch.vocabulary.entityKinds.${k}`)).join('/'),
        actual: i18next.t(`partStudio.sketch.vocabulary.entityKinds.${pick.kind}`),
      }), OutputMessagePriority.Info);
      return EventHandled.Yes;
    }

    this._picks.push(pick);
    if (!verdict.complete) {
      this._outputPrompt(pickDimensionPrompt(this.dimensionKind, this._picks.length));
      return EventHandled.Yes;
    }

    // 满槽 → 候选移交面板（绝不直接提交；value>0 校验与 applyUpdate 均属面板）。
    sketchToolEvents.emit('dimensionCandidate', {
      kind: this.dimensionKind,
      refs: this._picks.map((p) => p.ref),
      entityIds: this._picks.flatMap((p) => (p.entityId === undefined ? [] : [p.entityId])),
    } satisfies SketchDimensionCandidate);
    await this.exitTool();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._picks.length > 0) {
      this._picks = [];
      this._outputPrompt(pickDimensionPrompt(this.dimensionKind, 0));
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** PrimitiveTool 抽象槽位：外部事件要求重启时换新实例重挂（accessor 模块级，无选项需透传）。 */
  public override async onRestartTool(): Promise<void> {
    const tool = this.createInstance();
    if (!(await tool.run())) return this.exitTool(); // 新实例拒装不得留旧实例
  }

  /** 重启用实例工厂（子类返回自身类型新实例）。 */
  protected abstract createInstance(): SketchAddDimensionTool;

  private _outputPrompt(prompt: { key: string; params: Record<string, unknown> }): void {
    const text = i18next.t(prompt.key, prompt.params);
    this._hintText = text;
    IModelApp.notifications.outputPrompt(text);
    if (this._cursorView)
      publishSketchToolHint(this.toolId, text, this._cursorView);
  }

  private _notify(message: string, priority: OutputMessagePriority): void {
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
  }
}

/** 距离尺寸：2 point + value（面板收值提交）。 */
export class DistanceAddTool extends SketchAddDimensionTool {
  public static override toolId = 'Sketch.Dimension.Distance';
  public static override iconSpec = 'icon-dimension-distance';
  protected readonly dimensionKind = 'distance';
  protected createInstance(): SketchAddDimensionTool { return new DistanceAddTool(); }
}

/** 半径尺寸：1 circle/arc + value（面板收值提交）。 */
export class RadiusAddTool extends SketchAddDimensionTool {
  public static override toolId = 'Sketch.Dimension.Radius';
  public static override iconSpec = 'icon-dimension-radius';
  protected readonly dimensionKind = 'radius';
  protected createInstance(): SketchAddDimensionTool { return new RadiusAddTool(); }
}

/** 线长尺寸：1 line + value（Tutorial 2 的 4 个 LENGTH 尺寸）。 */
export class LengthAddTool extends SketchAddDimensionTool {
  public static override toolId = 'Sketch.Dimension.Length';
  public static override iconSpec = 'icon-dimension-length';
  protected readonly dimensionKind = 'length';
  protected createInstance(): SketchAddDimensionTool { return new LengthAddTool(); }
}

/**
 * 注册草图尺寸 2 工具（M6-b T5；幂等——模块级 flag；注册点=PartStudioPage
 * 工具注册编排，registerSketchTools/registerSketchConstraintTools 之后同 try 块）。
 */
let dimensionToolsRegistered = false;
export function registerSketchDimensionTools(): void {
  if (dimensionToolsRegistered) return;
  // Onshape 单尺寸按钮（ribbon 只暴露这一个）；旧三工具保留注册以兼容历史
  // toolId/AI 入口，但不再有飞菜单。
  registerUnifiedDimensionTool();
  IModelApp.tools.register(DistanceAddTool);
  IModelApp.tools.register(RadiusAddTool);
  IModelApp.tools.register(LengthAddTool);
  dimensionToolsRegistered = true;
}
