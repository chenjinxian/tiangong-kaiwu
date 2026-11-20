/**
 * ADR-0022 S2 首切片：草图槽工具接线单测（toolId/注册/ribbon capability）。
 *
 * 交互态（点击选线 → 预览 → Enter/再次点击提交）依赖 accessor/AccuSnap 运行态，
 * 由真栈 `e2e/sketch-slot.spec.ts` 覆盖；本文件不 mock 交互，避免 jsdom 假绿。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const registerMock = vi.hoisted(() => vi.fn());

vi.mock('@itwin/core-frontend', () => {
  class Tool {
    static toolId = '';
    static iconSpec = '';
    async run(): Promise<boolean> { return true; }
    async exitTool(): Promise<void> { /* noop */ }
  }
  class PrimitiveTool extends Tool {
    async onPostInstall(): Promise<void> { /* noop */ }
    async onCleanup(): Promise<void> { /* noop */ }
    initLocateElements(..._args: unknown[]): void { /* noop */ }
    requireWriteableTarget(): boolean { return true; }
  }
  return {
    Tool,
    PrimitiveTool,
    IModelApp: {
      tools: { register: registerMock },
      notifications: { outputPrompt: vi.fn(), outputMessage: vi.fn() },
      // _applyPreviewWidth 成功路径 invalidateScene 用；失败路径不触达。
      viewManager: { selectedView: undefined },
      accuSnap: undefined,
      locateManager: undefined,
    },
    EventHandled: { Yes: 1, No: 0 },
    NotifyMessageDetails: class {
      priority: number;
      briefMessage: string;
      constructor(priority: number, briefMessage: string) { this.priority = priority; this.briefMessage = briefMessage; }
    },
    OutputMessagePriority: { None: 0, Error: 10, Warning: 11, Info: 12 },
  };
});

import i18next from 'i18next';
import type { SketchDto, SketchEntityDto } from '@luban-cad/shared';
import { IModelApp, OutputMessagePriority } from '@itwin/core-frontend';
import { SketchSlotTool, registerSketchSlotTools } from '../tools/sketch/SketchSlotTool.js';
import { SKETCH_RIBBON_TOOLS } from '../ribbon/sketch-tools.js';
import { TOOL_CAPABILITIES, isGated } from '../internal/capabilities.js';
import { DEFAULT_SLOT_WIDTH, buildCircleSlotDraft, type SlotDraft } from '../tools/sketch/sketch-slot-logic.js';
import { buildLineTreeSlotDraft, lineTreeFromSelection } from '../tools/sketch/sketch-slot-tree-logic.js';
import { buildSlotDraftWithWidthFallback } from '../tools/sketch/sketch-slot-width-fallback.js';
import { getSlotPreviewDimension, resetSlotPreviewDimensionForTest } from '../tools/sketch/sketch-slot-preview-dimension.js';
import { registerSketchSystemAccessor, type UseSketchSystem } from '../hooks/useSketchSystem.js';

// ---------------------------------------------------------------------------
// 2026-11-21 review：宽度回退（finding 1）/ 预览改宽错误可见（finding 4）/
// 预览尺寸发布-清除。工具经模块级 accessor 注入假草图系统，私有方法在
// jsdom 内直测；交互相（拾取/提交）仍归真栈 e2e。
// ---------------------------------------------------------------------------

interface SlotToolInternals {
  _width: number;
  _phase: 'pick' | 'preview';
  _selectedIds?: number[];
  _draft?: SlotDraft;
  _buildInitialDraft(
    sketch: SketchDto,
    ids: readonly number[],
  ): { ok: true; draft: SlotDraft; selectedIds: number[] } | { ok: false; error: string };
  _applyPreviewWidth(value: number): { ok: boolean; error?: string };
  _publishPreview(sketch: SketchDto, draft: SlotDraft): void;
}

const internals = (tool: SketchSlotTool): SlotToolInternals => tool as unknown as SlotToolInternals;

function sketchOf(entities: SketchEntityDto[]): SketchDto {
  return {
    id: 'sk-slot-tool',
    entities,
    constraints: [],
    solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
  };
}

