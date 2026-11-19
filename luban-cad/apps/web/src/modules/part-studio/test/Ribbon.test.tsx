// src/modules/part-studio/test/Ribbon.test.tsx
//
// M4 Task 6（brief Step 1）：ribbon「拉伸」特例路由——拉伸闭环入口——
//  1) 拉伸点击 → store.dialog = { active:'feature', mode:'new',
//     featureType:'extrude' }（FeatureDialog 由画布宿主按 dialog 寻址渲染），
//     不投 IModelApp.tools.run、不写 tool.activeToolId（同 newSketch→SketchDialog
//     姿态：对话框流程非 PrimitiveTool 激活）；
//  2) 其余 full 工具不回归：扫掠点击仍投 tools.run + 写激活态（旋转/圆角已
//     同姿态改道对话框——M6-b T4/T6）；
//  3) gated 工具（筋）不回归：开能力引导对话框（拔模 AX-01 翻 full 改开 DraftDialog）。
//
// 定位：激活路由验收层（此前 ribbon 结构/激活冒烟挂 CommandPalette.test.tsx，
// 本任务拉伸特例路由新增独立文件）。@itwin/core-frontend 模块级 mock，真实
// store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toolsRun: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  // ViewCube 模块加载期读取标准视图枚举。
  StandardViewId: { NotStandard: -1, Top: 0, Bottom: 1, Left: 2, Right: 3, Front: 4, Back: 5, Iso: 6, RightIso: 7 },
  // Tool 基类桩：part-studio barrel → PartStudioPage → viewer 装饰件
  // （ToggleProjectExtentsTool extends Tool）模块加载期即需 Tool 存在。
  Tool: class {},
  // I-2 notifications 呈现桥（PartStudioPage → ViewerNotifications）：
  // ToasterNotificationManager extends NotificationManager——模块加载期即需基类。
  NotificationManager: class { public outputMessage(): void { /* 哑通道桩 */ } },
  IModelApp: {
    tools: {
      run: mocks.toolsRun,
    },
    // FeatureDialog 提交成功走 notifications 通道（与保存错误面同款）。
    notifications: { outputMessage: vi.fn() },
  },
}));

import { usePartStudioStore } from '../index.js';
import { Ribbon, useToolActivation } from '../ribbon/Ribbon.js';

