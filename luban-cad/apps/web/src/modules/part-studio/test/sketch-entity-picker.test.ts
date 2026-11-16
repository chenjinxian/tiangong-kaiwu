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
import type { SketchPickerGeometry } from '../internal/sketch-entity-picker.js';
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
  dimensionLabelHitTestRef?: React.MutableRefObject<((point: { x: number; y: number }) => number | null) | null>;
  onDeleteDimension?: (constraintId: number) => void | Promise<void>;
} = {}): {
  onFinishSketch: ReturnType<typeof vi.fn>;
  onTransform: ReturnType<typeof vi.fn>;
  onSelectionChange: ReturnType<typeof vi.fn>;
} {
  const onFinishSketch = vi.fn();
  const onTransform = vi.fn();
  const onSelectionChange = vi.fn();
  render(React.createElement(SketchEntityPicker, {
    viewport: makeSketchViewport(),
    sketch: SKETCH,
    selected: [],
    onSelectionChange,
    sketchName: '草图 1',
    onFinishSketch,
    ...(opts.interactive !== undefined ? { interactive: opts.interactive } : {}),
    ...(opts.contextMenuEnabled !== undefined ? { contextMenuEnabled: opts.contextMenuEnabled } : {}),
    ...(opts.dimensionLabelHitTestRef ? { dimensionLabelHitTestRef: opts.dimensionLabelHitTestRef } : {}),
    ...(opts.onDeleteDimension ? { onDeleteDimension: opts.onDeleteDimension } : {}),
    // FIX-2：缺省接线；withTransform=false 模拟只读/不可变换宿主（不下传）。
    ...(opts.withTransform === false ? {} : { onTransform }),
  }));
  return { onFinishSketch, onTransform, onSelectionChange };
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
// live：右键尺寸数值标签 = 草图空白菜单 + 首行「更改为驱动尺寸」（产品不表示
// 驱动尺寸 → 诚实禁用）+ 末行（分隔线后）「删除尺寸」（宿主既有约束删除路径）。
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

  it('命中标签 → 尺寸菜单：首项驱动禁用（诚实原因）、末项删除；不弹实体或空白菜单', () => {
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
    // 复用草图空白菜单行：确认 草图 N 紧随首行，缩放/视图项保留原顺序与文案。
    expect(items[1]!.textContent).toBe('确认 草图 1');
    expect(items.map((item) => (item.textContent ?? '').trim())).toEqual([
      '更改为驱动尺寸',
      '确认 草图 1',
      '复制草图',
      '全部显示',
      '曲线/曲面分析…',
      '选择›',
      '选择其他…',
      '添加评论',
      '缩放到合适大小',
      '视图垂直于草图平面',
      '删除尺寸',
    ]);
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
