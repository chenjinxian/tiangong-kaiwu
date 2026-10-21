/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * RW4-P2 评审 Important#2 收口：对话框文案走 documents 命名空间，
 * 断言**渲染后的可见文案**（英文态）而非仅键存在。
 * 3.22 的标题需用 `titleText`（渲染为可见 h2）；Dialog.Main 的 `title` 提供
 * role=dialog 的 accessible name。两者都断言，标签/占位/按钮用可见文本。
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../../shared/i18n/index.js';

vi.mock('../hooks/useITwinsQuery.js', () => ({
  ITwinSubClass: { Project: 'Project' },
  useITwinMutations: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateITwinMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CreateITwinDialog } from './CreateITwinDialog.js';
import { EditITwinDialog } from './EditITwinDialog.js';

describe('iTwin 对话框文案（documents ns）', () => {
  it('创建对话框英文态渲染英文标题/标签/占位/按钮', async () => {
    await i18n.changeLanguage('en');
    render(<CreateITwinDialog isOpen onClose={() => undefined} />);

    // Dialog.Main title → role=dialog 名称；titleText → 可见 heading
    expect(await screen.findByRole('dialog', { name: 'New Document' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'New Document' })).toBeTruthy();
    expect(await screen.findByText('Document name')).toBeTruthy();
    expect(await screen.findByPlaceholderText('Enter a document name')).toBeTruthy();
    expect(await screen.findByText('Create')).toBeTruthy();
    expect(await screen.findByText('Cancel')).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });

  it('编辑对话框英文态渲染英文标题/标签/按钮', async () => {
    await i18n.changeLanguage('en');
    render(
      <EditITwinDialog
        isOpen
        onClose={() => undefined}
        iTwin={{ id: 'twin-1', displayName: 'Demo', class: 'Project', subclass: 'Project', status: 'Active', createdDateTime: '', modifiedDateTime: '' } as never}
      />,
    );

    // Edit 已补 Dialog.Main/Backdrop 语义 + title（dialog 名称）+ titleText（可见 heading）
    expect(await screen.findByRole('dialog', { name: 'Edit Document' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Edit Document' })).toBeTruthy();
    expect(await screen.findByText('Document name')).toBeTruthy();
    expect(await screen.findByText('Save')).toBeTruthy();
    expect(await screen.findByText('Cancel')).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });
});
