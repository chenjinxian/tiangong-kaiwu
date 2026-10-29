// DraftFacesTool（web M4 Task 3 移植验收）——拔模面工具行为子集：
//  1) toolId/iconSpec/namespace 钉死（Agent 复用规约：同 toolId 禁第二套）；
//  2) 面过滤：wantSubEntityType 只收 Face + geometryCacheFilter 面/实体通道；
//  3) 右键完成选择 → startEditCommand('solidModeling', key, 'draftFaces', payload)
//     + onComplete + exitTool；空选择 → onCancel + exitTool、零 RPC；
//  4) 拔模角参数链（缺省 5° / setOptions / setDraftAngle + 提示重发）；
//  5) RPC 失败 → notifications 错误可见、不外抛（工具内消化）。
// mock 口径：core-frontend/editor-frontend(LocateSubEntityTool 基类)/@luban-cad/shared
// 模块级 mock；editor-common 取真实模块（SubEntityType 枚举真值参与过滤断言）。
// 2026-10-22 随 editor 模块收编迁入本包 src/luban/modeling/test/：被测件与
// LocateSubEntityTool 基类现同为包内文件——vi.mock 改按包内路径（
// ../../../ElementGeometryTool，与被测基类的 '../ElementGeometryTool' 相对导入
// 解析到同一文件）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exitToolMock: vi.fn().mockResolvedValue(undefined),
  startEditCommandMock: vi.fn().mockResolvedValue(undefined),
  getClientMock: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    notifications: { outputMessage: vi.fn(), outputPrompt: vi.fn() },
    // selectedView 由用例按需改写（缺省 undefined → 无激活视口错误路径）。
    viewManager: { selectedView: undefined as unknown },
  },
  EventHandled: { Yes: 1, No: 2 },
  OutputMessagePriority: { Error: 3, Info: 1, Success: 0 },
  NotifyMessageDetails: class {
    public constructor(public priority: number, public briefMessage: string) {}
  },
}));

vi.mock('../../../ElementGeometryTool', () => ({
  LocateSubEntityTool: class {
    public async run(): Promise<boolean> { return true; }
    public async exitTool(): Promise<void> { return mocks.exitToolMock(); }
    public async onPostInstall(): Promise<void> { /* 桩 */ }
    public async onCleanup(): Promise<void> { /* 桩 */ }
    public initLocateElements(): void { /* 桩 */ }
    public async onDataButtonDown(): Promise<number> { return 2; }
    public async onResetButtonUp(): Promise<number> { return 2; }
    protected async addSubEntity(): Promise<void> { /* 桩 */ }
    protected async removeSubEntity(): Promise<void> { /* 桩 */ }
    protected setupAndPromptForNextAction(): void { /* 桩 */ }
  },
}));

vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: { getClient: mocks.getClientMock },
}));

import { IModelApp } from '@itwin/core-frontend';
import { SubEntityType } from '@itwin/editor-common';
import { DraftFacesTool } from '../DraftFacesTool';

/** 造工具实例并挂好选项（onComplete/onCancel 可观测）。 */
function makeTool(options?: { draftAngle?: number; onComplete?: (id: string, entities: unknown[]) => void; onCancel?: () => void }): DraftFacesTool {
  const tool = new DraftFacesTool();
  tool.setOptions({
    draftAngle: options?.draftAngle ?? 5,
    onComplete: options?.onComplete,
    onCancel: options?.onCancel,
  });
  return tool;
}

/** 挂激活视口 + RPC 客户端（briefcase 连接真判据）。 */
function attachViewport(): void {
  (IModelApp.viewManager as { selectedView: unknown }).selectedView = {
    iModel: { key: 'imodel-key', isBriefcaseConnection: () => true },
  };
  mocks.getClientMock.mockReturnValue({ startEditCommand: mocks.startEditCommandMock });
}

/** 预置两已选面（旧工具协议：_currentElementId + _selectedEntities）。 */
function attachSelection(tool: DraftFacesTool): void {
  (tool as unknown as { _currentElementId: string })._currentElementId = '0x1';
  (tool as unknown as { _selectedEntities: unknown[] })._selectedEntities = [
    { subEntity: { index: 2 } },
    { subEntity: { index: 5 } },
  ];
}

