/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * RW4-P2 评审 Important#2 收口：对话框文案走 documents 命名空间，
 * 断言**渲染后的可见文案**（英文态）而非仅键存在。
 * iTwinUI Dialog 标题以 aria-label 承载（内层 heading 为空，见 e2e 既有注释）——
 * 标题用 role+name 断言，标签/占位/按钮用可见文本。
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

    expect(await screen.findByRole('dialog', { name: 'New iTwin Project' })).toBeTruthy();
    expect(await screen.findByText('Project Name')).toBeTruthy();
    expect(await screen.findByPlaceholderText('Enter project name')).toBeTruthy();
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

    // 3.22 的 Dialog.TitleBar 把标题只写进 wrapper 的 title 属性（h2 为空文本）——按属性断言
    const titleBar = document.querySelector('[class*="dialog-title-bar"]');
    expect(titleBar?.getAttribute('title')).toBe('Edit Project');
    expect(await screen.findByText('Project Name')).toBeTruthy();
    expect(await screen.findByText('Save')).toBeTruthy();
    expect(await screen.findByText('Cancel')).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });
});
