// src/modules/part-studio/test/Ribbon.test.tsx
//
// M4 Task 6（brief Step 1）：ribbon「拉伸」特例路由——拉伸闭环入口——
//  1) 拉伸点击 → store.dialog = { active:'feature', mode:'new',
//     featureType:'extrude' }（FeatureDialog 由画布宿主按 dialog 寻址渲染），
//     不投 IModelApp.tools.run、不写 tool.activeToolId（同 newSketch→SketchDialog
//     姿态：对话框流程非 PrimitiveTool 激活）；
//  2) 其余 full 工具不回归：扫掠点击仍投 tools.run + 写激活态（旋转/圆角已
//     同姿态改道对话框——M6-b T4/T6）；
//  3) gated 工具（拔模）不回归：开能力引导对话框。
//
// 定位：激活路由验收层（此前 ribbon 结构/激活冒烟挂 CommandPalette.test.tsx，
// 本任务拉伸特例路由新增独立文件）。@itwin/core-frontend 模块级 mock，真实
// store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import { render, screen } from '@testing-library/react';
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
    // FeatureDialog 提交成功走 notifications 通道（与保存错误面同款）。
    notifications: { outputMessage: vi.fn() },
  },
}));

import { usePartStudioStore } from '../index.js';
import { Ribbon } from '../ribbon/Ribbon.js';

/** store 复位：tool/dialog 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    tool: { activeToolId: null },
    dialog: { active: null },
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
    await user.click(screen.getByRole('button', { name: '线性阵列 ▾' }));
    await user.click(screen.getByRole('menuitem', { name: '环形阵列' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().tool.activeToolId).toBeNull();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'new',
      featureType: 'pattern',
      patternKind: 'circular',
    });
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

  it('gated 工具不回归：拔模点击开能力引导对话框', async () => {
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '拔模' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '拔模（规划中）' })).toBeDefined();
  });
});
