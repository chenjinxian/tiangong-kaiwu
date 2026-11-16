// src/modules/part-studio/test/useSketchCursorPoint.test.ts
//
// 2026-11-15 E4/S4b（Onshape live 草图状态读数）光标订阅 hook 行为测试：
// 画布 pointermove → rAF 合帧 → 射线∩草图平面（vi.mock 控制世界点）→ 世界
// mm 直通（产品单位，无 1000× 缩放）→ 3 位小数显示值去重；pointerleave/
// pointercancel 清空；enabled=false 零监听；cleanup 摘除监听并取消未决 rAF
// （卸载后不再有帧回调触达 setState）。
//
// 数据源替身：`sketch-pick.intersectViewRayWithPlane` 被 vi.mock 替换为受控
// 世界点——本文件只验证 hook 自身的订阅/合帧/去重/生命周期，不重复几何求交
// 的实现细节（几何由真实 viewport 的 e2e 覆盖）。

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchPlaneDto } from '@luban-cad/shared';
import { useSketchCursorPoint } from '../hooks/useSketchCursorPoint.js';

const sketchPick = vi.hoisted(() => ({
  intersectViewRayWithPlane: vi.fn(),
}));

vi.mock('../tools/sketch/sketch-pick.js', () => ({
  intersectViewRayWithPlane: sketchPick.intersectViewRayWithPlane,
}));

/** 草图平面：XY 面、原点 z=30（用于验证世界 z 直通而非恒 0）。 */
const PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 30 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

/** 画布 rect：left=10/top=20（验证 client → 画布局部坐标的扣除）。 */
function makeViewport(): { canvas: HTMLCanvasElement; viewport: ScreenViewport } {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({
      left: 10, top: 20, right: 810, bottom: 620, width: 800, height: 600, x: 10, y: 20,
      toJSON: () => ({}),
    }),
  });
  const viewport = { canvas } as unknown as ScreenViewport;
  return { canvas, viewport };
}

/**
 * jsdom 26 无 PointerEvent（实测）：hook 只读取 clientX/clientY，MouseEvent
 * 足以驱动同一监听器；事件名仍是 pointermove/pointerleave。
 */
function dispatchPointer(canvas: EventTarget, type: 'pointermove' | 'pointerleave' | 'pointercancel', init?: {
  clientX?: number;
  clientY?: number;
}): void {
  canvas.dispatchEvent(new MouseEvent(type, { bubbles: type === 'pointermove', ...init }));
}

let hitPoint: Point3d;
let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;
let rafScheduled: ReturnType<typeof vi.fn>;
let rafCancelled: ReturnType<typeof vi.fn>;
let originalRaf: unknown;
let originalCancelRaf: unknown;

/** 执行当帧所有 rAF 回调（rAF 合帧语义：本帧只跑一次 flush）。 */
function flushFrame(): void {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  act(() => {
    for (const callback of callbacks)
      callback(0);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hitPoint = Point3d.create(20, 4, 30);
  sketchPick.intersectViewRayWithPlane.mockReset();
  sketchPick.intersectViewRayWithPlane.mockImplementation(() => hitPoint);

  rafCallbacks = new Map();
  nextRafId = 1;
  rafScheduled = vi.fn((callback: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, callback);
    return id;
  });
  rafCancelled = vi.fn((id: number) => { rafCallbacks.delete(id); });

  const target = window as unknown as {
    requestAnimationFrame?: unknown;
    cancelAnimationFrame?: unknown;
  };
  originalRaf = target.requestAnimationFrame;
  originalCancelRaf = target.cancelAnimationFrame;
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true, writable: true, value: rafScheduled,
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true, writable: true, value: rafCancelled,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true, writable: true, value: originalRaf,
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true, writable: true, value: originalCancelRaf,
  });
});

