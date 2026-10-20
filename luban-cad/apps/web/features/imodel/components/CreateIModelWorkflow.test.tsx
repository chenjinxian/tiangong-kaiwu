/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * CreateIModelWorkflow（RW4-P3-T3-3）：itwin-ui Dialog + Stepper 编排。
 * 钉住：表单 e2e 锚点（placeholder 输入模型名称/创建按钮）、创建后进入 Stepper
 * 处理态（5 步）、documents ns 中英渲染。
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../../shared/i18n/index.js';

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn(() => new Promise(() => undefined)),
}));

vi.mock('../hooks/useIModelsQuery.js', () => ({
  useCreateIModelMutation: () => ({ mutateAsync: createMock, isPending: false }),
  useCreateIModelWithBaselineMutation: () => ({ mutateAsync: createMock, isPending: false }),
}));

import { CreateIModelWorkflow } from './CreateIModelWorkflow.js';

function renderWorkflow(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <CreateIModelWorkflow iTwinId="twin-1" isOpen onClose={() => undefined} />
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN');
});

describe('CreateIModelWorkflow', () => {
  it('renders the form with e2e anchors (输入模型名称 / 创建)', async () => {
    renderWorkflow();

    expect(await screen.findByRole('dialog', { name: '创建 iModel' })).toBeTruthy();
    expect(screen.getByPlaceholderText('输入模型名称')).toBeTruthy();
    expect(screen.getByRole('button', { name: '创建', exact: true })).toBeTruthy();
    expect(document.querySelector('.dialog-container')).not.toBeNull();
  });

  it('switches to the itwin-ui Stepper while creating', async () => {
    renderWorkflow();

    fireEvent.change(await screen.findByPlaceholderText('输入模型名称'), {
      target: { value: 'Model A' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建', exact: true }));

    // DEV 构建类名带前缀哈希（_iui3220-stepper），用子串选择器
    await waitFor(() => expect(document.querySelector('[class*="stepper"]')).not.toBeNull());
    // 5 个处理步骤（验证/创建/初始化/上传/完成；当前步标题+Stepper 标签各一处）
    for (const label of ['验证中', '创建中', '初始化中', '上传中', '完成中']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('button', { name: '取消创建' })).toBeTruthy();
  });

  it('renders English copy in en locale', async () => {
    await i18n.changeLanguage('en');
    renderWorkflow();

    expect(await screen.findByRole('dialog', { name: 'Create iModel' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter model name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create', exact: true })).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });
});
