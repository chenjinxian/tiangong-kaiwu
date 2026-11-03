import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BeButtonEvent,
  BeModifierKeys,
  CoordSource,
  IModelApp,
} from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { SubEntityType } from '@itwin/editor-common';
import type { SubEntityLocationProps, SubEntityProps } from '@itwin/editor-common';
import type { SubEntityData } from '@itwin/editor-frontend';
import type { CanvasSelection } from '../types.js';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => ({ resolveFaceRef: vi.fn(), resolveEdgeRef: vi.fn() }),
  },
}));

function hit(type: SubEntityType, x: number, y: number, id = 1): SubEntityLocationProps {
  return {
    subEntity: { type, id },
    point: new Point3d(x, y, 0).toJSON(),
  } as SubEntityLocationProps;
}

function viewport(): never {
  return {
    worldToView: (p: Point3d) => p.clone(),
  } as never;
}

function event(viewPoint: Point3d, control = false): BeButtonEvent {
  const ev = new BeButtonEvent();
  ev.init({
    viewport: viewport() as never,
    viewPoint,
    point: new Point3d(),
    coordsFrom: CoordSource.ElemSnap,
    keyModifiers: control ? BeModifierKeys.Control : 0,
  });
  return ev;
}

class TestableTool extends OnshapeSelectTool {
  public nextElement: string | undefined;
  public nextHits: SubEntityLocationProps[] | undefined;
  public added: Array<{ id: string; hit: SubEntityLocationProps }> = [];
  public removed: Array<{ id: string; hit?: SubEntityLocationProps }> = [];
  public clears = 0;
  /** 非空时阻塞 resolveSelection——用于模拟清空与异步 resolve 的竞态。 */
  public resolveGate?: Promise<void>;
  private readonly _graphics: Array<{ owner: string; cleanupGraphic: ReturnType<typeof vi.fn> }> = [];

  public exposeWantAdditionalElements(): boolean { return this.wantAdditionalElements; }
  public exposeShouldEnableLocate(): boolean { return this.shouldEnableLocate; }
  public exposeWant(type: SubEntityType): boolean { return this.wantSubEntityType(type); }
  public exposeOrder(hits: SubEntityLocationProps[], ev: BeButtonEvent): SubEntityLocationProps[] {
    return this.orderHits(hits, ev);
  }
  public callDoLocate(ev: BeButtonEvent, newSearch = true): Promise<boolean> {
    return this.doLocateSubEntity(ev, newSearch);
  }
  public callPick(id: string, ev: BeButtonEvent): Promise<SubEntityLocationProps[] | undefined> {
    return this.doPickSubEntities(id, ev);
  }
  public callAdd(id: string, next: SubEntityLocationProps): Promise<void> {
    return this.addSubEntity(id, next);
  }
  public acceptedKeysView(): string[] { return [...this._acceptedKeys]; }
  public acceptedCount(): number { return this._acceptedSubEntities.length; }
  public selectedIdsView(): string[] {
    return this._selectedKeys.map((key) => this._selected.get(key)?.id ?? '');
  }
  public cleanupCalls(owner: string): number {
    return this._graphics
      .filter((graphic) => graphic.owner === owner)
      .reduce((sum, graphic) => sum + graphic.cleanupGraphic.mock.calls.length, 0);
  }

  protected override getCurrentElement(): string | undefined { return this.nextElement; }

  /** 只替换后端拾取面：保留生产 doPickSubEntities 的过滤/排序空集语义。 */
  protected override async doPickSubEntities(
    _id: string,
    ev: BeButtonEvent,
  ): Promise<SubEntityLocationProps[] | undefined> {
    return this.applyHoverPriority(this.nextHits, ev);
  }

  /** 单测替身高亮数据：无真实几何缓存，hasGraphic 恒真并记录 cleanup 次数。 */
  protected override async createSubEntityData(id: string, next: SubEntityLocationProps): Promise<SubEntityData> {
    const cleanupGraphic = vi.fn();
    this._graphics.push({ owner: id, cleanupGraphic });
    return { props: next.subEntity, hasGraphic: true, cleanupGraphic } as unknown as SubEntityData;
  }

  /** 绕过 RPC：返回含 owner 的确定性选择条目（生产 resolve 管道归 Task 4）。 */
  protected override async resolveSelection(
    owner: string,
    subEntity: SubEntityProps,
  ): Promise<CanvasSelection | undefined> {
    if (this.resolveGate)
      await this.resolveGate;

    const kind = subEntity.type === SubEntityType.Face
      ? 'face' as const
      : subEntity.type === SubEntityType.Edge
        ? 'edge' as const
        : 'vertex' as const;

    return {
      kind,
      id: `${kind}:${owner}:${subEntity.id}`,
      ownerBodyKey: owner,
      cacheId: subEntity.id,
      label: kind,
    };
  }

