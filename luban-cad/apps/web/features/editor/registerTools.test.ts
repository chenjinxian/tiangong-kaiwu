/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * registerAllTools 回归测试（M3-b T4 / Task 9 M3-a 发现）：
 * registerAllTools() 曾在 SelectAllTool 注册处静默抛死——裸 `extends Tool` 无
 * namespace，ToolRegistry.register 抛 "Tools must have a namespace"
 * （itwinjs-core Tool.ts:993-994），其后全部注册行 + registerDefaultShortcuts
 * 从未执行（全局 KeyboardManager Escape→startDefaultTool 链死亡），Editor.tsx
 * 的 try/catch 把异常吞掉。
 *
 * 本测试以忠实于 ToolRegistry.register 语义的 mock 注册表复现该机制：
 * namespace 只能来自 (a) register 第二参数显式赋值，或 (b) 父类静态继承；
 * core-frontend 内建工具在生产态经 IModelApp.startup 的 registerModule(mod, 'CoreTools')
 * 获得 namespace（Tool.ts:436-446），editor-frontend 工具经 EditTools.initialize 获得
 * 'Editor'（EditTool.ts:42,89-99）——mock 基类镜像这两种生产态。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { keyboardManager } from '../../src/core/shortcuts/index.js';
import { registerAllTools } from './registerTools.js';

// ---------------------------------------------------------------------------
// 忠实注册表（ToolRegistry.register 语义复刻，Tool.ts:986-998）
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const registered = new Map<string, { namespace?: string }>();
  const tools = {
    registered,
    register(toolClass: { toolId: string; namespace?: string }, namespace?: string) {
      if (namespace) toolClass.namespace = namespace;
      if (!toolClass.toolId || toolClass.toolId.length === 0) return; // 抽象类跳过
      if (!toolClass.namespace) throw new Error('Tools must have a namespace');
      registered.set(toolClass.toolId, toolClass);
    },
    run: vi.fn(async (_toolId: string, ..._args: unknown[]) => true),
  };
  return { tools };
});

vi.mock('@itwin/core-frontend', () => {
  // 裸 Tool：namespace 声明但从未初始化（生产态 Tool.ts:368）——extends Tool 而不
  // 自报 namespace 的类在 register 时必抛。
  class Tool {
    static toolId = '';
    static iconSpec = '';
    async run(): Promise<boolean> { return true; }
    async exitTool(): Promise<void> { /* noop */ }
  }
  // PrimitiveTool：抽象，生产态不在 startup 7 模块内，namespace 从未被赋值。
  class PrimitiveTool extends Tool {
    async onPostInstall(): Promise<void> { /* noop */ }
    async onCleanup(): Promise<void> { /* noop */ }
    initLocateElements(_enableLocate?: boolean): void { /* noop */ }
    requireWriteableTarget(): boolean { return true; }
  }
  // SelectionTool：startup 时 registerModule(selectTool, 'CoreTools') 已把 namespace
  // 赋到本类（成员类逐一赋值，Tool.ts:1004-1011）——子类沿原型链继承。
  class SelectionTool extends PrimitiveTool {
    static namespace = 'CoreTools';
  }
  // core-frontend 具名工具：同经 startup registerModule 获得 'CoreTools'。
  class CoreNamedTool extends Tool {
    static namespace = 'CoreTools';
  }
  class RotateViewTool extends CoreNamedTool { static override toolId = 'View.Rotate'; }
  class PanViewTool extends CoreNamedTool { static override toolId = 'View.Pan'; }
  class FitViewTool extends CoreNamedTool { static override toolId = 'View.Fit'; }
  class ZoomViewTool extends CoreNamedTool { static override toolId = 'View.Zoom'; }
  class WindowAreaTool extends CoreNamedTool { static override toolId = 'View.WindowArea'; }
  class ViewUndoTool extends CoreNamedTool { static override toolId = 'View.Undo'; }
  class ViewRedoTool extends CoreNamedTool { static override toolId = 'View.Redo'; }
  class MeasureDistanceTool extends CoreNamedTool { static override toolId = 'Measure.Distance'; }
  class MeasureLocationTool extends CoreNamedTool { static override toolId = 'Measure.Location'; }
  class MeasureAreaByPointsTool extends CoreNamedTool { static override toolId = 'Measure.AreaByPoints'; }
  class MeasureLengthTool extends CoreNamedTool { static override toolId = 'Measure.Length'; }
  class MeasureAreaTool extends CoreNamedTool { static override toolId = 'Measure.Area'; }
  class MeasureVolumeTool extends CoreNamedTool { static override toolId = 'Measure.Volume'; }
  class ViewClipClearTool extends CoreNamedTool { static override toolId = 'ViewClip.Clear'; }
  class ViewClipByPlaneTool extends CoreNamedTool { static override toolId = 'ViewClip.ByPlane'; }
  class ViewClipByShapeTool extends CoreNamedTool { static override toolId = 'ViewClip.ByShape'; }
  class ViewClipByRangeTool extends CoreNamedTool { static override toolId = 'ViewClip.ByRange'; }
  class ViewClipByElementTool extends CoreNamedTool { static override toolId = 'ViewClip.ByElement'; }

  return {
    Tool,
    PrimitiveTool,
    SelectionTool,
    RotateViewTool,
    PanViewTool,
    FitViewTool,
    ZoomViewTool,
    WindowAreaTool,
    ViewUndoTool,
    ViewRedoTool,
    MeasureDistanceTool,
    MeasureLocationTool,
    MeasureAreaByPointsTool,
    MeasureLengthTool,
    MeasureAreaTool,
    MeasureVolumeTool,
    ViewClipClearTool,
    ViewClipByPlaneTool,
    ViewClipByShapeTool,
    ViewClipByRangeTool,
    ViewClipByElementTool,
    IModelApp: {
      tools: mocks.tools,
      viewManager: {
        selectedView: undefined,
        addDecorator: vi.fn(),
        dropDecorator: vi.fn(),
        invalidateDecorationsAllViews: vi.fn(),
      },
      notifications: {
        outputMessage: vi.fn(),
        outputPrompt: vi.fn(),
      },
      accuSnap: { currHit: undefined },
      toolAdmin: { startDefaultTool: vi.fn(async () => true) },
    },
    BeButtonEvent: class {},
    BeModifierKeys: { Control: 1, Shift: 2, Alt: 4 },
    DecorateContext: class {},
    Decorator: class {},
    EventHandled: { Yes: 1, No: 0 },
    GraphicType: { WorldDecoration: 0, WorldOverlay: 1, ViewOverlay: 2 },
    HitDetail: class {},
    Viewport: class {},
    AccuDrawHintBuilder: class {},
    SnapDetail: class {},
    IModelConnection: class {},
    NotifyMessageDetails: class {
      constructor(_priority: number, _message: string) { /* noop */ }
    },
    OutputMessagePriority: { None: 0, Info: 1, Warning: 2, Error: 3, Fatal: 4 },
  };
});

