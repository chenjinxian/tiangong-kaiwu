// src/modules/part-studio/test/FeatureDialog.test.tsx
//
// M3 Task 6（brief Step 1）：非模态特征对话框（对齐 os-31）——
//  1) 非模态结构：role=dialog + aria-modal=false + 无 backdrop 遮罩（对话框
//     打开期间画布可持续拾取、视图可旋转缩放——结构性断言：不抢 pointer、
//     无模态遮罩层）；
//  2) ✓确认/✗取消 顶置：标题行首，确认回传全量参数（默认载荷钉死）；
//  3) 布尔作用域双页签：实体|曲面|薄壁 × 新建|加入|移除|相交（role=tablist +
//     aria-selected，默认 实体/新建），切换进确认载荷；
//  4) 芯片式实体选择框：初始 chips（props 注入）+ ×移除（aria-label 插值）
//     + 快速拾取（store.canvas.selection 回流成 chips，按 id 去重）；
//  5) 折叠段：方向（默认展开，正向/反向下拉）/起始偏移/对称（勾选）/拔模，
//     aria-expanded 开合语义，值进确认载荷；
//  6) 底部：透明度滑杆（M6-c T5 采集对齐 12-dialog-extrude-1.png 底栏；0-100
//     缺省 0，预览消费挂账）+ 成品按钮（同 ✓ 确认出口）+ ? 帮助（展开帮助
//     文案）。
//
// M6-a T6（拉伸草图通道）：new/extrude 提交走 {sketchId, regionIndex,
// profile:[]}（解「空 profile 死结」——T3 zod 拒收无 sketchId 的空 profile）：
// 草图下拉+面域下拉（regions>1）/单面域自动 0/无草图无面域门禁/选中回显
// chip。M7 v1.10 起布尔类型也走本通道（BooleanParams），见该 describe 末两条用例。
//
// M6-b T4（revolve 通道+对称平铺复选）：sketchChannel 扩 revolve——轴下拉
//（getSketch entities 过滤 kind==='line'，载荷 axis.sketchEntityId 同值，缺省
// 首条）/无 line 门禁/全方位复选（缺省 true，取消 → 角度输入，UI 度制 → 载荷
// 前 ×π/180 转弧度）/载荷不含 distance；extrude 通道「对称」Onshape 平铺形态
// 复选（勾选才带 symmetric:true 键——T3 契约接线收口，缺省省略=载荷向后兼容）。
//
// M6-c T3（复合面域多选，合理变更）：extrude 通道面域单选下拉升级为多选
// chips（Onshape「面和草图面域」多选语义）——载荷由 {sketchId, regionIndex}
// 改发 {sketchId, regions: number[]}（shared v1.8 ExtrudeParams.regions；
// regionIndex 已 @deprecated 且 zod 与 regions 互斥拒收，故不再发该键——既有
// extrude 钉形断言随载荷形态一并更新）。缺省选中 [0]=最大面域（v1.6 缺省
// 语义锚同源）；全选/清空轻量操作；空选 →「选择至少一个面域」+ ✓ 禁用。
// revolve 通道保持单选下拉 + regionIndex 载荷（裁决钉死：RevolveParams 未扩
// regions——不越契约），钉形断言不动。
//
// M6-c T5（UI 1:1 对齐批）：①轴下拉按几何判型命名——classifyAxisLines 纯函数
//（端点解算坐标判竖直/水平/斜线+同类 1 基序号；坐标缺失回退「线 {id}」），
// 载荷寻址（axis.sketchEntityId=id）不变；②底部滑杆回滚→透明度（载荷
// rollback→transparency）。
//
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// '@luban-cad/shared' 模块级 mock（getSketch 面域读面替身），真实 store/i18n
// 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { JSX } from 'react';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toolsRun: vi.fn(),
  outputMessage: vi.fn(),
  /** 测试可改写：null=无 viewport（emphasize 效果静默跳过）。 */
  viewport: null as unknown,
}));

// M6-a T6：面域读面 RPC 替身（getSketch——对话框选中草图后直调；其余用例
// 不选草图即不触达，无需兜底实现）。
const featureRpc = vi.hoisted(() => ({
  getSketch: vi.fn(),
}));

// B-model v1.17：FeatureDialog 经 useWorkspaceRef 读文档路由 `?model=`（Part Studio scope）。
// 组件被大量非 Router 单测直接渲染——以可改写替身模拟「有/无 ?model=」两形态。
const workspaceRef = vi.hoisted(() => ({ modelId: undefined as string | undefined }));
vi.mock('@common/workspace/use-workspace-ref.js', () => ({
  useWorkspaceRef: () =>
    workspaceRef.modelId === undefined
      ? null
      : { iTwinId: 'twin-1', iModelId: 'im-1', modelId: workspaceRef.modelId },
}));

// M6-b T6：拾取工具模块替身（fillet 通道「添加边」动态 import 的落点——捕获
// startFilletEdgePick 的 options 回调现场；editor 基座链不入测试图）。置顶层
//（vi.mock 提升执行序，嵌套写法已弃用）。
const pickMocks = vi.hoisted(() => {
  interface Captured {
    connectionKey?: string;
    onEdgeAdded?: (ref: unknown, ownerElementId: string) => void;
    onEdgeRemoved?: (ref: unknown, ownerElementId: string) => void;
    onError?: (message: string) => void;
    onPickingSuspended?: () => void;
    onPickingResumed?: () => void;
    onEnded?: () => void;
  }
  return {
    captured: undefined as Captured | undefined,
    startFilletEdgePick: vi.fn(async (options: Captured) => {
      pickMocks.captured = options;
      return {
        exitTool: pickMocks.exitTool,
        suspendPicking: pickMocks.suspendPicking,
        resumePicking: pickMocks.resumePicking,
      };
    }),
    exitTool: vi.fn(async () => undefined),
    suspendPicking: vi.fn(),
    resumePicking: vi.fn(),
  };
});

vi.mock('@luban-cad/shared', async (importOriginal) => ({
  // ADR-0017：display-actions 消费 shared RENDER_DEFAULTS/rgbToHex；保留真实导出，
  // 只覆盖测试锚点。
  ...(await importOriginal<typeof import('@luban-cad/shared')>()),
  LUBAN_INIT_TXN_DESCRIPTION: 'partstudio init',
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

vi.mock('../tools/modeling/FilletEdgePickTool.js', () => ({
  startFilletEdgePick: pickMocks.startFilletEdgePick,
}));

// ADR-0020 S4c review P1/P2.3：预览叠层替身——记录客户端幽灵几何 props，
// 供「第二方向无效表达式 → 整个幽灵消失」与「preview RPC 不循环」用例观测。
const previewOverlayMock = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../canvas/FeaturePreviewOverlay.js', () => ({
  FeaturePreviewOverlay: (props: Record<string, unknown>) => {
    previewOverlayMock.render(props);
    return null;
  },
}));