function installSketchSystem(sketch: SketchDto): void {
  registerSketchSystemAccessor({
    activeSketch: sketch,
    loading: false,
    applyUpdate: async () => ({ ok: true }),
    applyConstraintValue: async () => ({ ok: true }),
    refresh: async () => { /* noop */ },
  } as unknown as UseSketchSystem);
}

type OutputMessageMock = { mockClear(): void; mock: { calls: unknown[][] } };
const outputMessageMock = (): OutputMessageMock =>
  IModelApp.notifications.outputMessage as unknown as OutputMessageMock;

const lastOutputMessage = (): { priority: number; briefMessage: string } | undefined => {
  const calls = outputMessageMock().mock.calls;
  return calls[calls.length - 1]?.[0] as { priority: number; briefMessage: string } | undefined;
};

/**
 * 非宽错误样例：度 2 折点两处直通缺口 → 任意宽度均 unsupportedChain。
 * 首臂为延伸段 (10,0)→(30,0)，令该度 2 节点先于毂（3 臂、均 120°）被处理，
 * 避免毂部斜接的宽度相关判定先触发。
 */
function unsupportedTreeSketch(): SketchEntityDto[] {
  return [
    { kind: 'point', id: 1, x: 0, y: 0 }, // 毂
    { kind: 'point', id: 2, x: 10, y: 0 }, // 度 2 折点
    { kind: 'point', id: 3, x: 30, y: 0 },
    { kind: 'point', id: 4, x: -10, y: 17.32 },
    { kind: 'point', id: 5, x: -10, y: -17.32 },
    { kind: 'line', id: 11, p1: 2, p2: 3 }, // 延伸段（先入树）
    { kind: 'line', id: 12, p1: 1, p2: 2 },
    { kind: 'line', id: 13, p1: 1, p2: 4 },
    { kind: 'line', id: 14, p1: 1, p2: 5 },
  ];
}

describe('Finding 1：记忆宽度过大 → 初始构建回退默认宽度一次', () => {
  afterEach(() => {
    registerSketchSystemAccessor(undefined);
    resetSlotPreviewDimensionForTest();
  });

  it('记忆 30 + 整圆 r15 → 回退 20 成功，采用默认宽度并输出本地化 Warning', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 15 },
    ];
    const sketch = sketchOf(entities);
    installSketchSystem(sketch);
    resetSlotPreviewDimensionForTest();
    outputMessageMock().mockClear();
    const tool = new SketchSlotTool();
    internals(tool)._width = 30;

    const built = internals(tool)._buildInitialDraft(sketch, [1]);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // 本次草稿/预览/提交采用默认宽度 20（内圆 R=15−10=5 / 外圆 R=15+10=25）。
    expect(internals(tool)._width).toBe(DEFAULT_SLOT_WIDTH);
    const radii = built.draft.entities
      .filter((e): e is Extract<SketchEntityDto, { kind: 'circle' }> => e.kind === 'circle')
      .map((e) => e.radius ?? Number.NaN)
      .sort((a, b) => a - b);
    expect(radii).toEqual([5, 25]);
    // 不静默：工具输出本地化回退提示（含原宽度与新宽度）。
    const message = lastOutputMessage();
    expect(message?.priority).toBe(OutputMessagePriority.Warning);
    expect(message?.briefMessage).toBe(i18next.t('partStudio.sketch.slot.toasts.widthFallback', {
      previous: 30,
      width: DEFAULT_SLOT_WIDTH,
    }));
    expect(message?.briefMessage).toContain('30');
    expect(message?.briefMessage).toContain('20');
  });

  it('记忆 30 + 非宽错误（线树 unsupportedChain）→ 不重试、原样返回', () => {
    const entities = unsupportedTreeSketch();
    const tree = lineTreeFromSelection(entities, [11, 12, 13, 14]);
    expect(tree).toBeDefined();
    const widths: number[] = [];
    const result = buildSlotDraftWithWidthFallback(30, (width) => {
      widths.push(width);
      return buildLineTreeSlotDraft({ tree: tree!, width, startId: 100 });
    });
    expect(result).toEqual({ ok: false, error: 'unsupportedChain' });
    expect(widths).toEqual([30]); // 仅一次构建，无默认宽度重试
  });
});

