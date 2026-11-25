import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmMock = vi.fn();
vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: { confirmEmail: (...a: unknown[]) => confirmMock(...a) },
}));

import { ConfirmEmailRoute } from '../ConfirmEmailRoute.js';

function renderAt(entry: string, newEmail = false): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ConfirmEmailRoute newEmail={newEmail} />
    </MemoryRouter>,
  );
}

describe('ConfirmEmailRoute', () => {
  beforeEach(() => { confirmMock.mockReset(); });

  it('带 hash：调用 Hub 确认接口并显示成功', async () => {
    confirmMock.mockResolvedValue(undefined);
    renderAt('/confirm-email?hash=abc');
    expect(await screen.findByTestId('confirm-success')).toBeDefined();
    expect(confirmMock).toHaveBeenCalledWith('abc', { newEmail: false });
  });

  it('换邮箱路由：调用 new-email 确认形状', async () => {
    confirmMock.mockResolvedValue(undefined);
    renderAt('/confirm-new-email?hash=xyz', true);
    expect(await screen.findByTestId('confirm-success')).toBeDefined();
    expect(confirmMock).toHaveBeenCalledWith('xyz', { newEmail: true });
  });

  it('缺 hash：不请求并提示重新打开邮件链接', () => {
    renderAt('/confirm-email');
    expect(confirmMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-error')).toBeDefined();
  });

  it('确认失败：显示可重试错误', async () => {
    confirmMock.mockRejectedValue({ status: 422 });
    renderAt('/confirm-email?hash=expired');
    expect(await screen.findByTestId('confirm-error')).toBeDefined();
    expect(confirmMock).toHaveBeenCalledWith('expired', { newEmail: false });
  });
});