vi.mock('@itwin/core-frontend', () => ({
  // Tool 基类桩：part-studio barrel → PartStudioPage → viewer 装饰件
  // （ToggleProjectExtentsTool extends Tool）模块加载期即需 Tool 存在。
  Tool: class {},
  // I-2 notifications 呈现桥（PartStudioPage → ViewerNotifications）：
  // ToasterNotificationManager extends NotificationManager——模块加载期即需基类。
  NotificationManager: class { public outputMessage(): void { /* 哑通道桩 */ } },
  // M4-T6：成功 toast 构造 NotifyMessageDetails——钉形替身（briefMessage 可观测）。
  NotifyMessageDetails: class {
    priority: number;
    briefMessage: string;
    constructor(priority: number, briefMessage: string) {
      this.priority = priority;
      this.briefMessage = briefMessage;
    }
  },
  OutputMessagePriority: { None: 0, Success: 1, Error: 10, Warning: 11, Info: 12 },
  IModelApp: {
    tools: {
      run: mocks.toolsRun,
    },
    // M4-T6：提交成功 toast 走 notifications 通道（与保存错误面同款标准管道）。
    notifications: { outputMessage: mocks.outputMessage },
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

import type { BodyInfo, FeatureOp, FeatureOpResult, PreviewResult, SketchDto, SketchEntityDto, SketchRegionDto, VariableDto } from '@luban-cad/shared';
import type { CanvasSelection } from '../index.js';
import { usePartStudioStore } from '../index.js';
import type { FeatureDialogEntity, FeatureDialogResult } from '../dialogs/FeatureDialog.js';
import { classifyAxisLines, decodeVertexRef, encodeVertexRef, FeatureDialog, vertexCandidatesFromSketch } from '../dialogs/FeatureDialog.js';

/** store 复位：canvas/viewOnly 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    viewOnly: { isActive: false },
  });
}

function setSelection(selection: readonly CanvasSelection[]): void {
  usePartStudioStore.setState((s) => ({ canvas: { ...s.canvas, selection: [...selection] } }));
}

const ENTITIES: FeatureDialogEntity[] = [{ id: 'sk1-face', label: 'Sketch 1 的面' }];

function renderDialog(props: Partial<Parameters<typeof FeatureDialog>[0]> = {}): {
  onConfirm: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
  unmount: () => void;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const rendered = render(
    <FeatureDialog
      featureName="Extrude 1"
      entities={ENTITIES}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel, unmount: () => rendered.unmount() };
}

beforeEach(() => {
  vi.clearAllMocks();
  previewOverlayMock.render.mockClear();
  mocks.viewport = null;
  workspaceRef.modelId = undefined; // 缺省 legacy 路由（无 ?model=）
  resetStore();
});

describe('FeatureDialog 非模态结构（os-31）', () => {
  it('role=dialog + aria-modal=false + 无 backdrop 遮罩（画布持续可交互）', () => {
    const { container } = render(<FeatureDialog featureName="Extrude 1" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    // 非模态：不渲染模态遮罩（画布不被盖住，拾取/视图操作不被拦截）。
    expect(container.querySelector('.part-studio-dialog-backdrop')).toBeNull();
    expect(dialog.className).toContain('part-studio-feature-dialog');
  });

  it('✓/✗ 顶置在标题行（header 首行含确认/取消钮）', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    const header = dialog.querySelector('.part-studio-feature-dialog__header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByRole('button', { name: '确认' })).toBeDefined();
    expect(within(header as HTMLElement).getByRole('button', { name: '取消' })).toBeDefined();
  });

  // 2026-11-15 live 两态：空态特征对话框标题红（has-regen-error），可求值/
  // 健康态 #333（feature-extrude-filled / chamfer-edges 等）。我们以
  // 「可编辑但当前不可提交」为红态等价口径。
  it('标题错误态：新拉伸可编辑但未就绪 → --error；普通无通道对话框健康', () => {
    const { unmount } = render(
      <FeatureDialog
        featureName="拉伸 1"
        featureType="extrude"
        mode="new"
        entities={[]}
        applyOp={vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true }))}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const title = (): Element => document.querySelector('.part-studio-feature-dialog__title')!;
    expect(title().className).toContain('part-studio-feature-dialog__title--error');
    unmount();

    render(<FeatureDialog featureName="Extrude 1" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(title().className).toContain('part-studio-feature-dialog__title');
    expect(title().className).not.toContain('--error');
  });

  it('默认载荷：solid/new/entities 初始/direction=forward/偏移空/无对称/拔模空/透明度=0', async () => {
    const { onConfirm } = renderDialog({ entities: ENTITIES });
    await userEvent.setup().click(screen.getByRole('button', { name: '确认' }));
    const expected: FeatureDialogResult = {
      resultType: 'solid',
      booleanScope: 'new',
      entities: ENTITIES,
      direction: 'forward',
      startOffset: '',
      symmetric: false,
      draft: '',
      transparency: 0,
    };
    expect(onConfirm).toHaveBeenCalledWith(expected);
  });

  it('✗取消 → onCancel（不触发 onConfirm）', async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.setup().click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('布尔作用域双页签（实体|曲面|薄壁 × 新建|加入|移除|相交）', () => {
  it('两枚 tablist：结果类型三页签 + 布尔作用域四页签，默认 实体/新建', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    const typeTabs = within(dialog).getAllByRole('tab', { selected: true });
    expect(typeTabs).toHaveLength(2);
    expect(typeTabs[0]!.textContent).toBe('实体');
    expect(typeTabs[1]!.textContent).toBe('新建');
    // 全量页签渲染。
    for (const name of ['曲面', '薄壁', '加入', '移除', '相交']) {
      expect(within(dialog).getByRole('tab', { name })).toBeDefined();
    }
  });

  it('切换页签 → aria-selected 跟随 + 进确认载荷', async () => {
    const { onConfirm } = renderDialog({ entities: [] });
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: '薄壁' }));
    await user.click(screen.getByRole('tab', { name: '移除' }));
    expect(screen.getByRole('tab', { name: '薄壁' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: '实体' }).getAttribute('aria-selected')).toBe('false');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const payload = onConfirm.mock.calls[0]![0] as FeatureDialogResult;
    expect(payload.resultType).toBe('thinWall');
    expect(payload.booleanScope).toBe('remove');
  });

  // F2（2026-11-16）：标题跟随实际提交类型——booleanAdd 基础类型 + 加入/移除
  // 作用域映射为 booleanAdd/booleanSubtract，树行分别是「并集 N/差集 N」。
  it('F2：布尔作用域切换 → 标题跟随提交类型（加入=并集、移除=差集）', async () => {
    const featureNameForType = vi.fn((featureType: string) =>
      featureType === 'booleanSubtract' ? '差集 1' : '并集 1');
    renderDialog({
      featureName: '并集 1',
      featureNameForType,
      mode: 'new',
      featureType: 'booleanAdd',
      applyOp: vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true })),
    });
    const user = userEvent.setup();
    expect(screen.getByRole('dialog', { name: '并集 1' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '并集 1' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: '移除' }));
    expect(featureNameForType).toHaveBeenCalledWith('booleanSubtract');
    expect(screen.getByRole('dialog', { name: '差集 1' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '差集 1' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: '加入' }));
    expect(featureNameForType).toHaveBeenCalledWith('booleanAdd');
    expect(screen.getByRole('dialog', { name: '并集 1' })).toBeDefined();
  });
});

describe('芯片式实体选择框 + 快速拾取', () => {
  it('初始 chips 渲染（props 注入）；×移除后出确认载荷', async () => {
    const { onConfirm } = renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    expect(within(dialog).getByText('Sketch 1 的面')).toBeDefined();
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '移除 Sketch 1 的面' }));
    expect(within(dialog).queryByText('Sketch 1 的面')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: '确认' }));
    expect((onConfirm.mock.calls[0]![0] as FeatureDialogResult).entities).toEqual([]);
  });

  it('快速拾取：store.canvas.selection 回流成 chips（label 回退 id），按 id 去重', async () => {
    setSelection([
      { kind: 'face', id: 'face-1', label: '面 1' },
      { kind: 'face', id: 'face-2' },
    ]);
    const user = userEvent.setup();
    renderDialog({ entities: [] });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    await user.click(within(dialog).getByRole('button', { name: '快速拾取' }));
    expect(within(dialog).getByText('面 1')).toBeDefined();
    expect(within(dialog).getByText('face-2')).toBeDefined(); // label 缺省回退 id
    // 再拾取一次：id 去重，不重复添加。
    await user.click(within(dialog).getByRole('button', { name: '快速拾取' }));
    expect(within(dialog).getAllByText('面 1')).toHaveLength(1);
  });

  it('空选择集快速拾取 → 不产生 chips', async () => {
    renderDialog({ entities: [] });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '快速拾取' }));
    expect(within(dialog).queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('平铺参数行（方向/起始偏移/对称/拔模；ADR-0017 Stage E）', () => {
  it('方向/起始偏移/对称/拔模都是真复选框，默认全部未勾选', () => {
    renderDialog({ entities: [], featureType: 'extrude', mode: 'new', applyOp: vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })) });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    for (const name of ['方向', '起始偏移', '对称', '拔模']) {
      const checkbox = within(dialog).getByRole('checkbox', { name }) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    }
    // 起始偏移值行仅在勾选后出现（Onshape f6 结构）。
    expect(within(dialog).queryByRole('textbox', { name: '起始偏移' })).toBeNull();
  });

  it('拔模勾选 → 3° 缺省 + 角度/反向控件出现（载荷由 op 用例钉死）', async () => {
    renderDialog({ entities: [], featureType: 'extrude', mode: 'new', applyOp: vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })) });
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    expect(within(dialog).queryByRole('textbox', { name: '拔模角度' })).toBeNull();
    await user.click(within(dialog).getByRole('checkbox', { name: '拔模' }));
    const angle = within(dialog).getByRole('textbox', { name: '拔模角度' }) as HTMLInputElement;
    expect(angle.value).toBe('3');
    expect(within(dialog).getByRole('checkbox', { name: '反向' })).toBeDefined();
  });

  it('方向行复选诚实禁用（不再是反向控件）+ 终止行翻转钮切反向 + 对称/起始偏移值行', async () => {
    renderDialog({ entities: [], featureType: 'extrude', mode: 'new', applyOp: vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })) });
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    // 2026-11-15 live：方向=可展开的拉伸方向图元字段（无后端通道→禁用）；
    // 反向由终止行翻转钮承担。
    const directionCheckbox = within(dialog).getByRole('checkbox', { name: '方向' }) as HTMLInputElement;
    expect(directionCheckbox.disabled).toBe(true);
    expect(directionCheckbox.checked).toBe(false);
    const flip = within(dialog).getByRole('button', { name: '反向' });
    expect(flip.getAttribute('aria-pressed')).toBe('false');
    await user.click(flip);
    expect(flip.getAttribute('aria-pressed')).toBe('true');
    await user.click(within(dialog).getByRole('checkbox', { name: '对称' }));
    expect((within(dialog).getByRole('checkbox', { name: '对称' }) as HTMLInputElement).checked).toBe(true);
    await user.click(within(dialog).getByRole('checkbox', { name: '起始偏移' }));
    expect(within(dialog).getByRole('textbox', { name: '起始偏移' })).toBeDefined();
  });

  it('起始偏移取消勾选 → 值行隐藏', async () => {
    const user = userEvent.setup();
    renderDialog({ entities: [], featureType: 'extrude', mode: 'new', applyOp: vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })) });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    await user.click(within(dialog).getByRole('checkbox', { name: '起始偏移' }));
    expect(within(dialog).getByRole('textbox', { name: '起始偏移' })).toBeDefined();
    await user.click(within(dialog).getByRole('checkbox', { name: '起始偏移' }));
    expect(within(dialog).queryByRole('textbox', { name: '起始偏移' })).toBeNull();
  });

  // 审计 B2（2026-11-16）：起始偏移展开组 = 终止条件（禁用单选）+ 数值行壳
  // （12px 标签 + 右对齐值 + mm + 禁用计算器 + 下划线）；载荷仍只发 startOffsetMm。
  it('起始偏移展开组：数值行带 mm 单位 + 禁用计算器；终止条件单选禁用并带未实现理由', async () => {
    const user = userEvent.setup();
    renderDialog({ entities: [], featureType: 'extrude', mode: 'new', applyOp: vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })) });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    await user.click(within(dialog).getByRole('checkbox', { name: '起始偏移' }));
    const valueRow = within(dialog).getByTestId('part-studio-feature-dialog-start-offset-value');
    expect(valueRow.textContent).toContain('mm');
    const calculator = within(valueRow).getByRole('button', { name: '计算器' }) as HTMLButtonElement;
    expect(calculator.disabled).toBe(true);
    expect(calculator.getAttribute('title')).toBe('该能力尚未实现');
    const termination = within(dialog).getByRole('combobox', { name: '起始偏移终止条件' }) as HTMLSelectElement;
    expect(termination.disabled).toBe(true);
    expect(termination.options).toHaveLength(1);
    expect(termination.options[0]!.textContent).toBe('给定深度');
    expect(termination.getAttribute('title')).toBe('其它起始偏移终止条件尚未实现');
  });
});

// ---------------------------------------------------------------------------
// 2026-11-16 W14（Onshape live 拉伸 2）：起始偏移 = 折叠组——头部 = 20×27
// 箭头 + 驱动复选框 + 标签；未勾选 = 收起（内容不渲染）且箭头禁用（灰
// #d7d7d7）；勾选自动展开；箭头独立开合只改可见性，载荷仍只按既有条件
// （勾选 + 值非空且有限）下发 startOffsetMm，收起不静默丢键。
// ---------------------------------------------------------------------------
describe('起始偏移折叠组（2026-11-16 W14 live）', () => {
  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  async function renderReadyExtrude(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1', entities: [], constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="拉伸 1" mode="new" featureType="extrude" applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]} connectionKey="model-key"
        onConfirm={onConfirm} onCancel={vi.fn()} {...props}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    return { user, onConfirm };
  }

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('头部=箭头+驱动复选框；未勾选 → 内容不渲染、箭头禁用且 aria-expanded=false', () => {
    renderDialog({
      entities: [], featureType: 'extrude', mode: 'new',
      applyOp: vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })),
    });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    const group = within(dialog).getByTestId('part-studio-feature-dialog-start-offset-group');
    const expander = within(group).getByRole('button', { name: '展开或收起起始偏移' }) as HTMLButtonElement;
    expect(expander.disabled).toBe(true);
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    const checkbox = within(group).getByRole('checkbox', { name: '起始偏移' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
    expect(within(group).queryByTestId('part-studio-feature-dialog-start-offset-body')).toBeNull();
    expect(within(dialog).queryByTestId('part-studio-feature-dialog-start-offset-value')).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: '起始偏移' })).toBeNull();
  });

  it('live 形状样式：箭头 20×27（禁用灰 #d7d7d7）+ 内容缩进竖引导线', () => {
    const expander = cssRuleBlock('.part-studio-feature-dialog__expander');
    expect(expander).toContain('inline-size: 20px');
    expect(expander).toContain('block-size: 27px');
    expect(cssRuleBlock('.part-studio-feature-dialog__expander:disabled')).toContain('color: #d7d7d7');
    const body = cssRuleBlock('.part-studio-feature-dialog__group-body');
    expect(body).toContain('display: flex');
    expect(body).toContain('margin-inline-start: 10px');
    expect(body).toContain('padding-inline-start: 10px');
    expect(body).toContain('border-inline-start: 1px solid #d7d7d7');
  });

  it('勾选自动展开（箭头启用/aria-expanded=true）；取消勾选 → 收起并禁用箭头', async () => {
    const { user } = await renderReadyExtrude(makeApplyOp());
    const dialog = screen.getByRole('dialog', { name: '拉伸 1' });
    const group = within(dialog).getByTestId('part-studio-feature-dialog-start-offset-group');
    const expander = within(group).getByRole('button', { name: '展开或收起起始偏移' }) as HTMLButtonElement;
    const checkbox = within(group).getByRole('checkbox', { name: '起始偏移' }) as HTMLInputElement;

    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(expander.disabled).toBe(false);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect(within(group).getByTestId('part-studio-feature-dialog-start-offset-body')).toBeDefined();
    expect(within(group).getByRole('textbox', { name: '起始偏移' })).toBeDefined();
    // 终止条件单选仍诚实禁用并带既有理由（组内缩进不改变禁用语义）。
    const termination = within(group).getByRole('combobox', { name: '起始偏移终止条件' }) as HTMLSelectElement;
    expect(termination.disabled).toBe(true);
    expect(termination.getAttribute('title')).toBe('其它起始偏移终止条件尚未实现');

    await user.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(expander.disabled).toBe(true);
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    expect(within(group).queryByTestId('part-studio-feature-dialog-start-offset-body')).toBeNull();
  });

  it('箭头独立开合：收起/展开不改载荷；收起后 startOffsetMm 仍随确认下发', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp);
    const expander = screen.getByTestId('part-studio-feature-dialog-start-offset-expander') as HTMLButtonElement;
    await user.click(screen.getByRole('checkbox', { name: '起始偏移' }));
    const input = screen.getByRole('textbox', { name: '起始偏移' });
    await user.clear(input);
    await user.type(input, '2');

    await user.click(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { name: '起始偏移' })).toBeNull();
    await user.click(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect((screen.getByRole('textbox', { name: '起始偏移' }) as HTMLInputElement).value).toBe('2');

    // 再收起一次后确认：折叠只是可见性，startOffsetMm 仍按勾选 + 值下发。
    await user.click(expander);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>;
    expect(op.params).toMatchObject({ startOffsetMm: 2 });
  });

  it('载荷条件不变：默认未勾选不发键；勾选+值后确认才发 startOffsetMm', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const first = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>;
    expect(first.params).not.toHaveProperty('startOffsetMm');

    await user.click(screen.getByRole('checkbox', { name: '起始偏移' }));
    await user.clear(screen.getByRole('textbox', { name: '起始偏移' }));
    await user.type(screen.getByRole('textbox', { name: '起始偏移' }), '2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const second = applyOp.mock.calls[1]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>;
    expect(second.params).toMatchObject({ startOffsetMm: 2 });
  });
});

describe('底部（透明度滑杆 + ?；Onshape f6 无「成品」按钮）', () => {
  it('透明度滑杆在场：range 语义 + 0-100 域 + 缺省 0（不透明）', () => {
    renderDialog();
    const slider = screen.getByRole('slider', { name: '透明度' });
    expect(slider.getAttribute('type')).toBe('range');
    expect(slider.getAttribute('min')).toBe('0');
    expect(slider.getAttribute('max')).toBe('100');
    expect((slider as HTMLInputElement).value).toBe('0');
  });

  it('拖透明度滑杆改值进确认载荷（预览消费挂账——载荷面先行钉形）', async () => {
    const { onConfirm } = renderDialog({ entities: [] });
    const slider = screen.getByRole('slider', { name: '透明度' });
    fireEvent.change(slider, { target: { value: '60' } });
    await userEvent.setup().click(screen.getByRole('button', { name: '确认' }));
    expect((onConfirm.mock.calls[0]![0] as FeatureDialogResult).transparency).toBe(60);
  });

  it('底栏不再渲染「成品」按钮（唯一确认入口=标题行 ✓）', () => {
    renderDialog({ entities: [] });
    expect(screen.queryByRole('button', { name: '成品' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '确认' })).toHaveLength(1);
  });

  it('? 帮助 → 展开/收合帮助文案（aria-expanded）', async () => {
    const user = userEvent.setup();
    renderDialog();
    const help = screen.getByRole('button', { name: '帮助' });
    expect(screen.queryByRole('note')).toBeNull();
    await user.click(help);
    expect(help.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('note')).toBeDefined();
    await user.click(help);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

// 类型面 sanity：JSX 消费方按契约形状取键（编译期守卫，无运行断言）。
const _typeCheck: JSX.Element = (
  <FeatureDialog
    featureName="Extrude 2"
    entities={[{ id: 'e1', label: '面 1' }]}
    onConfirm={(result: FeatureDialogResult) => void result}
    onCancel={() => undefined}
  />
);
void _typeCheck;

// ---------------------------------------------------------------------------
// M5 Task 1（P0 呈现链修复批，D-T9-5）：Escape 关闭——对话框开着派发
// document keydown Escape → onCancel 被调（对齐 CanvasContextMenu 挂载期
// 一次注册模式；IModelApp Escape 工具语义共存由 P1 波次放行传播）。
// ---------------------------------------------------------------------------
describe('M5-T1 D-T9-5：Escape 关闭（document keydown 挂载期一次注册）', () => {
  it('对话框开着派发 document keydown Escape → onCancel 被调（不触发 onConfirm）', () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('非 Escape 键不触发；卸载后 Escape 不再触发（监听摘除）', () => {
    const { onCancel, unmount } = renderDialog();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).not.toHaveBeenCalled();
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('onCancel 换引用不重挂监听（挂载期一次注册，经 ref 取用——对齐 CanvasContextMenu T5-⑤）', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    try {
      const first = vi.fn();
      const { rerender } = render(<FeatureDialog featureName="Extrude 1" onCancel={first} />);
      expect(addSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
      const second = vi.fn();
      rerender(<FeatureDialog featureName="Extrude 1" onCancel={second} />);
      expect(addSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(second).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
    } finally {
      addSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// M4 Task 6：提交接线（拉伸闭环提交面）——new 模式 ✓/成品 → applyOp 直提交；
// 成功 toast+onConfirm（宿主收合）；失败就地 Alert 六态 error + 不关闭；提交
// 中禁重入；applyOp 未接线回退纯回调（M3 壳期语义保持）；edit 模式本版不提交
//（updateParams 归特征对话框增强 backlog）。
// M6-a T6 更新（合理变更）：extrude 载荷由裸 {profile:[],distance} 改走草图
// 通道 {sketchId, ...}——T3 zod 互斥语义（sketchId 在场
// profile 须空）使裸空 profile 恒被拒收（「空 profile 死结」），原断言已失效；
// 且草图通道未就绪（未选草图/面域未载）时 ✓ 禁用，故各提交用例先经
// renderReadyDialog 备好通道。M6-c T3 再更新：面域寻址 {sketchId, regionIndex}
// → {sketchId, regions: number[]}（v1.8 多选数组；regionIndex @deprecated 且
// zod 互斥拒收，不再发该键）。
// M5 发布窗（B2 只读写门禁）：canEdit=false → ✓/成品 禁用 + 只读提示——原
// T6 I-1 的 store.viewOnly 直读由宿主单点下传的 canEdit 接替（写动作语义
// 与「仅查看」视图语义分线）。
// ---------------------------------------------------------------------------
describe('M4-T6 提交接线（new 模式 → applyOp）', () => {
  /** 可编程 applyOp 替身（默认成功）。 */
  function makeApplyOp(impl?: (op: FeatureOp) => FeatureOpResult) {
    return vi.fn(async (op: FeatureOp): Promise<FeatureOpResult> =>
      impl ? impl(op) : { ok: true, featureId: 'f-new' },
    );
  }

  function renderSubmitDialog(applyOp: ReturnType<typeof makeApplyOp>, props: Partial<Parameters<typeof FeatureDialog>[0]> = {}) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const rendered = render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />,
    );
    return { onConfirm, onCancel, applyOp, rerender: rendered.rerender };
  }

  /** SketchDto 替身（对话框只消费 regions——面积降序语义由 T3 后端保证）。 */
  function sketchDtoWith(regions: SketchRegionDto[]): SketchDto {
    return {
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions,
    };
  }

  /**
   * 备好草图通道的提交对话框（M6-a T6）：注入单草图 + getSketch 面域替身并
   * 选中——就绪判据 = 回显 chip 在场（面域读取已落定）。
   */
  async function renderReadyDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
    regions: SketchRegionDto[] = [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
  ) {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith(regions));
    const user = userEvent.setup();
    const rendered = renderSubmitDialog(applyOp, {
      sketches: [{ id: 'sk-1', label: '草图 1' }],
      connectionKey: 'model-key',
      ...props,
    });
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    // 就绪判据：回显 chip 在场（单面域无 ·面域 后缀；多面域带序号）。
    await screen.findByText(regions.length > 1 ? '草图 1 的面 · 面域 0' : '草图 1 的面');
    return { user, ...rendered };
  }

  /** rerender 用同一元素形状（sketch 通道就绪；props 覆盖 mode/variables 等）。 */
  function submitDialogElement(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ): JSX.Element {
    return (
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    );
  }

  beforeEach(() => {
    mocks.outputMessage.mockClear();
    featureRpc.getSketch.mockReset();
  });

  it('✓确认 → applyOp 形状钉死（insertFeature/extrude/{sketchId,regions,profile:[]}——M6-c T3 regions 多选数组）；成功 → onConfirm（宿主关闭）', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = await renderReadyDialog(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('距离输入进 op params（sketchId/regions 随行，距离为可编辑量）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    const distance = screen.getByRole('textbox', { name: '深度' });
    expect((distance as HTMLInputElement).value).toBe('10');
    await user.clear(distance);
    await user.type(distance, '42.5');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 42.5, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });
  });

  // ── ADR-0020 S4b：拉伸深度表达式 ──────────────────────────────────────────
  const DEPTH_VARIABLE: VariableDto = { id: 'v1', name: 'depth', expression: '5', type: 'length' };
  const EDIT_WITH_EXPRESSION = {
    profile: [],
    distance: 10,
    sketchId: 'sk-1',
    regions: [0],
    operation: 'add' as const,
    distanceExpression: '#depth*2',
  };

  it('S4b 深度表达式：聚焦原文/失焦求值 → 载荷 {distance: 求值, distanceExpression: 原文}', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, { variables: [DEPTH_VARIABLE] });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    // 新建设计值（无表达式）：聚焦仍是数值文本。
    expect(input.value).toBe('10');
    await user.click(input);
    expect(input.value).toBe('10');
    await user.clear(input);
    await user.type(input, '#depth*2');
    expect(input.value).toBe('#depth*2');
    await user.tab(); // 失焦 → 求值结果（深度变量 5 → 10）
    expect(input.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [],
        distance: 10,
        sketchId: 'sk-1',
        regions: [0],
        operation: 'new',
        distanceExpression: '#depth*2',
      },
    });
  });

  it('S4b 编辑：失焦显示物化值、聚焦显示表达式；数值替换 → updateParams 删除旧表达式', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-1',
      featureName: '拉伸 1',
      variables: [DEPTH_VARIABLE],
      initialParams: EDIT_WITH_EXPRESSION,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    expect(input.value).toBe('10'); // 失焦=后端物化快照，不是表达式原文
    await user.click(input);
    expect(input.value).toBe('#depth*2'); // 聚焦=存储表达式
    await user.clear(input);
    await user.type(input, '20');
    await user.tab();
    expect(input.value).toBe('20');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0];
    expect(op).toMatchObject({ kind: 'updateParams', featureId: 'f-1', params: { distance: 20 } });
    if (op.kind !== 'updateParams') throw new Error('expected updateParams');
    expect((op.params as Record<string, unknown>).distanceExpression).toBeUndefined();
  });

  it('S4b 编辑其他字段：未触碰的表达式原样保留（发布门 P0-07）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-1',
      featureName: '拉伸 1',
      variables: [DEPTH_VARIABLE],
      initialParams: EDIT_WITH_EXPRESSION,
    });
    await user.click(screen.getByRole('button', { name: '反向' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0];
    expect(op).toMatchObject({ kind: 'updateParams' });
    if (op.kind !== 'updateParams') throw new Error('expected updateParams');
    expect((op.params as Record<string, unknown>).distanceExpression).toBe('#depth*2');
    expect((op.params as Record<string, unknown>).distance).toBe(10);
  });

  it('S4b 无效表达式 → 提交拒绝（不发 op、就地错误 + aria-invalid）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, { variables: [DEPTH_VARIABLE] });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '#nope');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('未知变量');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('S4b 非 blind 终止条件：清除表达式（不携带 distanceExpression）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-1',
      featureName: '拉伸 1',
      variables: [DEPTH_VARIABLE],
      initialParams: EDIT_WITH_EXPRESSION,
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '终止条件' }), 'throughAll');
    expect((screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0];
    if (op.kind !== 'updateParams') throw new Error('expected updateParams');
    const params = op.params as Record<string, unknown>;
    expect(params.endBound).toBe('throughAll');
    expect(params.distanceExpression).toBeUndefined();
  });

  it('S4b `#` 补全：显示既有变量并回填 #name', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, { variables: [DEPTH_VARIABLE] });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#d');
    const menu = await screen.findByTestId('sketch-expression-autocomplete');
    await user.click(within(menu).getByText('#depth'));
    expect(input.value).toBe('#depth');
    await user.tab();
    expect(input.value).toBe('5');
  });

  it('S4b 未知 #name + Enter → 内联创建（name=token、值=当前深度）；变量刷新后回填并提交', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user, rerender } = await renderReadyDialog(applyOp, {
      variables: [],
      onCreateVariable,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#bar');
    await user.keyboard('{Enter}');
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'bar',
      valueText: '10',
      unit: 'mm',
    }));
    // 宿主变量 hook 刷新（onCommitted）→ 同一对话框收到新变量表。
    rerender(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        variables={[{ id: 'v1', name: 'bar', expression: '10', type: 'length' }]}
        onCreateVariable={onCreateVariable}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(input.value).toBe('#bar'));
    await screen.findByText('草图 1 的面');
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      params: { distance: 10, distanceExpression: '#bar' },
    });
  });

  it('S4b「新建变量…」（空 query）→ 变量刷新后自动插入 #name', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user, rerender } = await renderReadyDialog(applyOp, {
      variables: [],
      onCreateVariable,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#');
    await user.click(screen.getByTestId('sketch-expression-autocomplete-create'));
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({ name: '' }));
    rerender(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        variables={[{ id: 'v1', name: 'foo', expression: '5', type: 'length' }]}
        onCreateVariable={onCreateVariable}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(input.value).toBe('#foo'));
  });

  it('S4b 复核 P1：补全鼠标选中后菜单关闭，下一次 Enter 直接提交', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, { variables: [DEPTH_VARIABLE] });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#d');
    const menu = await screen.findByTestId('sketch-expression-autocomplete');
    await user.click(within(menu).getByText('#depth'));
    expect(input.value).toBe('#depth');
    await waitFor(() => expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull());
    await user.keyboard('{Enter}');
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      params: { distance: 5, distanceExpression: '#depth' },
    });
  });

  it('S4b 复核 P1：补全 Enter 选中后菜单关闭，下一次 Enter 提交', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, { variables: [DEPTH_VARIABLE] });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#d');
    expect(await screen.findByTestId('sketch-expression-autocomplete')).toBeDefined();
    await user.keyboard('{Enter}'); // 选中补全项（不提交）
    expect(input.value).toBe('#depth');
    await waitFor(() => expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull());
    expect(applyOp).not.toHaveBeenCalled();
    await user.keyboard('{Enter}'); // 菜单已关 → 提交
    expect(applyOp).toHaveBeenCalledTimes(1);
  });

  it('S4b 复核 P2a：无效提交 → 内联创建成功后清除错误、失焦显示求值结果', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user, rerender } = await renderReadyDialog(applyOp, {
      variables: [DEPTH_VARIABLE],
      onCreateVariable,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    // 无效提交：错误 + 红态。
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#nope');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(screen.getByRole('alert').textContent).toContain('未知变量');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // 未知 token + Enter → 内联创建（值沿用最近数值）。
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#bar');
    await user.keyboard('{Enter}');
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({ name: 'bar' }));
    // 变量表刷新时字段已失焦（创建面板关闭）→ 显示求值结果而非 `#bar`。
    fireEvent.blur(input);
    rerender(submitDialogElement(applyOp, {
      variables: [{ id: 'v2', name: 'bar', expression: '10', type: 'length' }],
      onCreateVariable,
    }));
    await waitFor(() => expect(input.value).toBe('10'));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('S4b 复核 P2b：内联创建面板取消 → pending 丢弃（迟到变量刷新不再回填）', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user, rerender } = await renderReadyDialog(applyOp, {
      variables: [],
      onCreateVariable,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#');
    await user.click(screen.getByTestId('sketch-expression-autocomplete-create'));
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({ name: '' }));
    // 宿主打开并取消内联创建面板（active 变化是取消信号）。
    act(() => {
      usePartStudioStore.getState().openVariablesDialog({
        active: 'inline-create', name: '', valueText: '10', type: 'length',
      });
    });
    act(() => {
      usePartStudioStore.getState().closeVariablesDialog();
    });
    // 迟到的变量刷新不得再插入 `#foo`。
    rerender(submitDialogElement(applyOp, {
      variables: [{ id: 'v1', name: 'foo', expression: '5', type: 'length' }],
      onCreateVariable,
    }));
    await waitFor(() => expect(input.value).toBe('#'));
  });

  it('S4b 复核 P2b：改名创建只替换完整 token（#bar→#baz），不拼接/不双井号', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user, rerender } = await renderReadyDialog(applyOp, {
      variables: [],
      onCreateVariable,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#bar');
    await user.keyboard('{Enter}');
    rerender(submitDialogElement(applyOp, {
      variables: [{ id: 'v1', name: 'baz', expression: '5', type: 'length' }],
      onCreateVariable,
    }));
    await waitFor(() => expect(input.value).toBe('#baz'));
  });

  it('S4b 复核 P2b：token 身份不再匹配（#barbazar）→ 不改写文本', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user, rerender } = await renderReadyDialog(applyOp, {
      variables: [],
      onCreateVariable,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#bar');
    await user.keyboard('{Enter}');
    await user.clear(input);
    await user.type(input, '#barbazar');
    rerender(submitDialogElement(applyOp, {
      variables: [{ id: 'v1', name: 'baz', expression: '5', type: 'length' }],
      onCreateVariable,
    }));
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement).value).toBe('#barbazar'),
    );
  });

  it('S4b 复核 P2：引用 angle 变量本地即拒（与后端同句，不做 45 mm 预览）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [{ id: 'v2', name: 'ang', expression: '45', type: 'angle' }],
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '#ang');
    expect(screen.getByTestId('part-studio-feature-dialog-depth-row')
      .getAttribute('data-depth-value')).toBe('');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      '变量 #ang 的类型 angle 与深度字段不兼容（需要 length/number/any）',
    );
  });

  it('S4b 复核 P2：变量表加载中 + 未触碰落库表达式 → 按物化 distance 提交', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-1',
      featureName: '拉伸 1',
      variables: [],
      variablesLoading: true,
      initialParams: EDIT_WITH_EXPRESSION,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    expect(input.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0];
    expect(op).toMatchObject({
      kind: 'updateParams',
      params: { distance: 10, distanceExpression: '#depth*2' },
    });
  });

  it('S4b 复核 P2：变量表读取失败 + 用户改过表达式 → 独立「不可用」错误（不误报未知变量）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-1',
      featureName: '拉伸 1',
      variables: [],
      variablesError: '读取失败',
      variablesReady: false,
      initialParams: EDIT_WITH_EXPRESSION,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#depth*2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    const alertText = screen.getByRole('alert').textContent ?? '';
    expect(alertText).toContain('变量表不可用');
    expect(alertText).not.toContain('未知变量');
  });

  it('S4b 复核 P3e：内联创建值用原始数值文本（非 5 位格式化），非法表达式不回填', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [],
      onCreateVariable,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '12.3456789');
    await user.clear(input);
    await user.type(input, '#bar');
    await user.keyboard('{Enter}');
    expect(onCreateVariable).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'bar',
      valueText: '12.3456789',
    }));
  });

  it('S4b 复核 P3e：无最近数值且表达式非法 → 值回退缺省数值，不回填非法表达式', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [DEPTH_VARIABLE],
      onCreateVariable,
      initialParams: undefined,
    });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '#nope');
    await user.keyboard('{Enter}');
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'nope',
      valueText: '10',
    }));
  });

  it('S4b 复核 P3b：聚焦保留原始草稿空白（trim 只在求值/载荷）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, { variables: [DEPTH_VARIABLE] });
    const input = screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, ' #depth + 1 ');
    expect(input.value).toBe(' #depth + 1 ');
    await user.tab();
    expect(input.value).toBe('6');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      params: { distance: 6, distanceExpression: '#depth + 1' },
    });
  });

  it('S4b 复核 P3d：布尔旧距离行不消费表达式键盘语义（Enter 不建变量/不提交）', async () => {
    const applyOp = makeApplyOp();
    const onCreateVariable = vi.fn();
    const { user } = await renderReadyDialog(applyOp, {
      featureType: 'booleanAdd',
      variables: [DEPTH_VARIABLE],
      onCreateVariable,
    });
    const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.clear(distance);
    await user.type(distance, '#bar{Enter}');
    expect(onCreateVariable).not.toHaveBeenCalled();
    expect(applyOp).not.toHaveBeenCalled();
    expect(screen.queryByTestId('sketch-expression-autocomplete')).toBeNull();
  });

  it('终止条件：new 禁用完全贯穿；移除可选，载荷携带 endBound=throughAll 且距离框禁用', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    const throughOption = screen.getByRole('option', { name: '完全贯穿' }) as HTMLOptionElement;
    expect(throughOption.disabled).toBe(true); // operation=new 无上游
    await user.click(screen.getByRole('tab', { name: '移除' }));
    expect((screen.getByRole('option', { name: '完全贯穿' }) as HTMLOptionElement).disabled).toBe(false);
    await user.selectOptions(screen.getByRole('combobox', { name: '终止条件' }), 'throughAll');
    expect((screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0],
        operation: 'remove', endBound: 'throughAll',
      },
    });
  });

  it('v1.53 成形到下一个面：无需面快照，移除可选，载荷 endBound=upToNext 且距离框禁用', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    expect((screen.getByRole('option', { name: '成形到下一个面' }) as HTMLOptionElement).disabled).toBe(true);
    await user.click(screen.getByRole('tab', { name: '移除' }));
    expect((screen.getByRole('option', { name: '成形到下一个面' }) as HTMLOptionElement).disabled).toBe(false);
    await user.selectOptions(screen.getByRole('combobox', { name: '终止条件' }), 'upToNext');
    expect((screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0],
        operation: 'remove', endBound: 'upToNext',
      },
    });
  });

  it('v1.52 成形到面：无面快照 → 选项禁用 + 缺面提示', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    await user.click(screen.getByRole('tab', { name: '移除' }));
    expect((screen.getByRole('option', { name: '成形到面' }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-up-to-surface-face-missing-hint').textContent)
      .toContain('先在视口中选中一个面');
  });

  it('v1.52 成形到面：单面快照 → 载荷 endBound/endFaceRef，距离框禁用、面提示在场', async () => {
    const applyOp = makeApplyOp();
    const face = {
      kind: 'face' as const,
      id: 'face-1',
      topologyId: { nodeId: 1, entityId: 2 },
      ownerBodyKey: '0x15',
    };
    const { user } = await renderReadyDialog(applyOp, { initialFaces: [face] });
    await user.click(screen.getByRole('tab', { name: '移除' }));
    expect((screen.getByRole('option', { name: '成形到面' }) as HTMLOptionElement).disabled).toBe(false);
    await user.selectOptions(screen.getByRole('combobox', { name: '终止条件' }), 'upToSurface');
    expect((screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-up-to-surface-face-hint').textContent)
      .toContain('1:2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0],
        operation: 'remove', endBound: 'upToSurface', endFaceRef: { nodeId: 1, entityId: 2 },
      },
    });
  });

  it('v1.54 成形到面偏移距离：启用 + 2mm 反向 → 载荷 endOffsetMm/endOffsetOppositeDirection', async () => {
    const applyOp = makeApplyOp();
    const face = {
      kind: 'face' as const,
      id: 'face-1',
      topologyId: { nodeId: 1, entityId: 2 },
      ownerBodyKey: '0x15',
    };
    const { user } = await renderReadyDialog(applyOp, { initialFaces: [face] });
    await user.click(screen.getByRole('tab', { name: '移除' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '终止条件' }), 'upToSurface');
    // 未启用偏移：复选默认关闭；勾选后才出现距离/反向。
    const enable = screen.getByRole('checkbox', { name: '偏移距离' }) as HTMLInputElement;
    expect(enable.checked).toBe(false);
    expect(screen.queryByRole('textbox', { name: '偏移距离（mm）' })).toBeNull();
    await user.click(enable);
    const offset = screen.getByRole('textbox', { name: '偏移距离（mm）' });
    expect((offset as HTMLInputElement).value).toBe('1');
    await user.clear(offset);
    await user.type(offset, '2');
    await user.click(screen.getByRole('checkbox', { name: '反向' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0],
        operation: 'remove', endBound: 'upToSurface', endFaceRef: { nodeId: 1, entityId: 2 },
        endOffsetMm: 2, endOffsetOppositeDirection: true,
      },
    });
  });

  it('v1.54 成形到面偏移距离：非正数 → 确认禁用、不发 op', async () => {
    const applyOp = makeApplyOp();
    const face = {
      kind: 'face' as const,
      id: 'face-1',
      topologyId: { nodeId: 1, entityId: 2 },
      ownerBodyKey: '0x15',
    };
    const { user } = await renderReadyDialog(applyOp, { initialFaces: [face] });
    await user.click(screen.getByRole('tab', { name: '移除' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '终止条件' }), 'upToSurface');
    await user.click(screen.getByRole('checkbox', { name: '偏移距离' }));
    const offset = screen.getByRole('textbox', { name: '偏移距离（mm）' });
    await user.clear(offset);
    await user.type(offset, '0');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('v1.54 编辑回显偏移 → updateParams 合并 endOffsetMm/反向；关闭后删除旧键', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      mode: 'edit', featureId: 'f-extrude',
      initialParams: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'remove',
        endBound: 'upToSurface', endFaceRef: { nodeId: 1, entityId: 2 },
        endOffsetMm: 2, endOffsetOppositeDirection: true,
      },
    });
    expect((screen.getByRole('checkbox', { name: '偏移距离' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('textbox', { name: '偏移距离（mm）' }) as HTMLInputElement).value).toBe('2');
    expect((screen.getByRole('checkbox', { name: '反向' }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.kind).toBe('updateParams');
    expect(op.featureId).toBe('f-extrude');
    expect(op.params).toMatchObject({
      endBound: 'upToSurface', endFaceRef: { nodeId: 1, entityId: 2 },
      endOffsetMm: 2, endOffsetOppositeDirection: true,
    });
  });

  it('v1.52 成形到面：多面快照 → 选项禁用 + 多选提示', async () => {
    const applyOp = makeApplyOp();
    const faces = [
      { kind: 'face' as const, id: 'f1', topologyId: { nodeId: 1, entityId: 2 }, ownerBodyKey: '0x15' },
      { kind: 'face' as const, id: 'f2', topologyId: { nodeId: 3, entityId: 4 }, ownerBodyKey: '0x15' },
    ];
    const { user } = await renderReadyDialog(applyOp, { initialFaces: faces });
    await user.click(screen.getByRole('tab', { name: '移除' }));
    expect((screen.getByRole('option', { name: '成形到面' }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-up-to-surface-face-multiple-hint').textContent)
      .toContain('2');
  });

  it('v1.53 薄壁：曲面页签禁用、薄壁启用；厚度 1（默认 5）+ 禁用厚度 2 行 + 载荷 bodyType/THIN，冲突控件禁用', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    expect((screen.getByRole('tab', { name: '曲面' }) as HTMLButtonElement).disabled).toBe(true);
    const thinTab = screen.getByRole('tab', { name: '薄壁' }) as HTMLButtonElement;
    expect(thinTab.disabled).toBe(false);
    await user.click(thinTab);
    const thickness = screen.getByRole('textbox', { name: '厚度 1' });
    expect((thickness as HTMLInputElement).value).toBe('5');
    // live 行序：厚度 1 值行（mm + 禁用计算器）后接无通道的厚度 2 值行（0 mm，禁用）。
    const thickness2 = screen.getByRole('textbox', { name: '厚度 2' }) as HTMLInputElement;
    expect(thickness2.value).toBe('0');
    expect(thickness2.disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-thin-wall-hint').textContent)
      .toContain('单侧厚度');
    expect((screen.getByTestId('part-studio-feature-dialog-symmetric-flat').querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('part-studio-feature-dialog-draft').querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('part-studio-feature-dialog-second-direction').querySelector('input') as HTMLInputElement).disabled).toBe(true);
    await user.clear(thickness);
    await user.type(thickness, '2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new',
        bodyType: 'THIN', thinThicknessMm: 2,
      },
    });
  });

  it('v1.55 薄壁中间平面：勾选 → 载荷 thinMidPlane:true', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    await user.click(screen.getByRole('tab', { name: '薄壁' }));
    const midPlane = screen.getByRole('checkbox', { name: '中间平面' }) as HTMLInputElement;
    expect(midPlane.checked).toBe(false);
    await user.click(midPlane);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new',
        bodyType: 'THIN', thinThicknessMm: 5, thinMidPlane: true,
      },
    });
    // 厚度 2 无产品通道：不进载荷（只有 thinThicknessMm 单键）。
    expect('thinThickness2Mm' in (applyOp.mock.calls[0]![0] as { params: object }).params).toBe(false);
  });

  it('v1.55 薄壁中间平面：edit 回显 + updateParams 合并键', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      mode: 'edit', featureId: 'f-thin',
      initialParams: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new',
        bodyType: 'THIN', thinThicknessMm: 2, thinMidPlane: true,
      },
    });
    expect((screen.getByRole('checkbox', { name: '中间平面' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('textbox', { name: '厚度 1' }) as HTMLInputElement).value).toBe('2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.kind).toBe('updateParams');
    expect(op.featureId).toBe('f-thin');
    expect(op.params).toMatchObject({ bodyType: 'THIN', thinThicknessMm: 2, thinMidPlane: true });
  });

  it('v1.53 薄壁：厚度非正 → 提交禁用 + 不发 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    await user.click(screen.getByRole('tab', { name: '薄壁' }));
    const thickness = screen.getByRole('textbox', { name: '厚度 1' });
    await user.clear(thickness);
    await user.type(thickness, '0');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('v1.53 薄壁：切薄壁时把成形到面复位为给定深度（后端互斥）', async () => {
    const face = {
      kind: 'face' as const,
      id: 'face-1',
      topologyId: { nodeId: 1, entityId: 2 },
      ownerBodyKey: '0x15',
    };
    const { user } = await renderReadyDialog(makeApplyOp(), { initialFaces: [face] });
    await user.click(screen.getByRole('tab', { name: '移除' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '终止条件' }), 'upToSurface');
    await user.click(screen.getByRole('tab', { name: '薄壁' }));
    expect((screen.getByRole('combobox', { name: '终止条件' }) as HTMLSelectElement).value).toBe('blind');
    expect((screen.getByRole('option', { name: '成形到面' }) as HTMLOptionElement).disabled).toBe(true);
  });

  it('第二方向：勾选 + 深度 → 载荷 secondDirection；对称勾选时禁用', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    const secondToggle = screen.getByTestId('part-studio-feature-dialog-second-direction')
      .querySelector('input') as HTMLInputElement;
    await user.click(secondToggle);
    // Onshape live（2026-11-15 extrude-secondEnd-open）：展开组行序=终止下拉 →
    // 深度值行 → 拔模；深度可见标签为「深度」，aria 名保持「第二方向深度」。
    const secondGroup = screen.getByTestId('part-studio-feature-dialog-second-end').closest('[data-field="second-direction"]') as HTMLElement;
    const secondDepth = screen.getByRole('textbox', { name: '第二方向深度' });
    expect(within(secondGroup).getByText('深度')).toBeDefined();
    expect(within(secondGroup).getByText('mm')).toBeDefined();
    expect((within(secondGroup).getByRole('button', { name: '计算器' }) as HTMLButtonElement).disabled).toBe(true);
    const secondEndSelect = screen.getByTestId('part-studio-feature-dialog-second-end');
    expect(secondEndSelect.compareDocumentPosition(secondDepth) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await user.clear(secondDepth);
    await user.type(secondDepth, '3');
    // 勾选对称 → 第二方向禁用并自动关闭（后端 zod 互斥）。
    const symmetric = screen.getByTestId('part-studio-feature-dialog-symmetric-flat')
      .querySelector('input') as HTMLInputElement;
    await user.click(symmetric);
    expect(secondToggle.disabled).toBe(true);
    expect(secondToggle.checked).toBe(false);
    await user.click(symmetric); // 取消对称，重新启用第二方向
    await user.click(secondToggle);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new',
        secondDirection: { endBound: 'blind', distanceMm: 3 },
      },
    });
  });

  // ── ADR-0020 S4c：extrude 附加四键表达式（second/startOffset/thin/draft）──
  it('S4c 第二方向深度表达式：blind 载荷带 secondDirectionDistanceExpression；throughAll 清除', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [{ id: 'v2', name: 'd2', expression: '5', type: 'length' }],
    });
    const secondToggle = screen.getByTestId('part-studio-feature-dialog-second-direction')
      .querySelector('input') as HTMLInputElement;
    await user.click(secondToggle);
    const secondDepth = screen.getByRole('textbox', { name: '第二方向深度' }) as HTMLInputElement;
    await user.clear(secondDepth);
    await user.type(secondDepth, '#d2*2');
    await user.tab();
    expect(secondDepth.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        secondDirection: { endBound: 'blind', distanceMm: 10 },
        secondDirectionDistanceExpression: '#d2*2',
      },
    });

    // throughAll：后端 blind-only 显式拒收 → UI 清键且不发送。
    cleanup();
    const secondApply = makeApplyOp();
    const second = await renderReadyDialog(secondApply, {
      variables: [{ id: 'v2', name: 'd2', expression: '5', type: 'length' }],
    });
    await second.user.click(screen.getByTestId('part-studio-feature-dialog-second-direction')
      .querySelector('input') as HTMLInputElement);
    const throughDepth = screen.getByRole('textbox', { name: '第二方向深度' }) as HTMLInputElement;
    await second.user.clear(throughDepth);
    await second.user.type(throughDepth, '#d2*2');
    await second.user.selectOptions(
      screen.getByTestId('part-studio-feature-dialog-second-end'),
      'throughAll',
    );
    expect(throughDepth.disabled).toBe(true);
    await second.user.click(screen.getByRole('button', { name: '确认' }));
    const throughOp = secondApply.mock.calls[0]![0];
    expect(throughOp).toMatchObject({
      kind: 'insertFeature',
      params: { secondDirection: { endBound: 'throughAll' } },
    });
    if (throughOp.kind !== 'insertFeature') throw new Error('expected insertFeature');
    expect((throughOp.params as Record<string, unknown>).secondDirectionDistanceExpression)
      .toBeUndefined();
  });

  it('S4c 起始偏移表达式（有符号长度）：载荷 startOffsetMm=求值 + 原文', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [{ id: 'v3', name: 'off', expression: '2', type: 'length' }],
    });
    await user.click(screen.getByTestId('part-studio-feature-dialog-start-offset')
      .querySelector('input') as HTMLInputElement);
    const startOffset = screen.getByRole('textbox', { name: '起始偏移' }) as HTMLInputElement;
    await user.clear(startOffset);
    await user.type(startOffset, '0 - #off');
    await user.tab();
    expect(startOffset.value).toBe('-2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      params: { startOffsetMm: -2, startOffsetExpression: '0 - #off' },
    });
  });

  it('S4c 薄壁厚度表达式：仅 THIN 页签适用，载荷 thinThicknessMm=求值 + 原文', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [{ id: 'v4', name: 'wall', expression: '1.5', type: 'length' }],
    });
    await user.click(screen.getByRole('tab', { name: '薄壁' }));
    const thickness = screen.getByRole('textbox', { name: '厚度 1' }) as HTMLInputElement;
    await user.clear(thickness);
    await user.type(thickness, '#wall*2');
    await user.tab();
    expect(thickness.value).toBe('3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      params: {
        bodyType: 'THIN',
        thinThicknessMm: 3,
        thinThicknessExpression: '#wall*2',
      },
    });
  });

  it('S4c 拔模角表达式（度）：载荷 draftAngleDeg=求值 + 原文；无效角度禁用 ✓', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [{ id: 'v5', name: 'deg', expression: '20', type: 'angle' }],
    });
    await user.click(screen.getByTestId('part-studio-feature-dialog-draft')
      .querySelector('input') as HTMLInputElement);
    const angle = screen.getByRole('textbox', { name: '拔模角度' }) as HTMLInputElement;
    await user.clear(angle);
    await user.type(angle, '#deg/2');
    await user.tab();
    expect(angle.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'insertFeature',
      params: { draftAngleDeg: 10, draftAngleExpression: '#deg/2' },
    });

    cleanup();
    const invalidApply = makeApplyOp();
    const invalid = await renderReadyDialog(invalidApply, {
      variables: [{ id: 'v5', name: 'deg', expression: '20', type: 'angle' }],
    });
    await invalid.user.click(screen.getByTestId('part-studio-feature-dialog-draft')
      .querySelector('input') as HTMLInputElement);
    const invalidAngle = screen.getByRole('textbox', { name: '拔模角度' }) as HTMLInputElement;
    await invalid.user.clear(invalidAngle);
    await invalid.user.type(invalidAngle, '90');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(invalidApply).not.toHaveBeenCalled();
  });

  it('S4c 第二方向表达式 + 对称：第二方向自动关闭且载荷不带表达式', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [{ id: 'v2', name: 'd2', expression: '5', type: 'length' }],
    });
    const secondToggle = screen.getByTestId('part-studio-feature-dialog-second-direction')
      .querySelector('input') as HTMLInputElement;
    await user.click(secondToggle);
    const secondDepth = screen.getByRole('textbox', { name: '第二方向深度' }) as HTMLInputElement;
    await user.clear(secondDepth);
    await user.type(secondDepth, '#d2*2');
    const symmetric = screen.getByTestId('part-studio-feature-dialog-symmetric-flat')
      .querySelector('input') as HTMLInputElement;
    await user.click(symmetric);
    expect(secondToggle.disabled).toBe(true);
    expect(secondToggle.checked).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0];
    if (op.kind !== 'insertFeature') throw new Error('expected insertFeature');
    const params = op.params as Record<string, unknown>;
    expect(params.symmetric).toBe(true);
    expect(params.secondDirection).toBeUndefined();
    expect(params.secondDirectionDistanceExpression).toBeUndefined();
  });

  it('S4c 起始偏移取消勾选：清除表达式草稿；重勾选回数值态且不发旧表达式', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp, {
      variables: [{ id: 'v3', name: 'off', expression: '2', type: 'length' }],
    });
    const startToggle = screen.getByTestId('part-studio-feature-dialog-start-offset')
      .querySelector('input') as HTMLInputElement;
    await user.click(startToggle);
    const startOffset = screen.getByRole('textbox', { name: '起始偏移' }) as HTMLInputElement;
    await user.clear(startOffset);
    await user.type(startOffset, '0 - #off');
    await user.click(startToggle); // 取消勾选 → 清表达式 + 数值草稿归位
    await user.click(startToggle); // 重新勾选
    const restored = await screen.findByRole('textbox', { name: '起始偏移' }) as HTMLInputElement;
    // 失焦时已按求值数回填 -2（合法有符号数值）——关键是不再携带表达式原文。
    await waitFor(() => expect(restored.value).toBe('-2'));
    expect(screen.queryByTestId('expression-field-error')).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0];
    if (op.kind !== 'insertFeature') throw new Error('expected insertFeature');
    const params = op.params as Record<string, unknown>;
    expect(params.startOffsetMm).toBe(-2);
    expect(params.startOffsetExpression).toBeUndefined();
  });

  it('P2.3 第二方向表达式无效：整个客户端幽灵预览消失（不画主方向部分预览）', async () => {
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      entities: [
        { kind: 'point', id: 1, x: 0, y: 0 },
        { kind: 'point', id: 2, x: 10, y: 0 },
        { kind: 'point', id: 3, x: 10, y: 10 },
        { kind: 'point', id: 4, x: 0, y: 10 },
        { kind: 'line', id: 11, p1: 1, p2: 2 },
        { kind: 'line', id: 12, p1: 2, p2: 3 },
        { kind: 'line', id: 13, p1: 3, p2: 4 },
        { kind: 'line', id: 14, p1: 4, p2: 1 },
      ],
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xDir: { x: 1, y: 0, z: 0 },
      },
      regions: [{ area: 0.0001, outerEntityIds: [11, 12, 13, 14] }],
    } as SketchDto);
    const user = userEvent.setup();
    render(
      <div className="part-studio-canvas">
        <FeatureDialog
          featureName="拉伸"
          mode="new"
          featureType="extrude"
          applyOp={vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true }))}
          sketches={[{ id: 'sk-1', label: '草图 1' }]}
          connectionKey="model-key"
          viewport={{} as never}
          variables={[{ id: 'v2', name: 'd2', expression: '5', type: 'length' }]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    await waitFor(() => expect(previewOverlayMock.render).toHaveBeenCalled(), { timeout: 3000 });
    const secondToggle = screen.getByTestId('part-studio-feature-dialog-second-direction')
      .querySelector('input') as HTMLInputElement;
    await user.click(secondToggle);
    const secondDepth = screen.getByRole('textbox', { name: '第二方向深度' }) as HTMLInputElement;
    await user.clear(secondDepth);
    await waitFor(() => expect(previewOverlayMock.render).toHaveBeenCalled());
    previewOverlayMock.render.mockClear();
    await user.type(secondDepth, '#nope');
    await waitFor(() => expect(previewOverlayMock.render).not.toHaveBeenCalled(), { timeout: 3000 });
    await user.clear(secondDepth);
    await user.type(secondDepth, '5');
    await waitFor(() => expect(previewOverlayMock.render).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('成功 → toast（notifications 通道，与保存错误面同款标准管道）', async () => {
    const { user } = await renderReadyDialog(makeApplyOp());
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
    const details = mocks.outputMessage.mock.calls[0]![0] as { briefMessage: string };
    expect(details.briefMessage).toContain('拉伸');
  });

  it('失败 → 就地 Alert（六态 error），不调 onConfirm（对话框不关闭）', async () => {
    const applyOp = makeApplyOp(() => ({ ok: false, error: '写租约被 other-page 持有' }));
    const { user, onConfirm } = await renderReadyDialog(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('写租约被 other-page 持有');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('提交中禁重入：✓/成品 禁用，pending 期间再点不二次 applyOp', async () => {
    let release!: (r: FeatureOpResult) => void;
    const applyOp = vi.fn(
      (_op: FeatureOp): Promise<FeatureOpResult> =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { user, onConfirm } = await renderReadyDialog(applyOp as unknown as ReturnType<typeof makeApplyOp>);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    // pending：两出口均禁用，再点不重入（userEvent 对 disabled 钮不派发 click）。
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    release({ ok: true, featureId: 'f-new' });
    await waitFor(() =>
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('非法距离 → 校验 Alert 就地，不发起 applyOp', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    const distance = screen.getByRole('textbox', { name: '深度' });
    await user.clear(distance);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('距离');
  });

  it('applyOp 未接线（壳期）→ 确认回退纯 onConfirm（M3 语义保持；无草图通道 UI）', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        onConfirm={onConfirm}
      />,
    );
    // 无 applyOp = 非草图通道（纯回调壳期）：无草图下拉、无门禁提示、✓ 可用。
    expect(screen.queryByRole('combobox', { name: '草图' })).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-no-sketch-hint')).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('canEdit=false（B2 只读写门禁）→ ✓/成品 禁用 + 只读提示，applyOp 与 onConfirm 均不发起', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        canEdit={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    // 诚实提示 + 两出口禁用（不进租约获取等待环——提交入口即被拦）。
    const hint = screen.getByTestId('part-studio-feature-dialog-readonly-hint');
    expect(hint.textContent).toContain('当前为只读权限');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    // ✗ 取消仍可达（禁用态下的关闭出口）。
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('canEdit=false → 租约警示不呈现（提交已禁用「等待租约」成谎报）；edit 模式下只读提示顶位（editHint 让位）', () => {
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸 1"
        mode="edit"
        featureType="extrude"
        applyOp={applyOp}
        leaseOk={false}
        canEdit={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('part-studio-feature-dialog-lease-warning')).toBeNull();
    expect(screen.getByTestId('part-studio-feature-dialog-readonly-hint')).toBeDefined();
    expect(screen.queryByTestId('part-studio-feature-dialog-edit-hint')).toBeNull();
  });

  it('leaseOk=false → 租约警示在场（不硬禁用），通道就绪后提交仍可达', async () => {
    const applyOp = makeApplyOp();
    // M6-a T6：草图通道备好后断言「不硬禁用」（未就绪时 ✓ 因通道门禁禁用，
    // 与租约警示无关——不能在该态断言 enabled）。
    const { user } = await renderReadyDialog(applyOp, { leaseOk: false });
    const warning = screen.getByTestId('part-studio-feature-dialog-lease-warning');
    expect(warning.textContent).toContain('写租约被其他会话持有');
    // 提交面不因租约警示禁用（保留陈旧租约 35s 自愈路）。
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
  });

  it('leaseOk 缺省 → 无租约警示（未接线/壳期不警示）', () => {
    renderSubmitDialog(makeApplyOp());
    expect(screen.queryByTestId('part-studio-feature-dialog-lease-warning')).toBeNull();
  });

  it('leaseOk=true → 无租约警示（仅在持缺失时警示面出现）', () => {
    renderSubmitDialog(makeApplyOp(), { leaseOk: true });
    expect(screen.queryByTestId('part-studio-feature-dialog-lease-warning')).toBeNull();
  });

  it('edit 模式（宿主已接提交面）→ 回显落库参数，✓ 发 updateParams（保留 operation）', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    const onConfirm = vi.fn();
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    render(
      <FeatureDialog
        featureName="拉伸 1"
        featureId="f-1"
        mode="edit"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        initialParams={{
          profile: [],
          distance: 25,
          sketchId: 'sk-1',
          regions: [0],
          symmetric: true,
          operation: 'add',
        }}
        onConfirm={onConfirm}
      />,
    );
    // 落库值回显（不是缺省 10）。
    expect((screen.getByRole('textbox', { name: '深度' }) as HTMLInputElement).value).toBe('25');
    expect((screen.getByTestId('part-studio-feature-dialog-symmetric-flat').querySelector('input') as HTMLInputElement).checked).toBe(true);
    await screen.findByText('草图 1 的面');
    expect(screen.queryByTestId('part-studio-feature-dialog-edit-hint')).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalledTimes(1));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'updateParams',
      featureId: 'f-1',
      params: {
        profile: [],
        distance: 25,
        sketchId: 'sk-1',
        regions: [0],
        symmetric: true,
        operation: 'add',
      },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// M6-a T6：拉伸草图通道（sketchId + 面域拾取）——载荷构造/门禁/回显 chip/
// 布尔不接通道。数据源裁决：草图列表=宿主树过滤下传（props），面域=对话框
// 直调 getSketch（见 FeatureDialog 头注）；本 describe 用 getSketch 替身钉
// RPC 消费面（connectionKey 寻址 + regions 面积降序数组）。
// M6-c T3（合理变更）：面域选择由单选下拉升级为多选 chips——载荷 regions
// 数组（regionIndex 不再发，v1.8 @deprecated + zod 互斥）；缺省 [0]=最大面域；
// 全选/清空/空选门禁。
// ---------------------------------------------------------------------------
describe('M6-a T6 拉伸草图通道（sketchId+面域拾取）', () => {
  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  function sketchDtoWith(regions: SketchRegionDto[], id = 'sk-1'): SketchDto {
    return {
      id,
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions,
    };
  }

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('多面域：不静默预选（Onshape 必须在视口点击面域）→ 空选占位 + ✓ 禁用', async () => {
    featureRpc.getSketch.mockResolvedValue(
      sketchDtoWith([
        { area: 0.5, outerEntityIds: [1, 2, 3, 4] },
        { area: 0.1, outerEntityIds: [5, 6] },
      ]),
    );
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await waitFor(() => expect(featureRpc.getSketch).toHaveBeenCalledWith('model-key', 'sk-1'));
    // 多面域无唯一解 → 不预选；空选字段给 Onshape 同款占位文案。
    const empty = await screen.findByTestId('part-studio-feature-dialog-no-region-selected-hint');
    expect(empty.textContent).toBe('在视口中点击要拉伸的草图面域');
    expect(screen.queryByText('草图 1 的面')).toBeNull();
    // 无面域列表/下拉——添加只能靠视口拾取（e2e 覆盖）。
    expect(screen.queryByTestId('part-studio-feature-dialog-region-chips')).toBeNull();
    expect(screen.queryByRole('combobox', { name: '面域' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  // ── B-model v1.17：面域读面 Part Studio scope（路由 ?model=） ─────────────

  it('?model= 在场：getSketch 携带 Part Studio scope', async () => {
    workspaceRef.modelId = 'ps-1';
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={makeApplyOp()}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    expect(featureRpc.getSketch).toHaveBeenCalledWith('model-key', 'sk-1', 'ps-1');
  });

  it('legacy 路由（无 ?model=）getSketch 省略 scope 实参（旧调用 arity 钉死）', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={makeApplyOp()}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    expect(featureRpc.getSketch.mock.calls[0]).toHaveLength(2);
  });

  it('单面域：自动 regions [0] 且字段只有一个 chip（无面域列表/下拉）', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.0025, outerEntityIds: [1, 2, 3, 4] }]));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面'); // 单面域 chip 无 ·面域 后缀
    expect(screen.queryByTestId('part-studio-feature-dialog-region-chips')).toBeNull();
    expect(screen.queryByRole('combobox', { name: '面域' })).toBeNull();
    // 字段只承载选中项（无「面域 N」按钮列表）：Onshape 的添加动作在视口中。
    expect(screen.getByTestId('part-studio-feature-dialog-profile-field').querySelectorAll('button[data-region-index]')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });
  });

  it('无草图：先创建草图提示 + ✓/成品 禁用，不发起 op（不再空 profile 裸奔）', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    const onConfirm = vi.fn();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        onConfirm={onConfirm}
      />,
    );
    const hint = screen.getByTestId('part-studio-feature-dialog-no-sketch-hint');
    expect(hint.textContent).toBe('先创建草图');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('自动选中最近草图（Onshape）：无草图下拉；单面域就绪后可提交', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const applyOp = makeApplyOp();
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[
          { id: 'sk-0', label: '草图 0' },
          { id: 'sk-1', label: '草图 1' },
        ]}
        connectionKey="model-key"
      />,
    );
    // 无草图下拉；最近一张（列表末位 sk-1）自动读取面域。
    expect(screen.queryByRole('combobox', { name: '草图' })).toBeNull();
    await screen.findByText('草图 1 的面');
    expect(featureRpc.getSketch).toHaveBeenCalledTimes(1);
    expect(featureRpc.getSketch).toHaveBeenCalledWith('model-key', 'sk-1');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });
  });

  it('草图无面域（regions 缺省/空）：草图无可拉伸面域提示 + 提交禁用', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith(undefined as unknown as SketchRegionDto[]));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    const hint = await screen.findByTestId('part-studio-feature-dialog-no-region-hint');
    expect(hint.textContent).toBe('草图无可拉伸面域');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('面域读取失败（RPC 异常）：就地 region-error alert + 提交禁用', async () => {
    featureRpc.getSketch.mockRejectedValue(new Error('连接断开'));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    const errorFace = await screen.findByTestId('part-studio-feature-dialog-region-error');
    expect(errorFace.textContent).toContain('连接断开');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('连接键缺失：regionUnreadable 提示 + 提交禁用（不发起 RPC）', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    const errorFace = await screen.findByTestId('part-studio-feature-dialog-region-error');
    expect(errorFace.textContent).toContain('无法读取草图面域');
    expect(featureRpc.getSketch).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('chip ×移除 = 清选择：字段回空选占位、提交禁用、regions 清态', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    await user.click(screen.getByRole('button', { name: '草图 1 的面' }));
    expect(screen.queryByText('草图 1 的面')).toBeNull();
    expect(screen.getByTestId('part-studio-feature-dialog-no-region-selected-hint').textContent)
      .toBe('在视口中点击要拉伸的草图面域');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('自动取最近草图：多草图时只读取末位 sk-2（旧面域下标不跨草图续用）', async () => {
    featureRpc.getSketch.mockImplementation(async (_key: string, sketchId: string) =>
      sketchId === 'sk-1'
        ? sketchDtoWith([{ area: 0.5, outerEntityIds: [1] }], 'sk-1')
        : sketchDtoWith([{ area: 0.2, outerEntityIds: [3] }], 'sk-2'),
    );
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[
          { id: 'sk-1', label: '草图 1' },
          { id: 'sk-2', label: '草图 2' },
        ]}
        connectionKey="model-key"
      />,
    );
    await screen.findByText('草图 2 的面');
    expect(featureRpc.getSketch).not.toHaveBeenCalledWith('model-key', 'sk-1');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-2', regions: [0], operation: 'new' },
    });
  });

  // M7 v1.10（合理变更，接替 M6-a 的「布尔不接通道」旧裁决）：布尔类型改走草图通道——
  // shared BooleanParams（sketchId/regions/distance/operation）落地后，booleanAdd/booleanSubtract
  // 的 UI 输入=草画面域；内联 profile 布尔路径仅服务 API/语料（对话框不再生成该形态）。
  it('布尔类型（booleanAdd）走草图通道（M7 v1.10）：未选草图禁提交；载荷 {sketchId, regions, distance, operation:unite}', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="并集"
        mode="new"
        featureType="booleanAdd"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    // 草图通道形态：无草图下拉/无快速拾取；最近草图自动读取面域。
    expect(screen.queryByRole('combobox', { name: '草图' })).toBeNull();
    expect(screen.queryByRole('button', { name: '快速拾取' })).toBeNull();
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    // 单面域自动 [0] → 提交草图驱动布尔载荷
    await screen.findByText('草图 1 的面');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'booleanAdd',
      params: { sketchId: 'sk-1', distance: 10, regions: [0], operation: 'unite' },
    });
  });

  // Tutorial 2 v1.19：extrude/revolve 的「新建/加入/移除/相交」是同一特征内的 operation，
  // 不再拆 booleanAdd/booleanSubtract 特征行；v1.22（ADR-0005）extrude remove/intersect 落地。
  it('特征内 operation（v1.22）：extrude 新建/加入/移除/相交均提交真实 operation', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    expect((screen.getByRole('tab', { name: '相交' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('tab', { name: '加入' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('tab', { name: '移除' }) as HTMLButtonElement).disabled).toBe(false);

    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');

    await user.click(screen.getByRole('tab', { name: '加入' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'add' },
    });

    await user.click(screen.getByRole('tab', { name: '移除' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'remove' },
    });

    await user.click(screen.getByRole('tab', { name: '相交' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'intersect' },
    });

    await user.click(screen.getByRole('tab', { name: '新建' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });

    // v1.22/ADR-0017 Stage E：方向=反向（终止行翻转钮）、起始偏移=勾选+值行 → 真实 params。
    await user.click(screen.getByRole('button', { name: '反向' }));
    await user.click(screen.getByRole('checkbox', { name: '起始偏移' }));
    const offsetInput = screen.getByRole('textbox', { name: '起始偏移' }) as HTMLInputElement;
    // 审计 B2（2026-11-16）：值行走数值行壳（mm + 禁用计算器），载荷不变。
    const offsetRow = offsetInput.closest('section')!;
    expect(offsetRow.textContent).toContain('mm');
    expect((within(offsetRow).getByRole('button', { name: '计算器' }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(offsetInput);
    await user.type(offsetInput, '2');
    await user.click(screen.getByRole('tab', { name: '加入' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'add',
        direction: 'backward', startOffsetMm: 2,
      },
    });
    expect(applyOp).toHaveBeenCalledTimes(5);
  });

  it('特征内 operation（v1.23）：revolve 新建/移除页签启用，相交仍禁用', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    render(
      <FeatureDialog
        featureName="旋转"
        mode="new"
        featureType="revolve"
        applyOp={makeApplyOp()}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    expect((screen.getByRole('tab', { name: '新建' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('tab', { name: '移除' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('tab', { name: '相交' }) as HTMLButtonElement).disabled).toBe(true);
  });

  // B1 复审 Important：布尔 requiresUpstream——无实体（sketch-only 模型）时加入/移除
  // 无上游，后端只会落 status=1 死特征（op 仍 ok:true）。UI 侧禁用页签 + 提示，确认
  // 仍提交合法 extrude（不产生死特征）。
  it('无实体（hasBodies=false）：加入/移除/相交页签禁用 + 诚实提示；新建仍提交 extrude operation=new', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        hasBodies={false}
      />,
    );
    expect((screen.getByRole('tab', { name: '加入' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('tab', { name: '移除' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('tab', { name: '相交' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-no-body-hint').textContent).toContain('布尔操作需要已有实体');
    // 草图通道仍可用（extrude 合法路径）：选草图 → 确认提交 extrude。
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });
  });

  it('无实体 + 直接 booleanAdd：布尔通道提交禁用 + 诚实提示（不发 op，杜绝 ok:true+status=1 死特征）', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="并集"
        mode="new"
        featureType="booleanAdd"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        hasBodies={false}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-no-body-hint').textContent).toContain('布尔操作需要已有实体');
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.click(confirm);
    expect(applyOp).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// M6-b T4：revolve 通道（轴拾取+全方位/角度）——草图/面域拾取与 M6-a T6 同构
//（数据源/门禁同源复用，其路径已在上一 describe 钉死不重复），revolve 分支增：
// 轴下拉（getSketch entities 过滤 kind==='line'，选项「线 {id}」=载荷
// axis.sketchEntityId 同值可对账，缺省首条）/无 line 门禁/全方位复选（缺省
// true，取消 → 角度输入，UI 度制 → 载荷前 ×π/180 转弧度——shared
// RevolveParams.angle 契约 (0, 2π]，180°→Math.PI 的 π 精度在此钉死）/
// 载荷不含 distance（revolve 无距离量，输入隐藏+校验跳过）。
// ---------------------------------------------------------------------------
describe('M6-b T4 revolve 通道（轴拾取+全方位/角度）', () => {
  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  /** revolve 用 SketchDto 替身：entities 与 regions 同响应下发（v1.7 getSketch）。 */
  function revolveSketchDto(entities: SketchEntityDto[], regions: SketchRegionDto[], id = 'sk-1'): SketchDto {
    return {
      id,
      entities,
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions,
    };
  }

  /** 点/线混排的典型可旋转草图（线 id 3/4 可选为轴；点 id 1/2 为线端点引用）。 */
  const LINED_SKETCH_ENTITIES: SketchEntityDto[] = [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 10, y: 0 },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
    { kind: 'line', id: 4, p1: 2, p2: 1 },
  ];
  const ONE_REGION: SketchRegionDto[] = [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }];

  /** 备好 revolve 通道的对话框：注入草图 + getSketch 替身并选中（就绪判据=回显 chip 在场）。 */
  async function renderRevolveDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    dto: SketchDto,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    featureRpc.getSketch.mockResolvedValue(dto);
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="旋转 1"
        mode="new"
        featureType="revolve"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await waitFor(() => expect(featureRpc.getSketch).toHaveBeenCalled());
    return { user };
  }

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('全周缺省：轴下拉缺省首条（水平线 1=line 3）+ 判型命名 + 全方位勾选（角度输入不在场）→ 载荷钉形（无 angle 键亦无 distance 键）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    const axisSelect = screen.getByRole('combobox', { name: '旋转轴' }) as HTMLSelectElement;
    await waitFor(() => expect(axisSelect.value).toBe('3')); // 缺省首条 line
    // Onshape live（2026-11-15 feature-revolve-empty）：轴 = query-field 壳
    // （12px 标签「旋转轴」+ 无边框 select + 右侧装饰时钟，时钟禁用/aria-hidden）。
    const axisField = screen.getByTestId('part-studio-feature-dialog-axis-field');
    expect(within(axisField).getByText('旋转轴')).toBeDefined();
    expect(axisField.contains(axisSelect)).toBe(true);
    const clock = axisField.querySelector('button[aria-hidden="true"]') as HTMLButtonElement;
    expect(clock.disabled).toBe(true);
    // M6-c T5 判型命名：两线端点 y 相等 → 水平线 1/水平线 2（id 与载荷同值可对账）。
    expect(within(axisSelect).getByRole('option', { name: '水平线 1' })).toBeDefined();
    expect(within(axisSelect).getByRole('option', { name: '水平线 2' })).toBeDefined();
    expect((screen.getByRole('checkbox', { name: '全方位旋转' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('textbox', { name: '角度（度）' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'revolve',
      params: { sketchId: 'sk-1', regions: [0], axis: { sketchEntityId: 3 }, fullRevolve: true, operation: 'new' },
    });
  });

  it('换轴进载荷：选「水平线 2」（line 4）→ axis.sketchEntityId=4（id 与载荷同值可对账）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    await user.selectOptions(screen.getByRole('combobox', { name: '旋转轴' }), '4');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'revolve',
      params: { sketchId: 'sk-1', regions: [0], axis: { sketchEntityId: 4 }, fullRevolve: true, operation: 'new' },
    });
  });

  it('v1.30 多面域编辑回显：regions [0,1] → 两个 chips → 载荷保留选集（不再发 regionIndex）', async () => {
    const applyOp = makeApplyOp();
    const TWO_REGIONS: SketchRegionDto[] = [
      { area: 0.5, outerEntityIds: [1, 2, 3, 4] },
      { area: 0.25, outerEntityIds: [1, 2, 3] },
    ];
    featureRpc.getSketch.mockResolvedValue(revolveSketchDto(LINED_SKETCH_ENTITIES, TWO_REGIONS));
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="旋转 1"
        featureId="f-rev"
        mode="edit"
        featureType="revolve"
        initialParams={{ sketchId: 'sk-1', regions: [0, 1], axis: { sketchEntityId: 3 }, fullRevolve: true }}
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await waitFor(() => {
      const chips = screen.getByTestId('part-studio-feature-dialog-profile-field')
        .querySelectorAll('button[data-region-index]');
      expect(chips).toHaveLength(2);
    });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>;
    expect(op.params).toMatchObject({ sketchId: 'sk-1', regions: [0, 1], axis: { sketchEntityId: 3 } });
    expect('regionIndex' in op.params).toBe(false);
  });

  it('revolve 多面域：不预选、无面域下拉/列表（与 extrude 同一视口拾取）→ 空选时 ✓ 禁用', async () => {
    const applyOp = makeApplyOp();
    await renderRevolveDialog(
      applyOp,
      revolveSketchDto(LINED_SKETCH_ENTITIES, [
        { area: 0.5, outerEntityIds: [1] },
        { area: 0.1, outerEntityIds: [2] },
      ]),
    );
    const empty = await screen.findByTestId('part-studio-feature-dialog-no-region-selected-hint');
    expect(empty.textContent).toBe('在视口中点击要拉伸的草图面域');
    // 旧单选下拉/多选列表均已撤除。
    expect(screen.queryByRole('combobox', { name: '面域' })).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-region-chips')).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-region-select-all')).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-region-clear')).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('角度换算 π 精度：取消全方位 → 角度输入现（缺省 360）→ 改 180 → 载荷 angle=Math.PI（fullRevolve=false）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    await user.click(screen.getByRole('checkbox', { name: '全方位旋转' }));
    const angle = screen.getByRole('textbox', { name: '角度（度）' }) as HTMLInputElement;
    expect(angle.value).toBe('360');
    // 审计 B3（2026-11-16）：旋转角度行统一 ° 单位 + 禁用计算器。
    const angleRow = angle.closest('section')!;
    expect(angleRow.textContent).toContain('°');
    expect((within(angleRow).getByRole('button', { name: '计算器' }) as HTMLButtonElement).disabled).toBe(true);
    await user.clear(angle);
    await user.type(angle, '180');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'revolve',
      params: {
        sketchId: 'sk-1',
        regions: [0],
        axis: { sketchEntityId: 3 },
        fullRevolve: false,
        angle: Math.PI,
        operation: 'new',
      },
    });
  });

  it('S4c 旋转角表达式：按度求值 → 载荷 angle 弧度快照 + angleExpression 原文；全周清除', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(
      applyOp,
      revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION),
      { variables: [{ id: 'va', name: 'a', expression: '180', type: 'angle' }] },
    );
    await user.click(screen.getByRole('checkbox', { name: '全方位旋转' }));
    const angle = screen.getByRole('textbox', { name: '角度（度）' }) as HTMLInputElement;
    await user.clear(angle);
    await user.type(angle, '#a/2');
    await user.tab();
    expect(angle.value).toBe('90');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0];
    expect(op).toMatchObject({
      kind: 'insertFeature',
      featureType: 'revolve',
      params: {
        sketchId: 'sk-1',
        regions: [0],
        axis: { sketchEntityId: 3 },
        fullRevolve: false,
        angle: Math.PI / 2,
        angleExpression: '#a/2',
        operation: 'new',
      },
    });

    // 全周：表达式不适用 → 行卸载 + 载荷不带 angle/angleExpression。
    cleanup();
    const fullApply = makeApplyOp();
    const full = await renderRevolveDialog(
      fullApply,
      revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION),
      { variables: [{ id: 'va', name: 'a', expression: '180', type: 'angle' }] },
    );
    await full.user.click(screen.getByRole('checkbox', { name: '全方位旋转' }));
    const fullAngle = screen.getByRole('textbox', { name: '角度（度）' }) as HTMLInputElement;
    await full.user.clear(fullAngle);
    await full.user.type(fullAngle, '#a/2');
    await full.user.click(screen.getByRole('checkbox', { name: '全方位旋转' }));
    expect(screen.queryByRole('textbox', { name: '角度（度）' })).toBeNull();
    await full.user.click(screen.getByRole('button', { name: '确认' }));
    const fullOp = fullApply.mock.calls[0]![0];
    if (fullOp.kind !== 'insertFeature') throw new Error('expected insertFeature');
    const fullParams = fullOp.params as Record<string, unknown>;
    expect(fullParams.fullRevolve).toBe(true);
    expect(fullParams.angle).toBeUndefined();
    expect(fullParams.angleExpression).toBeUndefined();
  });

  it('角度换算 90° → Math.PI/2（弧度载荷契约的另一半锚点）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    await user.click(screen.getByRole('checkbox', { name: '全方位旋转' }));
    const angle = screen.getByRole('textbox', { name: '角度（度）' });
    await user.clear(angle);
    await user.type(angle, '90');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const params = (applyOp.mock.calls[0]![0] as { params: { angle?: number } }).params;
    expect(params.angle).toBeCloseTo(Math.PI / 2, 15);
  });

  it('无 line 实体（仅圆）：无可用旋转轴提示 + 轴下拉不在场 + ✓/成品 禁用，不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(
      applyOp,
      revolveSketchDto([{ kind: 'circle', id: 5, center: 1, radius: 5 }], ONE_REGION),
    );
    const hint = await screen.findByTestId('part-studio-feature-dialog-no-axis-hint');
    expect(hint.textContent).toBe('草图无可用旋转轴');
    expect(screen.queryByRole('combobox', { name: '旋转轴' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('非法角度（0 / 超 360 / 空）→ 校验 Alert 就地 + 不发起 op（弧度域 (0,2π] 的度制门）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    await user.click(screen.getByRole('checkbox', { name: '全方位旋转' }));
    const angle = screen.getByRole('textbox', { name: '角度（度）' });
    for (const bad of ['0', '400', '']) {
      await user.clear(angle);
      if (bad !== '') await user.type(angle, bad);
      await user.click(screen.getByRole('button', { name: '确认' }));
      expect(screen.getByRole('alert').textContent).toContain('旋转角度');
    }
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('revolve 通道无距离量：距离输入不在场；对称（平铺复选与折叠段）均不在场（revolve 分支独立构造器）', async () => {
    const applyOp = makeApplyOp();
    await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '对称' })).toBeNull();
    expect(screen.queryByRole('button', { name: '对称' })).toBeNull();
  });

  it('轴判型命名（M6-c T5）：竖直/水平/斜线同类分别编号；端点无解算坐标回退「线 {id}」（载荷寻址不变）', async () => {
    const applyOp = makeApplyOp();
    const mixed: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 2, y: 0 }, // 竖线端点
      { kind: 'point', id: 2, x: 2, y: 5 },
      { kind: 'point', id: 3, x: 0, y: 1 }, // 斜线端点
      { kind: 'point', id: 4, x: 3, y: 1 }, // 与点 3 同 y（水平线）；与点 6 同 x（竖直线）
      { kind: 'point', id: 5, x: 0, y: 9 },
      { kind: 'point', id: 6, x: 3, y: 0 },
      { kind: 'line', id: 10, p1: 1, p2: 2 }, // x 相等 → 竖直线 1
      { kind: 'line', id: 11, p1: 1, p2: 3 }, // x/y 均不等 → 斜线 1
      { kind: 'line', id: 12, p1: 3, p2: 4 }, // y 相等 → 水平线 1
      { kind: 'line', id: 13, p1: 9, p2: 9 }, // 端点 id 9 不在实体集 → unknown（回退 线 13）
      { kind: 'line', id: 14, p1: 4, p2: 6 }, // x 相等(3) → 竖直线 2
    ];
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(mixed, ONE_REGION));
    const axisSelect = screen.getByRole('combobox', { name: '旋转轴' }) as HTMLSelectElement;
    await waitFor(() => expect(axisSelect.value).toBe('10'));
    expect(within(axisSelect).getByRole('option', { name: '竖直线 1' })).toBeDefined();
    expect(within(axisSelect).getByRole('option', { name: '竖直线 2' })).toBeDefined();
    expect(within(axisSelect).getByRole('option', { name: '水平线 1' })).toBeDefined();
    expect(within(axisSelect).getByRole('option', { name: '斜线 1' })).toBeDefined();
    expect(within(axisSelect).getByRole('option', { name: '线 13' })).toBeDefined();
    // 判型只改文案不改寻址：选 unknown 项提交，载荷仍带实体 id。
    await user.selectOptions(axisSelect, '13');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect((applyOp.mock.calls[0]![0] as { params: { axis: { sketchEntityId: number } } }).params.axis)
      .toEqual({ sketchEntityId: 13 });
  });
});

// ---------------------------------------------------------------------------
// M6-c T5：classifyAxisLines 纯函数单测（判向容差/序号计数/非线实体跳过）。
// ---------------------------------------------------------------------------
describe('classifyAxisLines（旋转轴判型纯函数，M6-c T5）', () => {
  it('竖直/水平/斜线判向 + 同类 1 基序号（按出现序计）', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'point', id: 2, x: 0.001, y: 0 },
      { kind: 'point', id: 3, x: 5, y: 5 },
      { kind: 'line', id: 10, p1: 1, p2: 2 }, // y 相等 → 水平线 1
      { kind: 'line', id: 11, p1: 1, p2: 3 }, // 斜线 1
      { kind: 'line', id: 12, p1: 2, p2: 3 }, // 斜线 2
    ];
    expect(classifyAxisLines(entities)).toEqual([
      { id: 10, kind: 'horizontal', ordinal: 1 },
      { id: 11, kind: 'slanted', ordinal: 1 },
      { id: 12, kind: 'slanted', ordinal: 2 },
    ]);
  });

  it('容差 1e-6 内视为对齐（米制坐标浮点尾差）；超界即斜线', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 2, y: 0 },
      { kind: 'point', id: 2, x: 2 + 1e-7, y: 9 }, // x 差 1e-7 < 1e-6 → 竖直
      { kind: 'point', id: 3, x: 2 + 1e-3, y: 9 },
      { kind: 'line', id: 10, p1: 1, p2: 2 },
      { kind: 'line', id: 11, p1: 1, p2: 3 },
    ];
    const result = classifyAxisLines(entities);
    expect(result[0]).toEqual({ id: 10, kind: 'vertical', ordinal: 1 });
    expect(result[1]).toEqual({ id: 11, kind: 'slanted', ordinal: 1 });
  });

  it('端点坐标缺失/点实体缺席 → unknown（ordinal 独立计数）；非线实体不产出', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'point', id: 1, x: 0, y: 0 },
      { kind: 'circle', id: 4, center: 1, radius: 5 },
      { kind: 'line', id: 10, p1: 1, p2: 1 }, // 有坐标（重合点）→ 竖直（x 相等且 y 相等——x 判据先行）
      { kind: 'line', id: 11, p1: 9, p2: 9 }, // 端点不在实体集 → unknown
    ];
    expect(classifyAxisLines(entities)).toEqual([
      { id: 10, kind: 'vertical', ordinal: 1 },
      { id: 11, kind: 'unknown', ordinal: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// M6-b T4：extrude 对称平铺复选（Onshape 采集形态「对称」在折叠区外平铺）——
// 渲染+本地态（state 即既有 symmetric，随 onConfirm 面板载荷回传不变）；
// op 载荷接线已收口（控制器：T3 契约 shared v1.7 ExtrudeParams.symmetric
// 落地后接线——勾选才带 symmetric:true 键，缺省省略=载荷向后兼容）。
// 非通道对话框（edit/布尔/壳期）折叠段形态不动。
// ---------------------------------------------------------------------------
describe('M6-b T4 extrude 对称平铺复选（Onshape 平铺形态；载荷已接线）', () => {
  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  async function renderReadyExtrudeDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="拉伸 1"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    return { user, onConfirm };
  }

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('平铺复选在场（折叠区外）+ 折叠段「对称」隐藏（防双复选绑同态）', async () => {
    await renderReadyExtrudeDialog(makeApplyOp());
    expect(screen.getByTestId('part-studio-feature-dialog-symmetric-flat')).toBeDefined();
    expect((screen.getByRole('checkbox', { name: '对称' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole('button', { name: '对称' })).toBeNull();
  });

  it('勾选对称 → op 载荷含 symmetric:true（T3 契约接线收口），面板载荷仍回传 symmetric=true', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = await renderReadyExtrudeDialog(applyOp);
    await user.click(screen.getByRole('checkbox', { name: '对称' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], symmetric: true, operation: 'new' },
    });
    expect((onConfirm.mock.calls[0]![0] as FeatureDialogResult).symmetric).toBe(true);
  });

  it('非通道对话框（edit 模式）对称保持折叠段形态，平铺复选不在场（既有语义不动）', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: '对称' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('part-studio-feature-dialog-symmetric-flat')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// v1.51（ADR-0005 Phase 4）：extrude 拔模平铺复选 + 角度 + 反向。
// live 证据 ui-evidence/draft-dialog-20261108（Onshape：拔模复选 → 拔模角度 3 deg → 反向）。
// ---------------------------------------------------------------------------
describe('v1.51 extrude 拔模（角度/反向 → op 载荷）', () => {
  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  async function renderReadyExtrude(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1', entities: [], constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="拉伸 1" mode="new" featureType="extrude" applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]} connectionKey="model-key"
        onConfirm={onConfirm} onCancel={vi.fn()} {...props}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    return { user, onConfirm };
  }

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('勾选拔模 → 角度默认 3 + 反向复选；确认载荷 draftAngleDeg=3（无反向键）', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = await renderReadyExtrude(applyOp);
    await user.click(screen.getByRole('checkbox', { name: '拔模' }));
    const angle = screen.getByRole('textbox', { name: '拔模角度' }) as HTMLInputElement;
    expect(angle.value).toBe('3');
    // 审计 B3（2026-11-16）：角度行统一 ° 单位 + 禁用计算器。
    const angleRow = angle.closest('section')!;
    expect(angleRow.textContent).toContain('°');
    expect((within(angleRow).getByRole('button', { name: '计算器' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: '反向' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature', featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new', draftAngleDeg: 3 },
    });
    expect((onConfirm.mock.calls[0]![0] as FeatureDialogResult).draft).toBe('3');
  });

  it('反向勾选 → 载荷 draftPullDirection:true；改角度 → draftAngleDeg 跟随', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp);
    await user.click(screen.getByRole('checkbox', { name: '拔模' }));
    const angle = screen.getByRole('textbox', { name: '拔模角度' });
    await user.clear(angle);
    await user.type(angle, '10');
    await user.click(screen.getByRole('checkbox', { name: '反向' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    const params = (applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>).params as Record<string, unknown>;
    expect(params.draftAngleDeg).toBe(10);
    expect(params.draftPullDirection).toBe(true);
  });

  it('拔模与对称互斥：勾拔模 → 对称取消并禁用；勾对称 → 拔模禁用', async () => {
    const { user } = await renderReadyExtrude(makeApplyOp());
    const symmetric = screen.getByRole('checkbox', { name: '对称' }) as HTMLInputElement;
    const draft = screen.getByRole('checkbox', { name: '拔模' }) as HTMLInputElement;
    await user.click(symmetric);
    expect(draft.disabled).toBe(true);
    await user.click(symmetric); // 取消对称
    await user.click(draft);
    expect((screen.getByRole('checkbox', { name: '对称' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: '对称' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('edit 模式回显 draftAngleDeg/反向，确认发 updateParams 合并键', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, {
      mode: 'edit', featureId: 'f-extrude',
      initialParams: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'add',
        draftAngleDeg: 7, draftPullDirection: true,
      },
    });
    expect((screen.getByRole('checkbox', { name: '拔模' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('textbox', { name: '拔模角度' }) as HTMLInputElement).value).toBe('7');
    expect((screen.getByRole('checkbox', { name: '反向' }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.kind).toBe('updateParams');
    expect(op.featureId).toBe('f-extrude');
    expect(op.params).toMatchObject({ draftAngleDeg: 7, draftPullDirection: true });
  });
});

// ---------------------------------------------------------------------------
// B2 Task 2：loft 通道（双截面草图选择器——最小入口）。
// 首版只做两平行截面（LoftParams.sketchIds 二元组 + bodyType:'SOLID'；无 guides/
// end conditions/sections UI）。两个独立下拉（截面草图 1/2），门禁=两键均已选且
// 互不相同；载荷无 distance/profile/regions 键。ribbon 入口：现有 'loft' id 无
// 注册工具（伪 toolId），Ribbon 特例改道本对话框（见 Ribbon.tsx）。
// ---------------------------------------------------------------------------
describe('B2 loft 通道（双截面草图选择器）', () => {
  const SKETCHES = [
    { id: 'sk-1', label: '草图 1' },
    { id: 'sk-2', label: '草图 2' },
  ];

  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  function renderLoftDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="放样"
        mode="new"
        featureType="loft"
        applyOp={applyOp}
        sketches={SKETCHES}
        connectionKey="model-key"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    return { user, onConfirm };
  }

  it('初始形态：两个截面下拉在场、距离输入不在场、平行提示在场、✓/成品禁用（未选截面）', () => {
    renderLoftDialog(makeApplyOp());
    expect(screen.getByRole('combobox', { name: '截面草图 1' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: '截面草图 2' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull(); // loft 无距离量
    // 首版范围提示：两张截面须平行（服务端 op 边界同口径拒收）。
    expect(screen.getByTestId('part-studio-feature-dialog-loft-parallel-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('选两张不同草图 → previewOp insertFeature loft（150ms 防抖，2026-11-08）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user } = renderLoftDialog(makeApplyOp(), { previewOp });
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 1' }), 'sk-1');
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 2' }), 'sk-2');
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'loft',
      params: { sketchIds: ['sk-1', 'sk-2'], bodyType: 'SOLID' },
    });
  });

  it('选两张不同草图 → 载荷 {sketchIds:[a,b], bodyType:"SOLID"}（无 distance/profile/regions 键）→ onConfirm', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderLoftDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 1' }), 'sk-1');
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 2' }), 'sk-2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'loft',
      params: { sketchIds: ['sk-1', 'sk-2'], bodyType: 'SOLID' },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('同一草图两次 → 提示 + 提交禁用，不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderLoftDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 1' }), 'sk-1');
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 2' }), 'sk-1');
    expect(screen.getByTestId('part-studio-feature-dialog-loft-duplicate-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('对话框打开期间删除已选草图（sketches 缩水）→ 陈旧选择提示 + 提交禁用，不留陈旧 id 放行', async () => {
    const applyOp = makeApplyOp();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const shared = {
      featureName: '放样',
      mode: 'new' as const,
      featureType: 'loft' as const,
      applyOp,
      connectionKey: 'model-key',
      onConfirm,
      onCancel: vi.fn(),
    };
    const { rerender } = render(
      <FeatureDialog {...shared} sketches={[...SKETCHES, { id: 'sk-3', label: '草图 3' }]} />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 1' }), 'sk-1');
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 2' }), 'sk-2');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    // 删除 sk-1（剩 2 张：sk-2/sk-3）——loftNeedsTwo 不触发，但已选 id 已失活 → sketch 选项存活判据拦下。
    rerender(<FeatureDialog {...shared} sketches={[{ id: 'sk-2', label: '草图 2' }, { id: 'sk-3', label: '草图 3' }]} />);
    // 断言渲染文案而非仅 testid（复审：key 拼错时 i18n 无缺键处理器会原样吐 key，
    // 只查 testid 会漏绿——此断言钉 i18n 键名与词库 spelling 一致）。
    expect(screen.getByTestId('part-studio-feature-dialog-loft-stale-hint').textContent)
      .toBe('已选截面草图已不存在，请重新选择');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('草图不足两张 → 需要两张截面草图提示 + 提交禁用（不发 op）', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderLoftDialog(applyOp, { sketches: [{ id: 'sk-1', label: '草图 1' }] });
    expect(screen.getByTestId('part-studio-feature-dialog-loft-needs-two-hint')).toBeDefined();
    expect(screen.queryByRole('combobox', { name: '截面草图 1' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('edit 模式/壳期不渲染 loft 选择器（new + applyOp 才进入通道）', () => {
    renderDialog({ featureType: 'loft' });
    expect(screen.queryByRole('combobox', { name: '截面草图 1' })).toBeNull();
  });

  it('多截面：添加截面 → 三个有序下拉；载荷 sketchIds=[a,b,c]', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderLoftDialog(applyOp, {
      sketches: [...SKETCHES, { id: 'sk-3', label: '草图 3' }],
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 1' }), 'sk-1');
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 2' }), 'sk-2');
    await user.click(screen.getByTestId('part-studio-feature-dialog-loft-add-section'));
    expect(screen.getByRole('combobox', { name: '截面草图 3' })).toBeDefined();
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 3' }), 'sk-3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'loft',
      params: { sketchIds: ['sk-1', 'sk-2', 'sk-3'], bodyType: 'SOLID' },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('多截面：第三截面与已有重复 → 重复提示 + 提交禁用', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderLoftDialog(applyOp, {
      sketches: [...SKETCHES, { id: 'sk-3', label: '草图 3' }],
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 1' }), 'sk-1');
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 2' }), 'sk-2');
    await user.click(screen.getByTestId('part-studio-feature-dialog-loft-add-section'));
    await user.selectOptions(screen.getByRole('combobox', { name: '截面草图 3' }), 'sk-1');
    expect(screen.getByTestId('part-studio-feature-dialog-loft-duplicate-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('多截面：移除第三截面 → 回到两个下拉', async () => {
    const { user } = renderLoftDialog(makeApplyOp(), {
      sketches: [...SKETCHES, { id: 'sk-3', label: '草图 3' }],
    });
    await user.click(screen.getByTestId('part-studio-feature-dialog-loft-add-section'));
    expect(screen.getByRole('combobox', { name: '截面草图 3' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '移除截面 3' }));
    expect(screen.queryByRole('combobox', { name: '截面草图 3' })).toBeNull();
    expect(screen.getByRole('combobox', { name: '截面草图 2' })).toBeDefined();
  });

  // 2026-11-15 dialog audit group-b §3：loft 信息页签 + query field + 禁用行。
  it('live 信息页签：实体/新建选中且全部禁用，aria 名与 extrude 的页签不冲突', () => {
    renderLoftDialog(makeApplyOp());
    const resultTabs = screen.getByRole('tablist', { name: '放样结果类型' });
    const booleanTabs = screen.getByRole('tablist', { name: '放样布尔作用域' });
    expect(screen.queryByRole('tablist', { name: '结果类型' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: '布尔作用域' })).toBeNull();
    expect(within(resultTabs).getByRole('tab', { name: '实体' }).getAttribute('aria-selected')).toBe('true');
    for (const tab of within(resultTabs).getAllByRole('tab')) {
      expect((tab as HTMLButtonElement).disabled).toBe(true);
      expect(tab.getAttribute('aria-disabled')).toBe('true');
      expect(tab.getAttribute('title')).toBe('该能力尚未实现');
    }
    expect(within(booleanTabs).getByRole('tab', { name: '新建' }).getAttribute('aria-selected')).toBe('true');
    for (const tab of within(booleanTabs).getAllByRole('tab')) {
      expect((tab as HTMLButtonElement).disabled).toBe(true);
      expect(tab.getAttribute('aria-disabled')).toBe('true');
      expect(tab.getAttribute('title')).toBe('该能力尚未实现');
    }
  });

  it('live query field：`轮廓` 标签 + 有序截面/添加按钮在 42px 选中壳内', () => {
    renderLoftDialog(makeApplyOp());
    const field = screen.getByTestId('part-studio-feature-dialog-loft-profile-field');
    expect(field.textContent).toContain('轮廓');
    expect(within(field).getByRole('combobox', { name: '截面草图 1' })).toBeDefined();
    expect(within(field).getByRole('combobox', { name: '截面草图 2' })).toBeDefined();
    expect(within(field).getByTestId('part-studio-feature-dialog-loft-add-section')).toBeDefined();
    expect(field.className).toContain('is-selected');
  });

  it('live 终止形态组 + 四条禁用行：title=未实现，组可折叠', async () => {
    const { user } = renderLoftDialog(makeApplyOp());
    const toggle = screen.getByTestId('part-studio-feature-dialog-loft-termination-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const start = screen.getByRole('combobox', { name: '起始轮廓形态' }) as HTMLSelectElement;
    const end = screen.getByRole('combobox', { name: '终止轮廓形态' }) as HTMLSelectElement;
    for (const select of [start, end]) {
      expect(select.disabled).toBe(true);
      expect(select.value).toBe('none');
      expect((select.selectedOptions[0] as HTMLOptionElement).textContent).toBe('无');
      expect(select.getAttribute('title')).toBe('该能力尚未实现');
    }
    for (const id of ['loft-guides', 'loft-path', 'loft-connections', 'loft-show-isoparametric']) {
      const row = screen.getByTestId(`part-studio-feature-dialog-${id}`);
      expect(row.getAttribute('title')).toBe('该能力尚未实现');
      expect((within(row).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    }
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('combobox', { name: '起始轮廓形态' })).toBeNull();
  });

  it('范围提示视觉隐藏（sr-only）但 testid/文本保留', () => {
    renderLoftDialog(makeApplyOp());
    const hint = screen.getByTestId('part-studio-feature-dialog-loft-parallel-hint');
    expect(hint.className).toContain('part-studio-feature-dialog__sr-hint');
    expect(hint.textContent).toBe('首版放样要求两张截面草图平行');
  });
});

// ---------------------------------------------------------------------------
// B3 Task 3：sweep 通道（轮廓草图 + 路径草图双选择器——最小入口）。
// 首版只做单闭合轮廓沿单条直线路径（SweepParams.profileSketchId/pathSketchId +
// bodyType:'SOLID'；无 twist/scale/lock/guides UI）。两个独立下拉（轮廓草图/路径草图），
// 门禁=两键均已选且互不相同、且仍存在于实时草图选项；载荷无 distance/profile/regions 键。
// ribbon 入口：SweepFaces 虽是真实直改工具 id，但参数化特征链入口改道本对话框
//（与 loft/extrude/revolve 同姿态，见 Ribbon.tsx）。
// ---------------------------------------------------------------------------
describe('B3 sweep 通道（轮廓草图 + 路径草图双选择器）', () => {
  const SKETCHES = [
    { id: 'sk-profile', label: '草图 1' },
    { id: 'sk-path', label: '草图 2' },
  ];

  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  function renderSweepDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="扫掠"
        mode="new"
        featureType="sweep"
        applyOp={applyOp}
        sketches={SKETCHES}
        connectionKey="model-key"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    return { user, onConfirm };
  }

  it('初始形态：轮廓/路径两个下拉在场、距离输入不在场、直线路径提示在场、✓/成品禁用（未选草图）', () => {
    renderSweepDialog(makeApplyOp());
    expect(screen.getByRole('combobox', { name: '轮廓草图' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: '路径草图' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull(); // sweep 无距离量
    // 首版范围提示：路径草图须为一条直线（服务端 op 边界同口径拒收）。
    expect(screen.getByTestId('part-studio-feature-dialog-sweep-path-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('选轮廓 + 路径 → previewOp insertFeature sweep（150ms 防抖，2026-11-08）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user } = renderSweepDialog(makeApplyOp(), { previewOp });
    await user.selectOptions(screen.getByRole('combobox', { name: '轮廓草图' }), 'sk-profile');
    await user.selectOptions(screen.getByRole('combobox', { name: '路径草图' }), 'sk-path');
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'sweep',
      params: { profileSketchId: 'sk-profile', pathSketchId: 'sk-path', bodyType: 'SOLID' },
    });
  });

  it('选轮廓 + 路径 → 载荷 {profileSketchId, pathSketchId, bodyType:"SOLID"}（无 distance/profile/regions 键）→ onConfirm', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderSweepDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '轮廓草图' }), 'sk-profile');
    await user.selectOptions(screen.getByRole('combobox', { name: '路径草图' }), 'sk-path');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'sweep',
      params: { profileSketchId: 'sk-profile', pathSketchId: 'sk-path', bodyType: 'SOLID' },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('同一草图作为轮廓与路径 → 提示 + 提交禁用，不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderSweepDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '轮廓草图' }), 'sk-profile');
    await user.selectOptions(screen.getByRole('combobox', { name: '路径草图' }), 'sk-profile');
    expect(screen.getByTestId('part-studio-feature-dialog-sweep-duplicate-hint').textContent)
      .toBe('轮廓草图与路径草图不能相同');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('对话框打开期间删除已选草图（sketches 缩水）→ 陈旧选择提示 + 提交禁用，不留陈旧 id 放行', async () => {
    const applyOp = makeApplyOp();
    const user = userEvent.setup();
    const shared = {
      featureName: '扫掠',
      mode: 'new' as const,
      featureType: 'sweep' as const,
      applyOp,
      connectionKey: 'model-key',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    };
    const { rerender } = render(
      <FeatureDialog {...shared} sketches={[...SKETCHES, { id: 'sk-3', label: '草图 3' }]} />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '轮廓草图' }), 'sk-profile');
    await user.selectOptions(screen.getByRole('combobox', { name: '路径草图' }), 'sk-path');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    // 删除 sk-path（剩 2 张：sk-profile/sk-3）——needsTwo 不触发，但已选 id 已失活 → 存活判据拦下。
    rerender(<FeatureDialog {...shared} sketches={[{ id: 'sk-profile', label: '草图 1' }, { id: 'sk-3', label: '草图 3' }]} />);
    expect(screen.getByTestId('part-studio-feature-dialog-sweep-stale-hint').textContent)
      .toBe('已选草图已不存在，请重新选择');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('草图不足两张 → 需要两张草图提示 + 提交禁用（不发 op，不出下拉）', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderSweepDialog(applyOp, { sketches: [{ id: 'sk-profile', label: '草图 1' }] });
    expect(screen.getByTestId('part-studio-feature-dialog-sweep-needs-two-hint')).toBeDefined();
    expect(screen.queryByRole('combobox', { name: '轮廓草图' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('edit 模式/壳期不渲染 sweep 选择器（new + applyOp 才进入通道）', () => {
    renderDialog({ featureType: 'sweep' });
    expect(screen.queryByRole('combobox', { name: '轮廓草图' })).toBeNull();
  });

  // 2026-11-15 dialog audit group-b §4：sweep 信息页签 + 双 query field + 禁用行。
  it('live 信息页签：实体/新建选中且全部禁用，aria 名与 extrude 的页签不冲突', () => {
    renderSweepDialog(makeApplyOp());
    const resultTabs = screen.getByRole('tablist', { name: '扫掠结果类型' });
    const booleanTabs = screen.getByRole('tablist', { name: '扫掠布尔作用域' });
    expect(screen.queryByRole('tablist', { name: '结果类型' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: '布尔作用域' })).toBeNull();
    expect(within(resultTabs).getByRole('tab', { name: '实体' }).getAttribute('aria-selected')).toBe('true');
    for (const tab of within(resultTabs).getAllByRole('tab')) {
      expect((tab as HTMLButtonElement).disabled).toBe(true);
      expect(tab.getAttribute('aria-disabled')).toBe('true');
      expect(tab.getAttribute('title')).toBe('该能力尚未实现');
    }
    expect(within(booleanTabs).getByRole('tab', { name: '新建' }).getAttribute('aria-selected')).toBe('true');
    for (const tab of within(booleanTabs).getAllByRole('tab')) {
      expect((tab as HTMLButtonElement).disabled).toBe(true);
      expect(tab.getAttribute('aria-disabled')).toBe('true');
      expect(tab.getAttribute('title')).toBe('该能力尚未实现');
    }
  });

  it('live query fields：轮廓/路径标签；路径未选时红框必填，选中后移除', async () => {
    const { user } = renderSweepDialog(makeApplyOp());
    const profileField = screen.getByTestId('part-studio-feature-dialog-sweep-profile-field');
    expect(profileField.textContent).toContain('要扫掠的面和草图面域');
    expect(within(profileField).getByRole('combobox', { name: '轮廓草图' })).toBeDefined();
    const pathField = screen.getByTestId('part-studio-feature-dialog-sweep-path-field');
    expect(pathField.textContent).toContain('扫掠路径');
    expect(within(pathField).getByRole('combobox', { name: '路径草图' })).toBeDefined();
    expect(pathField.className).toContain('part-studio-feature-dialog__profile-field--required');
    await user.selectOptions(screen.getByRole('combobox', { name: '路径草图' }), 'sk-path');
    expect(screen.getByTestId('part-studio-feature-dialog-sweep-path-field').className)
      .not.toContain('part-studio-feature-dialog__profile-field--required');
  });

  it('live 禁用行：延伸至完整路径/轮廓控制(无)/扭曲/缩放（title=未实现）', () => {
    renderSweepDialog(makeApplyOp());
    for (const id of ['sweep-extend-full-path', 'sweep-twist', 'sweep-scale']) {
      const row = screen.getByTestId(`part-studio-feature-dialog-${id}`);
      expect(row.getAttribute('title')).toBe('该能力尚未实现');
      expect((within(row).getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    }
    const controlRow = screen.getByTestId('part-studio-feature-dialog-sweep-profile-control');
    const control = within(controlRow).getByRole('combobox', { name: '轮廓控制' }) as HTMLSelectElement;
    expect(control.disabled).toBe(true);
    expect(control.value).toBe('none');
    expect((control.selectedOptions[0] as HTMLOptionElement).textContent).toBe('无');
    expect(control.getAttribute('title')).toBe('该能力尚未实现');
  });

  it('路径范围提示视觉隐藏（sr-only）但 testid/文本保留', () => {
    renderSweepDialog(makeApplyOp());
    const hint = screen.getByTestId('part-studio-feature-dialog-sweep-path-hint');
    expect(hint.className).toContain('part-studio-feature-dialog__sr-hint');
    expect(hint.textContent).toBe('首版扫掠要求路径草图恰为一条直线（曲线/多段路径暂不支持）');
  });
});

// ---------------------------------------------------------------------------
// B4 Task 4：mirror 通道（世界平面三选一——最小入口）。
// 首版只做过世界原点的 XY/YZ/XZ 平面 + keepOriginal 字面量 true（保留原体并与镜像体
// Unite；无任意面/基准面引用）。载荷 {plane, keepOriginal:true}，无 distance/profile/
// regions/草图键；无上游实体（hasBodies=false）→ 诚实提示 + 提交禁用。
// ribbon 入口：MirrorElements 是真实直改工具 id，Ribbon 特例改道本对话框。
// ---------------------------------------------------------------------------
describe('B4 mirror 通道（世界平面三选一）', () => {
  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  function renderMirrorDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="镜像"
        mode="new"
        featureType="mirror"
        applyOp={applyOp}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    return { user, onConfirm };
  }

  it('初始形态：平面下拉在场（缺省 XZ）、距离输入不在场、范围提示在场、✓/成品可用（有体）', () => {
    renderMirrorDialog(makeApplyOp());
    const select = screen.getByRole('combobox', { name: '镜像平面' }) as HTMLSelectElement;
    expect(select.value).toBe('XZ');
    expect(screen.getByRole('option', { name: 'XY 平面（法向 Z）' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'YZ 平面（法向 X）' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'XZ 平面（法向 Y）' })).toBeDefined();
    // v1.41：无面快照时 FACE 选项在场但禁用（不猜面）。
    expect((screen.getByRole('option', { name: '选中的面' }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull(); // mirror 无距离量
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-scope-hint')).toBeDefined();
    // 2026-11-15 live：模式行 = 真实作用域选择器（零件/特征/面镜像），面镜像禁用。
    const scope = screen.getByTestId('part-studio-feature-dialog-mirror-scope') as HTMLSelectElement;
    expect(scope.value).toBe('body');
    expect(within(scope).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '零件镜像', '特征镜像', '面镜像',
    ]);
    const faceScope = within(scope).getByRole('option', { name: '面镜像' }) as HTMLOptionElement;
    expect(faceScope.disabled).toBe(true);
    expect(faceScope.getAttribute('title')).toBe('该能力尚未实现');
    // 旧重复「镜像范围」行已删除。
    expect(screen.queryByRole('combobox', { name: '镜像范围' })).toBeNull();
    // 实体字段 = live query field（12px 标签；无 bodies → 26px 空态）。
    const entities = screen.getByTestId('part-studio-feature-dialog-mirror-entities');
    expect(entities.textContent).toContain('要镜像的图元');
    expect(entities.className).toContain('is-empty');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('实体 query field：active bodies 渲染为只读 chips（无假 ×）+ 整件作用范围 title', () => {
    renderMirrorDialog(makeApplyOp(), {
      bodies: [
        { bodyKey: '0x15', name: 'Part 1', active: true, authored: true, sourceFeatureId: 'f1' },
        { bodyKey: '0x18', name: 'Part 2', active: true, authored: true, sourceFeatureId: 'f2' },
      ],
    });
    const field = screen.getByTestId('part-studio-feature-dialog-mirror-entities');
    expect(field.className).not.toContain('is-empty');
    expect(field.getAttribute('title')).toContain('全部上游实体');
    expect(within(field).getAllByRole('listitem').map((chip) => chip.textContent)).toEqual(['Part 1', 'Part 2']);
    expect(within(field).queryByRole('button')).toBeNull();
  });

  it('打开即触发 previewOp insertFeature mirror（默认 XZ，2026-11-08）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    renderMirrorDialog(makeApplyOp(), { previewOp });
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'mirror',
      params: { plane: 'XZ', keepOriginal: true },
    });
  });

  it('edit 模式打开即触发 previewOp updateParams mirror（2026-11-08）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    renderMirrorDialog(makeApplyOp(), {
      previewOp,
      mode: 'edit',
      featureId: 'f-mirror',
      initialParams: { plane: 'XZ', keepOriginal: true },
    });
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'updateParams',
      featureId: 'f-mirror',
      params: { plane: 'XZ', keepOriginal: true },
    });
  });

  it('选择 YZ 平面 → 载荷 {plane:"YZ", keepOriginal:true}（无 distance/profile/regions 键）→ onConfirm', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderMirrorDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '镜像平面' }), 'YZ');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'mirror',
      params: { plane: 'YZ', keepOriginal: true },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('无上游实体（hasBodies=false）→ 需要上游实体提示 + 提交禁用 + 不渲染平面下拉/不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderMirrorDialog(applyOp, { hasBodies: false });
    // 断言渲染文案而非仅 testid（i18n 键名 spelling 钉死——缺键处理器会原样吐 key）。
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-needs-body-hint').textContent)
      .toBe('镜像需要上游实体：请先创建至少一个实体特征');
    expect(screen.queryByRole('combobox', { name: '镜像平面' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('edit 模式/壳期不渲染 mirror 平面下拉（new + applyOp 才进入通道）', () => {
    renderDialog({ featureType: 'mirror' });
    expect(screen.queryByRole('combobox', { name: '镜像平面' })).toBeNull();
  });

  it('v1.37 编辑任意平面镜像（planeLine）→ 只读提示 + 下拉禁用 + 提交禁用 + 不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderMirrorDialog(applyOp, {
      mode: 'edit',
      initialParams: { planeLine: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: -1, z: 0 } }, keepOriginal: true },
    });
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-plane-line-readonly-hint').textContent)
      .toContain('任意世界平面');
    expect((screen.getByRole('combobox', { name: '镜像平面' }) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('v1.41 路由快照单个面 → 缺省 FACE，载荷 {faceRef, keepOriginal:true}', async () => {
    const applyOp = makeApplyOp();
    const face = {
      kind: 'face' as const,
      id: 'face-1',
      topologyId: { nodeId: 1, entityId: 2 },
      ownerBodyKey: '0x15',
      label: '顶面',
    };
    const { user, onConfirm } = renderMirrorDialog(applyOp, { initialFaces: [face] });
    const select = screen.getByRole('combobox', { name: '镜像平面' }) as HTMLSelectElement;
    expect(select.value).toBe('FACE');
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-face-hint').textContent).toContain('1:2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'mirror',
      params: { faceRef: { nodeId: 1, entityId: 2 }, keepOriginal: true },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('v1.48 镜像操作页签：新建禁用；加入缺省、移除/相交可提交 operation', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderMirrorDialog(applyOp);
    const tablist = screen.getByRole('tablist', { name: '镜像操作' });
    const newTab = within(tablist).getByRole('tab', { name: '新建' }) as HTMLButtonElement;
    expect(newTab.disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-operation-hint').textContent)
      .toContain('多体');
    const addTab = within(tablist).getByRole('tab', { name: '加入' }) as HTMLButtonElement;
    expect(addTab.getAttribute('aria-selected')).toBe('true');
    await user.click(within(tablist).getByRole('tab', { name: '移除' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'mirror',
      params: { plane: 'XZ', keepOriginal: true, operation: 'subtract' },
    });
  });

  // Onshape live + 审计（2026-11-15）：mirror 只保留已接线的「镜像操作」页签，
  // 不再叠加通用「布尔作用域」行（旧行为两行冲突，且前者为可点击 no-op）。
  it('仅一枚 tablist：「镜像操作」；无重复「镜像范围」行，页签在实体字段之前', () => {
    renderMirrorDialog(makeApplyOp());
    const tablists = screen.getAllByRole('tablist');
    expect(tablists).toHaveLength(1);
    expect(tablists[0]!.getAttribute('aria-label')).toBe('镜像操作');
    expect(screen.queryByRole('tablist', { name: '布尔作用域' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: '镜像范围' })).toBeNull();
    // 作用域选择器即 live 模式行控件（非旧「镜像范围」行）。
    const scope = screen.getByTestId('part-studio-feature-dialog-mirror-scope');
    expect(scope.closest('.part-studio-feature-dialog__mode-row')).not.toBeNull();
    // 页签紧随作用域下拉、位于实体 query field 之前。
    const entities = screen.getByTestId('part-studio-feature-dialog-mirror-entities');
    expect(tablists[0]!.compareDocumentPosition(entities) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('v1.48 编辑回显：stored operation=intersect → 相交页签选中；世界平面镜像编辑通道保持可改', () => {
    renderMirrorDialog(makeApplyOp(), {
      mode: 'edit',
      initialParams: { plane: 'YZ', keepOriginal: true, operation: 'intersect' },
    });
    const tablist = screen.getByRole('tablist', { name: '镜像操作' });
    expect(within(tablist).getByRole('tab', { name: '相交' }).getAttribute('aria-selected')).toBe('true');
    expect(within(tablist).getByRole('tab', { name: '移除' }).getAttribute('aria-selected')).toBe('false');
    expect((screen.getByRole('combobox', { name: '镜像平面' }) as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('多选面 → FACE 选项禁用 + 明确提示；仍可提交世界平面', async () => {
    const applyOp = makeApplyOp();
    const faces = [
      { kind: 'face' as const, id: 'f1', topologyId: { nodeId: 1, entityId: 2 }, ownerBodyKey: '0x15' },
      { kind: 'face' as const, id: 'f2', topologyId: { nodeId: 3, entityId: 4 }, ownerBodyKey: '0x15' },
    ];
    const { user } = renderMirrorDialog(applyOp, { initialFaces: faces });
    const select = screen.getByRole('combobox', { name: '镜像平面' }) as HTMLSelectElement;
    expect(select.value).toBe('XZ');
    const faceOption = screen.getByRole('option', { name: '选中的面' }) as HTMLOptionElement;
    expect(faceOption.disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-face-multiple-hint').textContent)
      .toContain('2');
    await user.selectOptions(select, 'YZ');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'mirror',
      params: { plane: 'YZ', keepOriginal: true },
    });
  });

  it('v1.41 编辑落库 faceRef → 只读提示 + 下拉/确认禁用 + 不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderMirrorDialog(applyOp, {
      mode: 'edit',
      initialParams: { faceRef: { nodeId: 1, entityId: 2 }, keepOriginal: true },
    });
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-face-readonly-hint')).toBeDefined();
    expect((screen.getByRole('combobox', { name: '镜像平面' }) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  // 2026-11-08 live 证据 mirror-feature-scope-20261108：作用域 零件镜像/特征镜像；
  // 特征镜像 = 源特征下拉（“要镜像的特征”）+ 世界平面 → featureMirror 载荷。
  it('特征镜像作用域：缺省零件镜像；切到特征镜像显示源特征下拉、隐藏镜像操作页签/面选项', async () => {
    const { user } = renderMirrorDialog(makeApplyOp(), {
      features: [
        { id: 'f-ext', label: '拉伸 1', featureType: 'extrude' },
        { id: 'f-hole', label: '孔 1', featureType: 'hole' },
      ],
    });
    const scope = screen.getByTestId('part-studio-feature-dialog-mirror-scope') as HTMLSelectElement;
    expect(scope.value).toBe('body');
    expect(screen.queryByTestId('part-studio-feature-dialog-mirror-source')).toBeNull();
    expect(screen.getByRole('tablist', { name: '镜像操作' })).toBeDefined();
    await user.selectOptions(scope, 'feature');
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-source')).toBeDefined();
    expect(screen.queryByRole('tablist', { name: '镜像操作' })).toBeNull();
    expect(screen.queryByRole('option', { name: '选中的面' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('特征镜像：源特征之后显示禁用的「重新应用特征」行（无后端通道）', async () => {
    const { user } = renderMirrorDialog(makeApplyOp(), {
      features: [{ id: 'f-ext', label: '拉伸 1', featureType: 'extrude' }],
    });
    expect(screen.queryByTestId('part-studio-feature-dialog-mirror-reapply-features')).toBeNull();
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-scope'), 'feature');
    const row = screen.getByTestId('part-studio-feature-dialog-mirror-reapply-features');
    const checkbox = within(row).getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    expect(row.getAttribute('title')).toBe('该能力尚未实现');
    expect(row.textContent).toContain('重新应用特征');
  });

  it('特征镜像：选源特征 + YZ 平面 → insertFeature featureMirror planeLine(过原点/法向 X)', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderMirrorDialog(applyOp, {
      features: [{ id: 'f-ext', label: '拉伸 1', featureType: 'extrude' }],
    });
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-scope'), 'feature');
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-source'), 'f-ext');
    await user.selectOptions(screen.getByRole('combobox', { name: '镜像平面' }), 'YZ');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'featureMirror',
      params: {
        sourceFeatureId: 'f-ext',
        planeLine: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
      },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('特征镜像无源特征 → 空源提示 + 提交禁用 + 不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderMirrorDialog(applyOp, { features: [] });
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-scope'), 'feature');
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-source-empty-hint').textContent)
      .toContain('拉伸、旋转、孔');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('特征镜像预览：源/平面齐备 → previewOp insertFeature featureMirror', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user } = renderMirrorDialog(makeApplyOp(), {
      previewOp,
      features: [{ id: 'f-ext', label: '拉伸 1', featureType: 'extrude' }],
    });
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-scope'), 'feature');
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-source'), 'f-ext');
    await waitFor(() => {
      const last = previewOp.mock.calls.at(-1)?.[0];
      expect(last).toMatchObject({ kind: 'insertFeature', featureType: 'featureMirror' });
    }, { timeout: 3000 });
  });

  // F2（2026-11-16）：特征镜像作用域提交 featureMirror，标题/aria-label 必须
  // 跟随显示「特征镜像 N」（树派生名），而不是零件镜像的「镜像 N」。
  it('F2：标题跟随提交类型——特征镜像作用域显示「特征镜像 N」，切回零件恢复「镜像 N」', async () => {
    const featureNameForType = vi.fn((featureType: string) =>
      featureType === 'featureMirror' ? '特征镜像 1' : '镜像 2');
    const { user } = renderMirrorDialog(makeApplyOp(), {
      featureName: '镜像 2',
      featureNameForType,
      features: [{ id: 'f-ext', label: '拉伸 1', featureType: 'extrude' }],
    });
    const scope = screen.getByTestId('part-studio-feature-dialog-mirror-scope');
    expect(screen.getByRole('dialog', { name: '镜像 2' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '镜像 2' })).toBeDefined();

    await user.selectOptions(scope, 'feature');
    expect(featureNameForType).toHaveBeenCalledWith('featureMirror');
    expect(screen.getByRole('dialog', { name: '特征镜像 1' })).toBeDefined();
    expect(screen.getByRole('heading', { name: '特征镜像 1' })).toBeDefined();

    await user.selectOptions(scope, 'body');
    expect(screen.getByRole('dialog', { name: '镜像 2' })).toBeDefined();
  });

  it('F2：特征镜像提交成功 toast 用标题名（特征镜像 N），载荷类型仍由 submittedFeatureType 决定', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderMirrorDialog(applyOp, {
      featureName: '镜像 2',
      featureNameForType: (featureType: string) => featureType === 'featureMirror' ? '特征镜像 1' : '镜像 2',
      features: [{ id: 'f-ext', label: '拉伸 1', featureType: 'extrude' }],
    });
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-scope'), 'feature');
    await user.selectOptions(screen.getByTestId('part-studio-feature-dialog-mirror-source'), 'f-ext');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toMatchObject({ kind: 'insertFeature', featureType: 'featureMirror' });
    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalled());
    const details = mocks.outputMessage.mock.calls.at(-1)?.[0] as { briefMessage: string };
    expect(details.briefMessage).toBe('特征镜像 1 已创建');
  });

  it('多体：面属于非目标 body → owner mismatch 提示 + 提交禁用；改回同体恢复', async () => {
    const applyOp = makeApplyOp();
    const face = {
      kind: 'face' as const,
      id: 'face-1',
      topologyId: { nodeId: 1, entityId: 2 },
      ownerBodyKey: '0x15',
    };
    const { user } = renderMirrorDialog(applyOp, {
      initialFaces: [face],
      bodies: [
        { bodyKey: '0x15', name: 'Body 1', active: true, authored: true, sourceFeatureId: 'f1' },
        { bodyKey: '0x18', name: 'Body 2', active: true, authored: true, sourceFeatureId: 'f2' },
      ],
    });
    const target = screen.getByRole('combobox', { name: '目标实体' }) as HTMLSelectElement;
    expect(target.value).toBe('0x15'); // 单面快照默认目标 body
    await user.selectOptions(target, '0x18');
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-face-owner-mismatch-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.selectOptions(target, '0x15');
    expect(screen.queryByTestId('part-studio-feature-dialog-mirror-face-owner-mismatch-hint')).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B5 Task 5：pattern 通道（PART/body 级阵列——kind/count/spacing/angle/axis）。
// 首版只做 PART pattern：实例含原件、全部 Union 成单 body；linear 沿世界 X/Y/Z
// （count≥2、spacing>0），circular 绕世界 Z 过原点（count≥2、0<angle≤360，
// 实例角度=k*angle/count）。载荷 {kind, count, spacing?|angle?, axis}——两形态键
// 互斥（不发送对方形态的键）；circular axis 恒 'Z'（服务端 zod 同口径）。
// ribbon 入口：LinearPattern→initialPatternKind='linear'、CircularPattern→'circular'
// （均为 useToolActivation 改道参数化对话框；直改工具保留在册）。
// ---------------------------------------------------------------------------
describe('B5 pattern 通道（PART 级线性/圆周阵列）', () => {
  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  function renderPatternDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const rendered = render(
      <FeatureDialog
        featureName="阵列"
        mode="new"
        featureType="pattern"
        applyOp={applyOp}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    return { user, onConfirm, unmount: rendered.unmount };
  }

  it('初始形态（linear）：范围=零件阵列、类型下拉缺省线性、count=2、距离=10、axis=X；✓/成品可用', () => {
    renderPatternDialog(makeApplyOp());
    // 2026-11-15 live：作用域下拉（零件阵列选中；特征/面作用域无后端通道，诚实禁用）。
    const scope = screen.getByRole('combobox', { name: '阵列范围' }) as HTMLSelectElement;
    expect(scope.value).toBe('body');
    const featureOption = within(scope).getByRole('option', { name: '特征阵列' }) as HTMLOptionElement;
    expect(featureOption.disabled).toBe(true);
    expect(featureOption.getAttribute('title')).toBe('该能力尚未实现');
    const faceOption = within(scope).getByRole('option', { name: '面阵列' }) as HTMLOptionElement;
    expect(faceOption.disabled).toBe(true);
    expect(faceOption.getAttribute('title')).toBe('该能力尚未实现');
    const kind = screen.getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement;
    expect(kind.value).toBe('linear');
    expect(within(kind).getByRole('option', { name: '线性阵列' })).toBeDefined();
    expect(within(kind).getByRole('option', { name: '圆周阵列' })).toBeDefined();
    expect((screen.getByRole('textbox', { name: '实例数' }) as HTMLInputElement).value).toBe('2');
    expect((screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement).value).toBe('10');
    expect(screen.getByRole('textbox', { name: '实例数' }).closest('section')!.getAttribute('title'))
      .toContain('包含原件');
    // 方向 query field：标签 + 世界轴下拉（可访问名沿用「方向轴」）+ 反向翻转钮。
    const direction = screen.getByTestId('part-studio-feature-dialog-pattern-direction');
    expect(direction.textContent).toContain('方向');
    expect(within(direction).getByRole('combobox', { name: '方向轴' })).toBeDefined();
    const reverse = within(direction).getByRole('button', { name: '反向' });
    expect(reverse.getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByRole('combobox', { name: '方向轴' }) as HTMLSelectElement).value).toBe('X');
    expect(screen.queryByRole('textbox', { name: '总角度（度）' })).toBeNull();
    // 跳过实例：禁用占位 + 未实现 title（无逐实例通道）。
    const skip = screen.getByTestId('part-studio-feature-dialog-pattern-skip-instances');
    expect(skip.getAttribute('title')).toBe('该能力尚未实现');
    expect(screen.getByTestId('part-studio-feature-dialog-pattern-scope-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('实体字段：要阵列化的图元 query field——无体时空态 26px；有体时只读 chip + 整件提示', () => {
    const { unmount } = renderPatternDialog(makeApplyOp());
    const empty = screen.getByTestId('part-studio-feature-dialog-pattern-entities');
    expect(empty.textContent).toContain('要阵列化的图元');
    expect(empty.className).toContain('is-empty');
    expect(empty.getAttribute('title')).toContain('全部上游实体');
    unmount();
    renderPatternDialog(makeApplyOp(), {
      bodies: [{ bodyKey: '0x15', name: 'Body 1', active: true, authored: true, sourceFeatureId: 'f1' }],
    });
    const filled = screen.getByTestId('part-studio-feature-dialog-pattern-entities');
    expect(filled.className).not.toContain('is-empty');
    expect(filled.textContent).toContain('Body 1');
    // 只读：无移除按钮/叉（整件阵列无逐体子集通道）。
    expect(within(filled).queryByRole('button')).toBeNull();
  });

  // Onshape live + 审计（2026-11-15）：pattern 载荷不读取布尔作用域，通用页签
  // 是可点击 no-op——对话框不得再渲染「布尔作用域」tablist。
  it('不渲染「布尔作用域」通用页签（pattern 不消费 scope；Onshape live + 审计 2026-11-15）', () => {
    renderPatternDialog(makeApplyOp());
    expect(screen.queryByRole('tablist', { name: '布尔作用域' })).toBeNull();
  });

  it('打开即触发 previewOp insertFeature pattern linear（2026-11-08）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user } = renderPatternDialog(makeApplyOp(), { previewOp });
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'linear', count: 2, spacing: 10, axis: 'X' },
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    await waitFor(() => expect(previewOp.mock.calls.some(([op]) =>
      op.kind === 'insertFeature' && op.featureType === 'pattern'
      && (op.params as { kind?: string }).kind === 'circular')).toBe(true), { timeout: 3000 });
  });

  it('edit 模式打开即触发 previewOp updateParams pattern（2026-11-08）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    renderPatternDialog(makeApplyOp(), {
      previewOp,
      mode: 'edit',
      featureId: 'f-pattern',
      initialParams: { kind: 'linear', count: 3, spacing: 10, axis: 'X' },
    });
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'updateParams',
      featureId: 'f-pattern',
      params: { kind: 'linear', count: 3, spacing: 10, axis: 'X' },
    });
  });

  it('线性提交：载荷 {kind:"linear", count:2, spacing:10, axis:"X"}（无 angle 键）→ onConfirm', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderPatternDialog(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'linear', count: 2, spacing: 10, axis: 'X' },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('切换圆周：angle 输入出现、spacing 消失、axis 锁定 Z；载荷 {kind:"circular", count:4, angle:180, axis:"Z"}（无 spacing 键）', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderPatternDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull();
    const angle = screen.getByRole('textbox', { name: '总角度（度）' }) as HTMLInputElement;
    expect(angle.value).toBe('360');
    const axis = screen.getByRole('combobox', { name: '方向轴' }) as HTMLSelectElement;
    expect(axis.value).toBe('Z');
    expect(axis.disabled).toBe(true);
    await user.clear(screen.getByRole('textbox', { name: '实例数' }));
    await user.type(screen.getByRole('textbox', { name: '实例数' }), '4');
    await user.clear(angle);
    await user.type(angle, '180');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'circular', count: 4, angle: 180, axis: 'Z' },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ribbon 入口 initialPatternKind="circular" → 初始即圆周形态（angle 在场、spacing 不在场、axis=Z 锁定）', () => {
    renderPatternDialog(makeApplyOp(), { initialPatternKind: 'circular' });
    expect((screen.getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement).value).toBe('circular');
    expect(screen.getByRole('textbox', { name: '总角度（度）' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull();
    expect((screen.getByRole('combobox', { name: '方向轴' }) as HTMLSelectElement).value).toBe('Z');
  });

  it('非法数值 → 字段级诚实文案 + 不发起 op（count<2 / 非整数、spacing<=0、angle 越界）', async () => {
    const cases: Array<{ field: string; value: string; message: string }> = [
      { field: '实例数', value: '1', message: '实例数量须为 2–1000 的整数（含原件）' },
      { field: '实例数', value: '2.5', message: '实例数量须为 2–1000 的整数（含原件）' },
      { field: '实例数', value: '1001', message: '实例数量须为 2–1000 的整数（含原件）' }, // M1 上限
      { field: '距离', value: '0', message: '间距须为正数' },
    ];
    for (const c of cases) {
      const applyOp = makeApplyOp();
      const { user, onConfirm, unmount } = renderPatternDialog(applyOp);
      const input = screen.getByRole('textbox', { name: c.field });
      await user.clear(input);
      await user.type(input, c.value);
      await user.click(screen.getByRole('button', { name: '确认' }));
      expect(screen.getByRole('alert').textContent).toBe(c.message);
      expect(applyOp).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
      unmount(); // 每个 case 独立现场，防错误态残留
    }
    // angle 越界（圆周形态）
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    const angle = screen.getByRole('textbox', { name: '总角度（度）' });
    await user.clear(angle);
    await user.type(angle, '361');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(screen.getByRole('alert').textContent).toBe('总角度须在 (0, 360] 度之间');
    expect(applyOp).not.toHaveBeenCalled();
  });

  // v1.49（ADR-0007 切片 6）：居中线性阵列——UI 输入 N=每侧实例数（含原件），
  // 载荷 count=2N−1（总实例数，必为奇数，seed 居中）；圆周不支持居中。
  it('v1.49 居中：勾选后标签改为每侧实例数 + 提示在场；载荷 count=2N−1（缺省 N=2→3）+ centered:true', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderPatternDialog(applyOp);
    await user.click(screen.getByRole('checkbox', { name: '居中' }));
    expect(screen.queryByRole('textbox', { name: '实例数' })).toBeNull();
    const perSide = screen.getByRole('textbox', { name: '每侧实例数（含原件）' }) as HTMLInputElement;
    expect(perSide.value).toBe('2');
    expect(screen.getByTestId('part-studio-feature-dialog-pattern-centered-hint').textContent).toContain('2N−1');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'linear', count: 3, spacing: 10, axis: 'X', centered: true },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('v1.49 居中边界：N=1 / N=501 → 每侧实例数文案拒收且不发 op（N 上限 500 保证总数 ≤999）', async () => {
    for (const value of ['1', '501']) {
      const applyOp = makeApplyOp();
      const { user, unmount } = renderPatternDialog(applyOp);
      await user.click(screen.getByRole('checkbox', { name: '居中' }));
      const input = screen.getByRole('textbox', { name: '每侧实例数（含原件）' });
      await user.clear(input);
      await user.type(input, value);
      await user.click(screen.getByRole('button', { name: '确认' }));
      expect(screen.getByRole('alert').textContent).toBe('每侧实例数须为 2–500 的整数（含原件）');
      expect(applyOp).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('v1.49 居中：切圆周即禁用并复位「居中」；圆周载荷不带 centered/count 仍为输入总数', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp);
    await user.click(screen.getByRole('checkbox', { name: '居中' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    const centered = screen.getByRole('checkbox', { name: '居中' }) as HTMLInputElement;
    expect(centered.checked).toBe(false);
    expect(centered.disabled).toBe(true);
    expect(screen.queryByTestId('part-studio-feature-dialog-pattern-centered-hint')).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'circular', count: 2, angle: 360, axis: 'Z' },
    });
  });

  it('v1.49 居中编辑回显：落库 count=5 → 显示 N=3；updateParams 仍发 count=5 + centered:true', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-p',
      initialParams: { kind: 'linear', count: 5, spacing: 6, axis: 'X', centered: true },
    });
    expect((screen.getByRole('checkbox', { name: '居中' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('textbox', { name: '每侧实例数（含原件）' }) as HTMLInputElement).value).toBe('3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-p',
      params: { kind: 'linear', count: 5, spacing: 6, axis: 'X', centered: true },
    });
  });

  it('v1.62 第二方向：勾选 → count/spacing/axis 字段，载荷 secondDirection（线性）', async () => {
    const applyOp = makeApplyOp();
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user, onConfirm } = renderPatternDialog(applyOp, { previewOp });
    const second = screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement;
    expect(second.checked).toBe(false);
    expect(screen.queryByRole('textbox', { name: '第二方向实例数量（含原件）' })).toBeNull();
    await user.click(second);
    expect((screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' }) as HTMLInputElement).value).toBe('2');
    expect((screen.getByRole('textbox', { name: '第二方向间距' }) as HTMLInputElement).value).toBe('10');
    expect((screen.getByRole('combobox', { name: '第二方向轴' }) as HTMLSelectElement).value).toBe('Y');
    await user.clear(screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' }));
    await user.type(screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' }), '3');
    await user.clear(screen.getByRole('textbox', { name: '第二方向间距' }));
    await user.type(screen.getByRole('textbox', { name: '第二方向间距' }), '5');
    await user.selectOptions(screen.getByRole('combobox', { name: '第二方向轴' }), 'Y');
    const expected = {
      kind: 'insertFeature',
      featureType: 'pattern',
      params: {
        kind: 'linear', count: 2, spacing: 10, axis: 'X',
        secondDirection: { count: 3, spacing: 5, axis: 'Y' },
      },
    };
    await waitFor(() => expect(previewOp.mock.calls.at(-1)![0]).toMatchObject(expected), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith(expected);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('v1.62 第二方向 edit 回显/居中：count=3 → 每侧 2；updateParams 发 2N−1 + centered', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-p2',
      initialParams: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        secondDirection: { count: 3, spacing: 5, axis: 'Z', centered: true },
      },
    });
    const second = screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement;
    expect(second.checked).toBe(true);
    expect((screen.getByRole('textbox', { name: '第二方向每侧实例数（含原件）' }) as HTMLInputElement).value).toBe('2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-p2',
      params: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        secondDirection: { count: 3, spacing: 5, axis: 'Z', centered: true },
      },
    });
  });

  it('v1.62 第二方向拒收：总实例 >1000 / 间距 ≤0 / 圆周复位', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp);
    await user.click(screen.getByRole('checkbox', { name: '第二个方向' }));
    const count = screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' });
    await user.clear(count);
    await user.type(count, '2');
    const firstCount = screen.getByRole('textbox', { name: '实例数' });
    await user.clear(firstCount);
    await user.type(firstCount, '600');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('1000');

    await user.clear(firstCount);
    await user.type(firstCount, '3');
    await user.clear(screen.getByRole('textbox', { name: '第二方向间距' }));
    await user.type(screen.getByRole('textbox', { name: '第二方向间距' }), '0');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('正数');

    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect((screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: '第二个方向' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('v1.63 第一方向反向：方向字段翻转钮 aria-pressed → 载荷 oppositeDirection:true；edit 回显；圆周复位', async () => {
    const applyOp = makeApplyOp();
    const first = renderPatternDialog(applyOp);
    const reverse = screen.getByRole('button', { name: '反向' }) as HTMLButtonElement;
    expect(reverse.getAttribute('aria-pressed')).toBe('false');
    await first.user.click(reverse);
    expect(reverse.getAttribute('aria-pressed')).toBe('true');
    await first.user.selectOptions(screen.getByRole('combobox', { name: '方向轴' }), 'Y');
    await first.user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'linear', count: 2, spacing: 10, axis: 'Y', oppositeDirection: true },
    });
    first.unmount();

    const editApplyOp = makeApplyOp();
    const edit = renderPatternDialog(editApplyOp, {
      mode: 'edit',
      featureId: 'f-rev',
      initialParams: { kind: 'linear', count: 3, spacing: 10, axis: 'X', oppositeDirection: true },
    });
    const editReverse = screen.getAllByRole('button', { name: '反向' }).at(-1) as HTMLButtonElement;
    expect(editReverse.getAttribute('aria-pressed')).toBe('true');
    await edit.user.click(screen.getAllByRole('button', { name: '确认' }).at(-1)!);
    expect(editApplyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-rev',
      params: { kind: 'linear', count: 3, spacing: 10, axis: 'X', oppositeDirection: true },
    });

    await edit.user.selectOptions(screen.getAllByRole('combobox', { name: '阵列类型' }).at(-1)!, 'circular');
    expect(screen.queryAllByRole('button', { name: '反向' })).toHaveLength(0);
  });

  // ADR-0020 S6（shared 1.76）：线性阵列间距表达式。spacing 保持必填物化快照，
  // 表达式原文随载荷提交；仅 linear 适用（circular 两键都不带）；未触碰保留、
  // 数值编辑清除；无效求值阻断提交/预览并给 S5 本地化错误。
  const SP_VARIABLE: VariableDto = { id: 'v-sp', name: 'sp', expression: '10', type: 'length' };
  const EDIT_WITH_SPACING_EXPRESSION = {
    kind: 'linear', count: 3, spacing: 10, axis: 'X', spacingExpression: '#sp',
  };

  it('S6 间距表达式：`#sp` → 载荷 {spacing: 求值 10, spacingExpression: "#sp"}（预览同源求值）', async () => {
    const applyOp = makeApplyOp();
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user, onConfirm } = renderPatternDialog(applyOp, {
      previewOp,
      variables: [SP_VARIABLE],
    });
    const input = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    expect(input.value).toBe('10');
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#sp');
    expect(input.value).toBe('#sp'); // 聚焦显示表达式原文
    await user.tab();
    expect(input.value).toBe('10'); // 失焦显示本地求值（sp=10）
    const expected = {
      kind: 'insertFeature',
      featureType: 'pattern',
      params: {
        kind: 'linear', count: 2, spacing: 10, axis: 'X', spacingExpression: '#sp',
      },
    };
    // 后端影子预览只消费求值 spacing（与载荷同源）。
    await waitFor(() => expect(previewOp.mock.calls.at(-1)?.[0]).toMatchObject(expected), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith(expected);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('S6 编辑未触碰保留：改方向轴 → updateParams 原样保留 spacingExpression/spacing 快照', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-sp',
      variables: [SP_VARIABLE],
      initialParams: EDIT_WITH_SPACING_EXPRESSION,
    });
    const input = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    expect(input.value).toBe('10'); // 失焦=物化快照（不是表达式原文）
    await user.click(input);
    expect(input.value).toBe('#sp'); // 聚焦=存储表达式
    await user.tab();
    await user.selectOptions(screen.getByRole('combobox', { name: '方向轴' }), 'Y');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-sp',
      params: {
        kind: 'linear', count: 3, spacing: 10, axis: 'Y', spacingExpression: '#sp',
      },
    });
  });

  it('S6 数值编辑清除表达式：改成 20 → 载荷 spacing 20 且不带 spacingExpression', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-sp2',
      variables: [SP_VARIABLE],
      initialParams: EDIT_WITH_SPACING_EXPRESSION,
    });
    const input = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '20');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.params).toMatchObject({ kind: 'linear', count: 3, spacing: 20, axis: 'X' });
    expect((op.params as Record<string, unknown>).spacingExpression).toBeUndefined();
  });

  it('S6 切圆周：表达式清除、不渲染距离行 → 载荷无 spacing/spacingExpression；切回线性草稿归位数值', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, { variables: [SP_VARIABLE] });
    const input = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#sp');
    await user.tab();
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'circular', count: 2, angle: 360, axis: 'Z' },
    });
    // 切回线性：旧表达式已清除。必须**聚焦**断言（未聚焦的受控输入显示
    // numberText，即使表达式残留也会是数值——聚焦才暴露残留的 `#sp`）；
    // 再提交一次并断言载荷不带 spacingExpression（宿主清除 effect 的真正判据）。
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'linear');
    // 切圆周会把方向轴置为 Z（既有行为，不回滚）——显式改回 X，让断言只盯表达式。
    await user.selectOptions(screen.getByRole('combobox', { name: '方向轴' }), 'X');
    const back = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.click(back);
    expect(back.value).toBe('10');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'linear', count: 2, spacing: 10, axis: 'X' },
    });
  });

  it('S6 无效表达式阻断提交与预览：`#nope` → ✓ 禁用 + S5 字段错误 + 不重发 previewOp/不发 op', async () => {
    const applyOp = makeApplyOp();
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user } = renderPatternDialog(applyOp, { previewOp, variables: [SP_VARIABLE] });
    await waitFor(() => expect(previewOp).toHaveBeenCalledTimes(1), { timeout: 3000 });
    const input = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#nope');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('expression-field-error').textContent).toContain('未知变量');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    // 无效表达式不产生新的影子求值（不回落数值草稿、不出假预览）。
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(previewOp).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('S6 编辑 + 变量表未就绪：未触碰的落库表达式按物化 spacing 放行（不误报未知变量）', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-sp3',
      variables: [],
      variablesLoading: true,
      initialParams: EDIT_WITH_SPACING_EXPRESSION,
    });
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-sp3',
      params: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X', spacingExpression: '#sp',
      },
    });
  });

  // ADR-0020 S9（shared 1.79）：第二方向间距表达式——嵌套在
  // `secondDirection.spacingExpression`（与第一方向顶层同名键分层）。
  const W_VARIABLE: VariableDto = { id: 'v-w', name: 'w', expression: '5', type: 'length' };
  const SECOND_AXIS_Y = 'Y' as const;
  const secondSpacingInput = (): HTMLInputElement =>
    screen.getByRole('textbox', { name: '第二方向间距' }) as HTMLInputElement;

  it('S9 两层同名表达式区分（仅第一方向）：顶层带 spacingExpression，第二方向对象不带', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-s9-a',
      variables: [SP_VARIABLE],
      initialParams: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        spacingExpression: '#sp',
        secondDirection: { count: 2, spacing: 5, axis: SECOND_AXIS_Y },
      },
    });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-s9-a',
      params: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X', spacingExpression: '#sp',
        secondDirection: { count: 2, spacing: 5, axis: SECOND_AXIS_Y },
      },
    });
  });

  it('S9 两层同名表达式区分（仅第二方向）：嵌套带 spacingExpression，顶层不带', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-s9-b',
      variables: [SP_VARIABLE],
      initialParams: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        secondDirection: {
          count: 2, spacing: 5, axis: SECOND_AXIS_Y, spacingExpression: '#sp',
        },
      },
    });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-s9-b',
      params: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        // 嵌套表达式在场 → 嵌套 spacing 与本地求值同源（5 → 10），顶层不串键。
        secondDirection: {
          count: 2, spacing: 10, axis: SECOND_AXIS_Y, spacingExpression: '#sp',
        },
      },
    });
  });

  it('S9 两层同名表达式区分（两层同时）：各自使用自己的求值/原文，互不覆盖', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-s9-c',
      variables: [SP_VARIABLE, W_VARIABLE],
      initialParams: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        spacingExpression: '#sp',
        secondDirection: {
          count: 2, spacing: 5, axis: SECOND_AXIS_Y, spacingExpression: '#w',
        },
      },
    });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-s9-c',
      params: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X', spacingExpression: '#sp',
        secondDirection: {
          count: 2, spacing: 5, axis: SECOND_AXIS_Y, spacingExpression: '#w',
        },
      },
    });
  });

  it('S9 第二方向表达式输入：`#sp` → 嵌套 {spacing: 求值, spacingExpression}；预览同源', async () => {
    const applyOp = makeApplyOp();
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user } = renderPatternDialog(applyOp, { previewOp, variables: [SP_VARIABLE] });
    await user.click(screen.getByRole('checkbox', { name: '第二个方向' }));
    const input = secondSpacingInput();
    expect(input.value).toBe('10');
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#sp');
    expect(input.value).toBe('#sp');
    await user.tab();
    expect(input.value).toBe('10');
    const expected = {
      kind: 'insertFeature',
      featureType: 'pattern',
      params: {
        kind: 'linear', count: 2, spacing: 10, axis: 'X',
        secondDirection: { count: 2, spacing: 10, axis: SECOND_AXIS_Y, spacingExpression: '#sp' },
      },
    };
    // 全等断言：预览载荷不得夹带任何顶层/嵌套串键（与确认载荷同形）。
    await waitFor(() => expect(previewOp.mock.calls.at(-1)?.[0]).toEqual(expected), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith(expected);
    // 第一方向不受影响（顶层无表达式，数值仍为 10）。
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'insertFeature' }>;
    expect((op.params as Record<string, unknown>).spacingExpression).toBeUndefined();
  });

  it('S9 第二方向未触碰保留：改实例数 → 嵌套 spacingExpression 原样保留 + 求值重物化', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-s9-d',
      variables: [SP_VARIABLE],
      initialParams: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        secondDirection: {
          count: 2, spacing: 5, axis: SECOND_AXIS_Y, spacingExpression: '#sp',
        },
      },
    });
    const secondCount = screen.getByRole('textbox', { name: '第二方向实例数量（含原件）' });
    await user.clear(secondCount);
    await user.type(secondCount, '3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'updateParams',
      featureId: 'f-s9-d',
      params: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        secondDirection: {
          count: 3, spacing: 10, axis: SECOND_AXIS_Y, spacingExpression: '#sp',
        },
      },
    });
  });

  it('S9 第二方向数值编辑清除：改成 20 → 嵌套 spacing 20 且不带 spacingExpression', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, {
      mode: 'edit',
      featureId: 'f-s9-e',
      variables: [SP_VARIABLE],
      initialParams: {
        kind: 'linear', count: 3, spacing: 10, axis: 'X',
        secondDirection: {
          count: 2, spacing: 5, axis: SECOND_AXIS_Y, spacingExpression: '#sp',
        },
      },
    });
    const input = secondSpacingInput();
    await user.click(input);
    expect(input.value).toBe('#sp');
    await user.clear(input);
    await user.type(input, '20');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls[0]![0] as Extract<FeatureOp, { kind: 'updateParams' }>;
    expect(op.params).toMatchObject({
      kind: 'linear', count: 3, spacing: 10, axis: 'X',
      secondDirection: { count: 2, spacing: 20, axis: SECOND_AXIS_Y },
    });
    const second = (op.params as Record<string, unknown>).secondDirection as Record<string, unknown>;
    expect(second.spacingExpression).toBeUndefined();
  });

  it('S9 禁用第二方向清除表达式：取消勾选 → 载荷无 secondDirection；重新勾选草稿归位数值', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, { variables: [SP_VARIABLE] });
    const second = screen.getByRole('checkbox', { name: '第二个方向' });
    await user.click(second);
    const input = secondSpacingInput();
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#sp');
    await user.tab();
    await user.click(second);
    expect(screen.queryByRole('textbox', { name: '第二方向间距' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'linear', count: 2, spacing: 10, axis: 'X' },
    });
    // 重新勾选：旧表达式已被宿主清除（聚焦才暴露残留的 `#sp`）。
    await user.click(second);
    const back = secondSpacingInput();
    await user.click(back);
    expect(back.value).toBe('10');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: {
        kind: 'linear', count: 2, spacing: 10, axis: 'X',
        secondDirection: { count: 2, spacing: 10, axis: SECOND_AXIS_Y },
      },
    });
  });

  it('S9 第二方向无效表达式阻断：`#nope` → ✓ 禁用 + S5 本地化字段错误 + 不重发 previewOp/不发 op', async () => {
    const applyOp = makeApplyOp();
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    const { user } = renderPatternDialog(applyOp, { previewOp, variables: [SP_VARIABLE] });
    await waitFor(() => expect(previewOp).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await user.click(screen.getByRole('checkbox', { name: '第二个方向' }));
    // 启用第二方向本身是合法参数变化：先等它自己的防抖预览落地（第 2 次），
    // 再输入无效表达式——否则断言会与 150 ms 防抖竞态。
    await waitFor(() => expect(previewOp).toHaveBeenCalledTimes(2), { timeout: 3000 });
    const input = secondSpacingInput();
    await user.click(input);
    await user.clear(input);
    await user.type(input, '#nope');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByTestId('expression-field-error').at(-1)!.textContent).toContain('未知变量');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(previewOp).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('无上游实体（hasBodies=false）→ 需要上游实体提示 + 提交禁用 + 不渲染参数控件/不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, { hasBodies: false });
    expect(screen.getByTestId('part-studio-feature-dialog-pattern-needs-body-hint').textContent)
      .toBe('阵列需要上游实体：请先创建至少一个实体特征');
    expect(screen.queryByRole('combobox', { name: '阵列类型' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('edit 模式/壳期不渲染 pattern 参数控件（new + applyOp 才进入通道）', () => {
    renderDialog({ featureType: 'pattern' });
    expect(screen.queryByRole('combobox', { name: '阵列类型' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// M6-b T6：fillet 通道（F8——体边拾取，不走草图通道）。**对话框驱动拾取裁决**：
// 「添加边」钮启动 FilletEdgePickTool（动态 import——本文件 mock 该工具模块替身
// 捕获回调现场，editor 基座链不入测试图），工具每拾一条边（已即时换边自身持久
// id 单引用，shared v1.9）回调 chips 增行，右键/Esc/再点钮结束拾取回对话框。
// 覆盖：载荷构造（多边/单边/半径/切向延伸）/chips 增删与无关键去重/空边集门禁
// /拾取态分叉（✓ 禁用、Esc 只结束拾取、卸载守卫退工具）/无 body 与无连接诚实降级。
// ---------------------------------------------------------------------------
describe('M6-b T6 fillet 通道（对话框驱动边拾取）', () => {
  // M6-d v1.9：FilletEdgeRef=边自身持久 id 单引用（面对对退役）。
  const EDGE_1 = { edge: { nodeId: 1, entityId: 2 } };
  const EDGE_2 = { edge: { nodeId: 1, entityId: 4 } };
  // Critical 1：owner=拾取元素 id（getBodies.bodyKey）。
  const FILLET_BODY_1: BodyInfo = { bodyKey: '0x15', name: 'Body 1', active: true, authored: true, sourceFeatureId: 'f1' };
  const FILLET_BODY_2: BodyInfo = { bodyKey: '0x18', name: 'Body 2', active: true, authored: true, sourceFeatureId: 'f2' };
  const FILLET_BODY_CONSUMED: BodyInfo = { bodyKey: '0x20', name: 'Body 3', active: false, authored: true };
  const FILLET_BODIES_TWO = [FILLET_BODY_1, FILLET_BODY_2];
  /**
   * 模拟工具拾得一条边（换算完成后回调）。ownerElementId 缺省 `0x15`（单 body
   * 测试现场）；Critical 1 用例显式传所属 body。
   */
  function pickEdge(
    ref: { edge: { nodeId: number; entityId: number } },
    ownerElementId = '0x15',
  ): void {
    pickMocks.captured?.onEdgeAdded?.(ref, ownerElementId);
  }

  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  beforeEach(() => {
    pickMocks.captured = undefined;
    pickMocks.startFilletEdgePick.mockClear();
    pickMocks.exitTool.mockClear();
    pickMocks.suspendPicking.mockClear();
    pickMocks.resumePicking.mockClear();
  });

  function renderFilletDialog(applyOp: ReturnType<typeof makeApplyOp>, props: Partial<Parameters<typeof FeatureDialog>[0]> = {}) {
    const onConfirm = vi.fn();
    const rendered = render(
      <FeatureDialog
        featureName="圆角"
        mode="new"
        featureType="fillet"
        applyOp={applyOp}
        connectionKey="model-key"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    return { onConfirm, applyOp, unmount: rendered.unmount };
  }

  it('初始形态：半径缺省 5 + 切向延伸勾选 + 添加边钮 + 空边集提示 + ✓/成品禁用 + 距离区不在场', () => {
    renderFilletDialog(makeApplyOp());
    expect((screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement).value).toBe('5');
    expect((screen.getByRole('checkbox', { name: '切向延伸' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge')).toBeDefined();
    expect(screen.queryByRole('button', { name: '快速拾取' })).toBeNull(); // 通用快速拾取不接
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull(); // 距离量不适用
    expect(screen.getByTestId('part-studio-feature-dialog-no-edges-hint').textContent).toBe('选择要圆角的边');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    // 草图通道不接（输入是体边非草画面域）。
    expect(screen.queryByRole('combobox', { name: '草图' })).toBeNull();
  });

  // Onshape live 2026-11-15：边选择 = 单一 query field（空态 26px 蓝底单行，
  // 标签在字段内；字段本体点击即启动拾取）。
  it('边查询字段：空态 is-empty 单行 + 字段内标签；点字段启动拾取并显示「结束拾取」', async () => {
    const user = userEvent.setup();
    renderFilletDialog(makeApplyOp());
    const field = screen.getByTestId('part-studio-feature-dialog-edge-field');
    expect(field.className).toContain('is-empty');
    expect(field.textContent).toContain('要设置圆角的图元');
    await user.click(field);
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    expect(field.className).toContain('is-picking');
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').textContent).toBe('结束拾取');
    expect(screen.getByTestId('part-studio-feature-dialog-picking-hint')).toBeDefined();
  });

  // Onshape live + 审计（2026-11-15）：允许边溢出无实现通道——必须是禁用且
  // 未勾选的占位，不再是 enabled+checked 的假控件。
  it('「允许边溢出」为未实现占位：禁用未勾选（Onshape live + 审计 2026-11-15）', () => {
    renderFilletDialog(makeApplyOp());
    const overflow = screen.getByRole('checkbox', { name: '允许边溢出' }) as HTMLInputElement;
    expect(overflow.disabled).toBe(true);
    expect(overflow.checked).toBe(false);
  });

  // 审计 A1（2026-11-16）：四个次级选项（不对称/部分圆角/可变圆角/平滑圆角）
  // 均无实现通道——禁用未勾选之外必须带未实现理由 title（不留无理由灰控件）。
  it('不对称/部分圆角/可变圆角/平滑圆角：禁用未勾选 + 未实现 title（审计 A1）', () => {
    renderFilletDialog(makeApplyOp());
    for (const name of ['不对称', '部分圆角', '可变圆角', '平滑圆角']) {
      const checkbox = screen.getByRole('checkbox', { name }) as HTMLInputElement;
      expect(checkbox.disabled).toBe(true);
      expect(checkbox.checked).toBe(false);
      expect(checkbox.getAttribute('title')).toBe('该能力尚未实现');
    }
  });

  it('单边载荷：拾 1 边 → chip「边 1」→ 结束拾取 → ✓ 解禁 → 载荷 {radius:5, propagateSmooth:true, edges:[对]}', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    // 拾取会话在场时 ✓ 保持禁用（提交须先结束拾取——对话框驱动流程）。
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    pickMocks.captured?.onEnded?.(); // 右键/Esc 结束拾取回对话框
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'fillet',
      params: { radius: 5, propagateSmooth: true, edges: [EDGE_1] },
    });
  });

  it('chamfer 通道复用边拾取：倒角距离 3 → 载荷 mode=2 / values1=3 / values2=3', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), { featureType: 'chamfer', featureName: '倒角' });
    expect(screen.getByRole('textbox', { name: '距离' })).toBeDefined();
    expect(screen.getByTestId('part-studio-feature-dialog-no-edges-hint').textContent).toBe('选择要倒角的边');
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    const input = screen.getByRole('textbox', { name: '距离' });
    await user.clear(input);
    await user.type(input, '3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'chamfer',
      params: { mode: 2, propagateSmooth: true, edges: [EDGE_1], values1: 3, values2: 3 },
    });
  });

  // 审计 A3（2026-11-16）：Onshape live 倒角图元字段接受“面”（面→边自动
  // 分解）；产品只有边拾取通道——常驻诚实提示，圆角通道（live 只有边）不出现。
  it('倒角常驻诚实提示：面→边分解未支持，请逐条选择边（圆角不出现）', () => {
    const chamfer = renderFilletDialog(makeApplyOp(), { featureType: 'chamfer', featureName: '倒角' });
    expect(screen.getByTestId('part-studio-feature-dialog-chamfer-face-hint').textContent)
      .toBe('面→边分解未支持，请逐条选择边。');
    chamfer.unmount();

    renderFilletDialog(makeApplyOp(), { featureType: 'fillet', featureName: '圆角' });
    expect(screen.queryByTestId('part-studio-feature-dialog-chamfer-face-hint')).toBeNull();
  });

  it('chamfer 双距离模式：距离 1=2 / 距离 2=4 → 载荷 mode=2 / values1=2 / values2=4', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), { featureType: 'chamfer', featureName: '倒角' });
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'twoDistances');
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    const distance1 = screen.getByRole('textbox', { name: '距离 1' });
    await user.clear(distance1);
    await user.type(distance1, '2');
    const distance2 = screen.getByRole('textbox', { name: '距离 2' });
    await user.clear(distance2);
    await user.type(distance2, '4');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'chamfer',
      params: { mode: 2, propagateSmooth: true, edges: [EDGE_1], values1: 2, values2: 4 },
    });
  });

  it('chamfer 距离-角度模式：距离 1.524 / 角度 45° → mode=3 / values2=π/4', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), { featureType: 'chamfer', featureName: '倒角' });
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'distanceAngle');
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    const distance = screen.getByRole('textbox', { name: '距离' });
    await user.clear(distance);
    await user.type(distance, '1.524');
    const angle = screen.getByRole('textbox', { name: '角度' });
    await user.clear(angle);
    await user.type(angle, '45');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    const op = applyOp.mock.calls[0]![0];
    expect(op).toMatchObject({
      kind: 'insertFeature',
      featureType: 'chamfer',
      params: { mode: 3, propagateSmooth: true, edges: [EDGE_1], values1: 1.524 },
    });
    expect((op as { params: { values2: number } }).params.values2).toBeCloseTo(Math.PI / 4, 10);
  });

  it('chamfer 编辑回显：mode=3 / values1=1.524 / values2=π/4 → 距离-角度 + 45°', async () => {
    const applyOp = makeApplyOp();
    render(
      <FeatureDialog
        featureName="倒角 1"
        featureId="f-chamfer"
        mode="edit"
        featureType="chamfer"
        applyOp={applyOp}
        initialParams={{
          mode: 3,
          propagateSmooth: true,
          edges: [EDGE_1],
          values1: 1.524,
          values2: Math.PI / 4,
        }}
        onConfirm={vi.fn()}
      />,
    );
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).value).toBe('distanceAngle');
    expect((screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement).value).toBe('1.524');
    expect((screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement).value).toBe('45');
  });

  it('chamfer 预览：改距离触发 previewOp（updateParams，chamfer 载荷）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    render(
      <FeatureDialog
        featureName="倒角 1"
        featureId="f-chamfer"
        mode="edit"
        featureType="chamfer"
        applyOp={makeApplyOp()}
        previewOp={previewOp}
        initialParams={{ mode: 2, propagateSmooth: true, edges: [EDGE_1], values1: 2, values2: 2 }}
        onConfirm={vi.fn()}
      />,
    );
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'updateParams',
      featureId: 'f-chamfer',
      params: { mode: 2, edges: [EDGE_1], values1: 2, values2: 2 },
    });
    const user = userEvent.setup();
    const distance = screen.getByRole('textbox', { name: '距离' });
    await user.clear(distance);
    await user.type(distance, '3');
    await waitFor(() => expect(previewOp.mock.calls.some(([op]) => {
      const params = (op as Extract<FeatureOp, { kind: 'updateParams' }>).params as { values1?: number };
      return params.values1 === 3;
    })).toBe(true), { timeout: 3000 });
  });

  it('多边载荷：拾 2 边 → 两 chips（序号 1/2）→ 结束拾取 → 载荷 edges 按拾取序全量透传', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_2);
    pickEdge(EDGE_1);
    await screen.findByText('边 2');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: '确认' }));
    const params = (applyOp.mock.calls[0]![0] as { params: { edges: unknown[] } }).params;
    expect(params.edges).toEqual([EDGE_2, EDGE_1]); // 拾取序（契约面对序无关，透传即可）
  });

  // ── Critical 1：target 由拾取边父体自动推导（不默认 body1）─────────────────

  it('N=2：拾 body2 的边 → targetBodyId=body2（无手动下拉；只读显示目标体）', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), { bodies: FILLET_BODIES_TWO });
    // 手动 target 下拉不存在（自动推导语义）。
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1, '0x18');
    await screen.findByText('边 1');
    expect(screen.getByTestId('part-studio-feature-dialog-fillet-target-body').textContent)
      .toContain('Body 2');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'fillet',
      targetBodyId: '0x18',
      params: { radius: 5, propagateSmooth: true, edges: [EDGE_1] },
    });
  });

  it('边跨两个 body → 显式错误 + 禁提交（不回落默认 target，零 op）', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), { bodies: FILLET_BODIES_TWO });
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1, '0x15');
    pickEdge(EDGE_2, '0x18');
    await screen.findByText('边 2');
    pickMocks.captured?.onEnded?.();
    const alert = await screen.findByTestId('part-studio-feature-dialog-fillet-target-error');
    expect(alert.textContent).toContain('跨多个实体');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('跨 body 同 refKey（边 id 碰撞）→ 不折叠，仍判混合并禁提交', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), { bodies: FILLET_BODIES_TWO });
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1, '0x15');
    pickEdge({ edge: { nodeId: 1, entityId: 2 } }, '0x18'); // 同 refKey、异 owner
    await screen.findByText('边 2');
    pickMocks.captured?.onEnded?.();
    expect((await screen.findByTestId('part-studio-feature-dialog-fillet-target-error')).textContent)
      .toContain('跨多个实体');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('owner 非 active authored body（未知/消费态）→ 显式错误 + 禁提交（零 op）', async () => {
    for (const owner of ['0x99', '0x20']) {
      const user = userEvent.setup();
      const { applyOp, unmount } = renderFilletDialog(makeApplyOp(), {
        bodies: [...FILLET_BODIES_TWO, FILLET_BODY_CONSUMED],
      });
      await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
      await waitFor(() => expect(pickMocks.captured).toBeDefined());
      pickEdge(EDGE_1, owner);
      await screen.findByText('边 1');
      pickMocks.captured?.onEnded?.();
      const alert = await screen.findByTestId('part-studio-feature-dialog-fillet-target-error');
      expect(alert.textContent).toContain(owner);
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
      await user.click(screen.getByRole('button', { name: '确认' }));
      expect(applyOp).not.toHaveBeenCalled();
      unmount();
      pickMocks.captured = undefined;
    }
  });

  it('N=1：即使拾到唯一 body 的边也保持 legacy（不发 targetBodyId）', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), { bodies: [FILLET_BODY_1] });
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1, '0x15');
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'fillet',
      params: { radius: 5, propagateSmooth: true, edges: [EDGE_1] },
    });
  });

  it('半径与切向延伸进载荷：改 2.5 + 取消勾选 → {radius:2.5, propagateSmooth:false}', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    const radius = screen.getByRole('textbox', { name: '半径' });
    await user.clear(radius);
    await user.type(radius, '2.5');
    await user.click(screen.getByRole('checkbox', { name: '切向延伸' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'fillet',
      params: { radius: 2.5, propagateSmooth: false, edges: [EDGE_1] },
    });
  });

  it('非法半径（0）→ 校验 Alert 就地，不发起 op', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    const radius = screen.getByRole('textbox', { name: '半径' });
    await user.clear(radius);
    await user.type(radius, '0');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(screen.getByRole('alert').textContent).toContain('圆角半径');
    expect(applyOp).not.toHaveBeenCalled();
  });

  // ── ADR-0020 S4c：fillet 半径表达式（length >0；chamfer 不接）──────────
  const FILLET_RADIUS_VARIABLE: VariableDto = { id: 'vr', name: 'r', expression: '5', type: 'length' };
  async function filletWithEdge(props: Partial<Parameters<typeof FeatureDialog>[0]> = {}) {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp(), props);
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    return { user, applyOp };
  }

  it('S4c 半径表达式：聚焦原文/失焦求值 → 载荷 {radius: 求值, radiusExpression: 原文}', async () => {
    const { user, applyOp } = await filletWithEdge({ variables: [FILLET_RADIUS_VARIABLE] });
    const radius = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.clear(radius);
    await user.type(radius, '#r*2');
    await user.tab();
    expect(radius.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'fillet',
      params: {
        radius: 10,
        radiusExpression: '#r*2',
        propagateSmooth: true,
        edges: [EDGE_1],
      },
    });
  });

  it('P1 回归：preview RPC 返回 preview 后不随渲染循环重发（一次变化一次）', async () => {
    const previewOp = vi.fn(async (): Promise<PreviewResult> => ({
      ok: true,
      affected: [],
      preview: {
        entries: [],
        categoryId: '0x1',
        placement: { origin: { x: 0, y: 0, z: 0 }, angles: { yaw: 0, pitch: 0, roll: 0 } },
      },
    }));
    const { user } = await filletWithEdge({ previewOp });
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    // 让 150ms 防抖 + setState 全部落位，再观察静默窗口内调用次数不增长。
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
    const stable = previewOp.mock.calls.length;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
    expect(previewOp.mock.calls.length, 'preview RPC 不得每渲染重发（P1 反馈环）')
      .toBe(stable);

    // 有意义变化（半径数值）→ 允许一次新调用，并再次证明其不自我循环。
    const radius = screen.getByRole('textbox', { name: '半径' });
    await user.clear(radius);
    await user.type(radius, '3');
    await waitFor(() => expect(previewOp.mock.calls.length).toBeGreaterThan(stable), { timeout: 3000 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
    const afterChange = previewOp.mock.calls.length;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 800)); });
    expect(previewOp.mock.calls.length).toBe(afterChange);
  });

  it('S4c 半径表达式无效 → ✓ 禁用 + aria-invalid（零 op）', async () => {
    const { user, applyOp } = await filletWithEdge({ variables: [FILLET_RADIUS_VARIABLE] });
    const radius = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.clear(radius);
    await user.type(radius, '#nope');
    await waitFor(() => expect(radius.getAttribute('aria-invalid')).toBe('true'));
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('P2.1 半径引用 angle 变量 → 字段侧可见 variable-type 文案（aria-describedby 可达）', async () => {
    const { user } = await filletWithEdge({
      variables: [{ id: 'va', name: 'ang', expression: '45', type: 'angle' }],
    });
    const radius = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.clear(radius);
    await user.type(radius, '#ang*2');
    const error = await screen.findByTestId('expression-field-error');
    expect(error.textContent).toContain('变量 #ang 的类型 angle');
    expect(error.textContent).toContain('length/number/any');
    expect(radius.getAttribute('aria-describedby')).toBe(error.id);
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('S4c 编辑未触碰保留表达式；数值替换清除半径表达式', async () => {
    const initialParams = {
      radius: 10,
      radiusExpression: '#r*2',
      propagateSmooth: true,
      edges: [EDGE_1],
    };
    const user = userEvent.setup();
    const untouched = renderFilletDialog(makeApplyOp(), {
      mode: 'edit',
      featureId: 'f-1',
      featureName: '圆角 1',
      variables: [FILLET_RADIUS_VARIABLE],
      initialParams,
    });
    const radiusInput = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    expect(radiusInput.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(untouched.applyOp.mock.calls[0]![0]).toMatchObject({
      kind: 'updateParams',
      params: { radius: 10, radiusExpression: '#r*2', propagateSmooth: true, edges: [EDGE_1] },
    });
    untouched.unmount();
    const edited = renderFilletDialog(makeApplyOp(), {
      mode: 'edit',
      featureId: 'f-1',
      featureName: '圆角 1',
      variables: [FILLET_RADIUS_VARIABLE],
      initialParams,
    });
    const input = screen.getByRole('textbox', { name: '半径' }) as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe('#r*2');
    await user.clear(input);
    await user.type(input, '3');
    await user.tab();
    expect(input.value).toBe('3');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = edited.applyOp.mock.calls[0]![0];
    expect(op).toMatchObject({
      kind: 'updateParams',
      featureId: 'f-1',
      params: { radius: 3, propagateSmooth: true, edges: [EDGE_1] },
    });
    if (op.kind !== 'updateParams') throw new Error('expected updateParams');
    expect((op.params as Record<string, unknown>).radiusExpression).toBeUndefined();
  });

  // ── ADR-0020 S7：chamfer 值 1/值 2 表达式（shared 1.77）──────────────────
  // 三模式各接表达式（equal 单字段双键同原文；twoDistances 两距离；
  // distanceAngle 距离 + 角度（度书写→契约弧度））；数值编辑清除、切换
  // 模式清除非适用表达式、无效禁提/无预览、类型门与编辑态回显推断。
  const CHAMFER_W_VARIABLE: VariableDto = { id: 'vw', name: 'w', expression: '10', type: 'length' };
  const CHAMFER_H_VARIABLE: VariableDto = { id: 'vh', name: 'h', expression: '20', type: 'length' };
  const CHAMFER_ANGLE_VARIABLE: VariableDto = { id: 'va', name: 'ang', expression: '90', type: 'angle' };

  async function chamferWithEdge(
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ): Promise<{ user: ReturnType<typeof userEvent.setup>; applyOp: ReturnType<typeof makeApplyOp> }> {
    return filletWithEdge({ featureType: 'chamfer', featureName: '倒角', ...props });
  }

  function chamferParamsOf(op: FeatureOp): Record<string, unknown> {
    return (op as Extract<FeatureOp, { kind: 'insertFeature' | 'updateParams' }>)
      .params as unknown as Record<string, unknown>;
  }

  it('S7 等距离：单字段 `#w` → values1=values2=10，两个表达式原文相同', async () => {
    const { user, applyOp } = await chamferWithEdge({ variables: [CHAMFER_W_VARIABLE] });
    const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    expect(distance.getAttribute('data-expression-field')).toBe('length');
    await user.clear(distance);
    await user.type(distance, '#w');
    await user.tab();
    expect(distance.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'chamfer',
      params: {
        mode: 2,
        propagateSmooth: true,
        edges: [EDGE_1],
        values1: 10,
        values2: 10,
        values1Expression: '#w',
        values2Expression: '#w',
      },
    });
  });

  it('S7 两个距离：`#w` / `#h` → values1=10 / values2=20，各带表达式原文', async () => {
    const { user, applyOp } = await chamferWithEdge({
      variables: [CHAMFER_W_VARIABLE, CHAMFER_H_VARIABLE],
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'twoDistances');
    const distance1 = screen.getByRole('textbox', { name: '距离 1' }) as HTMLInputElement;
    await user.clear(distance1);
    await user.type(distance1, '#w');
    await user.tab();
    expect(distance1.value).toBe('10');
    const distance2 = screen.getByRole('textbox', { name: '距离 2' }) as HTMLInputElement;
    expect(distance2.getAttribute('data-expression-field')).toBe('length');
    await user.clear(distance2);
    await user.type(distance2, '#h');
    await user.tab();
    expect(distance2.value).toBe('20');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(chamferParamsOf(applyOp.mock.calls[0]![0])).toEqual({
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: 20,
      values1Expression: '#w',
      values2Expression: '#h',
    });
  });

  it('S7 距离和角度：`#w` + `#ang`（度求值 → 契约弧度）→ values2=π/2 + 原文', async () => {
    const { user, applyOp } = await chamferWithEdge({
      variables: [CHAMFER_W_VARIABLE, CHAMFER_ANGLE_VARIABLE],
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'distanceAngle');
    const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.clear(distance);
    await user.type(distance, '#w');
    await user.tab();
    expect(distance.value).toBe('10');
    const angle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    expect(angle.getAttribute('data-expression-field')).toBe('angleRadFromDeg');
    await user.clear(angle);
    await user.type(angle, '#ang');
    await user.tab();
    expect(angle.value).toBe('90');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const params = chamferParamsOf(applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({
      mode: 3,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values1Expression: '#w',
      values2Expression: '#ang',
    });
    expect(params.values2 as number).toBeCloseTo(Math.PI / 2, 10);
  });

  it('S7 编辑未触碰保留表达式；数值编辑清除对应键（等距离双键同删）', async () => {
    const user = userEvent.setup();
    const initialParams = {
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: 10,
      values1Expression: '#w',
      values2Expression: '#w',
    };
    const untouched = renderFilletDialog(makeApplyOp(), {
      featureType: 'chamfer',
      featureName: '倒角',
      mode: 'edit',
      featureId: 'f-chamfer',
      variables: [CHAMFER_W_VARIABLE],
      initialParams,
    });
    const untouchedInput = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    expect(untouchedInput.value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(untouched.applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-chamfer',
      params: { ...initialParams },
    });
    untouched.unmount();

    const edited = renderFilletDialog(makeApplyOp(), {
      featureType: 'chamfer',
      featureName: '倒角',
      mode: 'edit',
      featureId: 'f-chamfer',
      variables: [CHAMFER_W_VARIABLE],
      initialParams,
    });
    const input = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe('#w');
    await user.clear(input);
    await user.type(input, '3');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(chamferParamsOf(edited.applyOp.mock.calls[0]![0])).toEqual({
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 3,
      values2: 3,
    });
  });

  it('S7 切换倒角类型：第二字段表达式不跨模式携带（距离↔角度/回等距离均清除）', async () => {
    const { user, applyOp } = await chamferWithEdge({
      variables: [CHAMFER_W_VARIABLE, CHAMFER_H_VARIABLE],
    });
    const type = screen.getByRole('combobox', { name: '倒角类型' });
    await user.selectOptions(type, 'twoDistances');
    const distance1 = screen.getByRole('textbox', { name: '距离 1' }) as HTMLInputElement;
    await user.clear(distance1);
    await user.type(distance1, '#w');
    await user.tab();
    const distance2 = screen.getByRole('textbox', { name: '距离 2' }) as HTMLInputElement;
    await user.clear(distance2);
    await user.type(distance2, '#h');
    await user.tab();
    expect(distance2.value).toBe('20');
    // 切距离-角度：第二字段量纲变化 → 表达式清除，草稿回落到角度数值。
    await user.selectOptions(type, 'distanceAngle');
    const angle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    expect(angle.value).toBe('45');
    await user.click(angle);
    expect(angle.value).toBe('45'); // 非旧 `#h`
    await user.tab();
    // 切回两个距离：第二距离为数值草稿（旧表达式不复活）。
    await user.selectOptions(type, 'twoDistances');
    const distance2Again = screen.getByRole('textbox', { name: '距离 2' }) as HTMLInputElement;
    expect(distance2Again.value).toBe('20');
    await user.click(distance2Again);
    expect(distance2Again.value).toBe('20');
    await user.tab();
    // 回等距离：单字段 `#w` 同时写两个键（等距离语义），第二字段表达式已清除。
    await user.selectOptions(type, 'equal');
    expect((screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement).value).toBe('10');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(chamferParamsOf(applyOp.mock.calls[0]![0])).toEqual({
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: 10,
      values1Expression: '#w',
      values2Expression: '#w',
    });
  });

  it('S7 表达式无效 → ✓ 禁用且不再发预览 op（距离/角度两字段，互不串扰）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({
      ok: true,
      affected: [],
    }));
    const { user, applyOp } = await chamferWithEdge({
      variables: [CHAMFER_W_VARIABLE, CHAMFER_ANGLE_VARIABLE],
      previewOp,
    });
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    const confirm = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    // (a) 距离无效：✓ 禁用、零 op、无效距离不进入任何预览载荷。
    await user.clear(distance);
    await user.type(distance, '#nope');
    await waitFor(() => expect(distance.getAttribute('aria-invalid')).toBe('true'));
    expect(confirm.disabled).toBe(true);
    await user.click(confirm);
    expect(applyOp).not.toHaveBeenCalled();
    expect(previewOp.mock.calls.every(([op]) => {
      const params = chamferParamsOf(op);
      return params.values1Expression !== '#nope'
        && typeof params.values1 === 'number' && !Number.isNaN(params.values1);
    })).toBe(true);

    // (b) 恢复距离为有效数值；切距离-角度后角度默认 45° 有效 → 预览恢复。
    await user.clear(distance);
    await user.type(distance, '2');
    await user.tab();
    await waitFor(() => expect(distance.getAttribute('aria-invalid')).not.toBe('true'));
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'distanceAngle');
    const angle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    await waitFor(() => expect(chamferParamsOf(previewOp.mock.calls.at(-1)![0])).toMatchObject({
      mode: 3,
      values1: 2,
    }), { timeout: 3000 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    const validAngleCalls = previewOp.mock.calls.length;
    expect(chamferParamsOf(previewOp.mock.calls.at(-1)![0]).values2 as number)
      .toBeCloseTo(Math.PI / 4, 10);
    // (c) 距离有效、仅角度无效 → ✓ 禁用且不再发预览（阻断只来自角度）。
    await user.clear(angle);
    await user.type(angle, '#nope2');
    await waitFor(() => expect(angle.getAttribute('aria-invalid')).toBe('true'));
    expect(confirm.disabled).toBe(true);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    expect(previewOp.mock.calls.length).toBe(validAngleCalls);
    expect(previewOp.mock.calls.every(([op]) => {
      const params = chamferParamsOf(op);
      return params.values2Expression !== '#nope2'
        && typeof params.values2 === 'number' && !Number.isNaN(params.values2);
    })).toBe(true);
  });

  it('S7 等距离预览载荷：last previewOp 用求值数 + 双键同原文', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({
      ok: true, affected: [],
    }));
    const { user } = await chamferWithEdge({ variables: [CHAMFER_W_VARIABLE], previewOp });
    const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.clear(distance);
    await user.type(distance, '#w');
    await user.tab();
    await waitFor(() => expect(previewOp.mock.calls.some(([op]) =>
      chamferParamsOf(op).values1Expression === '#w')).toBe(true), { timeout: 3000 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    expect(chamferParamsOf(previewOp.mock.calls.at(-1)![0])).toEqual({
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: 10,
      values1Expression: '#w',
      values2Expression: '#w',
    });
  });

  it('S7 两个距离预览载荷：last previewOp 两求值数 + 两原文', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({
      ok: true, affected: [],
    }));
    const { user } = await chamferWithEdge({
      variables: [CHAMFER_W_VARIABLE, CHAMFER_H_VARIABLE],
      previewOp,
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'twoDistances');
    const distance1 = screen.getByRole('textbox', { name: '距离 1' }) as HTMLInputElement;
    await user.clear(distance1);
    await user.type(distance1, '#w');
    await user.tab();
    const distance2 = screen.getByRole('textbox', { name: '距离 2' }) as HTMLInputElement;
    await user.clear(distance2);
    await user.type(distance2, '#h');
    await user.tab();
    await waitFor(() => expect(previewOp.mock.calls.some(([op]) =>
      chamferParamsOf(op).values2Expression === '#h')).toBe(true), { timeout: 3000 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    expect(chamferParamsOf(previewOp.mock.calls.at(-1)![0])).toEqual({
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: 20,
      values1Expression: '#w',
      values2Expression: '#h',
    });
  });

  it('S7 距离和角度预览载荷：last previewOp values2 为度求值后的契约弧度', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({
      ok: true, affected: [],
    }));
    const { user } = await chamferWithEdge({
      variables: [CHAMFER_W_VARIABLE, CHAMFER_ANGLE_VARIABLE],
      previewOp,
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'distanceAngle');
    const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.clear(distance);
    await user.type(distance, '#w');
    await user.tab();
    const angle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    await user.clear(angle);
    await user.type(angle, '#ang');
    await user.tab();
    await waitFor(() => expect(previewOp.mock.calls.some(([op]) =>
      chamferParamsOf(op).values2Expression === '#ang')).toBe(true), { timeout: 3000 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    const params = chamferParamsOf(previewOp.mock.calls.at(-1)![0]);
    expect(params).toMatchObject({
      mode: 3,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values1Expression: '#w',
      values2Expression: '#ang',
    });
    expect(params.values2 as number).toBeCloseTo(Math.PI / 2, 10);
  });

  it('S7 两个距离编辑：未触碰保留两表达式；改距离 2 数值仅清除其表达式', async () => {
    const user = userEvent.setup();
    const initialParams = {
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: 20,
      values1Expression: '#w',
      values2Expression: '#h',
    };
    const props = {
      featureType: 'chamfer' as const,
      featureName: '倒角',
      mode: 'edit' as const,
      featureId: 'f-chamfer2',
      variables: [CHAMFER_W_VARIABLE, CHAMFER_H_VARIABLE],
      initialParams,
    };
    const untouched = renderFilletDialog(makeApplyOp(), props);
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).value)
      .toBe('twoDistances');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(untouched.applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-chamfer2',
      params: { ...initialParams },
    });
    untouched.unmount();

    const edited = renderFilletDialog(makeApplyOp(), props);
    const distance2 = screen.getByRole('textbox', { name: '距离 2' }) as HTMLInputElement;
    await user.click(distance2);
    expect(distance2.value).toBe('#h');
    await user.clear(distance2);
    await user.type(distance2, '7');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(chamferParamsOf(edited.applyOp.mock.calls[0]![0])).toEqual({
      mode: 2,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: 7,
      values1Expression: '#w',
    });
  });

  it('S7 距离和角度编辑：未触碰保留角度表达式；角度改数值按度→弧度且删原文', async () => {
    const user = userEvent.setup();
    const initialParams = {
      mode: 3,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values2: Math.PI / 2,
      values1Expression: '#w',
      values2Expression: '#ang',
    };
    const props = {
      featureType: 'chamfer' as const,
      featureName: '倒角',
      mode: 'edit' as const,
      featureId: 'f-chamfer3',
      variables: [CHAMFER_W_VARIABLE, CHAMFER_ANGLE_VARIABLE],
      initialParams,
    };
    const untouched = renderFilletDialog(makeApplyOp(), props);
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).value)
      .toBe('distanceAngle');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(untouched.applyOp.mock.calls[0]![0]).toEqual({
      kind: 'updateParams',
      featureId: 'f-chamfer3',
      params: { ...initialParams },
    });
    untouched.unmount();

    const edited = renderFilletDialog(makeApplyOp(), props);
    const angle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    expect(angle.value).toBe('90');
    await user.click(angle);
    expect(angle.value).toBe('#ang');
    await user.clear(angle);
    await user.type(angle, '30');
    await user.tab();
    expect(angle.value).toBe('30');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const params = chamferParamsOf(edited.applyOp.mock.calls[0]![0]);
    expect(params).toMatchObject({
      mode: 3,
      propagateSmooth: true,
      edges: [EDGE_1],
      values1: 10,
      values1Expression: '#w',
    });
    expect(params.values2 as number).toBeCloseTo(Math.PI / 6, 10);
    expect(params.values2Expression).toBeUndefined();
  });

  it('S7 角度字段内联创建请求单位 deg（宿主映射 angle，避免量纲门拒收）', async () => {
    const onCreateVariable = vi.fn();
    const { user } = await chamferWithEdge({ variables: [], onCreateVariable });
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'distanceAngle');
    const angle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    await user.click(angle);
    await user.clear(angle);
    await user.type(angle, '#newang');
    await user.keyboard('{Enter}');
    expect(onCreateVariable).toHaveBeenCalledWith(expect.objectContaining({
      name: 'newang',
      unit: 'deg',
    }));
  });

  it('S7 变量类型门：angle 变量在距离字段拒收；length 变量在角度字段拒收', async () => {
    const { user } = await chamferWithEdge({
      variables: [CHAMFER_W_VARIABLE, CHAMFER_ANGLE_VARIABLE],
    });
    const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    await user.clear(distance);
    await user.type(distance, '#ang');
    const distanceError = await screen.findByTestId('expression-field-error');
    expect(distanceError.textContent).toContain('变量 #ang 的类型 angle');
    expect(distanceError.textContent).toContain('length/number/any');
    expect(distanceError.textContent).toContain('倒角距离字段');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);

    await user.clear(distance);
    await user.type(distance, '2');
    await user.tab();
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'distanceAngle');
    const angle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    await user.clear(angle);
    await user.type(angle, '#w');
    const angleError = await screen.findByTestId('expression-field-error');
    expect(angleError.textContent).toContain('变量 #w 的类型 length');
    expect(angleError.textContent).toContain('angle/number/any');
    expect(angleError.textContent).toContain('倒角角度字段');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('S7 编辑态回显推断：相等双表达式→等距离；不同→两个距离；mode 3→距离和角度；单侧表达式→两个距离', async () => {
    const user = userEvent.setup();
    const baseProps = {
      featureType: 'chamfer' as const,
      featureName: '倒角',
      mode: 'edit' as const,
      featureId: 'f-chamfer',
      variables: [CHAMFER_W_VARIABLE, CHAMFER_H_VARIABLE, CHAMFER_ANGLE_VARIABLE],
    };
    const equal = renderFilletDialog(makeApplyOp(), {
      ...baseProps,
      initialParams: {
        mode: 2, propagateSmooth: true, edges: [EDGE_1], values1: 10, values2: 10,
        values1Expression: '#w', values2Expression: '#w',
      },
    });
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).value)
      .toBe('equal');
    const equalInput = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
    expect(equalInput.value).toBe('10');
    await user.click(equalInput);
    expect(equalInput.value).toBe('#w');
    equal.unmount();

    const two = renderFilletDialog(makeApplyOp(), {
      ...baseProps,
      initialParams: {
        mode: 2, propagateSmooth: true, edges: [EDGE_1], values1: 10, values2: 20,
        values1Expression: '#w', values2Expression: '#h',
      },
    });
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).value)
      .toBe('twoDistances');
    expect((screen.getByRole('textbox', { name: '距离 1' }) as HTMLInputElement).value).toBe('10');
    const twoDistance2 = screen.getByRole('textbox', { name: '距离 2' }) as HTMLInputElement;
    expect(twoDistance2.value).toBe('20');
    await user.click(twoDistance2);
    expect(twoDistance2.value).toBe('#h');
    two.unmount();

    const distanceAngle = renderFilletDialog(makeApplyOp(), {
      ...baseProps,
      initialParams: {
        mode: 3, propagateSmooth: true, edges: [EDGE_1], values1: 10, values2: Math.PI / 2,
        values1Expression: '#w', values2Expression: '#ang',
      },
    });
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).value)
      .toBe('distanceAngle');
    expect((screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement).value).toBe('10');
    const storedAngle = screen.getByRole('textbox', { name: '角度' }) as HTMLInputElement;
    expect(storedAngle.value).toBe('90');
    await user.click(storedAngle);
    expect(storedAngle.value).toBe('#ang');
    distanceAngle.unmount();

    const single = renderFilletDialog(makeApplyOp(), {
      ...baseProps,
      initialParams: {
        mode: 2, propagateSmooth: true, edges: [EDGE_1], values1: 10, values2: 20,
        values1Expression: '#w',
      },
    });
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).value)
      .toBe('twoDistances');
    const singleDistance2 = screen.getByRole('textbox', { name: '距离 2' }) as HTMLInputElement;
    expect(singleDistance2.value).toBe('20');
    await user.click(singleDistance2);
    expect(singleDistance2.value).toBe('20'); // 单侧表达式：另一字段保持数值
    single.unmount();
  });

  // ── W42 S11：存量倒角未支持模式（0/1/4/未知）诚实只读守卫 ────────────────
  // 本产品 UI 只创建 mode 2/3；导入/旧库行可能是 mode 0（Ranges）/1（Length）/
  // 4（AngleDistance，values1=角度、values2=距离）或未知 mode。旧回显把 mode 4
  // 重读为 mode 3（距离/角度互换）——S11 改为诚实只读：横幅 + 字段/✓ 禁用 +
  // 取消可关闭，绝不重映射后提交/预览。
  it('S11 mode 4（角度和距离）：横幅 + 字段/✓ 禁用 + 零载荷零预览；取消可关闭', async () => {
    const user = userEvent.setup();
    const previewOp = vi.fn(async (_op: FeatureOp): Promise<PreviewResult> => ({ ok: true, affected: [] }));
    const onCancel = vi.fn();
    const applyOp = makeApplyOp();
    renderFilletDialog(applyOp, {
      featureType: 'chamfer',
      featureName: '倒角 1',
      mode: 'edit',
      featureId: 'f-chamfer',
      previewOp,
      onCancel,
      initialParams: {
        mode: 4,
        propagateSmooth: true,
        edges: [EDGE_1],
        values1: Math.PI / 4,
        values2: 2,
      },
    });
    const banner = screen.getByTestId('part-studio-feature-dialog-chamfer-mode-unsupported-hint');
    expect(banner.textContent).toContain('角度和距离');
    expect(banner.textContent).toContain('暂不支持编辑');
    // 类型下拉不把 mode 4 伪装成「距离和角度」——只读展示落库模式名。
    const type = screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement;
    expect(type.disabled).toBe(true);
    expect(type.options[type.selectedIndex]!.textContent).toBe('角度和距离');
    // 值按落库原文只读展示（不做弧度→度/语义互换），数组/标量安全。
    const stored1 = screen.getByRole('textbox', { name: '存储值 1' }) as HTMLInputElement;
    expect(stored1.disabled).toBe(true);
    expect(stored1.value).toBe(String(Math.PI / 4));
    const stored2 = screen.getByRole('textbox', { name: '存储值 2' }) as HTMLInputElement;
    expect(stored2.disabled).toBe(true);
    expect(stored2.value).toBe('2');
    // 边拾取/切向延伸也只读。
    expect((screen.getByTestId('part-studio-feature-dialog-add-edge') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: '切向延伸' }) as HTMLInputElement).disabled).toBe(true);
    // ✓ 禁用：点击零 op / 零 onConfirm；预览同样不发（不重映射成 mode 3）。
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    expect(applyOp).not.toHaveBeenCalled();
    expect(previewOp).not.toHaveBeenCalled();
    // 取消是唯一出口。
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('S11 mode 1（长度）/0（范围）：横幅含模式名；数组 values 只读拼接安全；✓ 禁用零 op', async () => {
    for (const [mode, label] of [[1, '长度'], [0, '范围']] as const) {
      const user = userEvent.setup();
      const applyOp = makeApplyOp();
      const rendered = renderFilletDialog(applyOp, {
        featureType: 'chamfer',
        featureName: '倒角 1',
        mode: 'edit',
        featureId: 'f-chamfer',
        initialParams: { mode, propagateSmooth: true, edges: [EDGE_1], values1: [1, 2] },
      });
      expect(screen.getByTestId('part-studio-feature-dialog-chamfer-mode-unsupported-hint').textContent)
        .toContain(label);
      const stored1 = screen.getByRole('textbox', { name: '存储值 1' }) as HTMLInputElement;
      expect(stored1.disabled).toBe(true);
      expect(stored1.value).toBe('1, 2'); // 逐边数组安全只读展示（不崩、不伪造默认值）
      expect(screen.queryByRole('textbox', { name: '存储值 2' })).toBeNull();
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
      await user.click(screen.getByRole('button', { name: '确认' }));
      expect(applyOp).not.toHaveBeenCalled();
      rendered.unmount();
    }
  });

  it('S11 未知 mode（5）：横幅与只读类型显示数字 + ✓ 禁用', () => {
    renderFilletDialog(makeApplyOp(), {
      featureType: 'chamfer',
      featureName: '倒角 1',
      mode: 'edit',
      featureId: 'f-chamfer',
      initialParams: { mode: 5, propagateSmooth: true, edges: [EDGE_1], values1: 3 },
    });
    expect(screen.getByTestId('part-studio-feature-dialog-chamfer-mode-unsupported-hint').textContent)
      .toContain('5');
    const type = screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement;
    expect(type.disabled).toBe(true);
    expect(type.options[type.selectedIndex]!.textContent).toBe('5');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('S11 可见提示：横幅文本在模式 4/1/0 编辑时可见并紧贴倒角类型行；mode 2/3 不渲染', () => {
    const cases: Array<{ mode: number; label: string; values2?: number }> = [
      { mode: 4, label: '角度和距离', values2: 2 },
      { mode: 1, label: '长度' },
      { mode: 0, label: '范围' },
    ];
    for (const { mode, label, values2 } of cases) {
      const rendered = renderFilletDialog(makeApplyOp(), {
        featureType: 'chamfer',
        featureName: '倒角 1',
        mode: 'edit',
        featureId: 'f-chamfer',
        initialParams: {
          mode,
          propagateSmooth: true,
          edges: [EDGE_1],
          values1: 2,
          ...(values2 !== undefined ? { values2 } : {}),
        },
      });
      const note = screen.getByTestId('part-studio-feature-dialog-chamfer-mode-unsupported-hint');
      expect(note.getAttribute('role')).toBe('note');
      // 可见文本（非仅 title）：完整本地化句子 + 模式名。
      expect(note.textContent).toBe(`此倒角模式（${label}）暂不支持编辑；可取消后重新创建。`);
      // 紧贴倒角类型行：DOM 位置在类型 section 之前（CSS order 将其渲染在类型行上方）。
      const typeSection = (screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement)
        .closest('section')!;
      expect(
        note.compareDocumentPosition(typeSection) & Node.DOCUMENT_POSITION_FOLLOWING,
        'visible note should precede the chamfer type row',
      ).toBeTruthy();
      rendered.unmount();
    }
    for (const mode of [2, 3] as const) {
      const rendered = renderFilletDialog(makeApplyOp(), {
        featureType: 'chamfer',
        featureName: '倒角 1',
        mode: 'edit',
        featureId: 'f-chamfer',
        initialParams: {
          mode,
          propagateSmooth: true,
          edges: [EDGE_1],
          values1: 2,
          values2: mode === 3 ? Math.PI / 4 : 2,
        },
      });
      expect(screen.queryByTestId('part-studio-feature-dialog-chamfer-mode-unsupported-hint')).toBeNull();
      rendered.unmount();
    }
  });

  it('S11 回归：mode 2/3 编辑无横幅、字段/类型/✓ 可用（既有语义与载荷不变）', () => {
    const cases = [
      { params: { mode: 2, propagateSmooth: true, edges: [EDGE_1], values1: 2, values2: 2 }, variant: 'equal' },
      {
        params: { mode: 3, propagateSmooth: true, edges: [EDGE_1], values1: 2, values2: Math.PI / 4 },
        variant: 'distanceAngle',
      },
    ] as const;
    for (const { params, variant } of cases) {
      const rendered = renderFilletDialog(makeApplyOp(), {
        featureType: 'chamfer',
        featureName: '倒角 1',
        mode: 'edit',
        featureId: 'f-chamfer',
        initialParams: params as unknown as Record<string, unknown>,
      });
      expect(screen.queryByTestId('part-studio-feature-dialog-chamfer-mode-unsupported-hint')).toBeNull();
      const type = screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement;
      expect(type.disabled).toBe(false);
      expect(type.value).toBe(variant);
      const distance = screen.getByRole('textbox', { name: '距离' }) as HTMLInputElement;
      expect(distance.disabled).toBe(false);
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
      rendered.unmount();
    }
  });

  it('chips 去重（边自身 id 单键）：同 id 重拾（布尔分裂片同 id 多持）→ 仍 1 chip', async () => {
    const user = userEvent.setup();
    renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    pickEdge({ edge: { nodeId: 1, entityId: 2 } }); // 分裂片 op31 回同一自身 id=同键
    await screen.findByText('边 1');
    expect(screen.queryByText('边 2')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('chip ×移除：删「边 1」→ 余下重排「边 2」→「边 1」；清空回禁提交', async () => {
    const user = userEvent.setup();
    renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    pickEdge(EDGE_2);
    await screen.findByText('边 2');
    pickMocks.captured?.onEnded?.(); // 结束拾取（×移除在非拾取态亦可，拾取态禁提交不禁改）
    await waitFor(() => expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: '移除 边 1' }));
    expect(screen.getByText('边 1')).toBeDefined(); // 原「边 2」重排为「边 1」
    expect(screen.queryByText('边 2')).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '移除 边 1' }));
    expect(screen.getByTestId('part-studio-feature-dialog-no-edges-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('拾取态：aria-pressed + 拾取提示 +「结束拾取」钮 + ✓ 禁用；点钮 → suspend 回「添加边」且不销毁工具', async () => {
    const user = userEvent.setup();
    renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    expect(pickMocks.captured?.connectionKey).toBe('model-key');
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('part-studio-feature-dialog-picking-hint')).toBeDefined();
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').textContent).toBe('结束拾取');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    // 再点钮 = 主动结束拾取：工具挂起，已选边高亮保留到对话框关闭。
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    expect(pickMocks.suspendPicking).toHaveBeenCalledTimes(1);
    expect(pickMocks.exitTool).not.toHaveBeenCalled();
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').getAttribute('aria-label')).toBe('添加边');

    // 再次添加边 = 恢复既有工具，不重新创建拾取会话（保留高亮/缓存）。
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    expect(pickMocks.resumePicking).toHaveBeenCalledTimes(1);
    expect(pickMocks.startFilletEdgePick).toHaveBeenCalledTimes(1);
  });

  it('拾取态 Escape 分叉：只结束拾取回对话框（onCancel 不调、suspend 调、工具不销毁）', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <FeatureDialog
        featureName="圆角"
        mode="new"
        featureType="fillet"
        applyOp={makeApplyOp()}
        connectionKey="model-key"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(pickMocks.suspendPicking).toHaveBeenCalledTimes(1);
    expect(pickMocks.exitTool).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled(); // 对话框不关——拾取分叉优先
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').getAttribute('aria-label')).toBe('添加边');
  });

  it('非拾取态 Escape 不变：仍 onCancel（M5-T1 语义保持）', () => {
    const onCancel = vi.fn();
    render(
      <FeatureDialog
        featureName="圆角"
        mode="new"
        featureType="fillet"
        applyOp={makeApplyOp()}
        connectionKey="model-key"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(pickMocks.startFilletEdgePick).not.toHaveBeenCalled();
  });

  it('卸载守卫：拾取中对话框卸载（提交成功关闭等）→ exitTool 兜底不留孤儿会话', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <FeatureDialog
        featureName="圆角"
        mode="new"
        featureType="fillet"
        applyOp={makeApplyOp()}
        connectionKey="model-key"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    unmount();
    expect(pickMocks.exitTool).toHaveBeenCalledTimes(1);
  });

  it('工具 onEnded 回调（右键自然退出）→ 回「添加边」态，chips 保留', async () => {
    const user = userEvent.setup();
    renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_1);
    await screen.findByText('边 1');
    pickMocks.captured?.onEnded?.(); // 工具右键退出 → onEnded → stopPick
    await waitFor(() => expect(screen.getByTestId('part-studio-feature-dialog-add-edge').getAttribute('aria-label')).toBe('添加边'));
    expect(screen.getByText('边 1')).toBeDefined(); // chips 不随拾取会话结束丢失
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('工具 onError 回报 → toast（notifications 标准通道），chips 不增行', async () => {
    const user = userEvent.setup();
    renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickMocks.captured?.onError?.('多面交界边（非流形，邻接面数 3），圆角不支持');
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
    expect((mocks.outputMessage.mock.calls[0]![0] as { briefMessage: string }).briefMessage).toContain('多面交界边（非流形，邻接面数 3），圆角不支持');
    expect(screen.queryByText('边 1')).toBeNull();
  });

  it('无 body 诚实降级：hasBodies=false → 拾取钮不出 + 先建实体提示 + 禁提交（空边集提示让位不双报）', () => {
    renderFilletDialog(makeApplyOp(), { hasBodies: false });
    expect(screen.getByTestId('part-studio-feature-dialog-no-body-hint').textContent).toContain('库中无实体');
    expect(screen.queryByTestId('part-studio-feature-dialog-add-edge')).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-no-edges-hint')).toBeNull(); // 同一禁提交因，不双报
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('无连接诚实降级：connectionKey 缺省 → 拾取钮不出 + 不可拾提示（不发工具）', async () => {
    render(
      <FeatureDialog
        featureName="圆角"
        mode="new"
        featureType="fillet"
        applyOp={makeApplyOp()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('part-studio-feature-dialog-edge-unpickable').textContent).toContain('建模服务未连接');
    expect(screen.queryByTestId('part-studio-feature-dialog-add-edge')).toBeNull();
    expect(pickMocks.startFilletEdgePick).not.toHaveBeenCalled();
  });
});

// ── B3 禁用钮视觉钉（2026-10-26 全流程演示缺陷）────────────────────────────
// 根因：本面板是原生 <button>（非 iTwinUI Button），自定义 CSS 钉住了 enabled
// 外观（成品=accent 蓝底/✓=绿）却无 :disabled 规则，禁用后原样呈现 + hover
// 反馈仍在——「看起来可点实际点不动」。修复=纯 CSS 层（:disabled 规则 + hover
// 门到 :enabled），无 DOM/类/属性增量，jsdom 断不了——样式层钉子按仓内既有
// CSS 文本断言先例（styles/test/onshape-skin.test.ts 的 ruleBlock）落在文本层。

const featureDialogCss = readFileSync(resolve(__dirname, '../dialogs/FeatureDialog.css'), 'utf8');

/** 取选择器所属规则体（单层大括号；本仓 CSS 无嵌套——同 onshape-skin.test）。
 * 入参=未转义选择器（helper 内做一次正则转义，勿预转义）。 */
function cssRuleBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, String.fromCharCode(92) + '$&');
  const match = featureDialogCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1] ?? '';
}

