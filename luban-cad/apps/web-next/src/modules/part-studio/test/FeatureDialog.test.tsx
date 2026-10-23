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
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// 真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

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

import type { FeatureOp, FeatureOpResult } from '@luban-cad/shared';
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
// M4 Task 6：提交接线（拉伸闭环提交面）——new 模式 ✓/成品 → applyOp 形状钉死
//（insertFeature/extrude/{profile:[],distance}，shared opDsl「空 profile=拉伸
// 基体」语义）；成功 toast+onConfirm（宿主收合）；失败就地 Alert 六态 error
// + 不关闭；提交中禁重入；applyOp 未接线回退纯回调（M3 壳期语义保持）；
// edit 模式本版不提交（updateParams 归特征对话框增强 backlog）。
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

  beforeEach(() => {
    mocks.outputMessage.mockClear();
  });

  it('✓确认 → applyOp 形状钉死（insertFeature/extrude/{profile:[],distance}）；成功 → onConfirm（宿主关闭）', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    const { onConfirm } = renderSubmitDialog(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).toHaveBeenCalledTimes(1);
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 10 },
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('距离输入进 op params（空 profile=拉伸基体，距离为唯一可编辑量）', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    renderSubmitDialog(applyOp);
    const distance = screen.getByRole('textbox', { name: '距离' });
    expect((distance as HTMLInputElement).value).toBe('10');
    await user.clear(distance);
    await user.type(distance, '42.5');
    await user.click(screen.getByRole('button', { name: '成品' }));
    expect(applyOp.mock.calls[0]![0]).toEqual({
      kind: 'insertFeature',
      featureType: 'extrude',
      params: { profile: [], distance: 42.5 },
    });
  });

  it('成功 → toast（notifications 通道，与保存错误面同款标准管道）', async () => {
    const user = userEvent.setup();
    renderSubmitDialog(makeApplyOp());
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
    const details = mocks.outputMessage.mock.calls[0]![0] as { briefMessage: string };
    expect(details.briefMessage).toContain('拉伸');
  });

  it('失败 → 就地 Alert（六态 error），不调 onConfirm（对话框不关闭）', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp(() => ({ ok: false, error: '写租约被 other-page 持有' }));
    const { onConfirm } = renderSubmitDialog(applyOp);
    await user.click(screen.getByRole('button', { name: '确认' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('写租约被 other-page 持有');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('提交中禁重入：✓/成品 禁用，pending 期间再点不二次 applyOp', async () => {
    const user = userEvent.setup();
    let release!: (r: FeatureOpResult) => void;
    const applyOp = vi.fn(
      (_op: FeatureOp): Promise<FeatureOpResult> =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { onConfirm } = renderSubmitDialog(applyOp as unknown as ReturnType<typeof makeApplyOp>);
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
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    renderSubmitDialog(applyOp);
    const distance = screen.getByRole('textbox', { name: '距离' });
    await user.clear(distance);
    await user.click(screen.getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('距离');
  });

  it('applyOp 未接线（壳期）→ 确认回退纯 onConfirm（M3 语义保持）', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<FeatureDialog featureName="拉伸" mode="new" featureType="extrude" onConfirm={onConfirm} />);
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

  it('leaseOk=false → 租约警示在场（不硬禁用），提交仍可达', async () => {
    const user = userEvent.setup();
    const applyOp = makeApplyOp();
    renderSubmitDialog(applyOp, { leaseOk: false });
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
