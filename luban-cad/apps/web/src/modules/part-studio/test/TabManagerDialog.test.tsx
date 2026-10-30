// src/modules/part-studio/test/TabManagerDialog.test.tsx
//
// B-model P2.4：页签管理器数据面重写测试——列表=Part Studio 注册表（不再是
// iModel 列表）：
//  1) 纯函数 filterPartStudios（大小写不敏感子串）；
//  2) 结构：搜索框/清除/视图切换/底栏快捷键标注/「以打开」/关闭；
//  3) 行 href=workspaceRefPath（B 含 `?model=`，A 不含）；活动项 aria-current；
//     半图 degraded 行标记「损坏」；
//  4) 打开行为：单击/Enter → 路由跳转活动（onClose 回调）；「以打开」→
//     window.open 新页签、当前路由不变；
//  5) loading/error（重试）/empty 三态；A 单页签只读行；
//  6) Escape dismissal（打开即焦点入对话框——iTwinUI 键盘可达前提）。
//
// 定位：组件行为验收层；真实 i18n 参与（zh-CN 基线），零真实请求（本组件不再
// 查询任何客户端）。

import type { JSX } from 'react';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartStudioInfo } from '@luban-cad/shared';

import { filterPartStudios, TabManagerDialog } from '../tabs/TabManagerDialog.js';

const ITWIN_ID = 'itwin-9';
const IMODEL_ID = 'im-1';

const STUDIOS: PartStudioInfo[] = [
  { id: 'ps-1', name: '支架', order: 1, defModelId: '0x11', physModelId: '0x12' },
  { id: 'ps-2', name: 'Base Plate', order: 2, defModelId: '0x21', physModelId: '0x22' },
  { id: 'half-1', name: 'half-1', order: 0, defModelId: '0x31', physModelId: '' },
];

/** 路由探针：pathname + search（`?model=` 断言）。 */
function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location-probe">{`${location.pathname}${location.search}`}</output>;
}

