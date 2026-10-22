// register-edit-tools（web-next M4 Task 3）：ensureEditTools 注册表验收——
//  1) 注册序同旧应用 registerTools.ts（视图 7 → 基元 5 → 草图原生 6 → 变换 4
//     +Undo/Redo → 面边/布尔/阵列 13 → 测量 6 → 裁剪 5 → 装饰 1）——完整 toolId
//     序列钉死（含 8 个 M3 校准真实 toolId：SweepFaces/RoundEdges/ChamferEdges/
//     DraftFaces/HollowFaces/CreateHole/MirrorElements/LinearPattern）；
//  2) 幂等：二次调用不重复 register、EditTools.initialize 只跑一次；
//  3) 失败路径：EditTools.initialize 拒绝 → ensureEditTools 拒绝且不落 flag
//     （下次调用可重试，与 PartStudioPage 的 notifications 可见错误面配套）；
//  4) registerDefaultShortcuts 子集（Undo/Redo/Delete/Escape 键位）派发真启动。
// mock 口径：@itwin/core-frontend 与 @itwin/editor-frontend 模块级 mock（桩类
// 携真实 toolId 静态量）；四个移植工具与 project-extents-decoration 为被测真件
// （其 toolId 是真静态量）；@luban-cad/shared 零真实 RPC。工厂内不可引用模块
// 作用域绑定（vi.mock 提升先于模块体求值）——桩表全数收进 vi.hoisted。

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const registerMock = vi.fn();
  const runMock = vi.fn().mockResolvedValue(true);
  const initializeMock = vi.fn().mockResolvedValue(undefined);
  const startDefaultToolMock = vi.fn().mockResolvedValue(undefined);

  /** 造一个携真实 toolId 的工具桩类（注册序列断言的数据面）。 */
  function stubTool(toolId: string): new () => object {
    return class { public static toolId = toolId; };
  }

  /** core-frontend 桩类 toolId → 注册表 import 名。 */
  const coreFrontendToolIds: Record<string, string> = {
    'View.Rotate': 'RotateViewTool',
    'View.Pan': 'PanViewTool',
    'View.Fit': 'FitViewTool',
    'View.Zoom': 'ZoomViewTool',
    'View.WindowArea': 'WindowAreaTool',
    'View.Undo': 'ViewUndoTool',
    'View.Redo': 'ViewRedoTool',
    'Measure.Distance': 'MeasureDistanceTool',
    'Measure.Location': 'MeasureLocationTool',
    'Measure.AreaByPoints': 'MeasureAreaByPointsTool',
    'Measure.Length': 'MeasureLengthTool',
    'Measure.Area': 'MeasureAreaTool',
    'Measure.Volume': 'MeasureVolumeTool',
    'ViewClip.Clear': 'ViewClipClearTool',
    'ViewClip.ByPlane': 'ViewClipByPlaneTool',
    'ViewClip.ByShape': 'ViewClipByShapeTool',
    'ViewClip.ByRange': 'ViewClipByRangeTool',
    'ViewClip.ByElement': 'ViewClipByElementTool',
  };

  /** editor-frontend 注册表 import 名 → 桩类 toolId（vendored 真实 toolId）。 */
  const editorToolIds: Record<string, string> = {
    CreateSphereTool: 'CreateSphere',
    CreateCylinderTool: 'CreateCylinder',
    CreateBoxTool: 'CreateBox',
    CreateConeTool: 'CreateCone',
    CreateTorusTool: 'CreateTorus',
    CreateLineStringTool: 'CreateLineString',
    CreateArcTool: 'CreateArc',
    CreateCircleTool: 'CreateCircle',
    CreateEllipseTool: 'CreateEllipse',
    CreateRectangleTool: 'CreateRectangle',
    CreateBCurveTool: 'CreateBCurve',
    MoveElementsTool: 'MoveElements',
    RotateElementsTool: 'RotateElements',
    CopyElementsTool: 'CopyElements',
    DeleteElementsTool: 'DeleteElements',
    UndoTool: 'Undo',
    RedoTool: 'Redo',
    RoundEdgesTool: 'RoundEdges',
    ChamferEdgesTool: 'ChamferEdges',
    HollowFacesTool: 'HollowFaces',
    OffsetFacesTool: 'OffsetFaces',
    SweepFacesTool: 'SweepFaces',
    UniteSolidElementsTool: 'UniteSolids',
    SubtractSolidElementsTool: 'SubtractSolids',
    IntersectSolidElementsTool: 'IntersectSolids',
  };

  return { registerMock, runMock, initializeMock, startDefaultToolMock, stubTool, coreFrontendToolIds, editorToolIds };
});

