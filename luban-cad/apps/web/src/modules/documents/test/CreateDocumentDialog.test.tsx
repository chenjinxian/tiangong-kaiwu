// src/modules/documents/test/CreateDocumentDialog.test.tsx
//
// ADR-0001 P0 终审修复（C1）：创建文档载荷滚动升级契约的聚焦单测——
// 新 web 只发 `subClass:'Project'`，**不得**发送 `class`（服务端从 subClass
// 派生 Endeavor）。与 DocumentsPage.test 的页面级断言互为冗余：本文件
// 直接驱动对话框组件，载荷形状以 `toEqual` 全量钉死（多出 class 即红）。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('@clients/itwins/ItwinsClient.js', () => ({
  ItwinsClient: class {
    create = mocks.create;
  },
}));

import { CreateDocumentDialog } from '../components/CreateDocumentDialog.js';

function renderDialog(props: { onCreated?: () => void; onClose?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateDocumentDialog
        isOpen
        onClose={props.onClose ?? (() => {})}
        onCreated={props.onCreated ?? (() => {})}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockResolvedValue({ id: 'itwin-new', displayName: '新文档' });
});

describe('CreateDocumentDialog 创建载荷（subClass-only）', () => {
  it('提交仅含 displayName + subClass：class 必须缺席（hub 派生 Endeavor）', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderDialog({ onCreated });

    await user.type(await screen.findByLabelText(/文档名称/), '新文档');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({ displayName: '新文档', subClass: 'Project' });
    const payload = mocks.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('class');
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('编号非空时透传 number，仍不带 class', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(await screen.findByLabelText(/文档名称/), '新文档');
    await user.type(screen.getByLabelText(/文档编号/), 'DOC-001');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({
      displayName: '新文档',
      subClass: 'Project',
      number: 'DOC-001',
    });
    const payload = mocks.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('class');
  });
});
