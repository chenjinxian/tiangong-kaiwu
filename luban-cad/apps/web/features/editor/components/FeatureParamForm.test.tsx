/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import type { FeatureFormField, FilletEdgeRef } from '@luban-cad/shared';
import { FeatureParamForm } from './FeatureParamForm.js';

vi.mock('./FeaturePanel.css', () => ({}));

/** 五 kind 字段集（与 MS getFeatureFormModel 产物同形：extrude 3 字段 + fillet 3 字段） */
const ALL_KIND_FIELDS: FeatureFormField[] = [
  { name: 'distance', label: '距离', kind: 'number' },
  { name: 'profile', label: '轮廓', kind: 'json' },
  { name: 'propagateSmooth', label: '光滑传播', kind: 'boolean' },
  { name: 'edges', label: '边引用', kind: 'edgeRefs' },
  { name: 'sketchId', label: '草图', kind: 'readonlyText', readOnly: true },
];

const EDGE_REFS: FilletEdgeRef[] = [
  { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 3, entityId: 4 } },
];

const makeValue = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  distance: 10,
  profile: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }],
  propagateSmooth: true,
  edges: EDGE_REFS,
  sketchId: 'sk-1',
  ...over,
});

describe('FeatureParamForm', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('五种 kind 渲染', () => {
    it('number → Input[type=number] 且回显数值', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const input = screen.getByLabelText('距离') as HTMLInputElement;
      expect(input.tagName).toBe('INPUT');
      expect(input.type).toBe('number');
      expect(input.value).toBe('10');
    });

    it('json → Textarea 且回显格式化 JSON', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const textarea = screen.getByLabelText('轮廓') as HTMLTextAreaElement;
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(JSON.parse(textarea.value)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }]);
    });

    it('boolean → ToggleSwitch 且回显开关态', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const toggle = screen.getByRole('switch', { name: '光滑传播' }) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it('edgeRefs → chips 区渲染边引用标签 + edgePicker 插槽内容', () => {
      render(
        <FeatureParamForm
          fields={ALL_KIND_FIELDS}
          value={makeValue()}
          onChange={onChange}
          edgePicker={<button type="button">从视图选边</button>}
        />,
      );
      const chips = screen.getByTestId('feature-edge-chips-edges');
      expect(within(chips).getByText('#1/2 ~ #3/4')).toBeDefined();
      expect(screen.getByRole('button', { name: '从视图选边' })).toBeDefined();
    });

    it('edgeRefs 空值 → 显示「未选择边」提示', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue({ edges: [] })} onChange={onChange} />);
      expect(screen.getByText('未选择边')).toBeDefined();
    });

    it('readonlyText → 只读 Input 回显文本且禁用', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const input = screen.getByLabelText('草图') as HTMLInputElement;
      expect(input.value).toBe('sk-1');
      expect(input.disabled).toBe(true);
      expect(input.readOnly).toBe(true);
    });

    it('disabled 时输入控件全部禁用', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} disabled />);
      expect((screen.getByLabelText('距离') as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText('轮廓') as HTMLTextAreaElement).disabled).toBe(true);
      expect((screen.getByRole('switch', { name: '光滑传播' }) as HTMLInputElement).disabled).toBe(true);
    });
  });

  describe('onChange 行为', () => {
    it('number 输入合法数字 → onChange 收到 number', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('距离'), { target: { value: '2.5' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ distance: 2.5 }));
    });

    it('number 清空输入 → 不发射 onChange（外发值恒为合法数字）', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('距离'), { target: { value: '' } });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('boolean toggle → onChange 收到布尔值', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      fireEvent.click(screen.getByRole('switch', { name: '光滑传播' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ propagateSmooth: false }));
    });

    it('json 失焦合法输入 → onChange 收到解析后的 JSON', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const textarea = screen.getByLabelText('轮廓');
      fireEvent.change(textarea, { target: { value: '[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]' } });
      expect(onChange).not.toHaveBeenCalled(); // 输入中不发射
      fireEvent.blur(textarea);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }),
      );
    });

    it('json 失焦非法输入 → 行内错误文案 + 绝不调用 onChange', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const textarea = screen.getByLabelText('轮廓');
      fireEvent.change(textarea, { target: { value: '[{oops' } });
      fireEvent.blur(textarea);

      expect(screen.getByText('JSON 格式非法，未保存该字段')).toBeDefined();
      expect((textarea as HTMLTextAreaElement).getAttribute('data-iui-status')).toBe('negative');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('json 非法后重新输入合法 → 行内错误清除且失焦可正常发射', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const textarea = screen.getByLabelText('轮廓');
      fireEvent.change(textarea, { target: { value: 'bad' } });
      fireEvent.blur(textarea);
      expect(screen.getByText('JSON 格式非法，未保存该字段')).toBeDefined();

      fireEvent.change(textarea, { target: { value: '[]' } });
      expect(screen.queryByText('JSON 格式非法，未保存该字段')).toBeNull();
      fireEvent.blur(textarea);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ profile: [] }));
    });

    it('json 清空（空串）→ 归零值发射（profile → []）', () => {
      render(<FeatureParamForm fields={ALL_KIND_FIELDS} value={makeValue()} onChange={onChange} />);
      const textarea = screen.getByLabelText('轮廓');
      fireEvent.change(textarea, { target: { value: '' } });
      fireEvent.blur(textarea);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ profile: [] }));
    });
  });

  describe('onChange 语义', () => {
    it('单字段发射保留其余字段值（next = {...value, [name]})', () => {
      const fields: FeatureFormField[] = [{ name: 'distance', label: '距离', kind: 'number' }];
      const value = { distance: 1, extra: 'keep' };
      render(<FeatureParamForm fields={fields} value={value} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('距离'), { target: { value: '3' } });
      expect(onChange).toHaveBeenCalledWith({ distance: 3, extra: 'keep' });
    });
  });
});
