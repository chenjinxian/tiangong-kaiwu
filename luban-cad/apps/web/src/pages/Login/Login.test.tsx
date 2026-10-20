/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Login 重做单元测试（RW4-P1-T2）：
 * - e2e 契约锚点（zh）：heading 欢迎回来 / getByLabel 电子邮箱 / textbox 密码 / button 登录 / link 立即注册
 * - t('auth.login.*') 中英接线
 * - Google SSO 按钮位：VITE_GOOGLE_CLIENT_ID 空=不渲染，非空=渲染（Divider「或」+官方 G）
 * - 记住我回填（luban-cad-remember）/ context error → .login-error-alert
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n/index.js';

const mockUseUser = vi.fn();
vi.mock('../../../app/contexts/UserContext.js', () => ({
  useUser: () => mockUseUser(),
}));

import Login from './Login.js';

const baseUserState = () => ({
  isAuthenticated: false,
  isLoading: false,
  error: null as string | null,
  login: vi.fn().mockResolvedValue({}),
  clearError: vi.fn(),
});

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>,
  );

describe('Login（RW4-P1-T2）', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
    localStorage.clear();
    mockUseUser.mockReturnValue(baseUserState());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('渲染 e2e 契约锚点（300ms 骨架后出表单）', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByLabelText('电子邮箱')).toBeTruthy();
    // 注：ARIA 里 input[type=password] 无 textbox role（Playwright 独有映射），
    // 单测走 label 关联断言——e2e 的 getByRole textbox 由真实 Chromium 保证
    expect(screen.getByLabelText('密码')).toBeTruthy();
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '立即注册' })).toBeTruthy();
  });

  it('t(auth.login.*) 接线：英文语言渲染英文', async () => {
    await i18n.changeLanguage('en');
    renderLogin();
    await waitFor(() => expect(screen.getByRole('heading', { name: /Welcome back/i })).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.getByLabelText(/Email/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeTruthy();
    await i18n.changeLanguage('zh-CN');
  });

  it('品牌侧栏接入（AuthBrandSide：品牌名+默认四特性行）', async () => {
    renderLogin();
    await waitFor(() => expect(screen.getByText('鲁班CAD')).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByText('基于 iTwin.js 的开源云端 CAD 平台')).toBeTruthy();
    expect(screen.getByText('完全免费，开源透明')).toBeTruthy();
    expect(screen.getAllByText(/云端实时协作|工业级 3D 渲染引擎|专业 CAD 功能/).length).toBe(3);
  });

  it('Google SSO 按钮位：VITE_GOOGLE_CLIENT_ID 未设置时不渲染', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    renderLogin();
    await waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeTruthy(), { timeout: 2000 });
    expect(screen.queryByText(/Google/)).toBeNull();
    expect(screen.queryByText('或')).toBeNull();
  });

  it('Google SSO 按钮位：env 非空时渲染「或」分隔+Google 按钮（OIDC 回调流占位）', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
    renderLogin();
    await waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByText('或')).toBeTruthy();
    expect(screen.getByRole('button', { name: '使用 Google 账号继续' })).toBeTruthy();
  });

  it('记住我回填：luban-cad-remember 有效期内预填邮箱', async () => {
    localStorage.setItem(
      'luban-cad-remember',
      JSON.stringify({ email: 'saved@example.com', timestamp: Date.now() }),
    );
    renderLogin();
    const emailInput = (await waitFor(
      () => screen.getByLabelText('电子邮箱') as HTMLInputElement,
      { timeout: 2000 },
    )) as HTMLInputElement;
    await waitFor(() => expect(emailInput.value).toBe('saved@example.com'), { timeout: 2000 });
  });

  it('context error 渲染进 .login-error-alert（e2e 契约类名）', async () => {
    mockUseUser.mockReturnValue({ ...baseUserState(), error: '邮箱或密码错误' });
    const { container } = renderLogin();
    await waitFor(() => expect(container.querySelector('.login-error-alert')).toBeTruthy(), { timeout: 2000 });
    expect(container.querySelector('.login-error-alert')?.textContent).toContain('邮箱或密码错误');
  });
});
