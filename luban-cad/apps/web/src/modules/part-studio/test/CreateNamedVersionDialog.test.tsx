// src/modules/part-studio/test/CreateNamedVersionDialog.test.tsx
//
// B-model P0 Task 5（brief Step 2）：创建 Named Version 对话框——
//  1) 名称必填（trim 口径）：空名确认钮禁用；填写后提交 name/description
//     （onConfirm Promise 通道——宿主接 useNamedVersionActions）；
//  2) onConfirm 拒绝：就地错误行（含原因）可见，对话框不收合（可重试）。
//
// 定位：组件行为验收层；@itwin/core-frontend 钉形 mock（notifications 可观测），
// 真实 i18n 参与（setup.ts 全局词库 zh-CN 基线）。本仓不挂 jest-dom：禁用
// 判定用 disabled/aria-disabled 双口径（PushChangesetDialog.test 同款）。

import type React from 'react';
import { act, render, screen, within } from '@testing-library/react';
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

import { CreateNamedVersionDialog } from '../dialogs/CreateNamedVersionDialog.js';

/** iTwinUI 禁用口径：button[disabled] 或 aria-disabled（美观禁用）。 */
function isDisabled(button: HTMLElement): boolean {
  return (button as HTMLButtonElement).disabled === true
    || button.getAttribute('aria-disabled') === 'true';
}

/** 手动闸门：promise 的 resolve/reject 由用例掌控（提交在途/迟到拒绝路径）。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CreateNamedVersionDialog', () => {
  it('名称为空时确认禁用；填写后提交 name/description', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <CreateNamedVersionDialog isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    const dialog = screen.getByRole('dialog', { name: '保存版本' });
    const confirm = within(dialog).getByRole('button', { name: '保存' });
    expect(isDisabled(confirm)).toBe(true);

    // 标签含「必填」后缀（嵌套 span），正则匹配同 PushChangesetDialog.test 口径。
    await user.type(within(dialog).getByLabelText(/版本名称/), 'V1');
    await user.type(within(dialog).getByLabelText(/版本描述/), 'first');
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({ name: 'V1', description: 'first' });
  });

  it('onConfirm 拒绝时就地显示错误且不关闭', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    render(
      <CreateNamedVersionDialog isOpen onClose={onClose} onConfirm={onConfirm} />,
    );

    const dialog = screen.getByRole('dialog', { name: '保存版本' });
    await user.type(within(dialog).getByLabelText(/版本名称/), 'V1');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(await within(dialog).findByText(/保存失败/)).toBeDefined();
    expect(within(dialog).getByText(/boom/)).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  // 评审 Important #1（收口）：提交在途不可收合 + 宿主强制收合后的陈旧错误清面。
  it('提交中不可收合（Escape/X/Cancel 受门）；宿主强制收合后的陈旧错误在重开时清除', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const onConfirm = vi.fn().mockReturnValueOnce(pending.promise);
    const onClose = vi.fn();
    const { rerender } = render(
      <CreateNamedVersionDialog isOpen onClose={onClose} onConfirm={onConfirm} />,
    );
    const dialog = screen.getByRole('dialog', { name: '保存版本' });

    // jsdom 可驱动 Escape（iTwinUI DialogMain 的 keyDown 通道）：先证未提交时
    // Escape 会触发 onClose，确认本用例的负向断言不是「本来就不响应」。
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDefined();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();

    await user.type(within(dialog).getByLabelText(/版本名称/), 'V1');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    // 在途：确认钮加载态 + 取消禁用 + 标题栏 X 不渲染（isDismissible=false）。
    await within(dialog).findByRole('button', { name: '保存中…' });
    expect(isDisabled(within(dialog).getByRole('button', { name: '取消' }))).toBe(true);
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();

    // Escape 被 isDismissible=false + handleClose 守卫短路：不收合。
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    // 宿主强制收合（T7-② 断连 effect 直翻 isOpen）→ 收合重置；随后 reject 的
    // catch 才落地（陈旧错误场景）。
    rerender(<CreateNamedVersionDialog isOpen={false} onClose={onClose} onConfirm={onConfirm} />);
    await act(async () => {
      pending.reject(new Error('late failure'));
      await Promise.resolve();
    });

    // 重开：本次未发起提交，不得显示上一次的「保存失败」。
    rerender(<CreateNamedVersionDialog isOpen onClose={onClose} onConfirm={onConfirm} />);
    const reopened = screen.getByRole('dialog', { name: '保存版本' });
    expect(within(reopened).queryByText(/保存失败/)).toBeNull();
    expect(within(reopened).queryByText(/late failure/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
