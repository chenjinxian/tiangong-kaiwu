// src/modules/part-studio/test/TabManagerDialog.test.tsx
//
// M3 Task 7（brief Step 1）：页签管理器（对齐 os-33）——
//  1) 结构：对话框=搜索页签框 + 视图切换（列表/网格）+ 类型筛选 + 元素列表
//     （图标/名称/类型标签）+ 底部所选元素预览 + 底栏「页签管理器 (alt+~+t)」
//     快捷键标注 + 「以打开」checkbox + 关闭钮；
//  2) 数据：当前 iTwin 的 iModel 列表（ImodelsClient.list 模块级 mock），
//     活动 iModel 行 aria-current；教程/装配体元素经 extras 注入（图标区分
//     类型契约：partStudio=内部路由 / assembly=内部路由 / tutorial=外部链接）；
//  3) 纯函数：toTabElements（官方 IModel → TabElement 映射）与
//     filterTabElements（搜索词大小写不敏感子串 + 类型筛选）；
//  4) 交互：搜索过滤/清除、筛选空态、视图切换、点击行选中→底部预览跟随、
//     双击行打开（navigate）、「以打开」勾选→window.open、Enter 键打开、
//     tutorial 行外部链接；
//  5) PartStudioTabs 集成：「+」钮（T3 壳期禁用位）启用 → 点击开管理器。
//
// 定位：组件行为验收层；真实 store/i18n 参与（setup.ts 全局词库兜底，
// zh-CN 基线），ImodelsClient 模块级 mock（零真实请求）。

import type { JSX } from 'react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  imodelsList: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    list = mocks.imodelsList;
    get = vi.fn();
    create = vi.fn();
    delete = vi.fn();
  },
}));

import { filterTabElements, toTabElements } from '../tabs/TabManagerDialog.js';
import type { TabElement } from '../tabs/TabManagerDialog.js';
import { TabManagerDialog } from '../tabs/TabManagerDialog.js';
import { PartStudioTabs } from '../components/PartStudioTabs.js';

const ITWIN_ID = 'itwin-9';

const IMODELS = [
  { id: 'im-1', displayName: '楼层模型' },
  { id: 'im-2', displayName: '支架零件' },
  { id: 'im-3', name: '无显示名模型' },
];

const EXTRAS: TabElement[] = [
  { id: 'as-1', name: '演示装配', kind: 'assembly', href: `/documents/${ITWIN_ID}/as-1` },
  { id: 'tu-1', name: '入门教程', kind: 'tutorial', href: 'https://example.com/docs/tutorial' },
];

/** 路由探针：dblclick/Enter 打开行为经 location 断言。 */
function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location-probe">{location.pathname}</output>;
}

function renderDialog(options?: {
  activeIModelId?: string;
  extras?: readonly TabElement[];
  isOpen?: boolean;
}): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/im-1`]}>
        <TabManagerDialog
          iTwinId={ITWIN_ID}
          activeIModelId={options?.activeIModelId ?? 'im-1'}
          isOpen={options?.isOpen ?? true}
          onClose={vi.fn()}
          extras={options?.extras}
        />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 受控宿主：断言 onClose 后对话框卸载（父级 isOpen 态驱动）。 */
function ControlledHost(): JSX.Element {
  const [isOpen, setIsOpen] = React.useState(true);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/im-1`]}>
        <TabManagerDialog
          iTwinId={ITWIN_ID}
          activeIModelId="im-1"
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.imodelsList.mockResolvedValue(IMODELS);
  // window.open 不真开页签（jsdom 未实现导航）。
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('toTabElements（官方 IModel → TabElement）', () => {
  it('displayName 优先、缺席回退 name；kind 恒 partStudio；href=文档内路由', () => {
    const elements = toTabElements(IMODELS, ITWIN_ID);
    expect(elements).toEqual([
      { id: 'im-1', name: '楼层模型', kind: 'partStudio', href: `/documents/${ITWIN_ID}/im-1` },
      { id: 'im-2', name: '支架零件', kind: 'partStudio', href: `/documents/${ITWIN_ID}/im-2` },
      { id: 'im-3', name: '无显示名模型', kind: 'partStudio', href: `/documents/${ITWIN_ID}/im-3` },
    ]);
  });
});

describe('filterTabElements（搜索 + 类型筛选）', () => {
  const ALL = toTabElements(IMODELS, ITWIN_ID);

  it('空查询 + all → 原序全量', () => {
    expect(filterTabElements(ALL, '', 'all')).toEqual(ALL);
  });

  it('搜索词大小写不敏感子串匹配（中文按字面值）', () => {
    expect(filterTabElements(ALL, '零件', 'all').map((e) => e.id)).toEqual(['im-2']);
    expect(filterTabElements(ALL, '模型', 'all').map((e) => e.id)).toEqual(['im-1', 'im-3']);
  });

  it('类型筛选：assembly/tutorial 元素按 kind 命中；all 不丢外部元素', () => {
    const withExtras = [...ALL, ...EXTRAS];
    expect(filterTabElements(withExtras, '', 'partStudio')).toEqual(ALL);
    expect(filterTabElements(withExtras, '', 'assembly').map((e) => e.id)).toEqual(['as-1']);
    expect(filterTabElements(withExtras, '', 'tutorial').map((e) => e.id)).toEqual(['tu-1']);
  });

  it('搜索 + 筛选叠加（交集）', () => {
    const withExtras = [...ALL, ...EXTRAS];
    expect(filterTabElements(withExtras, '演示', 'assembly').map((e) => e.id)).toEqual(['as-1']);
    expect(filterTabElements(withExtras, '演示', 'partStudio')).toEqual([]);
  });
});

