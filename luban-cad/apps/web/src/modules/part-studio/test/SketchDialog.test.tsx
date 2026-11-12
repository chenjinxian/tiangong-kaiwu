// src/modules/part-studio/test/SketchDialog.test.tsx
//
// M3 Task 6（brief Step 1）：草图对话框（对齐 os-30）+ 草图模式全 UI 变身——
//  1) SketchDialog 非模态：role=dialog + aria-modal=false + 无 backdrop；标题
//     = 草图名（props sketchName 缺省「草图」）；
//  2) 草图平面选择：下拉（缺省基准面 上视/前视/右视 + 占位项）+ 快速拾取
//     （仅 kind='face' 的 store.canvas.selection 主选择回流成动态选项并选中；
//     part/edge/vertex/feature 主选择不添选项、不改所选——F2）；
//  3) 四开关（os-30 勾选组）：禁用压印/显示约束/显示表达式/显示错误——
//     Onshape live 默认：显示约束/显示表达式/显示错误勾选，禁用压印不勾；全进确认载荷；
//  4) ✓确认 → onConfirm 载荷 + store enterSketch（M6-a T4 起：applyOp 在场
//     → insertSketch RPC 真 sketchId 入 store 废 'sketch-active' 占位；壳期
//     未接线回退 sketchId 缺省 'sketch-active'）；✗取消 → onCancel + store
//     exitSketch 复位；
//  5) 缩放到合适大小钮 + ? 帮助（展开帮助文案）；
//  6) M6-a T4（F1）：insertSketch op 接线——plane 三基准面映射（上视 XY/
//     前视 XZ/右视 YZ）随 op 下发、非基准面省略 plane 键；ok:false/异常 →
//     就地 Alert 不进草图；canEdit=false → ✓ 禁用+只读提示；提交中禁重入；
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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toolsRun: vi.fn(),
  /** 测试可改写：null=无 viewport（emphasize 效果静默跳过）。 */
  viewport: null as unknown,
}));

// B-model v1.17：画布宿主路的 FeatureDialog 经 useWorkspaceRef 读路由 ?model=（本文件无 Router；legacy 形态）。
vi.mock('@common/workspace/use-workspace-ref.js', () => ({
  useWorkspaceRef: () => null,
}));

