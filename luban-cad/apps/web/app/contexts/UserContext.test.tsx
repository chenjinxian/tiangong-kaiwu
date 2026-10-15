/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * UserContext 登录错误映射测试：429 限流分支（Sync F2）。
 *
 * 新版 imodelhub 登录限流收紧（login 路由 5 次/15min，IP+email 桶，被拒计入窗口），
 * 429 应映射为用户友好文案：AuthError 带 Retry-After-auth 秒数时给出等待时长，
 * 否则静态文案。文案走 i18n auth 命名空间（zh/en）。
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../shared/i18n/index.js';

const { mockLogin, mockGetStoredAuth, MockAuthError } = vi.hoisted(() => {
  // 与真实 AuthError 同形（status/retryAfterSeconds），instanceof 判定在 UserContext 内成立
  class AuthError extends Error {
    constructor(
      message: string,
      public status: number,
      public retryAfterSeconds?: number,
    ) {
      super(message);
      this.name = 'AuthError';
    }
  }
  return {
    mockLogin: vi.fn(),
    mockGetStoredAuth: vi.fn(() => ({ user: null, tokens: null })),
    MockAuthError: AuthError,
  };
});

vi.mock('../../features/auth/services/auth/client.js', () => ({
  AuthError: MockAuthError,
  getStoredAuth: mockGetStoredAuth,
  login: mockLogin,
  logout: vi.fn(),
  register: vi.fn(),
}));

import { UserProvider, useUser } from './UserContext.js';

const LoginProbe: React.FC = () => {
  const { login, error } = useUser();
  const [settled, setSettled] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void login({ email: 'a@b.c', password: 'x' })
            .catch(() => undefined)
            .finally(() => setSettled(true));
        }}
      >
        trigger-login
      </button>
      <output data-testid="error">{error}</output>
      <span data-testid="settled">{settled ? 'yes' : 'no'}</span>
    </div>
  );
};

describe('UserContext 429 限流文案（Sync F2）', () => {
  beforeEach(async () => {
    mockLogin.mockReset();
    await i18n.changeLanguage('zh-CN');
  });

  it('429 且带 Retry-After-auth 秒数时给出等待时长文案', async () => {
    mockLogin.mockRejectedValue(new MockAuthError('ThrottlerException: Too Many Requests', 429, 600));

    render(<UserProvider><LoginProbe /></UserProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));

    await waitFor(() => expect(screen.getByTestId('settled').textContent).toBe('yes'));
    expect(screen.getByTestId('error').textContent).toContain('10 分钟');
  });

  it('429 无 Retry-After-auth 时回落静态文案', async () => {
    mockLogin.mockRejectedValue(new MockAuthError('ThrottlerException: Too Many Requests', 429));

    render(<UserProvider><LoginProbe /></UserProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));

    await waitFor(() => expect(screen.getByTestId('settled').textContent).toBe('yes'));
    const errorText = screen.getByTestId('error').textContent ?? '';
    expect(errorText).toContain('尝试过于频繁');
    expect(errorText).not.toContain('分钟');
  });

  it('英文语言下 429 文案走 en 键', async () => {
    await i18n.changeLanguage('en');
    mockLogin.mockRejectedValue(new MockAuthError('ThrottlerException: Too Many Requests', 429, 600));

    render(<UserProvider><LoginProbe /></UserProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));

    await waitFor(() => expect(screen.getByTestId('settled').textContent).toBe('yes'));
    const errorText = screen.getByTestId('error').textContent ?? '';
    expect(errorText).toContain('Too many attempts');
    expect(errorText).toContain('10');
    await i18n.changeLanguage('zh-CN');
  });
});
