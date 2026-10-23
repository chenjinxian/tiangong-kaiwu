// src/modules/part-studio/test/CommandPalette.test.tsx
//
// M3 Task 4（brief Step 1）：命令搜索面板 + ribbon 渲染冒烟——
//  1) CommandPalette（对齐 os-23）：打开态渲染搜索框（placeholder 搜索工具）/
//     提示文案（开始键入以搜索工具）/关闭钮（escape 语义）/「亮显工具栏中的
//     工具」勾选（默认勾选）；输入过滤工具名；回车激活首匹配（走
//     IModelApp.tools.run）；Escape 关闭；alt+/ 全局热键开面板；
//     查询词回写 store（ribbon 亮显数据源）；
//  2) gated 路由：搜索命中 gated 工具（拔模）回车——不触发 tools.run，
//     开能力引导对话框（CAPABILITY_GUIDANCE 文案），确认后关闭；
//  3) Ribbon 结构冒烟（brief 钉死测试文件仅两枚，渲染冒烟顺带挂本文件）：
//     27 工具主钮 + 8 下拉箭头 + 1 搜索触发钮；下拉飞菜单展开子项并可激活；
//     gated 工具点击开引导对话框而非 tools.run。
//
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// 真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toolsRun: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  // Tool 基类桩：part-studio barrel → PartStudioPage → viewer-next 装饰件
  // （ToggleProjectExtentsTool extends Tool）模块加载期即需 Tool 存在。
  Tool: class {},
  // I-2 notifications 呈现桥（PartStudioPage → ViewerNotifications）：
  // ToasterNotificationManager extends NotificationManager——模块加载期即需基类。
  NotificationManager: class { public outputMessage(): void { /* 哑通道桩 */ } },
  IModelApp: {
    tools: {
      run: mocks.toolsRun,
    },
  },
}));

import { usePartStudioStore } from '../index.js';
import { CommandPalette } from '../ribbon/CommandPalette.js';
import { Ribbon } from '../ribbon/Ribbon.js';

