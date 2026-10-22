// src/modules/part-studio/test/CanvasContextMenu.test.tsx
//
// M3 Task 5（brief Step 1）：画布右键菜单（对齐 os-12）+ 选择驱动——
//  1) 空白态：右键菜单=适应视图/顶视图/前视图/右视图/等轴测视图/显示设置
//     （沿袭旧应用 EditorViewport 空白态口径）；
//  2) 选中态按拾取类型重构：part → 隐藏/缩放/视图垂直于/材料·外观·工程图
//     (gated→能力引导)/删除(HITL)；face → 面外观(gated)/删除；feature →
//     编辑特征(tools.run)/显示依赖项(gated)/删除；edge/vertex → 精简集；
//  3) 动作路由：适应视图/标准视图 → viewport 调用（mock 断言）；显示设置 →
//     store dock.display 展开；隐藏 → store.canvas.hiddenIds；删除 → HITL
//     确认对话框（取消/确认双路）；gated 项 → CapabilityDialog 不触发
//     tools.run；
//  4) PartStudioCanvas 集成：画布 onContextMenu 弹出菜单，Escape/外部点击收合。
//
// 定位：组件行为验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// 真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { JSX } from 'react';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toolsRun: vi.fn(),
  lookAtViewAlignedVolume: vi.fn(),
  computeFitRange: vi.fn(),
  synchWithView: vi.fn(),
  setStandardRotation: vi.fn(),
  turnCameraOff: vi.fn(),
  emphasizeElements: vi.fn(),
  clearEmphasizedElements: vi.fn(),
  hideElements: vi.fn(),
  /** 测试可改写：null=无 viewport（效果静默跳过）。 */
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
      emphasizeElements: mocks.emphasizeElements,
      clearEmphasizedElements: mocks.clearEmphasizedElements,
      hideElements: mocks.hideElements,
    }),
  },
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import type { CanvasSelection } from '../index.js';
import { usePartStudioStore } from '../index.js';
import { buildCanvasMenu, CanvasContextMenu, clampMenuPosition } from '../canvas/CanvasContextMenu.js';
import { PartStudioCanvas } from '../components/PartStudioCanvas.js';

/** 造一个带视口方法的 fake selectedView。 */
function makeViewport(): Record<string, unknown> {
  return {
    view: {
      lookAtViewAlignedVolume: mocks.lookAtViewAlignedVolume,
      computeFitRange: mocks.computeFitRange,
      is3d: () => true,
      turnCameraOff: mocks.turnCameraOff,
    },
    viewRect: { aspect: 1 },
    synchWithView: mocks.synchWithView,
    setStandardRotation: mocks.setStandardRotation,
  };
}

