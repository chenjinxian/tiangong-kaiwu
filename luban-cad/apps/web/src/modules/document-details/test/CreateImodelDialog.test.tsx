// src/modules/document-details/test/CreateImodelDialog.test.tsx
//
// P2.3 fix round 1（F3/F9）：非等待创建 + 初始化终态/超时的重试语义。
// - createPending 只 POST 一次；重试只轮询同一 id（绝不重复建文档）；
// - missingFiles/initializationFailed → 「再次检查」（不暗示可修复）；
// - timeout → 「重试」；两种终态都提示不会重建/不会自动删除；
// - 成功后 onCreated 仅收到 initialized 文档。

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPending: vi.fn(),
  waitForInitialized: vi.fn(),
}));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    createPending = mocks.createPending;
  },
}));

vi.mock('../hooks/useImodels.js', () => ({
  waitForImodelInitialized: mocks.waitForInitialized,
}));

import { CreateImodelDialog } from '../components/CreateImodelDialog.js';
import type { ImodelSummary } from '../types.js';

const SUMMARY: ImodelSummary = {
  id: 'im-1',
  name: '新文档',
  description: '',
  state: 'initialized',
  initialized: true,
  isSecured: false,
  createdAt: '2026-10-30T00:00:00.0000000+00:00',
  updatedAt: null,
};

function renderDialog(props: {
  onCreated?: (imodel: ImodelSummary) => void;
  onClose?: () => void;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateImodelDialog
        iTwinId="itwin-1"
        isOpen
        onClose={props.onClose ?? (() => {})}
        onCreated={props.onCreated ?? (() => {})}
      />
    </QueryClientProvider>,
  );
}

async function submit(name = '新文档'): Promise<void> {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/iModel 名称/), name);
  await user.click(screen.getByRole('button', { name: '创建' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPending.mockResolvedValue({ id: 'im-1' });
});

describe('CreateImodelDialog 初始化失败补偿（P2.3 F3/F9）', () => {
  it('missingFiles：显示「再次检查」+ 不重建/不删除提示；重试只轮询同一 id', async () => {
    mocks.waitForInitialized.mockResolvedValue({
      status: 'failed',
      imodel: { ...SUMMARY, state: 'missingFiles', initialized: false },
    });
    const user = userEvent.setup();
    renderDialog();
    await submit();

    expect(await screen.findByText('文档文件缺失')).toBeDefined();
    expect(screen.getByText(/不会重建文档，也不会自动删除/)).toBeDefined();
    expect(mocks.createPending).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '再次检查' }));
    await waitFor(() => expect(mocks.waitForInitialized).toHaveBeenCalledTimes(2));
    expect(mocks.waitForInitialized).toHaveBeenLastCalledWith('im-1', expect.anything());
    // 重试绝不重复 POST。
    expect(mocks.createPending).toHaveBeenCalledTimes(1);
  });

  it('timeout：显示「重试」+ 文档保留提示；重试仍不重复 POST', async () => {
    mocks.waitForInitialized.mockResolvedValue({ status: 'timeout', imodel: null });
    const user = userEvent.setup();
    renderDialog();
    await submit();

    expect(await screen.findByText('等待初始化超时')).toBeDefined();
    expect(screen.getByText(/不会自动删除/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(mocks.waitForInitialized).toHaveBeenCalledTimes(2));
    expect(mocks.createPending).toHaveBeenCalledTimes(1);
  });

  it('initialized：onCreated 收到 initialized 文档并关闭', async () => {
    mocks.waitForInitialized.mockResolvedValue({ status: 'initialized', imodel: SUMMARY });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onCreated, onClose });
    await submit();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(SUMMARY));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.createPending).toHaveBeenCalledTimes(1);
  });
});
