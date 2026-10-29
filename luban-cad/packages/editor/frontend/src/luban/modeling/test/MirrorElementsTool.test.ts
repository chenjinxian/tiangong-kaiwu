// MirrorElementsTool（web M4 Task 3 移植验收；B4 修复直改空操作）——镜像工具行为子集：
//  1) toolId/iconSpec/namespace 钉死 + requireWriteableTarget=true；
//  2) 三步状态机 select → plane-point → plane-normal（data 点击推进）；
//  3) 镜像 RPC 序列：startEditCommand('basicManipulation', key) 一次 → 逐元素
//     callEditMethod('mirrorElement', elementId, planePoint, planeNormal) →
//     callEditMethod('saveChanges', …) → finishEditCommand()（旧实现把载荷塞进
//     startEditCommand 构造参数，后端无 mirrorElement 方法=空操作）；
//  4) 法向退化守卫：两点重合 → 缺省法向 (0,1,0)；
//  5) 右键空选择 → exitTool（不进平面步）。
// mock 口径：core-frontend（PrimitiveTool 基类桩 + locateManager.currHit 可写）
// + @luban-cad/shared 模块级 mock；core-geometry 取真实模块（向量/法向真实数学）。
// 2026-10-22 随 editor 模块收编迁入本包 src/luban/modeling/test/（被测件同迁）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exitToolMock: vi.fn().mockResolvedValue(undefined),
  startEditCommandMock: vi.fn().mockResolvedValue(undefined),
  callEditMethodMock: vi.fn().mockResolvedValue(undefined),
  finishEditCommandMock: vi.fn().mockResolvedValue('done'),
  getClientMock: vi.fn(),
  initLocateMock: vi.fn(),
  runMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    notifications: { outputMessage: vi.fn(), outputPrompt: vi.fn() },
    viewManager: { selectedView: undefined as unknown },
    locateManager: { currHit: null as unknown },
  },
  EventHandled: { Yes: 1, No: 2 },
  OutputMessagePriority: { Error: 3, Info: 1, Success: 0 },
  NotifyMessageDetails: class {
    public constructor(public priority: number, public briefMessage: string) {}
  },
  PrimitiveTool: class {
    public async run(): Promise<boolean> { return mocks.runMock(); }
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
import { Point3d } from '@itwin/core-geometry';
import { MirrorElementsTool } from '../MirrorElementsTool';

function attachViewport(): void {
  (IModelApp.viewManager as { selectedView: unknown }).selectedView = {
    iModel: { key: 'imodel-key', isBriefcaseConnection: () => true },
    view: { computeFitRange: () => ({ center: Point3d.create(5, 5, 5) }) },
  };
  mocks.getClientMock.mockReturnValue({
    startEditCommand: mocks.startEditCommandMock,
    callEditMethod: mocks.callEditMethodMock,
    finishEditCommand: mocks.finishEditCommandMock,
  });
}

function pointEvent(x: number, y: number, z: number): BeButtonEvent {
  return { point: { x, y, z, clone() { return this; } } } as unknown as BeButtonEvent;
}

/** 直读内部步（状态机断言面）。 */
function stepOf(tool: MirrorElementsTool): string {
  return tool.currentStep;
}

/** 预置已完成元素选择（绕过 locate 步）。 */
function attachSelection(tool: MirrorElementsTool, ids: string[]): void {
  (tool as unknown as { _selectedElements: string[] })._selectedElements = [...ids];
}

beforeEach(() => {
  vi.clearAllMocks();
  (IModelApp.viewManager as { selectedView: unknown }).selectedView = undefined;
  (IModelApp.locateManager as { currHit: unknown }).currHit = null;
  attachViewport();
});

describe('MirrorElementsTool — 复用口径钉死', () => {
  it('toolId/iconSpec/namespace 与旧应用一致', () => {
    expect(MirrorElementsTool.toolId).toBe('MirrorElements');
    expect(MirrorElementsTool.iconSpec).toBe('icon-mirror-elements');
    expect(MirrorElementsTool.namespace).toBe('LubanCad');
  });

  it('requireWriteableTarget=true + 装载即默认定位初始化', async () => {
    const tool = new MirrorElementsTool();
    expect(tool.requireWriteableTarget()).toBe(true);
    await tool.onPostInstall();
    expect(mocks.initLocateMock).toHaveBeenCalledWith(true, false, 'default', undefined);
    expect(stepOf(tool)).toBe('select');
  });
});

describe('MirrorElementsTool — 三步状态机', () => {
  it('select 步 data 点击命中元素 → 收集（去重）+ 停留 select', async () => {
    const tool = new MirrorElementsTool();
    await tool.onPostInstall();
    (IModelApp.locateManager as { currHit: unknown }).currHit = { isElementHit: true, sourceId: '0xA' };

    await tool.onDataButtonDown(pointEvent(0, 0, 0));
    await tool.onDataButtonDown(pointEvent(0, 0, 0)); // 同 id 去重

    expect(tool.selectedElements).toEqual(['0xA']);
    expect(stepOf(tool)).toBe('select');
  });

  it('select 步右键（有选择）→ plane-point；data 点击定平面点 → plane-normal', async () => {
    const tool = new MirrorElementsTool();
    attachSelection(tool, ['0xA']);
    await tool.onResetButtonUp(pointEvent(0, 0, 0));
    expect(stepOf(tool)).toBe('plane-point');

    await tool.onDataButtonDown(pointEvent(1, 0, 0));
    expect(stepOf(tool)).toBe('plane-normal');
  });

  it('select 步右键（空选择）→ exitTool（不进平面步）', async () => {
    const tool = new MirrorElementsTool();
    await tool.onPostInstall();

    await tool.onResetButtonUp(pointEvent(0, 0, 0));

    expect(stepOf(tool)).toBe('select');
    expect(mocks.exitToolMock).toHaveBeenCalledTimes(1);
    expect(mocks.startEditCommandMock).not.toHaveBeenCalled();
  });
});

describe('MirrorElementsTool — 镜像执行', () => {
  it('plane-normal 步 data 点击 → 一次 start + 逐元素 callEditMethod(mirrorElement) + save + finish + 重启', async () => {
    const tool = new MirrorElementsTool();
    attachSelection(tool, ['0xA', '0xB']);
    await tool.onResetButtonUp(pointEvent(0, 0, 0)); // → plane-point
    await tool.onDataButtonDown(pointEvent(1, 0, 0)); // 平面点 → plane-normal

    await tool.onDataButtonDown(pointEvent(1, 5, 0)); // 法向点 → 执行

    expect(mocks.startEditCommandMock).toHaveBeenCalledTimes(1);
    expect(mocks.startEditCommandMock).toHaveBeenCalledWith('basicManipulation', 'imodel-key');
    expect(mocks.callEditMethodMock).toHaveBeenNthCalledWith(1,
      'mirrorElement',
      '0xA',
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    expect(mocks.callEditMethodMock).toHaveBeenNthCalledWith(2,
      'mirrorElement',
      '0xB',
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    expect(mocks.callEditMethodMock).toHaveBeenNthCalledWith(3, 'saveChanges', 'mirror elements');
    expect(mocks.finishEditCommandMock).toHaveBeenCalledTimes(1);
    // 执行后重启新实例（连续镜像语义；run 成功 → 不 exitTool）
    expect(mocks.runMock).toHaveBeenCalled();
    expect(mocks.exitToolMock).not.toHaveBeenCalled();
  });

  it('法向退化：法向点与平面点重合 → 缺省法向 (0,1,0)', async () => {
    const tool = new MirrorElementsTool();
    attachSelection(tool, ['0xA']);
    await tool.onResetButtonUp(pointEvent(0, 0, 0));
    await tool.onDataButtonDown(pointEvent(2, 3, 4)); // 平面点

    await tool.onDataButtonDown(pointEvent(2, 3, 4)); // 同点 → 退化法向

    const call = mocks.callEditMethodMock.mock.calls[0] as unknown[];
    expect(call[0]).toBe('mirrorElement');
    expect(call[3]).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('plane-normal 步右键 → 缺省法向执行 + 重启', async () => {
    const tool = new MirrorElementsTool();
    attachSelection(tool, ['0xA']);
    await tool.onResetButtonUp(pointEvent(0, 0, 0));
    await tool.onDataButtonDown(pointEvent(1, 0, 0));

    await tool.onResetButtonUp(pointEvent(9, 9, 9));

    const call = mocks.callEditMethodMock.mock.calls[0] as unknown[];
    expect(call[0]).toBe('mirrorElement');
    expect(call[3]).toEqual({ x: 0, y: 1, z: 0 });
    expect(mocks.runMock).toHaveBeenCalled();
  });

  it('RPC 失败：notifications 错误可见、不外抛、finish 仍收口', async () => {
    mocks.callEditMethodMock.mockRejectedValue(new Error('backend boom'));
    const tool = new MirrorElementsTool();
    attachSelection(tool, ['0xA']);
    await tool.onResetButtonUp(pointEvent(0, 0, 0));
    await tool.onDataButtonDown(pointEvent(1, 0, 0));

    await expect(tool.onDataButtonDown(pointEvent(1, 5, 0))).resolves.toBeDefined();
    expect((IModelApp.notifications as unknown as { outputMessage: ReturnType<typeof vi.fn> }).outputMessage).toHaveBeenCalled();
    expect(mocks.finishEditCommandMock).toHaveBeenCalledTimes(1); // finally 收口（不悬挂活动命令）
  });
});
