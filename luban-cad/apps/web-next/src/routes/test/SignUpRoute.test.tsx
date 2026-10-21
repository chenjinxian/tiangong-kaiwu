import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerMock = vi.fn();
vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { register: (...a: unknown[]) => registerMock(...a) } }));

import { SignUpRoute } from '../SignUpRoute.js';

describe('SignUpRoute', () => {
  beforeEach(() => registerMock.mockReset());

  it('渲染姓名/邮箱/密码/确认密码/条款/注册按钮', () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/名|First name/i)).toBeDefined();
    expect(screen.getByLabelText(/姓|Last name/i)).toBeDefined();
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getAllByLabelText(/密码|Password/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /注册|Create account/i })).toBeDefined();
  });

  it('空表单不提交', async () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /注册|Create account/i }));
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('两次密码不一致时报错且不提交', async () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    const passwords = screen.getAllByLabelText(/密码|Password/i);
    await userEvent.type(passwords[0]!, 'Abcd1234');
    await userEvent.type(passwords[1]!, 'Xyzw9999');
    await userEvent.click(screen.getByRole('button', { name: /注册|Create account/i }));
    expect(registerMock).not.toHaveBeenCalled();
    expect(screen.getByText(/不一致|match/i)).toBeDefined();
  });

  it('密码强度条随输入出现', async () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    const passwords = screen.getAllByLabelText(/密码|Password/i);
    await userEvent.type(passwords[0]!, 'Abcd1234!');
    expect(screen.getByTestId('password-strength')).toBeDefined();
  });

  it('提交成功走 AuthSession.register', async () => {
    registerMock.mockResolvedValue({ id: '3' });
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/名|First name/i), 'T');
    await userEvent.type(screen.getByLabelText(/姓|Last name/i), 'U');
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    const passwords = screen.getAllByLabelText(/密码|Password/i);
    await userEvent.type(passwords[0]!, 'Abcd1234!');
    await userEvent.type(passwords[1]!, 'Abcd1234!');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /注册|Create account/i }));
    expect(registerMock).toHaveBeenCalledWith('t@e.com', 'Abcd1234!', 'T', 'U');
  });
});
