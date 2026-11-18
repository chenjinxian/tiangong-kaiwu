/**
 * ADR-0018 S1b：草图实体屏幕空间命中（控制点优先 ≤6px，曲线 ≤5px）。
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ScreenViewport } from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import type { SketchDto } from '@luban-cad/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SketchEntityPicker } from '../components/SketchEntityPicker.js';
import { clearSketchClipboard, copySketchEntities } from '../internal/sketch-clipboard.js';
import type { SketchEntitySelection, SketchPickerGeometry } from '../internal/sketch-entity-picker.js';
import { curveDistance, distToSegment, hitTestSketchEntity } from '../internal/sketch-entity-picker.js';
import { markRightDragMenuSuppression } from '../internal/right-drag-menu.js';

const project = (p: Point3d): { x: number; y: number } => ({ x: p.x, y: p.y });

const GEOMETRY: SketchPickerGeometry = {
  polylines: [
    { entityId: 1, points: [Point3d.create(0, 0, 0), Point3d.create(10, 0, 0)] },
    {
      entityId: 2,
      points: [Point3d.create(0, 5, 0), Point3d.create(10, 5, 0), Point3d.create(10, 15, 0), Point3d.create(0, 5, 0)],
    },
  ],
  controlPoints: [
    { entityId: 1, kind: 'endpoint', position: Point3d.create(0, 0, 0) },
    { entityId: 1, kind: 'endpoint', position: Point3d.create(10, 0, 0) },
    { entityId: 3, kind: 'point', position: Point3d.create(20, 20, 0) },
  ],
};

describe('hitTestSketchEntity', () => {
  it('控制点优先：命中端点 0.5px 内即使曲线也近', () => {
    expect(hitTestSketchEntity(GEOMETRY, { x: 0.5, y: 0.2 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 1, part: 'handle',
    });
  });

  it('曲线本体：距线段 ≤5px → curve', () => {
    expect(hitTestSketchEntity(GEOMETRY, { x: 5, y: -4 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 1, part: 'curve',
    });
  });

  it('孤立点实体可命中；远处空白 → null', () => {
    expect(hitTestSketchEntity(GEOMETRY, { x: 20.4, y: 20.4 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 3, part: 'handle',
    });
    expect(hitTestSketchEntity(GEOMETRY, { x: 100, y: 100 }, project, 'sk')).toBeNull();
  });

  it('多段曲线取最近段（斜边）', () => {
    // 斜边 (10,5)->(10,15) 是竖线；点 (11,10) 距其 1px → entity 2 curve。
    expect(hitTestSketchEntity(GEOMETRY, { x: 11, y: 10 }, project, 'sk')).toEqual({
      sketchId: 'sk', entityId: 2, part: 'curve',
    });
  });
});

describe('distance helpers', () => {
  it('点到线段：端点外投影钳制', () => {
    expect(distToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distToSegment({ x: 5, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 2 })).toBeCloseTo(Math.sqrt(18), 6);
  });

  it('折线取最小段距', () => {
    expect(curveDistance({ x: 0, y: 1 }, [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    ])).toBe(1);
  });
});

// 草图实体右键菜单（2026-11-12 Onshape live 顺序）：确认 草图 N 首项、
// 删除草图图元末项；其余项按 live 顺序。宿主 fake 视口（世界=屏幕单位）。

const SKETCH: SketchDto = {
  id: 'sk-1',
  entities: [{ kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } }],
  constraints: [],
  solve: { status: 'ok', dof: 2, failedConstraintIds: [], conflictingRank: [] },
  plane: {
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xDir: { x: 1, y: 0, z: 0 },
  },
};

function makeSketchViewport(): ScreenViewport {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300,
    toJSON: () => ({}),
  } as DOMRect);
  return {
    canvas,
    viewRect: { width: 400, height: 300 },
    worldToView: (point: Point3d) => ({ x: point.x, y: point.y }),
  } as unknown as ScreenViewport;
}

function renderPicker(opts: {
  withTransform?: boolean;
  interactive?: boolean;
  contextMenuEnabled?: boolean;
  canEdit?: boolean;
  sketch?: SketchDto;
  dimensionLabelHitTestRef?: React.MutableRefObject<((point: { x: number; y: number }) => number | null) | null>;
  onDeleteDimension?: (constraintId: number) => void | Promise<void>;
  onToggleDimensionDriven?: (constraintId: number, nextDriven: boolean) => void | Promise<void>;
  selected?: readonly SketchEntitySelection[];
  onDelete?: (selection: readonly SketchEntitySelection[]) => void;
  onPaste?: () => void;
} = {}): {
  onFinishSketch: ReturnType<typeof vi.fn>;
  onTransform: ReturnType<typeof vi.fn>;
  onSelectionChange: ReturnType<typeof vi.fn>;
  onPaste: ReturnType<typeof vi.fn>;
} {
  const onFinishSketch = vi.fn();
  const onTransform = vi.fn();
  const onSelectionChange = vi.fn();
  const onPaste = vi.fn();
  render(React.createElement(SketchEntityPicker, {
    viewport: makeSketchViewport(),
    sketch: opts.sketch ?? SKETCH,
    selected: opts.selected ?? [],
    onSelectionChange,
    sketchName: '草图 1',
    onFinishSketch,
    ...(opts.canEdit !== undefined ? { canEdit: opts.canEdit } : {}),
    ...(opts.interactive !== undefined ? { interactive: opts.interactive } : {}),
    ...(opts.contextMenuEnabled !== undefined ? { contextMenuEnabled: opts.contextMenuEnabled } : {}),
    ...(opts.dimensionLabelHitTestRef ? { dimensionLabelHitTestRef: opts.dimensionLabelHitTestRef } : {}),
    ...(opts.onDeleteDimension ? { onDeleteDimension: opts.onDeleteDimension } : {}),
    ...(opts.onToggleDimensionDriven ? { onToggleDimensionDriven: opts.onToggleDimensionDriven } : {}),
    ...(opts.onDelete ? { onDelete: opts.onDelete } : {}),
    ...(opts.onPaste ? { onPaste } : {}),
    // FIX-2：缺省接线；withTransform=false 模拟只读/不可变换宿主（不下传）。
    ...(opts.withTransform === false ? {} : { onTransform }),
  }));
  return { onFinishSketch, onTransform, onSelectionChange, onPaste };
}

/** 右键曲线中点（控制点 ≤6px 优先，取 ≥6px 的线段中部）→ 实体菜单。 */
function openEntityMenu(): HTMLElement {
  fireEvent.contextMenu(document, { clientX: 50, clientY: 0 });
  return screen.getByTestId('sketch-entity-menu');
}

