// src/modules/settings/test/SettingsPage.test.tsx
//
// M2 Task 7 失败测试先行（brief Step 1）：SettingsPage 结构完备性——
//  1) 顶栏：面包屑（返回「文档」+ 当前「设置」，os-48）+ 主题切换钮 + 用户菜单
//     （我的帐户/深色模式/退出登录，os-03）；
//  2) 左导航（os-48 分区结构）：帐户（个人资料/电子邮件/首选项/通知/安全/
//     设备/应用程序/集成/开发者）+ 订阅（订阅/支付选项/支付记录）+ 团队（团队）；
//  3) 默认面板=个人资料：大头像 + 更改/移除钮 + 表单（名字/姓氏/用户名(论坛名)/
//     昵称/个人简历）；
//  4) 首选项面板：深色模式开关（联动 ThemeContext）+ 语言选择（zh-CN/en）；
//  5) 其余分区项 → 「即将推出」占位面板（导航渲染完整，仅两项有真实内容）。
//
// 数据面：AuthSession.getStoredAuth 模块级 mock（结构测试零真实请求）；
// 主题面：真实 ThemeProvider（深色开关用例断言 data-theme 翻转）。

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

describe('SettingsPage 结构（/settings 设置页，os-48）', () => {
  it('顶栏：面包屑（返回 文档 + 设置）+ 主题切换 + 用户菜单', async () => {
    const user = userEvent.setup();
    renderPage();
    // 面包屑：返回段可点（回 /documents），当前段 设置——aria-current 由
    // HeaderButton 落在包裹 <li> 上（iTwinUI 3.22 契约）。
    expect(screen.getByRole('button', { name: '文档' })).toBeDefined();
    const current = screen.getByRole('button', { name: '设置' });
    expect(current.closest('[aria-current]')?.getAttribute('aria-current')).toBe('location');
    // 主题切换钮 + 用户菜单。
    expect(screen.getByRole('button', { name: '深色模式' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    const menu = await screen.findByRole('menu');
    for (const label of ['我的帐户', '深色模式', '退出登录']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeDefined();
    }
  });

  it('左导航：帐户九项 + 订阅三项 + 团队一项，分区标题在场（os-48）', () => {
    renderPage();
    const sidebar = screen.getByTestId('settings-sidebar');
    for (const section of ['帐户', '订阅', '团队']) {
      // 订阅/团队 与同名导航项文案重名——getAllByText 断言在场性即可。
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

  it('默认面板=个人资料：大头像 + 更改/移除钮 + 五字段表单', () => {
    renderPage();
    const panel = screen.getByTestId('settings-panel');
    expect(within(panel).getByRole('heading', { name: '个人资料' })).toBeDefined();
    // 大头像（头像区独立锚点）+ 更改/移除。
    expect(within(panel).getByTestId('settings-profile-avatar')).toBeDefined();
    expect(within(panel).getByRole('button', { name: '更改' })).toBeDefined();
    expect(within(panel).getByRole('button', { name: '移除' })).toBeDefined();
    // 五字段（LabeledInput 的 label↔input 关联——getByLabelText 直取）；
    // 名字/姓氏初始值取自会话姓名（Alan Chen）。
    const firstName = within(panel).getByLabelText('名字') as HTMLInputElement;
    const lastName = within(panel).getByLabelText('姓氏') as HTMLInputElement;
    expect(firstName.value).toBe('Alan');
    expect(lastName.value).toBe('Chen');
    expect(within(panel).getByLabelText(/用户名/)).toBeDefined();
    expect(within(panel).getByLabelText('昵称')).toBeDefined();
    expect(within(panel).getByLabelText('个人简历')).toBeDefined();
  });

  it('首选项面板：深色模式开关 + 语言选择', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getByTestId('settings-sidebar')).getByRole('button', { name: '首选项' }));
    const panel = screen.getByTestId('settings-panel');
    expect(within(panel).getByRole('heading', { name: '首选项' })).toBeDefined();
    const darkSwitch = within(panel).getByRole('switch', { name: '深色模式' }) as HTMLInputElement;
    expect(darkSwitch.checked).toBe(false);
    expect(within(panel).getByRole('combobox', { name: '语言' })).toBeDefined();
  });

  it('深色开关切换 → ThemeContext 主题翻转（data-theme=dark）', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getByTestId('settings-sidebar')).getByRole('button', { name: '首选项' }));
    const darkSwitch = screen.getByRole('switch', { name: '深色模式' }) as HTMLInputElement;
    await user.click(darkSwitch);
    expect(darkSwitch.checked).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('占位分区（电子邮件）→ 即将推出占位面板', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(within(screen.getByTestId('settings-sidebar')).getByRole('button', { name: '电子邮件' }));
    const panel = screen.getByTestId('settings-panel');
    expect(within(panel).getByText('即将推出')).toBeDefined();
    // 个人资料表单不在场（面板真实切换，非叠加渲染）。
    expect(within(panel).queryByLabelText('名字')).toBeNull();
  });

  it('不得渲染原始 i18n 键串（settings.* 裸键回归）', () => {
    renderPage();
    expect(screen.queryByText(/settings\./)).toBeNull();
  });
});
