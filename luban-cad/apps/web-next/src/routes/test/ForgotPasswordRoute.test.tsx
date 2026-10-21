import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const forgotMock = vi.fn();
vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { forgotPassword: (...a: unknown[]) => forgotMock(...a) } }));

import { ForgotPasswordRoute } from '../ForgotPasswordRoute.js';

describe('ForgotPasswordRoute', () => {
  beforeEach(() => forgotMock.mockReset());

  it('渲染邮箱输入与提交按钮', () => {
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /发送|Send/i })).toBeDefined();
  });

  it('空邮箱不提交', async () => {
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /发送|Send/i }));
    expect(forgotMock).not.toHaveBeenCalled();
  });

  it('提交成功显示已发送提示', async () => {
    forgotMock.mockResolvedValue(undefined);
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.click(screen.getByRole('button', { name: /发送|Send/i }));
    expect(forgotMock).toHaveBeenCalledWith('t@e.com');
    expect(await screen.findByText(/已发送|sent/i)).toBeDefined();
  });

  it('提交失败显示错误', async () => {
    forgotMock.mockRejectedValue({ status: 500, message: 'server error' });
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.click(screen.getByRole('button', { name: /发送|Send/i }));
    expect(await screen.findByText(/失败|error/i)).toBeDefined();
  });
});