vi.mock('@itwin/core-frontend', () => ({
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

import type { FeatureOp, FeatureOpResult, FeatureTreeEntry } from '@luban-cad/shared';
import { usePartStudioStore } from '../index.js';
import type { SketchDialogResult } from '../dialogs/SketchDialog.js';
import { SketchDialog, sketchPlaneFromOption } from '../dialogs/SketchDialog.js';
import { Ribbon } from '../ribbon/Ribbon.js';
import { CommandPalette } from '../ribbon/CommandPalette.js';
import { FeatureTree } from '../tree/FeatureTree.js';
import { PartStudioCanvas } from '../components/PartStudioCanvas.js';
import { TOOL_CAPABILITIES } from '../internal/capabilities.js';
import { SKETCH_TOOL_GROUP_ORDER, SKETCH_RIBBON_TOOLS } from '../ribbon/sketch-tools.js';
import type { SketchRibbonTool } from '../ribbon/sketch-tools.js';
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
  it('20 工具在册：id 唯一、Onshape live 五组序、组内排布有序', () => {
    expect(SKETCH_RIBBON_TOOLS).toHaveLength(20);
    const ids = SKETCH_RIBBON_TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SKETCH_TOOL_GROUP_ORDER).toEqual([
      'sketchFeature', 'sketchDraw', 'sketchEdit', 'sketchDimension', 'sketchConstraint',
    ]);
    const ordered = [...SKETCH_RIBBON_TOOLS].sort(
      (a, b) => SKETCH_TOOL_GROUP_ORDER.indexOf(a.group) - SKETCH_TOOL_GROUP_ORDER.indexOf(b.group),
    );
    expect(SKETCH_RIBBON_TOOLS.map((tool) => tool.id)).toEqual(ordered.map((tool) => tool.id));
  });

  // M6-c T5：组界与组内序权威=10-sketch-toolbar.json（2026-10-23 草图模式
  // 实测）——绘制组含文本（线 矩形 圆 弧 样条 文本，采集序内插多边形/点未
  // 注册），编辑组=圆角 修剪 偏移 镜像；标注组采集仅「尺寸 重合」两钮，本仓
  // 按工具展开 8 件（约束 6 前置 + 尺寸 2，1:1 下拉归 M6-c 后续）。
  it('Onshape live 组内序：特征 2 / 绘制 10 / 编辑 6 / 尺寸 1 / 约束 1', () => {
    const labelsOf = (group: SketchRibbonTool['group']): string[] =>
      SKETCH_RIBBON_TOOLS
        .filter((tool) => tool.group === group)
        .map((tool) => lookup(zhPartStudio, tool.labelKey.replace(/^partStudio\./, '')) as string);
    expect(labelsOf('sketchFeature')).toEqual(['拉伸', '旋转']);
    expect(labelsOf('sketchDraw')).toEqual([
      '线', '拐角矩形', '中心点圆', '3 点圆弧', '内切多边形', '样条', '点', '文本', '使用', '构造',
    ]);
    expect(labelsOf('sketchEdit')).toEqual([
      '圆角', '修剪', '偏移', '镜像', '线性阵列', '插入 DXF 或 DWG',
    ]);
    expect(labelsOf('sketchDimension')).toEqual(['尺寸']);
    expect(labelsOf('sketchConstraint')).toEqual(['重合']);
    // 飞菜单子项仍在册（约束 8 + 尺寸 2 + 绘制变体），名称可寻址。
    const constraint = SKETCH_RIBBON_TOOLS.find((t) => t.id === 'Sketch.Constraint.Coincident');
    expect(constraint?.dropdownItems?.map((item) => lookup(zhPartStudio, item.labelKey.replace(/^partStudio\./, '')))).toEqual([
      '水平', '竖直', '平行', '垂直', '相等', '中点', '相切', '固定',
    ]);
    // Onshape live：只有一个「尺寸」按钮——长度/半径/距离由同一工具按拾取
    // 动态推断，不再有长度/半径下拉（2026-11-02）。
    const dimension = SKETCH_RIBBON_TOOLS.find((t) => t.id === 'Sketch.Dimension');
    expect(dimension?.dropdownItems).toBeUndefined();
    expect(SKETCH_RIBBON_TOOLS.filter((t) => t.group === 'sketchDimension')).toHaveLength(1);
    // 2026-11-02 live 截图逐钮核对：线/使用有 ▾（空数组=未实现变体保留箭头）；
    // 点/文本/镜像/构造/尺寸没有 ▾。
    for (const id of ['Sketch.Line', 'sketchUse'])
      expect(SKETCH_RIBBON_TOOLS.find((t) => t.id === id)?.dropdownItems, `${id} 应有 ▾`).toBeDefined();
    for (const id of ['Sketch.Point', 'sketchText', 'Sketch.Mirror', 'sketchConstruction', 'Sketch.Dimension'])
      expect(SKETCH_RIBBON_TOOLS.find((t) => t.id === id)?.dropdownItems, `${id} 不应有 ▾`).toBeUndefined();
  });

  it('capability 已入册；工具与飞菜单子项 labelKey 在 zh/en 词库存在', () => {
    for (const tool of SKETCH_RIBBON_TOOLS) {
      expect(['sketch', 'extrude', 'revolve']).toContain(tool.capability);
      expect(TOOL_CAPABILITIES[tool.capability]).toBeDefined();
      for (const command of [tool, ...(tool.dropdownItems ?? [])]) {
        expect(command.labelKey.startsWith('partStudio.ribbon.')).toBe(true);
        const localPath = command.labelKey.replace(/^partStudio\./, '');
        const zh = lookup(zhPartStudio, localPath);
        const en = lookup(enPartStudio, localPath);
        expect(typeof zh).toBe('string');
        expect((zh as string).length).toBeGreaterThan(0);
        expect(typeof en).toBe('string');
        expect((en as string).length).toBeGreaterThan(0);
      }
    }
  });
});

/** store 复位：canvas/tree/sketch/dialog 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null, constructionMode: false },
    dialog: { active: null },
    tool: { activeToolId: null },
    commandPalette: { isOpen: false, query: '', highlightEnabled: true },
  });
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

/**
 * Onshape live（2026-11-02）：平面字段点击展开基准面菜单（无箭头/无原生
 * select）；主路径是视口/特征树拾取，此菜单是可访问兜底。
 */
