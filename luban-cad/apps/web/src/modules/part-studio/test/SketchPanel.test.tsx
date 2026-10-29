/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * M6-b T5：SketchPanel 单测——DOF 徽标四态 + 三清单渲染 + 矛盾红标 +
 * 尺寸内联编辑（updateSketchConstraint 通道）+ dimensionCandidate 值确认桥 +
 * 级联删除（纯函数 + UI 载荷）+ 退出接线。
 *
 * 数据源：面板只读 sketchSystem.activeSketch（Session 直通的 hook 实例替身），
 * 写面断言 applyUpdate/applyConstraintValue 载荷；@itwin/core-frontend 模块级
 * mock（零真实查看器；面板不引 PrimitiveTool 系工具类——sketch-constraint-
 * logic/sketch-tool-events 均零 core-frontend 依赖，M6-b T5 拆模块裁决）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import type { FeatureOpResult, SketchDto, SketchEntityDto, SketchSolveStateDto } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  startDefaultTool: vi.fn(),
  outputMessage: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    toolAdmin: { startDefaultTool: mocks.startDefaultTool },
    notifications: { outputMessage: mocks.outputMessage, outputPrompt: vi.fn() },
  },
  NotifyMessageDetails: class {
    priority: number;
    briefMessage: string;
    constructor(priority: number, briefMessage: string) {
      this.priority = priority;
      this.briefMessage = briefMessage;
    }
  },
  OutputMessagePriority: { None: 0, Success: 1, Error: 10, Warning: 11, Info: 12 },
}));

import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { SketchPanel, computeCascadeDelete } from '../components/SketchPanel.js';
import { sketchToolEvents } from '../tools/sketch/sketch-tool-events.js';
import type { SketchDimensionCandidate } from '../tools/sketch/sketch-tool-events.js';
import type { UseSketchSystem } from '../hooks/useSketchSystem.js';

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

/** 全拓扑 fixture：p1(0,0) p2(10,0) 线#3；圆心#4(20,0) 圆#5 r=5；
 * 水平#6 距离#7(v=10) 半径#8(v=5)。实体/约束共用一支 id 计数 → 全局 maxId=8。 */
const makeSketch = (over: Partial<SketchDto> = {}): SketchDto => ({
  id: 'sk-1',
  entities: [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 10, y: 0 },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
    { kind: 'point', id: 4, x: 20, y: 0 },
    { kind: 'circle', id: 5, center: 4, radius: 5 },
  ] as SketchEntityDto[],
  constraints: [
    { kind: 'horizontal', id: 6, refs: [3] },
    { kind: 'distance', id: 7, refs: [1, 2], value: 10 },
    { kind: 'radius', id: 8, refs: [5], value: 5 },
  ],
  solve: makeSolve(),
  ...over,
});

function makeSketchSystem(over: Partial<UseSketchSystem> & { activeSketch?: SketchDto } = {}): UseSketchSystem {
  const { activeSketch, ...rest } = over;
  return {
    // 'in' 判别（非 undefined 比较）：显式传 activeSketch: undefined = 「无活动草图」态。
    activeSketch: 'activeSketch' in over ? activeSketch : makeSketch(),
    loading: false,
    applyUpdate: vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true })),
    applyConstraintValue: vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true })),
    refresh: vi.fn(async (): Promise<void> => undefined),
    ...rest,
  } as UseSketchSystem;
}

function renderPanel(sketchSystem: UseSketchSystem): void {
  render(<SketchPanel sketchSystem={sketchSystem} />);
}

function resetStore(): void {
  usePartStudioStore.setState({
    sketch: { isActive: true, activeSketchId: 'sk-1', activeSketchPlane: null },
  });
}

beforeEach(() => {
  resetStore();
  mocks.startDefaultTool.mockReset();
  mocks.outputMessage.mockReset();
});

// ---------------------------------------------------------------------------

