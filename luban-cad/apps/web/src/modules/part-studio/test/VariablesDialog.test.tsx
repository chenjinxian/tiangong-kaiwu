/**
 * ADR-0020 S3b：VariablesDialog（220×188 面板；variables / inline-create 两变体）。
 *
 * 覆盖：标题 `#name = 值`（新建 `#? = 0 单位`）、源模式诚实禁用、类型单位切换、
 * 值字段 blur 求值显示（表达式原文保留在载荷）、无效表达式/重复名 ✓ 禁用、
 * 编辑预填、内联创建预填/配置页禁用、提交载荷（整表覆写）、后端失败保留
 * 对话框 + 就地错误、只读态 ✓ 禁用。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VariableDto } from '@luban-cad/shared';
import {
  clampVariablesDialogPosition,
  VARIABLES_DIALOG_HEIGHT,
  VARIABLES_DIALOG_WIDTH,
  VariablesDialog,
} from '../components/VariablesDialog.js';

const VARIABLES: VariableDto[] = [
  { id: 'v1', name: 'width', expression: '10', type: 'length' },
  { id: 'v2', name: 'height', expression: '#width*2', type: 'length', description: '高度' },
];

function renderDialog(overrides: Partial<React.ComponentProps<typeof VariablesDialog>> = {}) {
  const onCommit = vi.fn(async () => ({ ok: true }));
  const onClose = vi.fn();
  render(
    <VariablesDialog
      variant="variables"
      variables={VARIABLES}
      onCommit={onCommit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onCommit, onClose };
}

function change(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } });
}

describe('VariablesDialog：变量命令/树编辑变体', () => {
  it('新建：标题 #? = 0 mm；源模式 已分配/已测量/来自导入（后两者诚实禁用 + 原因）', () => {
    renderDialog();
    expect(screen.getByTestId('variables-dialog-title').textContent).toBe('#? = 0 mm');
    const assigned = screen.getByTestId('variables-source-assigned') as HTMLButtonElement;
    expect(assigned.disabled).toBe(false);
    expect(assigned.getAttribute('aria-pressed')).toBe('true');
    for (const id of ['measured', 'imported']) {
      const button = screen.getByTestId(`variables-source-${id}`) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('title')?.length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId('variables-type-length').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('variables-type-angle')).toBeDefined();
    expect(screen.getByTestId('variables-type-number')).toBeDefined();
    expect(screen.getByTestId('variables-type-any')).toBeDefined();
  });

  it('名称实时更新标题；类型切换更新单位后缀', () => {
    renderDialog();
    change(screen.getByTestId('variables-name-input'), 'depth');
    expect(screen.getByTestId('variables-dialog-title').textContent).toBe('#depth = 0 mm');
    fireEvent.click(screen.getByTestId('variables-type-angle'));
    expect(screen.getByTestId('variables-value-unit').textContent).toBe('deg');
    expect(screen.getByTestId('variables-dialog-title').textContent).toBe('#depth = 0 deg');
  });

  it('值字段 blur 显示求值数值（单位后缀分开）；提交载荷保留表达式原文', async () => {
    const { onCommit, onClose } = renderDialog();
    change(screen.getByTestId('variables-name-input'), 'depth');
    const value = screen.getByTestId('variables-value-input') as HTMLInputElement;
    fireEvent.focus(value);
    change(value, '#width*2');
    fireEvent.blur(value);
    expect(value.value).toBe('20');
    expect(screen.getByTestId('variables-value-unit').textContent).toBe('mm');
    expect(screen.getByTestId('variables-dialog-title').textContent).toBe('#depth = 20 mm');

    fireEvent.click(screen.getByTestId('variables-confirm'));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const [dto, all] = onCommit.mock.calls[0] as unknown as [VariableDto, VariableDto[]];
    expect(dto).toEqual({ id: 'v3', name: 'depth', expression: '#width*2', type: 'length' });
    expect(all).toEqual([...VARIABLES, dto]);
    expect(onClose).toHaveBeenCalled();
  });

  it('聚焦值字段显示表达式原文（设计意图）', () => {
    renderDialog({ variableId: 'v2' });
    const value = screen.getByTestId('variables-value-input') as HTMLInputElement;
    expect(value.value).toBe('20');
    fireEvent.focus(value);
    expect(value.value).toBe('#width*2');
  });

  it('无效表达式 / 重复名：错误态 + ✓ 禁用（不提交）', () => {
    const { onCommit } = renderDialog();
    change(screen.getByTestId('variables-name-input'), 'width');
    const value = screen.getByTestId('variables-value-input') as HTMLInputElement;
    fireEvent.focus(value);
    change(value, '1');
    const confirm = screen.getByTestId('variables-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId('variables-error').textContent).toContain('已存在');

    change(screen.getByTestId('variables-name-input'), 'depth');
    change(value, '#missing');
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId('variables-value-input').getAttribute('data-error')).toBe('true');
    expect(screen.getByTestId('variables-error').textContent).toContain('未知变量');
    fireEvent.click(confirm);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('编辑预填：name/值(求值显示)/说明/类型；提交保留 id 与其它变量', async () => {
    const { onCommit } = renderDialog({ variableId: 'v2' });
    expect((screen.getByTestId('variables-name-input') as HTMLInputElement).value).toBe('height');
    expect((screen.getByTestId('variables-value-input') as HTMLInputElement).value).toBe('20');
    expect((screen.getByTestId('variables-description-input') as HTMLInputElement).value).toBe('高度');
    expect(screen.getByTestId('variables-type-length').getAttribute('aria-pressed')).toBe('true');
    fireEvent.focus(screen.getByTestId('variables-value-input'));
    change(screen.getByTestId('variables-value-input'), '#width*3');
    fireEvent.click(screen.getByTestId('variables-confirm'));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const [dto, all] = onCommit.mock.calls[0] as unknown as [VariableDto, VariableDto[]];
    expect(dto).toEqual({
      id: 'v2', name: 'height', expression: '#width*3', type: 'length', description: '高度',
    });
    expect(all.map((entry) => entry.id)).toEqual(['v1', 'v2']);
  });

  it('后端失败：保留对话框 + 就地错误，不关闭', async () => {
    const onCommit = vi.fn(async () => ({ ok: false, error: '后端拒收' }));
    const onClose = vi.fn();
    render(
      <VariablesDialog
        variant="variables"
        variables={VARIABLES}
        initialName="depth"
        initialValueText="5"
        onCommit={onCommit}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('variables-confirm'));
    await waitFor(() => expect(screen.getByTestId('variables-error').textContent).toBe('后端拒收'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('variables-dialog')).toBeDefined();
  });

  it('canEdit=false：✓ 禁用、字段只读；取消仍可关闭', () => {
    const { onClose, onCommit } = renderDialog({ canEdit: false });
    expect((screen.getByTestId('variables-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('variables-name-input') as HTMLInputElement).readOnly).toBe(true);
    fireEvent.click(screen.getByTestId('variables-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('VariablesDialog：inline-create 变体（尺寸字段创建）', () => {
  it('标题「创建变量」；特征/配置页签（配置诚实禁用）；预填名称/值/类型', async () => {
    const { onCommit } = renderDialog({
      variant: 'inline-create',
      initialName: 'foo',
      initialValueText: '8',
      initialType: 'length',
      anchor: { x: 400, y: 200 },
    });
    expect(screen.getByTestId('variables-dialog-title').textContent).toBe('创建变量');
    expect(screen.getByTestId('variables-dialog').getAttribute('data-variant')).toBe('inline-create');
    expect(screen.getByTestId('variables-tab-feature').getAttribute('aria-selected')).toBe('true');
    const configuration = screen.getByTestId('variables-tab-configuration') as HTMLButtonElement;
    expect(configuration.disabled).toBe(true);
    expect(configuration.getAttribute('title')?.length).toBeGreaterThan(0);
    // 没有源模式行（变体差异；只渲染页签）。
    expect(screen.queryByTestId('variables-source-assigned')).toBeNull();
    expect((screen.getByTestId('variables-name-input') as HTMLInputElement).value).toBe('foo');
    expect((screen.getByTestId('variables-value-input') as HTMLInputElement).value).toBe('8');
    expect(screen.getByTestId('variables-type-length').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('variables-confirm'));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const [dto] = onCommit.mock.calls[0] as unknown as [VariableDto, VariableDto[]];
    expect(dto).toEqual({ id: 'v3', name: 'foo', expression: '8', type: 'length' });
  });

  it('宿主显式传 initialType=angle 时预填（默认仍是 length，P2-4）', () => {
    renderDialog({
      variant: 'inline-create',
      initialName: 'bar',
      initialValueText: '45',
      initialType: 'angle',
      anchor: { x: 400, y: 200 },
    });
    expect(screen.getByTestId('variables-type-angle').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('variables-value-unit').textContent).toBe('deg');
  });
});

// ── ADR-0020 S3b review P3（cheap）：Esc / 钳制 / 打开后被删除 ───────────────
describe('VariablesDialog P3：关闭与边界', () => {
  it('Escape（焦点在面板内）→ onClose；不改模型', () => {
    const { onClose, onCommit } = renderDialog();
    const name = screen.getByTestId('variables-name-input');
    name.focus();
    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clampVariablesDialogPosition：锚点在视口内保持；越界夹到 8px 边距', () => {
    const viewport = { width: 1280, height: 720 };
    expect(clampVariablesDialogPosition({ x: 400, y: 300 }, viewport)).toEqual({ left: 400, top: 300 });
    expect(clampVariablesDialogPosition({ x: -100, y: -100 }, viewport)).toEqual({ left: 8, top: 8 });
    expect(clampVariablesDialogPosition({ x: 5000, y: 5000 }, viewport)).toEqual({
      left: 1280 - VARIABLES_DIALOG_WIDTH - 8,
      top: 720 - VARIABLES_DIALOG_HEIGHT - 8,
    });
  });

  it('打开后变量被别处删除（读面已落位）→ 关闭而不是按新建重建', () => {
    const onClose = vi.fn();
    render(
      <VariablesDialog
        variant="variables"
        variables={[]}
        variableId="gone"
        variablesLoading={false}
        onCommit={vi.fn(async () => ({ ok: true }))}
        onClose={onClose}
      />,
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('打开后变量被别处删除但读面仍在加载 → 暂不关闭（避免瞬时空表误关）', () => {
    const onClose = vi.fn();
    render(
      <VariablesDialog
        variant="variables"
        variables={[]}
        variableId="gone"
        variablesLoading
        onCommit={vi.fn(async () => ({ ok: true }))}
        onClose={onClose}
      />,
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
