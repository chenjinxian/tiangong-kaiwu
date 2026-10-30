// src/modules/part-studio/test/PartStudioDock.test.tsx
//
// M4 Task 7（brief Step 1）：版本历史页签真内容（changesets 官方 SDK 数据面）——
//  1) 未点开页签：body 不渲染；工具设置/显示设置仍占位（壳期语义保持）；
//  2) 六态完备：loading 骨架 → 列表（index/描述/日期）；error 就地错误条 +
//     重试（refetch）；empty（无 changeset = 初始版本语义）；
//  3) 当前版本标记：connection.changeset.id 比对（currentChangesetId prop），
//     命中行 Badge「当前版本」，其余行无；
//  4) 「保存」钮（本地兜底 saveChanges）：hasUnsavedChanges 驱动解锁 + 未推送
//     徽标，isSaving 驱动加载禁用，点击调 onSave；
//  5) 「推送」钮：hasUnsavedChanges 门控，点击调 onPush（宿主开推送对话框）。
//
// 定位：组件行为验收层；ImodelsClient 模块级 mock（零真实请求），真实 store/
// i18n 参与（setup.ts 全局词库 zh-CN 基线）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listChangesets: vi.fn(),
  // B-model P0 Task 5：Named Versions 数据面（hook 级 mock——本文件只验收
  // 面板呈现，查询语义归 useNamedVersions.test）。
  namedVersions: [] as { id: string; name: string; description?: string }[],
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    listChangesets = mocks.listChangesets;
  },
}));

