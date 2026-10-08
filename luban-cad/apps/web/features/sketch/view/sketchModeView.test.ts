/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * sketchModeView 单元测试（M3-b T6.5 草图模式视口行为）：
 * 进入 → 俯视对齐（StandardViewId.Top 等价路径）+ 栅格强制开；
 * 退出 → 视角/栅格恢复（栅格还原到「进入前」的值，非强制关；二次进入重新捕获）。
 *
 * 视角快照裁决：旋转矩阵 + 相机位姿（透视时补 eye/center/up）。
 * 恢复：相机开 → lookAt 回放（透视位姿完整回环）；否则 setRotation 回放
 * （正交视图的 origin/delta 不动，中心/比例天然保持）。
 */

import { describe, it, expect, vi } from 'vitest';
import { Angle, Matrix3d, Point3d, Vector3d } from '@itwin/core-geometry';
import type { Viewport } from '@itwin/core-frontend';
import {
  captureSketchView,
  applySketchTopView,
  restoreSketchView,
  setGridDisplayed,
} from './sketchModeView.js';

// 只消费 StandardViewId 枚举；Viewport 仅作类型（擦除），不触真 core-frontend
vi.mock('@itwin/core-frontend', () => ({
  StandardViewId: { Top: 'StandardViewId.Top' },
}));

interface LookAtArgs {
  eyePoint: Point3d;
  targetPoint: Point3d;
  upVector: Vector3d;
}

/** 鸭子类型视口假件：真实 Viewport 的最小结构面（view/viewFlags/setStandardRotation/...） */
function createFakeViewport(init: { rotation?: Matrix3d; cameraOn?: boolean; gridOn?: boolean } = {}) {
  const state = {
    rotation: init.rotation?.clone() ?? Matrix3d.createIdentity(),
    cameraOn: init.cameraOn ?? false,
    eye: Point3d.create(5, -3, 8),
    center: Point3d.create(1, 1, 0),
    grid: init.gridOn ?? false,
  };
  const calls = {
    setStandardRotation: [] as unknown[],
    setRotation: [] as Matrix3d[],
    lookAt: [] as LookAtArgs[],
    turnCameraOff: 0,
    synchWithView: 0,
    invalidateScene: 0,
  };
  const makeFlags = (grid: boolean) => ({
    grid,
    with: (_prop: string, value: boolean) => makeFlags(value),
  });
  const fake = {
    view: {
      getRotation: () => state.rotation,
      setRotation: (rot: Matrix3d) => {
        calls.setRotation.push(rot);
        state.rotation = rot.clone();
      },
      get isCameraOn() {
        return state.cameraOn;
      },
      is3d: () => true,
      turnCameraOff: () => {
        calls.turnCameraOff += 1;
        state.cameraOn = false;
      },
      getEyePoint: () => state.eye,
      getCenter: () => state.center,
      lookAt: (args: LookAtArgs) => {
        calls.lookAt.push(args);
        state.cameraOn = true;
      },
    },
    get viewFlags() {
      return makeFlags(state.grid);
    },
    set viewFlags(flags: { grid: boolean }) {
      state.grid = flags.grid;
    },
    setStandardRotation: (id: unknown) => {
      calls.setStandardRotation.push(id);
    },
    synchWithView: () => {
      calls.synchWithView += 1;
    },
    invalidateScene: () => {
      calls.invalidateScene += 1;
    },
  };
  return { viewport: fake as unknown as Viewport, state, calls };
}

function rotatedMatrix(): Matrix3d {
  const rot = Matrix3d.createRotationAroundVector(
    Vector3d.unitX(),
    Angle.createDegrees(30),
  );
  expect(rot).not.toBeUndefined();
  return rot!;
}