vi.mock('@itwin/core-frontend', () => {
  const exports: Record<string, unknown> = {
    IModelApp: {
      tools: { register: mocks.registerMock, run: mocks.runMock },
      toolAdmin: { startDefaultTool: mocks.startDefaultToolMock },
      notifications: { outputMessage: vi.fn(), outputPrompt: vi.fn() },
      viewManager: { selectedView: undefined, addDecorator: vi.fn() },
      locateManager: { currHit: null },
      initialized: true,
      onBeforeShutdown: { addListener: vi.fn() },
    },
    EventHandled: { Yes: 1, No: 2 },
    OutputMessagePriority: { Error: 3, Info: 1, Success: 0 },
    NotifyMessageDetails: class {
      public constructor(public priority: number, public message: string) {}
    },
    GraphicType: { WorldDecoration: 1, WorldOverlay: 2 },
    Tool: class {},
    // 移植件 CreateHoleTool/MirrorElementsTool 的基类（注册表仅引类不实例化）。
    PrimitiveTool: class {},
  };
  for (const [toolId, exportName] of Object.entries(mocks.coreFrontendToolIds)) {
    exports[exportName] = mocks.stubTool(toolId);
  }
  return exports;
});

vi.mock('@itwin/editor-frontend', () => {
  const exports: Record<string, unknown> = {
    EditTools: { initialize: mocks.initializeMock },
    basicManipulationIpc: { insertGeometricElement: vi.fn() },
    // SolidModelingToolBase 基类桩：被测移植件继承链可实例化即可。
    LocateSubEntityTool: class {
      public async run(): Promise<boolean> { return true; }
      public async exitTool(): Promise<void> { /* 桩 */ }
      public async onPostInstall(): Promise<void> { /* 桩 */ }
      public async onCleanup(): Promise<void> { /* 桩 */ }
      public initLocateElements(): void { /* 桩 */ }
      public async onDataButtonDown(): Promise<number> { return 2; }
      public async onResetButtonUp(): Promise<number> { return 2; }
      protected async addSubEntity(): Promise<void> { /* 桩 */ }
      protected async removeSubEntity(): Promise<void> { /* 桩 */ }
      protected setupAndPromptForNextAction(): void { /* 桩 */ }
    },
  };
  for (const [exportName, toolId] of Object.entries(mocks.editorToolIds)) {
    exports[exportName] = mocks.stubTool(toolId);
  }
  return exports;
});

vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: { getClient: vi.fn() },
}));

import type * as EditToolsRegistry from '../register-edit-tools.js';
import type * as KeyboardShortcuts from '../keyboard-shortcuts.js';

// ensureEditTools 是「每应用加载一次」语义（模块级幂等 flag）——用例间以
// vi.resetModules 取全新模块实例，逐一卸载上一实例安装的键盘监听（window 上
// 不留跨用例悬挂派发器）。
let registry: typeof EditToolsRegistry;
let keyboard: typeof KeyboardShortcuts;

async function freshModules(): Promise<void> {
  vi.resetModules();
  registry = await import('../register-edit-tools.js');
  keyboard = await import('../keyboard-shortcuts.js');
}

/** 注册序列的期望 toolId 全序（钉死注册序——与旧 registerTools.ts 分组一致）。 */
const EXPECTED_TOOL_IDS: readonly string[] = [
  // 视图 7（core-frontend）
  'View.Rotate', 'View.Pan', 'View.Fit', 'View.Zoom', 'View.WindowArea', 'View.Undo', 'View.Redo',
  // 基元 5（editor-frontend）
  'CreateSphere', 'CreateCylinder', 'CreateBox', 'CreateCone', 'CreateTorus',
  // 草图原生 6（editor-frontend）
  'CreateLineString', 'CreateArc', 'CreateCircle', 'CreateEllipse', 'CreateRectangle', 'CreateBCurve',
  // 变换 4 + 撤销/重做 2（editor-frontend；Undo/Redo 为 T4 标准通道前置注册）
  'MoveElements', 'RotateElements', 'CopyElements', 'DeleteElements', 'Undo', 'Redo',
  // 面边/布尔/阵列 13（DraftFaces/CreateHole/MirrorElements/LinearPattern/CircularPattern 为移植真件）
  'RoundEdges', 'ChamferEdges', 'HollowFaces', 'DraftFaces', 'CreateHole', 'MirrorElements',
  'LinearPattern', 'CircularPattern', 'OffsetFaces', 'SweepFaces',
  'UniteSolids', 'SubtractSolids', 'IntersectSolids',
  // 测量 6（core-frontend）
  'Measure.Distance', 'Measure.Location', 'Measure.AreaByPoints', 'Measure.Length', 'Measure.Area', 'Measure.Volume',
  // 裁剪 5（core-frontend）
  'ViewClip.Clear', 'ViewClip.ByPlane', 'ViewClip.ByShape', 'ViewClip.ByRange', 'ViewClip.ByElement',
  // 装饰（viewer-next T2 移植件；ACS/网格装饰未移植——注册表头注登记）
  'ToggleProjectExtents',
];

