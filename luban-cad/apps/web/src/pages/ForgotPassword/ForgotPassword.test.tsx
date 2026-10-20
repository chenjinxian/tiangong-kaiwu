/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/**
 * ForgotPassword 重做单元测试（RW4-P1-T3）：
 * - zh 锚点：heading 忘记密码 / getByLabel 电子邮箱 / button 发送重置链接 / link 立即登录
 * - 无效邮箱提交出校验文案；成功态文案插值（sentTo {{email}}）
 * - AuthBrandSide 接入
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n/index.js';

const mockForgotPassword = vi.fn();
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  forgotPassword: (payload: { email: string }) => mockForgotPassword(payload),
}));

const mockUseUser = vi.fn();
vi.mock('../../../app/contexts/UserContext.js', () => ({
  useUser: () => mockUseUser(),
}));

import ForgotPassword from './ForgotPassword.js';

const baseUserState = () => ({
  isAuthenticated: false,
  isLoading: false,
});

const renderForgot = () =>
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <ForgotPassword />
    </MemoryRouter>,
  );

describe('ForgotPassword（RW4-P1-T3）', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
    mockForgotPassword.mockReset();
    mockUseUser.mockReturnValue(baseUserState());
  });

  it('渲染锚点（300ms 骨架后出表单）', async () => {
    renderForgot();
    await waitFor(() => expect(screen.getByRole('heading', { name: '忘记密码' })).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.getByLabelText('电子邮箱')).toBeTruthy();
    expect(screen.getByRole('button', { name: '发送重置链接' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '立即登录' })).toBeTruthy();
  });

  it('无效邮箱提交出校验文案（t 接线，不发请求）', async () => {
    renderForgot();
    const emailInput = await waitFor(() => screen.getByLabelText('电子邮箱'), { timeout: 2000 });
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    fireEvent.submit(screen.getByRole('button', { name: '发送重置链接' }).closest('form')!);
    expect(await screen.findByText('请输入有效的邮箱地址', {}, { timeout: 2000 })).toBeTruthy();
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it('有效邮箱提交走成功态（sentTo 插值 + 返回登录链接）', async () => {
    mockForgotPassword.mockResolvedValue({});
    renderForgot();
    const emailInput = await waitFor(() => screen.getByLabelText('电子邮箱'), { timeout: 2000 });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.submit(screen.getByRole('button', { name: '发送重置链接' }).closest('form')!);
    expect(await screen.findByText(/重置密码链接已发送至 user@example.com/, {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回登录' })).toBeTruthy();
  });

  it('英文语言渲染英文（t(auth.forgotPassword.*)）', async () => {
    await i18n.changeLanguage('en');
    renderForgot();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Forgot password/i })).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.getByRole('button', { name: /Send reset link/i })).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });
});
