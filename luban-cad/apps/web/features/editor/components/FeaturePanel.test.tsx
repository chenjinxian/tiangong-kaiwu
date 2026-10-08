/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import React from 'react';
import type { FeatureFormModel, FeatureTreeEntry } from '@luban-cad/shared';
import { FeaturePanel } from './FeaturePanel.js';
import type { UseFeatureSystem } from '../hooks/useFeatureSystem.js';

// Mock CSS imports
vi.mock('./FeaturePanel.css', () => ({}));

// T6.3：useEdgeRefPicker 模块级 mock（避免 editor-frontend 工具链进 jsdom；拾取行为由 hook 单测钉）
const pickerMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  removeAt: vi.fn(),
  picking: false,
}));
vi.mock('../hooks/useEdgeRefPicker.js', () => ({
  useEdgeRefPicker: () => ({
    picking: pickerMocks.picking,
    refs: [],
    start: pickerMocks.start,
    stop: pickerMocks.stop,
    removeAt: pickerMocks.removeAt,
  }),
}));

const makeEntry = (over: Partial<FeatureTreeEntry> = {}): FeatureTreeEntry => ({
  id: 'f1',
  featureType: 'extrude',
  orderKey: 1,
  suppressed: false,
  status: 0,
  params: {},
  ...over,
});

const makeFs = (over: Partial<UseFeatureSystem> = {}): UseFeatureSystem => ({
  tree: [],
  loading: false,
  leaseOk: true,
  refresh: vi.fn().mockResolvedValue(undefined),
  applyOp: vi.fn().mockResolvedValue({ ok: true }),
  previewOp: vi.fn().mockResolvedValue(undefined),
  resolveEdgeRef: vi.fn().mockResolvedValue({ ok: false }),
  ...over,
});

/** 4 类型表单模型（与 MS getFeatureFormModel 产物同形） */
const formModel: FeatureFormModel = {
  extrude: { fields: [{ name: 'distance', label: '距离', kind: 'number' }] },
  booleanAdd: { fields: [] },
  booleanSubtract: { fields: [] },
  fillet: { fields: [{ name: 'radius', label: '半径', kind: 'number' }] },
};

