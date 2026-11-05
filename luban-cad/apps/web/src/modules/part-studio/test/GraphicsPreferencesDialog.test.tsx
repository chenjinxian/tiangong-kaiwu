/**
 * Onshape 图形首选项（2026-11-05 live 对齐）：结构/默认值/tab/已支持项写回/
 * 未支持项禁用/取消回滚。
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DISPLAY_SETTINGS } from '../internal/display-actions.js';
import { GraphicsPreferencesDialog } from '../dialogs/GraphicsPreferencesDialog.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';

function result(overrides: Partial<UseDisplaySettingsResult> = {}): UseDisplaySettingsResult {
  return {
    settings: DEFAULT_DISPLAY_SETTINGS,
    update: vi.fn(),
    reset: vi.fn(),
    viewportReady: true,
    ...overrides,
  };
}

function renderDialog(overrides: Partial<UseDisplaySettingsResult> = {}, onClose = vi.fn()) {
  const displaySettings = result(overrides);
  render(<GraphicsPreferencesDialog displaySettings={displaySettings} onClose={onClose} />);
  return { displaySettings, onClose };
}

describe('GraphicsPreferencesDialog（Onshape 图形首选项）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('渲染标题、常规/草图 tab 与 Onshape 默认值', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: '图形首选项' })).toBeDefined();
    expect(screen.getByTestId('gfx-tab-general').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('gfx-tab-sketch').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('gfx-row-ao').textContent).toContain('20 %');
    expect(screen.getByTestId('gfx-row-fov').textContent).toContain('45 deg');
    expect(screen.getByTestId('gfx-row-edge-width').textContent).toContain('2 px');
    expect(screen.getByTestId('gfx-row-glossiness').textContent).toContain('3 %');
    // 未支持项：仍显示 Onshape 字段，但禁用并带 info。
    expect((screen.getByTestId('gfx-specular-color') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('gfx-row-hatch-width').className).toContain('part-studio-gfx__row--disabled');
  });

  it('已支持项写回共享设置（AO/FOV/线宽/光泽度）', () => {
    const { displaySettings } = renderDialog();
    fireEvent.change(screen.getByTestId('gfx-ao'), { target: { value: '0' } });
    expect(displaySettings.update).toHaveBeenCalledWith({ ambientOcclusion: false, aoIntensityPct: 0 });
    fireEvent.change(screen.getByTestId('gfx-fov'), { target: { value: '60' } });
    expect(displaySettings.update).toHaveBeenCalledWith({ fovDegrees: 60 });
    fireEvent.change(screen.getByTestId('gfx-edge-width'), { target: { value: '3' } });
    expect(displaySettings.update).toHaveBeenCalledWith({ edgeWidthPx: 3 });
    fireEvent.change(screen.getByTestId('gfx-glossiness'), { target: { value: '10' } });
    expect(displaySettings.update).toHaveBeenCalledWith({ glossinessPct: 10 });
  });

  it('草图 tab 呈现 Onshape 分组与禁用字段', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId('gfx-tab-sketch'));
    expect(screen.getByTestId('gfx-section-active-sketch')).toBeDefined();
    expect(screen.getByTestId('gfx-section-inactive-sketch')).toBeDefined();
    expect(screen.getByTestId('gfx-section-construction')).toBeDefined();
    expect((screen.getByTestId('gfx-constraint-color') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('gfx-row-active-sketch-width').className).toContain('part-studio-gfx__row--disabled');
  });

  it('取消恢复打开时快照并关闭；确认直接关闭；重置调用共享 reset', async () => {
    const user = userEvent.setup();
    const initial = { ...DEFAULT_DISPLAY_SETTINGS, fovDegrees: 60 };
    const displaySettings = result({ settings: initial });
    const onClose = vi.fn();
    render(<GraphicsPreferencesDialog displaySettings={displaySettings} onClose={onClose} />);
    await user.click(screen.getByTestId('gfx-cancel'));
    expect(displaySettings.update).toHaveBeenCalledWith(initial);
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    cleanup();
    render(<GraphicsPreferencesDialog displaySettings={displaySettings} onClose={onClose} />);
    await user.click(screen.getByTestId('gfx-confirm'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('gfx-reset'));
    expect(displaySettings.reset).toHaveBeenCalledTimes(1);
  });

  it('折叠分组可收起/展开', async () => {
    const user = userEvent.setup();
    renderDialog();
    const header = screen.getByRole('button', { name: '视口' });
    expect(screen.getByTestId('gfx-row-ao')).toBeDefined();
    await user.click(header);
    expect(screen.queryByTestId('gfx-row-ao')).toBeNull();
    await user.click(header);
    expect(screen.getByTestId('gfx-row-ao')).toBeDefined();
  });
});
