/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 草图尺寸创建工具（M3-b T5）：distance/radius 拾取 + 值确认桥。
 *
 * 裁决 E-4：尺寸值不弹工具内 Dialog——工具满槽后经事件桥把**候选约束**发给
 * 面板（SolidModelingToolBase 的 solidModelingEvents 同构：sketchToolEvents
 * .dimensionCandidate），面板侧收值（>0 校验）并走 applyUpdate 提交
 * （面板订阅=Task 6；工具只发候选，**绝不直接提交**）。
 *
 * 槽位规则与后端 SolverTypes.ts 冻结契约一致：
 * distance=2 point（value>0 由面板收）；radius=1 circle（value>0 由面板收）。
 * 就近实体分辨/槽位校验/右键语义与 SketchAddConstraintTool 全同（复用其助手）。
 */

import {
  BeButtonEvent,
  EventHandled,
  IModelApp,
  PrimitiveTool,
} from '@itwin/core-frontend';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { pickHitPoint, resolveNearestEntityId, type SketchToolToast } from './SketchAddConstraintTool.js';
import i18n from '../../../shared/i18n/index.js';

/** v1 尺寸种类（SolverTypes 冻结联合中带值的两种） */
export type SketchDimensionKind = 'distance' | 'radius';

/** 候选尺寸约束载荷：面板据此渲染值输入框，确认后构造 {kind, id, refs, value} 提交 */
export interface SketchDimensionCandidate {
  kind: SketchDimensionKind;
  /** 求解器槽位引用（distance=2 point id；radius=1 circle id） */
  refs: number[];
  /** 用户拾取顺序的实体 id（v1 与 refs 同列；字段分立供面板展示演进） */
  entityIds: number[];
}

export interface SketchDimensionEventMap {
  dimensionCandidate: (candidate: SketchDimensionCandidate) => void;
}

/** 工具→面板事件桥（SolidModelingEvents 同构的极简发射器） */
class SketchToolEventEmitter {
  private _listeners = new Map<keyof SketchDimensionEventMap, Set<(...args: unknown[]) => void>>();

  public on<K extends keyof SketchDimensionEventMap>(event: K, fn: SketchDimensionEventMap[K]): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn as (...args: unknown[]) => void);
    return () => this.off(event, fn);
  }

  public off<K extends keyof SketchDimensionEventMap>(event: K, fn: SketchDimensionEventMap[K]): void {
    this._listeners.get(event)?.delete(fn as (...args: unknown[]) => void);
  }

  public emit<K extends keyof SketchDimensionEventMap>(event: K, ...args: Parameters<SketchDimensionEventMap[K]>): void {
    this._listeners.get(event)?.forEach((fn) => {
      (fn as (...a: Parameters<SketchDimensionEventMap[K]>) => void)(...args);
    });
  }
}

export const sketchToolEvents = new SketchToolEventEmitter();

export interface SketchAddDimensionToolOptions {
  /** Task 3 草图数据 hook（activeSketch 读面；提交由面板经 applyUpdate 负责） */
  sketchSystem: UseSketchSystem;
  /** 面板 toast 通道（FeaturePanel 同款签名） */
  onToast?: SketchToolToast;
}

const DIMENSION_LABEL_KEYS: Record<SketchDimensionKind, string> = {
  distance: 'sketch.dimensionKinds.distance',
  radius: 'sketch.dimensionKinds.radius',
};

/** 槽位形状（SolverTypes 冻结契约）：distance=2 point；radius=1 circle */
const DIMENSION_SLOTS: Record<SketchDimensionKind, { slot: 'point' | 'circle'; count: number }> = {
  distance: { slot: 'point', count: 2 },
  radius: { slot: 'circle', count: 1 },
};

/** 槽位实体种类名（调用时翻译） */
function slotName(slot: 'point' | 'circle'): string {
  return i18n.t(
    slot === 'point' ? 'sketch.tools.entityKinds.point' : 'sketch.tools.entityKinds.circle',
    { ns: 'editor' },
  );
}

/** 尺寸种类名（调用时翻译） */
function dimensionLabel(kind: SketchDimensionKind): string {
  return i18n.t(DIMENSION_LABEL_KEYS[kind], { ns: 'editor' });
}

function pickPrompt(kind: SketchDimensionKind, pickedCount: number): string {
  const label = dimensionLabel(kind);
  const { slot, count } = DIMENSION_SLOTS[kind];
  const slotLabel = slotName(slot);
  if (pickedCount === 0) {
    return i18n.t('sketch.tools.dimension.promptFirst', { ns: 'editor', label, slot: slotLabel, count });
  }
  return i18n.t('sketch.tools.dimension.promptNext', {
    ns: 'editor',
    label,
    slot: slotLabel,
    remaining: count - pickedCount,
  });
}

/**
 * 草图尺寸创建工具抽象基类：满槽 → 发 dimensionCandidate 事件移交面板
 * （工具侧零提交——值确认桥的铁律）。
 */
export abstract class SketchAddDimensionTool extends PrimitiveTool {
  public static override namespace = 'LubanCad';

  /** 尺寸种类（子类固定） */
  protected abstract readonly dimensionKind: SketchDimensionKind;