/** store 复位：commandPalette/tool/dialog 切片回缺省（isOpen 由用例自行置位）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    tool: { activeToolId: null },
    commandPalette: { isOpen: false, query: '', highlightEnabled: true },
    dialog: { active: null },
  });
}

function renderPalette(): ReturnType<typeof render> {
  return render(<CommandPalette />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.toolsRun.mockResolvedValue(true);
  resetStore();
});

describe('CommandPalette 打开态渲染（对齐 os-23）', () => {
  it('搜索框/提示文案/关闭钮/亮显勾选（默认勾选）全呈现', () => {
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    const dialog = screen.getByRole('dialog', { name: '搜索工具' });
    expect(within(dialog).getByRole('textbox')).toBeDefined();
    expect(within(dialog).getByText('开始键入以搜索工具')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: '关闭搜索' })).toBeDefined();
    const highlight = within(dialog).getByRole('checkbox', { name: '亮显工具栏中的工具' });
    expect((highlight as HTMLInputElement).checked).toBe(true);
    // 空查询不列结果（os-23：键入才开始搜索）。
    expect(within(dialog).queryByRole('list')).toBeNull();
  });

  it('面板关闭时渲染空（页面级常驻挂载，热键/effect 仍生效）', () => {
    renderPalette();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CommandPalette 输入过滤', () => {
  it('键入过滤工具名（圆角 → 圆角 + 修改圆角，拉伸不出列）', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    const input = screen.getByRole('textbox');
    await user.type(input, '圆角');
    const list = screen.getByRole('list');
    // 可访问名全等匹配：圆角 ≠ 修改圆角（后者是独立工具）。
    expect(within(list).getByRole('button', { name: '圆角' })).toBeDefined();
    expect(within(list).getByRole('button', { name: '修改圆角' })).toBeDefined();
    expect(within(list).queryByRole('button', { name: '拉伸' })).toBeNull();
    // 查询词回写 store——ribbon 亮显的数据源。
    expect(usePartStudioStore.getState().commandPalette.query).toBe('圆角');
  });

  it('无匹配出空态文案', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    await user.type(screen.getByRole('textbox'), 'zzz');
    expect(screen.getByText('无匹配工具')).toBeDefined();
  });
});

describe('CommandPalette 激活路由', () => {
  it('回车激活首匹配：拉伸 → 特征对话框（new/extrude）+ 面板关闭（M4-T6 特例路由，同 newSketch 姿态）', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    await user.type(screen.getByRole('textbox'), '拉伸{Enter}');
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'extrude',
    });
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
  });

  it('gated 工具（拔模）回车：不触发 tools.run，开能力引导对话框', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    await user.type(screen.getByRole('textbox'), '拔模{Enter}');
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    // 引导对话框：标题/正文取 capabilities.draft.* 词库文案。
    const dialog = screen.getByRole('dialog', { name: '拔模（规划中）' });
    // 正文取 capabilities.draft.message 词库文案（标题已由 aria-label 钉住）。
    expect(within(dialog).getByText(/路线图中登记/)).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: '知道了' }));
    expect(screen.queryByRole('dialog', { name: '拔模（规划中）' })).toBeNull();
  });

  it('点击结果激活：圆角 → 改道 new/fillet 对话框（M6-b T6，tools.run 不调用）', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    await user.type(screen.getByRole('textbox'), '圆角');
    const first = screen.getAllByRole('button', { name: '圆角' })[0];
    expect(first).toBeDefined();
    await user.click(first!);
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'fillet',
    });
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
  });

  it('点击结果激活：扫掠 → tools.run(SweepFaces)（真实工具路由不回归；圆角已改道对话框）', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    await user.type(screen.getByRole('textbox'), '扫掠');
    const first = screen.getByRole('button', { name: '扫掠' });
    await user.click(first);
    expect(mocks.toolsRun).toHaveBeenCalledWith('SweepFaces');
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
  });

  it('Escape 关闭面板', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ commandPalette: { isOpen: true, query: '', highlightEnabled: true } });
    renderPalette();
    await user.keyboard('{Escape}');
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
  });
});

describe('CommandPalette 热键', () => {
  it('alt+/ 开面板（面板挂载即监听，store 驱动开合）', async () => {
    renderPalette();
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(false);
    // jsdom 无真实按键分发，直发 window keydown（altKey + '/'）。
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', altKey: true }));
    expect(usePartStudioStore.getState().commandPalette.isOpen).toBe(true);
  });
});

describe('Ribbon 结构冒烟（27 工具 + 8 下拉 + 搜索触发钮）', () => {
  it('主钮/下拉箭头/搜索触发钮计数对齐 os-11', () => {
    render(<Ribbon />);
    const ribbon = screen.getByTestId('part-studio-ribbon');
    // 27 工具主钮 + 8 下拉箭头钮 + 1 命令搜索触发钮 = 36。
    expect(within(ribbon).getAllByRole('button')).toHaveLength(36);
    expect(within(ribbon).getByRole('button', { name: /搜索工具/ })).toBeDefined();
  });

  it('gated 工具（拔模）点击开引导对话框，不触发 tools.run', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '拔模' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '拔模（规划中）' })).toBeDefined();
  });

  it('full 工具（扫掠）点击 → tools.run(SweepFaces) + 写 store 激活态（拉伸/旋转/圆角已改道对话框，见 M4-T6/M6-b T4/T6）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '扫掠' }));
    expect(mocks.toolsRun).toHaveBeenCalledWith('SweepFaces');
    expect(usePartStudioStore.getState().tool.activeToolId).toBe('SweepFaces');
  });

  it('下拉飞菜单：加厚箭头展开子项，点击封闭 → tools.run(thickenClosed)', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '加厚 ▾' }));
    const menu = screen.getByRole('menu', { name: '加厚' });
    expect(within(menu).getByRole('menuitem', { name: '封闭' })).toBeDefined();
    await user.click(within(menu).getByRole('menuitem', { name: '封闭' }));
    expect(mocks.toolsRun).toHaveBeenCalledWith('thickenClosed');
  });
});
