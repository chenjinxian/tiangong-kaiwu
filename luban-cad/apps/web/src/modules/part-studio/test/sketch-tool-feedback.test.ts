/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图工具反馈总线：发布/订阅、toolId 守卫清理、快照稳定。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSketchToolFeedback,
  getSketchToolFeedback,
  publishSketchToolFeedback,
  publishSketchToolHint,
  subscribeSketchToolFeedback,
} from '../tools/sketch/sketch-tool-feedback.js';

afterEach(() => clearSketchToolFeedback());

describe('sketch tool feedback bus', () => {
  it('publish 通知订阅者并更新快照', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSketchToolFeedback(listener);
    publishSketchToolFeedback({
      toolId: 'Sketch.Rectangle',
      hint: '点击放置矩形对角点',
      measures: [{ labelKey: 'partStudio.sketch.live.width', value: '82.55' }],
      cursor: { x: 500, y: 300 },
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSketchToolFeedback()).toMatchObject({
      toolId: 'Sketch.Rectangle',
      cursor: { x: 500, y: 300 },
    });
    unsubscribe();
    publishSketchToolHint('Sketch.Line', '退订后不再通知');
    expect(listener).toHaveBeenCalledTimes(1);
    clearSketchToolFeedback();
    expect(getSketchToolFeedback()).toBeUndefined();
  });

  it('toolId 守卫：旧工具清理不误伤新工具反馈', () => {
    publishSketchToolFeedback({ toolId: 'Sketch.Line', hint: 'line', measures: [] });
    clearSketchToolFeedback('Sketch.Rectangle');
    expect(getSketchToolFeedback()?.toolId).toBe('Sketch.Line');
    clearSketchToolFeedback('Sketch.Line');
    expect(getSketchToolFeedback()).toBeUndefined();
  });

  it('hint-only 便捷入口不携带尺寸', () => {
    publishSketchToolHint('Sketch.Dimension.Distance', '拾取第一条线', { x: 20, y: 30 });
    const feedback = getSketchToolFeedback();
    expect(feedback?.measures).toEqual([]);
    expect(feedback?.hint).toBe('拾取第一条线');
    expect(feedback?.cursor).toEqual({ x: 20, y: 30 });
  });
});
