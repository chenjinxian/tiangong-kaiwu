// src/modules/part-studio/test/PartStudioSidebar.test.tsx
//
// B6 M-A5 Task 2（brief Step 9）：侧栏树变异接线验收层——
//  1) 特征删除：HITL 确认后 applyOp 精确载荷（deleteFeature + 可选
//     targetBodyId——getBodies.sourceFeatureId 反查），成功/失败/异常 toast
//     同 IModelApp.notifications 管道；
//  2) 特征抑制：applyOp setFeatureSuppressed（suppressed 翻转）+ toast；
//  3) canEdit=false：树侧删除/抑制菜单项禁用 + handler 防御性拒收（零 applyOp）；
//     隐藏/显示（会话态）仍可用；
//  4) 零件行守卫：part 行菜单只有隐藏/显示（不进入特征变异路径）。
//
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器，
// notifications 可观测），真实 store/i18n 参与（setup.ts 全局词库 zh-CN 基线）。

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BodyInfo, FeatureOp, FeatureOpResult, FeatureTreeEntry } from '@luban-cad/shared';

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
  });
}

function renderSidebar(opts?: {
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  canEdit?: boolean;
}): void {
  render(
    <PartStudioSidebar
      entries={ENTRIES}
      bodies={BODIES}
      applyOp={opts?.applyOp}
      canEdit={opts?.canEdit ?? true}
    />,
  );
}

/** 树上删除 HITL 链：右键行 → 删除菜单项 → 确认。 */
async function confirmTreeDelete(
  user: ReturnType<typeof userEvent.setup>,
  rowTestId: string,
  dialogName: string,
): Promise<void> {
  fireEvent.contextMenu(screen.getByTestId(rowTestId));
  await user.click(screen.getByRole('menuitem', { name: '删除' }));
  const dialog = screen.getByRole('dialog', { name: dialogName });
  await user.click(within(dialog).getByRole('button', { name: '删除' }));
}

function lastToast(): { priority: number; briefMessage: string } {
  return mocks.outputMessage.mock.calls.at(-1)?.[0] as { priority: number; briefMessage: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe('B6 M-A5 T2：树变异 applyOp 接线（Sidebar handlers）', () => {
  it('特征删除：HITL 确认 → applyOp deleteFeature（含 targetBodyId 源映射）+ Success toast', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderSidebar({ applyOp });
    await confirmTreeDelete(user, 'tree-row-ex1', '删除 拉伸 1');
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

  it('特征删除：无源映射 → 载荷省略 targetBodyId（不猜测；N≤1 legacy 语义）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderSidebar({ applyOp });
    await confirmTreeDelete(user, 'tree-row-ch1', '删除 倒角 1');
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
    await confirmTreeDelete(user, 'tree-row-ex1', '删除 拉伸 1');
    await waitFor(() => expect(lastToast().priority).toBe(10));
    expect(lastToast().briefMessage).toContain('feature locked');
    await confirmTreeDelete(user, 'tree-row-ex2', '删除 拉伸 2');
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

  it('零件行守卫：part 行右键只有 隐藏实体（无 删除/抑制/重命名/编辑）', () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByTestId('tree-row-0x15'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(within(menu).getByRole('menuitem', { name: '隐藏实体' })).toBeDefined();
    for (const name of ['删除', '抑制', '重命名', '编辑…']) {
      expect(within(menu).queryByRole('menuitem', { name })).toBeNull();
    }
  });
});