/** M3 校准的 8 个真实 toolId（ribbon-registry「id 校准原则」对账面）。 */
const M3_CALIBRATED_TOOL_IDS: readonly string[] = [
  'SweepFaces', 'RoundEdges', 'ChamferEdges', 'DraftFaces', 'HollowFaces',
  'CreateHole', 'MirrorElements', 'LinearPattern',
];

beforeEach(async () => {
  keyboard?.unregisterDefaultShortcuts(); // 上一实例监听卸载（先于 resetModules）
  vi.clearAllMocks();
  mocks.initializeMock.mockResolvedValue(undefined);
  mocks.runMock.mockResolvedValue(true);
  await freshModules();
});

afterEach(() => {
  keyboard?.unregisterDefaultShortcuts();
});

function registeredToolIds(): string[] {
  return mocks.registerMock.mock.calls.map((call) => {
    const tool = call[0] as { toolId?: string };
    return tool.toolId ?? '<missing toolId>';
  });
}

describe('ensureEditTools 注册表', () => {
  it('注册序与 toolId 全序同旧 registerTools.ts（跳过项除外，见注册表头注）', async () => {
    await registry.ensureEditTools();
    expect(registeredToolIds()).toEqual(EXPECTED_TOOL_IDS);
  });

  it('8 个 M3 校准真实 toolId 全部在册（ribbon 直投 tools.run 可真启动）', async () => {
    await registry.ensureEditTools();
    const ids = registeredToolIds();
    for (const toolId of M3_CALIBRATED_TOOL_IDS) {
      expect(ids, `${toolId} 应在注册表中`).toContain(toolId);
    }
  });

  it('幂等：二次调用不重复 register、EditTools.initialize 只跑一次', async () => {
    await registry.ensureEditTools();
    const countAfterFirst = mocks.registerMock.mock.calls.length;
    expect(countAfterFirst).toBeGreaterThan(0);

    await registry.ensureEditTools();

    expect(mocks.registerMock.mock.calls.length).toBe(countAfterFirst);
    expect(mocks.initializeMock).toHaveBeenCalledTimes(1);
  });

  it('失败路径：EditTools.initialize 拒绝 → ensureEditTools 拒绝且不落 flag（可重试）', async () => {
    mocks.initializeMock.mockRejectedValueOnce(new Error('host not ready'));
    await expect(registry.ensureEditTools()).rejects.toThrow('host not ready');
    expect(mocks.registerMock).not.toHaveBeenCalled();

    // 修复后重试：注册成功（失败也落 flag 的话此次会被幂等吞掉）。
    await expect(registry.ensureEditTools()).resolves.toBeUndefined();
    expect(registeredToolIds()).toEqual(EXPECTED_TOOL_IDS);
  });

  it('注册前置 EditTools.initialize 恰一次（幂等 flag 在 initialize 之后落）', async () => {
    await registry.ensureEditTools();
    expect(mocks.initializeMock).toHaveBeenCalledTimes(1);
    // 序：initialize 先于任何 register（旧 Editor.tsx:284-286 序）。
    expect(mocks.initializeMock.mock.invocationCallOrder[0]).toBeLessThan(
      Math.min(...mocks.registerMock.mock.invocationCallOrder),
    );
  });
});