describe('M6-b T5：SketchPanel DOF 徽标（solve 四态 + 冗余附加）', () => {
  it('ok+dof=0 → positive「恰定」', () => {
    renderPanel(makeSketchSystem());
    const badge = screen.getByTestId('sketch-panel-dof-badge');
    expect(badge.textContent).toBe('恰定（0 自由度）');
    expect(badge.getAttribute('data-tone')).toBe('positive');
    expect(screen.queryByTestId('sketch-panel-redundant-badge')).toBeNull();
  });

  it('ok+dof>0 与 underconstrained 同为 informational（含 dof 数）', () => {
    renderPanel(makeSketchSystem({ activeSketch: makeSketch({ solve: makeSolve({ status: 'ok', dof: 3 }) }) }));
    const badge = screen.getByTestId('sketch-panel-dof-badge');
    expect(badge.getAttribute('data-tone')).toBe('informational');
    expect(badge.textContent).toContain('3');

    cleanup();
    renderPanel(makeSketchSystem({ activeSketch: makeSketch({ solve: makeSolve({ status: 'underconstrained', dof: 2 }) }) }));
    const badge2 = screen.getByTestId('sketch-panel-dof-badge');
    expect(badge2.getAttribute('data-tone')).toBe('informational');
    expect(badge2.textContent).toContain('2');
  });

  it('conflicting / failed → negative', () => {
    renderPanel(makeSketchSystem({ activeSketch: makeSketch({ solve: makeSolve({ status: 'conflicting', failedConstraintIds: [7] }) }) }));
    expect(screen.getByTestId('sketch-panel-dof-badge').getAttribute('data-tone')).toBe('negative');

    cleanup();
    renderPanel(makeSketchSystem({ activeSketch: makeSketch({ solve: makeSolve({ status: 'failed' }) }) }));
    const badge = screen.getByTestId('sketch-panel-dof-badge');
    expect(badge.getAttribute('data-tone')).toBe('negative');
    expect(badge.textContent).toBe('求解失败');
  });

  it('redundant → 追加 warning 徽标', () => {
    renderPanel(makeSketchSystem({ activeSketch: makeSketch({ solve: makeSolve({ redundant: true }) }) }));
    expect(screen.getByTestId('sketch-panel-redundant-badge').textContent).toBe('含冗余约束');
  });

  it('无活动草图 → 空态（无徽标）', () => {
    renderPanel(makeSketchSystem({ activeSketch: undefined }));
    expect(screen.getByTestId('sketch-panel-empty')).toBeDefined();
    expect(screen.queryByTestId('sketch-panel-dof-badge')).toBeNull();
  });
});

describe('M6-b T5：SketchPanel 三清单', () => {
  it('实体清单（默认页签）：kind 徽标 + 摘要 + 每行删除钮', () => {
    renderPanel(makeSketchSystem());
    expect(screen.getByTestId('sketch-panel-entity-1').textContent).toContain('点');
    expect(screen.getByTestId('sketch-panel-entity-1').textContent).toContain('(0.00, 0.00)');
    expect(screen.getByTestId('sketch-panel-entity-3').textContent).toContain('#3 (#1→#2)');
    expect(screen.getByTestId('sketch-panel-entity-5').textContent).toContain('r=5.00');
    expect(screen.getByTestId('sketch-panel-delete-entity-1')).toBeDefined();
  });

  it('约束清单：kind 中文名 + refs + 矛盾红标（failed/conflicting 命中）', () => {
    renderPanel(makeSketchSystem({
      activeSketch: makeSketch({ solve: makeSolve({ failedConstraintIds: [6] }) }),
    }));
    fireEvent.click(screen.getByTestId('sketch-panel-tab-constraints'));
    const row6 = screen.getByTestId('sketch-panel-constraint-6');
    expect(row6.textContent).toContain('#6 水平 [3]');
    expect(row6.className).toContain('part-studio-sketch-panel__row--conflict');
    expect(screen.getByTestId('sketch-panel-constraint-7').className).not.toContain('--conflict');
    expect(screen.getByTestId('sketch-panel-constraint-8').textContent).toContain('半径 [5]');
  });

  it('尺寸清单：仅 distance/radius 过滤（horizontal 不入清单），值可点', () => {
    renderPanel(makeSketchSystem());
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    expect(screen.getByTestId('sketch-panel-dimension-7')).toBeDefined();
    expect(screen.getByTestId('sketch-panel-dimension-8')).toBeDefined();
    expect(screen.queryByTestId('sketch-panel-dimension-6')).toBeNull();
    expect(screen.getByTestId('sketch-panel-dimension-value-7').textContent).toBe('10.00');
  });

  it('清单标题计数', () => {
    renderPanel(makeSketchSystem());
    fireEvent.click(screen.getByTestId('sketch-panel-tab-constraints'));
    expect(screen.getByTestId('sketch-panel-constraints').textContent).toContain('约束（3）');
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    expect(screen.getByTestId('sketch-panel-dimensions').textContent).toContain('尺寸（2）');
  });
});

