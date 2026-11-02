/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 右停靠显示设置面板测试（2026-11-02）：六模式/透视 FOV/AO 联动/恢复默认，
 * 以及视口未就绪时诚实禁用。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DisplaySettingsPanel } from '../components/DisplaySettingsPanel.js';
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from '../internal/display-actions.js';

function renderPanel(patch: Partial<DisplaySettings> = {}, viewportReady = true) {
  const update = vi.fn();
  const reset = vi.fn();
  const utils = render(
    <DisplaySettingsPanel
      settings={{ ...DEFAULT_DISPLAY_SETTINGS, ...patch }}
      update={update}
      reset={reset}
      viewportReady={viewportReady}
    />,
  );
  return { ...utils, update, reset };
}

describe('DisplaySettingsPanel', () => {
  it('renders the six Onshape display modes and writes changes through update', async () => {
    const user = userEvent.setup();
    const { update } = renderPanel();
    const select = screen.getByTestId('part-studio-display-settings-mode') as HTMLSelectElement;
    expect(select.options).toHaveLength(6);
    await user.selectOptions(select, 'shaded-hidden-edges');
    expect(update).toHaveBeenCalledWith({ mode: 'shaded-hidden-edges' });
  });

  it('gates FOV on perspective and AO intensity on AO', async () => {
    const user = userEvent.setup();
    const { update, unmount } = renderPanel();
    const fov = screen.getByTestId('part-studio-display-settings-fov') as HTMLInputElement;
    const aoIntensity = screen.getByTestId('part-studio-display-settings-ao-intensity') as HTMLInputElement;
    expect(fov.disabled).toBe(true);
    expect(aoIntensity.disabled).toBe(false);
    await user.click(screen.getByTestId('part-studio-display-settings-perspective'));
    expect(update).toHaveBeenCalledWith({ perspective: true });
    unmount();

    renderPanel({ ambientOcclusion: false });
    expect((screen.getByTestId('part-studio-display-settings-ao-intensity') as HTMLInputElement).disabled).toBe(true);
  });

  it('toggles rendering options and restores defaults', async () => {
    const user = userEvent.setup();
    const { update, reset } = renderPanel();
    await user.click(screen.getByTestId('part-studio-display-settings-shadows'));
    expect(update).toHaveBeenCalledWith({ shadows: true });
    await user.click(screen.getByTestId('part-studio-display-settings-ao'));
    expect(update).toHaveBeenCalledWith({ ambientOcclusion: false });
    await user.selectOptions(screen.getByTestId('part-studio-display-settings-antialias'), '8');
    expect(update).toHaveBeenCalledWith({ antialiasSamples: 8 });
    await user.selectOptions(screen.getByTestId('part-studio-display-settings-background'), 'dark');
    expect(update).toHaveBeenCalledWith({ background: 'dark' });
    await user.click(screen.getByTestId('part-studio-display-settings-reset'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('honestly disables every control without a viewport', () => {
    renderPanel({}, false);
    expect((screen.getByTestId('part-studio-display-settings-mode') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('part-studio-display-settings-shadows') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('part-studio-display-settings-reset') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-display-settings-no-viewport')).toBeDefined();
  });
});
