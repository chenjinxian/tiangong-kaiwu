// src/modules/settings/test/settings-structure.test.tsx
//
// M2 Task 8 结构断言（brief Step 1）：/settings 关键区域存在性验收——
//  1) 左导航（settings-sidebar 锚点）：帐户（九项）/ 订阅（三项）/ 团队
//     （一项）三分区结构（os-48）；
//  2) 默认个人资料面板（settings-panel 锚点）：头像区（settings-profile-avatar）
//     + 更改/移除钮 + 五字段表单（名字/姓氏/用户名/昵称/个人简历）；
//  3) 首选项面板：深色模式开关（联动 ThemeContext）+ 语言选择；
//  4) 深色开关切换 → data-theme=dark 翻转（真开关，非摆设）。
//
// 定位：M2 Task 7 SettingsPage.test.tsx 行为深测之外的关键区域存在性
// 验收层（M2 DoD 5/6）；mock 口径与其一致——AuthSession.getStoredAuth
// 模块级 mock（零真实请求），真实 ThemeProvider（深色开关断言 data-theme）。

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clients/auth/AuthSession.js', () => ({
  AuthSession: {
    getStoredAuth: vi.fn().mockReturnValue({
      accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 999_999,
      user: { id: 'user-9', email: 'alan@example.com', name: 'Alan Chen' },
    }),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

import { ThemeProvider } from '@app/providers/ThemeContext.js';
import { SettingsPage } from '../SettingsPage.js';

function renderPage(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  // 主题持久化/根属性跨用例污染清零（深色开关用例从浅色态出发）。
  localStorage.removeItem('luban-next-theme');
  document.documentElement.removeAttribute('data-theme');
});

describe('SettingsPage 结构断言（M2 Task 8，关键区域存在性）', () => {
  it('左导航：settings-sidebar 锚点 + 三分区十三项（os-48）', () => {
    renderPage();
    const sidebar = screen.getByTestId('settings-sidebar');
    for (const section of ['帐户', '订阅', '团队']) {
      expect(within(sidebar).getAllByText(section).length).toBeGreaterThanOrEqual(1);
    }
    for (const item of [
      '个人资料', '电子邮件', '首选项', '通知', '安全',
      '设备', '应用程序', '集成', '开发者',
      '订阅', '支付选项', '支付记录', '团队',
    ]) {
      expect(within(sidebar).getByRole('button', { name: item })).toBeDefined();
    }
  });

  it('默认个人资料面板：头像锚点 + 更改/移除 + 五字段表单', () => {
    renderPage();
    const panel = screen.getByTestId('settings-panel');
    expect(within(panel).getByRole('heading', { name: '个人资料' })).toBeDefined();
    expect(within(panel).getByTestId('settings-profile-avatar')).toBeDefined();
    expect(within(panel).getByRole('button', { name: '更改' })).toBeDefined();
    expect(within(panel).getByRole('button', { name: '移除' })).toBeDefined();
    for (const label of ['名字', '姓氏', /用户名/, '昵称', '个人简历']) {
      expect(within(panel).getByLabelText(label)).toBeDefined();
    }
  });

  it('首选项面板：深色模式开关 + 语言选择', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getByTestId('settings-sidebar')).getByRole('button', { name: '首选项' }));
    const panel = screen.getByTestId('settings-panel');
    expect(within(panel).getByRole('heading', { name: '首选项' })).toBeDefined();
    expect((within(panel).getByRole('switch', { name: '深色模式' }) as HTMLInputElement).checked).toBe(false);
    expect(within(panel).getByRole('combobox', { name: '语言' })).toBeDefined();
  });

  it('深色开关 → data-theme 翻转（真开关联动 ThemeContext）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getByTestId('settings-sidebar')).getByRole('button', { name: '首选项' }));
    const darkSwitch = screen.getByRole('switch', { name: '深色模式' }) as HTMLInputElement;
    await user.click(darkSwitch);
    expect(darkSwitch.checked).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