vi.mock('@itwin/editor-frontend', () => {
  // editor-frontend：EditTools.initialize 以 registerModule(mod, 'Editor') 赋 namespace
  // （EditTool.ts:42,89-99）——mock 基类镜像。
  class EditorToolBase {
    static toolId = '';
    static iconSpec = '';
    static namespace = 'Editor';
    async run(): Promise<boolean> { return true; }
    async exitTool(): Promise<void> { /* noop */ }
  }
  class CreateSphereTool extends EditorToolBase { static override toolId = 'CreateSphere'; }
  class CreateCylinderTool extends EditorToolBase { static override toolId = 'CreateCylinder'; }
  class CreateBoxTool extends EditorToolBase { static override toolId = 'CreateBox'; }
  class CreateConeTool extends EditorToolBase { static override toolId = 'CreateCone'; }
  class CreateTorusTool extends EditorToolBase { static override toolId = 'CreateTorus'; }
  class CreateLineStringTool extends EditorToolBase { static override toolId = 'CreateLineString'; }
  class CreateArcTool extends EditorToolBase { static override toolId = 'CreateArc'; }
  class CreateCircleTool extends EditorToolBase { static override toolId = 'CreateCircle'; }
  class CreateEllipseTool extends EditorToolBase { static override toolId = 'CreateEllipse'; }
  class CreateRectangleTool extends EditorToolBase { static override toolId = 'CreateRectangle'; }
  class CreateBCurveTool extends EditorToolBase { static override toolId = 'CreateBCurve'; }
  class MoveElementsTool extends EditorToolBase { static override toolId = 'MoveElements'; }
  class RotateElementsTool extends EditorToolBase { static override toolId = 'RotateElements'; }
  class CopyElementsTool extends EditorToolBase { static override toolId = 'CopyElements'; }
  class DeleteElementsTool extends EditorToolBase { static override toolId = 'DeleteElements'; }
  class UniteSolidElementsTool extends EditorToolBase { static override toolId = 'UniteSolids'; }
  class SubtractSolidElementsTool extends EditorToolBase { static override toolId = 'SubtractSolids'; }
  class IntersectSolidElementsTool extends EditorToolBase { static override toolId = 'IntersectSolids'; }
  class RoundEdgesTool extends EditorToolBase { static override toolId = 'RoundEdges'; }
  class ChamferEdgesTool extends EditorToolBase { static override toolId = 'ChamferEdges'; }
  class HollowFacesTool extends EditorToolBase { static override toolId = 'HollowFaces'; }
  class OffsetFacesTool extends EditorToolBase { static override toolId = 'OffsetFaces'; }
  class SweepFacesTool extends EditorToolBase { static override toolId = 'SweepFaces'; }
  class LocateSubEntityTool extends EditorToolBase { /* 抽象基类，无自身 toolId */ }

  return {
    CreateSphereTool,
    CreateCylinderTool,
    CreateBoxTool,
    CreateConeTool,
    CreateTorusTool,
    CreateLineStringTool,
    CreateArcTool,
    CreateCircleTool,
    CreateEllipseTool,
    CreateRectangleTool,
    CreateBCurveTool,
    MoveElementsTool,
    RotateElementsTool,
    CopyElementsTool,
    DeleteElementsTool,
    UniteSolidElementsTool,
    SubtractSolidElementsTool,
    IntersectSolidElementsTool,
    RoundEdgesTool,
    ChamferEdgesTool,
    HollowFacesTool,
    OffsetFacesTool,
    SweepFacesTool,
    LocateSubEntityTool,
    basicManipulationIpc: {},
    EditTools: {
      namespace: 'Editor',
      initialize: vi.fn(async () => true),
    },
  };
});

