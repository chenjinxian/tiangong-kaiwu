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
//  6) 底部：回滚滑杆（range，默认=上限）+ 成品按钮（同 ✓ 确认出口）+ ?
//     帮助（展开帮助文案）。
//
// M6-a T6（拉伸草图通道）：new/extrude 提交走 {sketchId, regionIndex,
// profile:[]}（解「空 profile 死结」——T3 zod 拒收无 sketchId 的空 profile）：
// 草图下拉+面域下拉（regions>1）/单面域自动 0/无草图无面域门禁/选中回显
// chip/布尔类型不接通道（zod sketchId:z.never() 既有语义）。
//
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// '@luban-cad/shared' 模块级 mock（getSketch 面域读面替身），真实 store/i18n
// 参与（setup.ts 全局词库兜底，zh-CN 基线）。

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

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

vi.mock('@itwin/core-frontend', () => ({
  // Tool 基类桩：part-studio barrel → PartStudioPage → viewer-next 装饰件
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

import type { FeatureOp, FeatureOpResult, SketchDto, SketchRegionDto } from '@luban-cad/shared';
import type { CanvasSelection } from '../index.js';
import { usePartStudioStore } from '../index.js';
import type { FeatureDialogEntity, FeatureDialogResult } from '../dialogs/FeatureDialog.js';
import { FeatureDialog } from '../dialogs/FeatureDialog.js';

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
  mocks.viewport = null;
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

  it('默认载荷：solid/new/entities 初始/direction=forward/偏移空/无对称/拔模空/回滚=上限', async () => {
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
      rollback: 100,
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

describe('底部（回滚滑杆 + 成品 + ?）', () => {
  it('回滚滑杆在场：range 语义 + 默认=上限 100', () => {
    renderDialog();
    const slider = screen.getByRole('slider', { name: '回滚' });
    expect(slider.getAttribute('type')).toBe('range');
    expect((slider as HTMLInputElement).value).toBe('100');
  });

  it('拖滑杆改值进确认载荷；rollbackMax 可注入', async () => {
    const { onConfirm } = renderDialog({ entities: [], rollbackMax: 7 });
    const slider = screen.getByRole('slider', { name: '回滚' });
    expect(slider.getAttribute('max')).toBe('7');
    expect((slider as HTMLInputElement).value).toBe('7');
    fireEvent.change(slider, { target: { value: '3' } });
    await userEvent.setup().click(screen.getByRole('button', { name: '确认' }));
    expect((onConfirm.mock.calls[0]![0] as FeatureDialogResult).rollback).toBe(3);
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
    rollbackMax={5}
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
// 通道 {sketchId, regionIndex, profile:[]}——T3 zod 互斥语义（sketchId 在场
// profile 须空）使裸空 profile 恒被拒收（「空 profile 死结」），原断言已失效；
// 且草图通道未就绪（未选草图/面域未载）时 ✓ 禁用，故各提交用例先经
// renderReadyDialog 备好通道。
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

  it('✓确认 → applyOp 形状钉死（insertFeature/extrude/{sketchId,regionIndex,profile:[]}）；成功 → onConfirm（宿主关闭）', async () => {
    const applyOp = makeApplyOp();
    const { user, onConfirm } = await renderReadyDialog(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regionIndex: 0 },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('距离输入进 op params（sketchId/regionIndex 随行，距离为可编辑量）', async () => {
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
      params: { profile: [], distance: 42.5, sketchId: 'sk-1', regionIndex: 0 },
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
// RPC 消费面（connectionKey 寻址 + regions 面积降序数组下标=regionIndex）。
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

  it('多面域：region 下拉在场（首项标最大）→ 选「面域 1」→ 载荷 regionIndex=1 + chip 带面域序', async () => {
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
    // 面域下拉现于 regions>1；面积读数去尾零（0.5 → "0.5"），首项=最大（regionIndex 缺省 0 的语义锚）。
    const regionSelect = await screen.findByRole('combobox', { name: '面域' });
    const regionOptions = within(regionSelect).getAllByRole('option');
    expect(regionOptions[0]!.textContent).toBe('面域 0（最大，面积 0.5）');
    expect(regionOptions[1]!.textContent).toBe('面域 1（面积 0.1）');
    // 回显 chip 带 regionIndex（多面域形态）。
    expect(screen.getByText('草图 1 的面 · 面域 0')).toBeDefined();
    await user.selectOptions(regionSelect, '1');
    expect(screen.getByText('草图 1 的面 · 面域 1')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regionIndex: 1 },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('单面域：自动 regionIndex=0 且不显示面域下拉（缺省语义无需选择）', async () => {
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
    expect(screen.queryByRole('combobox', { name: '面域' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-1', regionIndex: 0 },
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

  it('换草图重置面域序：sk-1 选面域 1 → 切 sk-2 回 regionIndex=0', async () => {
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
    const regionSelect = await screen.findByRole('combobox', { name: '面域' });
    await user.selectOptions(regionSelect, '1');
    expect(screen.getByText('草图 1 的面 · 面域 1')).toBeDefined();
    await user.selectOptions(screen.getByRole('combobox', { name: '草图' }), 'sk-2');
    await screen.findByText('草图 2 的面 · 面域 0');
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10, sketchId: 'sk-2', regionIndex: 0 },
    });
  });

  it('布尔类型（booleanAdd）不接草图通道：sketches 在场也无草图下拉/门禁，载荷仍 {profile:[],distance}（zod sketchId:z.never() 既有语义）', async () => {
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
    expect(screen.queryByRole('combobox', { name: '草图' })).toBeNull();
    expect(screen.queryByTestId('part-studio-feature-dialog-no-sketch-hint')).toBeNull();
    // 通用 chips + 快速拾取保持（非草图通道形态不动）。
    expect(screen.getByRole('button', { name: '快速拾取' })).toBeDefined();
    expect((screen.getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertFeature',
      featureType: 'booleanAdd',
      params: { profile: [], distance: 10 },
    });
    expect(featureRpc.getSketch).not.toHaveBeenCalled();
  });
});
