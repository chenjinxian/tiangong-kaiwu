/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Register 重做单元测试（RW4-P1-T3）：
 * - e2e 契约锚点（zh）：heading 创建账户 / getByLabel 姓名·电子邮箱·密码·确认密码 / link 立即登录
 * - /terms /privacy 死链移除 → 次要文本同意句
 * - 密码强度条 + 不一致校验文案走 t('auth.register.*')
 * - AuthBrandSide 六特性行接入
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n/index.js';

const mockUseUser = vi.fn();
vi.mock('../../../app/contexts/UserContext.js', () => ({
  useUser: () => mockUseUser(),
}));

import Register from './Register.js';

const baseUserState = () => ({
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  register: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
});

const renderRegister = () =>
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Register />
    </MemoryRouter>,
  );

const fillPassword = async (password: string, confirmPassword: string) => {
  const passwordInput = await waitFor(() => screen.getByLabelText('密码'), { timeout: 2000 });
  fireEvent.change(passwordInput, { target: { value: password } });
  const confirmInput = screen.getByLabelText('确认密码');
  fireEvent.change(confirmInput, { target: { value: confirmPassword } });
};

describe('Register（RW4-P1-T3）', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
    mockUseUser.mockReturnValue(baseUserState());
  });

  it('渲染 e2e 契约锚点（300ms 骨架后出表单）', async () => {
    renderRegister();
    await waitFor(() => expect(screen.getByRole('heading', { name: '创建账户' })).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.getByLabelText('姓名')).toBeTruthy();
    expect(screen.getByLabelText('电子邮箱')).toBeTruthy();
    expect(screen.getByLabelText('密码')).toBeTruthy();
    expect(screen.getByLabelText('确认密码')).toBeTruthy();
    expect(screen.getByRole('link', { name: '立即登录' })).toBeTruthy();
  });

  it('t(auth.register.*) 接线：英文语言渲染英文', async () => {
    await i18n.changeLanguage('en');
    renderRegister();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Create account/i })).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.getByLabelText(/Name/i)).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });

  it('/terms /privacy 死链移除：同意句为次要文本', async () => {
    const { container } = renderRegister();
    await waitFor(() => expect(screen.getByRole('heading', { name: '创建账户' })).toBeTruthy(), {
      timeout: 2000,
    });
    expect(container.querySelector('a[href="/terms"]')).toBeNull();
    expect(container.querySelector('a[href="/privacy"]')).toBeNull();
    expect(screen.getByText(/服务条款.*隐私政策|隐私政策/).textContent).toContain('注册即表示您已阅读并同意');
  });

  it('密码强度条渲染且不一致时出校验文案（t 接线）', async () => {
    renderRegister();
    await fillPassword('Abcdef12', 'Different9!');
    await waitFor(
      () => expect(document.querySelector('.strength-bar')).toBeTruthy(),
      { timeout: 2000 },
    );
    await waitFor(
      () => expect(screen.getByText('两次输入的密码不一致')).toBeTruthy(),
      { timeout: 2000 },
    );
  });

  it('AuthBrandSide 六特性行接入（含多格式/安全两条 Register 特有项）', async () => {
    renderRegister();
    await waitFor(() => expect(screen.getByText('多格式 CAD 支持')).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByText('企业级数据安全')).toBeTruthy();
    expect(screen.getByText('完全免费，开源透明')).toBeTruthy();
  });
});