describe('registerDefaultShortcuts 子集（Undo/Redo/Delete/Escape 键位）', () => {
  function keydown(options: KeyboardEventInit): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...options }));
  }

  /** 从真实 DOM 元素派发（body 为 target 的完整捕获→目标→冒泡传播路径）——
   * 传播拦断类断言的数据面（window.dispatchEvent 的路径只有 window 自身，
   * 无法暴露「捕获段 stopPropagation 杀死下游」的缺陷）。 */
  function keydownFromBody(options: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options });
    document.body.dispatchEvent(event);
    return event;
  }

  it('ensureEditTools 后键位安装：Ctrl+Z → tools.run("Undo")', async () => {
    await registry.ensureEditTools();
    keydown({ key: 'z', ctrlKey: true });
    expect(mocks.runMock).toHaveBeenCalledWith('Undo');
  });

  it('Ctrl+Shift+Z 与 Ctrl+Y → tools.run("Redo")', async () => {
    await registry.ensureEditTools();
    keydown({ key: 'z', ctrlKey: true, shiftKey: true });
    keydown({ key: 'y', ctrlKey: true });
    expect(mocks.runMock).toHaveBeenNthCalledWith(1, 'Redo');
    expect(mocks.runMock).toHaveBeenNthCalledWith(2, 'Redo');
  });

  it('Delete → tools.run("DeleteElements")（注册在册的标准变换工具）', async () => {
    await registry.ensureEditTools();
    keydown({ key: 'Delete' });
    expect(mocks.runMock).toHaveBeenCalledWith('DeleteElements');
  });

  it('Escape → toolAdmin.startDefaultTool()（退出当前工具）', async () => {
    await registry.ensureEditTools();
    keydown({ key: 'Escape' });
    expect(mocks.startDefaultToolMock).toHaveBeenCalledTimes(1);
  });

  it('输入焦点守卫：INPUT 聚焦时不派发（旧 useEditorKeyboard Delete 守卫同口径）', async () => {
    await registry.ensureEditTools();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    try {
      keydown({ key: 'Delete' });
      expect(mocks.runMock).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });

  it('未注册子集键（如 Ctrl+A）不派发（全表移植延后的诚实边界）', async () => {
    await registry.ensureEditTools();
    keydown({ key: 'a', ctrlKey: true });
    expect(mocks.runMock).not.toHaveBeenCalled();
    expect(mocks.startDefaultToolMock).not.toHaveBeenCalled();
  });

  it('未安装时（ensureEditTools 前）键位不派发', () => {
    keydown({ key: 'z', ctrlKey: true });
    expect(mocks.runMock).not.toHaveBeenCalled();
  });

  it('幂等：ensureEditTools 二次调用不重复安装监听（单键单派发）', async () => {
    await registry.ensureEditTools();
    await registry.ensureEditTools();
    keydown({ key: 'Escape' });
    expect(mocks.startDefaultToolMock).toHaveBeenCalledTimes(1);
  });

  // ── review-8 I-1 回归钉：捕获段监听不得拦断传播 ──────────────────────────
  // 监听挂 window 捕获段；此前 Escape 分支 stopPropagation 会把事件在抵达
  // target/冒泡段之前杀死——右键菜单的 Escape 收合、iTwinUI Dialog 的 Escape
  // 关闭（React 根容器委托）全部失灵（评审真实浏览器探针实证）。jsdom 下用
  // 真实 DOM 传播路径（body 为 target）断言。

  it('Escape 放行传播：body 冒泡段监听仍收到事件；工具取消两层语义共存', async () => {
    await registry.ensureEditTools();
    const bubbleSpy = vi.fn();
    document.body.addEventListener('keydown', bubbleSpy);
    try {
      keydownFromBody({ key: 'Escape' });
    } finally {
      document.body.removeEventListener('keydown', bubbleSpy);
    }
    // 修复前：window 捕获段 stopPropagation → target/冒泡段监听永不触发。
    expect(bubbleSpy).toHaveBeenCalledTimes(1);
    // 同一次击键工具取消照常发生（两层语义共存，评审裁决）。
    expect(mocks.startDefaultToolMock).toHaveBeenCalledTimes(1);
  });

  it('Escape 不 preventDefault：下游监听收到 defaultPrevented=false', async () => {
    await registry.ensureEditTools();
    let downstreamPrevented: boolean | undefined;
    const spy = (e: Event): void => {
      downstreamPrevented = e.defaultPrevented;
    };
    document.body.addEventListener('keydown', spy);
    try {
      keydownFromBody({ key: 'Escape' });
    } finally {
      document.body.removeEventListener('keydown', spy);
    }
    // 下游存在按 defaultPrevented 短路的 dismissal 处理器（iTwinUI DropdownMenu
    // 的 mergeEventHandlers 链）——Escape 分支不置位，事件原样放行。
    expect(downstreamPrevented).toBe(false);
  });

  it('对照：Ctrl+Z 仍拦断传播（放行仅限 Escape 分支的有意不对称）', async () => {
    await registry.ensureEditTools();
    const bubbleSpy = vi.fn();
    document.body.addEventListener('keydown', bubbleSpy);
    try {
      keydownFromBody({ key: 'z', ctrlKey: true });
    } finally {
      document.body.removeEventListener('keydown', bubbleSpy);
    }
    expect(mocks.runMock).toHaveBeenCalledWith('Undo');
    // 其余键位无下游 dismissal 语义，保持拦断（单次派发即消费）不变。
    expect(bubbleSpy).not.toHaveBeenCalled();
  });
});
