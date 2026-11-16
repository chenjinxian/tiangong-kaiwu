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

function renderPicker(): { onFinishSketch: ReturnType<typeof vi.fn> } {
  const onFinishSketch = vi.fn();
  render(React.createElement(SketchEntityPicker, {
    viewport: makeSketchViewport(),
    sketch: SKETCH,
    selected: [],
    onSelectionChange: vi.fn(),
    sketchName: '草图 1',
    onFinishSketch,
  }));
  return { onFinishSketch };
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
    expect((within(menu).getByRole('menuitem', { name: '变换草图图元' }) as HTMLButtonElement).disabled).toBe(true);
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
});
