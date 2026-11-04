/**
 * 2026-11-03：子实体工具命令收口与几何按需读取的基座契约。
 * editor 包 vitest 是 node 环境：core-frontend 按 editor 工具测试口径
 * 模块级 mock（只保留被测基类会触碰的成员）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@itwin/core-frontend', () => ({
  AccuDrawHintBuilder: class {},
  BeButtonEvent: class {},
  BeModifierKeys: { Control: 1 },
  CoordinateLockOverrides: {},
  CoordSource: { ElemSnap: 1 },
  CoreTools: { translate: (s: string) => s },
  DecorateContext: class {},
  DynamicsContext: class {},
  ElementSetTool: class {
    public agenda = { isEmpty: true, elements: [] as string[] };
    public iModel = { key: 'imodel-key' };
    public async onCleanup(): Promise<void> {}
  },
  EventHandled: { Yes: 1, No: 2 },
  FeatureOverrideProvider: class {},
  FeatureSymbology: { Overrides: class {} },
  GraphicBranch: class {},
  GraphicBranchOptions: class {},
  GraphicType: { Scene: 1, WorldOverlay: 2 },
  HitDetail: class {},
  IModelApp: { renderSystem: {}, viewManager: {}, notifications: {} },
  IModelConnection: class {},
  InputSource: { Touch: 1 },
  LocateResponse: class {},
  readElementGraphics: vi.fn(),
  RenderGraphicOwner: class {},
  SelectionMethod: {},
  SelectionSet: class {},
  ToolAssistance: {},
  ToolAssistanceImage: {},
  ToolAssistanceInputMethod: {},
  ToolAssistanceInstruction: class {},
  ToolAssistanceSection: class {},
  Viewport: class {},
}));

vi.mock('../EditTool', () => ({ EditTools: { finishCommand: vi.fn() } }));
vi.mock('../EditToolIpc', () => ({ solidModelingIpc: {} }));
vi.mock('../CreateElementTool', () => ({ computeChordToleranceFromPoint: () => 0 }));

import { EditTools } from '../EditTool';
import { ElementGeometryCacheTool } from '../ElementGeometryTool';

class TestTool extends ElementGeometryCacheTool {
  protected override allowView(): boolean { return true; }
  public markStarted(): void {
    (this as unknown as { _startedCmd?: string })._startedCmd = 'cmd';
    (this as unknown as { _checkedIds: Map<string, boolean> })._checkedIds.set('0x1', true);
  }
  public async release(): Promise<void> { return this.finishCommandIfStarted(); }
  public geometryWanted(): boolean { return this.wantSubEntityGeometry; }
  public override async onRestartTool(): Promise<void> { /* not exercised in this unit test */ }
  protected override async clearElementGeometryCache(): Promise<void> { /* no IPC in this unit test */ }
}

describe('ElementGeometryCacheTool', () => {
  beforeEach(() => {
    // 模块级 mock 的 finishCommand 本身就是 vi.fn：spyOn 会复用同一实例，
    // restoreAllMocks 不清其调用史——再 clear 一次保证用例间隔离。
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('finishCommandIfStarted：调用 finishCommand、复位命令与 checkedIds', async () => {
    const finish = vi.spyOn(EditTools, 'finishCommand').mockResolvedValue('');
    const tool = new TestTool();
    tool.markStarted();

    await tool.release();

    expect(finish).toHaveBeenCalledTimes(1);
    expect((tool as unknown as { _startedCmd?: string })._startedCmd).toBeUndefined();
    expect((tool as unknown as { _checkedIds: Map<string, boolean> })._checkedIds.size).toBe(0);
  });

  it('finishCommandIfStarted：未启动命令时零调用', async () => {
    const finish = vi.spyOn(EditTools, 'finishCommand').mockResolvedValue('');
    const tool = new TestTool();
    await tool.release();
    expect(finish).not.toHaveBeenCalled();
  });

  it('wantSubEntityGeometry 默认 false（只有需要世界几何的工具显式打开）', () => {
    expect(new TestTool().geometryWanted()).toBe(false);
  });
});