/** 取选择器规则体里的 flex order 值（jsdom 不计算 order，样式层按文本钉）。 */
function cssOrder(selector: string): number {
  const block = cssRuleBlock(selector);
  const match = block.match(/order:\s*(-?\d+)/);
  expect(match, `order not found in ${selector}`).not.toBeNull();
  return Number(match![1]);
}

describe('B3 禁用钮视觉（成品/✓ 禁用态不再「蓝底高亮可点」）', () => {
  it('成品（__finish）禁用 → 落库 disabled 底/字色令牌（非 accent 蓝）+ not-allowed 指针', () => {
    const block = cssRuleBlock('.part-studio-feature-dialog__finish:disabled');
    expect(block).toContain('var(--iui-color-background-disabled');
    expect(block).toContain('var(--iui-color-text-disabled');
    expect(block).toContain('cursor: not-allowed');
    expect(block).not.toContain('--iui-color-text-accent');
  });

  it('✓（__confirm）禁用 → 同底色 + opacity 0.2 + not-allowed；enabled=实心绿 #009400；✗ 透明底红 X', () => {
    const block = cssRuleBlock('.part-studio-feature-dialog__confirm:disabled');
    expect(block).toContain('opacity: 0.2');
    expect(block).toContain('#009400');
    expect(block).toContain('cursor: not-allowed');
    // enabled 规则（Onshape live 2026-11-15 复核）=实心绿 #009400。
    const enabled = cssRuleBlock('.part-studio-feature-dialog__confirm');
    expect(enabled).toContain('#009400');
    // 2026-11-13 live 复核：✗ 为透明底 + sprite 红 X（不再是实心红方块）。
    expect(featureDialogCss).toMatch(/\.part-studio-feature-dialog__cancel\s*\{\s*background: transparent;/);
    expect(featureDialogCss).not.toContain('background: #ae3c3e;');
  });

  it('悬停反馈门到 enabled：__finish/__confirm 不再有会命中禁用态的裸 :hover 规则', () => {
    // :hover 对 disabled 元素仍匹配——禁用钮给悬停变色即「看起来可点」的另一半。
    expect(featureDialogCss).not.toContain('.part-studio-feature-dialog__finish:hover');
    expect(featureDialogCss).not.toContain('.part-studio-feature-dialog__confirm:hover');
    expect(featureDialogCss).toContain('.part-studio-feature-dialog__finish:enabled:hover');
    expect(featureDialogCss).toContain('.part-studio-feature-dialog__confirm:enabled:hover');
  });
});

// ---------------------------------------------------------------------------
// Onshape live 2026-11-15 行序（extrude）：query field → 终止条件 → 深度 →
// 方向 → 起始偏移 →（薄壁）→ 对称 → 拔模 → 第二个终止位置 → 合并范围。
// 平铺行若缺 order 会以 order:0 浮到 query field 之上——样式层钉子按 CSS
// 文本断言（jsdom 不计算 flex order，同 B3 禁用钮先例）。
// ---------------------------------------------------------------------------
describe('extrude 行序（Onshape live 2026-11-15）', () => {
  const EXTRUDE = ".part-studio-feature-dialog[data-feature='extrude'] ";

  it('十行 order 全显式且符合 live 顺序（query→终止→深度→方向→起始偏移→薄壁→对称→拔模→第二端→合并）', () => {
    const orders = [
      cssOrder(`${EXTRUDE}.part-studio-feature-dialog__entities`),
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-end-bound']`),
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-depth-row']`),
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-direction-group']`),
      // W14：起始偏移=折叠组（头部+缩进内容整体占位）。
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-start-offset-group']`),
      cssOrder(`${EXTRUDE}[data-field='thin-thickness']`),
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-symmetric-flat']`),
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-draft']`),
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-second-direction']`),
      cssOrder(`${EXTRUDE}[data-testid='part-studio-feature-dialog-merge-scope-group']`),
    ];
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // 非 extrude 特征不受行序规则影响（无 order 声明 → 视 CSS 级联；此处钉作用域）。
    expect(featureDialogCss).not.toContain(".part-studio-feature-dialog[data-feature='revolve'] [data-testid='part-studio-feature-dialog-merge-scope-group']");
  });
});

// ---------------------------------------------------------------------------
// 2026-11-16 W13（Onshape live 薄壁页签）：THIN 行序与实体页签不同——
// query field → 中间平面/厚度 1/厚度 2 → 给定深度 → 深度 → 起始偏移 →
// 对称 → 拔模 → 第二个终止位置 → 合并范围；「方向」组在 THIN 不渲染。
// 样式层钉 data-result-type='thinWall' 作用域 order（jsdom 不计算 flex order）。
// ---------------------------------------------------------------------------
describe('extrude 薄壁页签行序（Onshape live 2026-11-16 W13）', () => {
  const EXTRUDE_THIN = ".part-studio-feature-dialog[data-feature='extrude'][data-result-type='thinWall'] ";

  /** 备好草图通道的拉伸对话框（单面域回显即就绪），供页签切换断言。 */
  async function renderThinReadyDialog() {
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      entities: [] as SketchEntityDto[],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] } as SketchRegionDto],
    } as SketchDto);
    const user = userEvent.setup();
    render(
      <FeatureDialog
        featureName="Extrude 1"
        mode="new"
        featureType="extrude"
        applyOp={vi.fn(async (): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }))}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    await screen.findByText('草图 1 的面');
    return { user };
  }

  it('薄壁 order 全显式：query→薄壁→终止→深度→起始偏移→对称→拔模→第二端→合并→租约', () => {
    const orders = [
      cssOrder(`${EXTRUDE_THIN}.part-studio-feature-dialog__entities`),
      cssOrder(`${EXTRUDE_THIN}[data-field='thin-thickness']`),
      cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-end-bound']`),
      cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-depth-row']`),
      cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-start-offset-group']`),
      cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-symmetric-flat']`),
      cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-draft']`),
      cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-second-direction']`),
      cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-merge-scope-group']`),
      cssOrder(`${EXTRUDE_THIN}.part-studio-feature-dialog__body > .part-studio-feature-dialog__lease-warning`),
    ];
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // W14：起始偏移折叠组整体占 order 5，展开内容在组内缩进（竖引导线）。
    expect(cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-start-offset-group']`)).toBe(5);
    expect(cssRuleBlock('.part-studio-feature-dialog__group-body')).toContain('border-inline-start: 1px solid #d7d7d7');
    // 展开子行贴着各自行（拔模角/反向 7；第二端字段 8）。
    expect(cssOrder(`${EXTRUDE_THIN}[data-field='draft-angle']`)).toBe(7);
    expect(cssOrder(`${EXTRUDE_THIN}[data-testid='part-studio-feature-dialog-draft-reverse']`)).toBe(7);
    expect(cssOrder(`${EXTRUDE_THIN}[data-field='second-direction']`)).toBe(8);
  });

  it('薄壁组内行序按 DOM（中间平面→厚度 1→厚度 2→提示）：组内值行 order 归零并压过实体 order:3', () => {
    expect(cssOrder(`${EXTRUDE_THIN}.part-studio-feature-dialog__thin-wall > .part-studio-feature-dialog__distance`)).toBe(0);
  });

  it('THIN 页签不渲染「方向」组（实体页签仍渲染）；根节点 data-result-type 随页签切换', async () => {
    const { user } = await renderThinReadyDialog();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    expect(dialog.getAttribute('data-result-type')).toBe('solid');
    expect(screen.getByTestId('part-studio-feature-dialog-direction-group')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: '方向' })).toBeDefined();
    await user.click(screen.getByRole('tab', { name: '薄壁' }));
    expect(dialog.getAttribute('data-result-type')).toBe('thinWall');
    expect(screen.queryByTestId('part-studio-feature-dialog-direction-group')).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-direction-field')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '方向' })).toBeNull();
    // 切回实体 → 方向组恢复（仅显示层隐藏，不改状态）。
    await user.click(screen.getByRole('tab', { name: '实体' }));
    expect(dialog.getAttribute('data-result-type')).toBe('solid');
    expect(screen.getByTestId('part-studio-feature-dialog-direction-group')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2026-11-15 对话框审计切片（薄壁 / 第二端 / 旋转轴）样式钉。
// ---------------------------------------------------------------------------
describe('对齐切片样式（薄壁组 / 第二端深度行 / 旋转轴字段壳）', () => {
  it('旋转轴壳：白色 26px 边框字段（1px #d7d7d7 / 2px 圆角）+ 12px 标签 + 无边框 select', () => {
    const block = cssRuleBlock('.part-studio-feature-dialog__axis-field');
    expect(block).toContain('min-block-size: 26px');
    expect(block).toContain('border: 1px solid #d7d7d7');
    expect(block).toContain('border-radius: 2px');
    expect(block).toContain('background: #ffffff');
    // 标签 12px（该选择器有多条规则——取任一含 font-size 的规则体）。
    expect(featureDialogCss).toMatch(/\.part-studio-feature-dialog__query-label\s*\{[^}]*font-size: 12px/);
    const select = cssRuleBlock('.part-studio-feature-dialog__axis-field .part-studio-feature-dialog__select');
    expect(select).toContain('border: 0');
  });

  it('薄壁组单列（中间平面→厚度 1→厚度 2→提示）；第二端展开组=终止/拔模整行 + 深度值行 4 列', () => {
    const thin = cssRuleBlock('.part-studio-feature-dialog__thin-wall');
    expect(thin).toContain('flex-direction: column');
    // 该选择器先有 order:9 规则；取含 grid-template 的规则体。
    expect(featureDialogCss).toMatch(/\[data-field='second-direction'\]\s*\{[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto auto/);
    // 终止 select 与拔模 checkbox 同规则整行（逗号组取最后一条选择器可命中规则体）。
    expect(cssRuleBlock(".part-studio-feature-dialog[data-feature='extrude'] [data-field='second-direction'] > .part-studio-feature-dialog__checkbox"))
      .toContain('grid-column: 1 / -1');
    expect(featureDialogCss).toContain("[data-field='second-direction'] > .part-studio-feature-dialog__select,");
  });
});

// ---------------------------------------------------------------------------
// 审计 C2（2026-11-16）：通用特征对话框复选使用品牌蓝 accent（与拆分选项行一致）。
// ---------------------------------------------------------------------------
describe('C2 复选强调色（2026-11-16 审计）', () => {
  it('通用 __checkbox input[type=checkbox] 使用品牌蓝 #1651b0（不改禁用态）', () => {
    const block = cssRuleBlock(".part-studio-feature-dialog__checkbox input[type='checkbox']");
    expect(block).toContain('accent-color: #1651b0');
  });
});

// ---------------------------------------------------------------------------
// B6 M-A3.2a：extrude newBody + >1 authored body 的 target 选择
//  - extrude 「新建实体」复选：勾选才在 params 带 newBody:true（未勾省略）；
//  - N>1 active authored body → 目标实体下拉（默认首个；值进 op.targetBodyId，
//    不进 params）；newBody 时隐藏且不发 target；
//  - 单 body 无需 target（legacy 载荷逐字保持）；
//  - 仅 body-producing 特征显示 target；fillet 等依附型不显示；
//  - edit 模式从落库 params 回显 newBody（结构键，复选框禁用，结果载荷保留）。
// ---------------------------------------------------------------------------
describe('B6 M-A3.2a newBody + target body（getBodies 读面消费）', () => {
  const BODY_1: BodyInfo = { bodyKey: '0x15', name: 'Body 1', active: true, authored: true, sourceFeatureId: 'f1' };
  const BODY_2: BodyInfo = { bodyKey: '0x18', name: 'Body 2', active: true, authored: true, sourceFeatureId: 'f2' };
  const BODY_CONSUMED: BodyInfo = { bodyKey: '0x20', name: 'Body 3', active: false, authored: true };
  const ACTIVE_TWO: BodyInfo[] = [BODY_1, BODY_2];
  const WITH_CONSUMED: BodyInfo[] = [BODY_1, BODY_2, BODY_CONSUMED];

  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  function singleRegionSketch(): SketchDto {
    return {
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    };
  }

  /** 就绪的 extrude 提交对话框（单面域自动 [0]；回显 chip 落定即就绪）。 */
  async function renderReadyExtrude(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    featureRpc.getSketch.mockResolvedValue(singleRegionSketch());
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <FeatureDialog
        featureName="拉伸"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
        onConfirm={onConfirm}
        {...props}
      />,
    );
    await screen.findByTestId('part-studio-feature-dialog-profile-field');
    await screen.findByText('草图 1 的面');
    return { user, onConfirm };
  }

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('单 body（N≤1）：默认新建 → operation=new、无目标下拉、无 targetBodyId', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: [BODY_1] });
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '新建实体' })).toBeNull(); // 新建由作用域页签表达
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });
  });

  it('N>1 加入：目标实体下拉（consumed 不入选项）；值进 targetBodyId 且 mergeScope 同锚', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: WITH_CONSUMED });
    await user.click(screen.getByRole('tab', { name: '加入' }));
    const select = screen.getByRole('combobox', { name: '目标实体' }) as HTMLSelectElement;
    expect(select.value).toBe('0x15');
    expect(within(select).getByRole('option', { name: 'Body 1' })).toBeDefined();
    expect(within(select).getByRole('option', { name: 'Body 2' })).toBeDefined();
    expect(within(select).queryByRole('option', { name: 'Body 3' })).toBeNull();
    await user.selectOptions(select, '0x18');
    expect(screen.getByTestId('part-studio-feature-dialog-merge-scope-hint').textContent).toContain('Body 2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      targetBodyId: '0x18',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'add', mergeScope: [{ bodyKey: '0x18' }] },
    });
  });

  it('加入 → 目标下拉显示；新建 → 下拉隐藏（新体由本 op 创建）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: ACTIVE_TWO });
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull(); // 默认新建
    await user.click(screen.getByRole('tab', { name: '加入' }));
    expect(screen.getByRole('combobox', { name: '目标实体' })).toBeDefined();
    await user.click(screen.getByRole('tab', { name: '新建' }));
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
  });

  it('读面不可用 + 新建 → 仍可提交（new 无需 target；operation=new）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodiesError: 'init race' });
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
    });
    // 新建不依赖 body 读面 → 不呈现「读面不可用」阻断提示（不是隐藏错误，而是该门不适用）。
    expect(screen.queryByTestId('part-studio-feature-dialog-bodies-unavailable-hint')).toBeNull();
  });

  it('读面初次失败 + 加入 → 提交禁用 + 诚实提示（不发无 target 的 insert）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodiesError: 'init race' });
    await user.click(screen.getByRole('tab', { name: '加入' }));
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-bodies-unavailable-hint')).toBeDefined();
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('读面刷新中（bodiesLoading）→ 提交禁用 + 诚实提示（未知 N 不得发无 target 的 regular insert）', async () => {
    const applyOp = makeApplyOp();
    await renderReadyExtrude(applyOp, { bodies: ACTIVE_TWO, bodiesLoading: true });
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-bodies-loading-hint')).toBeDefined();
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('无拾取耦合的 insert 通道 N>1 显示手动目标；fillet/chamfer/shell 不显示手动目标', async () => {
    const applyOp = makeApplyOp();
    const user = userEvent.setup();
    const mirror = render(
      <FeatureDialog
        featureName="镜像"
        mode="new"
        featureType="mirror"
        applyOp={applyOp}
        bodies={ACTIVE_TWO}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: '目标实体' })).toBeDefined();
    // 非 extrude：无「新建实体」复选。
    expect(screen.queryByRole('checkbox', { name: '新建实体' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'mirror',
      targetBodyId: '0x15',
      params: { plane: 'XZ', keepOriginal: true },
    });
    mirror.unmount();

    // Critical 1：fillet 的 target 只能由拾取边父体自动推导——不渲染手动下拉。
    const filletMulti = render(
      <FeatureDialog
        featureName="圆角"
        mode="new"
        featureType="fillet"
        applyOp={applyOp}
        bodies={ACTIVE_TWO}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '新建实体' })).toBeNull();
    filletMulti.unmount();

    // chamfer：已接边拾取通道（Slice 1）——无手动下拉；空边集提示 + 禁提交。
    const chamferMulti = render(
      <FeatureDialog
        featureName="倒角"
        mode="new"
        featureType="chamfer"
        applyOp={applyOp}
        bodies={ACTIVE_TWO}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    expect(screen.getByTestId('part-studio-feature-dialog-no-edges-hint').textContent).toBe('选择要倒角的边');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    chamferMulti.unmount();

    // shell：owner 通道仍未接线 → 不显示手动下拉 + 禁提交提示。
    const shellGated = render(
      <FeatureDialog
        featureName="shell"
        mode="new"
        featureType="shell"
        applyOp={applyOp}
        bodies={ACTIVE_TWO}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    expect(screen.getByTestId('part-studio-feature-dialog-unowned-target-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    shellGated.unmount();
  });

  it('edit 模式：落库 params.newBody 回显为勾选且禁用（结构键不可翻转）；确认载荷保留 newBody', async () => {
    const onConfirm = vi.fn();
    render(
      <FeatureDialog
        featureName="拉伸 1"
        mode="edit"
        featureType="extrude"
        initialParams={{ profile: [], distance: 5, sketchId: 'sk-1', regions: [0], newBody: true }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: '新建实体' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ newBody: true }));
  });

  it('edit 模式无落库 newBody：复选框未勾选（不静默翻转/伪造）', () => {
    render(
      <FeatureDialog
        featureName="拉伸 1"
        mode="edit"
        featureType="extrude"
        initialParams={{ profile: [], distance: 5, sketchId: 'sk-1', regions: [0] }}
        onConfirm={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: '新建实体' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2026-11-15 live 审计切片：方向语义拆分 / 合并范围行组（仅 extrude add）
  // -------------------------------------------------------------------------
  it('终止行翻转钮：aria-pressed 切换 → params.direction=backward', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: [BODY_1] });
    const flip = screen.getByRole('button', { name: '反向' });
    expect(flip.getAttribute('aria-pressed')).toBe('false');
    await user.click(flip);
    expect(flip.getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0],
        operation: 'new', direction: 'backward',
      },
    });
  });

  it('方向复选禁用（不再是反向控件）+ 拉伸方向 query field 诚实禁用', async () => {
    const applyOp = makeApplyOp();
    await renderReadyExtrude(applyOp, { bodies: [BODY_1] });
    const checkbox = screen.getByRole('checkbox', { name: '方向' }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    const field = screen.getByTestId('part-studio-feature-dialog-direction-field');
    expect(field.getAttribute('aria-disabled')).toBe('true');
    expect(field.getAttribute('title')).toBe('该能力尚未实现');
    expect(field.textContent).toContain('拉伸方向');
  });

  it('合并范围：全部合并缺省未勾选 → 单 body chip + mergeScope；勾选 → 省略该键', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: [BODY_1] });
    await user.click(screen.getByRole('tab', { name: '加入' }));
    const mergeAll = screen.getByRole('checkbox', { name: '全部合并' }) as HTMLInputElement;
    expect(mergeAll.checked).toBe(false);
    const field = screen.getByTestId('part-studio-feature-dialog-merge-scope-field');
    expect(field.className).not.toContain('is-empty');
    expect(field.textContent).toContain('合并范围');
    expect(field.textContent).toContain('Body 1');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0],
        operation: 'add', mergeScope: [{ bodyKey: '0x15' }],
      },
    });
    // 勾选全部合并 → 字段隐藏 + 载荷省略 mergeScope（契约缺省=合并全部上游体）。
    await user.click(mergeAll);
    expect(screen.queryByTestId('part-studio-feature-dialog-merge-scope-field')).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'add',
      },
    });
  });

  it('多体未指定目标：合并范围字段留空 + 诚实提示，载荷不发 mergeScope', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: ACTIVE_TWO });
    await user.click(screen.getByRole('tab', { name: '加入' }));
    const field = screen.getByTestId('part-studio-feature-dialog-merge-scope-field');
    expect(field.className).toContain('is-empty');
    expect(field.textContent).toContain('合并范围');
    expect(field.textContent).not.toContain('Body');
    expect(screen.getByTestId('part-studio-feature-dialog-merge-scope-unresolved-hint').textContent)
      .toContain('未指定目标实体');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const op = applyOp.mock.calls.at(-1)![0] as unknown as { params: Record<string, unknown> };
    expect(op.params.operation).toBe('add');
    expect(op.params.mergeScope).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B6 M-A4.2a：body boolean（booleanBodies）对话框
