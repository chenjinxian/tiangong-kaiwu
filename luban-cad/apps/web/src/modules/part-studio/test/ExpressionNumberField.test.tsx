// src/modules/part-studio/test/ExpressionNumberField.test.tsx
//
// ADR-0020 S4c：通用特征表达式数值字段（从 S4b 深度字段抽取）行为验收——
// 聚焦表达式/失焦求值、`#` 补全、内联创建回填、程序化写回不重开、
// 变量表 loading/unavailable 快照、无效红态、不适用清除、视口滚动关闭。
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VariableDto } from '@luban-cad/shared';
import type { ExpressionFieldKind } from '../internal/feature-expression-field.js';
import {
  ExpressionNumberField,
  type ExpressionFieldEvaluation,
  useExpressionField,
} from '../components/ExpressionNumberField.js';

function variable(name: string, expression: string, type?: VariableDto['type']): VariableDto {
  return { id: name, name, expression, ...(type !== undefined ? { type } : {}) };
}

interface HarnessProps {
  initialText?: string;
  initialExpression?: string;
  kind?: ExpressionFieldKind;
  applicable?: boolean;
  variables?: readonly VariableDto[];
  variablesLoading?: boolean;
  variablesError?: string;
  variablesReady?: boolean;
  storedExpression?: string;
  storedExpressionUntouchedValue?: number;
  onCreateVariable?: (request: { name: string; valueText: string; unit: string }) => void;
  unitLabel?: string;
  onValidity?: (evaluation: ExpressionFieldEvaluation | undefined) => void;
}

function Harness(props: HarnessProps): React.JSX.Element {
  const [numberText, setNumberText] = React.useState(props.initialText ?? '10');
  const field = useExpressionField(props.initialExpression);
  const [last, setLast] = React.useState<ExpressionFieldEvaluation | undefined>(undefined);
  return (
    <div>
      <ExpressionNumberField
        id="expression-field"
        label="半径"
        numberText={numberText}
        setNumberText={setNumberText}
        expression={field.expression}
        setExpression={field.setExpression}
        kind={props.kind ?? 'length'}
        unitLabel={props.unitLabel ?? 'mm'}
        applicable={props.applicable ?? true}
        variables={props.variables}
        variablesLoading={props.variablesLoading}
        variablesError={props.variablesError}
        variablesReady={props.variablesReady}
        onCreateVariable={props.onCreateVariable}
        variablesDialogActive={null}
        storedExpression={props.storedExpression}
        storedExpressionUntouchedValue={props.storedExpressionUntouchedValue}
        onValidity={(evaluation) => {
          setLast(evaluation);
          props.onValidity?.(evaluation);
        }}
      />
      <span data-testid="expression-state">{field.expression ?? ''}</span>
      <span data-testid="validity-ok">{last?.ok ? String(last.value) : ''}</span>
      <span data-testid="validity-code">{last !== undefined && !last.ok ? last.error.code : ''}</span>
    </div>
  );
}

