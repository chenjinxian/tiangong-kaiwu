// src/modules/documents/test/ShareDocumentDialog.test.tsx
//
// P2.3：分享对话框按模式分流——
//  - A 旧文档（mode='A'）与 B 项目容器（mode='B' 但无 imodelId）走既有 iTwin
//    成员/邀请通道（逐行为不变）；
//  - B 文档（mode='B' + imodelId）走 iModel 权限通道：读 isSecured + 权限用户，
//    授权 Read/Manage、撤销；不声称链接分享。
//
// 数据面 mock：ImodelsClient（权限面）+ share.api（iTwin 成员面）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  imodelsGet: vi.fn(),
  listUserPermissions: vi.fn(),
  grantPermission: vi.fn(),
  revokePermission: vi.fn(),
  listUserMembers: vi.fn(),
  listRoles: vi.fn(),
  addUserMember: vi.fn(),
  updateUserMember: vi.fn(),
  removeUserMember: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    get = mocks.imodelsGet;
    listUserPermissions = mocks.listUserPermissions;
    grantPermission = mocks.grantPermission;
    revokePermission = mocks.revokePermission;
  },
}));

vi.mock('../internal/share.api.js', () => ({
  listUserMembers: mocks.listUserMembers,
  listRoles: mocks.listRoles,
  addUserMember: mocks.addUserMember,
  updateUserMember: mocks.updateUserMember,
  removeUserMember: mocks.removeUserMember,
}));

import type { DocumentSummary } from '../types.js';
import { ShareDocumentDialog } from '../components/ShareDocumentDialog.js';

// jsdom 未实现 Element.scrollIntoView；iTwinUI Tabs 在切页时调用
// （全局 setup 只补了 scrollTo，分享页签单测需要此补形）。
if (typeof HTMLElement.prototype.scrollIntoView !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: () => {},
    writable: true,
  });
}

const B_DOC: DocumentSummary = {
  id: 'im-1',
  name: 'B 文档',
  owner: '',
  role: '',
  createdAt: '2026-10-01T08:00:00.0000000+00:00',
  modifiedAt: '2026-10-02T08:00:00.0000000+00:00',
  mode: 'B',
  projectId: 'itwin-1',
};

const A_DOC: DocumentSummary = {
  ...B_DOC,
  id: 'a-doc-1',
  name: 'A 文档',
  mode: 'A',
  projectId: 'a-doc-1',
};

const MEMBERS = [
  { id: 'member-1', email: 'alice@example.com', roles: [] },
  { id: 'member-2', email: 'bob@example.com', roles: [] },
];

const PERMISSIONS = [
  {
    id: 'perm-1',
    iModelId: 'im-1',
    userId: 'member-1',
    role: 'user',
    briefcasesLevel: 'read',
    changesetsLevel: 'read',
    versionsLevel: 'read',
    locksLevel: 'read',
  },
];

function renderDialog(props: {
  doc: DocumentSummary | null;
  imodelId?: string;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShareDocumentDialog
        doc={props.doc}
        imodelId={props.imodelId}
        isOpen
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.imodelsGet.mockResolvedValue({ id: 'im-1', displayName: 'B 文档', isSecured: true });
  mocks.listUserPermissions.mockResolvedValue(PERMISSIONS);
  mocks.grantPermission.mockResolvedValue(undefined);
  mocks.revokePermission.mockResolvedValue(undefined);
  mocks.listUserMembers.mockResolvedValue(MEMBERS);
  mocks.listRoles.mockResolvedValue([]);
  mocks.addUserMember.mockResolvedValue({ id: 'member-new', email: 'carol@example.com', roles: [] });
  mocks.removeUserMember.mockResolvedValue(undefined);
});