describe('FeaturePanel', () => {
  const onEditFeature = vi.fn();
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    pickerMocks.picking = false;
  });

  describe('数据态渲染', () => {
    it('空树显示空态文案「暂无特征」', () => {
      render(<FeaturePanel fs={makeFs()} onEditFeature={onEditFeature} />);
      expect(screen.getByText('暂无特征')).toBeDefined();
    });

    it('loading 时显示加载中', () => {
      render(<FeaturePanel fs={makeFs({ loading: true })} onEditFeature={onEditFeature} />);
      expect(screen.getByText('加载中...')).toBeDefined();
    });

    it('error 时显示错误 Alert', () => {
      render(<FeaturePanel fs={makeFs({ error: 'RPC 不可用' })} onEditFeature={onEditFeature} />);
      expect(screen.getByText('RPC 不可用')).toBeDefined();
    });

    it('按 orderKey 排序渲染树行（序号 + 类型标签 + 图标）', () => {
      const fs = makeFs({
        tree: [
          makeEntry({ id: 'b2', featureType: 'booleanSubtract', orderKey: 2 }),
          makeEntry({ id: 'a1', featureType: 'extrude', orderKey: 1 }),
          makeEntry({ id: 'c3', featureType: 'fillet', orderKey: 3, params: { radius: 1 } }),
        ],
      });
      const { container } = render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      const rows = container.querySelectorAll('.feature-row');
      expect(rows.length).toBe(3);
      const orders = Array.from(container.querySelectorAll('.feature-order')).map((n) => n.textContent);
      expect(orders).toEqual(['1', '2', '3']);
      expect(within(rows[0] as HTMLElement).getByText('拉伸 (extrude)')).toBeDefined();
      expect(within(rows[1] as HTMLElement).getByText('布尔减 (booleanSubtract)')).toBeDefined();
      expect(within(rows[2] as HTMLElement).getByText('圆角 (fillet)')).toBeDefined();
    });

    it('status !== 0 的行带 .feature-row--failed 类并显示失败徽标', () => {
      const fs = makeFs({
        tree: [
          makeEntry({ id: 'ok', orderKey: 1 }),
          makeEntry({ id: 'bad', featureType: 'fillet', orderKey: 2, status: 2 }),
        ],
      });
      const { container } = render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      const rows = container.querySelectorAll('.feature-row');
      expect(rows[0].classList.contains('feature-row--failed')).toBe(false);
      expect(rows[1].classList.contains('feature-row--failed')).toBe(true);
      expect(rows[1].querySelector('.feature-badge--failed')).not.toBeNull();
    });

    it('suppressed 的行带 .feature-row--suppressed 类并显示「已抑制」徽标', () => {
      const fs = makeFs({
        tree: [makeEntry({ id: 's1', suppressed: true })],
      });
      const { container } = render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      const row = container.querySelector('.feature-row');
      expect(row?.classList.contains('feature-row--suppressed')).toBe(true);
      expect(within(row as HTMLElement).getByText('已抑制')).toBeDefined();
    });
  });

  describe('行内动作（RPC 参数）', () => {
    it('抑制 toggle 调用 setFeatureSuppressed（未抑制 → true）', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: true });
      const fs = makeFs({ tree: [makeEntry({ id: 'f1' })], applyOp });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '抑制特征' }));

      await waitFor(() =>
        expect(applyOp).toHaveBeenCalledWith({ kind: 'setFeatureSuppressed', featureId: 'f1', suppressed: true }),
      );
    });

    it('取消抑制调用 setFeatureSuppressed（已抑制 → false）', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: true });
      const fs = makeFs({ tree: [makeEntry({ id: 'f1', suppressed: true })], applyOp });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '取消抑制' }));

      await waitFor(() =>
        expect(applyOp).toHaveBeenCalledWith({ kind: 'setFeatureSuppressed', featureId: 'f1', suppressed: false }),
      );
    });

    it('删除调用 deleteFeature', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: true });
      const fs = makeFs({ tree: [makeEntry({ id: 'f1' })], applyOp });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '删除特征' }));

      await waitFor(() => expect(applyOp).toHaveBeenCalledWith({ kind: 'deleteFeature', featureId: 'f1' }));
    });

    it('删除链尾守卫错误 → Alert 呈现 + onToast(error)', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: false, error: '链尾守卫：首个特征不可删除' });
      const fs = makeFs({ tree: [makeEntry({ id: 'f1' })], applyOp });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} onToast={onToast} />);

      fireEvent.click(screen.getByRole('button', { name: '删除特征' }));

      await waitFor(() => expect(screen.getByText('链尾守卫：首个特征不可删除')).toBeDefined());
      expect(onToast).toHaveBeenCalledWith('链尾守卫：首个特征不可删除', 'error');
    });

    it('上移/下移以 orderKey∓1 调用 reorderFeature', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: true });
      const fs = makeFs({
        tree: [
          makeEntry({ id: 'f1', orderKey: 1 }),
          makeEntry({ id: 'f2', featureType: 'booleanAdd', orderKey: 2 }),
        ],
        applyOp,
      });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      const rows = screen
        .getAllByRole('button', { name: '抑制特征' })
        .map((b) => b.closest('.feature-row') as HTMLElement);
      const downBtn = within(rows[0]).getByRole('button', { name: '下移' });
      fireEvent.click(downBtn);
      await waitFor(() =>
        expect(applyOp).toHaveBeenCalledWith({ kind: 'reorderFeature', featureId: 'f1', to: 2 }),
      );

      const upBtn = within(rows[1]).getByRole('button', { name: '上移' });
      fireEvent.click(upBtn);
      await waitFor(() =>
        expect(applyOp).toHaveBeenCalledWith({ kind: 'reorderFeature', featureId: 'f2', to: 1 }),
      );
    });

    it('链首/链尾的上移/下移按钮禁用', () => {
      const fs = makeFs({
        tree: [
          makeEntry({ id: 'f1', orderKey: 1 }),
          makeEntry({ id: 'f2', featureType: 'booleanAdd', orderKey: 2 }),
        ],
      });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      const rows = screen
        .getAllByRole('button', { name: '抑制特征' })
        .map((b) => b.closest('.feature-row') as HTMLElement);
      expect(within(rows[0]).getByRole('button', { name: '上移' }).getAttribute('aria-disabled')).toBe('true');
      expect(within(rows[0]).getByRole('button', { name: '下移' }).getAttribute('aria-disabled')).not.toBe('true');
      expect(within(rows[1]).getByRole('button', { name: '上移' }).getAttribute('aria-disabled')).not.toBe('true');
      expect(within(rows[1]).getByRole('button', { name: '下移' }).getAttribute('aria-disabled')).toBe('true');
    });

    it('编辑按钮回调 onEditFeature(entry)', () => {
      const entry = makeEntry({ id: 'f1' });
      const fs = makeFs({ tree: [entry] });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '编辑特征' }));

      expect(onEditFeature).toHaveBeenCalledWith(entry);
    });
  });

  describe('写租约只读态', () => {
    it('leaseOk=false 时动作全部禁用并显示只读提示', () => {
      const fs = makeFs({
        leaseOk: false,
        tree: [makeEntry({ id: 'f1' }), makeEntry({ id: 'f2', featureType: 'booleanAdd', orderKey: 2 })],
      });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      expect(screen.getByText('只读（未持有写租约）')).toBeDefined();
      expect(screen.getByRole('button', { name: '新建特征' }).getAttribute('aria-disabled')).toBe('true');
      expect(screen.getAllByRole('button', { name: '抑制特征' }).every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(screen.getAllByRole('button', { name: '编辑特征' }).every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(screen.getAllByRole('button', { name: '删除特征' }).every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(screen.getAllByRole('button', { name: '上移' }).every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
      expect(screen.getAllByRole('button', { name: '下移' }).every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    });
  });

  describe('新建特征对话框', () => {
    it('打开对话框：type 选项 = formModel 键集（4 类型）', () => {
      const fs = makeFs({ formModel });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('新建特征')).toBeDefined();
      const select = within(dialog).getByRole('combobox') as HTMLSelectElement;
      const values = Array.from(select.querySelectorAll('option'))
        .map((o) => (o as HTMLOptionElement).value)
        .filter((v) => v !== '');
      expect(values).toEqual(['extrude', 'booleanAdd', 'booleanSubtract', 'fillet']);
    });

    it('取消关闭对话框', () => {
      const fs = makeFs({ formModel });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));
      expect(screen.getByRole('dialog')).toBeDefined();

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('formModel 未加载时显示加载提示且无 select', () => {
      const fs = makeFs({ formModel: undefined });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('表单模型加载中...')).toBeDefined();
      expect(within(dialog).queryByRole('combobox')).toBeNull();
    });
  });

  describe('T6.2 编辑对话框（参数表单 + updateParams）', () => {
    /** 与 MS getFeatureFormModel 同形的 extrude 字段集（含 json/number/readonlyText 三 kind） */
    const fullFormModel: FeatureFormModel = {
      ...formModel,
      extrude: {
        fields: [
          { name: 'profile', label: '轮廓', kind: 'json' },
          { name: 'distance', label: '距离', kind: 'number' },
          { name: 'sketchId', label: '草图', kind: 'readonlyText', readOnly: true },
        ],
      },
    };

    const entryWithParams = (params: unknown): FeatureTreeEntry =>
      makeEntry({ id: 'f1', featureType: 'extrude', params });

    const openEditDialog = (fs: UseFeatureSystem) => {
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} onToast={onToast} />);
      fireEvent.click(screen.getByRole('button', { name: '编辑特征' }));
      return screen.getByRole('dialog');
    };

    it('编辑打开对话框：标题含类型标签，表单按字段模型渲染且预填存储 params', () => {
      const fs = makeFs({
        formModel: fullFormModel,
        tree: [entryWithParams({ profile: [{ x: 0, y: 0 }], distance: 5, sketchId: 'sk-9' })],
      });
      const dialog = openEditDialog(fs);

      expect(within(dialog).getByText('编辑特征：拉伸 (extrude)')).toBeDefined();
      expect((within(dialog).getByLabelText('距离') as HTMLInputElement).value).toBe('5');
      expect((within(dialog).getByLabelText('轮廓') as HTMLTextAreaElement).value).toBe('[{"x":0,"y":0}]');
      expect((within(dialog).getByLabelText('草图') as HTMLInputElement).value).toBe('sk-9');
      // 兼容通知仍上抛（T6.1 契约）
      expect(onEditFeature).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
    });

    it('entry.params 为 JSON 字符串时宽容解析预填', () => {
      const fs = makeFs({
        formModel: fullFormModel,
        tree: [entryWithParams(JSON.stringify({ profile: [], distance: 7 }))],
      });
      const dialog = openEditDialog(fs);
      expect((within(dialog).getByLabelText('距离') as HTMLInputElement).value).toBe('7');
    });

    it('应用：改 distance → applyOp(updateParams) 携带全量表单值；成功后关对话框 + toast success', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: true });
      const fs = makeFs({
        formModel: fullFormModel,
        tree: [entryWithParams({ profile: [{ x: 0, y: 0 }], distance: 5 })],
        applyOp,
      });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '3' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '应用' }));

      await waitFor(() =>
        expect(applyOp).toHaveBeenCalledWith({
          kind: 'updateParams',
          featureId: 'f1',
          params: { profile: [{ x: 0, y: 0 }], distance: 3 },
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(onToast).toHaveBeenCalledWith('特征参数已更新', 'success');
    });

    it('应用失败（后端守卫）：错误文案在对话框顶部 Alert 呈现（M2-UX #4），对话框不关', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: false, error: 'distance 必须为正数' });
      const fs = makeFs({
        formModel: fullFormModel,
        tree: [entryWithParams({ profile: [], distance: 5 })],
        applyOp,
      });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '-1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '应用' }));

      await waitFor(() => expect(within(dialog).getByText('distance 必须为正数')).toBeDefined());
      // iTwinUI v3 Alert 无隐式 role、类名带 hash 前缀 —— 断言错误文案落在 alert 容器内
      expect(within(dialog).getByText('distance 必须为正数').closest('div[class*="alert"]')).not.toBeNull();
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    it('applyOp 抛错（RPC 层失败，如后端 db 未开）：错误仍落对话框 Alert，不留哑对话框', async () => {
      const applyOp = vi.fn().mockRejectedValue(new Error('db not open'));
      const fs = makeFs({
        formModel: fullFormModel,
        tree: [entryWithParams({ profile: [], distance: 5 })],
        applyOp,
      });
      const dialog = openEditDialog(fs);

      fireEvent.click(within(dialog).getByRole('button', { name: '应用' }));

      await waitFor(() => expect(within(dialog).getByText('db not open')).toBeDefined());
      expect(screen.getByRole('dialog')).toBeDefined();
    });
  });

  describe('T6.2 新建特征流（类型 Select → 参数表单 → insertFeature）', () => {
    const fullFormModel: FeatureFormModel = {
      ...formModel,
      extrude: {
        fields: [
          { name: 'profile', label: '轮廓', kind: 'json' },
          { name: 'distance', label: '距离', kind: 'number' },
          { name: 'sketchId', label: '草图', kind: 'readonlyText', readOnly: true },
        ],
      },
      fillet: {
        fields: [
          { name: 'radius', label: '圆角半径', kind: 'number' },
          { name: 'propagateSmooth', label: '光滑传播', kind: 'boolean' },
          { name: 'edges', label: '边引用', kind: 'edgeRefs' },
        ],
      },
    };

    it('选定类型后渲染参数表单；创建 → applyOp(insertFeature)；成功关对话框 + toast success', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: true, featureId: 'new-1' });
      const fs = makeFs({ formModel: fullFormModel, applyOp });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} onToast={onToast} />);

      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));
      const dialog = screen.getByRole('dialog');

      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'extrude' } });

      // 参数表单出现（三 kind 字段）且「创建」可用
      expect(within(dialog).getByLabelText('距离')).toBeDefined();
      expect(within(dialog).getByLabelText('轮廓')).toBeDefined();
      expect(within(dialog).getByLabelText('草图')).toBeDefined();
      expect(within(dialog).getByRole('button', { name: '创建' }).getAttribute('aria-disabled')).not.toBe('true');

      fireEvent.change(within(dialog).getByLabelText('轮廓'), {
        target: { value: '[{"x":0,"y":0},{"x":2,"y":0},{"x":2,"y":2},{"x":0,"y":2}]' },
      });
      fireEvent.blur(within(dialog).getByLabelText('轮廓'));
      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));

      await waitFor(() =>
        expect(applyOp).toHaveBeenCalledWith({
          kind: 'insertFeature',
          featureType: 'extrude',
          params: {
            profile: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }],
            distance: 2,
          },
        }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(onToast).toHaveBeenCalledWith('特征已创建', 'success');
    });

    it('未选类型时「创建」禁用；fillet 的 edgeRefs 渲染 chips + 「未选择边」', () => {
      const fs = makeFs({ formModel: fullFormModel });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: '创建' }).getAttribute('aria-disabled')).toBe('true');

      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'fillet' } });
      expect(within(dialog).getByTestId('feature-edge-chips-edges')).toBeDefined();
      expect(within(dialog).getByText('未选择边')).toBeDefined();
      expect((within(dialog).getByLabelText('圆角半径') as HTMLInputElement).value).toBe('0');
    });

    it('创建失败：后端校验错误在对话框 Alert 呈现（M2-UX #4）', async () => {
      const applyOp = vi.fn().mockResolvedValue({ ok: false, error: '无 sketchId 时 profile 至少 3 点' });
      const fs = makeFs({ formModel: fullFormModel, applyOp });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);

      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'extrude' } });
      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));

      await waitFor(() => expect(within(dialog).getByText('无 sketchId 时 profile 至少 3 点')).toBeDefined());
      expect(screen.getByRole('dialog')).toBeDefined();
    });
  });

  describe('T6.3 视口选边拾取器（edgePicker 插槽接线）', () => {
    const filletModel: FeatureFormModel = {
      extrude: { fields: [{ name: 'distance', label: '距离', kind: 'number' }] },
      fillet: {
        fields: [
          { name: 'radius', label: '圆角半径', kind: 'number' },
          { name: 'propagateSmooth', label: '光滑传播', kind: 'boolean' },
          { name: 'edges', label: '边引用', kind: 'edgeRefs' },
        ],
      },
    };
    const conn = { key: 'm.bim' } as never;

    const openNewDialog = (fs: UseFeatureSystem) => {
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} connection={conn} />);
      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));
      return screen.getByRole('dialog');
    };

    it('fillet 表单渲染「从视图选边」按钮（edgeRefs kind 字段）；extrude 表单无按钮', () => {
      const fs = makeFs({ formModel: filletModel });
      const dialog = openNewDialog(fs);

      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'fillet' } });
      expect(within(dialog).getByRole('button', { name: '从视图选边' })).toBeDefined();

      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'extrude' } });
      expect(within(dialog).queryByRole('button', { name: '从视图选边' })).toBeNull();
    });

    it('点击「从视图选边」→ picker.start；picking 态对话框暂隐 + 浮条「停止选边」→ picker.stop', () => {
      const fs = makeFs({ formModel: filletModel });
      const { rerender } = render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} connection={conn} />);
      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'fillet' } });

      fireEvent.click(within(dialog).getByRole('button', { name: '从视图选边' }));
      expect(pickerMocks.start).toHaveBeenCalledTimes(1);

      // picking 态：同一实例重渲染（hook mock 按渲染期读值）。
      // FeaturePanel 是 React.memo——生产里 hook 内 setPicking 自驱重渲染，mock 无内部 state，
      // 须换 prop 引用破 memo（测试伪影，非产品缺陷）
      pickerMocks.picking = true;
      rerender(<FeaturePanel fs={fs} onEditFeature={() => undefined} connection={conn} />);

      // 模态 backdrop 吞视口点击 → 对话框暂隐（isOpen 门控），浮条接管拾取期操作
      expect(screen.queryByRole('dialog')).toBeNull();
      const banner = screen.getByTestId('edge-picker-banner');
      fireEvent.click(within(banner).getByRole('button', { name: '停止选边' }));
      expect(pickerMocks.stop).toHaveBeenCalled();

      // 拾取结束 → 对话框复开（表单态在面板层未丢）
      pickerMocks.picking = false;
      rerender(<FeaturePanel fs={fs} onEditFeature={onEditFeature} connection={conn} />);
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    it('无 connection → 拾取按钮禁用（aria-disabled）', () => {
      const fs = makeFs({ formModel: filletModel });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} />);
      fireEvent.click(screen.getByRole('button', { name: '新建特征' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'fillet' } });
      expect(within(dialog).getByRole('button', { name: '从视图选边' }).getAttribute('aria-disabled')).toBe('true');
    });

    it('对话框取消/类型切换中途拾取 → picker.stop 回收（三通道退场纪律）', () => {
      const fs = makeFs({ formModel: filletModel });
      const dialog = openNewDialog(fs);
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'fillet' } });
      // 类型选定本身亦走 handleNewTypeChange（含一次 stop 调用，属正常归零）——清计数后钉增量
      pickerMocks.stop.mockClear();
      fireEvent.click(within(dialog).getByRole('button', { name: '从视图选边' }));
      expect(pickerMocks.stop).not.toHaveBeenCalled();

      // 类型切换 mid-pick → stop
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'extrude' } });
      expect(pickerMocks.stop).toHaveBeenCalledTimes(1);

      // 取消关对话框 mid-pick → stop
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'fillet' } });
      pickerMocks.stop.mockClear();
      fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
      expect(pickerMocks.stop).toHaveBeenCalledTimes(1);
    });

    it('编辑 fillet 特征对话框同样注入拾取按钮', () => {
      const fs = makeFs({
        formModel: filletModel,
        tree: [makeEntry({ id: 'fl1', featureType: 'fillet', params: { radius: 1, propagateSmooth: true, edges: [] } })],
      });
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} connection={conn} />);
      fireEvent.click(screen.getByRole('button', { name: '编辑特征' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: '从视图选边' })).toBeDefined();
    });
  });

  describe('T6.4 编辑对话框试算预览（debounce previewOp + 反馈徽标）', () => {
    /** extrude 双字段表单（json + number）——编辑流预填存储 params */
    const editFormModel: FeatureFormModel = {
      extrude: {
        fields: [
          { name: 'profile', label: '轮廓', kind: 'json' },
          { name: 'distance', label: '距离', kind: 'number' },
        ],
      },
    };
    const editEntry = makeEntry({ id: 'f1', featureType: 'extrude', params: { profile: [], distance: 5 } });

    beforeEach(() => {
      // fake timers 必须先于 mount 安装（T6 教训：定时器相关副作用在挂载期即注册）
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const openEditDialog = (fs: UseFeatureSystem) => {
      render(<FeaturePanel fs={fs} onEditFeature={onEditFeature} onToast={onToast} />);
      fireEvent.click(screen.getByRole('button', { name: '编辑特征' }));
      return screen.getByRole('dialog');
    };

    /** 推进 debounce 窗口并冲刷微任务（previewOp 决议 → setState 落盘） */
    const advanceDebounce = async (ms = 400) => {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    };

    it('草稿变更 → 400ms debounce → previewOp(updateParams) 携带草稿参数；徽标成功文案 + 应用可用', async () => {
      const previewOp = vi.fn().mockResolvedValue({ ok: true, affected: [{ featureId: 'f1', status: 0 }] });
      const fs = makeFs({ formModel: editFormModel, tree: [editEntry], previewOp });
      const dialog = openEditDialog(fs);

      // 打开对话框本身不触发试算（无预览垃圾）
      await advanceDebounce(1000);
      expect(previewOp).not.toHaveBeenCalled();
      expect(within(dialog).queryByTestId('preview-badge')).toBeNull();

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '3' } });
      // debounce 窗口内不调用
      await advanceDebounce(399);
      expect(previewOp).not.toHaveBeenCalled();

      await advanceDebounce(1);
      expect(previewOp).toHaveBeenCalledTimes(1);
      expect(previewOp).toHaveBeenCalledWith({
        kind: 'updateParams',
        featureId: 'f1',
        params: { profile: [], distance: 3 },
      });
      expect(within(dialog).getByTestId('preview-badge')).toBeDefined();
      expect(within(dialog).getByText('✓ 试算通过（1 个特征受影响）')).toBeDefined();
      expect(within(dialog).getByRole('button', { name: '应用' }).getAttribute('aria-disabled')).not.toBe('true');
    });

    it('连续变更 debounce 折叠：仅以最后一次草稿试算一次', async () => {
      const previewOp = vi.fn().mockResolvedValue({ ok: true, affected: [] });
      const fs = makeFs({ formModel: editFormModel, tree: [editEntry], previewOp });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '3' } });
      await advanceDebounce(200);
      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '4' } });
      await advanceDebounce(200); // 第一次 timer 已被清，未到第二次 400ms
      expect(previewOp).not.toHaveBeenCalled();

      await advanceDebounce(200);
      expect(previewOp).toHaveBeenCalledTimes(1);
      expect(previewOp).toHaveBeenCalledWith({
        kind: 'updateParams',
        featureId: 'f1',
        params: { profile: [], distance: 4 },
      });
    });

    it('试算失败 → 徽标失败文案 + 应用禁用 + 「仍要应用」强制执行', async () => {
      const previewOp = vi
        .fn()
        .mockResolvedValue({ ok: false, error: 'distance 必须为正数', affected: [{ featureId: 'f1', status: 3 }] });
      const applyOp = vi.fn().mockResolvedValue({ ok: true });
      const fs = makeFs({ formModel: editFormModel, tree: [editEntry], previewOp, applyOp });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '-1' } });
      await advanceDebounce();

      expect(within(dialog).getByText('⚠ 试算失败：distance 必须为正数')).toBeDefined();
      expect(within(dialog).getByRole('button', { name: '应用' }).getAttribute('aria-disabled')).toBe('true');

      // 仍要应用：防引用失效误锁死——强制执行同一份草稿
      fireEvent.click(within(dialog).getByRole('button', { name: '仍要应用' }));
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'updateParams',
        featureId: 'f1',
        params: { profile: [], distance: -1 },
      });
    });

    it('previewOp 返回 undefined（RPC 不可用）→ 无徽标、应用不被禁用（优雅降级）', async () => {
      const previewOp = vi.fn().mockResolvedValue(undefined);
      const fs = makeFs({ formModel: editFormModel, tree: [editEntry], previewOp });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '3' } });
      await advanceDebounce();

      expect(within(dialog).queryByTestId('preview-badge')).toBeNull();
      expect(within(dialog).getByRole('button', { name: '应用' }).getAttribute('aria-disabled')).not.toBe('true');
      expect(within(dialog).queryByRole('button', { name: '仍要应用' })).toBeNull();
    });

    it('取消编辑 → 徽标/试算态不留痕；重开对话框不触发预览（无打开即预览）', async () => {
      const previewOp = vi.fn().mockResolvedValue({ ok: true, affected: [{ featureId: 'f1', status: 0 }] });
      const fs = makeFs({ formModel: editFormModel, tree: [editEntry], previewOp });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '3' } });
      await advanceDebounce();
      expect(within(dialog).getByTestId('preview-badge')).toBeDefined();

      fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByTestId('preview-badge')).toBeNull();

      // 重开：预填存储值 = 无草稿变更 → 不试算
      fireEvent.click(screen.getByRole('button', { name: '编辑特征' }));
      const dialog2 = screen.getByRole('dialog');
      expect(within(dialog2).queryByTestId('preview-badge')).toBeNull();
      await advanceDebounce(1000);
      expect(previewOp).toHaveBeenCalledTimes(1);
    });

    it('乱序守卫：迟到的旧试算决议不得覆盖新徽标（last-call-wins）', async () => {
      let resolveStale:
        | ((v: { ok: boolean; error?: string; affected: Array<{ featureId: string; status: number }> }) => void)
        | undefined;
      const previewOp = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<{ ok: boolean; error?: string; affected: Array<{ featureId: string; status: number }> }>(
              (res) => {
                resolveStale = res;
              },
            ),
        )
        .mockResolvedValue({ ok: true, affected: [] });
      const fs = makeFs({ formModel: editFormModel, tree: [editEntry], previewOp });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '3' } });
      await advanceDebounce(); // 第一次试算挂起未决议
      expect(previewOp).toHaveBeenCalledTimes(1);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '4' } });
      await advanceDebounce(); // 第二次试算成功
      expect(within(dialog).getByText(/试算通过/)).toBeDefined();

      // 迟到的第一次决议（失败）被丢弃
      await act(async () => {
        resolveStale?.({ ok: false, error: '过期结果', affected: [] });
      });
      expect(within(dialog).queryByText(/试算失败/)).toBeNull();
      expect(within(dialog).getByText(/试算通过/)).toBeDefined();
    });

    it('草稿回退存储值 → 清徽标且不再试算', async () => {
      const previewOp = vi.fn().mockResolvedValue({ ok: true, affected: [{ featureId: 'f1', status: 0 }] });
      const fs = makeFs({ formModel: editFormModel, tree: [editEntry], previewOp });
      const dialog = openEditDialog(fs);

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '3' } });
      await advanceDebounce();
      expect(within(dialog).getByTestId('preview-badge')).toBeDefined();

      fireEvent.change(within(dialog).getByLabelText('距离'), { target: { value: '5' } });
      await advanceDebounce();
      expect(within(dialog).queryByTestId('preview-badge')).toBeNull();
      expect(previewOp).toHaveBeenCalledTimes(1);
    });
  });
});
