// auth-structure.test.tsx —— 三页共用一套结构检查器（参数化）
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn() } }));

import { AuthSession } from '@clients/auth/AuthSession.js';
import { SignInRoute } from '../SignInRoute.js';
import { SignUpRoute } from '../SignUpRoute.js';
import { ForgotPasswordRoute } from '../ForgotPasswordRoute.js';

describe('认证三页结构完备性', () => {
  it('登录页：分屏 hero 槽位 + 表单 + 主按钮 + 辅助链接', () => {
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    expect(screen.getByTestId('auth-hero')).toBeDefined();
    expect(screen.getByRole('button', { name: /登录|Sign in/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /注册|Sign up/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /忘记密码|Forgot/i })).toBeDefined();
  });
  it('注册页：姓名两行+邮箱+密码+确认+条款+提交', () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/名|First name/i)).toBeDefined();
    expect(screen.getByLabelText(/姓|Last name/i)).toBeDefined();
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getAllByLabelText(/密码|Password/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /注册|Create account/i })).toBeDefined();
  });
  it('找回页：邮箱+提交+返回登录链接', () => {
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /发送|Send/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /返回登录|Sign in|Back/i })).toBeDefined();
  });

  // 终审 M-c：登录成功跳转 /documents 的落地断言——MemoryRouter 挂占位路由，
  // 提交后须渲染占位（钉死 navigate(ROUTE_DOCUMENTS) 常量替换未改语义）。
  it('登录成功跳转 /documents（占位路由落地）', async () => {
    vi.mocked(AuthSession.login).mockResolvedValue({ id: '1', email: 't@e.com', name: 'T' });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<SignInRoute />} />
          <Route path="/documents" element={<div data-testid="documents-landing" />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.type(screen.getByLabelText(/密码|Password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /登录|Sign in/i }));
    expect(await screen.findByTestId('documents-landing')).toBeDefined();
  });
});
