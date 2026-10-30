// src/modules/documents/test/ShareDocumentDialog.test.tsx
//
// P2.3 分享对话框按模式分流——
//  - A 旧文档 / B 项目容器（无 imodelId）走既有 iTwin 成员/邀请通道；
//    B 项目容器明确标注「项目级（全部文档）」；
//  - B 文档（mode='B' + imodelId）走 iModel 权限通道：
//    读 isSecured + 权限用户；身份/授权一律用 **真实 userId**（不是成员行 id）；
//    未解析账号（邮箱回退）禁止授权并如实提示；
//    secured=false 时 grant/revoke 全部禁用，只提供 iTwin manage 门控的
//    「限制访问」（PATCH isSecured）；secured=true 提供「恢复项目级访问」；
//    不声称链接分享。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  imodelsGet: vi.fn(),
  setSecured: vi.fn(),
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
    setSecured = mocks.setSecured;
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
  { id: 'member-row-1', userId: '42', email: 'alice@example.com', roles: [] },
  { id: 'member-row-2', userId: '43', email: 'bob@example.com', roles: [] },
  {
    id: 'member-row-3',
    userId: 'carol@example.com',
    email: 'carol@example.com',
    roles: [],
  },
];

const PERMISSIONS = [
  {
    id: 'perm-1',
    iModelId: 'im-1',
    userId: '42',
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
  canManageShare?: boolean;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShareDocumentDialog
        doc={props.doc}
        imodelId={props.imodelId}
        canManageShare={props.canManageShare ?? true}
        isOpen
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

async function selectMember(value: string): Promise<void> {
  const wrapper = await screen.findByLabelText('选择项目成员');
  await userEvent.setup().selectOptions(within(wrapper).getByRole('combobox'), value);
}

/** iTwinUI ButtonBase 在客户端用 aria-disabled（不是原生 disabled）。 */
function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.imodelsGet.mockResolvedValue({ id: 'im-1', displayName: 'B 文档', isSecured: true });
  mocks.setSecured.mockResolvedValue(undefined);
  mocks.listUserPermissions.mockResolvedValue(PERMISSIONS);
  mocks.grantPermission.mockResolvedValue(undefined);
  mocks.revokePermission.mockResolvedValue(undefined);
  mocks.listUserMembers.mockResolvedValue(MEMBERS);
  mocks.listRoles.mockResolvedValue([]);
  mocks.addUserMember.mockResolvedValue({
    id: 'member-new',
    userId: '44',
    email: 'dave@example.com',
    roles: [],
  });
  mocks.removeUserMember.mockResolvedValue(undefined);
});