describe('草图实体右键菜单（Onshape live 顺序）', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('首项=确认 草图 N（sketch-entity-menu-confirm），末项=删除；中间顺序与 live 一致', () => {
    renderPicker();
    const menu = openEntityMenu();
    const items = within(menu).getAllByRole('menuitem');
    expect(items[0]!.getAttribute('data-testid')).toBe('sketch-entity-menu-confirm');
    expect(items[0]!.textContent).toBe('确认 草图 1');
    expect(items.at(-1)!.getAttribute('data-testid')).toBe('sketch-entity-menu-delete');
    expect(items.map((item) => item.textContent?.replace('›', ''))).toEqual([
      '确认 草图 1',
      '复制草图图元',
      '变换草图图元',
      '建构线',
      '拉伸…',
      '旋转…',
      '曲线/曲面分析…',
      '清除选定内容',
      '选择',
      '相切相连边',
      '等长/等径边',
      '平行边',
      '创建选定内容…',
      '选择其他…',
      '添加评论',
      '缩放到合适大小',
      '放大选定对象',
      '视图垂直于草图平面',
      '将视图与竖直轴对齐',
      '删除草图图元',
    ]);
    // D6（2026-11-16）：变换草图图元接唯一变换 gizmo 会话，行转正可点。
    expect((within(menu).getByRole('menuitem', { name: '变换草图图元' }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(menu).getByRole('menuitem', { name: '删除草图图元' }) as HTMLButtonElement).disabled).toBe(false);
    // 未复制时粘贴项不出现（Onshape：粘贴在复制后出现，仍紧随复制）。
    expect(within(menu).queryByRole('menuitem', { name: '粘贴草图图元' })).toBeNull();
  });

  // 审计 D7 回归：夹紧估算高度小于实际行高时，末项（删除草图图元）曾被渲染到
  // 视口外且菜单不可滚 → e2e 点击无限重试直到超时。菜单必须以预留空间为
  // maxHeight 且可纵向滚动，保证 top + maxHeight 不越出视口。
  it('实体菜单受视口夹紧并可滚动（末项任意视口下可达）', () => {
    renderPicker();
    const menu = openEntityMenu();
    const top = Number.parseFloat(menu.style.top);
    const maxHeight = Number.parseFloat(menu.style.maxHeight);
    expect(Number.isFinite(top)).toBe(true);
    expect(Number.isFinite(maxHeight)).toBe(true);
    expect(menu.style.overflowY).toBe('auto');
    expect(top + maxHeight).toBeLessThanOrEqual(window.innerHeight);
  });

  // F6（2026-11-16）：极小视口（innerHeight < 128）下旧下界 Math.max(120, …)
  // 会让 maxHeight 越过视口——改为精确夹紧（top 与 maxHeight 下界 0）。
  it('极小视口（innerHeight=100）：top + maxHeight 仍不越界', () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 100 });
    try {
      renderPicker();
      const menu = openEntityMenu();
      const top = Number.parseFloat(menu.style.top);
      const maxHeight = Number.parseFloat(menu.style.maxHeight);
      expect(Number.isFinite(top)).toBe(true);
      expect(Number.isFinite(maxHeight)).toBe(true);
      expect(maxHeight).toBeGreaterThanOrEqual(0);
      expect(menu.style.overflowY).toBe('auto');
      expect(top + maxHeight).toBeLessThanOrEqual(window.innerHeight);
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: originalInnerHeight });
    }
  });

  // 审计 D7（2026-11-16）：选择▸ 父项禁用之外，渲染 live 捕获的五个子项为
  // 常驻禁用行（相切相连边/等长·等径边/平行边/创建选定内容…/选择其他…），
  // 逐项诚实 title；不新增任何动作。
  it('选择子菜单：五个 live 捕获行常驻禁用 + 逐项诚实原因 title', () => {
    renderPicker();
    const menu = openEntityMenu();
    expect((within(menu).getByRole('menuitem', { name: '选择' }) as HTMLButtonElement).disabled).toBe(true);

    const group = within(menu).getByTestId('sketch-entity-menu-select-submenu');
    const rows = within(group).getAllByRole('menuitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '相切相连边',
      '等长/等径边',
      '平行边',
      '创建选定内容…',
      '选择其他…',
    ]);
    for (const row of rows)
      expect((row as HTMLButtonElement).disabled).toBe(true);
    const relationReason = '按相切/等长/平行关系筛选边的选择过滤器尚未实现。';
    expect(rows[0]!.getAttribute('title')).toBe(relationReason);
    expect(rows[1]!.getAttribute('title')).toBe(relationReason);
    expect(rows[2]!.getAttribute('title')).toBe(relationReason);
    expect(rows[3]!.getAttribute('title')).toBe('创建命名选定内容（saved selection）尚未实现。');
    expect(rows[4]!.getAttribute('title')).toBe('「选择其他…」候选列表尚未实现。');
  });

  it('点击首项「确认 草图 N」→ 菜单关闭并调用 onFinishSketch', () => {
    const { onFinishSketch } = renderPicker();
    const menu = openEntityMenu();
    fireEvent.click(within(menu).getByTestId('sketch-entity-menu-confirm'));
    expect(onFinishSketch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sketch-entity-menu')).toBeNull();
  });

  // D6（2026-11-16）：变换草图图元 → 宿主已有变换 gizmo（onTransform），
  // 菜单关闭、不新增第二套工具。
  it('点击「变换草图图元」→ 菜单关闭并调用 onTransform', () => {
    const { onTransform } = renderPicker();
    const menu = openEntityMenu();
    fireEvent.click(within(menu).getByTestId('sketch-entity-menu-transform'));
    expect(onTransform).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sketch-entity-menu')).toBeNull();
  });

  // FIX-2（2026-11-16 W8b review）：宿主未接线（只读会话/当前状态不可变换）
  // → 行禁用 + 诚实原因 title；不再渲染可点 no-op。
  it('未接线 onTransform（只读）→ 变换行禁用 + 真实原因 title', () => {
    renderPicker({ withTransform: false });
    const menu = openEntityMenu();
    const row = within(menu).getByTestId('sketch-entity-menu-transform') as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.title).toBe('只读会话或当前状态不可变换。');
    fireEvent.click(row);
    // 禁用行点击不触发回调、菜单保持（无行为）。
    expect(screen.getByTestId('sketch-entity-menu')).toBeTruthy();
  });
});

