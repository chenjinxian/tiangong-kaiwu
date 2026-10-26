// @vitest-environment jsdom
/**
 * DisplaySettingsPanel 组件测试（渲染对齐阶段 2）：五态选项渲染、透视/FOV
 * 联动禁用、AO 联动、改动即应用（applyDisplaySettings 调用断言）、视口
 * 缺席态（全禁用 + 提示）。display-actions 模块 mock（组件唯一行为出口）。
 * 断言口径随仓内惯例（element.disabled 直断——无 jest-dom matcher）。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyMock = vi.fn<(s: unknown) => boolean>(() => true);

vi.mock('../internal/display-actions.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../internal/display-actions.js')>();
  return { ...actual, applyDisplaySettings: (s: unknown) => applyMock(s) };
});

import { DisplaySettingsPanel } from '../components/DisplaySettingsPanel.js';
import { DEFAULT_DISPLAY_SETTINGS } from '../internal/display-actions.js';

beforeEach(() => { applyMock.mockClear().mockReturnValue(true); });

const disabled = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).disabled;

describe('DisplaySettingsPanel（显示设置真面板）', () => {
  it('五态显示模式全量在选项里（Onshape 六态减 Translucent）', async () => {
    render(<DisplaySettingsPanel />);
    const select = await screen.findByTestId('part-studio-display-settings-mode');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      '着色（含边线）', '着色（不含边线）', '着色（含隐藏边）', '隐藏边移除', '隐藏边可见',
    ]);
  });

  it('切换模式 → 以新 mode 应用', async () => {
    const user = userEvent.setup();
    render(<DisplaySettingsPanel />);
    await user.selectOptions(screen.getByTestId('part-studio-display-settings-mode'), 'hidden-visible');
    const last = applyMock.mock.calls.at(-1)?.[0] as { mode: string };
    expect(last.mode).toBe('hidden-visible');
  });

  it('FOV/遮蔽强度滑杆随开关联动禁用（Onshape 语义：FOV 仅透视可用）', async () => {
    const user = userEvent.setup();
    render(<DisplaySettingsPanel />);
    expect(disabled('part-studio-display-settings-fov')).toBe(true);
    expect(disabled('part-studio-display-settings-ao-intensity')).toBe(true);
    await user.click(screen.getByTestId('part-studio-display-settings-perspective'));
    expect(disabled('part-studio-display-settings-fov')).toBe(false);
    await user.click(screen.getByTestId('part-studio-display-settings-ao'));
    expect(disabled('part-studio-display-settings-ao-intensity')).toBe(false);
  });

  it('边线宽滑杆 1-3px → 应用值透传', () => {
    render(<DisplaySettingsPanel />);
    fireEvent.change(screen.getByTestId('part-studio-display-settings-edge-width'), { target: { value: '2' } });
    const last = applyMock.mock.calls.at(-1)?.[0] as { edgeWidthPx: number };
    expect(last.edgeWidthPx).toBe(2);
  });

  it('视口未就绪（apply 返回 false）→ 控件禁用 + 提示在场', () => {
    applyMock.mockReturnValue(false);
    render(<DisplaySettingsPanel />);
    expect(disabled('part-studio-display-settings-mode')).toBe(true);
    expect(screen.getByTestId('part-studio-display-settings-no-viewport')).toBeDefined();
  });

  it('挂载即应用缺省（=render-profile 基线 + AO 关）', () => {
    render(<DisplaySettingsPanel />);
    expect(applyMock).toHaveBeenCalledWith(DEFAULT_DISPLAY_SETTINGS);
  });
});
