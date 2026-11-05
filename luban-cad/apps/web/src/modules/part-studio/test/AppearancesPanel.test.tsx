/**
 * Onshape 外观面板（2026-11-05 live 对齐）：tabs、空态、零件行颜色字段、
 * 逐 body 颜色回调。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppearancesPanel } from '../components/AppearancesPanel.js';

const BODIES = [
  { bodyKey: '0x15', name: 'Body 1', active: true, authored: true },
  { bodyKey: '0x18', name: 'Body 2', active: true, authored: true },
];

describe('AppearancesPanel（Onshape 外观）', () => {
  it('无零件：零件和曲面 tab 空态', () => {
    render(<AppearancesPanel bodies={[]} sketches={[]} bodyColors={{}} />);
    expect(screen.getByTestId('part-studio-appearances')).toBeDefined();
    expect(screen.getByTestId('appearances-empty-parts').textContent).toContain('本文档中没有零件或曲面');
    expect(screen.getByRole('tab', { name: '零件和曲面' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '草图和曲线' })).toBeDefined();
  });

  it('有零件：名称 + 全宽颜色字段；颜色变更回调 bodyKey', () => {
    const onBodyColorChange = vi.fn();
    render(
      <AppearancesPanel
        bodies={BODIES}
        sketches={[]}
        bodyColors={{ '0x15': '#ff0000' }}
        onBodyColorChange={onBodyColorChange}
      />,
    );
    expect(screen.getAllByTestId('appearances-body-row')).toHaveLength(2);
    expect(screen.getByText('Body 1')).toBeDefined();
    expect((screen.getByTestId('appearances-color-0x15') as HTMLInputElement).value).toBe('#ff0000');
    expect((screen.getByTestId('appearances-color-0x18') as HTMLInputElement).value).toBe('#8c8c8c');
    fireEvent.change(screen.getByTestId('appearances-color-0x15'), { target: { value: '#00ff00' } });
    expect(onBodyColorChange).toHaveBeenCalledWith('0x15', '#00ff00');
  });

  it('草图和曲线 tab：空态与草图行（着色禁用）', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AppearancesPanel bodies={[]} sketches={[]} bodyColors={{}} />);
    await user.click(screen.getByTestId('appearances-tab-sketches'));
    expect(screen.getByTestId('appearances-empty-sketches').textContent).toContain('本文档中没有草图和曲线');

    rerender(
      <AppearancesPanel
        bodies={[]}
        sketches={[{ id: '0x20', label: '草图 1' }]}
        bodyColors={{}}
      />,
    );
    expect(screen.getByText('草图 1')).toBeDefined();
    const color = screen.getByTestId('appearances-sketch-row').querySelector('input') as HTMLInputElement;
    expect(color.disabled).toBe(true);
  });
});