/** store 复位：canvas/tree/dock 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    dock: { activeTab: 'toolSettings', isOpen: false },
  });
}

function setSelection(selection: readonly CanvasSelection[]): void {
  usePartStudioStore.setState((s) => ({ canvas: { ...s.canvas, selection: [...selection] } }));
}

const ANCHOR = { x: 32, y: 48 };

function renderMenu(onClose = vi.fn(), onDelete = vi.fn()): ReturnType<typeof render> {
  return render(<CanvasContextMenu anchor={ANCHOR} onClose={onClose} onDelete={onDelete} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewport = null;
  resetStore();
});

describe('buildCanvasMenu 菜单模型（纯函数）', () => {
  it('空白选择 → 适应视图/四标准视图/显示设置（无选中态项）', () => {
    const entries = buildCanvasMenu([]);
    const ids = entries.filter((e) => e !== 'separator').map((e) => (e as { id: string }).id);
    expect(ids).toEqual([
      'fit-view',
      'standard-view-top',
      'standard-view-front',
      'standard-view-right',
      'standard-view-iso',
      'open-display-settings',
    ]);
  });

  it('part 拾取 → 材料/外观/工程图 gated 引导 + 隐藏/缩放/视图垂直于/删除', () => {
    const entries = buildCanvasMenu([{ kind: 'part', id: 'p1', label: 'Part 1' }]);
    const items = entries.filter((e) => e !== 'separator') as Array<{ id: string; capability?: string }>;
    expect(items.map((i) => i.id)).toEqual([
      'hide',
      'zoom-to-fit',
      'view-normal-to',
      'assign-material',
      'edit-appearance',
      'create-drawing',
      'delete',
    ]);
    expect(items.find((i) => i.id === 'assign-material')?.capability).toBe('material');
    expect(items.find((i) => i.id === 'edit-appearance')?.capability).toBe('appearance');
    expect(items.find((i) => i.id === 'create-drawing')?.capability).toBe('drawing');
  });

  it('feature 拾取 → 编辑特征/显示依赖/隐藏/缩放/视图垂直于/删除（显示依赖 gated）', () => {
    const entries = buildCanvasMenu([
      { kind: 'feature', id: 'f1', label: 'Extrude 1', featureType: 'extrude' },
    ]);
    const items = entries.filter((e) => e !== 'separator') as Array<{ id: string; capability?: string }>;
    expect(items.map((i) => i.id)).toEqual([
      'edit-feature',
      'show-dependencies',
      'hide',
      'zoom-to-fit',
      'view-normal-to',
      'delete',
    ]);
    expect(items.find((i) => i.id === 'show-dependencies')?.capability).toBe('dependencies');
  });

  it('face 拾取 → 无编辑特征；含面外观 gated 与删除', () => {
    const ids = (buildCanvasMenu([{ kind: 'face', id: 'face-1', label: '面 1' }]).filter(
      (e) => e !== 'separator',
    ) as Array<{ id: string; capability?: string }>).map((i) => i.id);
    expect(ids).toEqual(['hide', 'zoom-to-fit', 'view-normal-to', 'appearance-for-face', 'delete']);
  });

  it('edge/vertex 拾取 → 精简集（无 gated 项）', () => {
    for (const kind of ['edge', 'vertex'] as const) {
      const ids = (buildCanvasMenu([{ kind, id: 'e1', label: '边 1' }]).filter(
        (e) => e !== 'separator',
      ) as Array<{ id: string }>).map((i) => i.id);
      expect(ids).toEqual(['hide', 'zoom-to-fit', 'view-normal-to', 'delete']);
    }
  });
});

describe('CanvasContextMenu 空白态（对齐旧应用视口右键）', () => {
  it('渲染 适应视图/顶/前/右/等轴测/显示设置；不渲染选中态项', () => {
    renderMenu();
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    for (const name of ['适应视图', '顶视图', '前视图', '右视图', '等轴测视图', '显示设置']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeDefined();
    }
    expect(within(menu).queryByRole('menuitem', { name: /删除/ })).toBeNull();
  });

  it('anchor=null 渲染空（页面级常驻挂载，右键驱动开合）', () => {
    render(<CanvasContextMenu anchor={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('点击适应视图 → viewport 取景 + 菜单关闭', async () => {
    mocks.viewport = makeViewport();
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderMenu(onClose);
    await user.click(screen.getByRole('menuitem', { name: '适应视图' }));
    expect(mocks.lookAtViewAlignedVolume).toHaveBeenCalled();
    expect(mocks.synchWithView).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('点击顶视图 → setStandardRotation(StandardViewId.Top) + 正交关相机', async () => {
    mocks.viewport = makeViewport();
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('menuitem', { name: '顶视图' }));
    expect(mocks.setStandardRotation).toHaveBeenCalledWith('sv-top');
    expect(mocks.turnCameraOff).toHaveBeenCalled();
  });

  it('点击显示设置 → store dock=display 且展开', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('menuitem', { name: '显示设置' }));
    expect(usePartStudioStore.getState().dock.activeTab).toBe('display');
    expect(usePartStudioStore.getState().dock.isOpen).toBe(true);
  });
});

describe('CanvasContextMenu 选中态（按拾取类型重构）', () => {
  it('part 拾取：隐藏写 store.hiddenIds + viewport 隐藏；标签带实体名', async () => {
    mocks.viewport = makeViewport();
    const user = userEvent.setup();
    setSelection([{ kind: 'part', id: 'p1', label: 'Part 1' }]);
    renderMenu();
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    const hide = within(menu).getByRole('menuitem', { name: '隐藏 Part 1' });
    await user.click(hide);
    expect(usePartStudioStore.getState().canvas.hiddenIds).toContain('p1');
    expect(mocks.hideElements).toHaveBeenCalled();
  });

  it('gated 项（将材料指定用于 Part 1…）→ 能力引导对话框，不触发 tools.run', async () => {
    const user = userEvent.setup();
    setSelection([{ kind: 'part', id: 'p1', label: 'Part 1' }]);
    renderMenu();
    await user.click(screen.getByRole('menuitem', { name: '将材料指定用于 Part 1…' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '材料（规划中）' })).toBeDefined();
  });

  it('feature 拾取：编辑特征 → FeatureDialog edit 宿主路由（M4-T6：既有特征编辑不经 tools.run/new 路由）', async () => {
    const user = userEvent.setup();
    setSelection([{ kind: 'feature', id: 'f1', label: 'Extrude 1', featureType: 'extrude' }]);
    renderMenu();
    await user.click(screen.getByRole('menuitem', { name: '编辑 Extrude 1…' }));
    expect(mocks.toolsRun).not.toHaveBeenCalled();
    expect(usePartStudioStore.getState().dialog).toEqual({
      active: 'feature',
      mode: 'edit',
      featureId: 'f1',
      featureName: 'Extrude 1',
      featureType: 'extrude',
    });
  });

  it('feature 拾取：显示依赖项 → gated 引导对话框（依赖项查看（规划中））', async () => {
    const user = userEvent.setup();
    setSelection([{ kind: 'feature', id: 'f1', label: 'Extrude 1', featureType: 'extrude' }]);
    renderMenu();
    await user.click(screen.getByRole('menuitem', { name: '显示 Extrude 1 的依赖项…' }));
    expect(screen.getByRole('dialog', { name: '依赖项查看（规划中）' })).toBeDefined();
  });

  it('face 拾取：不出现编辑特征项；删除走 HITL 确认（取消路）', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    setSelection([{ kind: 'face', id: 'face-1', label: '面 1' }]);
    renderMenu(vi.fn(), onDelete);
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    expect(within(menu).queryByRole('menuitem', { name: /编辑 面 1/ })).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: '删除 面 1' }));
    // HITL：确认对话框出现，取消不触发删除。
    const dialog = screen.getByRole('dialog', { name: '删除 面 1' });
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '删除 面 1' })).toBeNull();
  });

  it('edge 拾取：删除确认路 → onDelete 收到选择集 + 选择集清空', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const selection: CanvasSelection[] = [{ kind: 'edge', id: 'e1', label: '边 1' }];
    setSelection(selection);
    renderMenu(vi.fn(), onDelete);
    await user.click(screen.getByRole('menuitem', { name: '删除 边 1' }));
    const dialog = screen.getByRole('dialog', { name: '删除 边 1' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith(selection);
    expect(usePartStudioStore.getState().canvas.selection).toHaveLength(0);
  });

  it('真实宿主路：删除点击后宿主收合菜单（anchor→null），HITL 对话框仍独存', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    function Host(): JSX.Element {
      const [anchor, setAnchor] = React.useState<{ x: number; y: number } | null>(ANCHOR);
      return <CanvasContextMenu anchor={anchor} onClose={() => setAnchor(null)} onDelete={onDelete} />;
    }
    setSelection([{ kind: 'edge', id: 'e1', label: '边 1' }]);
    render(<Host />);
    await user.click(screen.getByRole('menuitem', { name: '删除 边 1' }));
    // 菜单已收合，HITL 对话框独存（pendingDelete 跨 anchor 生命周期）。
    expect(screen.queryByRole('menu')).toBeNull();
    const dialog = screen.getByRole('dialog', { name: '删除 边 1' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith([{ kind: 'edge', id: 'e1', label: '边 1' }]);
    expect(screen.queryByRole('dialog', { name: '删除 边 1' })).toBeNull();
  });
});

describe('PartStudioCanvas 集成：右键弹菜单 + 收合', () => {
  it('画布 onContextMenu 弹出菜单；外部点击收合', async () => {
    const user = userEvent.setup();
    render(<PartStudioCanvas viewportRef={{ current: null }} />);
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), { clientX: 60, clientY: 70 });
    expect(screen.getByRole('menu', { name: '画布菜单' })).toBeDefined();
    await user.click(document.body);
    expect(screen.queryByRole('menu', { name: '画布菜单' })).toBeNull();
  });
});

describe('菜单视口边缘钳制（终审 T5-④）', () => {
  const realRect = HTMLElement.prototype.getBoundingClientRect;

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
  });

  describe('clampMenuPosition 纯函数', () => {
    it('视口内不动；右/下溢出向内收；欠尺寸视口钳到 margin', () => {
      // 视口内：原样返回。
      expect(clampMenuPosition(100, 200, 220, 300, 1024, 768)).toEqual({ x: 100, y: 200 });
      // 右/下溢出：收进 8px margin。
      expect(clampMenuPosition(1000, 700, 220, 300, 1024, 768)).toEqual({ x: 796, y: 460 });
      // 越界过头（菜单比视口还大）：钳到 margin。
      expect(clampMenuPosition(50, 50, 220, 300, 200, 260)).toEqual({ x: 8, y: 8 });
      // 负坐标：钳到 margin 下限。
      expect(clampMenuPosition(-40, -60, 220, 300, 1024, 768)).toEqual({ x: 8, y: 8 });
    });
  });

  it('anchor 落在视口右下边缘时，渲染位置钳制在视口内', () => {
    // jsdom 视口 1024×768；菜单实测尺寸 220×300（mock rect）。
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width: 220, height: 300, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
    render(<CanvasContextMenu anchor={{ x: 1000, y: 700 }} onClose={vi.fn()} />);
    const menu = screen.getByRole('menu', { name: '画布菜单' }) as HTMLElement;
    expect(menu.style.left).toBe('796px');
    expect(menu.style.top).toBe('460px');
  });

  it('视口内常规 anchor 不位移', () => {
    render(<CanvasContextMenu anchor={ANCHOR} onClose={vi.fn()} />);
    const menu = screen.getByRole('menu', { name: '画布菜单' }) as HTMLElement;
    expect(menu.style.left).toBe(`${ANCHOR.x}px`);
    expect(menu.style.top).toBe(`${ANCHOR.y}px`);
  });
});

// ── M4 Task 8（M3 终审挂账清偿）────────────────────────────────────────────

describe('M4-T8 D5：菜单项左置图标（os-12 V18）', () => {
  it('空白态与选中态每个菜单项都带图标（svg 在场，aria-hidden）', () => {
    for (const selection of [
      [],
      [{ kind: 'part', id: 'p1', label: 'Part 1' }],
      [{ kind: 'feature', id: 'f1', label: 'Extrude 1', featureType: 'extrude' }],
    ] as readonly CanvasSelection[][]) {
      setSelection(selection);
      const { unmount } = renderMenu();
      const menu = screen.getByRole('menu', { name: '画布菜单' });
      const items = within(menu).getAllByRole('menuitem');
      expect(items.length).toBeGreaterThan(0);
      for (const itemEl of items) {
        const icon = itemEl.querySelector('svg');
        expect(icon, `菜单项「${itemEl.textContent}」缺图标`).not.toBeNull();
        expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
      }
      unmount();
    }
  });
});

describe('M4-T8 T5-⑥：占位 kind 治理（每项真实 kind，不借道 show-dependencies）', () => {
  it('全菜单模型 kind 唯一：材料/外观/工程图/面外观各持专名 kind，show-dependencies 仅依赖项一项', () => {
    // 所有选中态的菜单项摊平，动作 kind 逐一钉死（gated→full 翻转时忘改
    // kind 即此处红——终审台账「占位 kind 清零」检查单的钉点）。
    const menus = [
      [],
      [{ kind: 'part', id: 'p1', label: 'Part 1' }],
      [{ kind: 'face', id: 'face-1', label: '面 1' }],
      [{ kind: 'edge', id: 'e1', label: '边 1' }],
      [{ kind: 'feature', id: 'f1', label: 'Extrude 1', featureType: 'extrude' }],
    ] as readonly CanvasSelection[][];
    const kinds: string[] = [];
    for (const selection of menus) {
      for (const entry of buildCanvasMenu(selection)) {
        if (entry !== 'separator') kinds.push(entry.action.kind);
      }
    }
    expect(kinds.filter((kind) => kind === 'show-dependencies')).toHaveLength(1);
    // 逐一钉死四项真实 kind（不再共用 show-dependencies）。
    const partItems = buildCanvasMenu([{ kind: 'part', id: 'p1', label: 'Part 1' }])
      .filter((e) => e !== 'separator') as Array<{ id: string; action: { kind: string } }>;
    expect(partItems.find((i) => i.id === 'assign-material')?.action.kind).toBe('assign-material');
    expect(partItems.find((i) => i.id === 'edit-appearance')?.action.kind).toBe('edit-appearance');
    expect(partItems.find((i) => i.id === 'create-drawing')?.action.kind).toBe('create-drawing');
    const faceItems = buildCanvasMenu([{ kind: 'face', id: 'face-1', label: '面 1' }])
      .filter((e) => e !== 'separator') as Array<{ id: string; action: { kind: string } }>;
    expect(faceItems.find((i) => i.id === 'appearance-for-face')?.action.kind).toBe('appearance-for-face');
  });
});

describe('M4-T8 T5-⑤：菜单监听一次注册（anchor 变化不重挂）', () => {
  it('两次 anchor 更新不重挂 window mousedown/keydown 监听（挂载期一次到位）', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    try {
      const { rerender } = render(<CanvasContextMenu anchor={ANCHOR} onClose={vi.fn()} />);
      const countBy = (type: string) => addSpy.mock.calls.filter(([t]) => t === type).length;
      const mousedownBefore = countBy('mousedown');
      const keydownBefore = countBy('keydown');
      expect(mousedownBefore).toBe(1);
      expect(keydownBefore).toBe(1);
      // anchor 变化（重开菜单）：监听不再重挂（M3-T5⑤ 效率债收口）。
      rerender(<CanvasContextMenu anchor={{ x: 10, y: 20 }} onClose={vi.fn()} />);
      expect(countBy('mousedown')).toBe(mousedownBefore);
      expect(countBy('keydown')).toBe(keydownBefore);
    } finally {
      addSpy.mockRestore();
    }
  });
});