// ── W20（2026-11-16 live）：尺寸标签右键菜单 ────────────────────────────────
// live：右键尺寸数值标签 = 草图空白菜单 + 首行驱动/从动状态切换（W31-A 起
// 按约束状态动态文案，宿主未接线时诚实禁用）+ 末行（分隔线后）「删除尺寸」
//（宿主既有约束删除路径）。
const DIMENSION_POINT = { x: 50, y: 0 };

/** 只在实体线中点（canvas 局部 50,0）报告尺寸标签命中，其余 null。 */
function dimensionHitRef(
  constraintId: number,
): React.MutableRefObject<((point: { x: number; y: number }) => number | null) | null> {
  return {
    current: (point) => (point.x === DIMENSION_POINT.x && point.y === DIMENSION_POINT.y ? constraintId : null),
  };
}

function openDimensionMenu(): HTMLElement {
  fireEvent.contextMenu(document, { clientX: DIMENSION_POINT.x, clientY: DIMENSION_POINT.y });
  return screen.getByTestId('sketch-dimension-menu');
}

describe('草图尺寸标签右键菜单（W20 live）', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('命中标签 → 尺寸菜单：首项无回传通道时诚实禁用、末项删除；不弹实体或空白菜单', () => {
    renderPicker({
      dimensionLabelHitTestRef: dimensionHitRef(7),
      onDeleteDimension: vi.fn(),
    });
    const menu = openDimensionMenu();
    expect(screen.queryByTestId('sketch-entity-menu')).toBeNull();
    expect(screen.queryByTestId('sketch-blank-menu')).toBeNull();

    const items = within(menu).getAllByRole('menuitem');
    expect(items[0]!.getAttribute('data-testid')).toBe('sketch-dimension-menu-driven');
    expect((items[0] as HTMLButtonElement).disabled).toBe(true);
    expect(items[0]!.getAttribute('title')).toBe('该操作暂未支持');
    expect(items.at(-1)!.getAttribute('data-testid')).toBe('sketch-dimension-menu-delete');
    expect((items.at(-1) as HTMLButtonElement).disabled).toBe(false);
    // W24 live：18 行 / 7 条分隔线，分组与行序逐项对齐（选择行无内联 ›）。
    // W31-A：首行文案按约束状态（本用例命中 id 7 不在草图约束中 → 默认
    // driving 口径「更改为从动尺寸」；无 onToggleDimensionDriven → 禁用）。
    expect(items.map((item) => (item.textContent ?? '').trim())).toEqual([
      '更改为从动尺寸',
      '确认 草图 1',
      '复制草图',
      '全部显示',
      '曲线/曲面分析…',
      '选择',
      '选择其他…',
      '添加评论',
      '缩放到合适大小',
      '视图垂直于草图平面',
      '删除尺寸',
    ]);
    expect(within(menu).getAllByRole('separator')).toHaveLength(7);
    expect(Array.from(menu.children).map((child) =>
      child.getAttribute('role') === 'separator' ? '─' : (child.textContent ?? '').trim(),
    )).toEqual([
      '更改为从动尺寸', '─',
      '确认 草图 1', '─',
      '复制草图', '─',
      '全部显示', '曲线/曲面分析…', '─',
      '选择', '选择其他…', '─',
      '添加评论', '─',
      '缩放到合适大小', '视图垂直于草图平面', '─',
      '删除尺寸',
    ]);

    // 选择行：live 皮肤由 CSS ::after 画 ►，行内不再渲染内联箭头；无子菜单动作。
    const selectRow = within(menu).getByRole('menuitem', { name: '选择' });
    expect((selectRow as HTMLButtonElement).disabled).toBe(true);
    expect(selectRow.classList.contains('part-studio-tree-menu__item--has-submenu')).toBe(true);
    expect(selectRow.textContent).toBe('选择');

    // 添加评论 / 删除尺寸：17×17 sprite 图标（span 绝对定位，aria-hidden）。
    const iconSpan = (row: HTMLElement): Element | null =>
      row.querySelector('span.part-studio-sketch-dimension-menu__icon');
    for (const [row, label] of [
      [within(menu).getByRole('menuitem', { name: '添加评论' }), '添加评论'],
      [within(menu).getByTestId('sketch-dimension-menu-delete'), '删除尺寸'],
    ] as const) {
      const span = iconSpan(row);
      expect(span, `${label} 图标 span`).not.toBeNull();
      expect(span!.getAttribute('aria-hidden')).toBe('true');
      const svg = span!.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('17');
      expect(svg?.getAttribute('height')).toBe('17');
    }
    // live：该菜单只有 添加评论 / 删除尺寸 两行带图标。
    expect(menu.querySelectorAll('.part-studio-sketch-dimension-menu__icon')).toHaveLength(2);
    // 删除行保留原 testid 与可点语义（上方已断言 enabled）。
    expect((within(menu).getByTestId('sketch-dimension-menu-delete') as HTMLButtonElement).disabled).toBe(false);
  });

  it('命中标签不改变实体选择（onSelectionChange 不调用）', () => {
    // 直接渲染并取用真实 onSelectionChange 断言（renderPicker 已返回 spy）。
    const { onSelectionChange } = renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7) });
    openDimensionMenu();
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('点击「删除尺寸」→ 菜单关闭并调用 onDeleteDimension(约束 id)', () => {
    const onDeleteDimension = vi.fn();
    renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7), onDeleteDimension });
    const menu = openDimensionMenu();
    fireEvent.click(within(menu).getByTestId('sketch-dimension-menu-delete'));
    expect(onDeleteDimension).toHaveBeenCalledTimes(1);
    expect(onDeleteDimension).toHaveBeenCalledWith(7);
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();
  });

  it('未命中尺寸标签 → 原实体/空白菜单不变（尺寸通道返回 null 不拦截）', () => {
    renderPicker({ dimensionLabelHitTestRef: { current: () => null } });
    const entityMenu = openEntityMenu();
    expect(entityMenu).toBeTruthy();
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();

    fireEvent.contextMenu(document, { clientX: 300, clientY: 250 });
    expect(screen.getByTestId('sketch-blank-menu')).toBeTruthy();
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();
  });

  it('右键拖拽抑制仍然吞掉尺寸菜单（不弹任何菜单）', () => {
    renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7), onDeleteDimension: vi.fn() });
    markRightDragMenuSuppression();
    fireEvent.contextMenu(document, { clientX: DIMENSION_POINT.x, clientY: DIMENSION_POINT.y });
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();
    expect(screen.queryByTestId('sketch-entity-menu')).toBeNull();
    expect(screen.queryByTestId('sketch-blank-menu')).toBeNull();
  });

  it('Escape / 外部 mousedown 关闭尺寸菜单', () => {
    renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7) });
    openDimensionMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();

    openDimensionMenu();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();
  });

  it('菜单内 mousedown 不关闭（菜单项可点击）', () => {
    renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7), onDeleteDimension: vi.fn() });
    const menu = openDimensionMenu();
    fireEvent.mouseDown(within(menu).getByTestId('sketch-dimension-menu-delete'));
    expect(screen.getByTestId('sketch-dimension-menu')).toBeTruthy();
  });

  it('工具激活（interactive=false）时标签命中不开尺寸菜单（只开空白菜单）', () => {
    renderPicker({
      interactive: false,
      contextMenuEnabled: true,
      dimensionLabelHitTestRef: dimensionHitRef(7),
    });
    fireEvent.contextMenu(document, { clientX: DIMENSION_POINT.x, clientY: DIMENSION_POINT.y });
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();
    expect(screen.getByTestId('sketch-blank-menu')).toBeTruthy();
  });

  it('先开实体菜单再右键尺寸标签 → 仅剩尺寸菜单（互斥）', () => {
    // 实体菜单点在 (50,0)，尺寸标签命中点错开到 (60,0)，否则尺寸通道会先拦截。
    const hitAtSixty = {
      current: (point: { x: number; y: number }) => (point.x === 60 && point.y === 0 ? 7 : null),
    };
    renderPicker({ dimensionLabelHitTestRef: hitAtSixty, onDeleteDimension: vi.fn() });
    openEntityMenu();
    fireEvent.contextMenu(document, { clientX: 60, clientY: 0 });
    expect(screen.queryByTestId('sketch-entity-menu')).toBeNull();
    expect(screen.getByTestId('sketch-dimension-menu')).toBeTruthy();
  });

  it('尺寸菜单有 maxHeight/overflowY 夹紧（末项可达，D7 教训）', () => {
    renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7), onDeleteDimension: vi.fn() });
    const menu = openDimensionMenu();
    const top = Number.parseFloat(menu.style.top);
    const maxHeight = Number.parseFloat(menu.style.maxHeight);
    expect(Number.isFinite(top)).toBe(true);
    expect(Number.isFinite(maxHeight)).toBe(true);
    expect(maxHeight).toBeGreaterThanOrEqual(0);
    expect(menu.style.overflowY).toBe('auto');
  });

  it('宿主未提供 onDeleteDimension 时「删除尺寸」禁用（不提供假动作）', () => {
    renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7) });
    const menu = openDimensionMenu();
    expect((within(menu).getByTestId('sketch-dimension-menu-delete') as HTMLButtonElement).disabled).toBe(true);
  });
});

