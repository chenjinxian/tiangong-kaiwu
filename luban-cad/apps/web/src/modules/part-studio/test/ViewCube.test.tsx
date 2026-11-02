/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 风格 ViewCube 行为测试（2026-11-02）：六面/四角在场、朝向实时同步、
 * 面点击标准视图、下拉菜单显示设置与「更多」接线。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Matrix3d, Vector3d } from '@itwin/core-geometry';
import { StandardViewId, type ScreenViewport } from '@itwin/core-frontend';
import { ViewCube } from '../components/ViewCube.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import { DEFAULT_DISPLAY_SETTINGS } from '../internal/display-actions.js';

interface FakeViewport {
  viewport: ScreenViewport;
  setRotation: ReturnType<typeof vi.fn>;
  setStandardRotation: ReturnType<typeof vi.fn>;
  turnCameraOff: ReturnType<typeof vi.fn>;
  synchWithView: ReturnType<typeof vi.fn>;
  lookAtVolume: ReturnType<typeof vi.fn>;
  listeners: Set<() => void>;
  raiseViewChanged: () => void;
  rotation: Matrix3d;
}

function fakeViewport(rotation = Matrix3d.createIdentity()): FakeViewport {
  const setRotation = vi.fn();
  const setStandardRotation = vi.fn();
  const turnCameraOff = vi.fn();
  const synchWithView = vi.fn();
  const lookAtVolume = vi.fn();
  const listeners = new Set<() => void>();
  let current = rotation;
  const viewport = {
    view: {
      getRotation: () => current,
      setRotation: (m: Matrix3d) => { current = m; setRotation(m); },
      is3d: () => true,
      turnCameraOff,
      lookAtVolume,
      computeFitRange: () => ({ low: Vector3d.createZero(), high: Vector3d.create(1, 1, 1) }),
    },
    viewRect: { aspect: 1.5 },
    setStandardRotation,
    synchWithView,
    onViewChanged: {
      addListener: (cb: () => void) => listeners.add(cb),
      removeListener: (cb: () => void) => listeners.delete(cb),
    },
  } as unknown as ScreenViewport;
  return {
    viewport,
    setRotation,
    setStandardRotation,
    turnCameraOff,
    synchWithView,
    lookAtVolume,
    listeners,
    raiseViewChanged: () => listeners.forEach((cb) => cb()),
    get rotation() { return current; },
  };
}

function displaySettings(update = vi.fn()): UseDisplaySettingsResult {
  return {
    settings: DEFAULT_DISPLAY_SETTINGS,
    update,
    reset: vi.fn(),
    viewportReady: true,
  };
}

beforeEach(() => {
  usePartStudioStore.setState({ dock: { activeTab: 'toolSettings', isOpen: false } });
});

