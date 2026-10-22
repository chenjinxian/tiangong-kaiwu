// src/modules/part-studio/test/PartStudioTopBar.test.tsx
//
// M4 Task 4（brief Step 1）：顶栏右侧撤销/重做/保存三钮组（对齐 os-11）——
//  1) 结构：三钮（撤消/重做/保存版本）位于操作区（分享钮之前），i18n 标签齐备；
//  2) 状态完备：canUndo/canRedo/hasUnsavedChanges 驱动 disabled；
//  3) 动作：undo/redo/保存版本 点击各调对应回调（禁用态点击不调）。
//
// T4 评审 Important-1 演进（M4-T7 承接）：顶栏第三钮从「保存」（saveChanges
// no-op 提交永不回落）改为「保存版本」推送入口——点击由宿主开推送对话框
//（确认走 connection.pushChanges；onChangesPushed 事件驱动 hasPendingTxns
// 归 false = 收敛点），本组件只持回调门控。
//
// 定位：组件行为验收层；mock 口径与 DocumentMenuBar.test 一致（真实 i18n/store，
// 客户端模块级 mock，零真实请求/零查看器）。

import type React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    get = vi.fn().mockResolvedValue({ id: 'itwin-9', displayName: '演示文档' });
    list = vi.fn();
    create = vi.fn();
    update = vi.fn();
    delete = vi.fn();
    listFavorites = vi.fn();
    listRecents = vi.fn();
  },
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    get = vi.fn().mockResolvedValue({ id: 'im-1', displayName: '楼层模型' });
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

// Ribbon.js（CapabilityDialog 依赖面）钉形 mock（零真实查看器）——同
// DocumentMenuBar.test 口径。
vi.mock('@itwin/core-frontend', () => ({
  Tool: class {},
  IModelApp: {
    tools: { run: vi.fn() },
    viewManager: { selectedView: null },
  },
}));

import { PartStudioTopBar } from '../components/PartStudioTopBar.js';

function renderTopBar(
  props: Partial<Parameters<typeof PartStudioTopBar>[0]> = {},
): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/documents/itwin-9/im-1']}>
        <PartStudioTopBar iTwinId="itwin-9" iModelId="im-1" {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** 三钮句柄（order：撤消/重做/保存版本）。 */
function getEditorButtons() {
  const topBar = screen.getByTestId('part-studio-top-bar');
  const undo = within(topBar).getByRole('button', { name: '撤消' });
  const redo = within(topBar).getByRole('button', { name: '重做' });
  const save = within(topBar).getByRole('button', { name: '保存版本' });
  return { topBar, undo, redo, save };
}

/** iTwinUI 禁用口径：button[disabled] 或 aria-disabled（美观禁用）。 */
function isDisabled(button: HTMLElement): boolean {
  return (button as HTMLButtonElement).disabled === true
    || button.getAttribute('aria-disabled') === 'true';
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PartStudioTopBar 撤销/重做/保存三钮组（M4 Task 4）', () => {
  it('三钮位于操作区（分享钮之前）且标签 i18n 就位', () => {
    renderTopBar();
    const topBar = screen.getByTestId('part-studio-top-bar');
    const share = within(topBar).getByRole('button', { name: '分享' });
    const { undo, redo, save } = getEditorButtons();

    // DOM 序：三钮先于分享钮（os-11 右侧操作簇头部）。
    expect(topBar.contains(undo)).toBe(true);
    expect(topBar.contains(redo)).toBe(true);
    expect(topBar.contains(save)).toBe(true);
    expect(undo.compareDocumentPosition(redo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(redo.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('缺省 props（未接线）：三钮全禁用（诚实禁用不误投）', () => {
    renderTopBar();
    const { undo, redo, save } = getEditorButtons();
    expect(isDisabled(undo)).toBe(true);
    expect(isDisabled(redo)).toBe(true);
    expect(isDisabled(save)).toBe(true);
  });

  it('canUndo/canRedo/hasUnsavedChanges 驱动各钮 disabled', () => {
    renderTopBar({ canUndo: true, canRedo: false, hasUnsavedChanges: false });
    const { undo, redo, save } = getEditorButtons();
    expect(isDisabled(undo)).toBe(false);
    expect(isDisabled(redo)).toBe(true);
    expect(isDisabled(save)).toBe(true);
  });

  it('hasUnsavedChanges=true：保存版本钮解除禁用（有未推送内容才可开推送入口）', () => {
    renderTopBar({ hasUnsavedChanges: true });
    const { save } = getEditorButtons();
    expect(isDisabled(save)).toBe(false);
  });

  it('点击：undo/redo/保存版本 各调对应回调', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onSave = vi.fn();
    renderTopBar({ canUndo: true, canRedo: true, hasUnsavedChanges: true, onUndo, onRedo, onSave });

    const { undo, redo, save } = getEditorButtons();
    await user.click(undo);
    await user.click(redo);
    await user.click(save);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('禁用态点击不调回调', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    const onSave = vi.fn();
    renderTopBar({ onUndo, onRedo, onSave });

    const { undo, redo, save } = getEditorButtons();
    await user.click(undo);
    await user.click(redo);
    await user.click(save);
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
