// src/modules/part-studio/test/PartStudioTabs.test.tsx
//
// B-model P2.4：真页签（注册表 Part Studio）+ URL 生产者测试——
//  1) tabs=studios 映射，active=URL `?model=`；点击只换 URL（workspaceRefPath），
//     无新 BriefcaseConnection 语义归页面测试（本组件不产连接）；
//  2) 「+」= 创建默认名称 Part Studio（onCreate 返回新条目 → 导航）；失败条可见；
//  3) 「Part Studio 操作」菜单 = 重命名/删除：删除走 HITL 确认（确认前不调
//     registry）；最后一个完整 scope 的服务端拒绝原文就地呈现；
//  4) 半图 degraded 页签标「已损坏」且重命名禁用；
//  5) A 旧文档：legacy 单页签、无「+」/无操作菜单、零 registry 回调；
//  6) alt+~+t 和弦热键开页签管理器（列 Part Studio）。
//
// 定位：组件行为验收层；真实 i18n/store 参与，零真实请求。

import type { JSX } from 'react';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartStudioInfo } from '@luban-cad/shared';

import { PartStudioTabs } from '../components/PartStudioTabs.js';

const ITWIN_ID = 'itwin-9';
const IMODEL_ID = 'im-1';

const STUDIOS: PartStudioInfo[] = [
  { id: 'ps-1', name: '支架', order: 1, defModelId: '0x11', physModelId: '0x12' },
  { id: 'ps-2', name: '底座', order: 2, defModelId: '0x21', physModelId: '0x22' },
  { id: 'half-1', name: 'half-1', order: 0, defModelId: '0x31', physModelId: '' },
];

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location-probe">{`${location.pathname}${location.search}`}</output>;
}

function renderTabs(options?: {
  mode?: 'A' | 'B';
  studios?: readonly PartStudioInfo[];
  activeModelId?: string;
  canEdit?: boolean;
  onCreate?: () => Promise<PartStudioInfo> | PartStudioInfo;
  onRename?: (id: string, name: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-1`]}>
      <PartStudioTabs
        // 'mode' in options：保留显式 undefined（marker 未定）语义。
        mode={options && 'mode' in options ? options.mode : 'B'}
        iTwinId={ITWIN_ID}
        iModelId={IMODEL_ID}
        studios={options?.studios ?? STUDIOS}
        activeModelId={options?.activeModelId ?? 'ps-1'}
        canEdit={options?.canEdit ?? true}
        onCreate={options?.onCreate}
        onRename={options?.onRename}
        onDelete={options?.onDelete}
        connection="ready"
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('B 文档真页签（studios → tabs；active = ?model=）', () => {
  it('页签全量渲染、活动项 aria-selected；半图页签标「已损坏」', () => {
    renderTabs();
    const selected = screen.getByRole('tab', { name: '支架' });
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '底座' }).getAttribute('aria-selected')).toBe('false');
    const damaged = screen.getByRole('tab', { name: /half-1/ });
    expect(damaged.getAttribute('data-damaged')).toBe('true');
    expect(within(damaged).getByText('已损坏')).toBeDefined();
  });

  it('点击页签只换 URL（workspaceRefPath 含 ?model=）——不重挂组件', async () => {
    const user = userEvent.setup();
    const { rerender } = renderTabs();
    await user.click(screen.getByRole('tab', { name: '底座' }));
    expect(screen.getByTestId('location-probe').textContent).toBe(
      `/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-2`,
    );
    // 同一实例重渲染仍只有一组页签（路由不变，无连接重建语义由页面测试钉死）。
    rerender(
      <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-1`]}>
        <PartStudioTabs
          mode="B"
          iTwinId={ITWIN_ID}
          iModelId={IMODEL_ID}
          studios={STUDIOS}
          activeModelId="ps-1"
          canEdit
          connection="ready"
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});