describe('useSketchCursorPoint：光标世界点订阅（S4b）', () => {
  it('pointermove → rAF 帧后给出世界点：画布局部坐标求交、原始 mm 直通（无 1000× 缩放）', () => {
    const { canvas, viewport } = makeViewport();
    const { result } = renderHook(() => useSketchCursorPoint(viewport, PLANE, true));
    expect(result.current).toBeNull();

    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 130, clientY: 80 }));
    // rAF 未到帧：只登记视口坐标，不产生点（合帧语义）。
    expect(result.current).toBeNull();
    expect(rafScheduled).toHaveBeenCalledTimes(1);

    flushFrame();

    // 产品世界数值按 mm 直读：20/4/30 原样，不是 0.02/0.004/0.03。
    expect(result.current).toEqual({ x: 20, y: 4, z: 30 });
    expect(sketchPick.intersectViewRayWithPlane).toHaveBeenCalledTimes(1);
    const [vpArg, viewArg, originArg, normalArg] = sketchPick.intersectViewRayWithPlane.mock.calls[0]!;
    expect(vpArg).toBe(viewport);
    // client(130,80) − rect(10,20) = 画布局部 (120,60)。
    expect(viewArg).toEqual({ x: 120, y: 60 });
    // 平面参数走 sketchPlaneFrameFrom（原点 z=30 / 法向 +Z）。
    expect(originArg).toMatchObject({ x: 0, y: 0, z: 30 });
    expect(normalArg).toMatchObject({ x: 0, y: 0, z: 1 });
  });

  it('同一帧内多次 pointermove 合帧为一次求交，取最后一次视口坐标', () => {
    const { canvas, viewport } = makeViewport();
    const { result } = renderHook(() => useSketchCursorPoint(viewport, PLANE, true));

    act(() => {
      dispatchPointer(canvas, 'pointermove', { clientX: 30, clientY: 30 });
      dispatchPointer(canvas, 'pointermove', { clientX: 40, clientY: 40 });
      dispatchPointer(canvas, 'pointermove', { clientX: 50, clientY: 50 });
    });
    expect(rafScheduled).toHaveBeenCalledTimes(1);
    flushFrame();

    expect(sketchPick.intersectViewRayWithPlane).toHaveBeenCalledTimes(1);
    expect(sketchPick.intersectViewRayWithPlane.mock.calls[0]![1]).toEqual({ x: 40, y: 30 });
    expect(result.current).toEqual({ x: 20, y: 4, z: 30 });
  });

  it('3 位小数显示值相同的亚 0.001 移动不重复 setState（无额外渲染），超过显示精度才更新', () => {
    const { canvas, viewport } = makeViewport();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useSketchCursorPoint(viewport, PLANE, true);
    });
    const initialRenders = renders;

    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 130, clientY: 80 }));
    flushFrame();
    expect(result.current).toEqual({ x: 20, y: 4, z: 30 });
    const rendersAfterFirstPoint = renders;
    expect(rendersAfterFirstPoint).toBe(initialRenders + 1);
    const firstPoint = result.current;

    // 20.0004 的显示值仍是 "20.000" → 显示值键相同，不 setState（对象引用不变）。
    hitPoint = Point3d.create(20.0004, 4, 30);
    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 131, clientY: 81 }));
    flushFrame();
    expect(renders).toBe(rendersAfterFirstPoint);
    expect(result.current).toBe(firstPoint);

    // 20.002 进入第 3 位小数 → 键变化，正常更新。
    hitPoint = Point3d.create(20.002, 4, 30);
    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 132, clientY: 82 }));
    flushFrame();
    expect(renders).toBe(rendersAfterFirstPoint + 1);
    expect(result.current).toEqual({ x: 20.002, y: 4, z: 30 });
  });

  it('pointerleave / pointercancel 清空读数', () => {
    const { canvas, viewport } = makeViewport();
    const { result } = renderHook(() => useSketchCursorPoint(viewport, PLANE, true));

    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 130, clientY: 80 }));
    flushFrame();
    expect(result.current).not.toBeNull();

    act(() => dispatchPointer(canvas, 'pointerleave'));
    expect(result.current).toBeNull();

    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 130, clientY: 80 }));
    flushFrame();
    expect(result.current).not.toBeNull();
    act(() => dispatchPointer(canvas, 'pointercancel'));
    expect(result.current).toBeNull();
  });

  it('enabled=false：不挂任何监听、不调度 rAF、始终返回 null', () => {
    const { canvas, viewport } = makeViewport();
    const addListener = vi.spyOn(canvas, 'addEventListener');
    const { result } = renderHook(() => useSketchCursorPoint(viewport, PLANE, false));

    expect(result.current).toBeNull();
    expect(addListener).not.toHaveBeenCalled();
    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 130, clientY: 80 }));
    expect(rafScheduled).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('viewport 缺失：不挂监听、返回 null（草图模式外/视口未就绪）', () => {
    const { result } = renderHook(() => useSketchCursorPoint(undefined, PLANE, true));
    expect(result.current).toBeNull();
    expect(rafScheduled).not.toHaveBeenCalled();
  });

  it('cleanup：摘除三个监听器并取消未决 rAF；卸载后再移动不再调度帧（无 setState 路径）', () => {
    const { canvas, viewport } = makeViewport();
    const addListener = vi.spyOn(canvas, 'addEventListener');
    const removeListener = vi.spyOn(canvas, 'removeEventListener');
    const { result, unmount } = renderHook(() => useSketchCursorPoint(viewport, PLANE, true));

    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 130, clientY: 80 }));
    expect(rafCallbacks.size).toBe(1);
    const pendingId = [...rafCallbacks.keys()][0]!;
    // 帧未执行：此时仍无点。
    expect(result.current).toBeNull();

    unmount();

    // 监听器以同一函数引用摘除（避免闭包不一致泄漏）。
    for (const eventType of ['pointermove', 'pointerleave', 'pointercancel'] as const) {
      const entry = addListener.mock.calls.find(([type]) => type === eventType);
      expect(entry).toBeDefined();
      expect(removeListener).toHaveBeenCalledWith(eventType, entry![1]);
    }
    expect(rafCancelled).toHaveBeenCalledWith(pendingId);
    expect(rafCallbacks.size).toBe(0);

    // 卸载后指针事件不再触达 hook：不排新帧（未决帧已取消 → 无 setState 通道）。
    act(() => dispatchPointer(canvas, 'pointermove', { clientX: 140, clientY: 90 }));
    expect(rafScheduled).toHaveBeenCalledTimes(1);
  });
});