function renderDialog(options?: {
  mode?: 'A' | 'B';
  activeModelId?: string;
  studios?: readonly PartStudioInfo[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-1`]}>
      <TabManagerDialog
        // 'mode' in options：保留显式 undefined（marker 未定）语义。
        mode={options && 'mode' in options ? options.mode : 'B'}
        iTwinId={ITWIN_ID}
        iModelId={IMODEL_ID}
        studios={options?.studios ?? STUDIOS}
        activeModelId={options?.activeModelId ?? 'ps-1'}
        isLoading={options?.isLoading ?? false}
        error={options?.error ?? null}
        onRetry={options?.onRetry}
        isOpen={options?.isOpen ?? true}
        onClose={options?.onClose ?? vi.fn()}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // window.open 不真开页签（jsdom 未实现导航）。
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('filterPartStudios（搜索）', () => {
  it('空查询 → 原序全量；大小写不敏感子串（中文按字面值）', () => {
    expect(filterPartStudios(STUDIOS, '')).toEqual(STUDIOS);
    expect(filterPartStudios(STUDIOS, 'base').map((s) => s.id)).toEqual(['ps-2']);
    expect(filterPartStudios(STUDIOS, '支架').map((s) => s.id)).toEqual(['ps-1']);
    expect(filterPartStudios(STUDIOS, '  half  ').map((s) => s.id)).toEqual(['half-1']);
  });
});

describe('TabManagerDialog 结构（os-33 外观，Part Studio 数据面）', () => {
  it('搜索框/清除/视图切换/底栏快捷键标注/「以打开」/关闭钮', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByPlaceholderText('搜索页签')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: '列表视图' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: '网格视图' })).toBeDefined();
    expect(within(dialog).getByText('页签管理器 (alt+~+t)')).toBeDefined();
    expect(within(dialog).getByRole('checkbox', { name: '以打开' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: '关闭' })).toBeDefined();
  });

  it('元素列表：Part Studio 名称 + 活动项 aria-current + 半图行「损坏」标记', async () => {
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('支架')).toBeDefined();
    expect(within(list).getByText('Base Plate')).toBeDefined();
    expect(within(list).getByText('half-1')).toBeDefined();
    expect(within(list).getByText('支架').closest('li')?.getAttribute('aria-current')).toBe('true');
    expect(within(list).getByText('Base Plate').closest('li')?.getAttribute('aria-current')).toBeNull();
    const damagedRow = within(list).getByText('half-1').closest('li');
    expect(damagedRow?.getAttribute('data-damaged')).toBe('true');
    expect(within(damagedRow as HTMLElement).getByText('损坏')).toBeDefined();
  });

  it('行 href = workspaceRefPath（含 ?model=）；A 旧文档为不带 ?model= 的单页签', async () => {
    const { unmount } = renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    const href = within(list).getByText('Base Plate').closest('a')?.getAttribute('href');
    expect(href).toBe(`/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-2`);
    unmount();

    renderDialog({ mode: 'A', studios: [] });
    const legacyList = await screen.findByRole('list', { name: '页签列表' });
    const legacyHref = within(legacyList).getByText('Part Studio 1').closest('a')?.getAttribute('href');
    expect(legacyHref).toBe(`/documents/${ITWIN_ID}/${IMODEL_ID}`);
    expect(legacyHref).not.toContain('?model=');
  });

  it('loading / error（重试）/ 空态与筛选空态', async () => {
    const { unmount } = renderDialog({ isLoading: true });
    expect(await screen.findByText('加载中…')).toBeDefined();
    unmount();

    const retry = vi.fn();
    const second = renderDialog({ error: 'registry down', onRetry: retry });
    expect(await screen.findByText('registry down')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(retry).toHaveBeenCalledOnce();
    second.unmount();

    const third = renderDialog({ studios: [] });
    expect(await screen.findByText('暂无 Part Studio')).toBeDefined();
    third.unmount();

    const fourth = renderDialog();
    await screen.findByRole('list', { name: '页签列表' });
    fireEvent.change(screen.getByPlaceholderText('搜索页签'), { target: { value: '不存在' } });
    expect(screen.getByText('无匹配页签')).toBeDefined();
    fourth.unmount();
  });

  it('mode 未定（marker 在途/失败）：不列 legacy 页签，显示解析中（F1）', async () => {
    renderDialog({ mode: undefined });
    expect(await screen.findByTestId('tab-manager-unknown-mode')).toBeDefined();
    expect(screen.queryByText('Part Studio 1')).toBeNull();
  });

  it('isOpen=false 渲染空（宿主常驻挂载，状态驱动开合）', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TabManagerDialog 打开行为', () => {
  it('单击行 → 路由跳转（?model=）且对话框关闭', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });
    const list = await screen.findByRole('list', { name: '页签列表' });
    await user.click(within(list).getByText('Base Plate'));
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-2`);
    expect(onClose).toHaveBeenCalled();
  });

  it('行内 Enter → 打开（os-33「↵ 以打开」键盘口径）', async () => {
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    const link = within(list).getByText('Base Plate').closest('a') as HTMLAnchorElement;
    link.focus();
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-2`);
  });

  it('「以打开」勾选后点击 → window.open 新页签、当前路由不变', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    await user.click(screen.getByRole('checkbox', { name: '以打开' }));
    await user.click(within(list).getByText('Base Plate'));
    expect(window.open).toHaveBeenCalledWith(
      `/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-2`,
      '_blank',
      'noopener',
    );
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-1`);
  });

  it('搜索过滤后清除钮复位全量', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await screen.findByRole('list', { name: '页签列表' });
    await user.type(screen.getByPlaceholderText('搜索页签'), 'base');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  // review-8 I-1 端到端钉：打开即焦点入对话框（Escape 可达前提）。
  it('打开即焦点落对话框内；Escape → onClose 回调', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    const dialog = await screen.findByRole('dialog');
    expect(document.activeElement).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