describe('ExpressionNumberField（ADR-0020 S4c）', () => {
  it('聚焦显示表达式原文、失焦显示求值数；求值用于宿主载荷', async () => {
    const user = userEvent.setup();
    render(<Harness variables={[variable('w', '5')]} />);
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    expect(input.value).toBe('10');
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#w*2');
    expect(input.value).toBe('#w*2');
    expect(screen.getByTestId('expression-state').textContent).toBe('#w*2');
    await user.tab();
    expect(input.value).toBe('10');
    expect(screen.getByTestId('validity-ok').textContent).toBe('10');
  });

  it('无效表达式：红态 + expression 错误码；数值编辑清除表达式回数值态', async () => {
    const user = userEvent.setup();
    render(<Harness variables={[]} />);
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '#nope');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('validity-code').textContent).toBe('expression');
    await user.clear(input);
    await user.type(input, '7');
    expect(screen.getByTestId('expression-state').textContent).toBe('');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
    await user.tab();
    expect(input.value).toBe('7');
  });

  it('`#` 补全：显示既有变量、选中回填并关闭菜单（不因旧 caret 重开）', async () => {
    const user = userEvent.setup();
    render(<Harness variables={[variable('width', '10', 'length')]} />);
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#w');
    const menu = await screen.findByTestId('sketch-expression-autocomplete');
    expect(within(menu).getByText('#width')).toBeTruthy();
    await user.click(within(menu).getByText('#width'));
    expect(input.value).toBe('#width');
    await waitFor(() => expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull());
    await user.tab();
    expect(input.value).toBe('10');
  });

  it('未知整 token + Enter → 内联创建（name/值/单位/锚点）；变量刷新后回填', async () => {
    const user = userEvent.setup();
    const onCreateVariable = vi.fn();
    const { rerender } = render(
      <Harness initialText="12.5" variables={[]} onCreateVariable={onCreateVariable} />,
    );
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#bar');
    await user.keyboard('{Enter}');
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'bar',
      valueText: '12.5',
      unit: 'mm',
    }));
    // 宿主变量 hook 刷新（同一实例仍聚焦）→ token 被替换为创建后的变量名。
    rerender(<Harness initialText="12.5" variables={[variable('bar', '12.5')]} onCreateVariable={onCreateVariable} />);
    await waitFor(() => expect(input.value).toBe('#bar'));
  });

  it('变量表加载中 + 未触碰落库表达式 → 按物化快照回报 ok（不误报未知变量）', () => {
    render(
      <Harness
        initialText="10"
        initialExpression="#w*2"
        storedExpression="#w*2"
        storedExpressionUntouchedValue={10}
        variables={[]}
        variablesLoading
      />,
    );
    expect(screen.getByTestId('validity-ok').textContent).toBe('10');
    expect(screen.getByTestId('validity-code').textContent).toBe('');
    expect(screen.getByRole('textbox', { name: '半径' }).getAttribute('aria-invalid')).not.toBe('true');
  });

  it('变量表读取失败 + 新表达式 → variablesUnavailable（独立错误，不误报未知变量）', async () => {
    const user = userEvent.setup();
    render(<Harness variables={[]} variablesError="读取失败" variablesReady={false} />);
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '#w*2');
    expect(screen.getByTestId('validity-code').textContent).toBe('variablesUnavailable');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('applicable=false：不渲染表达式能力并清空 expression（仅数值输入）', async () => {
    const user = userEvent.setup();
    render(<Harness initialExpression="#w" variables={[variable('w', '5')]} applicable={false} />);
    await waitFor(() => expect(screen.getByTestId('expression-state').textContent).toBe(''));
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '#w');
    expect(screen.getByTestId('expression-state').textContent).toBe('');
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
  });

  it('角度字段：angleRadFromDeg 求值回报契约弧度、显示投影为度', async () => {
    const user = userEvent.setup();
    render(<Harness kind="angleRadFromDeg" unitLabel="°" variables={[variable('a', '90', 'angle')]} />);
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '#a');
    await user.tab();
    expect(screen.getByTestId('validity-ok').textContent).toBe(String(Math.PI / 2));
    expect(input.value).toBe('90');
  });

  it('补全菜单在窗口滚动时关闭（视口夹紧生命周期）', async () => {
    const user = userEvent.setup();
    render(<Harness variables={[variable('width', '10')]} />);
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#w');
    await screen.findByTestId('sketch-expression-autocomplete');
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull());
  });

  it('不适用切换：父级 applicable 变 false 时清除表达式（模式切换）', async () => {
    const { rerender } = render(
      <Harness initialExpression="#w" variables={[variable('w', '5')]} />,
    );
    expect(screen.getByTestId('expression-state').textContent).toBe('#w');
    rerender(<Harness initialExpression="#w" variables={[variable('w', '5')]} applicable={false} />);
    await waitFor(() => expect(screen.getByTestId('expression-state').textContent).toBe(''));
  });
});
