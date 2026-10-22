// src/modules/part-studio/test/SketchDialog.test.tsx
//
// M3 Task 6（brief Step 1）：草图对话框（对齐 os-30）+ 草图模式全 UI 变身——
//  1) SketchDialog 非模态：role=dialog + aria-modal=false + 无 backdrop；标题
//     = 草图名（props sketchName 缺省「草图」）；
//  2) 草图平面选择：下拉（缺省基准面 上视/前视/右视 + 占位项）+ 快速拾取
//     （store.canvas.selection 主选择回流成动态选项并选中）；
//  3) 四开关（os-30 勾选组）：禁用压印/显示约束/显示表达式/显示错误——
//     默认仅「显示错误」勾选；全进确认载荷；
//  4) ✓确认 → onConfirm 载荷 + store enterSketch（sketchId 缺省 'sketch-active'）；
//     ✗取消 → onCancel + store exitSketch 复位；
//  5) 历史时钟钮 + ? 帮助（展开帮助文案）；
//  6) 草图模式全 UI 变身（store.sketch 驱动）：
//     - ribbon 切换为草图工具组（绘制/编辑/标注三组），特征工具组隐去，
//       命令搜索触发钮禁用（os-30「search 框禁用」），退出草图按钮在场；
//     - 画布叠加层：栅格覆盖层 + 约束覆盖层（sketch 激活时出现）；
//     - 双段树红显活动草图行（data-sketch-active）；
//     - PartStudioCanvas 宿主路：store.dialog 驱动 FeatureDialog/SketchDialog
//       在画布内联渲染（openFeatureDialog/openSketchDialog）。
//
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// 真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { JSX } from 'react';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toolsRun: vi.fn(),
  /** 测试可改写：null=无 viewport（emphasize 效果静默跳过）。 */
  viewport: null as unknown,
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
    viewManager: {
      get selectedView() {
        return mocks.viewport;
      },
    },
  },
  EmphasizeElements: {
    getOrCreate: () => ({
      emphasizeElements: vi.fn(),
      clearEmphasizedElements: vi.fn(),
      hideElements: vi.fn(),
    }),
  },
  // barrel 经 PartStudioPage 链式引入 viewport-actions（StandardViewId 顶层映射）。
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import type { FeatureTreeEntry } from '@luban-cad/shared';
import type { CanvasSelection } from '../index.js';
import { usePartStudioStore } from '../index.js';
import type { SketchDialogResult } from '../dialogs/SketchDialog.js';
import { SketchDialog } from '../dialogs/SketchDialog.js';
import { Ribbon } from '../ribbon/Ribbon.js';
import { CommandPalette } from '../ribbon/CommandPalette.js';
import { FeatureTree } from '../tree/FeatureTree.js';
import { PartStudioCanvas } from '../components/PartStudioCanvas.js';
import { TOOL_CAPABILITIES } from '../internal/capabilities.js';
import { SKETCH_TOOL_GROUP_ORDER, SKETCH_RIBBON_TOOLS } from '../ribbon/sketch-tools.js';
import zhPartStudio from '../../../common/i18n/locales/zh-CN/part-studio.json';
import enPartStudio from '../../../common/i18n/locales/en/part-studio.json';

