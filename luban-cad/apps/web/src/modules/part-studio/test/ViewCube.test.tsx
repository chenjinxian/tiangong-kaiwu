/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 风格 ViewCube 行为测试（2026-11-02 重做）：150px stage/无圆环角点/
 * 朝向实时同步/面点击标准视图/角点 trimetric/菜单结构/关闭语义/菜单动作接线。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Matrix3d, Vector3d } from '@itwin/core-geometry';
import { IModelApp, StandardViewId, type ScreenViewport } from '@itwin/core-frontend';
import { ViewCube } from '../components/ViewCube.js';
import { viewRotationFromDirection } from '../internal/view-orientation.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from '../internal/display-actions.js';

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
      isSpatialView: () => true,
      modelSelector: { models: ['model-1'] },
      turnCameraOff,
      lookAtVolume,
      computeFitRange: () => ({ low: Vector3d.createZero(), high: Vector3d.create(1, 1, 1) }),
    },
    iModel: {
      models: {
        queryModelRanges: async () => [{ low: [0, 0, 0], high: [1, 1, 1] }],
      },
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

function displaySettings(
  update = vi.fn(),
  settings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS,
): UseDisplaySettingsResult {
  return {
    settings,
    update,
    reset: vi.fn(),
    viewportReady: true,
  };
}

const ISO_ROTATION = Matrix3d.createRowValues(
  0.707106781186548, 0.707106781186548, 0,
  -0.408248290463863, 0.408248290463863, 0.816496580927726,
  0.577350269189626, -0.577350269189626, 0.577350269189626,
);
const FREE_ROTATION = viewRotationFromDirection(Vector3d.create(0.4, -0.7, 0.55))!;

beforeEach(() => {
  usePartStudioStore.setState({ dock: { activeTab: 'toolSettings', isOpen: false } });
  vi.restoreAllMocks();
});

describe('ViewCube', () => {
  it('renders the six faces and invisible corner hit zones, without the old ring/corner-dot chrome', () => {
    const fake = fakeViewport(ISO_ROTATION);
    render(<ViewCube viewport={fake.viewport} />);
    for (const face of ['front', 'back', 'left', 'right', 'top', 'bottom'])
      expect(screen.getByTestId(`viewcube-face-${face}`)).toBeDefined();
    expect(document.querySelector('.part-studio-viewcube__ring')).toBeNull();
    expect(document.querySelector('.part-studio-viewcube__corner')).toBeNull();
    expect(screen.getByTestId('viewcube-corner-front-top-right')).toBeDefined();
    expect(screen.getByTestId('part-studio-viewcube')).toBeDefined();
    expect(document.querySelector('.part-studio-viewcube__compass')).not.toBeNull();
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
    const cube = screen.getByTestId('part-studio-viewcube').querySelector('.part-studio-viewcube__cube') as HTMLElement;
    const before = cube.style.transform;
    shared.setFrom(ISO_ROTATION);
    act(() => fake.raiseViewChanged());
    expect(cube.style.transform).not.toBe(before);
  });

  it('renders screen-aligned localized labels for the three visible faces', () => {
    const fake = fakeViewport(ISO_ROTATION);
    render(<ViewCube viewport={fake.viewport} />);
    // Onshape live：标签是屏幕对齐的直立文字，只渲染朝前的三个面。
    const labels = [...document.querySelectorAll('.part-studio-viewcube__face-label')]
      .map((el) => el.textContent ?? '')
      .sort();
    expect(labels).toEqual(['上', '右', '前'].sort());
    for (const face of ['top', 'front', 'right']) {
      const button = screen.getByTestId(`viewcube-face-${face}`);
      expect(button.getAttribute('aria-label')).toMatch(/上|前|右/);
    }
  });

  it('shows the home control only for free (non-standard) camera views', () => {
    const iso = fakeViewport(ISO_ROTATION);
    const first = render(<ViewCube viewport={iso.viewport} />);
    expect(screen.queryByTestId('viewcube-home')).toBeNull();
    first.unmount();

    const top = fakeViewport(Matrix3d.createIdentity());
    const second = render(<ViewCube viewport={top.viewport} />);
    expect(screen.queryByTestId('viewcube-home')).toBeNull();
    second.unmount();

    const free = fakeViewport(FREE_ROTATION);
    render(<ViewCube viewport={free.viewport} />);
    expect(screen.getByTestId('viewcube-home')).not.toBeNull();
  });

  it('sets a standard top view when a cube face is clicked', async () => {
    const user = userEvent.setup();
    const fake = fakeViewport(ISO_ROTATION);
    fake.setStandardRotation.mockImplementation(() => {
      fake.viewport.view.setRotation(Matrix3d.createIdentity());
    });
    render(<ViewCube viewport={fake.viewport} />);
    await user.click(screen.getByTestId('viewcube-face-top'));
    expect(fake.setStandardRotation).toHaveBeenCalledWith(StandardViewId.Top);
    expect(fake.turnCameraOff).toHaveBeenCalledTimes(1);
    expect(fake.synchWithView).toHaveBeenCalledWith({});
  });

  it('does not orbit on drag (Onshape ViewCube is click-only)', () => {
    const fake = fakeViewport();
    render(<ViewCube viewport={fake.viewport} />);
    const stage = screen.getByTestId('part-studio-viewcube').querySelector('.part-studio-viewcube__stage') as HTMLElement;
    fireEvent.pointerDown(stage, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 40, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 40, clientY: 10, pointerId: 1 });
    expect(fake.setRotation).not.toHaveBeenCalled();
  });

  it('uses an animated frustum transition when the viewport supports it', async () => {
    const user = userEvent.setup();
    const fake = fakeViewport(ISO_ROTATION);
    const animate = vi.fn();
    (fake.viewport as unknown as { animateFrustumChange: typeof animate }).animateFrustumChange = animate;
    render(<ViewCube viewport={fake.viewport} />);
    await user.click(screen.getByTestId('viewcube-face-top'));
    expect(animate).toHaveBeenCalledWith({ animationTime: 180 });
  });

  it('always renders the borderless mini-cube trigger and opens the Onshape menu', async () => {
    const user = userEvent.setup();
    render(<ViewCube viewport={fakeViewport().viewport} />);
    const trigger = screen.getByTestId('viewcube-menu-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByTestId('viewcube-menu');
    for (const id of [
      'viewcube-menu-iso', 'viewcube-menu-dimetric', 'viewcube-menu-trimetric',
      'viewcube-menu-zoom-fit', 'viewcube-menu-zoom-window',
    ])
      expect(screen.getByTestId(id)).toBeDefined();
    expect(menu).toBeDefined();
    // 2026-11-05 Onshape live：未实现项保持菜单完整外观，但禁用并带 aria-disabled。
    expect(screen.getByTestId('viewcube-menu-named-views').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('viewcube-menu-section').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('viewcube-menu-previous-view').getAttribute('aria-disabled')).toBe('true');
  });

  it('草图激活时相机菜单提供「正视草图平面」命令（Onshape 视图菜单，非草图对话框）', async () => {
    const user = userEvent.setup();
    const onViewNormalToSketch = vi.fn();
    render(<ViewCube viewport={fakeViewport().viewport} onViewNormalToSketch={onViewNormalToSketch} />);
    await user.click(screen.getByTestId('viewcube-menu-trigger'));
    const item = screen.getByTestId('viewcube-menu-view-normal-to-sketch');
    expect(item.textContent).toContain('正视草图平面');
    await user.click(item);
    expect(onViewNormalToSketch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('viewcube-menu')).toBeNull();
  });

  it('closes on outside pointer-down and Escape returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ViewCube viewport={fakeViewport().viewport} />);
    const trigger = screen.getByTestId('viewcube-menu-trigger');
    await user.click(trigger);
    expect(screen.getByTestId('viewcube-menu')).toBeDefined();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('viewcube-menu')).toBeNull();

    await user.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('viewcube-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('writes orientation, perspective, display-mode, and quality changes through the shared settings callback', async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    const fake = fakeViewport();
    render(<ViewCube
      viewport={fake.viewport}
      displaySettings={displaySettings(update, { ...DEFAULT_DISPLAY_SETTINGS, antialiasSamples: 1 })}
    />);
    const trigger = screen.getByTestId('viewcube-menu-trigger');

    await user.click(trigger);
    await user.click(screen.getByTestId('viewcube-menu-iso'));
    expect(fake.setRotation).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('viewcube-menu')).toBeNull();

    await user.click(trigger);
    await user.click(screen.getByTestId('viewcube-menu-perspective'));
    expect(update).toHaveBeenCalledWith({ perspective: true });

    fireEvent.click(screen.getByTestId('viewcube-menu-shaded'));
    expect(screen.getByTestId('viewcube-submenu-shaded')).toBeDefined();
    fireEvent.click(screen.getByTestId('viewcube-mode-translucent'));
    expect(update).toHaveBeenCalledWith({ mode: 'translucent' });

    await user.click(screen.getByTestId('viewcube-menu-high-quality'));
    expect(update).toHaveBeenCalledWith({ antialiasSamples: 4 });
  });

  it('opens the hidden-edges submenu and maps visible/removed modes', async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    render(<ViewCube viewport={fakeViewport().viewport} displaySettings={displaySettings(update)} />);
    await user.click(screen.getByTestId('viewcube-menu-trigger'));
    fireEvent.click(screen.getByTestId('viewcube-menu-hidden'));
    expect(screen.getByTestId('viewcube-submenu-hidden')).toBeDefined();
    fireEvent.click(screen.getByTestId('viewcube-mode-hidden-visible'));
    expect(update).toHaveBeenCalledWith({ mode: 'hidden-visible' });
  });

  it('fits the view and starts the window-zoom tool', async () => {
    const user = userEvent.setup();
    const fake = fakeViewport();
    const run = vi.spyOn(IModelApp.tools, 'run').mockResolvedValue(true as never);
    render(<ViewCube viewport={fake.viewport} displaySettings={displaySettings()} />);
    await user.click(screen.getByTestId('viewcube-menu-trigger'));
    await user.click(screen.getByTestId('viewcube-menu-zoom-fit'));
    await waitFor(() => expect(fake.lookAtVolume).toHaveBeenCalledTimes(1));
    expect(fake.synchWithView).toHaveBeenCalledWith({});

    await user.click(screen.getByTestId('viewcube-menu-trigger'));
    await user.click(screen.getByTestId('viewcube-menu-zoom-window'));
    expect(run).toHaveBeenCalledWith('View.WindowArea');
  });

  it('invokes the host Graphics preferences callback (not the dock)', async () => {
    const user = userEvent.setup();
    const onOpenGraphicsPreferences = vi.fn();
    render(
      <ViewCube
        viewport={fakeViewport().viewport}
        displaySettings={displaySettings()}
        onOpenGraphicsPreferences={onOpenGraphicsPreferences}
      />,
    );
    await user.click(screen.getByTestId('viewcube-menu-trigger'));
    await user.click(screen.getByTestId('viewcube-menu-graphics'));
    expect(onOpenGraphicsPreferences).toHaveBeenCalledTimes(1);
    expect(usePartStudioStore.getState().dock).toEqual({ activeTab: 'toolSettings', isOpen: false });
  });

  it('applies a trimetric direction when a cube corner hotspot is clicked', async () => {
    const user = userEvent.setup();
    const fake = fakeViewport(ISO_ROTATION);
    render(<ViewCube viewport={fake.viewport} />);
    await user.click(screen.getByTestId('viewcube-corner-front-top-right'));
    expect(fake.setRotation).toHaveBeenCalledTimes(1);
  });
});
