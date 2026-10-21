// src/routes/test/SignInRoute.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loginMock = vi.fn();
vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { login: (...a: unknown[]) => loginMock(...a) } }));

import { SignInRoute } from '../SignInRoute.js';

describe('SignInRoute', () => {
  beforeEach(() => loginMock.mockReset());

  it('渲染邮箱/密码/记住我/登录按钮', () => {
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getByLabelText(/密码|Password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /登录|Sign in/i })).toBeDefined();
  });

  it('校验失败不提交（空表单）', async () => {
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /登录|Sign in/i }));
    expect(loginMock).not.toHaveBeenCalled();
    expect(screen.getByText(/请输入邮箱|required/i)).toBeDefined();
  });

  it('提交成功走 AuthSession.login 并跳转', async () => {
    loginMock.mockResolvedValue({ id: '3', name: 'T' });
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.type(screen.getByLabelText(/密码|Password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /登录|Sign in/i }));
    expect(loginMock).toHaveBeenCalledWith('t@e.com', 'pw');
  });

  it('429 错误显示 retryAfterSeconds 文案', async () => {
    loginMock.mockRejectedValue({ status: 429, retryAfterSeconds: 720 });
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.type(screen.getByLabelText(/密码|Password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /登录|Sign in/i }));
    expect(await screen.findByText(/720/)).toBeDefined();
  });
});