/** 词库取值：按点路径走 JSON（与 ribbon-registry.test 同工艺）。 */
function lookup(dict: unknown, dottedPath: string): unknown {
  let node: unknown = dict;
  for (const segment of dottedPath.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

describe('SKETCH_RIBBON_TOOLS 草图工具注册表（os-30）', () => {
  it('12 工具在册：id 唯一、组序绘制→编辑→标注、组内排布有序', () => {
    expect(SKETCH_RIBBON_TOOLS).toHaveLength(12);
    const ids = SKETCH_RIBBON_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SKETCH_TOOL_GROUP_ORDER).toEqual(['sketchDraw', 'sketchEdit', 'sketchAnnotate']);
    const ordered = [...SKETCH_RIBBON_TOOLS].sort(
      (a, b) => SKETCH_TOOL_GROUP_ORDER.indexOf(a.group) - SKETCH_TOOL_GROUP_ORDER.indexOf(b.group),
    );
    expect(SKETCH_RIBBON_TOOLS.map((tool) => tool.id)).toEqual(ordered.map((tool) => tool.id));
  });

  it('capability 统一 sketch（已入册 TOOL_CAPABILITIES）；labelKey 挂 partStudio.ribbon.* 且在 zh/en 词库存在', () => {
    for (const tool of SKETCH_RIBBON_TOOLS) {
      expect(tool.capability).toBe('sketch');
      expect(TOOL_CAPABILITIES[tool.capability]).toBeDefined();
      expect(tool.labelKey.startsWith('partStudio.ribbon.')).toBe(true);
      const localPath = tool.labelKey.replace(/^partStudio\./, '');
      const zh = lookup(zhPartStudio, localPath);
      const en = lookup(enPartStudio, localPath);
      expect(typeof zh).toBe('string');
      expect((zh as string).length).toBeGreaterThan(0);
      expect(typeof en).toBe('string');
      expect((en as string).length).toBeGreaterThan(0);
    }
  });
});

/** store 复位：canvas/tree/sketch/dialog 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    sketch: { isActive: false, activeSketchId: null },
    dialog: { active: null },
    tool: { activeToolId: null },
    commandPalette: { isOpen: false, query: '', highlightEnabled: true },
  });
}

function setSelection(selection: readonly CanvasSelection[]): void {
  usePartStudioStore.setState((s) => ({ canvas: { ...s.canvas, selection: [...selection] } }));
}

function renderDialog(props: Partial<Parameters<typeof SketchDialog>[0]> = {}): {
  onConfirm: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<SketchDialog onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel };
}

// M4-T6：FeatureTree 数据源切 entries（useFeatureSystem.tree 同形）；sketch
// 行经类型回退呈现原始 featureType（诚实呈现，未入 featureTypes 词库的类型
// 不伪造本地化名）。
const SKETCH_ENTRIES: FeatureTreeEntry[] = [
  { id: 'sk1', featureType: 'sketch', orderKey: 1, suppressed: false, status: 0, params: {} },
  { id: 'ex1', featureType: 'extrude', orderKey: 2, suppressed: false, status: 0, params: {} },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewport = null;
  resetStore();
});

describe('SketchDialog 非模态结构（os-30）', () => {
  it('role=dialog + aria-modal=false + 无 backdrop；缺省标题「草图」', () => {
    const { container } = render(<SketchDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '草图' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(container.querySelector('.part-studio-dialog-backdrop')).toBeNull();
  });

  it('sketchName 入标题（「Sketch 1」）', () => {
    render(<SketchDialog sketchName="Sketch 1" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Sketch 1' })).toBeDefined();
  });

  it('✓/✗ + 历史时钟 + ? 帮助 全在标题行', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: '草图' });
    const header = dialog.querySelector('.part-studio-sketch-dialog__header');
    expect(header).not.toBeNull();
    for (const name of ['确认', '取消', '历史', '帮助']) {
      expect(within(header as HTMLElement).getByRole('button', { name })).toBeDefined();
    }
  });

  it('? 帮助展开/收合帮助文案（aria-expanded）', async () => {
    const user = userEvent.setup();
    renderDialog();
    const help = screen.getByRole('button', { name: '帮助' });
    expect(screen.queryByRole('note')).toBeNull();
    await user.click(help);
    expect(screen.getByRole('note')).toBeDefined();
    await user.click(help);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('草图平面选择（select + 快速拾取）', () => {
  it('缺省基准面选项：占位项 + 上视/前视/右视', () => {
    renderDialog();
    const select = screen.getByRole('combobox', { name: '草图平面' });
    for (const label of ['选择草图平面…', '上视', '前视', '右视']) {
      expect(within(select).getByRole('option', { name: label })).toBeDefined();
    }
    // 占位项选中（未选面）。
    expect((select as HTMLSelectElement).value).toBe('');
  });

  it('选面 → 进确认载荷；planes 可注入覆盖缺省基准面', async () => {
    const { onConfirm } = renderDialog({
      planes: [
        { id: 'plane-a', label: '基准面 A' },
        { id: 'plane-b', label: '基准面 B' },
      ],
    });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: '草图平面' }), 'plane-b');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect((onConfirm.mock.calls[0]![0] as SketchDialogResult).plane).toBe('plane-b');
  });

  it('快速拾取：画布主选择成动态选项并选中（label 回退 id）', async () => {
    setSelection([
      { kind: 'face', id: 'face-9', label: '面 9' },
      { kind: 'face', id: 'face-8', label: '面 8' },
    ]);
    const { onConfirm } = renderDialog();
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog', { name: '草图' });
    await user.click(within(dialog).getByRole('button', { name: '快速拾取' }));
    const select = screen.getByRole('combobox', { name: '草图平面' });
    // 主选择=选择集最后一项（useCanvasSelection.primary 口径）。
    expect((select as HTMLSelectElement).value).toBe('face-8');
    expect(within(select).getByRole('option', { name: '面 8' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect((onConfirm.mock.calls[0]![0] as SketchDialogResult).plane).toBe('face-8');
  });
});

describe('四开关（os-30 勾选组）', () => {
  it('禁用压印/显示约束/显示表达式/显示错误全渲染；默认仅「显示错误」勾选', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: '草图' });
    const group = within(dialog).getByRole('group', { name: '草图选项' });
    expect((within(group).getByRole('checkbox', { name: '禁用压印' }) as HTMLInputElement).checked).toBe(false);
    expect((within(group).getByRole('checkbox', { name: '显示约束' }) as HTMLInputElement).checked).toBe(false);
    expect((within(group).getByRole('checkbox', { name: '显示表达式' }) as HTMLInputElement).checked).toBe(false);
    expect((within(group).getByRole('checkbox', { name: '显示错误' }) as HTMLInputElement).checked).toBe(true);
  });

  it('开关翻转全进确认载荷', async () => {
    const { onConfirm } = renderDialog();
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog', { name: '草图' });
    await user.click(within(dialog).getByRole('checkbox', { name: '禁用压印' }));
    await user.click(within(dialog).getByRole('checkbox', { name: '显示约束' }));
    await user.click(within(dialog).getByRole('checkbox', { name: '显示表达式' }));
    await user.click(within(dialog).getByRole('checkbox', { name: '显示错误' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    const payload = onConfirm.mock.calls[0]![0] as SketchDialogResult;
    expect(payload).toEqual({
      plane: '',
      disableImprint: true,
      showConstraints: true,
      showExpressions: true,
      showErrors: false,
    });
  });
});

describe('确认/取消 ↔ store.sketch 联动', () => {
  it('✓确认 → onConfirm 载荷 + enterSketch（缺省 id sketch-active）', async () => {
    const { onConfirm } = renderDialog({ sketchId: 'sketch-7' });
    await userEvent.setup().click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(usePartStudioStore.getState().sketch).toEqual({ isActive: true, activeSketchId: 'sketch-7' });
  });

  it('✗取消 → onCancel + exitSketch 复位（进行中草图退出）', async () => {
    usePartStudioStore.getState().enterSketch('sketch-9');
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().sketch).toEqual({ isActive: false, activeSketchId: null });
  });
});

describe('草图模式全 UI 变身（store.sketch 驱动）', () => {
  it('ribbon 切换为草图工具组：特征工具隐去 + 搜索禁用 + 退出草图在场', () => {
    usePartStudioStore.getState().enterSketch('sk1');
    render(<Ribbon />);
    expect(screen.getByRole('toolbar', { name: '草图工具' })).toBeDefined();
    // 草图绘制工具在场（os-30 组：线/矩形/圆…）。
    for (const name of ['线', '矩形', '圆', '尺寸', '约束']) {
      expect(screen.getByRole('button', { name })).toBeDefined();
    }
    // 特征工具组隐去（拉伸/抽壳只在特征 ribbon——草图组的圆角/镜像同名不同族，不作案据）。
    expect(screen.queryByRole('button', { name: '拉伸' })).toBeNull();
    expect(screen.queryByRole('button', { name: '抽壳' })).toBeNull();
    // os-30：search 框禁用。
    expect(screen.getByRole('button', { name: /搜索工具/ }).hasAttribute('disabled')).toBe(true);
    // 退出草图按钮在场。
    expect(screen.getByRole('button', { name: '退出草图' })).toBeDefined();
  });

  it('草图工具点击 → tools.run(sketchLine)；退出草图 → sketch 复位 + 特征 ribbon 还原', async () => {
    usePartStudioStore.getState().enterSketch('sk1');
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '线' }));
    expect(mocks.toolsRun).toHaveBeenCalledWith('sketchLine');
    await user.click(screen.getByRole('button', { name: '退出草图' }));
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
    // ribbon 还原：特征工具组回来。
    expect(screen.getByRole('toolbar', { name: '特征工具' })).toBeDefined();
    expect(screen.getByRole('button', { name: '拉伸' })).toBeDefined();
  });

  it('画布叠加层：sketch 激活 → 栅格/约束覆盖层出现，退出即消', () => {
    const { unmount } = render(<PartStudioCanvas viewportRef={{ current: null }} />);
    expect(screen.queryByTestId('sketch-grid-overlay')).toBeNull();
    expect(screen.queryByTestId('sketch-constraints-overlay')).toBeNull();
    act(() => {
      usePartStudioStore.getState().enterSketch('sk1');
    });
    expect(screen.getByTestId('sketch-grid-overlay')).toBeDefined();
    expect(screen.getByTestId('sketch-constraints-overlay')).toBeDefined();
    act(() => {
      usePartStudioStore.getState().exitSketch();
    });
    expect(screen.queryByTestId('sketch-grid-overlay')).toBeNull();
    unmount();
  });

  it('树红显活动草图行（data-sketch-active），退出即消', () => {
    render(<FeatureTree entries={SKETCH_ENTRIES} />);
    const row = screen.getByTestId('tree-row-sk1');
    expect(row.getAttribute('data-sketch-active')).toBeNull();
    act(() => {
      usePartStudioStore.getState().enterSketch('sk1');
    });
    expect(screen.getByTestId('tree-row-sk1').getAttribute('data-sketch-active')).toBe('true');
    // 非活动草图不受影响。
    expect(screen.getByTestId('tree-row-ex1').getAttribute('data-sketch-active')).toBeNull();
    act(() => {
      usePartStudioStore.getState().exitSketch();
    });
    expect(screen.getByTestId('tree-row-sk1').getAttribute('data-sketch-active')).toBeNull();
  });

  it('画布宿主路：openFeatureDialog → 内联 FeatureDialog；closeDialog 收合', () => {
    render(<PartStudioCanvas viewportRef={{ current: null }} />);
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({
        mode: 'edit',
        featureId: 'ex1',
        featureName: 'Extrude 1',
        featureType: 'extrude',
      });
    });
    expect(screen.getByRole('dialog', { name: 'Extrude 1' })).toBeDefined();
    act(() => {
      usePartStudioStore.getState().closeDialog();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('画布宿主路：openSketchDialog（newSketch 路由）→ 内联 SketchDialog；✓确认进草图模式', async () => {
    const user = userEvent.setup();
    render(<PartStudioCanvas viewportRef={{ current: null }} />);
    // ribbon 激活路由：草图工具钮 → 开 SketchDialog（不经 tools.run）。
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '草图' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog.active).toBe('sketch');
    const dialog = screen.getByRole('dialog', { name: '草图' });
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    expect(usePartStudioStore.getState().sketch.isActive).toBe(true);
    // 对话框已提交收合（宿主 closeDialog）。
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('os-30「search 框禁用」：草图模式 alt+/ 不响应 + 进入草图强制收合面板', () => {
    render(<CommandPalette />);
    // 常规态：alt+/ 开合。
    fireEvent.keyDown(window, { key: '/', altKey: true });
    expect(screen.getByRole('dialog', { name: '搜索工具' })).toBeDefined();
    // 进入草图模式 → 强制收合；alt+/ 不再响应。
    act(() => {
      usePartStudioStore.getState().enterSketch('sk1');
    });
    expect(screen.queryByRole('dialog', { name: '搜索工具' })).toBeNull();
    fireEvent.keyDown(window, { key: '/', altKey: true });
    expect(screen.queryByRole('dialog', { name: '搜索工具' })).toBeNull();
    // 退出草图 → alt+/ 恢复开合。
    act(() => {
      usePartStudioStore.getState().exitSketch();
    });
    fireEvent.keyDown(window, { key: '/', altKey: true });
    expect(screen.getByRole('dialog', { name: '搜索工具' })).toBeDefined();
  });
});

// 类型面 sanity：JSX 消费方按契约形状取键（编译期守卫，无运行断言）。
const _typeCheck: JSX.Element = (
  <SketchDialog
    sketchName="Sketch 2"
    sketchId="sketch-2"
    planes={[{ id: 'p1', label: '面 1' }]}
    onConfirm={(result: SketchDialogResult) => void result}
    onCancel={() => undefined}
  />
);
void _typeCheck;
