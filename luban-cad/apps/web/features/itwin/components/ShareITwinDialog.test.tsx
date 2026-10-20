/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * ShareITwinDialog（RW4-P3-T3-2）：S3 access-control 客户端消费契约测试。
 * 先写测试后实现——钉住「真数据面」：
 * - listUserMembers/listRoles 驱动成员列表与角色下拉（displayName 渲染）；
 * - 邀请走 addUserMember{email, roleIds}（roleIds 取角色下拉当前值）；
 * - 改角色走 updateUserMember（PATCH roleIds 异形，返回值不参与渲染）；
 * - 移除走 removeUserMember(member.id)（确认 Dialog 后才调用）；
 * - 链接页 = location.origin + /documents/:iTwinId。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import i18n from '../../../shared/i18n/index.js';

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock('../../../shared/services/accessControl/client.js', () => ({
  listUserMembers: vi.fn(),
  listRoles: vi.fn(),
  addUserMember: vi.fn(),
  updateUserMember: vi.fn(),
  removeUserMember: vi.fn(),
}));

vi.mock('../../../shared/hooks/useAppToast.js', () => ({
  useAppToast: () => ({ showToast: showToastMock }),
}));

import {
  addUserMember,
  listRoles,
  listUserMembers,
  removeUserMember,
  updateUserMember,
} from '../../../shared/services/accessControl/client.js';
import { ShareITwinDialog } from './ShareITwinDialog.js';

const mockedListMembers = vi.mocked(listUserMembers);
const mockedListRoles = vi.mocked(listRoles);
const mockedAddMember = vi.mocked(addUserMember);
const mockedUpdateMember = vi.mocked(updateUserMember);
const mockedRemoveMember = vi.mocked(removeUserMember);

const ITWIN = { id: 'twin-1', displayName: 'Demo Project' } as never;
const ROLES = [
  { id: 'r-admin', displayName: 'Admin' },
  { id: 'r-viewer', displayName: 'Viewer' },
];
const MEMBER_UUID = '11111111-1111-4111-8111-111111111111';
const MEMBERS = [
  // hub 成员行 PK 为 UUID 时改角色/移除可用
  { id: MEMBER_UUID, email: 'a@b.c', roles: [{ id: 'r-admin', displayName: 'Admin' }] },
];

function renderDialog(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ShareITwinDialog iTwin={ITWIN} isOpen onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('zh-CN');
  mockedListMembers.mockResolvedValue(MEMBERS);
  mockedListRoles.mockResolvedValue(ROLES);
});