  private _sketchSystem?: UseSketchSystem;
  private _onToast?: SketchToolToast;
  /** 已拾取实体 id 序（满槽 → 发候选事件 → 退出） */
  private _refs: number[] = [];

  /** 注入运行依赖（runSketchAddDimensionTool / 面板启动路径） */
  public setOptions(options: SketchAddDimensionToolOptions): void {
    this._sketchSystem = options.sketchSystem;
    this._onToast = options.onToast;
  }

  public override requireWriteableTarget(): boolean { return true; }

  public override async onPostInstall(): Promise<void> {
    await super.onPostInstall();
    this.initLocateElements(true, true);
    IModelApp.notifications.outputPrompt(pickPrompt(this.dimensionKind, 0));
  }

  public override async onDataButtonDown(_ev: BeButtonEvent): Promise<EventHandled> {
    const hit = pickHitPoint();
    if (!hit) return EventHandled.No;

    const sketchSystem = this._sketchSystem;
    const sketch = sketchSystem?.activeSketch;
    if (!sketchSystem || !sketch || sketch.entities.length === 0) {
      this._toast(i18n.t('sketch.toasts.notOpenOrEmpty', { ns: 'editor' }), 'error');
      return EventHandled.Yes;
    }

    const entityId = resolveNearestEntityId(sketch.entities, { x: hit.x, y: hit.y });
    if (entityId === undefined) {
      this._toast(i18n.t('sketch.toasts.noSolvedCoords', { ns: 'editor' }), 'info');
      return EventHandled.Yes;
    }
    const entity = sketch.entities.find((e) => e.id === entityId);
    if (!entity) return EventHandled.Yes;

    if (this._refs.includes(entity.id)) {
      this._toast(i18n.t('sketch.toasts.alreadyPicked', { ns: 'editor' }), 'info');
      return EventHandled.Yes;
    }

    const { slot, count } = DIMENSION_SLOTS[this.dimensionKind];
    if (entity.kind !== slot) {
      this._toast(i18n.t('sketch.tools.dimension.slotMismatch', {
        ns: 'editor',
        label: dimensionLabel(this.dimensionKind),
        slot: slotName(slot),
        actual: i18n.t(`sketch.tools.entityKinds.${entity.kind}`, { ns: 'editor' }),
      }), 'info'); // 拒收不消耗点击，继续拾取
      return EventHandled.Yes;
    }

    this._refs.push(entity.id);
    if (this._refs.length < count) {
      IModelApp.notifications.outputPrompt(pickPrompt(this.dimensionKind, this._refs.length));
      return EventHandled.Yes;
    }

    // 满槽 → 候选移交面板（绝不直接提交；value>0 校验与 applyUpdate 均属面板）
    sketchToolEvents.emit('dimensionCandidate', {
      kind: this.dimensionKind,
      refs: [...this._refs],
      entityIds: [...this._refs],
    });
    await this.exitTool();
    return EventHandled.No;
  }

  public override async onResetButtonUp(_ev: BeButtonEvent): Promise<EventHandled> {
    if (this._refs.length > 0) {
      this._refs = [];
      IModelApp.notifications.outputPrompt(pickPrompt(this.dimensionKind, 0));
      return EventHandled.Yes;
    }
    await this.exitTool();
    return EventHandled.Yes;
  }

  /** PrimitiveTool 抽象槽位：外部事件要求重启时换新实例重挂（选项随迁） */
  public override async onRestartTool(): Promise<void> {
    const tool = this.createInstance();
    if (this._sketchSystem) {
      tool.setOptions({ sketchSystem: this._sketchSystem, onToast: this._onToast });
    }
    if (!(await tool.run())) return this.exitTool();
  }

  /** 重启用实例工厂（子类返回自身类型新实例） */
  protected abstract createInstance(): SketchAddDimensionTool;

  private _toast(message: string, type: 'success' | 'error' | 'info'): void {
    this._onToast?.(message, type);
  }
}

/** 距离尺寸：2 point + value（面板收值提交） */
export class DistanceAddTool extends SketchAddDimensionTool {
  public static override toolId = 'Sketch.AddDimension.Distance';
  public static override iconSpec = 'icon-dimension-distance';
  protected readonly dimensionKind = 'distance';
  protected createInstance(): SketchAddDimensionTool { return new DistanceAddTool(); }
}

/** 半径尺寸：1 circle + value（面板收值提交） */
export class RadiusAddTool extends SketchAddDimensionTool {
  public static override toolId = 'Sketch.AddDimension.Radius';
  public static override iconSpec = 'icon-dimension-radius';
  protected readonly dimensionKind = 'radius';
  protected createInstance(): SketchAddDimensionTool { return new RadiusAddTool(); }
}

/** 面板启动入口（runSketchAddConstraintTool 同构） */
export async function runSketchAddDimensionTool(
  kind: SketchDimensionKind,
  options: SketchAddDimensionToolOptions,
): Promise<void> {
  const tool = kind === 'distance' ? new DistanceAddTool() : new RadiusAddTool();
  tool.setOptions(options);
  await tool.run();
}