describe('Finding 4：预览改宽失败 → 回滚宽度并 Warning 输出本地化错误', () => {
  afterEach(() => {
    registerSketchSystemAccessor(undefined);
    resetSlotPreviewDimensionForTest();
  });

  it('整圆 r20 预览改宽 45 → 返回 degenerateRadius、宽度回滚 20、通知可见', () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 20 },
    ];
    const sketch = sketchOf(entities);
    installSketchSystem(sketch);
    resetSlotPreviewDimensionForTest();
    outputMessageMock().mockClear();
    const tool = new SketchSlotTool();
    internals(tool)._selectedIds = [1];
    internals(tool)._width = 20;

    const result = internals(tool)._applyPreviewWidth(45);
    const expectedError = i18next.t('partStudio.sketch.slot.toasts.degenerateRadius');
    expect(result).toEqual({ ok: false, error: expectedError });
    expect(internals(tool)._width).toBe(20); // 回滚
    expect(getSlotPreviewDimension()).toBeUndefined(); // 未发布新预览尺寸
    expect(lastOutputMessage()).toMatchObject({
      priority: OutputMessagePriority.Warning,
      briefMessage: expectedError,
    });
  });
});

describe('预览尺寸 store：发布后 onResetButtonUp / onCleanup 清除', () => {
  afterEach(() => {
    registerSketchSystemAccessor(undefined);
    resetSlotPreviewDimensionForTest();
  });

  it('发布 → 右键重置清除；再次发布 → cleanup 清除（不残留可编辑哨兵标注）', async () => {
    const entities: SketchEntityDto[] = [
      { kind: 'circle', id: 1, center: { x: 0, y: 0 }, radius: 20 },
    ];
    const sketch = sketchOf(entities);
    installSketchSystem(sketch);
    resetSlotPreviewDimensionForTest();
    const built = buildCircleSlotDraft({
      circle: entities[0] as SketchEntityDto & { kind: 'circle' },
      entities,
      width: 20,
      startId: 100,
    });
    if (!built.ok) throw new Error(`unexpected ${built.error}`);
    const tool = new SketchSlotTool();
    const view = internals(tool);
    view._draft = built.draft;
    view._selectedIds = [1];
    view._phase = 'preview';

    view._publishPreview(sketch, built.draft);
    expect(getSlotPreviewDimension()).toBeDefined();

    await tool.onResetButtonUp({} as never);
    expect(getSlotPreviewDimension()).toBeUndefined();
    expect(view._phase).toBe('pick');

    view._draft = built.draft;
    view._selectedIds = [1];
    view._phase = 'preview';
    view._publishPreview(sketch, built.draft);
    expect(getSlotPreviewDimension()).toBeDefined();

    await tool.onCleanup();
    expect(getSlotPreviewDimension()).toBeUndefined();
  });
});

describe('SketchSlotTool 接线（ADR-0022 S2 首切片）', () => {
  it('toolId=Sketch.Slot；偏移 ▾ 第二项 sketchSlot 且能力 full', () => {
    expect(SketchSlotTool.toolId).toBe('Sketch.Slot');
    const offset = SKETCH_RIBBON_TOOLS.find((t) => t.id === 'Sketch.Offset');
    expect(offset).toBeDefined();
    const slot = offset?.dropdownItems?.find((item) => item.id === 'sketchSlot');
    expect(slot).toBeDefined();
    expect(slot?.capability).toBe('sketchSlot');
    expect(TOOL_CAPABILITIES.sketchSlot).toBe('full');
    expect(isGated('sketchSlot')).toBe(false);
  });

  it('registerSketchSlotTools 幂等（只注册一次）', () => {
    registerMock.mockClear();
    registerSketchSlotTools();
    registerSketchSlotTools();
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith(SketchSlotTool);
  });
});