describe('ViewCube', () => {
  it('renders six faces, four corners and the cube stage', () => {
    const fake = fakeViewport();
    render(<ViewCube viewport={fake.viewport} />);
    for (const face of ['front', 'back', 'left', 'right', 'top', 'bottom'])
      expect(screen.getByTestId(`viewcube-face-${face}`)).toBeDefined();
    for (const corner of ['top-front-left', 'top-front-right', 'top-back-left', 'top-back-right'])
      expect(screen.getByTestId(`viewcube-corner-${corner}`)).toBeDefined();
    expect(screen.getByTestId('part-studio-viewcube')).toBeDefined();
  });

  it('synchronizes the CSS cube transform from the viewport rotation and view changes', () => {
    const fake = fakeViewport();
    render(<ViewCube viewport={fake.viewport} />);
    const cube = screen.getByTestId('part-studio-viewcube').querySelector('.part-studio-viewcube__cube') as HTMLElement;
    expect(cube.style.transform).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');

    const custom = Matrix3d.createRowValues(0, -1, 0, 1, 0, 0, 0, 0, 1);
    fake.viewport.view.setRotation(custom);
    act(() => fake.raiseViewChanged());
    expect(cube.style.transform).toBe('matrix3d(0,-1,0,0,1,0,0,0,0,0,1,0,0,0,0,1)');
  });

  it('re-renders when core mutates the rotation matrix in place', () => {
    const shared = Matrix3d.createIdentity();
    const fake = fakeViewport(shared);
    render(<ViewCube viewport={fake.viewport} />);
    const labels = (): string[] =>
      [...document.querySelectorAll('.part-studio-viewcube__face-label')].map((el) => el.textContent ?? '');
    expect(labels()).toEqual(['上']);

    // iTwin setRotation 可能原地 setFrom 同一实例：ViewCube 必须克隆快照。
    shared.setFrom(Matrix3d.createRowValues(
      0.707106781186548, 0.707106781186548, 0,
      -0.408248290463863, 0.408248290463863, 0.816496580927726,
      0.577350269189626, -0.577350269189626, 0.577350269189626,
    ));
    act(() => fake.raiseViewChanged());
    expect(labels()).toHaveLength(3);
  });

  it('renders screen-aligned labels for the faces currently facing the viewer', () => {
    const fake = fakeViewport();
    render(<ViewCube viewport={fake.viewport} />);
    const labels = (): string[] =>
      [...document.querySelectorAll('.part-studio-viewcube__face-label')].map((el) => el.textContent ?? '');
    expect(labels()).toEqual(['上']);

    fake.viewport.view.setRotation(Matrix3d.createRowValues(
      0.707106781186548, 0.707106781186548, 0,
      -0.408248290463863, 0.408248290463863, 0.816496580927726,
      0.577350269189626, -0.577350269189626, 0.577350269189626,
    ));
    act(() => fake.raiseViewChanged());
    // 右前上 iso：Top/Front/Right 三面可见，标签保持屏幕水平。
    const shown = labels();
    expect(shown).toHaveLength(3);
    for (const label of ['上', '右', '前'])
      expect(shown).toContain(label);
  });

  it('sets a standard top view when the front-facing cube face is clicked', async () => {
    const user = userEvent.setup();
    const iso = Matrix3d.createRowValues(
      0.707106781186548, 0.707106781186548, 0,
      -0.408248290463863, 0.408248290463863, 0.816496580927726,
      0.577350269189626, -0.577350269189626, 0.577350269189626,
    );
    const fake = fakeViewport(iso);
    // 程序化换视图不会 raise onViewChanged：fake 模拟真实 rotation 变化，
    // ViewCube 必须在动作后显式回读。
    fake.setStandardRotation.mockImplementation(() => {
      fake.viewport.view.setRotation(Matrix3d.createIdentity());
    });
    render(<ViewCube viewport={fake.viewport} />);
    expect(screen.getAllByText('上')).toHaveLength(1);
    await user.click(screen.getByTestId('viewcube-face-top'));
    expect(fake.setStandardRotation).toHaveBeenCalledWith(StandardViewId.Top);
    expect(fake.turnCameraOff).toHaveBeenCalledTimes(1);
    expect(fake.synchWithView).toHaveBeenCalledWith({});
    // Top 视图：只显示朝屏幕的 Top 面标签，cube 回到单位矩阵。
    expect([...document.querySelectorAll('.part-studio-viewcube__face-label')].map((el) => el.textContent))
      .toEqual(['上']);
    const cube = document.querySelector('.part-studio-viewcube__cube') as HTMLElement;
    expect(cube.style.transform).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });

  it('orbits the camera by dragging the cube', () => {
    const fake = fakeViewport();
    render(<ViewCube viewport={fake.viewport} />);
    const stage = screen.getByTestId('part-studio-viewcube').querySelector('.part-studio-viewcube__stage') as HTMLElement;
    // jsdom 未实现 pointer capture；拖拽只依赖 pointer 事件坐标。
    Object.defineProperty(stage, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(stage, 'hasPointerCapture', { value: () => false });

    fireEvent.pointerDown(stage, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 40, clientY: 10, pointerId: 1 });

    expect(fake.setRotation).toHaveBeenCalledTimes(1);
    const next = fake.setRotation.mock.calls[0]![0] as Matrix3d;
    expect(next.rowZ().isExactEqual(Matrix3d.createIdentity().rowZ())).toBe(false);
  });

  it('opens the settings popover only when display settings are supplied', async () => {
    const user = userEvent.setup();
    const fake = fakeViewport();
    const { unmount } = render(<ViewCube viewport={fake.viewport} />);
    expect(screen.queryByTestId('viewcube-menu-trigger')).toBeNull();
    unmount();

    render(<ViewCube viewport={fake.viewport} displaySettings={displaySettings()} />);
    expect(screen.getByTestId('viewcube-menu-trigger')).toBeDefined();
    await user.click(screen.getByTestId('viewcube-menu-trigger'));
    expect(screen.getByTestId('viewcube-menu')).toBeDefined();
  });

  it('writes display-mode / perspective changes through the shared update callback', async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const fake = fakeViewport();
    render(<ViewCube viewport={fake.viewport} displaySettings={displaySettings(update)} />);
    await user.click(screen.getByTestId('viewcube-menu-trigger'));

    await user.selectOptions(screen.getByTestId('viewcube-mode'), 'hidden-removed');
    expect(update).toHaveBeenCalledWith({ mode: 'hidden-removed' });

    await user.click(screen.getByTestId('viewcube-perspective'));
    expect(update).toHaveBeenCalledWith({ perspective: true });
  });

  it('opens the dock display tab from the more button', async () => {
    const user = userEvent.setup();
    const fake = fakeViewport();
    render(<ViewCube viewport={fake.viewport} displaySettings={displaySettings()} />);
    await user.click(screen.getByTestId('viewcube-menu-trigger'));
    await user.click(screen.getByTestId('viewcube-more'));
    expect(usePartStudioStore.getState().dock).toEqual({ activeTab: 'display', isOpen: true });
  });
});
