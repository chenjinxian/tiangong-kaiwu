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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    onEnded?: () => void;
  }
  return {
    captured: undefined as Captured | undefined,
    startFilletEdgePick: vi.fn(async (options: Captured) => {
      pickMocks.captured = options;
      return {
        exitTool: pickMocks.exitTool,
      };
    }),
    exitTool: vi.fn(async () => undefined),
  };
});

vi.mock('@luban-cad/shared', () => ({
  LUBAN_INIT_TXN_DESCRIPTION: 'partstudio init',
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

vi.mock('../tools/modeling/FilletEdgePickTool.js', () => ({
  startFilletEdgePick: pickMocks.startFilletEdgePick,
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

import type { BodyInfo, FeatureOp, FeatureOpResult, SketchDto, SketchEntityDto, SketchRegionDto } from '@luban-cad/shared';
import type { CanvasSelection } from '../index.js';
import { usePartStudioStore } from '../index.js';
import type { FeatureDialogEntity, FeatureDialogResult } from '../dialogs/FeatureDialog.js';
import { classifyAxisLines, FeatureDialog } from '../dialogs/FeatureDialog.js';

/** store 复位：canvas/viewOnly 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [], selectionMode: 'body' },
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
    await user.click(screen.getByRole('button', { name: '成品' }));
    const payload = onConfirm.mock.calls[0]![0] as FeatureDialogResult;
    expect(payload.resultType).toBe('thinWall');
    expect(payload.booleanScope).toBe('remove');
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

describe('折叠段（方向/起始偏移/对称/拔模）', () => {
  it('方向默认展开、其余折叠（aria-expanded 语义）', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    expect(within(dialog).getByRole('button', { name: '方向' }).getAttribute('aria-expanded')).toBe('true');
    for (const name of ['起始偏移', '对称', '拔模']) {
      expect(within(dialog).getByRole('button', { name }).getAttribute('aria-expanded')).toBe('false');
    }
    // 展开才见内容：方向 select 在场；拔模输入不在场。
    expect(within(dialog).getByRole('combobox', { name: '方向' })).toBeDefined();
    expect(within(dialog).queryByRole('textbox', { name: '拔模' })).toBeNull();
  });

  it('开合折叠段：拔模展开 → 输入值进确认载荷', async () => {
    const { onConfirm } = renderDialog({ entities: [] });
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    await user.click(within(dialog).getByRole('button', { name: '拔模' }));
    expect(within(dialog).getByRole('button', { name: '拔模' }).getAttribute('aria-expanded')).toBe('true');
    await user.type(within(dialog).getByRole('textbox', { name: '拔模' }), '5');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect((onConfirm.mock.calls[0]![0] as FeatureDialogResult).draft).toBe('5');
  });

  it('方向下拉（正向/反向）+ 对称勾选 + 起始偏移 → 全进确认载荷', async () => {
    const { onConfirm } = renderDialog({ entities: [] });
    const user = userEvent.setup();
    const dialog = screen.getByRole('dialog', { name: 'Extrude 1' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '方向' }), 'backward');
    await user.click(within(dialog).getByRole('button', { name: '对称' }));
    await user.click(within(dialog).getByRole('checkbox', { name: '对称' }));
    await user.click(within(dialog).getByRole('button', { name: '起始偏移' }));
    await user.type(within(dialog).getByRole('textbox', { name: '起始偏移' }), '2');
    await user.click(screen.getByRole('button', { name: '确认' }));
    const payload = onConfirm.mock.calls[0]![0] as FeatureDialogResult;
    expect(payload.direction).toBe('backward');
    expect(payload.symmetric).toBe(true);
    expect(payload.startOffset).toBe('2');
  });
});

describe('底部（透明度滑杆 + 成品 + ?——M6-c T5 采集对齐 12-dialog-extrude-1.png）', () => {
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

  it('成品按钮=确认出口（同 ✓ 回传载荷）', async () => {
    const { onConfirm } = renderDialog({ entities: [] });
    await userEvent.setup().click(screen.getByRole('button', { name: '成品' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
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
    render(
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
    return { onConfirm, onCancel, applyOp };
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    // 就绪判据：回显 chip 在场（单面域无 ·面域 后缀；多面域带序号）。
    await screen.findByText(regions.length > 1 ? '草图 1 的面 · 面域 0' : '草图 1 的面');
    return { user, ...rendered };
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
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0] },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('距离输入进 op params（sketchId/regions 随行，距离为可编辑量）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyDialog(applyOp);
    const distance = screen.getByRole('textbox', { name: '距离' });
    expect((distance as HTMLInputElement).value).toBe('10');
    await user.clear(distance);
    await user.type(distance, '42.5');
    await user.click(screen.getByRole('button', { name: '成品' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 42.5, sketchId: 'sk-1', regions: [0] },
    });
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '成品' }));
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
    const distance = screen.getByRole('textbox', { name: '距离' });
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await user.click(screen.getByRole('button', { name: '成品' }));
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

  it('edit 模式（宿主已接提交面）→ ✓/成品 禁用 + 提示行「参数编辑即将推出」（M-1：消除假成功），不发起 op', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <FeatureDialog
        featureName="拉伸 1"
        mode="edit"
        featureType="extrude"
        applyOp={applyOp}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const hint = screen.getByTestId('part-studio-feature-dialog-edit-hint');
    expect(hint.textContent).toContain('参数编辑即将推出');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    // ✗ 取消仍可达（禁用态下唯一出口——关闭面板），且全程不发起 op/确认。
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(applyOp).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
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

  it('多面域：chips 多选在场（缺省 [0]=最大面域选中态）→ 点「面域 1」→ 载荷 regions [0,1]（M6-c T3 多选语义）', async () => {
    featureRpc.getSketch.mockResolvedValue(
      sketchDtoWith([
        { area: 0.5, outerEntityIds: [1, 2, 3, 4] },
        { area: 0.1, outerEntityIds: [5, 6] },
      ]),
    );
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
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
      />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    // 面域多选 chips 现于 regions>1；面积读数去尾零（0.5 → "0.5"），首项=最大
    // 且缺省选中（[0]=v1.6 regionIndex 缺省 0 的语义锚同源）。
    const chipsBox = await screen.findByTestId('part-studio-feature-dialog-region-chips');
    const chip0 = within(chipsBox).getByRole('button', { name: '面域 0（最大，面积 0.5）' });
    const chip1 = within(chipsBox).getByRole('button', { name: '面域 1（面积 0.1）' });
    expect(chip0.getAttribute('aria-pressed')).toBe('true');
    expect(chip1.getAttribute('aria-pressed')).toBe('false');
    // 单选下拉不在场（M6-c T3：extrude 面域下拉已升级为多选 chips）。
    expect(screen.queryByRole('combobox', { name: '面域' })).toBeNull();
    // 回显 chip 不带 ·面域 N 后缀（选中态由 chips 自身 aria-pressed 呈现）。
    expect(screen.getByText('草图 1 的面')).toBeDefined();
    // 点选「面域 1」→ 选中集 [0,1]（升序）→ 载荷 regions 数组直出。
    await user.click(chip1);
    expect(chip1.getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0, 1] },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText('草图 1 的面');
    expect(featureRpc.getSketch.mock.calls[0]).toHaveLength(2);
  });

  it('多面域钉形（[0,2] 两域）：三面域缺省 [0] → 点「面域 2」→ regions [0,2]；再点「面域 0」摘除 → regions [2]（点选切换）', async () => {
    featureRpc.getSketch.mockResolvedValue(
      sketchDtoWith([
        { area: 0.5, outerEntityIds: [1] },
        { area: 0.3, outerEntityIds: [2] },
        { area: 0.1, outerEntityIds: [3] },
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    const chipsBox = await screen.findByTestId('part-studio-feature-dialog-region-chips');
    const chip0 = within(chipsBox).getByRole('button', { name: '面域 0（最大，面积 0.5）' });
    const chip2 = within(chipsBox).getByRole('button', { name: '面域 2（面积 0.1）' });
    await user.click(chip2);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0, 2] },
    });
    // 再点已选 chip = 摘除（点选切换语义）；余集非空 → ✓ 保持可用。
    await user.click(chip0);
    expect(chip0.getAttribute('aria-pressed')).toBe('false');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [2] },
    });
  });

  it('全选/清空流：清空 → 空选提示 + ✓ 禁用不发起 op；全选 → 三域全选中载荷 regions [0,1,2]', async () => {
    featureRpc.getSketch.mockResolvedValue(
      sketchDtoWith([
        { area: 0.5, outerEntityIds: [1] },
        { area: 0.3, outerEntityIds: [2] },
        { area: 0.1, outerEntityIds: [3] },
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByTestId('part-studio-feature-dialog-region-chips');
    // 清空 → 空选门禁（M6-c T3）：「选择至少一个面域」+ ✓/成品 禁用，不发起 op。
    await user.click(screen.getByTestId('part-studio-feature-dialog-region-clear'));
    expect(screen.getByTestId('part-studio-feature-dialog-no-region-selected-hint').textContent).toBe('选择至少一个面域');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    // 全选 → 三 chips 全按下 → ✓ 解禁 → 载荷 regions [0,1,2]（升序集语义）。
    await user.click(screen.getByTestId('part-studio-feature-dialog-region-select-all'));
    const chipsBox = screen.getByTestId('part-studio-feature-dialog-region-chips');
    const chipList = within(chipsBox).getByRole('list');
    for (const chip of within(chipList).getAllByRole('button')) {
      expect(chip.getAttribute('aria-pressed')).toBe('true');
    }
    expect(screen.queryByTestId('part-studio-feature-dialog-no-region-selected-hint')).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0, 1, 2] },
    });
  });

  it('单面域：自动 regions [0] 且不显示面域 chips/下拉（缺省语义无需选择）', async () => {
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText('草图 1 的面'); // 单面域 chip 无 ·面域 后缀
    expect(screen.queryByTestId('part-studio-feature-dialog-region-chips')).toBeNull();
    expect(screen.queryByRole('combobox', { name: '面域' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0] },
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await user.click(screen.getByRole('button', { name: '成品' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('已选草图未选（初始态）：提交禁用——通道未就绪不放行', async () => {
    featureRpc.getSketch.mockResolvedValue(sketchDtoWith([{ area: 0.25, outerEntityIds: [1] }]));
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
    // 占位项在场、未选中 → ✓ 禁用；getSketch 不应在未选草图时被调。
    expect(screen.getByRole('combobox', { name: '草图' })).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(featureRpc.getSketch).not.toHaveBeenCalled();
    expect(applyOp).not.toHaveBeenCalled();
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    const errorFace = await screen.findByTestId('part-studio-feature-dialog-region-error');
    expect(errorFace.textContent).toContain('无法读取草图面域');
    expect(featureRpc.getSketch).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('chip ×移除 = 清选择：草图下拉回占位、提交禁用、regions 清态', async () => {
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText('草图 1 的面');
    await user.click(screen.getByRole('button', { name: '移除 草图 1 的面' }));
    expect(screen.queryByText('草图 1 的面')).toBeNull();
    expect(screen.queryByRole('combobox', { name: '面域' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('换草图重置面域选择：sk-1 选 [0,1] → 切 sk-2 回缺省 [0]（旧下标不跨草图续用）', async () => {
    featureRpc.getSketch.mockImplementation(async (_key: string, sketchId: string) =>
      sketchId === 'sk-1'
        ? sketchDtoWith(
            [
              { area: 0.5, outerEntityIds: [1] },
              { area: 0.1, outerEntityIds: [2] },
            ],
            'sk-1',
          )
        : sketchDtoWith(
            [
              { area: 0.2, outerEntityIds: [3] },
              { area: 0.05, outerEntityIds: [4] },
            ],
            'sk-2',
          ),
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    const chips1 = await screen.findByTestId('part-studio-feature-dialog-region-chips');
    await user.click(within(chips1).getByRole('button', { name: '面域 1（面积 0.1）' }));
    expect(screen.getByText('草图 1 的面')).toBeDefined();
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-2');
    await screen.findByText('草图 2 的面');
    // 换草图后多选集回缺省 [0]：sk-2 的「面域 0」按下、「面域 1」未选。
    const chips2 = screen.getByTestId('part-studio-feature-dialog-region-chips');
    expect(within(chips2).getByRole('button', { name: '面域 0（最大，面积 0.2）' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(chips2).getByRole('button', { name: '面域 1（面积 0.05）' }).getAttribute('aria-pressed')).toBe('false');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-2', regions: [0] },
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
    // 草图通道形态：草图下拉在场（旧布尔直出的通用 chips/快速拾取不越通道）。
    expect(screen.getByRole('combobox', { name: '草图' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '快速拾取' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    // 选中草图（单面域自动 [0]）→ 提交草图驱动布尔载荷
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText('草图 1 的面');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'booleanAdd',
      params: { sketchId: 'sk-1', distance: 10, regions: [0], operation: 'unite' },
    });
  });

  // M7 v1.10：布尔作用域页签映射到 featureType（extrude 对话框内切换）：
  // 新建→extrude（既有载荷，symmetric 键语义不动）/ 加入→booleanAdd / 移除→booleanSubtract；
  // 相交无后端特征类型（M7 首版不支持），保持不映射（不静默降级为并集——本版页签仍为回传元数据）。
  it('布尔作用域映射 featureType（M7 v1.10）：加入→booleanAdd(unite) / 移除→booleanSubtract(subtract) / 新建→extrude 原载荷', async () => {
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
    // B1 复审 Minor：相交无后端类型 → 提交态页签禁用 + 「暂不支持」提示（不可静默并集）；
    // 有实体时加入/移除可用。
    expect((screen.getByRole('tab', { name: '相交' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-intersect-unsupported-hint').textContent).toContain('相交暂不支持');
    expect((screen.getByRole('tab', { name: '加入' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('tab', { name: '移除' }) as HTMLButtonElement).disabled).toBe(false);

    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText('草图 1 的面');

    await user.click(screen.getByRole('tab', { name: '加入' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'booleanAdd',
      params: { sketchId: 'sk-1', distance: 10, regions: [0], operation: 'unite' },
    });

    await user.click(screen.getByRole('tab', { name: '移除' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'booleanSubtract',
      params: { sketchId: 'sk-1', distance: 10, regions: [0], operation: 'subtract' },
    });

    await user.click(screen.getByRole('tab', { name: '新建' }));
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls.at(-1)![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0] },
    });
    expect(applyOp).toHaveBeenCalledTimes(3);
  });

  // B1 复审 Important：布尔 requiresUpstream——无实体（sketch-only 模型）时加入/移除
  // 无上游，后端只会落 status=1 死特征（op 仍 ok:true）。UI 侧禁用页签 + 提示，确认
  // 仍提交合法 extrude（不产生死特征）。
  it('无实体（hasBodies=false）：加入/移除/相交页签禁用 + 诚实提示；确认仍提交 extrude（不产生布尔死特征）', async () => {
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
    expect(screen.getByTestId('part-studio-feature-dialog-intersect-unsupported-hint')).toBeDefined();
    // 草图通道仍可用（extrude 合法路径）：选草图 → 确认提交 extrude。
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText('草图 1 的面');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0] },
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText(/草图 1 的面/); // 面域已落定（entities 同响应到达；多面域 chip 带 ·面域 后缀故用 regex）
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
    // M6-c T5 判型命名：两线端点 y 相等 → 水平线 1/水平线 2（id 与载荷同值可对账）。
    expect(within(axisSelect).getByRole('option', { name: '水平线 1' })).toBeDefined();
    expect(within(axisSelect).getByRole('option', { name: '水平线 2' })).toBeDefined();
    expect((screen.getByRole('checkbox', { name: '全方位' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('textbox', { name: '角度（度）' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'revolve',
      params: { sketchId: 'sk-1', regionIndex: 0, axis: { sketchEntityId: 3 }, fullRevolve: true },
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
      params: { sketchId: 'sk-1', regionIndex: 0, axis: { sketchEntityId: 4 }, fullRevolve: true },
    });
  });

  it('revolve 面域保持单选（M6-c T3 裁决钉形）：多面域仍出单选下拉（无多选 chips/全选/清空），载荷 regionIndex 透传（RevolveParams 未扩 regions——不越契约）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(
      applyOp,
      revolveSketchDto(LINED_SKETCH_ENTITIES, [
        { area: 0.5, outerEntityIds: [1] },
        { area: 0.1, outerEntityIds: [2] },
      ]),
    );
    // 单选下拉在场（首项标最大）；extrude 的多选 UI（chips/全选/清空/空选提示）不越通道。
    const regionSelect = await screen.findByRole('combobox', { name: '面域' });
    expect(within(regionSelect).getByRole('option', { name: '面域 0（最大，面积 0.5）' })).toBeDefined();
    expect(screen.queryByTestId('part-studio-feature-dialog-region-chips')).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-region-select-all')).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-region-clear')).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-no-region-selected-hint')).toBeNull();
    // 回显 chip 带 ·面域 N 后缀（revolve 保留单选回显形态）。
    expect(screen.getByText('草图 1 的面 · 面域 0')).toBeDefined();
    await user.selectOptions(regionSelect, '1');
    expect(screen.getByText('草图 1 的面 · 面域 1')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'revolve',
      params: {
        sketchId: 'sk-1',
        regionIndex: 1,
        axis: { sketchEntityId: 3 },
        fullRevolve: true,
      },
    });
  });

  it('角度换算 π 精度：取消全方位 → 角度输入现（缺省 360）→ 改 180 → 载荷 angle=Math.PI（fullRevolve=false）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    await user.click(screen.getByRole('checkbox', { name: '全方位' }));
    const angle = screen.getByRole('textbox', { name: '角度（度）' }) as HTMLInputElement;
    expect(angle.value).toBe('360');
    await user.clear(angle);
    await user.type(angle, '180');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'revolve',
      params: {
        sketchId: 'sk-1',
        regionIndex: 0,
        axis: { sketchEntityId: 3 },
        fullRevolve: false,
        angle: Math.PI,
      },
    });
  });

  it('角度换算 90° → Math.PI/2（弧度载荷契约的另一半锚点）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    await user.click(screen.getByRole('checkbox', { name: '全方位' }));
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    await user.click(screen.getByRole('button', { name: '成品' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('非法角度（0 / 超 360 / 空）→ 校验 Alert 就地 + 不发起 op（弧度域 (0,2π] 的度制门）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderRevolveDialog(applyOp, revolveSketchDto(LINED_SKETCH_ENTITIES, ONE_REGION));
    await user.click(screen.getByRole('checkbox', { name: '全方位' }));
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
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
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], symmetric: true },
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
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
    await user.click(screen.getByRole('button', { name: '成品' }));
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '成品' }));
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
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
    await user.click(screen.getByRole('button', { name: '成品' }));
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '成品' }));
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
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull(); // mirror 无距离量
    expect(screen.getByTestId('part-studio-feature-dialog-mirror-scope-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(false);
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '成品' }));
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('edit 模式/壳期不渲染 mirror 平面下拉（new + applyOp 才进入通道）', () => {
    renderDialog({ featureType: 'mirror' });
    expect(screen.queryByRole('combobox', { name: '镜像平面' })).toBeNull();
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

  it('初始形态（linear）：类型下拉缺省线性、count=3、spacing=10、axis=X；无 angle/距离输入；✓/成品可用', () => {
    renderPatternDialog(makeApplyOp());
    const kind = screen.getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement;
    expect(kind.value).toBe('linear');
    expect(screen.getByRole('option', { name: '线性阵列' })).toBeDefined();
    expect(screen.getByRole('option', { name: '圆周阵列' })).toBeDefined();
    expect((screen.getByRole('textbox', { name: '实例数量（含原件）' }) as HTMLInputElement).value).toBe('3');
    expect((screen.getByRole('textbox', { name: '间距' }) as HTMLInputElement).value).toBe('10');
    expect((screen.getByRole('combobox', { name: '方向轴' }) as HTMLSelectElement).value).toBe('X');
    expect(screen.queryByRole('textbox', { name: '总角度（度）' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: '距离' })).toBeNull(); // pattern 无距离量
    expect(screen.getByTestId('part-studio-feature-dialog-pattern-scope-hint')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('线性提交：载荷 {kind:"linear", count:3, spacing:10, axis:"X"}（无 angle 键）→ onConfirm', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderPatternDialog(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'pattern',
      params: { kind: 'linear', count: 3, spacing: 10, axis: 'X' },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('切换圆周：angle 输入出现、spacing 消失、axis 锁定 Z；载荷 {kind:"circular", count:4, angle:180, axis:"Z"}（无 spacing 键）', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = renderPatternDialog(applyOp);
    await user.selectOptions(screen.getByRole('combobox', { name: '阵列类型' }), 'circular');
    expect(screen.queryByRole('textbox', { name: '间距' })).toBeNull();
    const angle = screen.getByRole('textbox', { name: '总角度（度）' }) as HTMLInputElement;
    expect(angle.value).toBe('360');
    const axis = screen.getByRole('combobox', { name: '方向轴' }) as HTMLSelectElement;
    expect(axis.value).toBe('Z');
    expect(axis.disabled).toBe(true);
    await user.clear(screen.getByRole('textbox', { name: '实例数量（含原件）' }));
    await user.type(screen.getByRole('textbox', { name: '实例数量（含原件）' }), '4');
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
    expect(screen.queryByRole('textbox', { name: '间距' })).toBeNull();
    expect((screen.getByRole('combobox', { name: '方向轴' }) as HTMLSelectElement).value).toBe('Z');
  });

  it('非法数值 → 字段级诚实文案 + 不发起 op（count<2 / 非整数、spacing<=0、angle 越界）', async () => {
    const cases: Array<{ field: string; value: string; message: string }> = [
      { field: '实例数量（含原件）', value: '1', message: '实例数量须为 2–1000 的整数（含原件）' },
      { field: '实例数量（含原件）', value: '2.5', message: '实例数量须为 2–1000 的整数（含原件）' },
      { field: '实例数量（含原件）', value: '1001', message: '实例数量须为 2–1000 的整数（含原件）' }, // M1 上限
      { field: '间距', value: '0', message: '间距须为正数' },
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

  it('无上游实体（hasBodies=false）→ 需要上游实体提示 + 提交禁用 + 不渲染参数控件/不发起 op', async () => {
    const applyOp = makeApplyOp();
    const { user } = renderPatternDialog(applyOp, { hasBodies: false });
    expect(screen.getByTestId('part-studio-feature-dialog-pattern-needs-body-hint').textContent)
      .toBe('阵列需要上游实体：请先创建至少一个实体特征');
    expect(screen.queryByRole('combobox', { name: '阵列类型' })).toBeNull();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '成品' }));
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
    expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(true);
    // 草图通道不接（输入是体边非草画面域）。
    expect(screen.queryByRole('combobox', { name: '草图' })).toBeNull();
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

  it('多边载荷：拾 2 边 → 两 chips（序号 1/2）→ 结束拾取 → 载荷 edges 按拾取序全量透传', async () => {
    const user = userEvent.setup();
    const { applyOp } = renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    pickEdge(EDGE_2);
    pickEdge(EDGE_1);
    await screen.findByText('边 2');
    pickMocks.captured?.onEnded?.();
    await waitFor(() => expect((screen.getByRole('button', { name: '成品' }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole('button', { name: '成品' }));
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

  it('拾取态：aria-pressed + 拾取提示 +「结束拾取」钮 + ✓ 禁用；点钮 → exitTool 回「添加边」', async () => {
    const user = userEvent.setup();
    renderFilletDialog(makeApplyOp());
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    await waitFor(() => expect(pickMocks.captured).toBeDefined());
    expect(pickMocks.captured?.connectionKey).toBe('model-key');
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('part-studio-feature-dialog-picking-hint')).toBeDefined();
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').textContent).toBe('结束拾取');
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    // 再点钮 = 主动结束拾取（对话框驱动结束通道之一）。
    await user.click(screen.getByTestId('part-studio-feature-dialog-add-edge'));
    expect(pickMocks.exitTool).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').textContent).toBe('添加边');
  });

  it('拾取态 Escape 分叉：只结束拾取回对话框（onCancel 不调、exitTool 调）', async () => {
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
    expect(pickMocks.exitTool).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled(); // 对话框不关——拾取分叉优先
    expect(screen.getByTestId('part-studio-feature-dialog-add-edge').textContent).toBe('添加边');
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
    await waitFor(() => expect(screen.getByTestId('part-studio-feature-dialog-add-edge').textContent).toBe('添加边'));
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

describe('B3 禁用钮视觉（成品/✓ 禁用态不再「蓝底高亮可点」）', () => {
  it('成品（__finish）禁用 → 落库 disabled 底/字色令牌（非 accent 蓝）+ not-allowed 指针', () => {
    const block = cssRuleBlock('.part-studio-feature-dialog__finish:disabled');
    expect(block).toContain('var(--iui-color-background-disabled');
    expect(block).toContain('var(--iui-color-text-disabled');
    expect(block).toContain('cursor: not-allowed');
    expect(block).not.toContain('--iui-color-text-accent');
  });

  it('✓（__confirm）禁用 → 库 disabled 图标色 + not-allowed 指针（enabled 绿✓不动）', () => {
    const block = cssRuleBlock('.part-studio-feature-dialog__confirm:disabled');
    expect(block).toContain('var(--iui-color-icon-disabled');
    expect(block).toContain('cursor: not-allowed');
    // enabled 规则（os-31 绿✓）保持原样——修复只动禁用态。
    const enabled = cssRuleBlock('.part-studio-feature-dialog__confirm');
    expect(enabled).toContain('--iui-color-text-positive');
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
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-1');
    await screen.findByText('草图 1 的面');
    return { user, onConfirm };
  }

  beforeEach(() => {
    featureRpc.getSketch.mockReset();
  });

  it('单 body（N≤1）：无目标实体下拉、无 targetBodyId；勾选新建实体 → params.newBody=true（未勾省略）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: [BODY_1] });
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    const checkbox = screen.getByRole('checkbox', { name: '新建实体' }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0] },
    });
    // 勾选后 → newBody:true（仅在勾选时带键）。
    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[1]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], newBody: true },
    });
  });

  it('N>1 active authored body：目标实体下拉（consumed 不入选项）；默认首个；值进 op.targetBodyId 不进 params', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: WITH_CONSUMED });
    const select = screen.getByRole('combobox', { name: '目标实体' }) as HTMLSelectElement;
    expect(select.value).toBe('0x15');
    expect(within(select).getByRole('option', { name: 'Body 1' })).toBeDefined();
    expect(within(select).getByRole('option', { name: 'Body 2' })).toBeDefined();
    expect(within(select).queryByRole('option', { name: 'Body 3' })).toBeNull();
    await user.selectOptions(select, '0x18');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      targetBodyId: '0x18',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0] },
    });
  });

  it('newBody 勾选：目标实体下拉隐藏、不携带 targetBodyId（新体由本 op 创建）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: ACTIVE_TWO });
    expect(screen.getByRole('combobox', { name: '目标实体' })).toBeDefined();
    await user.click(screen.getByRole('checkbox', { name: '新建实体' }));
    expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], newBody: true },
    });
  });

  it('布尔作用域映射（加入→booleanAdd）N>1：仍显示目标实体且载荷 targetBodyId；newBody 复选隐藏（仅 extrude 新建）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodies: ACTIVE_TWO });
    expect(screen.getByRole('checkbox', { name: '新建实体' })).toBeDefined();
    await user.click(screen.getByRole('tab', { name: '加入' }));
    // 映射后 effectiveFeatureType=booleanAdd：不属 extrude 新建通道 → 复选隐藏。
    expect(screen.queryByRole('checkbox', { name: '新建实体' })).toBeNull();
    expect(screen.getByRole('combobox', { name: '目标实体' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'booleanAdd',
      targetBodyId: '0x15',
      params: { sketchId: 'sk-1', distance: 10, regions: [0], operation: 'unite' },
    });
  });

  it('读面初次失败（bodies 不可用）→ body-producing 提交禁用 + 诚实提示（不发无 target 的 insert）', async () => {
    const applyOp = makeApplyOp();
    await renderReadyExtrude(applyOp, { bodiesError: 'init race' });
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-bodies-unavailable-hint')).toBeDefined();
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('读面不可用但勾选 newBody → 仍可提交（newBody 无需 target；Minor 2）', async () => {
    const applyOp = makeApplyOp();
    const { user } = await renderReadyExtrude(applyOp, { bodiesError: 'init race' });
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: '新建实体' }));
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], newBody: true },
    });
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

    // chamfer/shell：owner 通道未接线 → 不显示手动下拉 + 禁提交提示。
    for (const featureType of ['chamfer', 'shell'] as const) {
      const gated = render(
        <FeatureDialog
          featureName={featureType}
          mode="new"
          featureType={featureType}
          applyOp={applyOp}
          bodies={ACTIVE_TWO}
          onConfirm={vi.fn()}
        />,
      );
      expect(screen.queryByRole('combobox', { name: '目标实体' })).toBeNull();
      expect(screen.getByTestId('part-studio-feature-dialog-unowned-target-hint')).toBeDefined();
      expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
      gated.unmount();
    }
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
});

// ---------------------------------------------------------------------------
// B6 M-A4.2a：body boolean（booleanBodies）对话框
//  - target 单选（active authored；consumed 不入选项）+ tools 多选（active
//    authored；目标行常态禁用，冲突态可解选）；载荷 {targets:[{bodyKey}],
//    tools:[{bodyKey}...], operation, keepTools}——op 层**不带 targetBodyId**
//    （M4.1 planBooleanInsert：params.targets 为目标唯一真源，重复给值须一致）；
//  - operation unite/subtract（intersect 选项禁用+提示，不静默降级）；
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

  it('字段与缺省：目标实体单选（consumed 不入选项/目标行禁用）、工具多选、运算缺省并集（相交禁用+提示）、保留工具体缺省未勾+消费提示', () => {
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
    const operation = screen.getByRole('combobox', { name: '运算' }) as HTMLSelectElement;
    expect(operation.value).toBe('unite');
    expect((within(operation).getByRole('option', { name: '相交' }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-intersect-hint').textContent).toContain('相交暂不支持');
    const keepTools = screen.getByRole('checkbox', { name: '保留工具体' }) as HTMLInputElement;
    expect(keepTools.checked).toBe(false);
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-consume-hint').textContent).toContain('消费');
    expect(screen.queryByTestId('part-studio-feature-dialog-boolean-tool-lock-hint')).toBeNull();
    // 初始无工具 → 禁提交 + 空选提示。
    expect(confirmButton().disabled).toBe(true);
    expect(screen.getByTestId('part-studio-feature-dialog-boolean-tools-missing-hint')).toBeDefined();
    // 仅本通道的布尔控件在场：不渲染通用手动目标下拉/通用 chips（同一 aria 名不歧义）。
    expect(screen.getAllByRole('combobox', { name: '目标实体' })).toHaveLength(1);
  });

  it('不渲染遗留结果类型/布尔作用域页签：「相交」不可点选（防静默提交 unite）', async () => {
    const applyOp = makeApplyOp();
    renderBooleanDialog(applyOp);
    const user = userEvent.setup();
    // 体布尔的结果类型固定为实体、运算由 operation 下拉唯一决定——遗留页签整体不渲染。
    expect(screen.queryByRole('tablist', { name: '结果类型' })).toBeNull();
    expect(screen.queryByRole('tablist', { name: '布尔作用域' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '相交' })).toBeNull();
    // operation 下拉中的「相交」仍是禁用态（不静默降级），唯一可提交运算为并集。
    const operation = screen.getByRole('combobox', { name: '运算' }) as HTMLSelectElement;
    expect((within(operation).getByRole('option', { name: '相交' }) as HTMLOptionElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Body 2' }));
    await user.click(confirmButton());
    expect(booleanCreateOp(applyOp.mock.calls[0]![0]).params).toMatchObject({
      operation: 'unite',
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
    await user.selectOptions(screen.getByRole('combobox', { name: '运算' }), 'subtract');
    await user.click(screen.getByRole('checkbox', { name: '保留工具体' }));
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