// SelectionToolbar 与工具注册无关（React 组件，拉 itwinui-react 重依赖）——隔离。
vi.mock('../../src/core/tools/SelectionToolbar.js', () => ({
  SelectionToolbar: () => null,
}));

const { tools } = mocks;

beforeEach(() => {
  tools.registered.clear();
  tools.run.mockClear();
});

describe('registerAllTools', () => {
  it('全程零抛出跑完（SelectAllTool 裸 Tool 无 namespace 回归）', () => {
    expect(() => registerAllTools()).not.toThrow();
  });

  it('注册 Selection 工具组（含原静默死线之后的三个）', () => {
    registerAllTools();
    for (const id of [
      'LubanCad.FenceSelect',
      'LubanCad.SelectAll',
      'LubanCad.InvertSelection',
      'LubanCad.ClearSelection',
      'LubanCad.SelectByCategory',
    ]) {
      expect(tools.registered.has(id), `缺少注册: ${id}`).toBe(true);
    }
  });

  it('注册死线之后的全部工具组（测量/剖切/装饰/动画/渲染）', () => {
    registerAllTools();
    for (const id of [
      // 测量（core-frontend）
      'Measure.Distance', 'Measure.Location', 'Measure.AreaByPoints',
      'Measure.Length', 'Measure.Area', 'Measure.Volume',
      // 剖切
      'SectionByPlane', 'ClearSection',
      // 装饰
      'ToggleACS', 'ToggleGrid', 'GridSettings', 'ToggleProjectExtents',
      // 动画
      'LubanCad.CameraWalk', 'LubanCad.FlyToSelection',
      // 渲染
      'LubanCad.ToggleShadows', 'LubanCad.ToggleAO', 'LubanCad.SetRenderMode',
    ]) {
      expect(tools.registered.has(id), `缺少注册: ${id}`).toBe(true);
    }
  });

  it('注册死线之前的工具组不受修复影响（视图/实体/草图/变换/布尔）', () => {
    registerAllTools();
    for (const id of [
      'View.Rotate', 'View.Pan', 'View.Fit', 'View.Zoom', 'View.WindowArea', 'View.Undo', 'View.Redo',
      'CreateSphere', 'CreateCylinder', 'CreateBox', 'CreateCone', 'CreateTorus',
      'CreateLineString', 'CreateArc', 'CreateCircle', 'CreateEllipse', 'CreateRectangle', 'CreateBCurve',
      'MoveElements', 'RotateElements', 'CopyElements', 'DeleteElements',
      'UniteSolids', 'SubtractSolids', 'IntersectSolids',
      'RoundEdges', 'ChamferEdges', 'HollowFaces', 'OffsetFaces', 'SweepFaces',
      'SetSketchPlane', 'SelectSubEntity', 'DraftFaces', 'CreateHole', 'MirrorElements',
      'LinearPattern', 'CircularPattern',
      'ViewClip.Clear', 'ViewClip.ByPlane', 'ViewClip.ByShape', 'ViewClip.ByRange', 'ViewClip.ByElement',
    ]) {
      expect(tools.registered.has(id), `缺少注册: ${id}`).toBe(true);
    }
  });

  it('全局快捷键链复活（Escape → startDefaultTool）', () => {
    registerAllTools();
    const shortcuts = keyboardManager.getShortcuts();
    expect(shortcuts.some((s) => s.key === 'escape')).toBe(true);
    expect(shortcuts.some((s) => s.key === 'a' && s.modifiers?.ctrl === true)).toBe(true);
  });

  it('注册鲁班草图绘制工具链（M3-b T4：线/矩形/圆）', () => {
    registerAllTools();
    for (const id of ['Sketch.CreateLine', 'Sketch.CreateRectangle', 'Sketch.CreateCircle']) {
      expect(tools.registered.has(id), `缺少注册: ${id}`).toBe(true);
    }
  });

  it('AccuDraw 会话开启', () => {
    registerAllTools();
    expect(tools.run).toHaveBeenCalledWith('AccuDraw.SessionToggle');
  });
});