const EV = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  (IModelApp.viewManager as { selectedView: unknown }).selectedView = undefined;
});

describe('DraftFacesTool — 复用口径钉死', () => {
  it('toolId/iconSpec/namespace 与旧应用一致', () => {
    expect(DraftFacesTool.toolId).toBe('DraftFaces');
    expect(DraftFacesTool.iconSpec).toBe('icon-draft-faces');
    expect(DraftFacesTool.namespace).toBe('LubanCad');
  });

  it('wantSubEntityType 只收面（Face 收、Edge/Vertex 不收）', () => {
    const tool = makeTool();
    const want = (type: SubEntityType): boolean =>
      (DraftFacesTool.prototype as unknown as { wantSubEntityType: (t: SubEntityType) => boolean })
        .wantSubEntityType.call(tool, type);
    expect(want(SubEntityType.Face)).toBe(true);
    expect(want(SubEntityType.Edge)).toBe(false);
    expect(want(SubEntityType.Vertex)).toBe(false);
  });

  it('geometryCacheFilter：parts+solids 通道开（面/实体 BRep 缓存）', () => {
    const tool = makeTool();
    const filter = (tool as unknown as { geometryCacheFilter: Record<string, boolean> }).geometryCacheFilter;
    expect(filter).toEqual({ parts: true, curves: false, surfaces: false, solids: true, other: false });
  });
});

describe('DraftFacesTool — 右键完成选择 → 拔模 RPC + 退出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attachViewport();
  });

  it('有选择：startEditCommand 带 elementId/faceIndices/角度 + onComplete + exitTool', async () => {
    const onComplete = vi.fn();
    const tool = makeTool({ draftAngle: 7, onComplete });
    attachSelection(tool);

    await tool.onResetButtonUp(EV);

    expect(mocks.startEditCommandMock).toHaveBeenCalledWith(
      'solidModeling',
      'imodel-key',
      'draftFaces',
      { elementId: '0x1', faceIndices: [2, 5], draftAngle: 7, draftDirection: undefined },
    );
    expect(onComplete).toHaveBeenCalledWith('0x1', [
      { subEntity: { index: 2 } },
      { subEntity: { index: 5 } },
    ]);
    expect(mocks.exitToolMock).toHaveBeenCalledTimes(1);
  });

  it('空选择：onCancel + exitTool、零 RPC', async () => {
    const onCancel = vi.fn();
    const tool = makeTool({ onCancel });

    await tool.onResetButtonUp(EV);

    expect(mocks.startEditCommandMock).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mocks.exitToolMock).toHaveBeenCalledTimes(1);
  });

  it('RPC 失败：notifications 错误可见、不外抛、仍 exitTool', async () => {
    mocks.startEditCommandMock.mockRejectedValue(new Error('backend boom'));
    const onComplete = vi.fn();
    const tool = makeTool({ onComplete });
    attachSelection(tool);

    await expect(tool.onResetButtonUp(EV)).resolves.toBeDefined();
    const output = (IModelApp.notifications as unknown as { outputMessage: ReturnType<typeof vi.fn> }).outputMessage;
    expect(output).toHaveBeenCalled();
    expect(mocks.exitToolMock).toHaveBeenCalledTimes(1);
  });
});

describe('DraftFacesTool — 拔模角参数链', () => {
  it('缺省 5°；setOptions 覆写；setDraftAngle 更新并重发提示', () => {
    const tool = makeTool();
    expect(tool.draftAngle).toBe(5);

    const angled = makeTool({ draftAngle: 12 });
    expect(angled.draftAngle).toBe(12);

    tool.setDraftAngle(30);
    expect(tool.draftAngle).toBe(30);
  });

  it('selectedFaces 出口返回已选面集', () => {
    const tool = makeTool();
    attachSelection(tool);
    expect(tool.selectedFaces).toEqual([{ subEntity: { index: 2 } }, { subEntity: { index: 5 } }]);
  });
});
