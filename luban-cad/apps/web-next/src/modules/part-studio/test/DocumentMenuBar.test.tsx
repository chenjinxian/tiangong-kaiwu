// src/modules/part-studio/test/DocumentMenuBar.test.tsx
//
// M3 Task 7（brief Step 1）：汉堡文档菜单（对齐 os-24）——
//  1) 结构：顶栏汉堡钮（aria 文档菜单）→ 菜单项序=重命名文档/移至…/文档详
//     细信息…/还原已删除的工作区…/复制工作区…/更新工作区…/工作区单位…/工作区
//     属性…/切换到仅查看模式/打印…/关闭文档（os-24 实测序）；
//  2) 动作路由：full 项——重命名文档→复用 documents 模块 RenameDocumentDialog
//     （ItwinsClient.update 落库）；文档详细信息…→ /documents/:iTwinId；
//     工作区单位…→ 单位对话框（毫米 mm 唯一可选项，其余单位 disabled 占位）；
//     切换到仅查看模式→ store.viewOnly 切换（再开菜单标签/勾选自反转）；
//     关闭文档→ /documents；gated 项（移至…/还原…/复制…/更新…/工作区属性…/
//     打印…）→ 能力引导对话框，不导航；
//  3) 顶栏集成（PartStudioTopBar）：汉堡位于品牌右侧；分享钮开共享对话框
//     （复用 modules/documents ShareDocumentDialog，经 @modules/documents
//     barrel 消费）。
//
// 定位：组件行为验收层；真实 store/i18n 参与（zh-CN 基线），客户端模块级
// mock（零真实请求）；@itwin/core-frontend 模块级 mock（Ribbon.js 的
// CapabilityDialog 依赖面，零真实查看器）。

import type { JSX } from 'react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  itwinsUpdate: vi.fn(),
}));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    update = mocks.itwinsUpdate;
    get = vi.fn();
    list = vi.fn();
    create = vi.fn();
    delete = vi.fn();
    listFavorites = vi.fn();
    listRecents = vi.fn();
  },
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    get = vi.fn();
    list = vi.fn();
    create = vi.fn();
    delete = vi.fn();
  },
}));

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: {
    getStoredAuth: vi.fn().mockReturnValue({
      accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 999_999,
      user: { id: 'user-9', email: 'alan@example.com', name: 'Alan Chen' },
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    getValidAccessToken: vi.fn().mockResolvedValue('tok'),
  },
}));

// Ribbon.js（CapabilityDialog 来源）模块级依赖面钉形（零真实查看器）。
vi.mock('@itwin/core-frontend', () => ({
  // Tool 基类桩：part-studio barrel → PartStudioPage → viewer-next 装饰件
  // （ToggleProjectExtentsTool extends Tool）模块加载期即需 Tool 存在。
  Tool: class {},
  IModelApp: {
    tools: { run: vi.fn() },
    viewManager: { selectedView: null },
  },
}));

import { usePartStudioStore } from '../index.js';
import { DocumentMenuBar } from '../components/DocumentMenuBar.js';
import { PartStudioTopBar } from '../components/PartStudioTopBar.js';

const ITWIN_ID = 'itwin-9';
const DOC_NAME = '演示文档';

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return <output data-testid="location-probe">{location.pathname}</output>;
}

