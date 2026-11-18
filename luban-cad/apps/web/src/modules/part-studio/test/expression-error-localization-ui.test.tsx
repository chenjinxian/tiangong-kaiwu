/**
 * ADR-0020 S5：表达式错误在 UI 表面按 en 本地化（不再直出中文 shared message）。
 *
 * 覆盖三个显示点：特征数值字段（expressionFieldMessage）、草图尺寸值弹层
 * （SketchValuePopup）、变量对话框（VariablesDialog）。i18n 在本文件内切到
 * en，结束后复位 zh-CN。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SketchDto, VariableDto } from '@luban-cad/shared';
import { changeAppLanguage, initI18n } from '../../../common/i18n/index.js';
import { SketchValuePopup } from '../components/SketchValuePopup.js';
import { VariablesDialog } from '../components/VariablesDialog.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { expressionFieldMessage } from '../internal/feature-expression-field.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';

const CJK = /[　-〿㐀-鿿豈-﫿＀-￯𠀀-𯨟]/u;
let translate: (key: string, options?: Record<string, unknown>) => string;

beforeAll(async () => {
  const i18n = await initI18n();
  await changeAppLanguage('en');
  translate = (key, options) => i18n.t(key, options as never) as string;
});

afterAll(async () => {
  await changeAppLanguage('zh-CN');
});

function fakeSketchSystem(): UseSketchSystem {
  const activeSketch: SketchDto = {
    id: 'sk-1',
    entities: [],
    constraints: [],
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
    regions: [],
  };
  return {
    activeSketch,
    loading: false,
    applyUpdate: vi.fn(async () => ({ ok: true, featureId: 'sk-1' })),
    applyConstraintValue: vi.fn(async () => ({ ok: true, featureId: 'sk-1' })),
    refresh: vi.fn(async () => undefined),
  } as UseSketchSystem;
}

describe('表达式错误 en 本地化（UI 显示点）', () => {
  it('特征字段（expressionFieldMessage）：归因 + 引用链 en 文案，无 CJK', () => {
    const message = expressionFieldMessage({
      code: 'expression',
      message: '变量 "b": 未知变量: #missing（引用链：a → b）',
      detail: { kind: 'unknownVariable', name: 'missing' },
      attributedVariable: 'b',
      referenceChain: ['a', 'b'],
    }, 'length', translate);
    expect(message).toBe('Variable "b": Unknown variable: #missing (reference chain: a → b)');
    expect(message).not.toMatch(CJK);
  });

  it('草图尺寸值弹层：未知变量错误文案为 en（zh 默认路径不回归）', async () => {
    const closed = vi.fn();
    const off = sketchToolEvents.on('dimensionPopupClosed', closed);
    try {
      render(<SketchValuePopup sketchSystem={fakeSketchSystem()} />);
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', {
          kind: 'length',
          refs: [7],
          entityIds: [7],
          anchor: { x: 140, y: 120 },
        });
      });
      const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '#nope' } });
      const error = screen.getByTestId('sketch-value-error');
      expect(error.textContent).toBe('Unknown variable: #nope');
      expect(error.textContent).not.toMatch(CJK);
      fireEvent.click(screen.getByTestId('sketch-value-cancel'));
      await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
      expect(closed).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('草图尺寸值弹层：空白变量定义 → 空表达式 en 文案（P2-1：sourceCode=empty 不被通用文案吞掉）', async () => {
    const closed = vi.fn();
    const off = sketchToolEvents.on('dimensionPopupClosed', closed);
    try {
      render(
        <SketchValuePopup
          sketchSystem={fakeSketchSystem()}
          variables={[{ id: 'v1', name: 'blank', expression: '   ' }]}
        />,
      );
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', {
          kind: 'length',
          refs: [7],
          entityIds: [7],
          anchor: { x: 140, y: 120 },
        });
      });
      const input = screen.getByTestId('sketch-value-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '#blank' } });
      const error = screen.getByTestId('sketch-value-error');
      expect(error.textContent)
        .toBe('Variable "blank": Expression is empty (reference chain: blank)');
      expect(error.textContent).not.toMatch(CJK);
      fireEvent.click(screen.getByTestId('sketch-value-cancel'));
      await waitFor(() => expect(screen.queryByTestId('sketch-value-popup')).toBeNull());
      expect(closed).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('变量对话框：空白变量定义 → 空表达式 en 文案（P2-1 parity：raw failure 直接按 code=empty）', () => {
    const variables: VariableDto[] = [{ id: 'v1', name: 'blank', expression: '   ', type: 'length' }];
    render(
      <VariablesDialog
        variant="variables"
        variables={variables}
        onCommit={vi.fn(async () => ({ ok: true }))}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('variables-name-input'), { target: { value: 'depth' } });
    const value = screen.getByTestId('variables-value-input') as HTMLInputElement;
    fireEvent.focus(value);
    fireEvent.change(value, { target: { value: '#blank' } });
    const error = screen.getByTestId('variables-error');
    expect(error.textContent).toBe('Variable "blank": Expression is empty (reference chain: blank)');
    expect(error.textContent).not.toMatch(CJK);
    expect((screen.getByTestId('variables-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('变量对话框：未知变量错误文案为 en（结构化 failure + 本地化模板）', () => {
    const variables: VariableDto[] = [{ id: 'v1', name: 'width', expression: '10', type: 'length' }];
    render(
      <VariablesDialog
        variant="variables"
        variables={variables}
        onCommit={vi.fn(async () => ({ ok: true }))}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('variables-name-input'), { target: { value: 'depth' } });
    const value = screen.getByTestId('variables-value-input') as HTMLInputElement;
    fireEvent.focus(value);
    fireEvent.change(value, { target: { value: '#missing' } });
    const error = screen.getByTestId('variables-error');
    expect(error.textContent).toBe('Variable "depth": Unknown variable: #missing (reference chain: depth)');
    expect(error.textContent).not.toMatch(CJK);
    expect((screen.getByTestId('variables-confirm') as HTMLButtonElement).disabled).toBe(true);
  });
});
