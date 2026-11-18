// src/modules/part-studio/test/PartStudioSidebar.test.tsx
//
// B6 M-A5 Task 2（brief Step 9）：侧栏树变异接线验收层——
//  1) 特征删除：直接删除（Onshape live）后 applyOp 精确载荷（deleteFeature + 可选
//     targetBodyId——getBodies.sourceFeatureId 反查），成功/失败/异常 toast
//     同 IModelApp.notifications 管道；
//  2) 特征抑制：applyOp setFeatureSuppressed（suppressed 翻转）+ toast；
//  3) canEdit=false：树侧删除/抑制菜单项禁用 + handler 防御性拒收（零 applyOp）；
//     隐藏/显示（会话态）仍可用；
//  4) 零件行守卫：part 行菜单只有隐藏/显示（不进入特征变异路径）。
//
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器，
// notifications 可观测），真实 store/i18n 参与（setup.ts 全局词库 zh-CN 基线）。

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BodyInfo,
  FeatureOp,
  FeatureOpResult,
  FeatureTreeEntry,
  RenameResult,
  SketchConstraintDto,
  SketchEntityDto,
  VariableDto,
} from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  outputMessage: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  // barrel 链（FeatureTree → Ribbon）模块加载期的基类桩。
  Tool: class {},
  NotificationManager: class { public outputMessage(): void { /* 哑通道桩 */ } },
  // toast 构造钉形：priority/briefMessage 可观测（Fake FeatureDialog.test 同款）。
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
    viewManager: { selectedView: undefined },
  },
  EmphasizeElements: {
    get: () => ({ clearEmphasizedElements: vi.fn(), clearOverriddenElements: vi.fn() }),
    getOrCreate: () => ({
      emphasizeElements: vi.fn(),
      clearEmphasizedElements: vi.fn(),
      hideElements: vi.fn(),
      clearHiddenElements: vi.fn(),
      overrideElements: vi.fn(),
      clearOverriddenElements: vi.fn(),
    }),
  },
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioSidebar } from '../components/PartStudioSidebar.js';
import {
  clearSketchClipboard,
  copySketchById,
  hasSketchClipboard,
  pasteSketchClipboard,
} from '../internal/sketch-clipboard.js';

/** 特征段条目（与 FeatureTree.test 同形；拉伸 1/拉伸 2/倒角 1/拉伸 3）。 */
const ENTRIES: FeatureTreeEntry[] = [
  { id: 'ex1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
  { id: 'ex2', featureType: 'extrude', orderKey: 2, suppressed: false, status: 0, params: {} },
  { id: 'ch1', featureType: 'chamfer', orderKey: 3, suppressed: false, status: 1, params: {} },
  { id: 'ex3', featureType: 'extrude', orderKey: 4, suppressed: true, status: 0, params: {} },
];

/** body 读面替身：ex1→0x15 唯一源；ex2→0x20；ch1 无源（undefined target）。 */
const BODIES: BodyInfo[] = [
  { bodyKey: '0x15', name: 'Base', active: true, authored: true, sourceFeatureId: 'ex1' },
  { bodyKey: '0x20', active: true, authored: true, sourceFeatureId: 'ex2' },
];

function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null },
    dialog: { active: null },
    variablesWrite: { inFlight: false },
  });
}

function renderSidebar(opts?: {
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  canEdit?: boolean;
  entries?: FeatureTreeEntry[];
  renameFeature?: (featureId: string, name: string) => Promise<RenameResult>;
  renameBody?: (bodyId: string, name: string) => Promise<RenameResult>;
}): void {
  render(
    <PartStudioSidebar
      entries={opts?.entries ?? ENTRIES}
      bodies={BODIES}
      applyOp={opts?.applyOp}
      canEdit={opts?.canEdit ?? true}
      renameFeature={opts?.renameFeature}
      renameBody={opts?.renameBody}
    />,
  );
}

/** 树上删除（Onshape live 2026-11-13：直接删除，无确认框）：右键行 → 删除菜单项。 */
async function deleteViaTree(
  user: ReturnType<typeof userEvent.setup>,
  rowTestId: string,
): Promise<void> {
  fireEvent.contextMenu(screen.getByTestId(rowTestId));
  await user.click(screen.getByRole('menuitem', { name: '删除' }));
  expect(screen.queryByRole('dialog')).toBeNull();
}

function lastToast(): { priority: number; briefMessage: string } {
  return mocks.outputMessage.mock.calls.at(-1)?.[0] as { priority: number; briefMessage: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  clearSketchClipboard();
});