describe('sketchModeView（T6.5 草图模式视口行为）', () => {
  it('captureSketchView：正交视图捕获旋转克隆（矩阵独立，后续改动不影响快照）', () => {
    const { viewport, state } = createFakeViewport({ rotation: rotatedMatrix() });
    const snapshot = captureSketchView(viewport);

    expect(snapshot.cameraOn).toBe(false);
    expect(snapshot.eye).toBeUndefined();
    expect(snapshot.rotation.isAlmostEqual(rotatedMatrix())).toBe(true);
    // 克隆独立性：改原矩阵，快照不变
    state.rotation.setFrom(Matrix3d.createIdentity());
    expect(snapshot.rotation.isAlmostEqual(rotatedMatrix())).toBe(true);
  });

  it('captureSketchView：透视相机补 eye/center/up（up = 旋转矩阵 rowY）', () => {
    const rotation = rotatedMatrix();
    const { viewport } = createFakeViewport({ rotation, cameraOn: true });
    const snapshot = captureSketchView(viewport);

    expect(snapshot.cameraOn).toBe(true);
    expect(snapshot.eye?.isAlmostEqual(Point3d.create(5, -3, 8))).toBe(true);
    expect(snapshot.center?.isAlmostEqual(Point3d.create(1, 1, 0))).toBe(true);
    expect(snapshot.up?.isAlmostEqual(rotation.rowY())).toBe(true);
  });

  it('applySketchTopView：setStandardRotation(Top) + turnCameraOff + synchWithView', () => {
    const { viewport, calls } = createFakeViewport({ cameraOn: true });
    applySketchTopView(viewport);

    expect(calls.setStandardRotation).toEqual(['StandardViewId.Top']);
    expect(calls.turnCameraOff).toBe(1);
    expect(calls.synchWithView).toBe(1);
  });

  it('restoreSketchView：正交快照走 setRotation 回放（不碰 lookAt）', () => {
    const original = rotatedMatrix();
    const { viewport, calls } = createFakeViewport({ rotation: Matrix3d.createIdentity() });
    const snapshot = captureSketchView(viewport);
    // 模拟草图期间被俯视旋转
    viewport.view.setRotation(original);
    restoreSketchView(viewport, snapshot);

    expect(calls.setRotation).toHaveLength(2); // 1 次模拟 + 1 次恢复
    expect(calls.setRotation[1].isAlmostEqual(snapshot.rotation)).toBe(true);
    expect(calls.lookAt).toHaveLength(0);
    expect(calls.synchWithView).toBe(1);
  });

  it('restoreSketchView：透视快照走 lookAt 回放 eye/center/up（相机重新打开）', () => {
    const { viewport, state, calls } = createFakeViewport({ rotation: rotatedMatrix(), cameraOn: true });
    const snapshot = captureSketchView(viewport);
    // 模拟草图期间转俯视 + 关相机
    state.cameraOn = false;
    restoreSketchView(viewport, snapshot);

    expect(calls.lookAt).toHaveLength(1);
    expect(calls.lookAt[0].eyePoint.isAlmostEqual(Point3d.create(5, -3, 8))).toBe(true);
    expect(calls.lookAt[0].targetPoint.isAlmostEqual(Point3d.create(1, 1, 0))).toBe(true);
    expect(calls.lookAt[0].upVector.isAlmostEqual(snapshot.up!)).toBe(true);
    expect(state.cameraOn).toBe(true);
    expect(calls.setRotation).toHaveLength(0);
  });

  it('setGridDisplayed：返回进入前状态；变更时写 viewFlags + invalidateScene', () => {
    const { viewport, state, calls } = createFakeViewport({ gridOn: false });
    const wasOn = setGridDisplayed(viewport, true);

    expect(wasOn).toBe(false);
    expect(state.grid).toBe(true);
    expect(calls.invalidateScene).toBe(1);

    // 状态未变 → 不重绘
    setGridDisplayed(viewport, true);
    expect(calls.invalidateScene).toBe(1);
  });

  it('round-trip：进入（捕获+俯视+栅格开）→ 退出（旋转/栅格/相机全还原）', () => {
    const originalRotation = rotatedMatrix();
    const { viewport, state, calls } = createFakeViewport({
      rotation: originalRotation,
      cameraOn: true,
      gridOn: false,
    });

    // ── 进入 ──
    const snapshot = captureSketchView(viewport);
    applySketchTopView(viewport);
    const gridWasOn = setGridDisplayed(viewport, true);
    expect(state.cameraOn).toBe(false); // 俯视 + 正交化
    expect(state.grid).toBe(true);
    expect(gridWasOn).toBe(false);

    // ── 退出 ──
    restoreSketchView(viewport, snapshot);
    setGridDisplayed(viewport, gridWasOn);
    expect(state.rotation.isAlmostEqual(originalRotation)).toBe(true);
    expect(state.cameraOn).toBe(true);
    expect(state.grid).toBe(false);
    expect(calls.synchWithView).toBe(2);
  });

  it('round-trip：进入前栅格本就开着 → 退出后仍开（还原而非强制关）', () => {
    const { viewport, state } = createFakeViewport({ gridOn: true });
    const snapshot = captureSketchView(viewport);
    const gridWasOn = setGridDisplayed(viewport, true);
    expect(gridWasOn).toBe(true);
    expect(state.grid).toBe(true);

    restoreSketchView(viewport, snapshot);
    setGridDisplayed(viewport, gridWasOn);
    expect(state.grid).toBe(true);
  });

  it('二次进入：快照重新捕获（Editor 层用后即弃——快照引用不跨轮次存活）', () => {
    const { viewport, calls } = createFakeViewport({ rotation: rotatedMatrix() });
    const enterExit = (): void => {
      const snapshot = captureSketchView(viewport);
      applySketchTopView(viewport);
      const gridWasOn = setGridDisplayed(viewport, true);
      restoreSketchView(viewport, snapshot);
      setGridDisplayed(viewport, gridWasOn);
    };
    enterExit();
    enterExit();
    // 每轮：1 次俯视 + 1 次恢复；setStandardRotation/setRotation 次数严格 2（无重复恢复）
    expect(calls.setStandardRotation).toHaveLength(2);
    expect(calls.setRotation).toHaveLength(2);
  });
});