  protected override async addSubEntity(id: string, next: SubEntityLocationProps): Promise<void> {
    this.added.push({ id, hit: next });
    return super.addSubEntity(id, next);
  }

  protected override async removeSubEntity(id: string, next?: SubEntityLocationProps): Promise<void> {
    this.removed.push({ id, hit: next });
    return super.removeSubEntity(id, next);
  }

  public override async clearSelection(): Promise<void> {
    this.clears += 1;
    return super.clearSelection();
  }
}

function makeTool(): { tool: TestableTool; onSelectionChanged: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn> } {
  const onSelectionChanged = vi.fn();
  const onError = vi.fn();
  const tool = new TestableTool({
    connectionKey: 'imodel-key',
    onSelectionChanged,
    onError,
  });
  return { tool, onSelectionChanged, onError };
}

beforeEach(() => {
  // IModelApp 的 viewManager/toolAdmin/accuSnap 是 getter（无 setter）——只能替换静态字段。
  (IModelApp as unknown as { _viewManager: unknown })._viewManager = {
    invalidateDecorationsAllViews: vi.fn(),
  };
  (IModelApp as unknown as { _toolAdmin: unknown })._toolAdmin = {
    setAdjustedDataPoint: vi.fn(),
  };
  (IModelApp as unknown as { _accuSnap: unknown })._accuSnap = { currHit: undefined };
});

describe('OnshapeSelectTool：全类型与无 agenda 定位', () => {
  it('wantAdditionalElements=false、shouldEnableLocate=true、面/边/点全收', () => {
    const { tool } = makeTool();
    expect(tool.exposeWantAdditionalElements()).toBe(false);
    expect(tool.exposeShouldEnableLocate()).toBe(true);
    expect(tool.exposeWant(SubEntityType.Face)).toBe(true);
    expect(tool.exposeWant(SubEntityType.Edge)).toBe(true);
    expect(tool.exposeWant(SubEntityType.Vertex)).toBe(true);
  });

  it('getCurrentElement 使用 accuSnap.currHit（跨 body，不看 agenda）', () => {
    (IModelApp as unknown as { _accuSnap: unknown })._accuSnap = {
      currHit: { isElementHit: true, sourceId: '0xB' },
    };
    const tool = new OnshapeSelectTool({
      connectionKey: 'imodel-key', onSelectionChanged: vi.fn(), onError: vi.fn(),
    });
    const current = (tool as unknown as { getCurrentElement(): string | undefined }).getCurrentElement();
    expect(current).toBe('0xB');
  });
});

