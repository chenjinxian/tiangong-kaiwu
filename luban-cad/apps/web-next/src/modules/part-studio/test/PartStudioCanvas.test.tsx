// src/modules/part-studio/test/PartStudioCanvas.test.tsx
//
// M4 Task 6（brief Step 1）：画布宿主的对话框寻址渲染——
//  1) T6-① key 必办：FeatureDialog 挂
//     `key={dialog.mode==='edit' ? dialog.featureId : 'new-'+dialog.featureType}`
//     ——不同 featureId 切换时重挂（本地态不跨特征残留；M3-T6 台账①根治）；
//  2) new/extrude 提交链：对话框确认 → 宿主下传的 applyOp（Session
//     useFeatureSystem 直通）被调；✗ 取消 → closeDialog；M6-a T6 起载荷走
//     草图通道（sketches/connectionKey 透传 → {sketchId, regionIndex,
//     profile:[]}，getSketch 面域读面替身）；
//  3) sketch 寻址：SketchDialog 照旧按 dialog.active==='sketch' 渲染；
//     M6-a T4 起 sketch 提交链同款接线（✓ → applyOp 收 insertSketch →
//     真 sketchId 入 store → closeDialog；canEdit=false → ✓ 禁用）。
//
// 定位：宿主接线验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// 真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { RefObject } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';

// M6-a T6：面域读面 RPC 替身（FeatureDialog 拉伸草图通道 getSketch 直调）。
const featureRpc = vi.hoisted(() => ({
  getSketch: vi.fn(),
}));

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

const mocks = vi.hoisted(() => ({
  outputMessage: vi.fn(),
  viewport: null as unknown,
}));

vi.mock('@itwin/core-frontend', () => ({
  Tool: class {},
  // I-2 notifications 呈现桥（PartStudioPage → ViewerNotifications）：
  // ToasterNotificationManager extends NotificationManager——模块加载期即需基类。
  NotificationManager: class { public outputMessage(): void { /* 哑通道桩 */ } },
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

function renderCanvas(
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>,
  opts?: { sketches?: ReadonlyArray<{ id: string; label: string }>; connectionKey?: string },
): void {
  render(
    <PartStudioCanvas
      viewportRef={{ current: null } as RefObject<HTMLDivElement>}
      applyOp={applyOp}
      sketches={opts?.sketches}
      connection={
        opts?.connectionKey ? ({ key: opts.connectionKey } as unknown as BriefcaseConnection) : undefined
      }
    />,
  );
}

function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null },
    dialog: { active: null },
    viewOnly: { isActive: false },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  featureRpc.getSketch.mockReset();
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

  it('new 模式提交 → applyOp 直通（insertFeature/extrude 草图通道——M6-a T6 sketches/connectionKey 透传生效）+ closeDialog', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' }));
    // 宿主下传 sketches + connection.key → 对话框选中草图经 getSketch 拿面域 →
    // 载荷 {sketchId, regionIndex, profile:[]}（M6-a T6 草图通道）。
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    renderCanvas(applyOp, { sketches: [{ id: 'sk-1', label: '草图 1' }], connectionKey: 'canvas-key' });
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    await user.selectOptions(withinDialog().getByRole('combobox', { name: '草图' }), 'sk-1');
    await withinDialog().findByText('草图 1 的面'); // 面域读取落定（通道就绪）
    await user.click(withinDialog().getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 10, sketchId: 'sk-1', regionIndex: 0 },
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

  it('sketch 提交链（M6-a T4）：✓ → applyOp 收 insertSketch（plane 缺省省略）+ 真 sketchId 入 store + closeDialog', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-new-1' }));
    renderCanvas(applyOp);
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({ kind: 'insertSketch', entities: [], constraints: [] }),
    );
    await waitFor(() =>
      expect(usePartStudioStore.getState().sketch).toEqual({ isActive: true, activeSketchId: 'sk-new-1', activeSketchPlane: null }),
    );
    await waitFor(() => expect(usePartStudioStore.getState().dialog.active).toBeNull());
  });

  it('M6-a T5：sketch 确认链平面下发——选「前视」确认 → activeSketchPlane=前视 XZ 面三向量', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-front-1' }));
    renderCanvas(applyOp);
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    // 选基准面「前视」（下拉 value=front——sketchPlaneFromOption 的判别域）。
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '草图平面' }), 'front');
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(usePartStudioStore.getState().sketch).toEqual({
        isActive: true,
        activeSketchId: 'sk-front-1',
        activeSketchPlane: {
          origin: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 1, z: 0 },
          xDir: { x: 1, y: 0, z: 0 },
        },
      }),
    );
    // op 侧 plane 同步下发（T4 口径不变）。
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertSketch',
      entities: [],
      constraints: [],
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        xDir: { x: 1, y: 0, z: 0 },
      },
    });
  });

  it('sketch + canEdit=false（B2 只读写门禁下传）→ SketchDialog ✓ 禁用 + 只读提示，applyOp 未发起', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-1' }));
    render(
      <PartStudioCanvas
        viewportRef={{ current: null } as RefObject<HTMLDivElement>}
        applyOp={applyOp}
        canEdit={false}
      />,
    );
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    expect(within(dialog).getByTestId('part-studio-sketch-dialog-readonly-hint')).toBeDefined();
    const confirm = within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.click(confirm);
    expect(applyOp).not.toHaveBeenCalled();
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

  it('canEdit=false（B2 只读写门禁下传）→ 对话框 ✓ 禁用 + 只读提示（视图语义 viewOnly、写动作语义 canEdit 分线）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' }));
    render(
      <PartStudioCanvas
        viewportRef={{ current: null } as RefObject<HTMLDivElement>}
        applyOp={applyOp}
        canEdit={false}
      />,
    );
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    // 权限只读下对话框不被收口（那是 viewOnly 语义）但提交面诚实关死。
    const dialog = withinDialog().getByTestId('part-studio-feature-dialog');
    expect(within(dialog).getByTestId('part-studio-feature-dialog-readonly-hint')).toBeDefined();
    expect((within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
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
