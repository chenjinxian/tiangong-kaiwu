/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图工具→值确认浮层事件桥（M6-b T5 / 2026-11-03 Onshape 位置弹框）：
 * dimensionCandidate/offsetCandidate 值确认桥。
 *
 * 语义骨架移植自退役仓 apps/web/features/sketch/tools/SketchAddDimensionTool.ts
 * （M3-b T5 裁决 E-4）的 sketchToolEvents——SolidModelingToolBase 的
 * solidModelingEvents 同构极简发射器。web 拆独立模块的裁决：SketchValuePopup
 * 只消费事件面，若从 SketchAddDimensionTool 导入会把
 * `class extends PrimitiveTool` 的基类存在性强加给浮层消费方（core-frontend
 * 必须先于浮层可加载），故桥独立成零依赖模块。**尺寸不直接提交铁律**的载体：
 * 工具满槽只发候选（带屏幕锚点），收值与提交归浮层。
 */

/** 尺寸种类（v1.19 增 length：Onshape 线长尺寸；distance 支持 point/line 混合）。 */
export type SketchDimensionKind = 'distance' | 'radius' | 'diameter' | 'length';

/** Onshape 值确认框的屏幕锚点（view 坐标；标注放置点/偏移定侧点）。 */
export interface SketchToolAnchor { x: number; y: number }

/** 候选尺寸约束载荷：值确认框据此在标注位置渲染，确认后构造 {kind, id, refs, value} 提交。 */
export interface SketchDimensionCandidate {
  kind: SketchDimensionKind;
  /** 求解器槽位引用（结构化 refs：点/线/弧/圆子实体）。 */
  refs: import('@luban-cad/shared').SketchRef[];
  /** 用户拾取顺序的可见实体 id（origin 无实体，省略）。 */
  entityIds: number[];
  /** 标注位置屏幕锚点（Onshape 在放置位置弹出值确认框）。 */
  anchor?: SketchToolAnchor;
}

/**
 * v1.19：偏移距确认候选（Onshape 偏移对话框同构——光标定侧、输入框定精确距）。
 * 弹层只负责收值与确认回调；草稿构建/提交归工具（`commit` 返回拒收文案）。
 */
export interface SketchOffsetCandidate {
  /** 光标实测偏移距（输入框初值，草图 mm）。 */
  measuredDistance: number;
  /** 确认值 → 工具按该距离构建草稿并提交；undefined=成功，字符串=拒收文案。 */
  commit: (distance: number) => Promise<string | undefined>;
  /** 定侧点击的屏幕锚点。 */
  anchor?: SketchToolAnchor;
}

export interface SketchToolEventMap {
  dimensionCandidate: (candidate: SketchDimensionCandidate) => void;
  offsetCandidate: (candidate: SketchOffsetCandidate) => void;
}

type Listener = (...args: unknown[]) => void;

/** 工具→面板事件桥（SolidModelingEvents 同构的极简发射器；模块级单例）。 */
class SketchToolEventEmitter {
  private _listeners = new Map<keyof SketchToolEventMap, Set<Listener>>();

  /** 订阅；返回退订函数（面板卸载/退出即退订——候选不泄漏）。 */
  public on<K extends keyof SketchToolEventMap>(event: K, fn: SketchToolEventMap[K]): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn as Listener);
    return () => this.off(event, fn);
  }

  public off<K extends keyof SketchToolEventMap>(event: K, fn: SketchToolEventMap[K]): void {
    this._listeners.get(event)?.delete(fn as Listener);
  }

  public emit<K extends keyof SketchToolEventMap>(
    event: K,
    ...args: Parameters<SketchToolEventMap[K]>
  ): void {
    this._listeners.get(event)?.forEach((fn) => {
      (fn as (...a: Parameters<SketchToolEventMap[K]>) => void)(...args);
    });
  }
}

export const sketchToolEvents = new SketchToolEventEmitter();