describe('创建（「+」= 默认名称）', () => {
  it('点击「+」调 onCreate 并导航到新 scope', async () => {
    const user = userEvent.setup();
    const created: PartStudioInfo = {
      id: 'ps-new', name: 'Part Studio 2', order: 3, defModelId: '0x41', physModelId: '0x42',
    };
    const onCreate = vi.fn(async () => created);
    renderTabs({ onCreate });
    await user.click(screen.getByRole('button', { name: '新建 Part Studio' }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByTestId('location-probe').textContent).toBe(
      `/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-new`,
    );
  });

  it('创建失败：错误条可见（不导航）', async () => {
    const user = userEvent.setup();
    renderTabs({ onCreate: vi.fn(async () => { throw new Error('lease held by other'); }) });
    await user.click(screen.getByRole('button', { name: '新建 Part Studio' }));
    expect(await screen.findByTestId('part-studio-tabs-error')).toBeDefined();
    expect(screen.getByText(/lease held by other/)).toBeDefined();
    expect(screen.getByTestId('location-probe').textContent).toBe(
      `/documents/${ITWIN_ID}/${IMODEL_ID}?model=ps-1`,
    );
  });

  it('A 旧文档：单页签 + 「+」禁用（零 registry 回调）', () => {
    renderTabs({ mode: 'A', studios: [] });
    expect(screen.getByRole('tab', { name: 'Part Studio 1' }).getAttribute('aria-selected')).toBe('true');
    const newTab = screen.getByRole('button', { name: '新建 Part Studio' }) as HTMLButtonElement;
    expect(newTab.disabled || newTab.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(screen.queryByTestId('part-studio-tab-actions')).toBeNull();
  });

  it('mode 未定/失败：不渲染 legacy 页签、动作菜单缺席、「+」禁用（F1）', () => {
    renderTabs({ mode: undefined, studios: [] });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByTestId('part-studio-tab-actions')).toBeNull();
    const newTab = screen.getByRole('button', { name: '新建 Part Studio' }) as HTMLButtonElement;
    expect(newTab.disabled || newTab.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});

describe('重命名 / 删除（注册表写通道，删除 HITL）', () => {
  it('重命名：菜单 → 对话框 → onRename(id,name)', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn(async () => undefined);
    renderTabs({ onRename });
    await user.click(screen.getByTestId('part-studio-tab-actions'));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '重命名 Part Studio' }));
    const dialog = await screen.findByRole('dialog', { name: '重命名 Part Studio' });
    const input = within(dialog).getByRole('textbox', { name: '名称' });
    await user.clear(input);
    await user.type(input, '新名称');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(onRename).toHaveBeenCalledWith('ps-1', '新名称');
  });

  it('重命名失败：服务端原文就地呈现', async () => {
    const user = userEvent.setup();
    renderTabs({ onRename: vi.fn(async () => { throw new Error('不存在或不是注册表 scope'); }) });
    await user.click(screen.getByTestId('part-studio-tab-actions'));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '重命名 Part Studio' }));
    const dialog = await screen.findByRole('dialog', { name: '重命名 Part Studio' });
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(await within(dialog).findByText(/不存在或不是注册表 scope/)).toBeDefined();
  });

  it('删除 HITL：确认前不调 onDelete；确认后调用', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => undefined);
    renderTabs({ onDelete });
    await user.click(screen.getByTestId('part-studio-tab-actions'));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '删除 Part Studio' }));
    const dialog = await screen.findByRole('dialog', { name: '删除 Part Studio' });
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith('ps-1');
  });

  it('删除最后一个完整 scope：服务端拒绝原文就地呈现（不静默）', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => { throw new Error('不能删除最后一个 Part Studio'); });
    renderTabs({ onDelete });
    await user.click(screen.getByTestId('part-studio-tab-actions'));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: '删除 Part Studio' }));
    const dialog = await screen.findByRole('dialog', { name: '删除 Part Studio' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(await within(dialog).findByText(/不能删除最后一个 Part Studio/)).toBeDefined();
  });

  it('半图页签：操作菜单重命名禁用（后端拒收半图 rename）', async () => {
    const user = userEvent.setup();
    renderTabs({ activeModelId: 'half-1' });
    await user.click(screen.getByTestId('part-studio-tab-actions'));
    const menu = await screen.findByRole('menu');
    const rename = within(menu).getByRole('menuitem', { name: '重命名 Part Studio' });
    expect(rename.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('页签管理器入口（alt+~+t）', () => {
  it('和弦热键打开管理器；管理行列 Part Studio 且行 href 含 ?model=', async () => {
    renderTabs();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { altKey: true, key: '~' });
    fireEvent.keyDown(window, { key: 't' });
    const dialog = await screen.findByRole('dialog', { name: '页签管理器' });
    const list = await within(dialog).findByRole('list', { name: '页签列表' });
    expect(within(list).getByText('支架')).toBeDefined();
    expect(within(list).getByText('底座').closest('a')?.getAttribute('href')).toContain('?model=ps-2');
  });
});