describe('ShareDocumentDialog B 文档（iModel 权限通道）', () => {
  it('secured=true：读 isSecured + 权限用户；按真实 userId 关联身份；无链接页签', async () => {
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    expect(
      await screen.findByText('此文档已启用访问控制：仅下列授权用户可访问（iTwin owner/Admin/Editor 仍可绕过）。'),
    ).toBeDefined();
    await waitFor(() => expect(mocks.listUserPermissions).toHaveBeenCalledWith('im-1'));
    expect(await screen.findByText('alice@example.com')).toBeDefined();
    expect(screen.getAllByText('只读').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('tab', { name: '成员 (1)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '邀请成员' })).toBeDefined();
    expect(screen.queryByRole('tab', { name: '分享链接' })).toBeNull();
  });

  it('secured=false：当前由项目角色控制；grant/revoke/邀请授权全部禁用', async () => {
    mocks.imodelsGet.mockResolvedValue({ id: 'im-1', displayName: 'B 文档', isSecured: false });
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    expect(await screen.findByText('当前由项目角色控制')).toBeDefined();
    // 成员页：撤销授权按钮禁用
    const revoke = await screen.findByRole('button', { name: '撤销授权' });
    expect(isDisabled(revoke)).toBe(true);
    // 邀请页：授权 / 添加并授权禁用
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: '邀请成员' }));
    expect(isDisabled(screen.getByRole('button', { name: '授权' }))).toBe(true);
    expect(isDisabled(screen.getByRole('button', { name: '添加并授权' }))).toBe(true);
  });

  it('secured=false + manage：限制访问 HITL → setSecured(true)', async () => {
    mocks.imodelsGet.mockResolvedValue({ id: 'im-1', displayName: 'B 文档', isSecured: false });
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '限制访问' }));
    const dialog = await screen.findByRole('dialog', { name: '限制文档访问' });
    expect(
      within(dialog).getByText(/未列出的项目成员将失去访问/),
    ).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: '启用访问控制' }));

    await waitFor(() => expect(mocks.setSecured).toHaveBeenCalledWith('im-1', true));
    expect(mocks.grantPermission).not.toHaveBeenCalled();
    expect(mocks.revokePermission).not.toHaveBeenCalled();
  });

  it('secured=true + manage：恢复项目级访问 HITL → setSecured(false)', async () => {
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '恢复项目级访问' }));
    const dialog = await screen.findByRole('dialog', { name: '恢复项目级访问' });
    await user.click(within(dialog).getByRole('button', { name: '恢复项目级访问' }));

    await waitFor(() => expect(mocks.setSecured).toHaveBeenCalledWith('im-1', false));
  });

  it('无 imodels_manage：管理动作禁用 + 如实提示；不显示限制访问', async () => {
    mocks.imodelsGet.mockResolvedValue({ id: 'im-1', displayName: 'B 文档', isSecured: false });
    renderDialog({ doc: B_DOC, imodelId: 'im-1', canManageShare: false });

    expect(await screen.findByText('需要 imodels_manage 权限才能管理文档访问。')).toBeDefined();
    expect(screen.queryByRole('button', { name: '限制访问' })).toBeNull();
    expect(isDisabled(await screen.findByRole('button', { name: '撤销授权' }))).toBe(true);
  });

  it('撤销：DELETE 使用真实 userId（不是成员行 id）', async () => {
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    await user.click(await screen.findByRole('button', { name: '撤销授权' }));
    const dialog = await screen.findByRole('dialog', { name: '撤销文档授权' });
    await user.click(within(dialog).getByRole('button', { name: '撤销' }));

    await waitFor(() => expect(mocks.revokePermission).toHaveBeenCalledWith('im-1', '42'));
    expect(mocks.removeUserMember).not.toHaveBeenCalled();
  });

  it('授权给项目成员：grant 使用真实 userId（Read/Manage → 四维 level 同步）', async () => {
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    await user.click(await screen.findByRole('tab', { name: '邀请成员' }));

    await selectMember('member-row-2');
    const levelSelect = screen.getByLabelText('文档权限');
    await user.selectOptions(within(levelSelect).getByRole('combobox'), 'manage');
    await user.click(screen.getByRole('button', { name: '授权' }));

    await waitFor(() =>
      expect(mocks.grantPermission).toHaveBeenCalledWith('im-1', {
        userId: '43',
        role: 'admin',
        briefcasesLevel: 'manage',
        changesetsLevel: 'manage',
        versionsLevel: 'manage',
        locksLevel: 'manage',
      }),
    );
  });

  it('未解析成员（email 回退 userId）：禁止授权并如实提示，不发 grant', async () => {
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    await user.click(await screen.findByRole('tab', { name: '邀请成员' }));

    await selectMember('member-row-3');
    expect(await screen.findByText('账号未解析（待注册），无法授予文档权限。')).toBeDefined();
    expect(isDisabled(screen.getByRole('button', { name: '授权' }))).toBe(true);
    expect(mocks.grantPermission).not.toHaveBeenCalled();
  });

  it('邮箱邀请（已注册）：先 addUserMember(项目) 再用真实 userId 授权', async () => {
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    await user.click(await screen.findByRole('tab', { name: '邀请成员' }));

    await user.type(await screen.findByLabelText('邮箱地址'), 'dave@example.com');
    await user.click(screen.getByRole('button', { name: '添加并授权' }));

    await waitFor(() =>
      expect(mocks.addUserMember).toHaveBeenCalledWith('itwin-1', {
        email: 'dave@example.com',
        roleIds: [],
      }),
    );
    await waitFor(() =>
      expect(mocks.grantPermission).toHaveBeenCalledWith('im-1', {
        userId: '44',
        role: 'user',
        briefcasesLevel: 'read',
        changesetsLevel: 'read',
        versionsLevel: 'read',
        locksLevel: 'read',
      }),
    );
  });

  it('邮箱邀请（未注册）：加项目成员但绝不发 grant，不显示成功', async () => {
    mocks.addUserMember.mockResolvedValue({
      id: 'member-new',
      userId: 'new@example.com',
      email: 'new@example.com',
      roles: [],
    });
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    await user.click(await screen.findByRole('tab', { name: '邀请成员' }));

    await user.type(await screen.findByLabelText('邮箱地址'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: '添加并授权' }));

    await waitFor(() =>
      expect(mocks.addUserMember).toHaveBeenCalledWith('itwin-1', {
        email: 'new@example.com',
        roleIds: [],
      }),
    );
    expect(mocks.grantPermission).not.toHaveBeenCalled();
    expect(
      await screen.findByText('已加入项目成员，但该邮箱尚未注册，无法授予文档权限：new@example.com'),
    ).toBeDefined();
    expect(screen.queryByText('已授权')).toBeNull();
    expect(screen.queryByText(/已添加成员并授予/)).toBeNull();
  });

  it('imodel 状态读取失败：可见错误 + 重试；管理动作禁用', async () => {
    mocks.imodelsGet.mockRejectedValue(new Error('state boom'));
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });

    expect(await screen.findByText('文档访问状态加载失败')).toBeDefined();
    expect(screen.getAllByRole('button', { name: '重试' }).length).toBeGreaterThanOrEqual(1);
    expect(isDisabled(await screen.findByRole('button', { name: '撤销授权' }))).toBe(true);
  });

  it('members 查询失败：邀请页可见错误 + 重试（不伪装成空列表）', async () => {
    mocks.listUserMembers.mockRejectedValue(new Error('members boom'));
    const user = userEvent.setup();
    renderDialog({ doc: B_DOC, imodelId: 'im-1' });
    await user.click(await screen.findByRole('tab', { name: '邀请成员' }));

    expect(await screen.findByText('项目成员加载失败')).toBeDefined();
  });
});

