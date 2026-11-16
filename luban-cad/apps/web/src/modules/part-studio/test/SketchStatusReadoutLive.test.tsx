// src/modules/part-studio/test/SketchStatusReadoutLive.test.tsx
//
// 2026-11-15 E4/S4b（Onshape live 草图状态读数）：连接版叶子组件
// `SketchStatusReadoutLive` 的 jsdom 集成测试——光标订阅确实落在读数叶子内
// （画布 pointermove → rAF 合帧 → 世界 mm 文本），enabled=false 不监听，
// pointerleave 使读数自隐。几何求交由 sketch-pick 替身控制（不重复其实现）。
//
// jsdom 26 无 PointerEvent/rAF（实测）：用 MouseEvent（同 pointermove 类型名）
// 与受控 rAF 桩驱动，语义与浏览器一致。

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Point3d } from '@itwin/core-geometry';
import type { ScreenViewport } from '@itwin/core-frontend';
import type { SketchPlaneDto } from '@luban-cad/shared';
import { SketchStatusReadoutLive } from '../components/SketchStatusReadout.js';

const sketchPick = vi.hoisted(() => ({
  intersectViewRayWithPlane: vi.fn(),
}));

vi.mock('../tools/sketch/sketch-pick.js', () => ({
  intersectViewRayWithPlane: sketchPick.intersectViewRayWithPlane,
}));

const PLANE: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 30 },
  normal: { x: 0, y: 0, z: 1 },
  xDir: { x: 1, y: 0, z: 0 },
};

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

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;
let originalRaf: unknown;
let originalCancelRaf: unknown;

function pointerMove(canvas: EventTarget, clientX: number, clientY: number): void {
  canvas.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true }));
}

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
  sketchPick.intersectViewRayWithPlane.mockReset();
  sketchPick.intersectViewRayWithPlane.mockReturnValue(Point3d.create(20, 4, 30));

  rafCallbacks = new Map();
  nextRafId = 1;
  const target = window as unknown as {
    requestAnimationFrame?: unknown;
    cancelAnimationFrame?: unknown;
  };
  originalRaf = target.requestAnimationFrame;
  originalCancelRaf = target.cancelAnimationFrame;
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (id: number) => { rafCallbacks.delete(id); },
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

describe('SketchStatusReadoutLive（读数叶子内光标订阅）', () => {
  it('pointermove → rAF 帧后点段显示世界 mm（原始数值、3 位小数），长度段同排显示', () => {
    const { canvas, viewport } = makeViewport();
    render(
      <SketchStatusReadoutLive
        viewport={viewport}
        plane={PLANE}
        enabled
        length={{ kind: 'length', valueMm: 12 }}
      />,
    );
    // 长度段恒在（选择驱动），点段在首个 rAF 帧前不渲染。
    expect(screen.getByTestId('sketch-status-length').textContent).toContain('12.000 mm');
    expect(screen.queryByTestId('sketch-status-point')).toBeNull();

    act(() => pointerMove(canvas, 130, 80));
    expect(screen.queryByTestId('sketch-status-point')).toBeNull();
    flushFrame();

    const point = screen.getByTestId('sketch-status-point');
    // 20/4/30 即产品 mm；断言文本同时证明没有 1000×（否则 20000.000）。
    expect(point.textContent).toContain('X 20.000 mm Y 4.000 mm Z 30.000 mm');
    expect(point.textContent).toContain('点:');
  });

  it('enabled=false（非草图模式）：pointermove 不产生点段，仅长度段', () => {
    const { canvas, viewport } = makeViewport();
    render(
      <SketchStatusReadoutLive
        viewport={viewport}
        plane={PLANE}
        enabled={false}
        length={{ kind: 'radius', valueMm: 5 }}
      />,
    );
    act(() => pointerMove(canvas, 130, 80));
    flushFrame();
    expect(screen.queryByTestId('sketch-status-point')).toBeNull();
    expect(screen.getByTestId('sketch-status-length').textContent).toContain('半径:');
  });

  it('无长度且无点 → 不渲染读数；pointerleave 清点使读数消失', () => {
    const { canvas, viewport } = makeViewport();
    render(<SketchStatusReadoutLive viewport={viewport} plane={PLANE} enabled />);
    expect(screen.queryByTestId('sketch-status-readout')).toBeNull();

    act(() => pointerMove(canvas, 130, 80));
    flushFrame();
    expect(screen.getByTestId('sketch-status-point')).not.toBeNull();

    act(() => canvas.dispatchEvent(new MouseEvent('pointerleave')));
    expect(screen.queryByTestId('sketch-status-readout')).toBeNull();
  });
});
