/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * 草图工具→面板事件桥（M6-b T5）：dimensionCandidate 值确认桥。
 *
 * 语义骨架移植自退役仓 apps/web/features/sketch/tools/SketchAddDimensionTool.ts
 * （M3-b T5 裁决 E-4）的 sketchToolEvents——SolidModelingToolBase 的
 * solidModelingEvents 同构极简发射器。web 拆独立模块的裁决：SketchPanel
 * （画布覆盖层）只消费事件面，若从 SketchAddDimensionTool 导入会把
 * `class extends PrimitiveTool` 的基类存在性强加给面板消费方（core-frontend
 * 必须先于面板可加载——M6-a T5 懒引裁决的同款理由），故桥独立成零依赖模块，
 * 工具侧 emit、面板侧 on；SketchAddDimensionTool 再导出保持 M3-b 引用路径
 * 同构。**尺寸不直接提交铁律**的载体：工具满槽只发候选，收值与提交归面板。
 */

/** 尺寸种类（v1.19 增 length：Onshape 线长尺寸；distance 支持 point/line 混合）。 */
export type SketchDimensionKind = 'distance' | 'radius' | 'length';

/** 候选尺寸约束载荷：面板据此渲染值输入框，确认后构造 {kind, id, refs, value} 提交。 */
export interface SketchDimensionCandidate {
  kind: SketchDimensionKind;
  /** 求解器槽位引用（结构化 refs：点/线/弧/圆子实体）。 */
  refs: import('@luban-cad/shared').SketchRef[];
  /** 用户拾取顺序的可见实体 id（origin 无实体，省略）。 */
  entityIds: number[];
}

/**
 * v1.19：偏移距确认候选（Onshape 偏移对话框同构——光标定侧、输入框定精确距）。
 * 面板只负责收值与确认回调；草稿构建/提交归工具（`commit` 返回拒收文案）。
 */
export interface SketchOffsetCandidate {
  /** 光标实测偏移距（输入框初值，草图 mm）。 */
  measuredDistance: number;
  /** 确认值 → 工具按该距离构建草稿并提交；undefined=成功，字符串=拒收文案。 */
  commit: (distance: number) => Promise<string | undefined>;
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