// ── W31-A（2026-11-17 live）：尺寸菜单首行 = 驱动/从动状态切换 ───────────────
const TOGGLE_CONSTRAINT_ID = 7;

/** 带目标约束的草图（driven=true 时首行应显示「更改为驱动尺寸」）。 */
function sketchWithLengthConstraint(driven?: boolean): SketchDto {
  return {
    ...SKETCH,
    constraints: [{
      kind: 'length',
      id: TOGGLE_CONSTRAINT_ID,
      refs: [11],
      value: 20,
      ...(driven === true ? { driven: true } : {}),
    }],
  };
}

describe('草图尺寸菜单驱动/从动切换（W31-A live）', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('driving 约束 → 首行「更改为从动尺寸」可点；点击回调 (id, true) 且关闭菜单', () => {
    const onToggleDimensionDriven = vi.fn();
    renderPicker({
      sketch: sketchWithLengthConstraint(),
      dimensionLabelHitTestRef: dimensionHitRef(TOGGLE_CONSTRAINT_ID),
      onToggleDimensionDriven,
    });
    const menu = openDimensionMenu();
    const row = within(menu).getByTestId('sketch-dimension-menu-driven') as HTMLButtonElement;
    expect((row.textContent ?? '').trim()).toBe('更改为从动尺寸');
    expect(row.disabled).toBe(false);
    expect(row.getAttribute('title')).toBeNull();
    fireEvent.click(row);
    expect(onToggleDimensionDriven).toHaveBeenCalledTimes(1);
    expect(onToggleDimensionDriven).toHaveBeenCalledWith(TOGGLE_CONSTRAINT_ID, true);
    expect(screen.queryByTestId('sketch-dimension-menu')).toBeNull();
  });

  it('driven 约束 → 首行「更改为驱动尺寸」可点；点击回调 (id, false)', () => {
    const onToggleDimensionDriven = vi.fn();
    renderPicker({
      sketch: sketchWithLengthConstraint(true),
      dimensionLabelHitTestRef: dimensionHitRef(TOGGLE_CONSTRAINT_ID),
      onToggleDimensionDriven,
    });
    const menu = openDimensionMenu();
    const row = within(menu).getByTestId('sketch-dimension-menu-driven') as HTMLButtonElement;
    expect((row.textContent ?? '').trim()).toBe('更改为驱动尺寸');
    expect(row.disabled).toBe(false);
    fireEvent.click(row);
    expect(onToggleDimensionDriven).toHaveBeenCalledWith(TOGGLE_CONSTRAINT_ID, false);
  });

  it('未提供回调 → 首行禁用 + 诚实原因（文案仍按约束状态）', () => {
    renderPicker({
      sketch: sketchWithLengthConstraint(true),
      dimensionLabelHitTestRef: dimensionHitRef(TOGGLE_CONSTRAINT_ID),
    });
    const menu = openDimensionMenu();
    const row = within(menu).getByTestId('sketch-dimension-menu-driven') as HTMLButtonElement;
    expect((row.textContent ?? '').trim()).toBe('更改为驱动尺寸');
    expect(row.disabled).toBe(true);
    expect(row.getAttribute('title')).toBe('该操作暂未支持');
  });

  it('canEdit=false（只读）→ 首行禁用，不伪造可点', () => {
    const onToggleDimensionDriven = vi.fn();
    renderPicker({
      canEdit: false,
      sketch: sketchWithLengthConstraint(),
      dimensionLabelHitTestRef: dimensionHitRef(TOGGLE_CONSTRAINT_ID),
      onToggleDimensionDriven,
    });
    const menu = openDimensionMenu();
    const row = within(menu).getByTestId('sketch-dimension-menu-driven') as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.getAttribute('title')).toBe('该操作暂未支持');
    fireEvent.click(row);
    expect(onToggleDimensionDriven).not.toHaveBeenCalled();
  });

  it('陈旧命中（约束 id 不在当前草图）→ 首行禁用', () => {
    const onToggleDimensionDriven = vi.fn();
    renderPicker({
      sketch: sketchWithLengthConstraint(),
      dimensionLabelHitTestRef: dimensionHitRef(999),
      onToggleDimensionDriven,
    });
    const menu = openDimensionMenu();
    const row = within(menu).getByTestId('sketch-dimension-menu-driven') as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    expect(row.getAttribute('title')).toBe('该操作暂未支持');
  });

  it('首行启用不改变行数/顺序/分隔线（W24 皮肤结构不变）', () => {
    renderPicker({
      sketch: sketchWithLengthConstraint(),
      dimensionLabelHitTestRef: dimensionHitRef(TOGGLE_CONSTRAINT_ID),
      onToggleDimensionDriven: vi.fn(),
    });
    const menu = openDimensionMenu();
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(11);
    expect(within(menu).getAllByRole('separator')).toHaveLength(7);
    expect(items.map((item) => (item.textContent ?? '').trim())).toEqual([
      '更改为从动尺寸',
      '确认 草图 1',
      '复制草图',
      '全部显示',
      '曲线/曲面分析…',
      '选择',
      '选择其他…',
      '添加评论',
      '缩放到合适大小',
      '视图垂直于草图平面',
      '删除尺寸',
    ]);
  });
});