describe('ShareITwinDialog（真数据）', () => {
  it('成员页渲染 listUserMembers 的 email + 角色 displayName', async () => {
    renderDialog();

    expect(await screen.findByText('a@b.c')).toBeTruthy();
    expect(mockedListMembers).toHaveBeenCalledWith('twin-1');
    expect(mockedListRoles).toHaveBeenCalledWith('twin-1');
    // 角色下拉（成员行）当前值=成员角色 id；选项来自 listRoles displayName
    const roleSelect = document.querySelector('.share-member select') as HTMLSelectElement;
    expect(roleSelect).not.toBeNull();
    expect(roleSelect.value).toBe('r-admin');
    expect(Array.from(roleSelect.options).map((o) => o.textContent)).toContain('Admin');
  });

  it('邀请提交 addUserMember{email, roleIds}（roleId 取邀请页角色下拉）', async () => {
    mockedListMembers.mockResolvedValueOnce([]).mockResolvedValue([
      ...MEMBERS,
      { id: 'm-2', email: 'invite@x.com', roles: [{ id: 'r-viewer', displayName: 'Viewer' }] },
    ]);
    mockedAddMember.mockResolvedValue({
      id: 'm-2',
      email: 'invite@x.com',
      roles: [],
    });

    renderDialog();
    expect(await screen.findByText('暂无成员')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '邀请成员' }));
    fireEvent.change(screen.getByPlaceholderText('colleague@company.com'), {
      target: { value: 'invite@x.com' },
    });
    fireEvent.change(screen.getByLabelText('权限'), { target: { value: 'r-viewer' } });
    fireEvent.click(screen.getByRole('button', { name: '添加成员' }));

    await waitFor(() =>
      expect(mockedAddMember).toHaveBeenCalledWith('twin-1', {
        email: 'invite@x.com',
        roleIds: ['r-viewer'],
      }),
    );
    // 成功后切回成员页并 invalidate → 新成员行出现
    expect(await screen.findByText('invite@x.com')).toBeTruthy();
  });

  it('空 roles 时邀请仍可提交（roleIds=[]，不渲染角色下拉）', async () => {
    mockedListRoles.mockResolvedValue([]);
    mockedListMembers.mockResolvedValue([]);
    mockedAddMember.mockResolvedValue({ id: 'm-2', email: 'x@y.z', roles: [] });

    renderDialog();
    await screen.findByText('暂无成员');
    fireEvent.click(screen.getByRole('tab', { name: '邀请成员' }));
    expect(screen.getByText(/暂无可分配角色/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('colleague@company.com'), {
      target: { value: 'x@y.z' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加成员' }));

    await waitFor(() =>
      expect(mockedAddMember).toHaveBeenCalledWith('twin-1', { email: 'x@y.z', roleIds: [] }),
    );
  });

  it('改角色提交 updateUserMember(roleIds 数组)', async () => {
    mockedUpdateMember.mockResolvedValue({
      id: 'm-1',
      iTwinId: 'twin-1',
      userId: 'u-1',
      roleIds: ['r-viewer'],
    });

    renderDialog();
    await screen.findByText('a@b.c');

    const roleSelect = document.querySelector('.share-member select') as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'r-viewer' } });

    await waitFor(() =>
      expect(mockedUpdateMember).toHaveBeenCalledWith('twin-1', MEMBER_UUID, { roleIds: ['r-viewer'] }),
    );
    expect(showToastMock).toHaveBeenCalledWith('角色已更新', 'success');
  });

  it('移除需确认 Dialog，确认后调用 removeUserMember(member.id)', async () => {
    mockedRemoveMember.mockResolvedValue();

    renderDialog();
    await screen.findByText('a@b.c');

    fireEvent.click(screen.getByRole('button', { name: '移除成员' }));
    const confirm = screen.getByRole('dialog', { name: '移除成员' });
    expect(within(confirm).getByText(/a@b\.c/)).toBeTruthy();
    expect(mockedRemoveMember).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole('button', { name: '移除', exact: true }));

    await waitFor(() => expect(mockedRemoveMember).toHaveBeenCalledWith('twin-1', MEMBER_UUID));
    expect(showToastMock).toHaveBeenCalledWith('成员已移除', 'success');
  });

  it('非 UUID 成员 id（现 hub 形态）：改角色/移除禁用并给出诚实说明', async () => {
    mockedListMembers.mockResolvedValue([
      { id: 'invited@x.com', email: 'invited@x.com', roles: [] },
    ]);

    renderDialog();
    await screen.findByText('invited@x.com');

    const roleSelect = document.querySelector('.share-member select') as HTMLSelectElement;
    expect(roleSelect.disabled).toBe(true);
    // iTwinUI 用 aria-disabled（非原生 disabled 属性）
    expect(screen.getByRole('button', { name: '移除成员' }).getAttribute('aria-disabled')).toBe('true');
    expect(
      screen.getByText(/暂不支持修改或移除该成员/),
    ).toBeTruthy();
  });

  it('链接页 = origin + /documents/:id，复制按钮写剪贴板', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderDialog();
    await screen.findByText('a@b.c');
    fireEvent.click(screen.getByRole('tab', { name: '分享链接' }));

    const expected = `${window.location.origin}/documents/twin-1`;
    expect(screen.getByDisplayValue(expected)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '复制链接' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    expect(await screen.findByRole('button', { name: '已复制' })).toBeTruthy();
  });
});