describe('M6-b T5：尺寸内联编辑（updateSketchConstraint 通道）', () => {
  it('点击值 → 输入框（回填现值）→ Enter → applyConstraintValue(constraintId, value)', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    fireEvent.click(screen.getByTestId('sketch-panel-dimension-value-7'));

    const input = screen.getByTestId('sketch-panel-dimension-input') as HTMLInputElement;
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(sketchSystem.applyConstraintValue).toHaveBeenCalledWith(7, 12);
    });
  });

  it('blur 亦提交', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    fireEvent.click(screen.getByTestId('sketch-panel-dimension-value-8'));
    const input = screen.getByTestId('sketch-panel-dimension-input');
    fireEvent.change(input, { target: { value: '3.5' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(sketchSystem.applyConstraintValue).toHaveBeenCalledWith(8, 3.5);
    });
  });

  it('editSubmitting 守卫：提交在途时 blur 不重复提交（Enter+blur 只提交一次）', async () => {
    let resolveSubmit!: (r: FeatureOpResult) => void;
    const applyConstraintValue = vi.fn(
      () => new Promise<FeatureOpResult>((resolve) => { resolveSubmit = resolve; }),
    );
    const sketchSystem = makeSketchSystem({ applyConstraintValue });
    renderPanel(sketchSystem);
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    fireEvent.click(screen.getByTestId('sketch-panel-dimension-value-7'));
    const input = screen.getByTestId('sketch-panel-dimension-input');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(applyConstraintValue).toHaveBeenCalledTimes(1));

    // 提交在途（promise 未决）→ blur 触发的第二次提交被守卫吞掉。
    fireEvent.blur(input);
    expect(applyConstraintValue).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit({ ok: true });
    });
    // 成功后退出编辑态（输入框收起，值按钮还原）。
    await waitFor(() => expect(screen.queryByTestId('sketch-panel-dimension-input')).toBeNull());
  });

  it('非法值（≤0/非数）→ 不提交，错误面可见', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    fireEvent.click(screen.getByTestId('sketch-panel-dimension-value-7'));
    const input = screen.getByTestId('sketch-panel-dimension-input');
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => { /* 微任务排空 */ });
    expect(sketchSystem.applyConstraintValue).not.toHaveBeenCalled();
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    await act(async () => { /* 微任务排空 */ });
    expect(sketchSystem.applyConstraintValue).not.toHaveBeenCalled();
    expect(mocks.outputMessage).toHaveBeenCalledTimes(2);
  });

  it('后端拒收（ok:false）→ 拒收文本透出，编辑态保持可改', async () => {
    const sketchSystem = makeSketchSystem({
      applyConstraintValue: vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: 'conflicting dof=3' })),
    });
    renderPanel(sketchSystem);
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    fireEvent.click(screen.getByTestId('sketch-panel-dimension-value-7'));
    const input = screen.getByTestId('sketch-panel-dimension-input');
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalled());
    // 编辑态保持（输入框还在，可改值重试）。
    expect(screen.getByTestId('sketch-panel-dimension-input')).toBeDefined();
  });
});

describe('M6-b T5：dimensionCandidate 值确认桥（尺寸不直接提交铁律的另一半）', () => {
  const candidate: SketchDimensionCandidate = { kind: 'distance', refs: [1, 2], entityIds: [1, 2] };

  it('收候选 → 切尺寸页签 + 表单待值（工具侧零提交）', () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', candidate);
    });
    // 候选把面板带到尺寸页签，确认表单在场。
    expect(screen.getByTestId('sketch-panel-candidate-form')).toBeDefined();
    expect(screen.getByTestId('sketch-panel-dimensions')).toBeDefined();
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
  });

  it('收值确认 → 构造完整约束（id=maxId+1）追加 applyUpdate → 表单收起', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', candidate);
    });
    const input = screen.getByTestId('sketch-panel-candidate-input');
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('sketch-panel-candidate-confirm'));

    await waitFor(() => expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1));
    const [entities, constraints] = vi.mocked(sketchSystem.applyUpdate).mock.calls[0]!;
    expect(entities).toEqual(makeSketch().entities); // 实体原样在前
    expect(constraints).toEqual([
      ...makeSketch().constraints,
      { kind: 'distance', id: 9, refs: [1, 2], value: 8 }, // 全局 maxId=8 → 9
    ]);
    await waitFor(() => expect(screen.queryByTestId('sketch-panel-candidate-form')).toBeNull());
  });

  it('radius 候选同通道', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', { kind: 'radius', refs: [5], entityIds: [5] });
    });
    fireEvent.change(screen.getByTestId('sketch-panel-candidate-input'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('sketch-panel-candidate-confirm'));
    await waitFor(() => expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1));
    const [, constraints] = vi.mocked(sketchSystem.applyUpdate).mock.calls[0]!;
    expect(constraints![constraints!.length - 1]).toEqual({ kind: 'radius', id: 9, refs: [5], value: 2.5 });
  });

  it('非法值不提交；取消=丢弃候选；后端拒收表单保持', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', candidate);
    });
    // 非法值
    fireEvent.change(screen.getByTestId('sketch-panel-candidate-input'), { target: { value: '-2' } });
    fireEvent.click(screen.getByTestId('sketch-panel-candidate-confirm'));
    await act(async () => { /* 微任务排空 */ });
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);

    // 取消
    fireEvent.click(screen.getByTestId('sketch-panel-candidate-cancel'));
    expect(screen.queryByTestId('sketch-panel-candidate-form')).toBeNull();
    expect(sketchSystem.applyUpdate).not.toHaveBeenCalled();

    // 拒收：表单保持可改值再提交
    const rejecting = makeSketchSystem({
      applyUpdate: vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: 'dof mismatch' })),
    });
    cleanup();
    renderPanel(rejecting);
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', candidate);
    });
    fireEvent.change(screen.getByTestId('sketch-panel-candidate-input'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('sketch-panel-candidate-confirm'));
    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalled());
    expect(screen.getByTestId('sketch-panel-candidate-form')).toBeDefined();
  });

  it('草图切换（activeSketchId 变）→ pending 候选清空（旧 refs 不挂新草图）', () => {
    renderPanel(makeSketchSystem());
    act(() => {
      sketchToolEvents.emit('dimensionCandidate', candidate);
    });
    expect(screen.getByTestId('sketch-panel-candidate-form')).toBeDefined();
    act(() => {
      usePartStudioStore.setState({
        sketch: { isActive: true, activeSketchId: 'sk-2', activeSketchPlane: null },
      });
    });
    expect(screen.queryByTestId('sketch-panel-candidate-form')).toBeNull();
  });
});

