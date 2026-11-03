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

import React from 'react';
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
    update = vi.fn();
    delete = vi.fn();
  },
}));

// P2.1 F5 承接 / P2.4 DoD：分享目标注入面可观测——真实 ShareDocumentDialog
// 的网络面不属本组件测试（B/A 分流判定在 prop 形状）。
vi.mock('@modules/documents', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ShareDocumentDialog: (props: {
      doc: { id: string; mode: string; projectId: string } | null;
      imodelId?: string | null;
      canManageShare?: boolean;
      isOpen: boolean;
    }) =>
      props.isOpen
        ? React.createElement('div', {
            'data-testid': 'share-dialog-stub',
            'data-doc-id': props.doc?.id,
            'data-mode': props.doc?.mode,
            'data-project-id': props.doc?.projectId,
            'data-imodel-id': props.imodelId ?? '',
            'data-can-manage': String(props.canManageShare ?? false),
          })
        : null,
  };
});

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Onshape live：顶栏不再承载撤消/重做/创建版本', () => {
  it('顶栏无撤消/重做/保存版本钮（已迁移到工具栏首组与左缘面板选择条）', () => {
    renderTopBar();
    const topBar = screen.getByTestId('part-studio-top-bar');
    expect(within(topBar).queryByRole('button', { name: '撤消' })).toBeNull();
    expect(within(topBar).queryByRole('button', { name: '重做' })).toBeNull();
    expect(within(topBar).queryByRole('button', { name: '保存版本' })).toBeNull();
  });
});

describe('M4-T8 T3-②：help-button 死类清理', () => {
  it('帮助钮不再携带无 CSS 规则的 part-studio-help-button 死类', () => {
    renderTopBar();
    const topBar = screen.getByTestId('part-studio-top-bar');
    const help = within(topBar).getByRole('button', { name: '帮助' });
    expect(help.className).not.toContain('part-studio-help-button');
  });
});

// ── B-model P2.4（P2.1 F5 承接）：分享目标按 B/A 上下文分流 ─────────────────
describe('B/A 分享模式派生（P2.1 F5）', () => {
  it('B 文档：分享传 B DocumentSummary（iModel id + project id）+ imodelId + canManageShare', async () => {
    const user = userEvent.setup();
    renderTopBar({ mode: 'B', canManageShare: true });
    await user.click(screen.getByRole('button', { name: '分享' }));
    const stub = screen.getByTestId('share-dialog-stub');
    expect(stub.getAttribute('data-mode')).toBe('B');
    expect(stub.getAttribute('data-doc-id')).toBe('im-1');
    expect(stub.getAttribute('data-project-id')).toBe('itwin-9');
    expect(stub.getAttribute('data-imodel-id')).toBe('im-1');
    expect(stub.getAttribute('data-can-manage')).toBe('true');
  });

  it('B 文档无 iTwin manage：分享入口禁用（fail-closed，不回退 A 通道）', async () => {
    const user = userEvent.setup();
    renderTopBar({ mode: 'B' });
    const share = screen.getByTestId('part-studio-share-button') as HTMLButtonElement;
    expect(share.disabled || share.getAttribute('aria-disabled') === 'true').toBe(true);
    await user.click(share);
    expect(screen.queryByTestId('share-dialog-stub')).toBeNull();
  });

  it('A 旧文档（mode=A）：分享仍走 iTwin 通道（doc id=iTwinId、无 imodelId）', async () => {
    const user = userEvent.setup();
    renderTopBar({ mode: 'A' });
    await user.click(screen.getByRole('button', { name: '分享' }));
    const stub = screen.getByTestId('share-dialog-stub');
    expect(stub.getAttribute('data-mode')).toBe('A');
    expect(stub.getAttribute('data-doc-id')).toBe('itwin-9');
    expect(stub.getAttribute('data-imodel-id')).toBe('');
  });

  it('marker 未定/失败（mode undefined）：分享钮禁用，绝不注入 A iTwin 文档（F1）', async () => {
    const user = userEvent.setup();
    renderTopBar();
    const share = screen.getByTestId('part-studio-share-button') as HTMLButtonElement;
    expect(share.disabled || share.getAttribute('aria-disabled') === 'true').toBe(true);
    await user.click(share);
    expect(screen.queryByTestId('share-dialog-stub')).toBeNull();
  });
});