/** store 复位：tool/dialog 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    tool: { activeToolId: null },
    dialog: { active: null },
    variablesDialog: { active: null },
    canvas: { selection: [], hiddenIds: [] },
    sketch: { ...usePartStudioStore.getState().sketch, isActive: false, pattern: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.toolsRun.mockResolvedValue(true);
  resetStore();
});

describe('ribbon 拉伸特例路由（M4-T6 拉伸闭环入口）', () => {
  it('拉伸点击 → dialog 切片 new/extrude；不投 tools.run、不写激活态', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '拉伸' }));
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'extrude',
    });
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
  });

  it('ADR-0006 B1：平面（cPlane）点击 → new/cPlane 对话框（不投 tools.run、不写激活态）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '平面' }));
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'cPlane',
    });
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
  });

  it('B3：扫掠（SweepFaces）点击改道 new/sweep 对话框（参数化特征链入口——不经 tools.run 不写激活态）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '扫掠' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'sweep',
    });
  });

  it('M6-b T4：旋转点击改道 new/revolve 对话框（不经 tools.run 不写激活态）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '旋转' }));
    expect(mocks.toolsRun).not.toHaveBeenCalledWith('revolve');
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'revolve',
    });
  });

  it("B2：放样（loft）点击改道 new/loft 对话框（原 'loft' 伪 toolId 无注册工具——不经 tools.run 不写激活态）", async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '放样' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'loft',
    });
  });

  it('B4：镜像（MirrorElements）点击改道 new/mirror 对话框（参数化特征链入口——不经 tools.run 不写激活态）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '镜像' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'mirror',
    });
  });

  it('B4 v1.41：镜像路由快照选中面 → dialog.inputFaces（对话框打开清选择前捕获）', async () => {
    const user = userEvent.setup();
    const face = {
      kind: 'face' as const,
      id: 'face-1',
      topologyId: { nodeId: 1, entityId: 2 },
      ownerBodyKey: '0x15',
    };
    usePartStudioStore.setState({ canvas: { selection: [face], hiddenIds: [] } });
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '镜像' }));
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'mirror',
      inputFaces: [face],
    });
  });

  it('B5：线性阵列（LinearPattern）点击改道 new/pattern 对话框（初值 kind=linear——不经 tools.run 不写激活态）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '线性阵列' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'pattern',
      patternKind: 'linear',
    });
  });

  it('B5：下拉子项环形阵列（CircularPattern：真实直改 toolId 校准）改道 new/pattern 对话框初值 kind=circular', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    const arrow = screen.getByRole('button', { name: '线性阵列 ▾' });
    await user.click(arrow);
    await user.click(screen.getByRole('menuitem', { name: '环形阵列' }));
    // 激活工具/对话框后焦点不得回到箭头：否则工具内的 Enter（如多边形边数提交）
    // 会触发箭头默认 click 重新展开飞菜单（2026-11-09 真栈实测）。
    expect(document.activeElement).not.toBe(arrow);
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'pattern',
      patternKind: 'circular',
    });
  });

  it('Onshape 菜单：首行父工具 + 快捷键 keycap + 变体行（2026-11-05 live 对齐）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '圆角 ▾' }));
    const menu = screen.getByRole('menu', { name: '圆角' });
    const parent = within(menu).getByTestId('part-studio-ribbon-menu-row-RoundEdges');
    expect(parent.textContent).toContain('圆角');
    expect(parent.querySelectorAll('.part-studio-ribbon__shortcut-key')).toHaveLength(2);
    expect(within(menu).getByTestId('part-studio-ribbon-menu-row-faceBlend').textContent).toContain('面混合');
  });

  it('B5：曲线阵列无工具/后端面 → capability gated 引导（不投伪 toolId、不静默失败）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '线性阵列 ▾' }));
    await user.click(screen.getByRole('menuitem', { name: '曲线阵列' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(screen.getByRole('dialog').textContent).toContain('曲线阵列（规划中）');
  });

  it('M6-b T6：圆角（RoundEdges）点击改道 new/fillet 对话框（不经 tools.run 不写激活态——参数化特征链入口，拾取归对话框驱动）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '圆角' }));
    expect(mocks.toolsRun).not.toHaveBeenCalledWith('RoundEdges');
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'fillet',
    });
  });

  it('B6 M-A4.2a：布尔运算（booleanBodies）点击改道 new/booleanBodies 对话框（不再 tools.run 假启动）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '布尔运算' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'booleanBodies',
    });
  });

  it('gated 工具不回归：筋点击开能力引导对话框', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '筋' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '筋（规划中）' })).toBeDefined();
  });

  it('草图文本/圆锥曲线：占位改 gated——点击开真实原因引导，不静默 no-op', async () => {
    const user = userEvent.setup();
    usePartStudioStore.setState({ sketch: { ...usePartStudioStore.getState().sketch, isActive: true } });
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '文本' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '草图文本（未支持）' })).toBeDefined();
    // 关闭后打开圆弧飞菜单 → 圆锥（live：圆锥在圆弧飞菜单，不在样条飞菜单）。
    await user.click(screen.getByRole('button', { name: '知道了' }));
    await user.click(screen.getByRole('button', { name: '三点圆弧 ▾' }));
    await user.click(screen.getByRole('menuitem', { name: '圆锥' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '圆锥曲线（未支持）' })).toBeDefined();
  });
});

describe('P2.4 只读总门（canEdit=false）', () => {
  it('写工具禁用；gated 信息面仍可点', async () => {
    const user = userEvent.setup();
    render(<Ribbon canEdit={false} />);
    const extrude = screen.getByRole('button', { name: '拉伸' }) as HTMLButtonElement;
    expect(extrude.disabled || extrude.getAttribute('aria-disabled') === 'true').toBe(true);
    // gated 筋仍可开能力引导（信息面）。
    await user.click(screen.getByRole('button', { name: '筋' }));
    expect(screen.getByRole('dialog', { name: '筋（规划中）' })).toBeDefined();
    expect(mocks.toolsRun).not.toHaveBeenCalled();
  });

  it('F11：飞菜单子项按各自 capability 裁决（gated 子项可用、full 子项禁用）', async () => {
    const user = userEvent.setup();
    render(<Ribbon canEdit={false} />);
    const ribbon = screen.getByTestId('part-studio-ribbon');
    const main = within(ribbon).getByRole('button', { name: '线性阵列' }) as HTMLButtonElement;
    expect(main.disabled || main.getAttribute('aria-disabled') === 'true').toBe(true);
    // 含 gated 子项的菜单箭头保留可点（F11）：W26 起圆角▾ 的面混合为 gated
    // （此前整菜单 full → 箭头禁用），箭头按新数据保持可点。
    const filletArrow = within(ribbon).getByRole('button', { name: '圆角 ▾' }) as HTMLButtonElement;
    expect(filletArrow.disabled).toBe(false);
    await user.click(within(ribbon).getByRole('button', { name: '线性阵列 ▾' }));
    const menu = within(document.body).getByRole('menu', { name: '线性阵列' });
    const circular = within(menu).getByRole('menuitem', { name: '环形阵列' });
    const curve = within(menu).getByRole('menuitem', { name: '曲线阵列' });
    expect(circular.getAttribute('aria-disabled')).toBe('true');
    expect(curve.getAttribute('aria-disabled')).not.toBe('true');
    await user.click(curve);
    expect(screen.getByRole('dialog', { name: '曲线阵列（规划中）' })).toBeDefined();
    expect(mocks.toolsRun).not.toHaveBeenCalled();
  });
});

describe('ADR-0017 追补：草图对话框即切换草图工具栏', () => {
  it('openSketchDialog → 草图工具栏（工具禁用）；enterSketch → 启用；关闭还原特征工具栏', () => {
    render(<Ribbon />);
    const ribbon = screen.getByTestId('part-studio-ribbon');
    expect(within(ribbon).getByRole('toolbar', { name: '特征工具' })).toBeDefined();

    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    expect(within(ribbon).getByRole('toolbar', { name: '草图工具' })).toBeDefined();
    const line = within(ribbon).getByRole('button', { name: '线' }) as HTMLButtonElement;
    expect(line.disabled || line.getAttribute('aria-disabled') === 'true').toBe(true);
    // 下拉箭头与主钮同步禁用（草图未激活 → 整组禁用）。
    const rect = within(ribbon).getByRole('button', { name: '拐角矩形' }) as HTMLButtonElement;
    const rectArrow = within(ribbon).getByRole('button', { name: '拐角矩形 ▾' }) as HTMLButtonElement;
    expect(rect.disabled).toBe(true);
    expect(rectArrow.disabled).toBe(true);
    expect(
      (within(ribbon).getByRole('button', { name: /搜索工具/ }) as HTMLButtonElement).disabled,
    ).toBe(true);

    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    const enabledLine = within(screen.getByTestId('part-studio-ribbon'))
      .getByRole('button', { name: '线' }) as HTMLButtonElement;
    expect(enabledLine.disabled).toBe(false);
    const enabledRectArrow = within(screen.getByTestId('part-studio-ribbon'))
      .getByRole('button', { name: '拐角矩形 ▾' }) as HTMLButtonElement;
    expect(enabledRectArrow.disabled).toBe(false);

    act(() => {
      usePartStudioStore.getState().exitSketch();
      usePartStudioStore.getState().closeDialog();
    });
    expect(within(screen.getByTestId('part-studio-ribbon')).getByRole('toolbar', { name: '特征工具' })).toBeDefined();
  });
});

describe('W23 草图变体群组：主钮=最近使用变体（live 2026-11-17）', () => {
  /** 进入草图编辑（工具栏切换为草图组；变体状态为 Ribbon 本地 state）。 */
  function enterSketchMode(): void {
    act(() => usePartStudioStore.getState().enterSketch('sk-1'));
  }

  function button(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
  }

  /** 打开圆弧飞菜单并选「圆心圆弧」。 */
  async function pickCenterArc(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(button('三点圆弧 ▾'));
    await user.click(screen.getByRole('menuitem', { name: '圆心圆弧' }));
  }

  it('飞菜单选圆心圆弧 → 主钮切换为该变体；点主钮再跑同一变体', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    enterSketchMode();
    await pickCenterArc(user);
    expect(mocks.toolsRun).toHaveBeenCalledWith('Sketch.CenterArc');
    const main = button('圆心圆弧');
    expect(main.getAttribute('aria-label')).toBe('圆心圆弧');
    expect(main.getAttribute('title')).toBe('圆心圆弧');
    // 激活态跟随当前展示变体：圆弧组主钮压按（activeToolId === selectedId），
    // 未激活的矩形组主钮不压按。
    expect(main.getAttribute('aria-pressed')).toBe('true');
    expect(button('拐角矩形').getAttribute('aria-pressed')).toBe('false');
    mocks.toolsRun.mockClear();
    await user.click(main);
    expect(mocks.toolsRun).toHaveBeenCalledWith('Sketch.CenterArc');
  });

  it('回选 3 点圆弧（父行）→ 主钮恢复组主工具 title 三点圆弧 (a)；主钮激活 Sketch.Arc3Point', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    enterSketchMode();
    await pickCenterArc(user);
    await user.click(button('三点圆弧 ▾'));
    await user.click(screen.getByTestId('part-studio-ribbon-menu-row-Sketch.Arc3Point'));
    const main = button('三点圆弧');
    expect(main.getAttribute('aria-label')).toBe('三点圆弧');
    expect(main.getAttribute('title')).toBe('三点圆弧 (a)');
    mocks.toolsRun.mockClear();
    await user.click(main);
    expect(mocks.toolsRun).toHaveBeenCalledWith('Sketch.Arc3Point');
  });

  it('中心点矩形选中 → 矩形组主钮 title 中心点矩形 (r)', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    enterSketchMode();
    await user.click(button('拐角矩形 ▾'));
    await user.click(screen.getByTestId('part-studio-ribbon-menu-row-Sketch.CenterRectangle'));
    expect(mocks.toolsRun).toHaveBeenCalledWith('Sketch.CenterRectangle');
    const main = button('中心点矩形');
    expect(main.getAttribute('aria-label')).toBe('中心点矩形');
    expect(main.getAttribute('title')).toBe('中心点矩形 (r)');
  });

  it('工具空闲/Escape 不还原变体；退出再进入草图仍保持（会话内状态）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    enterSketchMode();
    await pickCenterArc(user);
    act(() => usePartStudioStore.getState().setActiveTool(null));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(button('圆心圆弧').getAttribute('title')).toBe('圆心圆弧');
    act(() => usePartStudioStore.getState().exitSketch());
    expect(screen.getByRole('toolbar', { name: '特征工具' })).toBeDefined();
    enterSketchMode();
    expect(button('圆心圆弧').getAttribute('title')).toBe('圆心圆弧');
  });

  it('快捷键 a 经快捷路径记录变体：组主钮回到 3 点圆弧并激活 Sketch.Arc3Point', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    enterSketchMode();
    await pickCenterArc(user);
    mocks.toolsRun.mockClear();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'a' });
    });
    expect(mocks.toolsRun).toHaveBeenCalledWith('Sketch.Arc3Point');
    const main = button('三点圆弧');
    expect(main.getAttribute('title')).toBe('三点圆弧 (a)');
  });

  it('飞菜单行 title 携带 live tooltip（相切弧/三点圆弧 (a)/草图倒角）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    enterSketchMode();
    await user.click(button('三点圆弧 ▾'));
    expect(screen.getByRole('menuitem', { name: '相切圆弧' }).getAttribute('title')).toBe('相切弧');
    expect(
      screen.getByTestId('part-studio-ribbon-menu-row-Sketch.Arc3Point').getAttribute('title'),
    ).toBe('三点圆弧 (a)');
    // 选行收合圆弧菜单后打开圆角飞菜单。
    await user.click(screen.getByRole('menuitem', { name: '圆心圆弧' }));
    await user.click(button('草图圆角 ▾'));
    expect(screen.getByRole('menuitem', { name: '倒角' }).getAttribute('title')).toBe('草图倒角');
  });
});