describe('TabManagerDialog 结构（os-33）', () => {
  it('渲染对话框：搜索页签框/视图切换/筛选/底栏快捷键标注/「以打开」/关闭钮', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByPlaceholderText('搜索页签')).toBeDefined();
    expect(within(dialog).getByRole('combobox', { name: '筛选' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: '列表视图' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: '网格视图' })).toBeDefined();
    // 底栏：快捷键标注 + 「以打开」checkbox（os-33 底栏）。
    expect(within(dialog).getByText('页签管理器 (alt+~+t)')).toBeDefined();
    expect(within(dialog).getByRole('checkbox', { name: '以打开' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: '关闭' })).toBeDefined();
  });

  it('列表渲染 iModel：名称 + Part Studio 类型标签；活动元素 aria-current', async () => {
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(list).getByText('楼层模型')).toBeDefined();
    expect(within(list).getByText('支架零件')).toBeDefined();
    expect(within(list).getAllByText('Part Studio')).toHaveLength(3);
    // 活动元素（当前 iModel）aria-current 高亮寻址。
    expect(within(list).getByText('楼层模型').closest('li')?.getAttribute('aria-current')).toBe('true');
    expect(within(list).getByText('支架零件').closest('li')?.getAttribute('aria-current')).toBeNull();
  });

  it('图标区分类型（extras 注入装配/教程）：类型标签分呈 + 教程行为外部链接', async () => {
    renderDialog({ extras: EXTRAS });
    const list = await screen.findByRole('list', { name: '页签列表' });
    // 装配体/教程类型标签（与 Part Studio 区分）。
    expect(within(list).getByText('装配体')).toBeDefined();
    expect(within(list).getByText('教程')).toBeDefined();
    // 教程=外链（Onshape「Tutorial」页签实为外链的实测口径）。
    const tutorialRow = within(list).getByText('入门教程').closest('li');
    const link = within(tutorialRow as HTMLElement).getByRole('link', { name: /入门教程/ });
    expect(link.getAttribute('href')).toBe('https://example.com/docs/tutorial');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('isOpen=false 渲染空（宿主常驻挂载，状态驱动开合）', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('加载中 → 加载中文案；失败 → 失败条 + 重试重取', async () => {
    mocks.imodelsList.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(await screen.findByText('加载中…')).toBeDefined();
    // 失败路：重取一次后拒绝。
    mocks.imodelsList.mockRejectedValueOnce(new Error('boom'));
    const retryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={retryClient}>
        <MemoryRouter>
          <TabManagerDialog iTwinId={ITWIN_ID} activeIModelId="im-1" isOpen onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('页签列表加载失败')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    // 调用序：首载#1（永不返回）+ 首载#2（拒绝）+ 重试#3。
    expect(mocks.imodelsList).toHaveBeenCalledTimes(3);
    unmount();
  });
});

describe('TabManagerDialog 搜索/筛选/视图', () => {
  it('输入搜索词过滤列表；清除钮复位全量', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    const search = screen.getByPlaceholderText('搜索页签');
    await user.type(search, '支架');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).queryByText('楼层模型')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('筛选至无命中类型 → 空态「无匹配页签」', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole('list', { name: '页签列表' });
    await user.selectOptions(screen.getByRole('combobox', { name: '筛选' }), 'assembly');
    // 无命中 → 列表整体让位空态（ul 卸载，勿对旧节点断言）。
    expect(screen.queryByRole('list', { name: '页签列表' })).toBeNull();
    expect(screen.getByText('无匹配页签')).toBeDefined();
  });

  it('视图切换：网格视图切换容器 data-view；切回列表还原', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    await user.click(screen.getByRole('button', { name: '网格视图' }));
    expect(list.getAttribute('data-view')).toBe('grid');
    await user.click(screen.getByRole('button', { name: '列表视图' }));
    expect(list.getAttribute('data-view')).toBe('list');
  });
});