vi.mock('../hooks/useNamedVersions.js', () => ({
  useNamedVersions: () => ({
    namedVersions: mocks.namedVersions,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioDock } from '../components/PartStudioDock.js';

const CHANGESETS = [
  { id: 'cs-2', index: 2, description: '加圆角', displayName: 'cs2', pushDateTime: '2026-10-20T09:00:00Z' },
  { id: 'cs-1', index: 1, description: '初始特征', displayName: 'cs1', pushDateTime: '2026-10-19T09:00:00Z' },
];

/** 手动闸门：promise 的 resolve/reject 由用例掌控（loading/error 路径）。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface DockProps {
  iModelId?: string;
  currentChangesetId?: string | null;
  hasUnsavedChanges?: boolean;
  isSaving?: boolean;
  onSave?: () => void;
  onPush?: () => void;
}

function renderDock(props: DockProps = {}): { unmount: () => void } {
  resetStore();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <PartStudioDock iModelId="im-1" {...props} />
    </QueryClientProvider>,
  );
  return { unmount: view.unmount };
}

/** 文本内容断言（本仓不挂 jest-dom；textContent 收敛空白比对）。 */
function toContainText(element: HTMLElement, expected: string): boolean {
  return (element.textContent ?? '').includes(expected);
}

/** iTwinUI 禁用口径：button[disabled] 或 aria-disabled（美观禁用）。 */
function isDisabled(button: HTMLElement): boolean {
  return (button as HTMLButtonElement).disabled === true
    || button.getAttribute('aria-disabled') === 'true';
}

/** 打开版本历史页签（dock body 展开 + history 面板就位）。 */
async function openHistoryTab(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  const dock = screen.getByTestId('part-studio-dock');
  await user.click(within(dock).getByRole('tab', { name: '版本历史' }));
  return within(dock).getByTestId('part-studio-dock-body');
}

/** store 复位：dock 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    dock: { activeTab: 'toolSettings', isOpen: false },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  mocks.listChangesets.mockResolvedValue(CHANGESETS);
  mocks.namedVersions = [];
});

describe('PartStudioDock 版本历史真面板（M4 Task 7）', () => {
  it('未点开页签：body 不渲染；工具设置/显示设置仍占位', async () => {
    const user = userEvent.setup();
    renderDock();
    expect(screen.queryByTestId('part-studio-dock-body')).toBeNull();

    const dock = screen.getByTestId('part-studio-dock');
    await user.click(within(dock).getByRole('tab', { name: '工具设置' }));
    expect(toContainText(within(dock).getByTestId('part-studio-dock-body'), '内容即将推出')).toBe(true);

    await user.click(within(dock).getByRole('tab', { name: '显示设置' }));
    expect(toContainText(within(dock).getByTestId('part-studio-dock-body'), '内容即将推出')).toBe(true);
    // 占位页签不发起 changesets 查询。
    expect(mocks.listChangesets).not.toHaveBeenCalled();
  });

  it('loading 骨架先行，落定后列表行渲染（index/描述/日期）', async () => {
    const user = userEvent.setup();
    const pending = deferred<typeof CHANGESETS>();
    mocks.listChangesets.mockReturnValueOnce(pending.promise);
    renderDock();
    const body = await openHistoryTab(user);

    // 首载在途：骨架锚点在场，列表未渲染。
    expect(within(body).getByTestId('part-studio-changesets-loading')).toBeDefined();

    pending.resolve(CHANGESETS);
    const list = await within(body).findByTestId('part-studio-changesets-list');
    const rows = within(list).getAllByTestId('part-studio-changeset-row');
    expect(rows).toHaveLength(2);
    // 行内容：index + 描述（官方 SDK 字段直通）。
    expect(within(rows[0]!).getByText('2')).toBeDefined();
    expect(within(rows[0]!).getByText('加圆角')).toBeDefined();
    expect(within(rows[1]!).getByText('1')).toBeDefined();
    expect(within(rows[1]!).getByText('初始特征')).toBeDefined();
    // 日期为本地化短日期（非原始 ISO 串）。
    expect(within(rows[1]!).getByText(/2026/)).toBeDefined();
    expect(within(rows[1]!).queryByText('2026-10-19T09:00:00Z')).toBeNull();
  });

  it('当前版本标记：currentChangesetId 命中行 Badge「当前版本」，其余行无', async () => {
    const user = userEvent.setup();
    renderDock({ currentChangesetId: 'cs-2' });
    const body = await openHistoryTab(user);
    const list = await within(body).findByTestId('part-studio-changesets-list');
    const rows = within(list).getAllByTestId('part-studio-changeset-row');

    expect(within(rows[0]!).getByText('当前版本')).toBeDefined();
    expect(within(rows[1]!).queryByText('当前版本')).toBeNull();
  });

  it('empty 态：无 changeset = 初始版本语义文案（六态完备）', async () => {
    const user = userEvent.setup();
    mocks.listChangesets.mockResolvedValueOnce([]);
    renderDock();
    const body = await openHistoryTab(user);

    expect(toContainText(await within(body).findByTestId('part-studio-changesets-empty'), '初始版本')).toBe(true);
    expect(within(body).queryByTestId('part-studio-changesets-list')).toBeNull();
  });

  it('error 态：就地错误条含原因 + 重试触发 refetch', async () => {
    const user = userEvent.setup();
    const pending = deferred<never>();
    mocks.listChangesets.mockReturnValueOnce(pending.promise);
    renderDock();
    const body = await openHistoryTab(user);

    // 先见 loading 骨架（查询在途、handler 已挂）再 reject，免 unhandled rejection。
    await within(body).findByTestId('part-studio-changesets-loading');
    pending.reject(new Error('hub 不可达'));
    const errorStrip = await within(body).findByTestId('part-studio-changesets-error');
    expect(within(errorStrip).getByText(/hub 不可达/)).toBeDefined();
    expect(within(body).queryByTestId('part-studio-changesets-list')).toBeNull();

    // 重试：refetch 成功后列表替换错误条。
    mocks.listChangesets.mockResolvedValueOnce(CHANGESETS);
    await user.click(within(errorStrip).getByRole('button', { name: '重试' }));
    expect(await within(body).findByTestId('part-studio-changesets-list')).toBeDefined();
    expect(within(body).queryByTestId('part-studio-changesets-error')).toBeNull();
  });

  it('「保存」钮：hasUnsavedChanges 门控 + 未推送徽标；点击调 onSave（本地兜底）', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderDock({ hasUnsavedChanges: true, onSave });
    const body = await openHistoryTab(user);

    const save = await within(body).findByTestId('part-studio-dock-save-button');
    expect(within(body).getByTestId('part-studio-dock-unpushed-badge')).toBeDefined();
    await user.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('「保存」钮：无未推送变更/未接线时诚实禁用；isSaving 加载禁用', async () => {
    const user = userEvent.setup();
    const first = renderDock({ hasUnsavedChanges: false });
    const body = await openHistoryTab(user);
    const save = await within(body).findByTestId('part-studio-dock-save-button');
    expect(isDisabled(save)).toBe(true);
    expect(within(body).queryByTestId('part-studio-dock-unpushed-badge')).toBeNull();
    first.unmount();

    // isSaving：加载态禁用（防重入）。
    renderDock({ hasUnsavedChanges: true, isSaving: true, onSave: vi.fn() });
    const busyBody = await openHistoryTab(user);
    const busySave = await within(busyBody).findByTestId('part-studio-dock-save-button');
    expect(isDisabled(busySave)).toBe(true);
  });

  // B-model P0 Task 5：Named Versions 分组（元数据命名行——名称/描述直通）。
  it('命名版本分组：Named Versions 行可见（V1），空集不渲染分组', async () => {
    const user = userEvent.setup();
    mocks.namedVersions = [{ id: 'nv-1', name: 'V1' }];
    renderDock();
    const body = await openHistoryTab(user);

    const named = await within(body).findByTestId('part-studio-named-versions');
    expect(toContainText(named, '命名版本')).toBe(true);
    expect(within(named).getByText('V1')).toBeDefined();
    expect(within(named).getAllByTestId('part-studio-named-version-row')).toHaveLength(1);
  });

  it('「推送」钮：hasUnsavedChanges 门控；点击调 onPush（宿主开推送对话框）', async () => {
    const user = userEvent.setup();
    const onPush = vi.fn();
    const first = renderDock({ hasUnsavedChanges: true, onPush });
    const body = await openHistoryTab(user);

    const push = await within(body).findByTestId('part-studio-dock-push-button');
    await user.click(push);
    expect(onPush).toHaveBeenCalledTimes(1);
    first.unmount();

    // 无未推送变更：诚实禁用（无可推送内容）。
    renderDock({ hasUnsavedChanges: false, onPush });
    const idleBody = await openHistoryTab(user);
    const idlePush = await within(idleBody).findByTestId('part-studio-dock-push-button');
    expect(isDisabled(idlePush)).toBe(true);
  });
});

// ── M4 Task 8（M3 终审挂账清偿）────────────────────────────────────────────

describe('M4-T8 T3-④：dock tab aria-controls 关联', () => {
  it('页签 aria-controls 指向面板 id；面板 aria-labelledby 指回活动页签', async () => {
    const user = userEvent.setup();
    renderDock();
    const dock = screen.getByTestId('part-studio-dock');
    const historyTab = within(dock).getByRole('tab', { name: '版本历史' });
    await user.click(historyTab);

    const body = within(dock).getByTestId('part-studio-dock-body');
    // tab → panel 指向（aria-controls=id）；panel → tab 回指（aria-labelledby）。
    expect(historyTab.getAttribute('aria-controls')).toBe(body.id);
    expect(body.getAttribute('aria-labelledby')).toBe(historyTab.id);
    // 切页签后回指随活动页签走。
    await user.click(within(dock).getByRole('tab', { name: '显示设置' }));
    expect(within(dock).getByTestId('part-studio-dock-body').getAttribute('aria-labelledby'))
      .toBe(within(dock).getByRole('tab', { name: '显示设置' }).id);
  });
});