describe('W26 特征变体群组：主钮=最近使用变体（live 2026-11-17）', () => {
  function button(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
  }

  it('线性阵列→环形阵列：主钮切变体并开圆周对话框；回选父行恢复线性并开线性对话框', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(button('线性阵列 ▾'));
    await user.click(screen.getByRole('menuitem', { name: '环形阵列' }));
    const circularMain = button('环形阵列');
    expect(circularMain.getAttribute('aria-label')).toBe('环形阵列');
    expect(circularMain.getAttribute('title')).toBe('环形阵列');
    // 选行即经激活路由开 new/pattern 圆周对话框。
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'pattern',
      patternKind: 'circular',
    });
    // 主钮激活态 = store 激活命令命中当前展示变体（W26）。
    act(() => usePartStudioStore.getState().setActiveTool('CircularPattern'));
    expect(button('环形阵列').getAttribute('aria-pressed')).toBe('true');
    act(() => usePartStudioStore.getState().setActiveTool(null));
    // 点主钮 = 再次激活当前变体（圆周对话框），不投直改工具。
    mocks.toolsRun.mockClear();
    await user.click(button('环形阵列'));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'pattern',
      patternKind: 'circular',
    });
    // 回选父行 → 主钮恢复线性阵列；主钮开线性对话框。
    await user.click(button('线性阵列 ▾'));
    await user.click(screen.getByTestId('part-studio-ribbon-menu-row-LinearPattern'));
    expect(button('线性阵列').getAttribute('title')).toBe('线性阵列');
    await user.click(button('线性阵列'));
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'pattern',
      patternKind: 'linear',
    });
  });

  it('圆角→面混合：主钮切面混合；点主钮开能力引导（gated，不静默 no-op）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(button('圆角 ▾'));
    await user.click(screen.getByRole('menuitem', { name: '面混合' }));
    // W26：面混合无工具/后端通道 → 选行即走 gated 引导（不再静默 tools.run 失败）。
    expect(screen.getByRole('dialog', { name: '面混合（规划中）' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '知道了' }));
    const main = button('面混合');
    expect(main.getAttribute('aria-label')).toBe('面混合');
    expect(main.getAttribute('title')).toBe('面混合');
    mocks.toolsRun.mockClear();
    await user.click(main);
    expect(screen.getByRole('dialog', { name: '面混合（规划中）' })).toBeDefined();
    expect(mocks.toolsRun).not.toHaveBeenCalled();
  });

  it('选面混合后 shift+f → 变体回到圆角并开 new/fillet 对话框（特征快捷路径记录父变体）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(button('圆角 ▾'));
    await user.click(screen.getByRole('menuitem', { name: '面混合' }));
    await user.click(screen.getByRole('button', { name: '知道了' }));
    expect(button('面混合')).toBeDefined();
    mocks.toolsRun.mockClear();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'f', shiftKey: true });
    });
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'fillet',
    });
    expect(button('圆角').getAttribute('title')).toBe('圆角 (shift+f)');
    expect(mocks.toolsRun).not.toHaveBeenCalled();
  });

  it('特征变体在草图工具栏开关前后保持（同一 Ribbon 会话 state）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(button('线性阵列 ▾'));
    await user.click(screen.getByRole('menuitem', { name: '环形阵列' }));
    act(() => usePartStudioStore.getState().closeDialog());
    act(() => usePartStudioStore.getState().enterSketch('sk-1'));
    expect(
      within(screen.getByTestId('part-studio-ribbon')).getByRole('toolbar', { name: '草图工具' }),
    ).toBeDefined();
    act(() => usePartStudioStore.getState().exitSketch());
    expect(button('环形阵列').getAttribute('title')).toBe('环形阵列');
  });
});

