/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { FeatureFormModel, FeatureTreeEntry } from '@luban-cad/shared';
import { FeaturePanel } from './FeaturePanel.js';
import type { UseFeatureSystem } from '../hooks/useFeatureSystem.js';

// Mock CSS imports
vi.mock('./FeaturePanel.css', () => ({}));

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
});
