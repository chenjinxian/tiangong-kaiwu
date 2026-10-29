// CreateHoleTool（web M4 Task 3 移植验收）——打孔工具行为子集：
//  1) toolId/iconSpec/namespace 钉死 + requireWriteableTarget=true（写位门）；
//  2) 装载即 initLocateElements(true, false, 'face')（面上拾取定位）+ 提示可见；
//  3) 首点只记位置零 RPC；再次 data 点击 / 右键 → startEditCommand(
//     'solidModeling', key, 'createHole', { centerPoint, diameter, depth })；
//  4) 参数链 setParameters/getParameters（缺省 直径10/深20）。
// mock 口径：core-frontend（PrimitiveTool 基类桩）+ @luban-cad/shared 模块级 mock。
// 2026-10-22 随 editor 模块收编迁入本包 src/luban/modeling/test/（被测件同迁）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exitToolMock: vi.fn().mockResolvedValue(undefined),
  startEditCommandMock: vi.fn().mockResolvedValue(undefined),
  getClientMock: vi.fn(),
  initLocateMock: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    notifications: { outputMessage: vi.fn(), outputPrompt: vi.fn() },
    viewManager: { selectedView: undefined as unknown },
  },
  EventHandled: { Yes: 1, No: 2 },
  OutputMessagePriority: { Error: 3, Info: 1, Success: 0 },
  NotifyMessageDetails: class {
    public constructor(public priority: number, public briefMessage: string) {}
  },
  PrimitiveTool: class {
    public async run(): Promise<boolean> { return true; }
    public async exitTool(): Promise<void> { return mocks.exitToolMock(); }
    public async onPostInstall(): Promise<void> { /* 桩 */ }
    public initLocateElements(...args: unknown[]): void { mocks.initLocateMock(...args); }
    public requireWriteableTarget(): boolean { return false; }
  },
}));

vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: { getClient: mocks.getClientMock },
}));

import { type BeButtonEvent, IModelApp } from '@itwin/core-frontend';
import { CreateHoleTool } from '../CreateHoleTool';

function attachViewport(): void {
  (IModelApp.viewManager as { selectedView: unknown }).selectedView = {
    iModel: { key: 'imodel-key', isBriefcaseConnection: () => true },
  };
  mocks.getClientMock.mockReturnValue({ startEditCommand: mocks.startEditCommandMock });
}

function pointEvent(x: number, y: number, z: number): BeButtonEvent {
  return { point: { x, y, z, clone() { return this; } } } as unknown as BeButtonEvent;
}

/** 预置中心点（绕过首点记录步）。 */
function setCenter(tool: CreateHoleTool, x = 1, y = 2, z = 3): void {
  (tool as unknown as { _centerPoint?: { x: number; y: number; z: number } })._centerPoint = { x, y, z };
}

beforeEach(() => {
  vi.clearAllMocks();
  (IModelApp.viewManager as { selectedView: unknown }).selectedView = undefined;
  attachViewport();
});

describe('CreateHoleTool — 复用口径钉死', () => {
  it('toolId/iconSpec/namespace 与旧应用一致', () => {
    expect(CreateHoleTool.toolId).toBe('CreateHole');
    expect(CreateHoleTool.iconSpec).toBe('icon-create-hole');
    expect(CreateHoleTool.namespace).toBe('LubanCad');
  });

  it('requireWriteableTarget=true（编辑工具写位门）', () => {
    expect(new CreateHoleTool().requireWriteableTarget()).toBe(true);
  });

  it('onPostInstall：面上定位初始化（locate on data button, face 匹配）+ 提示可见', async () => {
    const tool = new CreateHoleTool();
    await tool.onPostInstall();
    expect(mocks.initLocateMock).toHaveBeenCalledWith(true, false, 'face', undefined);
    expect((IModelApp.notifications as unknown as { outputMessage: ReturnType<typeof vi.fn> }).outputMessage).toHaveBeenCalled();
  });
});

describe('CreateHoleTool — 点击序列 → 打孔 RPC + 退出', () => {
  it('首点：只记中心点、零 RPC、返回 EventHandled.Yes', async () => {
    const tool = new CreateHoleTool();
    const handled = await tool.onDataButtonDown(pointEvent(1, 2, 3));
    expect(handled).toBe(1);
    expect(mocks.startEditCommandMock).not.toHaveBeenCalled();
    expect((tool as unknown as { _centerPoint?: unknown })._centerPoint).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('已有中心点再点：执行打孔（缺省 直径10/深20）并把中心点挪到新点（连续打孔）', async () => {
    const tool = new CreateHoleTool();
    setCenter(tool, 1, 2, 3);

    await tool.onDataButtonDown(pointEvent(9, 8, 7));

    expect(mocks.startEditCommandMock).toHaveBeenCalledWith(
      'solidModeling',
      'imodel-key',
      'createHole',
      { centerPoint: { x: 1, y: 2, z: 3 }, diameter: 10, depth: 20 },
    );
    expect((tool as unknown as { _centerPoint?: unknown })._centerPoint).toMatchObject({ x: 9, y: 8, z: 7 });
    expect(mocks.exitToolMock).not.toHaveBeenCalled();
  });

  it('右键（有中心点）：执行打孔 + exitTool', async () => {
    const tool = new CreateHoleTool();
    setCenter(tool);

    const handled = await tool.onResetButtonUp(pointEvent(0, 0, 0));

    expect(handled).toBe(1);
    expect(mocks.startEditCommandMock).toHaveBeenCalledWith(
      'solidModeling',
      'imodel-key',
      'createHole',
      { centerPoint: { x: 1, y: 2, z: 3 }, diameter: 10, depth: 20 },
    );
    expect(mocks.exitToolMock).toHaveBeenCalledTimes(1);
  });

  it('右键（无中心点）：零 RPC + exitTool', async () => {
    const tool = new CreateHoleTool();
    await tool.onResetButtonUp(pointEvent(0, 0, 0));
    expect(mocks.startEditCommandMock).not.toHaveBeenCalled();
    expect(mocks.exitToolMock).toHaveBeenCalledTimes(1);
  });

  it('RPC 失败：notifications 错误可见、不外抛', async () => {
    mocks.startEditCommandMock.mockRejectedValue(new Error('backend boom'));
    const tool = new CreateHoleTool();
    setCenter(tool);

    await expect(tool.onResetButtonUp(pointEvent(0, 0, 0))).resolves.toBeDefined();
    expect((IModelApp.notifications as unknown as { outputMessage: ReturnType<typeof vi.fn> }).outputMessage).toHaveBeenCalled();
    expect(mocks.exitToolMock).toHaveBeenCalledTimes(1);
  });
});

describe('CreateHoleTool — 参数链', () => {
  it('setParameters/getParameters 缺省与覆写', () => {
    const tool = new CreateHoleTool();
    expect(tool.getParameters()).toEqual({ diameter: 10, depth: 20 });
    tool.setParameters(6, 15);
    expect(tool.getParameters()).toEqual({ diameter: 6, depth: 15 });
  });
});