describe('ShareDocumentDialog A / B 项目容器（iTwin 通道不变）', () => {
  it('A 旧文档：不触发 iModel 权限查询，仍为三页签 iTwin 成员通道', async () => {
    renderDialog({ doc: A_DOC });
    expect(await screen.findByRole('tab', { name: '成员 (3)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: '分享链接' })).toBeDefined();
    await waitFor(() => expect(mocks.listUserMembers).toHaveBeenCalledWith('a-doc-1'));
    expect(mocks.listUserPermissions).not.toHaveBeenCalled();
    expect(mocks.imodelsGet).not.toHaveBeenCalled();
    expect(screen.queryByText('项目级分享（全部文档）')).toBeNull();
  });

  it('B 项目容器（无 imodelId）：iTwin 项目级分享并明确标注「项目级（全部文档）」', async () => {
    renderDialog({ doc: { ...B_DOC, id: 'itwin-project', projectId: 'itwin-project' } });
    expect(await screen.findByText('项目级分享（全部文档）')).toBeDefined();
    expect(await screen.findByRole('tab', { name: '成员 (3)' })).toBeDefined();
    await waitFor(() => expect(mocks.listUserMembers).toHaveBeenCalledWith('itwin-project'));
    expect(mocks.listUserPermissions).not.toHaveBeenCalled();
  });
});
