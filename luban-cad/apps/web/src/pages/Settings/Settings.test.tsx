/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Settings 重做（RW4-P5-T5-1）：
 * - 3 tab → iTwinUI Tabs（role=tab 可切换，默认 zh-CN）
 * - 资料/密码 PUT 走 fetchWithAuth（端点不变），成功 toast + updateUser；ApiError 文案上浮 toast
 * - 校验：姓名空 → 字段级错误且不发请求；密码不一致 → 错误 toast 且不发请求
 * - 偏好：语言写 luban-cad-lang + i18n.changeLanguage（页面即时切换）；长度单位持久化
 *
 * 注：仓库未安装 @testing-library/user-event（不新增依赖），交互使用 RTL fireEvent。
 */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseUser, updateUserMock, showToastMock } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  updateUserMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock('../../../app/contexts/UserContext.js', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('../../../shared/hooks/useAppToast.js', () => ({
  useAppToast: () => ({ showToast: showToastMock }),
}));

vi.mock('../../../shared/api/httpClient.js', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/httpClient.js')>(
    '../../../shared/api/httpClient.js',
  );
  return {
    ...actual,
    fetchWithAuth: vi.fn(),
  };
});

import { ThemeProvider } from '../../../app/contexts/ThemeContext.js';
import { ApiError, fetchWithAuth } from '../../../shared/api/httpClient.js';
import { API_BASE_URL } from '../../../shared/api/baseUrl.js';
import i18n, { LANGUAGE_STORAGE_KEY } from '../../../shared/i18n/index.js';
import Settings, { LENGTH_UNIT_STORAGE_KEY } from './Settings.js';

const mockedFetchWithAuth = vi.mocked(fetchWithAuth);

const USER = {
  id: 'u-1',
  email: 'alice@example.com',
  name: 'Alice',
  plan: 'free' as const,
};

// ThemeToggle 依赖 matchMedia（jsdom 未实现）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderSettings(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <Settings />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockedFetchWithAuth.mockReset();
  localStorage.clear();
  await i18n.changeLanguage('zh-CN');
  mockUseUser.mockReturnValue({ user: USER, updateUser: updateUserMock });
});

afterEach(async () => {
  await i18n.changeLanguage('zh-CN');
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  localStorage.removeItem(LENGTH_UNIT_STORAGE_KEY);
  localStorage.removeItem('luban-cad-theme');
});

describe('Settings（RW4-P5-T5-1）', () => {
  it('默认中文渲染个人资料页，并按 role=tab 切换标签页', () => {
    renderSettings();

    const profileTab = screen.getByRole('tab', { name: '个人资料' });
    expect(profileTab.getAttribute('aria-selected')).toBe('true');
    expect(
      within(screen.getByRole('tabpanel')).getByText('管理您的个人信息和公开资料'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '修改密码' }));

    expect(screen.getByRole('tab', { name: '修改密码' }).getAttribute('aria-selected')).toBe('true');
    expect(
      within(screen.getByRole('tabpanel')).getByText('定期更换密码可以提高账户安全性'),
    ).toBeTruthy();
  });

  it('保存资料：PUT /api/users/profile（fetchWithAuth）+ updateUser + 成功 toast', async () => {
    mockedFetchWithAuth.mockResolvedValue(
      jsonResponse({ user: { id: USER.id, email: USER.email, name: '爱丽丝' } }),
    );

    renderSettings();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '爱丽丝' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(mockedFetchWithAuth).toHaveBeenCalledTimes(1));
    // 精确断言相对 path + baseUrl：守住「API_BASE_URL 不得拼进 path」的基址叠加回归
    expect(mockedFetchWithAuth).toHaveBeenCalledWith(
      '/api/users/profile',
      expect.objectContaining({
        baseUrl: API_BASE_URL,
        method: 'PUT',
        body: JSON.stringify({ name: '爱丽丝' }),
      }),
    );
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ name: '爱丽丝' }));
    expect(showToastMock).toHaveBeenCalledWith('个人资料已更新', 'success');
  });

  it('姓名空：字段级校验错误，不发请求', async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '请输入姓名');
    expect(mockedFetchWithAuth).not.toHaveBeenCalled();
  });

  it('密码不一致：错误 toast，不发请求', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: '修改密码' }));

    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'oldpass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'newpass1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'newpass2' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect(showToastMock).toHaveBeenCalledWith('两次输入的新密码不一致', 'error');
    expect(mockedFetchWithAuth).not.toHaveBeenCalled();
  });

  it('密码成功：PUT /api/users/password（fetchWithAuth）+ 清空字段', async () => {
    mockedFetchWithAuth.mockResolvedValue(jsonResponse({}));

    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: '修改密码' }));

    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'oldpass' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'newpass1' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'newpass1' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    await waitFor(() => expect(mockedFetchWithAuth).toHaveBeenCalledTimes(1));
    expect(mockedFetchWithAuth).toHaveBeenCalledWith(
      '/api/users/password',
      expect.objectContaining({
        baseUrl: API_BASE_URL,
        method: 'PUT',
        body: JSON.stringify({ currentPassword: 'oldpass', newPassword: 'newpass1' }),
      }),
    );
    await waitFor(() => {
      expect((screen.getByLabelText('当前密码') as HTMLInputElement).value).toBe('');
    });
    expect((screen.getByLabelText('新密码') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('确认新密码') as HTMLInputElement).value).toBe('');
    expect(showToastMock).toHaveBeenCalledWith(
      '密码已修改，请使用新密码重新登录',
      'success',
    );
  });

  it('API 错误：ApiError.message 上浮到错误 toast', async () => {
    mockedFetchWithAuth.mockRejectedValueOnce(
      new ApiError('当前密码不正确', 400, 'InvalidPassword'),
    );

    renderSettings();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith('当前密码不正确', 'error'),
    );
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('语言切换：写 luban-cad-lang=en、i18n.language=en，页面文案切换为英文', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: '偏好设置' }));

    const languageSelect = screen.getByLabelText('界面语言') as HTMLSelectElement;
    expect(languageSelect.value).toBe('zh-CN');

    fireEvent.change(languageSelect, { target: { value: 'en' } });

    await waitFor(() => expect(i18n.language).toBe('en'));
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeTruthy();
    expect(
      within(screen.getByRole('tabpanel')).getByText('Preferences'),
    ).toBeTruthy();
  });

  it('字段错误存 key：切换语言后错误文案随译文更新', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '请输入姓名');

    fireEvent.click(screen.getByRole('tab', { name: '偏好设置' }));
    fireEvent.change(screen.getByLabelText('界面语言'), { target: { value: 'en' } });
    await waitFor(() => expect(i18n.language).toBe('en'));
    fireEvent.click(screen.getByRole('tab', { name: 'Profile' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Please enter your name',
    );
  });

  it('长度单位偏好持久化到 localStorage，并在重新挂载后回填', () => {
    const first = renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: '偏好设置' }));

    const unitSelect = screen.getByLabelText('长度单位') as HTMLSelectElement;
    expect(unitSelect.value).toBe('mm');

    fireEvent.change(unitSelect, { target: { value: 'inch' } });
    expect(localStorage.getItem(LENGTH_UNIT_STORAGE_KEY)).toBe('inch');
    expect((screen.getByLabelText('长度单位') as HTMLSelectElement).value).toBe('inch');

    first.unmount();

    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: '偏好设置' }));
    expect((screen.getByLabelText('长度单位') as HTMLSelectElement).value).toBe('inch');
  });
});
