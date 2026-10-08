/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * SketchPanel 单元测试（M3-b T4.7 面板）：真数据源（useSketchSystem.activeSketch）+
 * 三清单渲染 + DOF 徽标三态 + 矛盾红标 + 实体级联删除 + 尺寸值编辑 +
 * dimensionCandidate 值确认桥 + 新建草图/草图切换 + 工具启动注入。
 *
 * 数据源裁决（Design Note 10）：getSketch 服务端现场求解——面板只读 activeSketch，
 * 零本地 mock 实体状态；一切写操作经 applyUpdate 整体覆写提交（E-1）。
 * 级联删除 v1 简化（Task-4 拓扑）：line 拥有端点 / circle 拥有圆心；
 * 删实体 → 拥有子实体级联 + 引用已删实体的实体级联 + refs 命中已删 id 的
 * 约束级联（coincident 焊接单边删除即清焊接约束，另一侧属他人所有而存活）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import type {
  FeatureOpResult,
  SketchConstraintDto,
  SketchDto,
  SketchEntityDto,
  SketchSolveStateDto,
} from '@luban-cad/shared';
import { SketchPanel, computeCascadeDelete } from './SketchPanel.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';
import { runSketchCreateTool } from '../tools/SketchCreateTool.js';
import { runSketchAddConstraintTool } from '../tools/SketchAddConstraintTool.js';
import { runSketchAddDimensionTool, sketchToolEvents } from '../tools/SketchAddDimensionTool.js';
import { IModelApp } from '@itwin/core-frontend';

// ---------------------------------------------------------------------------
// Mock @itwin/core-frontend（面板只用 IModelApp.toolAdmin.startDefaultTool；
// PrimitiveTool/Tool 基类供真实工具模块顶层 class extends 求值——SketchAddDimensionTool.test.ts 先例）
// ---------------------------------------------------------------------------
const coreMocks = vi.hoisted(() => ({
  startDefaultTool: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => {
  class Tool {
    static toolId = '';
    static iconSpec = '';
    async run(): Promise<boolean> { return true; }
    async exitTool(): Promise<void> { /* noop */ }
  }
  class PrimitiveTool extends Tool {
    async onPostInstall(): Promise<void> { /* noop */ }
    async onCleanup(): Promise<void> { /* noop */ }
    initLocateElements(..._args: unknown[]): void { /* noop */ }
    requireWriteableTarget(): boolean { return true; }
  }
  return {
    Tool,
    PrimitiveTool,
    IModelApp: {
      toolAdmin: { startDefaultTool: coreMocks.startDefaultTool },
      locateManager: { currHit: undefined },
      accuSnap: { currHit: undefined },
      notifications: { outputPrompt: vi.fn(), outputMessage: vi.fn() },
    },
    EventHandled: { Yes: 1, No: 0 },
    BeButtonEvent: class {},
  };
});

// 工具启动器全 mock（注入参数断言用）；sketchToolEvents/nextConstraintId 保留真实实现
vi.mock('../tools/SketchCreateTool.js', () => ({
  runSketchCreateTool: vi.fn(),
}));

vi.mock('../tools/SketchAddConstraintTool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./SketchAddConstraintTool.js')>();
  return { ...actual, runSketchAddConstraintTool: vi.fn() };
});

vi.mock('../tools/SketchAddDimensionTool.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./SketchAddDimensionTool.js')>();
  return { ...actual, runSketchAddDimensionTool: vi.fn() };
});

vi.mock('./SketchPanel.css', () => ({}));

const mockedRunCreate = vi.mocked(runSketchCreateTool);
const mockedRunConstraint = vi.mocked(runSketchAddConstraintTool);
const mockedRunDimension = vi.mocked(runSketchAddDimensionTool);

// ---------------------------------------------------------------------------
// Fixture 工厂
// ---------------------------------------------------------------------------

const makeSolve = (over: Partial<SketchSolveStateDto> = {}): SketchSolveStateDto => ({
  status: 'ok',
  dof: 0,
  failedConstraintIds: [],
  conflictingRank: [],
  ...over,
});

