// src/modules/part-studio/test/PartStudioCanvas.test.tsx
//
// M4 Task 6（brief Step 1）：画布宿主的对话框寻址渲染——
//  1) T6-① key 必办：FeatureDialog 挂
//     `key={dialog.mode==='edit' ? dialog.featureId : 'new-'+dialog.featureType}`
//     ——不同 featureId 切换时重挂（本地态不跨特征残留；M3-T6 台账①根治）；
//  2) new/extrude 提交链：对话框确认 → 宿主下传的 applyOp（Session
//     useFeatureSystem 直通）被调；✗ 取消 → closeDialog；
//  3) sketch 寻址：SketchDialog 照旧按 dialog.active==='sketch' 渲染。
//
// 定位：宿主接线验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// 真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { RefObject } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  outputMessage: vi.fn(),
  viewport: null as unknown,
}));

vi.mock('@itwin/core-frontend', () => ({
  Tool: class {},
  // M4-T6：成功 toast 构造 NotifyMessageDetails——钉形替身。
  NotifyMessageDetails: class {
    priority: number;
    briefMessage: string;
    constructor(priority: number, briefMessage: string) {
      this.priority = priority;
      this.briefMessage = briefMessage;
    }
  },
  OutputMessagePriority: { None: 0, Success: 1, Error: 10, Warning: 11, Info: 12 },
  IModelApp: {
    tools: { run: vi.fn() },
    notifications: { outputMessage: mocks.outputMessage },
    viewManager: {
      get selectedView() {
        return mocks.viewport;
      },
    },
  },
  EmphasizeElements: {
    get: () => ({ clearEmphasizedElements: vi.fn() }),
    getOrCreate: () => ({
      emphasizeElements: vi.fn(),
      clearEmphasizedElements: vi.fn(),
      hideElements: vi.fn(),
    }),
  },
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioCanvas } from '../components/PartStudioCanvas.js';

function renderCanvas(applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>): void {
  render(
    <PartStudioCanvas
      viewportRef={{ current: null } as RefObject<HTMLDivElement>}
      applyOp={applyOp}
    />,
  );
}

function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    sketch: { isActive: false, activeSketchId: null },
    dialog: { active: null },
    viewOnly: { isActive: false },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewport = null;
  resetStore();
});

describe('FeatureDialog 宿主寻址（T6-① key 必办 + 提交链）', () => {
  it('edit 模式切换 featureId → key 变更重挂，本地态不跨特征残留', async () => {
    const user = userEvent.setup();
    renderCanvas();
    actOpenEdit('ex1', '拉伸 1');
    expect(screen.getByRole('dialog', { name: '拉伸 1' })).toBeDefined();
    // 写入本地态：展开拔模段并键入（重挂后必须消失）。
    await user.click(withinDialog().getByRole('button', { name: '拔模' }));
    await user.type(withinDialog().getByRole('textbox', { name: '拔模' }), '5');
    expect((withinDialog().getByRole('textbox', { name: '拔模' }) as HTMLInputElement).value).toBe('5');

    // 切换到另一特征（key: ex1 → ex2）→ 重挂，拔模回缺省（折叠+空）。
    actOpenEdit('ex2', '拉伸 2');
    expect(screen.getByRole('dialog', { name: '拉伸 2' })).toBeDefined();
    expect(withinDialog().queryByRole('textbox', { name: '拔模' })).toBeNull();
    expect(withinDialog().getByRole('button', { name: '拔模' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('new 模式与 edit 模式 key 不同族（new-extrude），互不串挂', async () => {
    renderCanvas();
    actOpenEdit('ex1', '拉伸 1');
    expect(screen.getByRole('dialog', { name: '拉伸 1' })).toBeDefined();
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    // new 模式标题=类型标签（词库），非上一特征的名称残留。
    expect(screen.getByRole('dialog', { name: '拉伸' })).toBeDefined();
    expect(screen.queryByRole('dialog', { name: '拉伸 1' })).toBeNull();
  });

  it('new 模式提交 → applyOp 直通（insertFeature/extrude）+ closeDialog', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' }));
    renderCanvas(applyOp);
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    await user.click(withinDialog().getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 10 },
      }),
    );
    // 成功 → 宿主收合（closeDialog）。
    await waitFor(() => expect(usePartStudioStore.getState().dialog.active).toBeNull());
  });

  it('✗ 取消 → closeDialog（对话框不自销，受控口径）', async () => {
    const user = userEvent.setup();
    renderCanvas();
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    await user.click(withinDialog().getByRole('button', { name: '取消' }));
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
  });

  it('sketch 寻址：SketchDialog 照旧渲染（dialog.active=sketch）', async () => {
    const user = userEvent.setup();
    renderCanvas();
    act(() => {
      usePartStudioStore.getState().openSketchDialog('sk-1');
    });
    expect(screen.getByTestId('part-studio-sketch-dialog')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
  });

  it('viewOnly 置位 → 打开中的写面对话框整体收口（I-1 宿主职责），回切编辑不复活；仅查看态下打开亦即收', async () => {
    renderCanvas();
    actOpenEdit('ex1', '拉伸 1');
    expect(screen.getByTestId('part-studio-feature-dialog')).toBeDefined();
    act(() => {
      usePartStudioStore.getState().setViewOnly(true);
    });
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
    // 仅查看态下被打开的对话框：打开即收（dialog.active 入依赖）。
    actOpenEdit('ex2', '拉伸 2');
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
    // 写面收口是终态：viewOnly 回切编辑不复活旧对话框。
    act(() => {
      usePartStudioStore.getState().setViewOnly(false);
    });
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
  });
});

/** 在画布容器内查询（对话框渲染于 part-studio-canvas 内）。 */
function withinDialog(): ReturnType<typeof within> {
  return within(screen.getByTestId('part-studio-canvas'));
}

function actOpenEdit(featureId: string, featureName: string): void {
  act(() => {
    usePartStudioStore.getState().openFeatureDialog({
      mode: 'edit',
      featureId,
      featureName,
      featureType: 'extrude',
    });
  });
}