describe('W29 特征对话框打开 → ribbon 主钮激活态（live 2026-11-17）', () => {
  function button(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
  }

  /** 特征工具栏内所有 aria-pressed=true 的主钮（箭头/撤销组无该属性）。 */
  function pressedFeatureMains(): HTMLElement[] {
    const ribbon = screen.getByTestId('part-studio-ribbon');
    return within(ribbon)
      .getAllByRole('button')
      .filter((el) => el.getAttribute('aria-pressed') === 'true');
  }

  it('点拉伸 → 拉伸主钮 aria-pressed=true；关闭对话框 → false', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(button('拉伸'));
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'extrude',
    });
    expect(button('拉伸').getAttribute('aria-pressed')).toBe('true');
    act(() => usePartStudioStore.getState().closeDialog());
    expect(button('拉伸').getAttribute('aria-pressed')).toBe('false');
  });

  it('点圆角 → 圆角主钮 aria-pressed=true；关闭对话框 → false', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(button('圆角'));
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'fillet',
    });
    expect(button('圆角').getAttribute('aria-pressed')).toBe('true');
    act(() => usePartStudioStore.getState().closeDialog());
    expect(button('圆角').getAttribute('aria-pressed')).toBe('false');
  });

  it('飞菜单选环形阵列 → 展示中的环形阵列主钮在圆周对话框期间 true；关闭 → false（变体保持）', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(button('线性阵列 ▾'));
    await user.click(screen.getByRole('menuitem', { name: '环形阵列' }));
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'pattern',
      patternKind: 'circular',
    });
    const main = button('环形阵列');
    expect(main.getAttribute('aria-pressed')).toBe('true');
    act(() => usePartStudioStore.getState().closeDialog());
    expect(button('环形阵列').getAttribute('aria-pressed')).toBe('false');
    // 变体保持（本次会话的最近使用变体不受对话框关闭影响）。
    expect(button('环形阵列').getAttribute('title')).toBe('环形阵列');
  });

  it('edit/pattern（不携带 kind）与非映射 edit 对话框（featurePattern）→ 无特征主钮压按（不伪造高亮）', () => {
    render(<Ribbon />);
    act(() => usePartStudioStore.getState().openFeatureDialog({
      mode: 'edit',
      featureId: 'feature-1',
      featureName: '线性阵列 1',
      featureType: 'pattern',
    }));
    expect(pressedFeatureMains()).toEqual([]);
    act(() => usePartStudioStore.getState().closeDialog());
    act(() => usePartStudioStore.getState().openFeatureDialog({
      mode: 'edit',
      featureId: 'feature-2',
      featureName: '特征阵列 1',
      featureType: 'featurePattern',
    }));
    expect(pressedFeatureMains()).toEqual([]);
  });

  it('草图对话框不触发特征主钮高亮（草图工具栏渲染路径不变）', () => {
    render(<Ribbon />);
    act(() => usePartStudioStore.getState().openSketchDialog());
    expect(screen.getByRole('toolbar', { name: '草图工具' })).toBeDefined();
    expect(pressedFeatureMains()).toEqual([]);
  });
});

