/**
 * S2v 槽预览宽度尺寸（live 2026-11-20 S2t3–S2t7）：
 * 草稿宽度约束 → 哨兵 id + 世界系标注（与提交后同布局家族）+ 工具/编辑器桥。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { buildCircleSlotDraft, buildLineSlotDraft } from '../tools/sketch/sketch-slot-logic.js';
import {
  SLOT_PREVIEW_DIMENSION_ID,
  buildSlotPreviewDimension,
  clearSlotPreviewDimension,
  commitSlotPreviewWidth,
  getSlotPreviewDimension,
  getSlotPreviewWidthDefault,
  rememberSlotPreviewWidth,
  resetSlotPreviewDimensionForTest,
  setSlotPreviewDimension,
  subscribeSlotPreviewDimension,
} from '../tools/sketch/sketch-slot-preview-dimension.js';

function sketchOf(entities: SketchEntityDto[]): SketchDto {
  return {
    id: 'sk-preview',
    entities,
    constraints: [],
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
  };
}

afterEach(() => resetSlotPreviewDimensionForTest());

describe('buildSlotPreviewDimension', () => {
  const lineEntities: SketchEntityDto[] = [
    { kind: 'point', id: 1, x: 0, y: 0 },
    { kind: 'point', id: 2, x: 100, y: 0 },
    { kind: 'line', id: 3, p1: 1, p2: 2 },
  ];

  it('单线槽：取直径约束，哨兵 id + ⌀ 标注（宽度 20→30 文本跟随）', () => {
    const built = buildLineSlotDraft({
      line: lineEntities[2] as SketchEntityDto & { kind: 'line' },
      entities: lineEntities,
      width: 20,
      startId: 100,
    });
    if (!built.ok) throw new Error(`unexpected ${built.error}`);
    const sketch = sketchOf(lineEntities);
    const preview20 = buildSlotPreviewDimension(sketch, built.draft, 20);
    expect(preview20?.constraint).toMatchObject({
      id: SLOT_PREVIEW_DIMENSION_ID,
      kind: 'diameter',
      value: 20,
    });
    expect(preview20?.annotation.id).toBe(`dimension-${SLOT_PREVIEW_DIMENSION_ID}`);
    expect(preview20?.annotation.text).toBe('⌀20');
    const preview30 = buildSlotPreviewDimension(sketch, built.draft, 30);
    expect(preview30?.annotation.text).toBe('⌀30');
  });

  it('整圆槽：slotWidth 约束同样投影预览标注', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 30 },
    ];
    const built = buildCircleSlotDraft({
      circle: entities[0] as SketchEntityDto & { kind: 'circle' },
      entities,
      width: 20,
      startId: 100,
    });
    if (!built.ok) throw new Error(`unexpected ${built.error}`);
    const preview = buildSlotPreviewDimension(sketchOf(entities), built.draft, 20);
    expect(preview?.constraint).toMatchObject({ id: SLOT_PREVIEW_DIMENSION_ID, kind: 'slotWidth', value: 20 });
    expect(preview?.annotation.text).toContain('20');
  });

  it('无宽度驱动约束 → undefined（工具不发布预览尺寸）', () => {
    const emptyDraft = {
      entities: [], constraints: [], nextId: 1, capArcIds: [], boundaryLineIds: [],
    } as never;
    expect(buildSlotPreviewDimension(sketchOf([]), emptyDraft, 20)).toBeUndefined();
  });
});

describe('预览宽度 store（工具 ↔ 编辑器桥）', () => {
  it('set/commit/clear：提交回调收到数值并返回结果；清除后拒绝', () => {
    const handler = vi.fn(() => ({ ok: true }));
    const listener = vi.fn();
    const unsubscribe = subscribeSlotPreviewDimension(listener);
    const preview = {
      constraint: { kind: 'diameter', id: SLOT_PREVIEW_DIMENSION_ID, refs: [], value: 20 },
      annotation: { kind: 'radial', id: `dimension-${SLOT_PREVIEW_DIMENSION_ID}`, text: '⌀20' },
    } as never;
    setSlotPreviewDimension(preview, handler);
    expect(getSlotPreviewDimension()).toBe(preview);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(commitSlotPreviewWidth(30)).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledWith(30);
    clearSlotPreviewDimension();
    expect(getSlotPreviewDimension()).toBeUndefined();
    expect(commitSlotPreviewWidth(30)).toMatchObject({ ok: false });
    unsubscribe();
  });

  it('会话级默认粘滞（live：设 30 后下一次预览默认 30；非法值忽略）', () => {
    expect(getSlotPreviewWidthDefault()).toBe(20);
    rememberSlotPreviewWidth(30);
    expect(getSlotPreviewWidthDefault()).toBe(30);
    rememberSlotPreviewWidth(-1);
    rememberSlotPreviewWidth(Number.NaN);
    expect(getSlotPreviewWidthDefault()).toBe(30);
  });
});