describe('OnshapeSelectTool：悬停优先级与阈值', () => {
  it('顶点 9px 优先于边 1px（顶点>边>面）', () => {
    const { tool } = makeTool();
    const ev = event(new Point3d(5, 0, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Edge, 4, 0, 2), hit(SubEntityType.Vertex, 0, 4, 1), hit(SubEntityType.Face, 0, 0, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([
      SubEntityType.Vertex, SubEntityType.Edge, SubEntityType.Face,
    ]);
  });

  it('顶点 >10px 被滤掉，边 5px 优先', () => {
    const { tool } = makeTool();
    const ev = event(new Point3d(20, 20, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Vertex, 5, 5, 1), hit(SubEntityType.Edge, 15, 20, 2), hit(SubEntityType.Face, 20, 20, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([SubEntityType.Edge, SubEntityType.Face]);
  });

  it('边 >6px 被滤掉，面兜底', () => {
    const { tool } = makeTool();
    const ev = event(new Point3d(20, 20, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Edge, 13, 20, 2), hit(SubEntityType.Face, 20, 20, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([SubEntityType.Face]);
  });

  it('边 7px / 顶点 11px 全部超阈值时，doPickSubEntities 返回 undefined（不是 []）', async () => {
    const { tool } = makeTool();
    const ev = event(new Point3d(20, 20, 0));

    tool.nextHits = [hit(SubEntityType.Edge, 13, 20, 2)];
    await expect(tool.callPick('0x1', ev)).resolves.toBeUndefined();

    tool.nextHits = [hit(SubEntityType.Vertex, 31, 20, 1)];
    await expect(tool.callPick('0x1', ev)).resolves.toBeUndefined();
  });
});

describe('OnshapeSelectTool：点击语义', () => {
  it('普通单击替换：先清空再 add', async () => {
    const { tool } = makeTool();
    await tool.callAdd('0xA', hit(SubEntityType.Face, 0, 0, 7));
    tool.clears = 0;
    tool.added.length = 0;

    tool.nextElement = '0xB';
    tool.nextHits = [hit(SubEntityType.Face, 0, 0, 7)];
    expect(await tool.callDoLocate(event(new Point3d()))).toBe(true);

    expect(tool.clears).toBe(1);
    expect(tool.added).toHaveLength(1);
    expect(tool.selectedIdsView()).toEqual(['face:0xB:7']);
  });

  it('普通单击已选中的唯一项：保持选中', async () => {
    const { tool } = makeTool();
    await tool.callAdd('0xA', hit(SubEntityType.Face, 0, 0, 7));
    tool.clears = 0;
    tool.added.length = 0;

    tool.nextElement = '0xA';
    tool.nextHits = [hit(SubEntityType.Face, 0, 0, 7)];
    await tool.callDoLocate(event(new Point3d()));

    expect(tool.clears).toBe(0);
    expect(tool.added).toHaveLength(0);
    expect(tool.selectedIdsView()).toEqual(['face:0xA:7']);
  });

  it('Ctrl 单击已选项：remove', async () => {
    const { tool } = makeTool();
    await tool.callAdd('0xA', hit(SubEntityType.Face, 0, 0, 7));
    tool.added.length = 0;
    tool.removed.length = 0;

    tool.nextElement = '0xA';
    tool.nextHits = [hit(SubEntityType.Face, 0, 0, 7)];
    await tool.callDoLocate(event(new Point3d(), true));

    expect(tool.removed).toHaveLength(1);
    expect(tool.added).toHaveLength(0);
    expect(tool.selectedIdsView()).toEqual([]);
    expect(tool.acceptedKeysView()).toEqual([]);
  });

  it('空白单击清空选择', async () => {
    const { tool } = makeTool();
    tool.nextElement = undefined;
    expect(await tool.callDoLocate(event(new Point3d()))).toBe(false);
    expect(tool.clears).toBe(1);
  });
});

describe('OnshapeSelectTool：跨 body 身份', () => {
  it('同一 cache id 分属 A/B：Ctrl 移除 B 保留 A（高亮+选择映射）', async () => {
    const { tool } = makeTool();
    const face = hit(SubEntityType.Face, 0, 0, 7);
    await tool.callAdd('0xA', face);
    await tool.callAdd('0xB', face);

    expect(tool.selectedIdsView()).toEqual(['face:0xA:7', 'face:0xB:7']);
    expect(tool.acceptedKeysView()).toEqual(['0xA:0:7:0', '0xB:0:7:0']);

    tool.nextElement = '0xB';
    tool.nextHits = [hit(SubEntityType.Face, 0, 0, 7)];
    expect(await tool.callDoLocate(event(new Point3d(), true))).toBe(true);

    expect(tool.selectedIdsView()).toEqual(['face:0xA:7']);
    expect(tool.acceptedKeysView()).toEqual(['0xA:0:7:0']);
    expect(tool.cleanupCalls('0xA')).toBe(0);
    expect(tool.cleanupCalls('0xB')).toBe(1);
  });

  it('A 选中时普通单击 B 的同一 id：替换 A（不回退为 no-op）', async () => {
    const { tool } = makeTool();
    await tool.callAdd('0xA', hit(SubEntityType.Face, 0, 0, 7));
    tool.clears = 0;
    tool.added.length = 0;

    tool.nextElement = '0xB';
    tool.nextHits = [hit(SubEntityType.Face, 0, 0, 7)];
    expect(await tool.callDoLocate(event(new Point3d()))).toBe(true);

    expect(tool.clears).toBe(1);
    expect(tool.added).toHaveLength(1);
    expect(tool.selectedIdsView()).toEqual(['face:0xB:7']);
    expect(tool.acceptedKeysView()).toEqual(['0xB:0:7:0']);
    expect(tool.cleanupCalls('0xA')).toBe(1);
  });
});

describe('OnshapeSelectTool：异步 resolve 竞态', () => {
  it('resolve 期间 clearSelection：完成后不回插选择', async () => {
    const { tool } = makeTool();
    let release!: () => void;
    tool.resolveGate = new Promise<void>((resolve) => { release = resolve; });

    const pending = tool.callAdd('0xA', hit(SubEntityType.Face, 0, 0, 7));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tool.acceptedCount()).toBe(1);

    await tool.clearSelection();
    expect(tool.acceptedCount()).toBe(0);

    release();
    await pending;

    expect(tool.selectedIdsView()).toEqual([]);
    expect(tool.acceptedKeysView()).toEqual([]);
    expect(tool.cleanupCalls('0xA')).toBe(1);
  });
});