describe('M6-b T5：级联删除', () => {
  it('纯函数：删点 → 拥有线级联 → 线另一端点传递死 → refs 命中约束级联（焊点另一侧存活）', () => {
    const next = computeCascadeDelete(
      makeSketch().entities,
      makeSketch().constraints,
      1,
    );
    // 存活：圆心#4 + 圆#5。
    expect(next.entities.map((e) => e.id).sort((a, b) => a - b)).toEqual([4, 5]);
    // 存活约束：半径#8（refs [5] 不命中）；水平#6（refs[3] 死）与距离#7（refs [1,2] 死）删除。
    expect(next.constraints.map((c) => c.id)).toEqual([8]);
  });

  it('纯函数：删圆 → 圆心级联死；无约束引用时仅几何级联', () => {
    const next = computeCascadeDelete(makeSketch().entities, makeSketch().constraints, 5);
    expect(next.entities.map((e) => e.id).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(next.constraints.map((c) => c.id)).toEqual([6, 7]);
  });

  it('纯函数：环引用（自引用）收敛不死循环（删线带走其引用到的点）', () => {
    const cyclic: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'line', id: 2, p1: 2, p2: 1 }, // p1 自引用（契约外脏数据防御）
    ];
    const next = computeCascadeDelete(cyclic, [], 2);
    // 线#2 删除 → 拥有端点 p1(#2 自引用)/p2(#1) 级联死 → 全部移除。
    expect(next.entities).toEqual([]);
  });

  it('UI：删实体钮 → applyUpdate 载荷=级联后的整体覆写', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    fireEvent.click(screen.getByTestId('sketch-panel-delete-entity-3'));
    await waitFor(() => expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1));
    const [entities, constraints] = vi.mocked(sketchSystem.applyUpdate).mock.calls[0]!;
    expect(entities.map((e) => e.id).sort((a, b) => a - b)).toEqual([4, 5]);
    expect(constraints.map((c) => c.id)).toEqual([8]);
  });

  it('UI：删约束钮 → applyUpdate 载荷仅滤该约束', async () => {
    const sketchSystem = makeSketchSystem();
    renderPanel(sketchSystem);
    fireEvent.click(screen.getByTestId('sketch-panel-tab-dimensions'));
    fireEvent.click(screen.getByTestId('sketch-panel-delete-constraint-7'));
    await waitFor(() => expect(sketchSystem.applyUpdate).toHaveBeenCalledTimes(1));
    const [entities, constraints] = vi.mocked(sketchSystem.applyUpdate).mock.calls[0]!;
    expect(entities).toEqual(makeSketch().entities);
    expect(constraints.map((c) => c.id)).toEqual([6, 8]);
  });
});

describe('M6-b T5：退出与空态', () => {
  it('退出钮 → startDefaultTool + store.exitSketch（ribbon 还原/覆盖层收）', () => {
    renderPanel(makeSketchSystem());
    fireEvent.click(screen.getByTestId('sketch-panel-exit'));
    expect(mocks.startDefaultTool).toHaveBeenCalledTimes(1);
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
    expect(usePartStudioStore.getState().sketch.activeSketchId).toBeNull();
  });

  it('系统错误（sketchSystem.error）→ alert 面呈现', () => {
    renderPanel(makeSketchSystem({ error: 'connection lost' }));
    expect(screen.getByRole('alert').textContent).toBe('connection lost');
  });

  it('活动草图 id 静态标签（M3-b 切换器的 web 替代形态）', () => {
    renderPanel(makeSketchSystem());
    expect(screen.getByTestId('sketch-panel-sketch-id').textContent).toContain('sk-1');
  });
});