describe('ShareDocumentDialog B 文档（iModel 权限通道）', () => {
  it('读 isSecured + 权限用户；按项目成员身份展示；无「分享链接」页签', async () => {
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    expect(await screen.findByText('此文档已启用访问控制，仅下列用户可访问。')).toBeDefined();
    await waitFor(() => expect(mocks.listUserPermissions).toHaveBeenCalledWith('im-1'));
    expect(await screen.findByText('alice@example.com')).toBeDefined();
    // 「只读」同时出现在权限行与邀请页签的等级选项——至少一处在场。
    expect(screen.getAllByText('只读').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('tab', { name: '成员 (1)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '邀请成员' })).toBeDefined();
    expect(screen.queryByRole('tab', { name: '分享链接' })).toBeNull();
  });

  it('未启用访问控制：如实提示（不声称当前授权生效）', async () => {
    mocks.imodelsGet.mockResolvedValue({ id: 'im-1', displayName: 'B 文档', isSecured: false });
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    expect(
      await screen.findByText('此文档未启用访问控制：项目成员均可访问，下列授权在启用后生效。'),
    ).toBeDefined();
  });

  it('撤销：DELETE iModel 权限（不调用 iTwin 成员移除）', async () => {
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    await user.click(await screen.findByRole('button', { name: '撤销授权' }));
    const dialog = await screen.findByRole('dialog', { name: '撤销文档授权' });
    await user.click(within(dialog).getByRole('button', { name: '撤销' }));

    await waitFor(() => expect(mocks.revokePermission).toHaveBeenCalledWith('im-1', 'member-1'));
    expect(mocks.removeUserMember).not.toHaveBeenCalled();
  });

  it('授权给项目成员：POST grant，Read/Manage → 四维 level 同步', async () => {
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    await user.click(await screen.findByRole('tab', { name: '邀请成员' }));

    // iTwinUI 把 aria-label 挂在外层 wrapper——原生 select 在内层。
    const memberSelect = await screen.findByLabelText('选择项目成员');
    await user.selectOptions(within(memberSelect).getByRole('combobox'), 'member-2');
    const levelSelect = screen.getByLabelText('文档权限');
    await user.selectOptions(within(levelSelect).getByRole('combobox'), 'manage');
    await user.click(screen.getByRole('button', { name: '授权' }));

    await waitFor(() =>
      expect(mocks.grantPermission).toHaveBeenCalledWith('im-1', {
        userId: 'member-2',
        role: 'admin',
        briefcasesLevel: 'manage',
        changesetsLevel: 'manage',
        versionsLevel: 'manage',
        locksLevel: 'manage',
      }),
    );
  });

  it('邮箱邀请：先 addUserMember(项目) 再加入 iModel 授权', async () => {
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    await user.click(await screen.findByRole('tab', { name: '邀请成员' }));

    await user.type(await screen.findByLabelText('邮箱地址'), 'carol@example.com');
    await user.click(screen.getByRole('button', { name: '添加并授权' }));

    await waitFor(() =>
      expect(mocks.addUserMember).toHaveBeenCalledWith('itwin-1', {
        email: 'carol@example.com',
        roleIds: [],
      }),
    );
    await waitFor(() =>
      expect(mocks.grantPermission).toHaveBeenCalledWith('im-1', {
        userId: 'member-new',
        role: 'user',
        briefcasesLevel: 'read',
        changesetsLevel: 'read',
        versionsLevel: 'read',
        locksLevel: 'read',
      }),
    );
  });
});

describe('ShareDocumentDialog A / B 项目容器（iTwin 通道不变）', () => {
  it('A 旧文档：不触发 iModel 权限查询，仍为三页签 iTwin 成员通道', async () => {
    renderDialog({ doc: A_DOC });
    expect(await screen.findByRole('tab', { name: '成员 (2)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '分享链接' })).toBeDefined();
    await waitFor(() => expect(mocks.listUserMembers).toHaveBeenCalledWith('a-doc-1'));
    expect(mocks.listUserPermissions).not.toHaveBeenCalled();
    expect(mocks.imodelsGet).not.toHaveBeenCalled();
  });

  it('B 项目容器（无 imodelId）：分享仍走 iTwin 成员通道，不误用项目 id 调 iModel 权限', async () => {
    renderDialog({ doc: { ...B_DOC, id: 'itwin-project', projectId: 'itwin-project' } });
    expect(await screen.findByRole('tab', { name: '成员 (2)' })).toBeDefined();
    await waitFor(() => expect(mocks.listUserMembers).toHaveBeenCalledWith('itwin-project'));
    expect(mocks.listUserPermissions).not.toHaveBeenCalled();
  });
});
