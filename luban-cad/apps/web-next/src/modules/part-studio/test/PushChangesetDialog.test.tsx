// src/modules/part-studio/test/PushChangesetDialog.test.tsx
//
// M4 Task 7（brief Step 1）：推送对话框（旧应用 PushChangesetDialog 形态移植，
// 模态 iTwinUI Dialog 壳）——
//  1) 描述必填：空/纯空白确认钮禁用（不发起推送）；输入后解锁；
//  2) 确认：回传**去首尾空白**的描述（onConfirm Promise 通道——宿主接
//     connection.pushChanges）；
//  3) 成功：IModelApp.notifications 成功 toast（标准管道，与 FeatureDialog
//     提交 toast 同款）+ onClose 收合 + 输入复位；
//  4) 失败：就地错误行（消息含原因），对话框不收合、输入保留可重试；
//  5) 提交中防重入：确认钮禁用 + 标签切「推送中…」；
//  6) 取消：直接 onClose，不调 onConfirm。
//
// 定位：组件行为验收层；@itwin/core-frontend 钉形 mock（notifications 可观测），
// 真实 i18n 参与（setup.ts 全局词库 zh-CN 基线）。

import type React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const coreFrontendMocks = vi.hoisted(() => ({
  outputMessage: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  // 成功 toast 构造 NotifyMessageDetails——钉形替身（briefMessage 可观测）。
  NotifyMessageDetails: class {
    priority: number;
    briefMessage: string;
    constructor(priority: number, briefMessage: string) {
      this.priority = priority;
      this.briefMessage = briefMessage;
    }
  },
  OutputMessagePriority: { None: 0, Success: 1, Error: 10, Warning: 11, Info: 12 },
  IModelApp: {
    notifications: { outputMessage: coreFrontendMocks.outputMessage },
    tools: { run: vi.fn() },
  },
}));

import { PushChangesetDialog } from '../dialogs/PushChangesetDialog.js';

/** 手动闸门：promise 的 resolve/reject 由用例掌控（提交在途/失败路径）。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderDialog(props: Partial<Parameters<typeof PushChangesetDialog>[0]> = {}): {
  onConfirm: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onConfirm = vi.fn<(description: string) => Promise<void>>().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<PushChangesetDialog isOpen onClose={onClose} onConfirm={onConfirm} {...props} />);
  return { onConfirm, onClose };
}

/** 对话框句柄（role=dialog，可访问名=标题「保存版本」）。 */
function getDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: '保存版本' });
}

/** iTwinUI 禁用口径：button[disabled] 或 aria-disabled（美观禁用）。 */
function isDisabled(button: HTMLElement): boolean {
  return (button as HTMLButtonElement).disabled === true
    || button.getAttribute('aria-disabled') === 'true';
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PushChangesetDialog（M4 Task 7）', () => {
  it('描述必填：空/纯空白确认禁用（不发起推送）', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    const dialog = getDialog();
    const input = within(dialog).getByLabelText(/版本描述/);
    const confirm = within(dialog).getByRole('button', { name: '推送' });

    expect(isDisabled(confirm)).toBe(true);

    // 纯空白仍必填（trim 口径）。
    await user.type(input, '   ');
    expect(isDisabled(confirm)).toBe(true);
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('确认：回传去首尾空白的描述（onConfirm Promise 通道）', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    const dialog = getDialog();
    const input = within(dialog).getByLabelText(/版本描述/);

    await user.type(input, '  加圆角特征  ');
    await user.click(within(dialog).getByRole('button', { name: '推送' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('加圆角特征');
  });

  it('成功：成功 toast（notifications 管道）+ onClose 收合', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();
    const dialog = getDialog();
    const input = within(dialog).getByLabelText(/版本描述/);

    await user.type(input, '拉伸基体');
    await user.click(within(dialog).getByRole('button', { name: '推送' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(coreFrontendMocks.outputMessage).toHaveBeenCalledTimes(1);
    const details = coreFrontendMocks.outputMessage.mock.calls[0]?.[0] as { briefMessage: string };
    expect(details.briefMessage).toContain('已推送');
  });

  it('失败：就地错误行含原因，对话框不收合、输入保留可重试', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    // 第一次调用在途（由用例 reject），第二次修复后成功。
    const onConfirm = vi.fn<(description: string) => Promise<void>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<PushChangesetDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
    const dialog = getDialog();
    const input = within(dialog).getByLabelText(/版本描述/);

    await user.type(input, '第一次提交');
    await user.click(within(dialog).getByRole('button', { name: '推送' }));
    await within(dialog).findByRole('button', { name: '推送中…' });
    pending.reject(new Error('hub 拒绝'));

    // 失败就地：错误行可见 + 不收合 + 输入保留。
    expect(await within(dialog).findByText(/推送失败/)).toBeDefined();
    expect(within(dialog).getByText(/hub 拒绝/)).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('第一次提交');
    expect(coreFrontendMocks.outputMessage).not.toHaveBeenCalled();

    // 修复后可重试：第二次成功收合。
    await user.click(within(dialog).getByRole('button', { name: '推送' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('提交中防重入：确认钮禁用 + 标签切「推送中…」；成功后 onClose 收合', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const onConfirm = vi.fn<(description: string) => Promise<void>>().mockReturnValueOnce(pending.promise);
    const onClose = vi.fn();
    render(<PushChangesetDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
    const dialog = getDialog();
    const input = within(dialog).getByLabelText(/版本描述/);

    await user.type(input, '在途提交');
    const confirm = within(dialog).getByRole('button', { name: '推送' });
    await user.click(confirm);

    const busy = await within(dialog).findByRole('button', { name: '推送中…' });
    expect(isDisabled(busy)).toBe(true);

    pending.resolve(undefined);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('取消：直接 onClose，不调 onConfirm', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    await user.click(within(getDialog()).getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
