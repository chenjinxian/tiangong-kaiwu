/**
 * ADR-0020 §2.6 D4：`#` 变量补全（S2 首切片）。
 *
 * - 只展示既有变量行 `(fx) #name <值>`；无变量/无匹配不渲染（无「新建变量…」假行）。
 * - 变量表损坏 → 只显示 `#name`（不伪造值）。
 * - role=listbox/option + 高亮 + 鼠标点选回传变量名；组件不读写模型。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VariableDto } from '@luban-cad/shared';
import {
  evaluatedVariableValues,
  matchesVariableSuggestions,
  SketchExpressionAutocomplete,
} from '../components/SketchExpressionAutocomplete.js';
import {
  applyExpressionAutocomplete,
  expressionAutocompleteQuery,
} from '../components/SketchDimensionDialog.js';

const VARIABLES: VariableDto[] = [
  { id: 'v1', name: 'width', expression: '10' },
  { id: 'v2', name: 'height', expression: '#width * 2' },
  { id: 'v3', name: 'wobble', expression: '3' },
];

describe('matchesVariableSuggestions', () => {
  it('按名称前缀过滤（大小写敏感）；空 query = 全部既有变量', () => {
    expect(matchesVariableSuggestions(VARIABLES, '').map((v) => v.name))
      .toEqual(['width', 'height', 'wobble']);
    expect(matchesVariableSuggestions(VARIABLES, 'w').map((v) => v.name))
      .toEqual(['width', 'wobble']);
    expect(matchesVariableSuggestions(VARIABLES, 'Width')).toEqual([]);
  });
});

// ── 2026-11-17 评审 P2：caret 查询/插入纯 helper 直测 ─────────────────────────
describe('expressionAutocompleteQuery（caret 前 `#name` 判定）', () => {
  it('token 结尾 → query（含空 query = 刚输入 #）；caret 缺省按文本结尾', () => {
    expect(expressionAutocompleteQuery('#w', 2)).toBe('w');
    expect(expressionAutocompleteQuery('2*#wi', 5)).toBe('wi');
    expect(expressionAutocompleteQuery('#', 1)).toBe('');
    expect(expressionAutocompleteQuery('#width')).toBe('width');
  });

  it('caret 在 token 中间 → 取 caret 前前缀；无 `#` token → null', () => {
    expect(expressionAutocompleteQuery('#width', 2)).toBe('w');
    expect(expressionAutocompleteQuery('10', 2)).toBeNull();
    expect(expressionAutocompleteQuery('#width + ', 9)).toBeNull();
    expect(expressionAutocompleteQuery('#1', 2)).toBeNull();
    expect(expressionAutocompleteQuery('#width*2', 9)).toBeNull();
  });
});

describe('applyExpressionAutocomplete（替换 caret 前 `#query` 为 `#name`）', () => {
  it('插入到 caret 并返回新 caret；caret 缺省按文本结尾', () => {
    expect(applyExpressionAutocomplete('#w', 2, 'width')).toEqual({ text: '#width', caret: 6 });
    expect(applyExpressionAutocomplete('2*#w + 1', 4, 'width'))
      .toEqual({ text: '2*#width + 1', caret: 8 });
    expect(applyExpressionAutocomplete('#w', null, 'width')).toEqual({ text: '#width', caret: 6 });
  });

  it('caret 前无 `#query` → undefined（不插入、不伪造）', () => {
    expect(applyExpressionAutocomplete('10', 2, 'width')).toBeUndefined();
    expect(applyExpressionAutocomplete('#width + ', 9, 'width')).toBeUndefined();
  });
});

describe('evaluatedVariableValues', () => {
  it('变量表求值成功 → name→值；循环/语法损坏 → undefined（不伪造部分值）', () => {
    const values = evaluatedVariableValues(VARIABLES)!;
    expect(values.get('width')).toBe(10);
    expect(values.get('height')).toBe(20);
    expect(evaluatedVariableValues([
      { id: 'a', name: 'a', expression: '#b' },
      { id: 'b', name: 'b', expression: '#a' },
    ])).toBeUndefined();
  });
});

describe('SketchExpressionAutocomplete', () => {
  it('既有变量行：(fx) #name <求值后的值>；listbox/option + 高亮', () => {
    render(
      <SketchExpressionAutocomplete
        variables={VARIABLES}
        query=""
        highlightedIndex={1}
        onSelect={vi.fn()}
      />,
    );
    const listbox = screen.getByTestId('sketch-expression-autocomplete');
    expect(listbox.getAttribute('role')).toBe('listbox');
    expect(listbox.getAttribute('aria-label')).toBe('变量建议');
    const options = screen.getAllByTestId('sketch-expression-autocomplete-option');
    expect(options).toHaveLength(3);
    expect(options[0]!.getAttribute('role')).toBe('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('false');
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
    expect(options[0]!.textContent).toContain('(fx)');
    expect(options[0]!.textContent).toContain('#width');
    expect(options[0]!.textContent).toContain('10');
    expect(options[1]!.textContent).toContain('20');
  });

  it('query 前缀过滤；无匹配不渲染（不出现假「新建变量…」）', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <SketchExpressionAutocomplete
        variables={VARIABLES}
        query="wid"
        onSelect={onSelect}
      />,
    );
    const options = screen.getAllByTestId('sketch-expression-autocomplete-option');
    expect(options).toHaveLength(1);
    expect(options[0]!.getAttribute('data-variable-name')).toBe('width');
    fireEvent.mouseDown(options[0]!);
    expect(onSelect).toHaveBeenCalledWith('width');

    rerender(
      <SketchExpressionAutocomplete
        variables={VARIABLES}
        query="nope"
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
    expect(screen.queryByText(/新建变量/)).toBeNull();
  });

  it('变量表损坏：行只显示 #name（无值，不伪造）', () => {
    const broken: VariableDto[] = [
      { id: 'a', name: 'a', expression: '1 +' },
      { id: 'b', name: 'b', expression: '2' },
    ];
    render(
      <SketchExpressionAutocomplete
        variables={broken}
        query=""
        onSelect={vi.fn()}
      />,
    );
    const options = screen.getAllByTestId('sketch-expression-autocomplete-option');
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option.querySelector('.part-studio-sketch-expression-autocomplete__value')).toBeNull();
    }
  });
});

// ── ADR-0020 S3b：内联创建行（仅宿主接线时渲染）────────────────────────────
describe('SketchExpressionAutocomplete S3b：新建变量… 行', () => {
  it('传入 onCreate 时追加「新建变量…」行；点击回传 query（可为空串）', () => {
    const onCreate = vi.fn();
    render(
      <SketchExpressionAutocomplete
        variables={VARIABLES}
        query="wid"
        onSelect={vi.fn()}
        onCreate={onCreate}
      />,
    );
    const options = screen.getAllByTestId('sketch-expression-autocomplete-option');
    expect(options).toHaveLength(1); // 既有变量行（width）
    const create = screen.getByTestId('sketch-expression-autocomplete-create');
    expect(create.getAttribute('role')).toBe('option');
    expect(create.getAttribute('aria-selected')).toBe('false');
    expect(create.textContent).toContain('新建变量…');
    fireEvent.mouseDown(create);
    expect(onCreate).toHaveBeenCalledWith('wid');
  });

  it('无既有匹配但有 onCreate → 仍渲染新建行（高亮索引 = matches.length）', () => {
    const onCreate = vi.fn();
    render(
      <SketchExpressionAutocomplete
        variables={VARIABLES}
        query="nope"
        highlightedIndex={0}
        onSelect={vi.fn()}
        onCreate={onCreate}
      />,
    );
    expect(screen.queryAllByTestId('sketch-expression-autocomplete-option')).toHaveLength(0);
    const create = screen.getByTestId('sketch-expression-autocomplete-create');
    expect(create.getAttribute('aria-selected')).toBe('true');
    fireEvent.mouseDown(create);
    expect(onCreate).toHaveBeenCalledWith('nope');
  });

  it('未传 onCreate → 不渲染新建行（S2 口径不造假控件）', () => {
    render(
      <SketchExpressionAutocomplete variables={VARIABLES} query="" onSelect={vi.fn()} />,
    );
    expect(screen.queryByTestId('sketch-expression-autocomplete-create')).toBeNull();
  });
});