async function choosePlane(
  user: ReturnType<typeof userEvent.setup>,
  label = 'Front',
): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: '草图平面' }));
  await user.click(screen.getByRole('option', { name: label }));
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
    const dialog = screen.getByRole('dialog', { name: /^草图( 1)?$/ });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(container.querySelector('.part-studio-dialog-backdrop')).toBeNull();
  });

  it('sketchName 入标题（「Sketch 1」）', () => {
    render(<SketchDialog sketchName="Sketch 1" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Sketch 1' })).toBeDefined();
  });

  it('✓/✗ 在标题行；历史/帮助在底栏（Onshape live 布局）', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: /^草图( 1)?$/ });
    const header = dialog.querySelector('.part-studio-sketch-dialog__header');
    const footer = dialog.querySelector('.part-studio-sketch-dialog__footer');
    expect(header).not.toBeNull();
    expect(footer).not.toBeNull();
    for (const name of ['确认', '取消']) {
      expect(within(header as HTMLElement).getByRole('button', { name })).toBeDefined();
    }
    for (const name of ['缩放到合适大小', '帮助']) {
      expect(within(footer as HTMLElement).getByRole('button', { name })).toBeDefined();
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

describe('草图平面选择（Onshape 字段 + 基准面菜单）', () => {
  it('未选平面：字段占位「草图平面」+ ✓ 禁用；无原生 select/无快速拾取/无箭头', () => {
    renderDialog();
    const field = screen.getByTestId('sketch-plane-field-button');
    expect(field.textContent).toBe('草图平面');
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    // Onshape live：字段下方没有提示行（选择提示在顶部 toast）。
    expect(screen.queryByTestId('sketch-plane-hint')).toBeNull();
    // 无原生下拉/快速拾取：Onshape 主路径是视口/树拾取，字段只承载值。
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '快速拾取' })).toBeNull();
  });

  it('点击字段 → 上视/前视/右视菜单；选面 → 进确认载荷', async () => {
    const { onConfirm } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: '草图平面' }));
    for (const label of ['Top', 'Front', 'Right']) {
      expect(screen.getByRole('option', { name: label })).toBeDefined();
    }
    await user.click(screen.getByRole('option', { name: 'Front' }));
    expect(screen.getByTestId('sketch-plane-field-button').textContent).toBe('Front 平面');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect((onConfirm.mock.calls[0]![0] as SketchDialogResult).plane).toBe('front');
  });

  it('planes 可注入覆盖缺省基准面；清除按钮 → 平面清空 + ✓ 禁用', async () => {
    const { onConfirm } = renderDialog({
      planes: [
        { id: 'plane-a', label: '基准面 A' },
        { id: 'plane-b', label: '基准面 B' },
      ],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: '草图平面' }));
    await user.click(screen.getByRole('option', { name: '基准面 B' }));
    expect(screen.getByTestId('sketch-plane-field-button').textContent).toBe('基准面 B');
    await user.click(screen.getByRole('button', { name: '清除草图平面' }));
    expect(screen.getByTestId('sketch-plane-field-button').textContent).toBe('草图平面');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('v1.29 cPlane 选项：insertSketch.plane 使用选项快照并带 sourceFeatureId', async () => {
    const plane = {
      origin: { x: 0, y: -20, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
      sourceFeatureId: '0x42',
    };
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-42' }));
    const { onConfirm } = renderDialog({
      applyOp,
      planes: [{ id: '0x42', label: '平面 1', plane }],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: '草图平面' }));
    await user.click(screen.getByRole('option', { name: '平面 1' }));
    expect(screen.getByTestId('sketch-plane-field-button').textContent).toBe('平面 1');
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertSketch', entities: [], constraints: [], plane,
    });
    expect((onConfirm.mock.calls[0]![0] as SketchDialogResult).planeDto).toEqual(plane);
  });

  it('编辑既有草图：偏移/自定义平面无法映射三基准面 → 只读「自定义平面」且 ✓ 仍可完成', async () => {
    const { onConfirm } = renderDialog({ editing: true });
    const field = screen.getByTestId('sketch-plane-field-button');
    expect(field.textContent).toBe('自定义平面');
    expect((field as HTMLButtonElement).disabled).toBe(true);
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    // updateSketch 不携带 plane——plane 空不得阻断「完成草图」（偏移平面草图编辑）。
    expect(confirm.disabled).toBe(false);
    const user = userEvent.setup();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('四开关（os-30 勾选组）', () => {
  it('禁用压印/显示约束/显示表达式/显示错误全渲染；默认显示约束/表达式/错误勾选', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: /^草图( 1)?$/ });
    const group = within(dialog).getByRole('group', { name: '草图选项' });
    expect((within(group).getByRole('checkbox', { name: '禁用压印' }) as HTMLInputElement).checked).toBe(false);
    expect((within(group).getByRole('checkbox', { name: '显示约束' }) as HTMLInputElement).checked).toBe(true);
    expect((within(group).getByRole('checkbox', { name: '显示表达式' }) as HTMLInputElement).checked).toBe(true);
    expect((within(group).getByRole('checkbox', { name: '显示错误' }) as HTMLInputElement).checked).toBe(true);
  });

  it('开关翻转全进确认载荷', async () => {
    const { onConfirm } = renderDialog();
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog', { name: /^草图( 1)?$/ });
    await choosePlane(user);
    await user.click(within(dialog).getByRole('checkbox', { name: '禁用压印' }));
    await user.click(within(dialog).getByRole('checkbox', { name: '显示约束' }));
    await user.click(within(dialog).getByRole('checkbox', { name: '显示表达式' }));
    await user.click(within(dialog).getByRole('checkbox', { name: '显示错误' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    const payload = onConfirm.mock.calls[0]![0] as SketchDialogResult;
    expect(payload).toEqual({
      plane: 'front',
      disableImprint: true,
      showConstraints: false,
      showExpressions: false,
      showErrors: false,
    });
  });
});

describe('确认/取消 ↔ store.sketch 联动', () => {
  it('✓确认（壳期未接 applyOp）→ onConfirm 载荷 + enterSketch（sketchId prop 寻址）', async () => {
    const { onConfirm } = renderDialog({ sketchId: 'sketch-7' });
    const user = userEvent.setup();
    await choosePlane(user);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(usePartStudioStore.getState().sketch).toEqual({ isActive: true, activeSketchId: 'sketch-7', activeSketchPlane: null, constructionMode: false });
  });

  it('✗取消 → onCancel + exitSketch 复位（进行中草图退出）', async () => {
    usePartStudioStore.getState().enterSketch('sketch-9');
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().sketch).toEqual({ isActive: false, activeSketchId: null, activeSketchPlane: null, constructionMode: false });
  });

  it('Escape = 取消（Onshape 草图工具退出语义；焦点在画布也生效）', () => {
    usePartStudioStore.getState().enterSketch('sketch-9');
    const { onCancel } = renderDialog();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
  });
});

// M6-a T4（F1）：insertSketch RPC 接线——applyOp 在场时 ✓ → 空草图先建壳
//（entities/constraints 空集）+ 平面映射随 op 下发；成功 → 真 sketchId 入
// store（废 'sketch-active' 占位）；失败 → 就地 Alert，不进草图模式。
describe('M6-a T4：insertSketch RPC 接线（F1）', () => {
  it('sketchPlaneFromOption：三基准面映射（上视 XY/前视 XZ/右视 YZ，origin 恒原点）', () => {
    expect(sketchPlaneFromOption('top')).toEqual({
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 0 },
    });
    expect(sketchPlaneFromOption('front')).toEqual({
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xDir: { x: 1, y: 0, z: 0 },
    });
    expect(sketchPlaneFromOption('right')).toEqual({
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      xDir: { x: 0, y: 1, z: 0 },
    });
  });

  it('sketchPlaneFromOption：非基准面（拾取面 id/未选空串）→ undefined（op 省略 plane 键）', () => {
    expect(sketchPlaneFromOption('face-8')).toBeUndefined();
    expect(sketchPlaneFromOption('')).toBeUndefined();
  });

  it('✓（选前视）→ applyOp 收到 insertSketch op 带 plane（XZ 面）；真 sketchId 入 store 废占位串', async () => {
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-42' }));
    const { onConfirm } = renderDialog({ applyOp });
    const user = userEvent.setup();
    await choosePlane(user);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertSketch',
      entities: [],
      constraints: [],
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        xDir: { x: 1, y: 0, z: 0 },
      },
    });
    // 成功 → 真 sketchId 入 store（enterSketch 真 id 断言）+ onConfirm 载荷照常。
    await waitFor(() =>
      expect(usePartStudioStore.getState().sketch).toEqual({ isActive: true, activeSketchId: 'sk-42', activeSketchPlane: null, constructionMode: false }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('未选面 → ✓ 禁用 + 平面提示（Onshape 不允许无平面建草图，不发起 op）', async () => {
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-7' }));
    renderDialog({ applyOp });
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.queryByTestId('sketch-plane-hint')).toBeNull();
    await userEvent.setup().click(confirm);
    expect(applyOp).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
  });

  it('ok:false → 就地 Alert + 不进草图模式 + onConfirm 未调（不关框可改参重试）', async () => {
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: false, error: '约束求解失败' }));
    const { onConfirm } = renderDialog({ applyOp });
    const user = userEvent.setup();
    await choosePlane(user);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('约束求解失败');
    expect(usePartStudioStore.getState().sketch).toEqual({ isActive: false, activeSketchId: null, activeSketchPlane: null, constructionMode: false });
    expect(onConfirm).not.toHaveBeenCalled();
    // 对话框仍在场（不关框）。
    expect(screen.getByRole('dialog', { name: /^草图( 1)?$/ })).toBeDefined();
  });

  it('applyOp 抛异常（rpc-over-ipc 断开）→ 同面就地 Alert，不静默', async () => {
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => {
      throw new Error('ipc closed');
    });
    renderDialog({ applyOp });
    const user = userEvent.setup();
    await choosePlane(user);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('ipc closed');
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
  });

  it('canEdit=false（B2 只读写门禁）→ ✓ 禁用 + 只读提示 + applyOp 未发起', async () => {
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-1' }));
    renderDialog({ applyOp, canEdit: false });
    expect(screen.getByTestId('part-studio-sketch-dialog-readonly-hint')).toBeDefined();
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.setup().click(confirm);
    expect(applyOp).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
  });

  it('提交中禁重入：pending 期间双击 ✓ 仅一次 applyOp（aria-busy 呈提交态）', async () => {
    let release: (result: FeatureOpResult) => void = () => undefined;
    const applyOp = vi.fn(
      (_op: FeatureOp): Promise<FeatureOpResult> =>
        new Promise<FeatureOpResult>((resolve) => {
          release = resolve;
        }),
    );
    renderDialog({ applyOp });
    const user = userEvent.setup();
    await choosePlane(user);
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    await user.click(confirm);
    // 提交中：✓ 禁用 + aria-busy——第二击被 disabled/禁重入双保险吞掉。
    expect(confirm.disabled).toBe(true);
    expect(screen.getByRole('dialog', { name: /^草图( 1)?$/ }).getAttribute('aria-busy')).toBe('true');
    await user.click(confirm);
    expect(applyOp).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ ok: true, featureId: 'sk-9' });
    });
    await waitFor(() => expect(usePartStudioStore.getState().sketch.activeSketchId).toBe('sk-9'));
  });
});