describe('B6 M-A5 T2：树变异 applyOp 接线（Sidebar handlers）', () => {
  it('特征删除：直接删除 → applyOp deleteFeature（含 targetBodyId 源映射）+ Success toast', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderSidebar({ applyOp });
    await deleteViaTree(user, 'tree-row-ex1');
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'deleteFeature',
        featureId: 'ex1',
        targetBodyId: '0x15',
      }),
    );
    await waitFor(() =>
      expect(mocks.outputMessage).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 1, briefMessage: '已删除 拉伸 1' }),
      ),
    );
  });

  it('草图删除：直接删除 → applyOp deleteSketch（sketchId=行 id，不带 targetBodyId）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderSidebar({
      applyOp,
      entries: [{ id: 'sk1', featureType: 'sketch', orderKey: 1, suppressed: false, status: 0, params: {} }],
    });
    await deleteViaTree(user, 'tree-row-sk1');
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({ kind: 'deleteSketch', sketchId: 'sk1' });
    expect(lastToast()).toMatchObject({ priority: 1, briefMessage: '已删除 草图 1' });
  });

  it('草图删除被特征引用 → 后端拒收文案进 Error toast（不静默）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({
      ok: false,
      error: '草图被特征引用，不可删除（引用方: 0x5）',
    }));
    renderSidebar({
      applyOp,
      entries: [{ id: 'sk1', featureType: 'sketch', orderKey: 1, suppressed: false, status: 0, params: {} }],
    });
    await deleteViaTree(user, 'tree-row-sk1');
    expect(lastToast()).toMatchObject({ priority: 10 });
    expect(lastToast().briefMessage).toContain('草图被特征引用');
  });

  it('特征删除：无源映射 → 载荷省略 targetBodyId（不猜测；N≤1 legacy 语义）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderSidebar({ applyOp });
    await deleteViaTree(user, 'tree-row-ch1');
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({ kind: 'deleteFeature', featureId: 'ch1' }),
    );
    // 精确否定：无 targetBodyId 键（toHaveBeenCalledWith 深等已覆盖，另加显式守门）。
    const op = applyOp.mock.calls[0]?.[0] as { targetBodyId?: string };
    expect('targetBodyId' in op).toBe(false);
  });

  it('特征删除：ok:false → Error toast 含 result.error；异常 → Error toast 含异常消息', async () => {
    const user = userEvent.setup();
    const applyOp = vi
      .fn<(op: FeatureOp) => Promise<FeatureOpResult>>()
      .mockResolvedValueOnce({ ok: false, error: 'feature locked' })
      .mockRejectedValueOnce(new Error('rpc boom'));
    renderSidebar({ applyOp });
    await deleteViaTree(user, 'tree-row-ex1');
    await waitFor(() => expect(lastToast().priority).toBe(10));
    expect(lastToast().briefMessage).toContain('feature locked');
    await deleteViaTree(user, 'tree-row-ex2');
    await waitFor(() => expect(lastToast().briefMessage).toContain('rpc boom'));
    expect(lastToast().priority).toBe(10);
  });

  it('特征抑制：applyOp setFeatureSuppressed（翻转值）+ Success toast；已抑制行 → 取消抑制', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderSidebar({ applyOp });
    fireEvent.contextMenu(screen.getByTestId('tree-row-ex2'));
    await user.click(screen.getByRole('menuitem', { name: '抑制' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({ kind: 'setFeatureSuppressed', featureId: 'ex2', suppressed: true }),
    );
    await waitFor(() =>
      expect(mocks.outputMessage).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 1, briefMessage: '已更新 拉伸 2 的抑制状态' }),
      ),
    );
    // 已抑制行（ex3）：取消抑制 → suppressed:false。
    fireEvent.contextMenu(screen.getByTestId('tree-row-ex3'));
    await user.click(screen.getByRole('menuitem', { name: '取消抑制' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenLastCalledWith({
        kind: 'setFeatureSuppressed',
        featureId: 'ex3',
        suppressed: false,
      }),
    );
  });

  it('canEdit=false：删除/抑制菜单项禁用（title 提示）→ 零 applyOp；隐藏/显示仍可用', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderSidebar({ applyOp, canEdit: false });
    fireEvent.contextMenu(screen.getByTestId('tree-row-ex1'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    const del = within(menu).getByRole('menuitem', { name: '删除' }) as HTMLButtonElement;
    const suppress = within(menu).getByRole('menuitem', { name: '抑制' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(suppress.disabled).toBe(true);
    expect(del.getAttribute('title')).toBe('当前为只读权限，无法执行此操作');
    await user.click(del);
    await user.click(suppress);
    expect(applyOp).not.toHaveBeenCalled();
    expect(mocks.outputMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    // 隐藏/显示（零件段 eye）不受写门限制。
    await user.click(screen.getByTestId('tree-row-visibility-0x15'));
    expect(usePartStudioStore.getState().canvas.hiddenIds).toContain('0x15');
  });

  it('零件行守卫：part 行不进入特征变异路径（隐藏/重命名可用；删除… 禁用）', () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByTestId('tree-row-0x15'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    expect(within(menu).getByRole('menuitem', { name: '隐藏实体' })).toHaveProperty('disabled', false);
    // Onshape live（2026-11-12）零件行菜单；v1.70 重命名走 renameBody RPC（非特征 op）。
    expect(within(menu).getByRole('menuitem', { name: '删除…' })).toHaveProperty('disabled', true);
    expect(within(menu).getByRole('menuitem', { name: '重命名' })).toHaveProperty('disabled', false);
    for (const name of ['删除', '抑制', '编辑…']) {
      expect(within(menu).queryByRole('menuitem', { name })).toBeNull();
    }
  });

  it('只读：零件行重命名禁用并给只读提示', () => {
    renderSidebar({ canEdit: false });
    fireEvent.contextMenu(screen.getByTestId('tree-row-0x15'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    const rename = within(menu).getByRole('menuitem', { name: '重命名' }) as HTMLButtonElement;
    expect(rename.disabled).toBe(true);
    expect(rename.getAttribute('title')).toBe('当前为只读权限，无法执行此操作');
  });
});

describe('v1.70 树内联重命名（Sidebar 接线）', () => {
  it('特征重命名：renameFeature(featureId,name) + Success toast', async () => {
    const user = userEvent.setup();
    const renameFeature = vi.fn(async (_id: string, name: string): Promise<RenameResult> => ({ ok: true, name }));
    renderSidebar({ renameFeature });
    fireEvent.contextMenu(screen.getByTestId('tree-row-ex2'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    const input = screen.getByRole('textbox', { name: '重命名' });
    await user.clear(input);
    await user.type(input, 'Housing{Enter}');
    await waitFor(() => expect(renameFeature).toHaveBeenCalledWith('ex2', 'Housing'));
    await waitFor(() => expect(lastToast()).toMatchObject({ priority: 1, briefMessage: '已重命名为 Housing' }));
  });

  it('零件删除：HITL → applyOp deleteFeature（source feature + targetBodyId）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    const entries: FeatureTreeEntry[] = [
      { id: 'ex1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: { operation: 'new' } },
    ];
    renderSidebar({ applyOp, entries });
    fireEvent.contextMenu(screen.getByTestId('tree-row-0x15'));
    const del = screen.getByTestId('tree-menu-delete-part') as HTMLButtonElement;
    expect(del.disabled).toBe(false);
    await user.click(del);
    await user.click(screen.getByTestId('part-delete-confirm'));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'deleteFeature',
        featureId: 'ex1',
        targetBodyId: '0x15',
      }),
    );
    await waitFor(() => expect(lastToast()).toMatchObject({ priority: 1, briefMessage: '已删除零件 Base' }));
  });

  it('零件重命名：renameBody(bodyKey,name) + 失败 Error toast（不静默）', async () => {
    const user = userEvent.setup();
    const renameBody = vi
      .fn<(bodyId: string, name: string) => Promise<RenameResult>>()
      .mockResolvedValueOnce({ ok: true, name: 'Housing A' })
      .mockResolvedValueOnce({ ok: false, error: '零件不存在或不属于当前 Part Studio: 0x15' });
    renderSidebar({ renameBody });
    fireEvent.contextMenu(screen.getByTestId('tree-row-0x15'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    let input = screen.getByRole('textbox', { name: '重命名' });
    expect((input as HTMLInputElement).value).toBe('Base');
    await user.clear(input);
    await user.type(input, 'Housing A{Enter}');
    await waitFor(() => expect(renameBody).toHaveBeenCalledWith('0x15', 'Housing A'));
    await waitFor(() => expect(lastToast()).toMatchObject({ priority: 1, briefMessage: '已重命名为 Housing A' }));

    fireEvent.contextMenu(screen.getByTestId('tree-row-0x15'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    input = screen.getByRole('textbox', { name: '重命名' });
    await user.clear(input);
    await user.type(input, 'Nope{Enter}');
    await waitFor(() => expect(lastToast().priority).toBe(10));
    expect(lastToast().briefMessage).toContain('零件不存在');
  });
});

// ── ADR-0020 S3b：变量删除（updateVariables 整表覆写）──────────────────────
describe('ADR-0020 S3b：树内变量删除接线', () => {
  const VARIABLES: VariableDto[] = [
    { id: 'v1', name: 'width', expression: '10', type: 'length' },
    { id: 'v2', name: 'height', expression: '#width*2', type: 'length' },
  ];

  it('删除变量 → applyOp updateVariables（移除该 id，其余保序）+ Success toast', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp) => ({ ok: true }));
    render(
      <PartStudioSidebar
        entries={ENTRIES}
        variables={VARIABLES}
        onEditVariable={vi.fn()}
        applyOp={applyOp as never}
      />,
    );
    expect(screen.getByTestId('tree-variable-v1').textContent).toContain('#width = 10 mm');
    fireEvent.contextMenu(screen.getByTestId('tree-variable-v1'));
    await user.click(screen.getByRole('menuitem', { name: '删除变量' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateVariables',
      variables: [VARIABLES[1]],
    });
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
  });

  it('后端拒收（变量被引用）→ Error toast 含原因；不发第二 op', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp) => ({ ok: false, error: '变量被草图引用' }));
    render(
      <PartStudioSidebar
        entries={ENTRIES}
        variables={VARIABLES}
        applyOp={applyOp as never}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId('tree-variable-v2'));
    await user.click(screen.getByRole('menuitem', { name: '删除变量' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    const toast = mocks.outputMessage.mock.calls[0]![0] as { briefMessage: string; priority: number };
    expect(toast.briefMessage).toContain('变量被草图引用');
    expect(toast.priority).toBe(10);
  });
});

// ── S3b re-review P2-2 / P3-3：共享写门 + 删除等待刷新 ──────────────────────
describe('ADR-0020 S3b re-review：变量删除共享写门', () => {
  const VARIABLES: VariableDto[] = [
    { id: 'v1', name: 'width', expression: '10', type: 'length' },
    { id: 'v2', name: 'height', expression: '#width*2', type: 'length' },
  ];

  function priorityOf(call: unknown): number {
    return (call as { priority: number }).priority;
  }

  it('P2-2：共享写门被对话框提交占用时，树删除不发 op 且给 busy 提示', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp) => ({ ok: true }));
    act(() => { usePartStudioStore.getState().beginVariablesWrite(); });
    try {
      render(
        <PartStudioSidebar entries={ENTRIES} variables={VARIABLES} applyOp={applyOp as never} />,
      );
      fireEvent.contextMenu(screen.getByTestId('tree-variable-v1'));
      await user.click(screen.getByRole('menuitem', { name: '删除变量' }));
      expect(applyOp).not.toHaveBeenCalled();
      expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
      // Warning（11）而非成功/错误：明确是「另一写操作在进行」。
      expect(priorityOf(mocks.outputMessage.mock.calls[0]![0])).toBe(11);
    } finally {
      act(() => usePartStudioStore.getState().endVariablesWrite());
    }
  });

  it('P2-1：未连接/PS 未就绪（scopeActive=false）→ 删除不发 op 且给未就绪原因', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp) => ({ ok: true }));
    render(
      <PartStudioSidebar
        entries={ENTRIES}
        variables={VARIABLES}
        variablesReady={false}
        variablesScopeActive={false}
        applyOp={applyOp as never}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId('tree-variable-v1'));
    await user.click(screen.getByRole('menuitem', { name: '删除变量' }));
    expect(applyOp).not.toHaveBeenCalled();
    const toast = mocks.outputMessage.mock.calls[0]![0] as { briefMessage: string };
    expect(toast.briefMessage).toContain('尚未就绪');
  });

  it('P3-3：删除 await refresh 后才成功 toast；期间第二次删除不发 op', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp) => ({ ok: true }));
    let resolveRefresh!: () => void;
    const refreshPromise = new Promise<void>((resolve) => { resolveRefresh = resolve; });
    const onRefreshVariables = vi.fn(() => refreshPromise);
    render(
      <PartStudioSidebar
        entries={ENTRIES}
        variables={VARIABLES}
        applyOp={applyOp as never}
        onRefreshVariables={onRefreshVariables}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId('tree-variable-v1'));
    await user.click(screen.getByRole('menuitem', { name: '删除变量' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onRefreshVariables).toHaveBeenCalledTimes(1));
    // refresh 未落位：不得出现成功 toast（Success=1）。
    expect(mocks.outputMessage.mock.calls.filter(([details]) => priorityOf(details) === 1)).toHaveLength(0);

    // 共享门仍持有 → 第二次删除只给 busy 提示，不发第二 op。
    fireEvent.contextMenu(screen.getByTestId('tree-variable-v2'));
    await user.click(screen.getByRole('menuitem', { name: '删除变量' }));
    expect(applyOp).toHaveBeenCalledTimes(1);

    await act(async () => { resolveRefresh(); await refreshPromise; });
    await waitFor(() => expect(
      mocks.outputMessage.mock.calls.filter(([details]) => priorityOf(details) === 1),
    ).toHaveLength(1));

    // 门已清：再次删除可以正常发 op。
    fireEvent.contextMenu(screen.getByTestId('tree-variable-v2'));
    await user.click(screen.getByRole('menuitem', { name: '删除变量' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(2));
  });
});