/** 全拓扑 fixture：p1(0,0) p2(10,0) 线#3；圆心=p1 圆#4；水平#5 距离#6 半径#7 */
const makeSketch = (over: Partial<SketchDto> = {}): SketchDto => ({
  id: 'sk-1',
  entities: [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 10, y: 0 },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
    { kind: 'circle', id: 4, center: 1, radius: 5 },
  ],
  constraints: [
    { kind: 'horizontal', id: 5, refs: [3] },
    { kind: 'distance', id: 6, refs: [1, 2], value: 10 },
    { kind: 'radius', id: 7, refs: [4], value: 5 },
  ],
  solve: makeSolve(),
  ...over,
});

const makeSketchSystem = (over: Partial<UseSketchSystem> = {}): UseSketchSystem => ({
  sketches: [{ id: 'sk-1', entityCount: 4, constraintCount: 3 }],
  activeSketch: makeSketch(),
  loading: false,
  openSketch: vi.fn().mockResolvedValue(undefined),
  closeSketch: vi.fn(),
  applyUpdate: vi.fn().mockResolvedValue({ ok: true } satisfies FeatureOpResult),
  createSketch: vi.fn().mockResolvedValue({ ok: true, featureId: 'sk-2' } satisfies FeatureOpResult),
  refresh: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const renderPanel = (sketchSystem: UseSketchSystem, onExit = vi.fn(), onToast = vi.fn()) =>
  render(<SketchPanel isActive={true} onExit={onExit} sketchSystem={sketchSystem} onToast={onToast} />);

// ---------------------------------------------------------------------------

describe('SketchPanel（M3-b T4.7 真数据面板）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('元素清单（activeSketch.entities 真数据）', () => {
    it('点/线/圆按标签格式渲染（#id 摘要 + 解算坐标）', () => {
      renderPanel(makeSketchSystem());
      expect(screen.getByText('#1 (0.00, 0.00)')).toBeDefined();
      expect(screen.getByText('#2 (10.00, 0.00)')).toBeDefined();
      expect(screen.getByText('#3 (#1→#2)')).toBeDefined();
      expect(screen.getByText('#4 (r=5.00)')).toBeDefined();
    });

    it('无解算坐标的点显示占位符而非崩溃', () => {
      const sketch = makeSketch({
        entities: [{ kind: 'point', id: 9 }],
      });
      renderPanel(makeSketchSystem({ activeSketch: sketch }));
      expect(screen.getByText('#9 (?, ?)')).toBeDefined();
    });

    it('未打开草图显示空态文案与新建入口', () => {
      renderPanel(makeSketchSystem({ activeSketch: undefined }));
      expect(screen.getByText('尚未打开草图')).toBeDefined();
      expect(screen.getByRole('button', { name: '新建草图' })).toBeDefined();
    });

    it('空实体草图显示空态文案', () => {
      renderPanel(makeSketchSystem({ activeSketch: makeSketch({ entities: [], constraints: [] }) }));
      expect(screen.getByText('暂无实体')).toBeDefined();
    });
  });

  describe('约束清单 + 矛盾/失败红标', () => {
    it('渲染 kind+refs 摘要', () => {
      renderPanel(makeSketchSystem());
      fireEvent.click(screen.getByRole('button', { name: '约束' }));
      expect(screen.getByText('#5 horizontal [3]')).toBeDefined();
      expect(screen.getByText('#6 distance [1,2]')).toBeDefined();
    });

    it('failedConstraintIds 命中的约束行带 conflict 红标', () => {
      const sketch = makeSketch({
        solve: makeSolve({ status: 'conflicting', failedConstraintIds: [6], conflictingRank: [] }),
      });
      const { container } = renderPanel(makeSketchSystem({ activeSketch: sketch }));
      fireEvent.click(screen.getByRole('button', { name: '约束' }));
      const row = container.querySelector('.constraint-item.conflict');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('#6 distance');
    });

    it('conflictingRank 命中的约束行同样红标', () => {
      const sketch = makeSketch({
        solve: makeSolve({ status: 'conflicting', failedConstraintIds: [], conflictingRank: [5] }),
      });
      const { container } = renderPanel(makeSketchSystem({ activeSketch: sketch }));
      fireEvent.click(screen.getByRole('button', { name: '约束' }));
      const row = container.querySelector('.constraint-item.conflict');
      expect(row?.textContent).toContain('#5 horizontal');
    });
  });

  describe('尺寸清单（distance/radius 值可编辑）', () => {
    it('渲染 distance/radius 约束的值', () => {
      renderPanel(makeSketchSystem());
      fireEvent.click(screen.getByRole('button', { name: '尺寸' }));
      expect(screen.getByText('距离')).toBeDefined();
      expect(screen.getByText('半径')).toBeDefined();
      expect(screen.getByText('10.00')).toBeDefined();
      expect(screen.getByText('5.00')).toBeDefined();
    });

    it('点击值 → 内联输入 → Enter 提交 applyUpdate（整体覆写更新 value）', async () => {
      const sketchSystem = makeSketchSystem();
      renderPanel(sketchSystem);
      fireEvent.click(screen.getByRole('button', { name: '尺寸' }));
      fireEvent.click(screen.getByText('10.00'));

      const input = screen.getByDisplayValue('10');
      fireEvent.change(input, { target: { value: '12.5' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
      });
      const [entities, constraints] = vi.mocked(sketchSystem.applyUpdate).mock.calls[0];
      expect(entities).toEqual(makeSketch().entities);
      expect(constraints).toEqual([
        { kind: 'horizontal', id: 5, refs: [3] },
        { kind: 'distance', id: 6, refs: [1, 2], value: 12.5 },
        { kind: 'radius', id: 7, refs: [4], value: 5 },
      ]);
    });

    it('值非法（≤0）→ 错误 toast 且不提交', async () => {
      const sketchSystem = makeSketchSystem();
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      fireEvent.click(screen.getByRole('button', { name: '尺寸' }));
      fireEvent.click(screen.getByText('10.00'));

      const input = screen.getByDisplayValue('10');
      fireEvent.change(input, { target: { value: '-1' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith('尺寸值必须为正数', 'error');
      });
      expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    });

    it('后端拒收 → 错误 toast（拒收文本原样透出）', async () => {
      const sketchSystem = makeSketchSystem({
        applyUpdate: vi.fn().mockResolvedValue({ ok: false, error: '约束矛盾: dof=0 冲突' } satisfies FeatureOpResult),
      });
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      fireEvent.click(screen.getByRole('button', { name: '尺寸' }));
      fireEvent.click(screen.getByText('10.00'));

      const input = screen.getByDisplayValue('10');
      fireEvent.change(input, { target: { value: '12.5' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith('约束矛盾: dof=0 冲突', 'error');
      });
    });
  });

  describe('DOF 徽标（求解三态 + 冗余）', () => {
    it('恰定（ok 且 dof=0）→ positive 徽标「自由度: 0」', () => {
      const { container } = renderPanel(makeSketchSystem());
      const badge = screen.getByText('自由度: 0');
      expect(badge.getAttribute('data-iui-status')).toBe('positive');
      expect(container).toBeDefined();
    });

    it('欠约束（underconstrained）→ informational 徽标「欠约束 (N)」', () => {
      const sketch = makeSketch({ solve: makeSolve({ status: 'underconstrained', dof: 3 }) });
      renderPanel(makeSketchSystem({ activeSketch: sketch }));
      const badge = screen.getByText('欠约束 (3)');
      expect(badge.getAttribute('data-iui-status')).toBe('informational');
    });

    it('矛盾（conflicting）→ negative 徽标「矛盾」', () => {
      const sketch = makeSketch({ solve: makeSolve({ status: 'conflicting' }) });
      renderPanel(makeSketchSystem({ activeSketch: sketch }));
      const badge = screen.getByText('矛盾');
      expect(badge.getAttribute('data-iui-status')).toBe('negative');
    });

    it('失败（failed）→ negative 徽标「失败」', () => {
      const sketch = makeSketch({ solve: makeSolve({ status: 'failed' }) });
      renderPanel(makeSketchSystem({ activeSketch: sketch }));
      const badge = screen.getByText('失败');
      expect(badge.getAttribute('data-iui-status')).toBe('negative');
    });

    it('redundant → 附加 warning 徽标「冗余」', () => {
      const sketch = makeSketch({ solve: makeSolve({ redundant: true }) });
      renderPanel(makeSketchSystem({ activeSketch: sketch }));
      const badge = screen.getByText('冗余');
      expect(badge.getAttribute('data-iui-status')).toBe('warning');
    });
  });

  describe('实体级联删除（computeCascadeDelete 纯函数）', () => {
    const p1: SketchEntityDto = { kind: 'point', id: 1, x: 0, y: 0 };
    const p2: SketchEntityDto = { kind: 'point', id: 2, x: 10, y: 0 };
    const lineA: SketchEntityDto = { kind: 'line', id: 3, p1: 1, p2: 2 };
    const p3: SketchEntityDto = { kind: 'point', id: 8, x: 10, y: 10 };
    const p4: SketchEntityDto = { kind: 'point', id: 9, x: 0, y: 10 };
    const lineB: SketchEntityDto = { kind: 'line', id: 10, p1: 8, p2: 9 };
    const weld: SketchConstraintDto = { kind: 'coincident', id: 11, refs: [2, 8] };
    const horiz: SketchConstraintDto = { kind: 'horizontal', id: 5, refs: [3] };

    it('删线 → 拥有端点级联删除 + refs 命中约束清除', () => {
      const { entities, constraints } = computeCascadeDelete([p1, p2, lineA], [horiz], 3);
      expect(entities).toEqual([]);
      expect(constraints).toEqual([]);
    });

    it('焊接角点：删线A → 焊接约束清除，线B 与其端点存活', () => {
      const { entities, constraints } = computeCascadeDelete(
        [p1, p2, lineA, p3, p4, lineB],
        [horiz, weld],
        3,
      );
      expect(entities).toEqual([p3, p4, lineB]);
      expect(constraints).toEqual([]);
    });

    it('删点 → 引用它的线级联（含线拥有的另一端点）', () => {
      const { entities, constraints } = computeCascadeDelete([p1, p2, lineA], [horiz], 1);
      expect(entities).toEqual([]);
      expect(constraints).toEqual([]);
    });
  });

  describe('实体/约束删除提交', () => {
    it('删除实体按钮 → applyUpdate 提交级联结果', async () => {
      const sketchSystem = makeSketchSystem();
      const { container } = renderPanel(sketchSystem);
      // 删线#3：端点#1#2 级联、圆#4（圆心=#1）级联、全部约束 refs 命中清除
      const row = container.querySelector('.element-item');
      const deleteButtons = container.querySelectorAll('.element-item .sketch-row-delete');
      expect(deleteButtons.length).toBe(4);
      fireEvent.click(deleteButtons[2]); // #3 line

      await waitFor(() => {
        expect(sketchSystem.applyUpdate).toHaveBeenCalledWith([], []);
      });
    });

    it('删除约束按钮 → applyUpdate 仅移除该约束', async () => {
      const sketchSystem = makeSketchSystem();
      const { container } = renderPanel(sketchSystem);
      fireEvent.click(screen.getByRole('button', { name: '约束' }));
      const deleteButtons = container.querySelectorAll('.constraint-item .sketch-row-delete');
      expect(deleteButtons.length).toBe(3);
      fireEvent.click(deleteButtons[0]); // #5 horizontal

      await waitFor(() => {
        expect(sketchSystem.applyUpdate).toHaveBeenCalledWith(makeSketch().entities, [
          { kind: 'distance', id: 6, refs: [1, 2], value: 10 },
          { kind: 'radius', id: 7, refs: [4], value: 5 },
        ]);
      });
    });

    it('删除提交后端拒收 → 错误 toast', async () => {
      const sketchSystem = makeSketchSystem({
        applyUpdate: vi.fn().mockResolvedValue({ ok: false, error: '拒收' } satisfies FeatureOpResult),
      });
      const onToast = vi.fn();
      const { container } = renderPanel(sketchSystem, vi.fn(), onToast);
      const deleteButtons = container.querySelectorAll('.element-item .sketch-row-delete');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith('拒收', 'error');
      });
    });
  });

  describe('dimensionCandidate 值确认桥（E-4：工具发候选，面板收值提交）', () => {
    it('候选到达 → 自动切到尺寸 tab 并显示内联收值表单', () => {
      renderPanel(makeSketchSystem());
      expect(screen.queryByText('确认尺寸值')).toBeNull();
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', { kind: 'distance', refs: [1, 2], entityIds: [1, 2] });
      });
      expect(screen.getByText('确认尺寸值')).toBeDefined();
      expect(screen.getByRole('button', { name: '确认' })).toBeDefined();
      expect(screen.getByRole('button', { name: '取消' })).toBeDefined();
    });

    it('确认 → 构造 {kind,id=maxId+1,refs,value} 追加提交', async () => {
      const sketchSystem = makeSketchSystem();
      renderPanel(sketchSystem);
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', { kind: 'distance', refs: [1, 2], entityIds: [1, 2] });
      });
      const input = screen.getByPlaceholderText('输入尺寸值（>0）');
      fireEvent.change(input, { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: '确认' }));

      await waitFor(() => {
        expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1);
      });
      const [entities, constraints] = vi.mocked(sketchSystem.applyUpdate).mock.calls[0];
      expect(entities).toEqual(makeSketch().entities);
      expect(constraints).toEqual([
        ...makeSketch().constraints,
        { kind: 'distance', id: 8, refs: [1, 2], value: 8 },
      ]);
    });

    it('确认后表单关闭', async () => {
      const sketchSystem = makeSketchSystem();
      renderPanel(sketchSystem);
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', { kind: 'radius', refs: [4], entityIds: [4] });
      });
      const input = screen.getByPlaceholderText('输入尺寸值（>0）');
      fireEvent.change(input, { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: '确认' }));

      await waitFor(() => {
        expect(screen.queryByText('确认尺寸值')).toBeNull();
      });
    });

    it('取消 → 丢弃候选，不提交', () => {
      const sketchSystem = makeSketchSystem();
      renderPanel(sketchSystem);
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', { kind: 'distance', refs: [1, 2], entityIds: [1, 2] });
      });
      fireEvent.click(screen.getByRole('button', { name: '取消' }));
      expect(screen.queryByText('确认尺寸值')).toBeNull();
      expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    });

    it('值非法 → 错误 toast 且不提交', async () => {
      const sketchSystem = makeSketchSystem();
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', { kind: 'distance', refs: [1, 2], entityIds: [1, 2] });
      });
      const input = screen.getByPlaceholderText('输入尺寸值（>0）');
      fireEvent.change(input, { target: { value: '0' } });
      fireEvent.click(screen.getByRole('button', { name: '确认' }));

      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith('尺寸值必须为正数', 'error');
      });
      expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    });

    it('提交被拒 → 错误 toast（表单保持，可改值或取消）', async () => {
      const sketchSystem = makeSketchSystem({
        applyUpdate: vi.fn().mockResolvedValue({ ok: false, error: 'dof 冲突' } satisfies FeatureOpResult),
      });
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      act(() => {
        sketchToolEvents.emit('dimensionCandidate', { kind: 'distance', refs: [1, 2], entityIds: [1, 2] });
      });
      const input = screen.getByPlaceholderText('输入尺寸值（>0）');
      fireEvent.change(input, { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: '确认' }));

      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith('dof 冲突', 'error');
      });
      expect(screen.getByText('确认尺寸值')).toBeDefined(); // 表单保持
    });

    it('卸载后订阅清理：再发候选不触发提交/不报错', () => {
      const sketchSystem = makeSketchSystem();
      const { unmount } = renderPanel(sketchSystem);
      unmount();
      expect(() => {
        act(() => {
          sketchToolEvents.emit('dimensionCandidate', { kind: 'distance', refs: [1, 2], entityIds: [1, 2] });
        });
      }).not.toThrow();
      expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    });
  });

  describe('草图管理', () => {
    it('「新建草图」→ createSketch([], [])（空实体起步）', async () => {
      const sketchSystem = makeSketchSystem();
      renderPanel(sketchSystem);
      fireEvent.click(screen.getByRole('button', { name: '新建草图' }));
      await waitFor(() => {
        expect(sketchSystem.createSketch).toHaveBeenCalledWith([], []);
      });
    });

    it('新建失败 → 错误 toast', async () => {
      const sketchSystem = makeSketchSystem({
        createSketch: vi.fn().mockResolvedValue({ ok: false, error: '写租约被拒' } satisfies FeatureOpResult),
      });
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      fireEvent.click(screen.getByRole('button', { name: '新建草图' }));
      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith('写租约被拒', 'error');
      });
    });

    it('多草图时显示切换器，选择 → openSketch', () => {
      const sketchSystem = makeSketchSystem({
        sketches: [
          { id: 'sk-1', entityCount: 4, constraintCount: 3 },
          { id: 'sk-2', entityCount: 0, constraintCount: 0 },
        ],
      });
      renderPanel(sketchSystem);
      const select = screen.getByDisplayValue('sk-1');
      fireEvent.change(select, { target: { value: 'sk-2' } });
      expect(sketchSystem.openSketch).toHaveBeenCalledWith('sk-2');
    });
  });

  describe('工具启动（依赖注入 sketchSystem+onToast）', () => {
    it('绘制按钮组启动 runSketchCreateTool（线/矩形/圆）', () => {
      const sketchSystem = makeSketchSystem();
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      fireEvent.click(screen.getByRole('button', { name: '直线' }));
      expect(mockedRunCreate).toHaveBeenCalledWith('line', { sketchSystem, onToast });
      fireEvent.click(screen.getByRole('button', { name: '矩形' }));
      expect(mockedRunCreate).toHaveBeenCalledWith('rectangle', { sketchSystem, onToast });
      fireEvent.click(screen.getByRole('button', { name: '圆' }));
      expect(mockedRunCreate).toHaveBeenCalledWith('circle', { sketchSystem, onToast });
    });

    it('约束按钮组启动 runSketchAddConstraintTool', () => {
      const sketchSystem = makeSketchSystem();
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      fireEvent.click(screen.getByRole('button', { name: '约束' }));
      fireEvent.click(screen.getByRole('button', { name: '水平' }));
      expect(mockedRunConstraint).toHaveBeenCalledWith('horizontal', { sketchSystem, onToast });
      fireEvent.click(screen.getByRole('button', { name: '平行' }));
      expect(mockedRunConstraint).toHaveBeenCalledWith('parallel', { sketchSystem, onToast });
    });

    it('尺寸按钮组启动 runSketchAddDimensionTool', () => {
      const sketchSystem = makeSketchSystem();
      const onToast = vi.fn();
      renderPanel(sketchSystem, vi.fn(), onToast);
      fireEvent.click(screen.getByRole('button', { name: '尺寸' }));
      fireEvent.click(screen.getByRole('button', { name: '距离尺寸' }));
      expect(mockedRunDimension).toHaveBeenCalledWith('distance', { sketchSystem, onToast });
      fireEvent.click(screen.getByRole('button', { name: '半径尺寸' }));
      expect(mockedRunDimension).toHaveBeenCalledWith('radius', { sketchSystem, onToast });
    });
  });

  describe('退出草图', () => {
    it('退出 → startDefaultTool + closeSketch + onExit', () => {
      const sketchSystem = makeSketchSystem();
      const onExit = vi.fn();
      renderPanel(sketchSystem, onExit);
      fireEvent.click(screen.getByRole('button', { name: '退出草图' }));
      expect(coreMocks.startDefaultTool).toHaveBeenCalled();
      expect(sketchSystem.closeSketch).toHaveBeenCalled();
      expect(onExit).toHaveBeenCalled();
    });

    it('isActive=false → 不渲染', () => {
      const { container } = render(
        <SketchPanel isActive={false} onExit={vi.fn()} sketchSystem={makeSketchSystem()} onToast={vi.fn()} />,
      );
      expect(container.innerHTML).toBe('');
    });
  });
});
