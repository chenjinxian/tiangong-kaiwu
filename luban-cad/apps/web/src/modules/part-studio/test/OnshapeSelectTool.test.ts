import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BeButtonEvent,
  BeModifierKeys,
  CoordSource,
  IModelApp,
} from '@itwin/core-frontend';
import { Point3d } from '@itwin/core-geometry';
import { SubEntityType } from '@itwin/editor-common';
import type { SubEntityLocationProps } from '@itwin/editor-common';
import { isSameSubEntity } from '@itwin/editor-frontend';
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

  public exposeWantAdditionalElements(): boolean { return this.wantAdditionalElements; }
  public exposeShouldEnableLocate(): boolean { return this.shouldEnableLocate; }
  public exposeWant(type: SubEntityType): boolean { return this.wantSubEntityType(type); }
  public exposeOrder(hits: SubEntityLocationProps[], ev: BeButtonEvent): SubEntityLocationProps[] {
    return this.orderHits(hits, ev);
  }
  public async callDoLocate(ev: BeButtonEvent, newSearch = true): Promise<boolean> {
    return this.doLocateSubEntity(ev, newSearch);
  }

  protected override getCurrentElement(): string | undefined { return this.nextElement; }
  protected override async doPickSubEntities(): Promise<SubEntityLocationProps[] | undefined> {
    return this.nextHits;
  }
  protected override async addSubEntity(id: string, next: SubEntityLocationProps): Promise<void> {
    this.added.push({ id, hit: next });
    this._acceptedSubEntities.push({ props: next.subEntity } as never);
  }
  protected override async removeSubEntity(id: string, next?: SubEntityLocationProps): Promise<void> {
    this.removed.push({ id, hit: next });
    if (next)
      this._acceptedSubEntities = this._acceptedSubEntities.filter((entry) => !isSameSubEntity(entry.props, next.subEntity));
  }
  public override async clearSelection(): Promise<void> {
    this.clears += 1;
    this._acceptedSubEntities = [];
  }
}

function makeTool(): TestableTool {
  return new TestableTool({
    connectionKey: 'imodel-key',
    onSelectionChanged: vi.fn(),
    onError: vi.fn(),
  });
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
    const tool = makeTool();
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
    const tool = makeTool();
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
    const tool = makeTool();
    const ev = event(new Point3d(20, 20, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Vertex, 5, 5, 1), hit(SubEntityType.Edge, 15, 20, 2), hit(SubEntityType.Face, 20, 20, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([SubEntityType.Edge, SubEntityType.Face]);
  });

  it('边 >6px 被滤掉，面兜底', () => {
    const tool = makeTool();
    const ev = event(new Point3d(20, 20, 0));
    const ordered = tool.exposeOrder(
      [hit(SubEntityType.Edge, 13, 20, 2), hit(SubEntityType.Face, 20, 20, 3)],
      ev,
    );
    expect(ordered.map((entry) => entry.subEntity.type)).toEqual([SubEntityType.Face]);
  });
});

describe('OnshapeSelectTool：点击语义', () => {
  it('普通单击替换：先清空再 add', async () => {
    const tool = makeTool();
    tool.nextElement = '0x1';
    tool.nextHits = [hit(SubEntityType.Face, 0, 0, 7)];
    (tool as unknown as { _acceptedSubEntities: unknown[] })._acceptedSubEntities = [
      { props: { type: SubEntityType.Edge, id: 9 } },
    ];
    expect(await tool.callDoLocate(event(new Point3d()))).toBe(true);
    expect(tool.clears).toBe(1);
    expect(tool.added).toHaveLength(1);
  });

  it('普通单击已选中的唯一项：保持选中', async () => {
    const tool = makeTool();
    tool.nextElement = '0x1';
    const face = hit(SubEntityType.Face, 0, 0, 7);
    tool.nextHits = [face];
    (tool as unknown as { _acceptedSubEntities: unknown[] })._acceptedSubEntities = [{ props: face.subEntity }];
    await tool.callDoLocate(event(new Point3d()));
    expect(tool.clears).toBe(0);
    expect(tool.added).toHaveLength(0);
  });

  it('Ctrl 单击已选项：remove', async () => {
    const tool = makeTool();
    tool.nextElement = '0x1';
    const face = hit(SubEntityType.Face, 0, 0, 7);
    tool.nextHits = [face];
    (tool as unknown as { _acceptedSubEntities: unknown[] })._acceptedSubEntities = [{ props: face.subEntity }];
    await tool.callDoLocate(event(new Point3d(), true));
    expect(tool.removed).toHaveLength(1);
    expect(tool.added).toHaveLength(0);
  });

  it('空白单击清空选择', async () => {
    const tool = makeTool();
    tool.nextElement = undefined;
    expect(await tool.callDoLocate(event(new Point3d()))).toBe(false);
    expect(tool.clears).toBe(1);
  });
});
