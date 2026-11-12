/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图相机生命周期（2026-11-02）：进入定向 + 实体就位后按草图范围取景一次，
 * 编辑期间不抢相机；退出恢复进入前旋转。
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Matrix3d } from '@itwin/core-geometry';
import type { Viewport } from '@itwin/core-frontend';
import type { SketchDto, SketchPlaneDto } from '@luban-cad/shared';
import { useSketchCamera } from '../hooks/useSketchCamera.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

const FRONT: SketchPlaneDto = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
};

function makeViewport() {
  const setRotation = vi.fn();
  const lookAtVolume = vi.fn();
  const viewport = {
    view: {
      getRotation: () => Matrix3d.createIdentity(),
      setRotation,
      is3d: () => true,
      turnCameraOff: vi.fn(),
      lookAtVolume,
    },
    viewRect: { aspect: 1.5 },
    synchWithView: vi.fn(),
    onViewChanged: { raiseEvent: vi.fn() },
  } as unknown as Viewport;
  return { viewport, setRotation, lookAtVolume };
}

function sketchWith(lineEnd: number): SketchDto {
  return {
    id: 's1',
    entities: [{ kind: 'line', id: 1, p1: { x: -lineEnd, y: -lineEnd }, p2: { x: lineEnd, y: lineEnd } }],
    constraints: [],
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
  };
}

beforeEach(() => {
  usePartStudioStore.setState({
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null, orientCameraOnEnter: false },
  });
});

describe('useSketchCamera', () => {
  it('orients to the plane, fits once when entities arrive, and restores on exit', () => {
    const { viewport, setRotation, lookAtVolume } = makeViewport();
    act(() => {
      usePartStudioStore.setState({
        sketch: { isActive: true, activeSketchId: 's1', activeSketchPlane: FRONT, orientCameraOnEnter: true },
      });
    });

    const { rerender } = renderHook(
      ({ sketch }) => useSketchCamera(viewport, sketch),
      { initialProps: { sketch: sketchWith(40) as SketchDto | undefined } },
    );
    expect(setRotation).toHaveBeenCalledTimes(1);
    expect(lookAtVolume).toHaveBeenCalledTimes(1);

    // 编辑中的实体更新不得反复抢相机。
    rerender({ sketch: sketchWith(80) });
    expect(lookAtVolume).toHaveBeenCalledTimes(1);

    act(() => {
      usePartStudioStore.setState({
        sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null, orientCameraOnEnter: false },
      });
    });
    rerender({ sketch: undefined });
    // 第二次 setRotation = 退出恢复进入前旋转。
    expect(setRotation).toHaveBeenCalledTimes(2);
  });

  it('waits for the sketch read, then fits an existing (non-empty) sketch', () => {
    const { viewport, setRotation, lookAtVolume } = makeViewport();
    act(() => {
      usePartStudioStore.setState({
        sketch: { isActive: true, activeSketchId: 's1', activeSketchPlane: FRONT, orientCameraOnEnter: true },
      });
    });

    const { rerender } = renderHook(
      ({ sketch }) => useSketchCamera(viewport, sketch),
      { initialProps: { sketch: undefined as SketchDto | undefined } },
    );
    expect(setRotation).toHaveBeenCalledTimes(1);
    expect(lookAtVolume).not.toHaveBeenCalled();

    rerender({ sketch: sketchWith(40) });
    expect(lookAtVolume).toHaveBeenCalledTimes(1);
  });

  it('does not steal the camera when a new empty sketch gains its first entity', () => {
    const { viewport, lookAtVolume } = makeViewport();
    act(() => {
      usePartStudioStore.setState({
        sketch: { isActive: true, activeSketchId: 's1', activeSketchPlane: FRONT, orientCameraOnEnter: true },
      });
    });
    const empty: SketchDto = { ...sketchWith(0), entities: [] };
    const { rerender } = renderHook(
      ({ sketch }) => useSketchCamera(viewport, sketch),
      { initialProps: { sketch: empty } },
    );
    expect(lookAtVolume).not.toHaveBeenCalled();

    // 用户画下第一笔：不得触发 fit（否则鼠标流坐标系中途跳变）。
    rerender({ sketch: sketchWith(40) });
    expect(lookAtVolume).not.toHaveBeenCalled();
  });

  it('editing an existing sketch keeps the camera (no orient/fit/restore)', () => {
    const { viewport, setRotation, lookAtVolume } = makeViewport();
    const { rerender } = renderHook(
      ({ sketch }) => useSketchCamera(viewport, sketch),
      { initialProps: { sketch: sketchWith(40) as SketchDto | undefined } },
    );
    act(() => {
      usePartStudioStore.setState({
        sketch: { isActive: true, activeSketchId: 's1', activeSketchPlane: FRONT, orientCameraOnEnter: false },
      });
    });
    rerender({ sketch: sketchWith(40) });
    expect(setRotation).not.toHaveBeenCalled();
    expect(lookAtVolume).not.toHaveBeenCalled();
    act(() => {
      usePartStudioStore.setState({
        sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null, orientCameraOnEnter: false },
      });
    });
    rerender({ sketch: undefined });
    expect(setRotation).not.toHaveBeenCalled();
  });
});