describe('TabManagerDialog 选择与预览', () => {
  it('初始预览=活动元素；点击行选中 → 底部预览跟随', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    const preview = screen.getByTestId('tab-manager-preview');
    expect(within(preview).getByText('楼层模型')).toBeDefined();
    await user.click(within(list).getByText('支架零件'));
    expect(within(preview).getByText('支架零件')).toBeDefined();
    expect(within(preview).queryByText('楼层模型')).toBeNull();
  });

  it('「以打开」checkbox 可勾选/取消', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole('list', { name: '页签列表' });
    const checkbox = screen.getByRole('checkbox', { name: '以打开' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});

describe('TabManagerDialog 打开行为', () => {
  it('双击行 → 路由跳转对应 iModel 且对话框关闭', async () => {
    const user = userEvent.setup();
    render(<ControlledHost />);
    const list = await screen.findByRole('list', { name: '页签列表' });
    await user.dblClick(within(list).getByText('支架零件'));
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/im-2`);
    // onClose 已回调 → 受控宿主卸载对话框。
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('「以打开」勾选后双击 → window.open 新页签、当前路由不变', async () => {
    const user = userEvent.setup();
    render(<ControlledHost />);
    const list = await screen.findByRole('list', { name: '页签列表' });
    await user.click(screen.getByRole('checkbox', { name: '以打开' }));
    await user.dblClick(within(list).getByText('支架零件'));
    expect(window.open).toHaveBeenCalledWith(`/documents/${ITWIN_ID}/im-2`, '_blank', 'noopener');
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/im-1`);
  });

  it('行内 Enter 键 → 打开（os-33「↵ 以打开」键盘口径）', async () => {
    const user = userEvent.setup();
    render(<ControlledHost />);
    const list = await screen.findByRole('list', { name: '页签列表' });
    const row = within(list).getByText('支架零件').closest('li') as HTMLElement;
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/im-2`);
  });

  it('tutorial 行点击 → window.open 外部链接（不经内部路由）', async () => {
    const user = userEvent.setup();
    render(<ControlledHost2 extras={EXTRAS} />);
    const list = await screen.findByRole('list', { name: '页签列表' });
    await user.click(within(list).getByRole('link', { name: /入门教程/ }));
    expect(window.open).toHaveBeenCalledWith('https://example.com/docs/tutorial', '_blank', 'noopener');
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/im-1`);
  });
});

/** 受控宿主（extras 变体）：tutorial 点击断言用。 */
function ControlledHost2({ extras }: { extras?: readonly TabElement[] }): JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/im-1`]}>
        <TabManagerDialog
          iTwinId={ITWIN_ID}
          activeIModelId="im-1"
          isOpen
          onClose={vi.fn()}
          extras={extras}
        />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PartStudioTabs 集成（「+」开管理器）', () => {
  it('「+」钮启用可点；点击打开页签管理器对话框', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PartStudioTabs iTwinId={ITWIN_ID} iModelId="im-1" connection="ready" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const newTab = screen.getByRole('button', { name: '新建页签' }) as HTMLButtonElement;
    expect(newTab.disabled).toBe(false);
    await user.click(newTab);
    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText('页签管理器 (alt+~+t)')).toBeDefined();
  });
});

// ── M4 Task 8（M3 终审挂账清偿）────────────────────────────────────────────

describe('M4-T8 T6-③：列表方向键导航（↑↓ + 端点键）', () => {
  it('ArrowDown/ArrowUp 移动选中与焦点（预览跟随）；Home 跳首行', async () => {
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    const preview = screen.getByTestId('tab-manager-preview');
    // 首行为初始选中；焦点落首行动作元素。
    const firstRow = within(list).getByText('楼层模型').closest('li') as HTMLElement;
    const secondRow = within(list).getByText('支架零件').closest('li') as HTMLElement;
    (firstRow.querySelector('.tab-manager-row__action') as HTMLElement).focus();

    // ↓：选中+焦点双移动到第二行，底部预览跟随。
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' });
    expect(within(preview).getByText('支架零件')).toBeDefined();
    expect(document.activeElement).toBe(secondRow.querySelector('.tab-manager-row__action'));

    // Home：端点跳回首行（焦点随行）。
    fireEvent.keyDown(secondRow, { key: 'Home' });
    expect(within(preview).getByText('楼层模型')).toBeDefined();
    expect(document.activeElement).toBe(firstRow.querySelector('.tab-manager-row__action'));

    // ↑：回首行后上键不动（端点钳制在首行）。
    fireEvent.keyDown(firstRow, { key: 'ArrowUp' });
    expect(within(preview).getByText('楼层模型')).toBeDefined();
    expect(document.activeElement).toBe(firstRow.querySelector('.tab-manager-row__action'));
  });
});

describe('M4-T8 T7-①：alt+~+t 和弦热键开页签管理器', () => {
  it('Alt+~ 挂弦后击 t → 对话框打开；裸 t 不挂弦不响应', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PartStudioTabs iTwinId={ITWIN_ID} iModelId="im-1" connection="ready" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    // 裸 t（未挂弦）不打开。
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // 和弦：Alt+~ 挂弦 → t 打开。
    fireEvent.keyDown(window, { altKey: true, key: '~' });
    fireEvent.keyDown(window, { key: 't' });
    expect(await screen.findByRole('dialog')).toBeDefined();
  });
});