describe('工具快捷键（Onshape 口径，主钮 shortcut 元数据可执行）', () => {
  it('shift+s → 草图对话框；shift+e → 拉伸对话框（同一 activate 路由）', async () => {
    render(<Ribbon />);
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', shiftKey: true });
    });
    expect(usePartStudioStore.getState().dialog).toMatchObject({ active: 'sketch' });

    act(() => usePartStudioStore.getState().closeDialog());
    await act(async () => {
      fireEvent.keyDown(window, { key: 'e', shiftKey: true });
    });
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'extrude',
    });
  });

  it('输入框焦点/额外修饰键不触发', async () => {
    render(<Ribbon />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 's', shiftKey: true });
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
    input.remove();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'e', shiftKey: true, ctrlKey: true });
    });
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
  });

  it('草图编辑态忽略 shift+s（不叠开新建草图对话框）', async () => {
    render(<Ribbon />);
    act(() => {
      usePartStudioStore.getState().enterSketch('sk-1');
    });
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', shiftKey: true });
    });
    expect(usePartStudioStore.getState().dialog.active).not.toBe('sketch');
  });
});

// ── ADR-0020 S3b：变量命令入口 ──────────────────────────────────────────────
describe('ADR-0020 S3b：特征工具栏「变量」入口', () => {
  it('渲染真实按钮（fx sprite/文案）→ 打开变量对话框新建态；不投 tools.run', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    const button = screen.getByTestId('part-studio-ribbon-variables');
    expect(button.getAttribute('aria-label')).toBe('变量');
    expect(button.querySelector('svg')).not.toBeNull();
    await user.click(button);
    expect(usePartStudioStore.getState().variablesDialog).toEqual({ active: 'variables' });
    expect(mocks.toolsRun).not.toHaveBeenCalled();
  });
});

