// src/modules/part-studio/test/SketchValuePopup.test.tsx
//
// Onshape 草图值确认弹层（2026-11-03）：尺寸/偏移工具完成后在标注位置弹出
// 数字输入框，确认后经 applyUpdate/commit 提交；不使用常驻 SketchPanel。
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SketchDto } from '@luban-cad/shared';
import { SketchValuePopup } from '../components/SketchValuePopup.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';

function fakeSystem(overrides: Partial<UseSketchSystem> = {}): UseSketchSystem {
  const activeSketch: SketchDto = {
    id: 'sk-1',
    entities: [],
    constraints: [],
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
    regions: [],
  };
  return {
    activeSketch,
    loading: false,
    applyUpdate: vi.fn(async () => ({ ok: true, featureId: 'sk-1' })),
    applyConstraintValue: vi.fn(async () => ({ ok: true, featureId: 'sk-1' })),
    refresh: vi.fn(async () => undefined),
    ...overrides,
  } as UseSketchSystem;
}

describe('SketchValuePopup（Onshape 标注位置值确认框）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('尺寸候选：在 anchor 位置弹出输入框，确认后追加约束并关闭', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'length',
        refs: [{ entity: 7, part: 'start' }],
        entityIds: [7],
        anchor: { x: 140, y: 120 },
      });
    });
    const popup = screen.getByTestId('sketch-value-popup');
    expect(popup.getAttribute('data-kind')).toBe('dimension');
    expect((popup as HTMLElement).style.left).toBe('154px');
    expect((popup as HTMLElement).style.top).toBe('102px');
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    await waitFor(() => expect(system.applyUpdate).toHaveBeenCalledTimes(1));
    expect((system.applyUpdate as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual([
      { kind: 'length', id: expect.any(Number), refs: [{ entity: 7, part: 'start' }], value: 42 },
    ]);
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
  });

  it('非法值：就地错误，不提交；Escape 关闭', async () => {
    const system = fakeSystem();
    render(<SketchValuePopup sketchSystem={system} />);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', {
        kind: 'radius',
        refs: [{ entity: 3, part: 'center' }],
        entityIds: [3],
        anchor: { x: 50, y: 60 },
      });
    });
    fireEvent.change(screen.getByTestId('sketch-value-input'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    expect(screen.getByTestId('sketch-value-error')).toBeDefined();
    expect(system.applyUpdate).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('sketch-value-input'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
  });

  it('偏移候选：预填实测距，确认调用工具 commit；拒收保持并显示错误', async () => {
    const commit = vi.fn(async (value: number) => (value > 10 ? '偏移过大' : undefined));
    render(<SketchValuePopup sketchSystem={fakeSystem()} />);
    act(() => {
      sketchToolEvents.emit('offsetCandidate', {
        measuredDistance: 8,
        commit,
        anchor: { x: 200, y: 200 },
      });
    });
    const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
    expect(input.value).toBe('8');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('sketch-value-confirm'));
    await waitFor(() => expect(commit).toHaveBeenCalledWith(12));
    await waitFor(() => expect(screen.getByTestId('sketch-value-error').textContent).toBe('偏移过大'));
  });
});