//  - target 单选（active authored；consumed 不入选项）+ tools 多选（active
//    authored；目标行常态禁用，冲突态可解选）；载荷 {targets:[{bodyKey}],
//    tools:[{bodyKey}...], operation, keepTools}——op 层**不带 targetBodyId**
//    （M4.1 planBooleanInsert：params.targets 为目标唯一真源，重复给值须一致）；
//  - operation unite/subtract/intersect（T12 起后端/契约支持 intersect，UI 同步启用）；
//  - keepTools 缺省 false（消费提示）；true → I3 工具链锁提示（编辑工具体需先删布尔）；
//  - 门禁：<2 active authored body / bodiesLoading / 读面不可用 / tools 空 /
//    target 在 tools / canEdit / lease；失败就地 alert，成功 toast+onConfirm。
// ---------------------------------------------------------------------------
describe('B6 M-A4.2a body boolean（booleanBodies）对话框', () => {
  const BODY_1: BodyInfo = { bodyKey: '0x15', name: 'Body 1', active: true, authored: true, sourceFeatureId: 'f1' };
  const BODY_2: BodyInfo = { bodyKey: '0x18', name: 'Body 2', active: true, authored: true, sourceFeatureId: 'f2' };
  const BODY_3: BodyInfo = { bodyKey: '0x1b', name: 'Body 3', active: true, authored: true, sourceFeatureId: 'f3' };
  const BODY_CONSUMED: BodyInfo = { bodyKey: '0x20', name: 'Consumed', active: false, authored: true };
  const THREE_BODIES = [BODY_1, BODY_2, BODY_3];

  function makeApplyOp() {
    return vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-new' }));
  }

  function renderBooleanDialog(
    applyOp: ReturnType<typeof makeApplyOp>,
    props: Partial<Parameters<typeof FeatureDialog>[0]> = {},
  ) {
    const onConfirm = vi.fn();
    const rendered = render(
      <FeatureDialog
        featureName="布尔运算"
        mode="new"
        featureType="booleanBodies"
        applyOp={applyOp}
        bodies={THREE_BODIES}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    return { onConfirm, unmount: () => rendered.unmount() };
  }

  const confirmButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;

  const booleanCreateOp = (call: unknown): Extract<FeatureOp, { kind: 'insertFeature' }> =>
    call as Extract<FeatureOp, { kind: 'insertFeature' }>;

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('字段与缺省：目标实体单选（consumed 不入选项/目标行禁用）、工具多选、运算缺省并集（相交可用）、保留工具缺省未勾+消费提示', () => {
    renderBooleanDialog(makeApplyOp(), { bodies: [...THREE_BODIES, BODY_CONSUMED] });
    const target = screen.getByRole('combobox', { name: '目标实体' }) as HTMLSelectElement;
    expect(target.value).toBe('0x15');
    expect(within(target).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Body 1', 'Body 2', 'Body 3',
    ]);
    // 目标行常态禁用（不可选为目标工具）；其余可勾选。
    expect((screen.getByRole('checkbox', { name: 'Body 1' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Body 2' }) as HTMLInputElement).disabled).toBe(false);
    // 工具列表不渲染 consumed body。
    expect(screen.queryByRole('checkbox', { name: 'Consumed' })).toBeNull();
    expect((screen.getByRole('tab', { name: '并集' }) as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    // T12（2026-11-07）：后端/契约支持 intersect，UI 同步启用（不再禁用/降级）。
    expect((screen.getByRole('tab', { name: '相交' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('part-studio-feature-dialog-boolean-intersect-hint')).toBeNull();
    // 2026-11-15 live：工具字段 = 12px「工具」标签字段框；操作唯一权威是顶部
    // 页签——旧重复「运算」下拉已删除（单选 tablist，无 operation combobox）。
    expect(screen.getByRole('group', { name: '工具' })).toBeDefined();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: '运算' })).toBeNull();
    const keepTools = screen.getByRole('checkbox', { name: '保留工具' }) as HTMLInputElement;
    expect(keepTools.checked).toBe(false);
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-consume-hint').textContent).toContain('消费');
    expect(screen.queryByTestId('part-studio-feature-dialog-boolean-tool-lock-hint')).toBeNull();
    // 初始无工具 → 禁提交 + 空选提示。
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-tools-missing-hint')).toBeDefined();
    // 仅本通道的布尔控件在场：不渲染通用手动目标下拉/通用 chips（同一 aria 名不歧义）。
    expect(screen.getAllByRole('combobox', { name: '目标实体' })).toHaveLength(1);
  });

  it('选工具后触发 previewOp insertFeature booleanBodies（2026-11-08）', async () => {
    const previewOp = vi.fn(async (_op: FeatureOp) => ({ ok: true, affected: [] }));
    renderBooleanDialog(makeApplyOp(), { previewOp });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Body 2' }));
    fireEvent.click(screen.getByRole('tab', { name: '相交' }));
    await waitFor(() => expect(previewOp).toHaveBeenCalled(), { timeout: 3000 });
    expect(previewOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'booleanBodies',
      params: {
        targets: [{ bodyKey: '0x15' }],
        tools: [{ bodyKey: '0x18' }],
        operation: 'intersect',
        keepTools: false,
      },
    });
  });

  it('Onshape 运算页签：并集缺省、差集/相交可选（T12 起全部提交后端）', async () => {
    const applyOp = makeApplyOp();
    renderBooleanDialog(applyOp);
    const user = userEvent.setup();
    // 体布尔固定实体结果，只渲染运算页签（并集/差集/相交）。
    expect(screen.queryByRole('tablist', { name: '结果类型' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: '布尔作用域' })).toBeNull();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.queryByRole('combobox', { name: '运算' })).toBeNull();
    expect((screen.getByRole('tab', { name: '并集' }) as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    const intersect = screen.getByRole('tab', { name: '相交' }) as HTMLButtonElement;
    expect(intersect.disabled).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: 'Body 2' }));
    await user.click(intersect);
    expect(intersect.getAttribute('aria-selected')).toBe('true');
    await user.click(confirmButton());
    expect(booleanCreateOp(applyOp.mock.calls[0]![0]).params).toMatchObject({
      operation: 'intersect',
      tools: [{ bodyKey: '0x18' }],
    });
  });

  it('载荷：targets/tools/operation/keepTools 精确形状；不发 op 层 targetBodyId（params.targets 唯一真源）；成功 toast+onConfirm', async () => {
    const applyOp = makeApplyOp();
    const { onConfirm } = renderBooleanDialog(applyOp);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: '目标实体' }), '0x1b');
    await user.click(screen.getByRole('checkbox', { name: 'Body 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Body 2' }));
    expect(confirmButton().disabled).toBe(false);
    await user.click(confirmButton());
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(booleanCreateOp(applyOp.mock.calls[0]![0])).toEqual({
      kind: 'insertFeature',
      featureType: 'booleanBodies',
      params: {
        targets: [{ bodyKey: '0x1b' }],
        tools: [{ bodyKey: '0x15' }, { bodyKey: '0x18' }],
        operation: 'unite',
        keepTools: false,
      },
    });
    // op 层无 targetBodyId 键（目标只经 params.targets 表达）。
    expect('targetBodyId' in (applyOp.mock.calls[0]![0] as object)).toBe(false);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1); // 成功 toast（不静默）
  });

  it('tools ≥1 且无重复：反复点选同一行不产生重复项；清空后禁提交', async () => {
    const applyOp = makeApplyOp();
    renderBooleanDialog(applyOp);
    const user = userEvent.setup();
    const body2 = screen.getByRole('checkbox', { name: 'Body 2' });
    await user.click(body2);
    await user.click(body2); // 取消
    expect(confirmButton().disabled).toBe(true);
    await user.click(body2); // 选中
    await user.click(body2); // 取消
    await user.click(body2); // 再次选中
    await user.click(confirmButton());
    const op = booleanCreateOp(applyOp.mock.calls[0]![0]);
    expect((op.params as { tools: unknown[] }).tools).toEqual([{ bodyKey: '0x18' }]);
  });

  it('互斥：目标改为已选工具 → 字段级错误 + 禁提交；改回目标即恢复（冲突行可解选）', async () => {
    renderBooleanDialog(makeApplyOp());
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Body 2' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '目标实体' }), '0x18');
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-target-in-tools').textContent).toContain('不能同时');
    expect(confirmButton().disabled).toBe(true);
    // 冲突态的目标行保持可点（否则无法解选）——取消后错误消失、可提交。
    const conflictRow = screen.getByRole('checkbox', { name: 'Body 2' }) as HTMLInputElement;
    expect(conflictRow.checked).toBe(true);
    expect(conflictRow.disabled).toBe(false);
    await user.selectOptions(screen.getByRole('combobox', { name: '目标实体' }), '0x15');
    expect(screen.queryByTestId('part-studio-feature-dialog-boolean-target-in-tools')).toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });

  it('operation=subtract / keepTools=true 进载荷；keepTools=true 呈现 I3 工具链锁提示（消费提示让位）', async () => {
    const applyOp = makeApplyOp();
    renderBooleanDialog(applyOp);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Body 2' }));
    await user.click(screen.getByRole('tab', { name: '差集' }));
    await user.click(screen.getByRole('checkbox', { name: '保留工具' }));
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-tool-lock-hint').textContent).toContain('删除该布尔');
    expect(screen.queryByTestId('part-studio-feature-dialog-boolean-consume-hint')).toBeNull();
    await user.click(confirmButton());
    expect(booleanCreateOp(applyOp.mock.calls[0]![0])).toEqual({
      kind: 'insertFeature',
      featureType: 'booleanBodies',
      params: {
        targets: [{ bodyKey: '0x15' }],
        tools: [{ bodyKey: '0x18' }],
        operation: 'subtract',
        keepTools: true,
      },
    });
  });

  it('<2 active authored body（consumed 不计）→ 至少两体提示 + 禁提交（不渲染字段、不发 op）', () => {
    const applyOp = makeApplyOp();
    renderBooleanDialog(applyOp, { bodies: [BODY_1, BODY_CONSUMED] });
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-needs-two-hint').textContent).toContain('至少两个活动实体');
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    expect(confirmButton().disabled).toBe(true);
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('bodiesLoading → 既有读取中提示 + 禁提交（N 未定不发放行）', () => {
    const applyOp = makeApplyOp();
    renderBooleanDialog(applyOp, { bodiesLoading: true });
    expect(screen.getByTestId('part-studio-feature-dialog-bodies-loading-hint')).toBeDefined();
    expect(confirmButton().disabled).toBe(true);
  });

  it('bodiesLoading 且旧读面 <2 → 只报读取中，不误报「至少两体」（N 未定）', () => {
    renderBooleanDialog(makeApplyOp(), { bodies: [BODY_1], bodiesLoading: true });
    expect(screen.getByTestId('part-studio-feature-dialog-bodies-loading-hint')).toBeDefined();
    expect(screen.queryByTestId('part-studio-feature-dialog-boolean-needs-two-hint')).toBeNull();
    expect(confirmButton().disabled).toBe(true);
  });

  it('读面不可用（bodies undefined）→ 通道不可用提示（含错误原文）+ 禁提交（不发 op）', () => {
    const applyOp = makeApplyOp();
    renderBooleanDialog(applyOp, { bodies: undefined, bodiesError: 'init race' });
    const hint = screen.getByTestId('part-studio-feature-dialog-boolean-bodies-unavailable');
    expect(hint.textContent).toContain('实体列表不可用');
    expect(hint.textContent).toContain('init race');
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    expect(confirmButton().disabled).toBe(true);
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('canEdit=false → 确认禁用 + 只读提示（租约警示不谎报）；leaseOk=false（可编辑）→ 可视租约警示', () => {
    const readOnly = renderBooleanDialog(makeApplyOp(), { canEdit: false });
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-readonly-hint')).toBeDefined();
    expect(screen.queryByTestId('part-studio-feature-dialog-lease-warning')).toBeNull();
    readOnly.unmount();

    renderBooleanDialog(makeApplyOp(), { leaseOk: false });
    expect(screen.getByTestId('part-studio-feature-dialog-lease-warning')).toBeDefined();
  });

  it('提交失败/拒收 → 就地 alert（不静默、对话框不关闭、不 onConfirm）', async () => {
    const applyOp = vi.fn(async (): Promise<FeatureOpResult> => ({ ok: false, error: '布尔求值失败' }));
    const { onConfirm } = renderBooleanDialog(applyOp);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Body 2' }));
    await user.click(confirmButton());
    expect(screen.getByTestId('part-studio-feature-dialog-error').textContent).toContain('布尔求值失败');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('part-studio-feature-dialog')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ADR-0017 Stage G1：extrude「成形到顶点」（草图点/线端点/弧端点/圆心）。
// ---------------------------------------------------------------------------
describe('成形到顶点（Stage G1）', () => {
  const VERTEX_SKETCH = {
    id: 'sk-1',
    plane: { origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, xDir: { x: 1, y: 0, z: 0 } },
    entities: [
      { kind: 'point', id: 1, x: 5, y: 5 },
      { kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } },
      { kind: 'circle', id: 12, center: { x: 2, y: 2 }, radius: 1 },
      { kind: 'arc', id: 13, center: { x: 0, y: 0 }, radius: 2, startAngle: 0, sweepAngle: Math.PI / 2 },
    ],
    constraints: [],
    regions: [{ area: 10, outerEntityIds: [11] }],
  } as unknown as SketchDto;

  it('候选生成：point 1 + line 2 端点 + circle 圆心 + arc 圆心/起终点；编码可往返', () => {
    const options = vertexCandidatesFromSketch('sk-1', '草图 1', VERTEX_SKETCH.entities,
      (id, kind, part) => `${kind}:${id}:${part}`);
    expect(options.map((option) => option.key)).toEqual([
      'sk-1|1|start',
      'sk-1|11|start',
      'sk-1|11|end',
      'sk-1|12|center',
      'sk-1|13|center',
      'sk-1|13|start',
      'sk-1|13|end',
    ]);
    for (const option of options) {
      expect(decodeVertexRef(option.key)).toEqual(option.ref);
    }
    expect(decodeVertexRef('sk-1|oops|start')).toBeUndefined();
    expect(decodeVertexRef('sk-1|1|sideways')).toBeUndefined();
    expect(encodeVertexRef({ sketchId: 'sk-1', entityId: 11, part: 'end' })).toBe('sk-1|11|end');
  });

  it('终止条件菜单顺序与 Onshape 一致；成形到零件诚实禁用', () => {
    renderDialog({ entities: [], featureType: 'extrude', mode: 'new', applyOp: vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })) });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    const select = within(dialog).getByRole('combobox', { name: '终止条件' }) as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option')).map((option) => ({
      value: option.value,
      disabled: option.disabled,
      text: option.textContent,
    }));
    expect(options.map((option) => option.value)).toEqual([
      'blind', 'upToNext', 'upToSurface', 'upToPart', 'upToVertex', 'throughAll',
    ]);
    expect(options.find((option) => option.value === 'upToPart')).toMatchObject({
      disabled: true,
      text: '成形到零件',
    });
  });

  it('选择目标顶点 → 载荷 endBound=upToVertex + endVertexRef；未选禁提交', async () => {
    featureRpc.getSketch.mockResolvedValue(VERTEX_SKETCH);
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f-v' }));
    render(
      <FeatureDialog
        featureName="拉伸 1"
        mode="new"
        featureType="extrude"
        applyOp={applyOp}
        sketches={[{ id: 'sk-1', label: '草图 1' }]}
        connectionKey="model-key"
      />,
    );
    const dialog = screen.getByRole('dialog', { name: '拉伸 1' });
    await screen.findByText('草图 1 的面');
    // 终止条件需要上游实体（new 作用域禁用）——切「加入」。
    await user.click(within(dialog).getByRole('tab', { name: '加入' }));
    const endBound = within(dialog).getByRole('combobox', { name: '终止条件' });
    await user.selectOptions(endBound, 'upToVertex');
    await expect(
      within(dialog).getByTestId('part-studio-feature-dialog-end-vertex'),
    ).toBeDefined();
    // 目标顶点未选：✓ 禁用（不猜）。
    expect((within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    const vertexSelect = within(dialog).getByRole('combobox', { name: '目标顶点' });
    await user.selectOptions(vertexSelect, 'sk-1|11|end');
    expect((within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(applyOp).toHaveBeenCalled());
    expect(applyOp.mock.calls.at(-1)![0]).toMatchObject({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: {
        endBound: 'upToVertex',
        endVertexRef: { sketchId: 'sk-1', entityId: 11, part: 'end' },
      },
    });
  });
});

describe('fillet 行序（ADR-0017 Stage E 追补）', () => {
  const makeApplyOp = () =>
    vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' }));

  /** DOM 顺序断言（compareDocumentPosition；CSS order 不改变 DOM 序）。 */
  function expectDomOrder(dialog: HTMLElement, selectors: string[]): void {
    const nodes = selectors.map((selector) => {
      const node = dialog.querySelector<HTMLElement>(selector);
      expect(node, `missing ${selector}`).not.toBeNull();
      return node!;
    });
    for (let index = 0; index < nodes.length - 1; index++) {
      expect(
        nodes[index]!.compareDocumentPosition(nodes[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${selectors[index]} should precede ${selectors[index + 1]}`,
      ).toBeTruthy();
    }
  }

  it('切向延伸位于测量之前；圆角类型页签=边/全圆角（后者禁用）', () => {
    renderDialog({
      featureType: 'fillet',
      mode: 'new',
      applyOp: makeApplyOp(),
      hasBodies: true,
    });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    const smooth = within(dialog).getByTestId('part-studio-feature-dialog-propagate-smooth');
    const measurement = dialog.querySelector('[data-field="measurement"]');
    expect(measurement).not.toBeNull();
    // compareDocumentPosition: FOLLOWING (4) means measurement comes after smooth.
    expect(smooth.compareDocumentPosition(measurement!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    const tabs = within(dialog).getByRole('tablist', { name: '圆角类型' });
    expect(within(tabs).getByRole('tab', { name: '边' }).getAttribute('aria-selected')).toBe('true');
    expect((within(tabs).getByRole('tab', { name: '全圆角' }) as HTMLButtonElement).disabled).toBe(true);
  });

  // Onshape live 2026-11-15 行序：边查询字段 → 切向延伸 → 测量 → 控制 → 半径
  // → 不对称 → 部分圆角 → 可变圆角 → 允许边溢出 → 平滑圆角。
  it('行序：边查询字段 → 切向延伸 → 测量 → 控制 → 半径 → 选项（DOM compareDocumentPosition）', () => {
    renderDialog({
      featureType: 'fillet',
      mode: 'new',
      applyOp: makeApplyOp(),
      hasBodies: true,
    });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    expectDomOrder(dialog, [
      '[data-field="edge-query"]',
      '[data-testid="part-studio-feature-dialog-propagate-smooth"]',
      '[data-field="measurement"]',
      '[data-field="control"]',
      '[data-field="radius"]',
      '[data-testid="part-studio-feature-dialog-asymmetric"]',
      '[data-testid="part-studio-feature-dialog-fillet-partial"]',
      '[data-testid="part-studio-feature-dialog-fillet-variable"]',
      '[data-testid="part-studio-feature-dialog-fillet-overflow"]',
      '[data-testid="part-studio-feature-dialog-fillet-smooth"]',
    ]);
  });

  // Onshape live 2026-11-15 行序（倒角）：边查询字段 → 测量 → 倒角类型 → 距离
  // → 切向延伸。
  it('倒角行序：边查询字段 → 测量 → 倒角类型 → 距离 → 切向延伸（DOM compareDocumentPosition）', () => {
    renderDialog({
      featureType: 'chamfer',
      mode: 'new',
      applyOp: makeApplyOp(),
      hasBodies: true,
    });
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    expectDomOrder(dialog, [
      '[data-field="edge-query"]',
      '[data-field="measurement"]',
      '[data-field="chamfer-type"]',
      '[data-field="radius"]',
      '[data-testid="part-studio-feature-dialog-propagate-smooth"]',
    ]);
  });

  it('测量/控制保持禁用并带未实现提示（title）；倒角类型仍可编辑', () => {
    const fillet = renderDialog({
      featureType: 'fillet',
      mode: 'new',
      applyOp: makeApplyOp(),
      hasBodies: true,
    });
    for (const name of ['测量', '控制']) {
      const select = screen.getByRole('combobox', { name }) as HTMLSelectElement;
      expect(select.disabled).toBe(true);
      expect(select.getAttribute('title')).toBe('该能力尚未实现');
    }
    fillet.unmount();

    renderDialog({
      featureType: 'chamfer',
      mode: 'new',
      applyOp: makeApplyOp(),
      hasBodies: true,
    });
    expect((screen.getByRole('combobox', { name: '测量' }) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: '倒角类型' }) as HTMLSelectElement).disabled).toBe(false);
  });

  it('半径/距离数值行 mm 单位可见；角度行无 mm；参数状态 ± 禁用且诚实 title', async () => {
    const user = userEvent.setup();
    const fillet = renderDialog({
      featureType: 'fillet',
      mode: 'new',
      applyOp: makeApplyOp(),
      hasBodies: true,
    });
    const radius = screen.getByRole('textbox', { name: '半径' });
    const radiusRow = radius.closest('section')!;
    expect(radiusRow.textContent).toContain('mm');
    const radiusState = within(radiusRow).getByTestId('part-studio-feature-dialog-radius-state') as HTMLButtonElement;
    expect(radiusState.disabled).toBe(true);
    expect(radiusState.getAttribute('title')).toBe('该能力尚未实现');
    expect(radiusState.textContent).toBe('±');
    fillet.unmount();

    renderDialog({
      featureType: 'chamfer',
      mode: 'new',
      applyOp: makeApplyOp(),
      hasBodies: true,
    });
    expect(screen.getByRole('textbox', { name: '距离' }).closest('section')!.textContent).toContain('mm');
    await user.selectOptions(screen.getByRole('combobox', { name: '倒角类型' }), 'distanceAngle');
    const angleRow = screen.getByRole('textbox', { name: '角度' }).closest('section')!;
    expect(angleRow.textContent).not.toContain('mm');
    expect(within(angleRow).getByTestId('part-studio-feature-dialog-chamfer-angle-state')).toBeDefined();
  });
});