// ── ADR-0020 S3b review P1-2：树/侧栏 Delete 不触发草图实体删除 ─────────────
describe('SketchEntityPicker P1-2：树事件让位', () => {
  it('Delete 事件目标位于侧栏/特征树 → 不调用 onDelete；body 目标仍删除', () => {
    const onDelete = vi.fn();
    renderPicker({
      selected: [{ sketchId: 'sk', entityId: 1, part: 'curve' }],
      onDelete,
    });
    const tree = document.createElement('div');
    tree.setAttribute('data-testid', 'part-studio-tree');
    const row = document.createElement('button');
    tree.appendChild(row);
    document.body.appendChild(tree);
    try {
      fireEvent.keyDown(row, { key: 'Delete' });
      expect(onDelete).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: 'Delete' });
      expect(onDelete).toHaveBeenCalledWith([{ sketchId: 'sk', entityId: 1, part: 'curve' }]);
    } finally {
      tree.remove();
    }
  });
});

// ── W41 S10（Onshape live 2026-11-18）：草图空白菜单无「复制草图」──────────
// live 证据：树行复制草图后，草图内空白菜单只多「粘贴草图图元」（已启用），
// 没有「复制草图」。空白菜单是唯一被移除的变体；尺寸菜单变体未采、保持不动。
describe('W41 S10：草图空白菜单复制/粘贴行', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    clearSketchClipboard();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSketchClipboard();
  });

  function openBlankMenu(): HTMLElement {
    fireEvent.contextMenu(document, { clientX: 300, clientY: 250 });
    return screen.getByTestId('sketch-blank-menu');
  }

  function fillClipboard(): void {
    copySketchEntities(
      [{ kind: 'line', id: 11, p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } }],
      [],
      [{ sketchId: 'sk-1', entityId: 11, part: 'curve' }],
    );
  }

  it('空白菜单不含「复制草图」；剪贴板为空时「粘贴草图图元」禁用', () => {
    renderPicker();
    const menu = openBlankMenu();
    expect(within(menu).queryByRole('menuitem', { name: '复制草图' })).toBeNull();
    const paste = within(menu).getByRole('menuitem', { name: '粘贴草图图元' }) as HTMLButtonElement;
    expect(paste.disabled).toBe(true);
    expect(paste.getAttribute('title')).toBe('该操作暂未支持');
  });

  it('剪贴板非空 → 粘贴启用；点击调用宿主 onPaste 并收合菜单', () => {
    fillClipboard();
    const { onPaste } = renderPicker({ onPaste: vi.fn() });
    const menu = openBlankMenu();
    expect(within(menu).queryByRole('menuitem', { name: '复制草图' })).toBeNull();
    const paste = within(menu).getByTestId('sketch-blank-menu-paste') as HTMLButtonElement;
    expect(paste.disabled).toBe(false);
    expect(paste.getAttribute('title')).toBeNull();
    fireEvent.click(paste);
    expect(onPaste).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sketch-blank-menu')).toBeNull();
  });

  it('尺寸菜单变体不受影响（「复制草图」行仍在，未采不动）', () => {
    renderPicker({ dimensionLabelHitTestRef: dimensionHitRef(7), onDeleteDimension: vi.fn() });
    const menu = openDimensionMenu();
    expect(within(menu).getByRole('menuitem', { name: '复制草图' })).toBeTruthy();
    expect(menu).toBeTruthy();
  });
});