// ── W41 S10（Onshape live 2026-11-18）：树草图行「复制草图」────────────────
// 宿主从树条目落库 params（entities+constraints，与草图显示/编辑同源）构造
// 「全部曲线」选择 → 会话剪贴板；草图内「粘贴草图图元」消费同一剪贴板。
describe('W41 S10：树草图行复制草图（会话剪贴板）', () => {
  const RECT_ENTITIES: SketchEntityDto[] = [
    { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
    { kind: 'line', id: 12, p1: { x: 10, y: 0 }, p2: { x: 10, y: 10 } },
    { kind: 'line', id: 13, p1: { x: 10, y: 10 }, p2: { x: 0, y: 10 } },
    { kind: 'line', id: 14, p1: { x: 0, y: 10 }, p2: { x: 0, y: 0 } },
  ];
  const RECT_CONSTRAINTS: SketchConstraintDto[] = [
    { kind: 'horizontal', id: 25, refs: [11] },
    { kind: 'vertical', id: 27, refs: [12] },
  ];
  const sketchEntry = (id: string, params: unknown): FeatureTreeEntry => ({
    id, featureType: 'sketch', orderKey: 1, suppressed: false, status: 0, params,
  });

  async function copyViaTree(
    user: ReturnType<typeof userEvent.setup>,
    rowTestId: string,
  ): Promise<void> {
    fireEvent.contextMenu(screen.getByTestId(rowTestId));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    await user.click(within(menu).getByTestId('tree-menu-copy-sketch'));
  }

  it('点击复制草图 → 全部曲线+内部约束入剪贴板（跨草图粘贴可得 4 线/2 约束）', async () => {
    const user = userEvent.setup();
    renderSidebar({
      entries: [sketchEntry('sk1', { entities: RECT_ENTITIES, constraints: RECT_CONSTRAINTS })],
    });
    await copyViaTree(user, 'tree-row-sk1');
    expect(hasSketchClipboard()).toBe(true);
    // 无成功 toast（live 未证提示形态：复制静默、粘贴入口变可用）。
    expect(mocks.outputMessage).not.toHaveBeenCalled();

    const pasted = pasteSketchClipboard([], []);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    expect(pasted.entities).toHaveLength(4);
    expect(pasted.constraints).toHaveLength(2);
  });

  it('空草图：复制 0 项不报错、不覆盖既有剪贴板', async () => {
    const user = userEvent.setup();
    copySketchById('source', RECT_ENTITIES, RECT_CONSTRAINTS);
    renderSidebar({ entries: [sketchEntry('empty', { entities: [], constraints: [] })] });
    await copyViaTree(user, 'tree-row-empty');
    expect(mocks.outputMessage).not.toHaveBeenCalled();
    expect(hasSketchClipboard()).toBe(true);
    const pasted = pasteSketchClipboard([], []);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    expect(pasted.entities).toHaveLength(4);
  });

  it('params 不可读（无 entities/constraints）→ 可见 Error toast，剪贴板不变', async () => {
    const user = userEvent.setup();
    renderSidebar({ entries: [sketchEntry('broken', {})] });
    await copyViaTree(user, 'tree-row-broken');
    expect(hasSketchClipboard()).toBe(false);
    const toast = lastToast();
    expect(toast.priority).toBe(10);
    expect(toast.briefMessage).toContain('复制草图失败');
  });
});