// ── ADR-0020 S3b review P2-3：只读/加载中变量入口禁用 ───────────────────────
describe('ADR-0020 S3b：变量入口的只读/加载门', () => {
  it('canEdit=false → 变量按钮禁用 + readonlyHint title（不可打开对话框）', () => {
    render(<Ribbon canEdit={false} />);
    const button = screen.getByTestId('part-studio-ribbon-variables') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect((button.getAttribute('title') ?? '').length).toBeGreaterThan(0);
    fireEvent.click(button);
    expect(usePartStudioStore.getState().variablesDialog.active).toBeNull();
  });

  it('variablesReady=false（读取失败）→ 变量按钮禁用（P2-1 写门）', () => {
    render(<Ribbon variablesReady={false} />);
    const button = screen.getByTestId('part-studio-ribbon-variables') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect((button.getAttribute('title') ?? '').length).toBeGreaterThan(0);
    fireEvent.click(button);
    expect(usePartStudioStore.getState().variablesDialog.active).toBeNull();
  });

  it('variablesLoading=true（ready 必为 false）→ 禁用且提示加载中（不是读取失败）', () => {
    render(<Ribbon variablesLoading variablesReady={false} />);
    const button = screen.getByTestId('part-studio-ribbon-variables') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title') ?? '').toContain('加载');
    expect(button.getAttribute('title') ?? '').not.toContain('读取失败');
    fireEvent.click(button);
    expect(usePartStudioStore.getState().variablesDialog.active).toBeNull();
  });

  it('variablesScopeActive=false（未连接/PS 未就绪）→ 禁用且提示未就绪', () => {
    render(<Ribbon variablesReady={false} variablesScopeActive={false} />);
    const button = screen.getByTestId('part-studio-ribbon-variables') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title') ?? '').toContain('尚未就绪');
  });

  it('variablesError（读取失败）→ 禁用且提示读取失败', () => {
    render(<Ribbon variablesReady={false} variablesError="boom" />);
    const button = screen.getByTestId('part-studio-ribbon-variables') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title') ?? '').toContain('读取失败');
  });
});