describe('草图模式全 UI 变身（store.sketch 驱动）', () => {
  it('ribbon 切换为草图工具组：特征工具隐去 + 搜索禁用（完成钮归草图面板）', () => {
    usePartStudioStore.getState().enterSketch('sk1');
    render(<Ribbon />);
    expect(screen.getByRole('toolbar', { name: '草图工具' })).toBeDefined();
    // 草图绘制工具在场（os-30 组：线/矩形/圆…）；M6-b T5 标注组按工具展开
    //（约束 6 + 尺寸 2 真 toolId，原「尺寸/约束」两占位钮已除名）。
    for (const name of [
      '线', '拐角矩形', '中心点圆', '3 点圆弧', '内切多边形', '样条', '点', '文本',
      '使用', '构造', '圆角', '修剪', '偏移', '镜像', '线性阵列', '插入 DXF 或 DWG',
      '尺寸', '重合', '拉伸', '旋转',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDefined();
    }
    // 草图 → 零件特征工具仍隐去；草图特征组只有拉伸/旋转（Onshape live）。
    expect(screen.queryByRole('button', { name: '抽壳' })).toBeNull();
    // os-30：search 框禁用。
    expect(screen.getByRole('button', { name: /搜索工具/ }).hasAttribute('disabled')).toBe(true);
    // Onshape live：ribbon 不再有「退出草图」——完成钮在草图对话框绿色 ✓。
    expect(screen.queryByRole('button', { name: '退出草图' })).toBeNull();
  });

  it('草图工具点击 → tools.run(Sketch.Line)；退出草图（面板完成）→ ribbon 还原', async () => {
    usePartStudioStore.getState().enterSketch('sk1');
    const user = userEvent.setup();
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '线' }));
    // M6-a T5：绘制 4 件占位 id 已校准为真 toolId（Sketch.Line 等，注册表头注）。
    expect(mocks.toolsRun).toHaveBeenCalledWith('Sketch.Line');
    act(() => {
      usePartStudioStore.getState().exitSketch();
    });
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
    // ribbon 还原：特征工具组回来。
    expect(screen.getByRole('toolbar', { name: '特征工具' })).toBeDefined();
    expect(screen.getByRole('button', { name: '拉伸' })).toBeDefined();
  });

  it('画布叠加层：sketch 激活 → 约束覆盖层出现，栅格不渲染，退出即消', () => {
    const { unmount } = render(<PartStudioCanvas viewportRef={{ current: null }} />);
    expect(screen.queryByTestId('sketch-grid-overlay')).toBeNull();
    expect(screen.queryByTestId('sketch-constraints-overlay')).toBeNull();
    act(() => {
      usePartStudioStore.getState().enterSketch('sk1');
    });
    expect(screen.queryByTestId('sketch-grid-overlay')).toBeNull();
    expect(screen.getByTestId('sketch-constraints-overlay')).toBeDefined();
    act(() => {
      usePartStudioStore.getState().exitSketch();
    });
    expect(screen.queryByTestId('sketch-constraints-overlay')).toBeNull();
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

  it('画布宿主路：openSketchDialog（newSketch 路由）→ 内联 SketchDialog；✓确认经 applyOp 建真草图进草图模式（M6-a T4）', async () => {
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-real-1' }));
    const user = userEvent.setup();
    render(<PartStudioCanvas viewportRef={{ current: null }} applyOp={applyOp} />);
    // ribbon 激活路由：草图工具钮 → 开 SketchDialog（不经 tools.run）。
    render(<Ribbon />);
    await user.click(screen.getByRole('button', { name: '草图' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog.active).toBe('sketch');
    const dialog = screen.getByRole('dialog', { name: /^草图( 1)?$/ });
    await choosePlane(user);
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    // M6-a T4：真 sketchId 入 store（废 'sketch-active' 占位串）。
    // 平面随确认载荷下发（宿主 handleSketchConfirm → setActiveSketchPlane）。
    await waitFor(() =>
      expect(usePartStudioStore.getState().sketch).toEqual({
        isActive: true,
        activeSketchId: 'sk-real-1',
        activeSketchPlane: sketchPlaneFromOption('front'),
        constructionMode: false,
      }),
    );
    // Onshape：创建后同一草图对话框保持打开（编辑态）；再次 ✓ 完成退出。
    expect(usePartStudioStore.getState().dialog.active).toBe('sketch');
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(screen.queryByTestId('part-studio-sketch-dialog')).toBeNull());
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
  });

  it('画布宿主路（v1.29）：openFeatureDialog(new/cPlane) → CPlaneDialog；草图平面列表含树内平面 1', async () => {
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    const user = userEvent.setup();
    const cPlaneEntry: FeatureTreeEntry = {
      id: '0x42', featureType: 'cPlane', orderKey: 1, suppressed: false, status: 0,
      params: { reference: 'front', offsetMm: -20 },
    };
    render(<PartStudioCanvas viewportRef={{ current: null }} applyOp={applyOp} featureEntries={[cPlaneEntry]} />);
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'cPlane' });
    });
    expect(screen.getByTestId('part-studio-cplane-dialog')).toBeDefined();
    // 已有 1 个平面 → 新建默认名「平面 2」。
    expect(screen.getByRole('dialog', { name: '平面 2' })).toBeDefined();
    act(() => {
      usePartStudioStore.getState().closeDialog();
    });

    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    await user.click(screen.getByRole('combobox', { name: '草图平面' }));
    expect(screen.getByRole('option', { name: '平面 1' })).toBeDefined();
    await user.click(screen.getByRole('option', { name: '平面 1' }));
    expect(screen.getByTestId('sketch-plane-field-button').textContent).toBe('平面 1');
    // 创建成功切编辑态：平面字段只读，仍显示来源平面（v1.29）。
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const field = screen.getByTestId('sketch-plane-field-button');
      expect(field.textContent).toBe('平面 1');
      expect((field as HTMLButtonElement).disabled).toBe(true);
    });
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