function renderMenu(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/im-1`]}>
        <DocumentMenuBar iTwinId={ITWIN_ID} documentName={DOC_NAME} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 打开菜单并返回 menu 元素（调用方 user 驱动）。 */
async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: '文档菜单' }));
  return screen.getByRole('menu');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.itwinsUpdate.mockResolvedValue({ id: ITWIN_ID, displayName: '新名字' });
  usePartStudioStore.setState({ viewOnly: { isActive: false } });
});

describe('DocumentMenuBar 结构（os-24）', () => {
  it('汉堡钮渲染（aria 文档菜单）', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: '文档菜单' })).toBeDefined();
  });

  it('菜单项序列对齐 os-24 实测（11 项 + 组分隔）', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);
    expect(names).toEqual([
      '重命名文档',
      '移至…',
      '文档详细信息…',
      '还原已删除的工作区…',
      '复制工作区…',
      '更新工作区…',
      '工作区单位…',
      '工作区属性…',
      '切换到仅查看模式',
      '打印…',
      '关闭文档',
    ]);
  });
});

describe('DocumentMenuBar 动作路由（full 项）', () => {
  it('文档详细信息… → 跳转 /documents/:iTwinId', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: '文档详细信息…' }));
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}`);
  });

  it('关闭文档 → 跳转 /documents（文档中心）', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: '关闭文档' }));
    expect(screen.getByTestId('location-probe').textContent).toBe('/documents');
  });

  it('切换到仅查看模式 → store.viewOnly 置真；再开菜单标签反转为编辑模式 + 选中态', async () => {
    const user = userEvent.setup();
    renderMenu();
    let menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: '切换到仅查看模式' }));
    expect(usePartStudioStore.getState().viewOnly.isActive).toBe(true);
    menu = await openMenu(user);
    const editMode = within(menu).getByRole('menuitem', { name: '切换到编辑模式' });
    expect(editMode.getAttribute('aria-selected')).toBe('true');
    // 反转回编辑模式。
    await user.click(editMode);
    expect(usePartStudioStore.getState().viewOnly.isActive).toBe(false);
  });

  it('工作区单位… → 单位对话框（毫米 mm 选中；英寸/厘米占位 disabled）', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: '工作区单位…' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: '工作区单位' })).toBeDefined();
    const select = within(dialog).getByRole('combobox', { name: '长度单位' });
    expect((select as HTMLSelectElement).value).toBe('mm');
    const inch = within(dialog).getByRole('option', { name: '英寸 (in)' }) as HTMLOptionElement;
    expect(inch.disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: '关闭' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('重命名文档 → 复用 RenameDocumentDialog：原名预填，保存走 ItwinsClient.update', async () => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: '重命名文档' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('文档名称') as HTMLInputElement;
    expect(input.value).toBe(DOC_NAME);
    await user.clear(input);
    await user.type(input, '新文档名');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(mocks.itwinsUpdate).toHaveBeenCalledWith(ITWIN_ID, { displayName: '新文档名' });
  });
});

describe('DocumentMenuBar 动作路由（gated 项 → 能力引导）', () => {
  it.each([
    ['移至…', '移至（规划中）'],
    ['还原已删除的工作区…', '还原已删除的工作区（规划中）'],
    ['复制工作区…', '复制工作区（规划中）'],
    ['更新工作区…', '更新工作区（规划中）'],
    ['工作区属性…', '工作区属性（规划中）'],
    ['打印…', '打印（规划中）'],
  ])('点击 %s → 能力引导对话框「%s」，不触发路由', async (item, title) => {
    const user = userEvent.setup();
    renderMenu();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: item }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(title)).toBeDefined();
    expect(screen.getByTestId('location-probe').textContent).toBe(`/documents/${ITWIN_ID}/im-1`);
    await user.click(within(dialog).getByRole('button', { name: '知道了' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('PartStudioTopBar 集成（汉堡 + 分享钮）', () => {
  function renderTopBar(): ReturnType<typeof render> {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/documents/${ITWIN_ID}/im-1`]}>
          <PartStudioTopBar iTwinId={ITWIN_ID} iModelId="im-1" />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('顶栏渲染汉堡（DocumentMenuBar）+ 原分享钮；汉堡在分享钮之前', () => {
    renderTopBar();
    const hamburger = screen.getByRole('button', { name: '文档菜单' });
    const share = screen.getByRole('button', { name: '分享' });
    // DOM 序：汉堡先于分享（顶栏左侧 vs 右侧操作区）。
    expect(hamburger.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('分享钮 → 打开共享对话框（复用 documents 模块 ShareDocumentDialog）', async () => {
    const user = userEvent.setup();
    renderTopBar();
    await user.click(screen.getByRole('button', { name: '分享' }));
    const dialog = await screen.findByRole('dialog');
    // ShareDocumentDialog 三页签（成员/邀请/链接）锚点——成员页签带计数后缀
    //（jsdom 零请求 → 0），邀请页签全称为「邀请成员」，链接页签「分享链接」。
    const tabs = within(dialog).getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]?.textContent).toMatch(/^成员/);
    expect(within(dialog).getByRole('tab', { name: '邀请成员' })).toBeDefined();
    expect(within(dialog).getByRole('tab', { name: '分享链接' })).toBeDefined();
  });
});
