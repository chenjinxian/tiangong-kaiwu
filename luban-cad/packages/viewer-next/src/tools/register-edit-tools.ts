/**
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *
 * web-next 编辑工具注册表（web-next M4 Task 3）——旧应用
 * apps/web/features/editor/registerTools.ts registerAllTools() 的同源裁剪移植：
 * `EditTools.initialize()` 前置 + 按旧表分组序注册 + registerDefaultShortcuts
 * 子集（见 keyboard-shortcuts.ts）。分组序一处对调已登记：旧表裁剪 5 在测量 6
 * 之前，新表按简报钉序（测量 6 → 裁剪 5）对调。幂等：模块级 flag，仅成功后
 * 落位；失败向上抛（PartStudioPage 编排层负责 IModelApp.notifications 可见——
 * 旧 Editor.tsx:287-301 的教训：静默抛死会让后续注册全部不执行）。
 *
 * ── 跳过项诚实登记（对照旧 registerTools.ts 全表；勿静默）──────────────────
 *  - core-markup 12 工具（Line/Rectangle/Circle/Ellipse/Arrow/Cloud/Polygon/
 *    Sketch/PlaceText/Distance/Symbol/MarkupSelect）：@itwin/core-markup 依赖
 *    未配置（同旧应用注释性跳过；启用前先补 workspace 依赖解析）；
 *  - SetSketchPlaneTool / SelectSubEntityTool（旧 features/modeling 自定义）：
 *    简报 Files 未列——草图模式接线里程碑移植（去向：@itwin/editor-frontend
 *    src/luban/，2026-10-22 editor 模块收编后的鲁班工具区）；
 *  - 鲁班草图链 11 工具（绘制 3：SketchLineTool/SketchRectangleTool/
 *    SketchCircleTool + 约束 6：Coincident/Horizontal/Vertical/Parallel/
 *    Perpendicular/Equal + 尺寸 2：Distance/Radius，旧 features/sketch/tools/*）：
 *    **绘制面已由 M6-a T5 收口**——web-next 侧 tools/sketch/SketchCreateTool.ts
 *    四件（Sketch.Line/Sketch.Rectangle/Sketch.CenterCircle/Sketch.Arc3Point，
 *    含新增 3 点弧）经 registerSketchTools 在 PartStudioPage 注册（viewer-next
 *    不反向依赖 app 模块）；约束 6 + 尺寸 2 挂账依旧（F3 约束/尺寸工具任务）。
 *  - 选择 5 工具（FenceSelect/SelectAll/Invert/ClearSelection/SelectByCategory，
 *    旧 src/core/tools/SelectionTools.ts）：简报未列——命令面板接线里程碑移植；
 *  - 剖切 2 工具（SectionByPlane/ClearSection，旧 src/core/section/SectionTools.ts）：
 *    同上挂账；
 *  - 装饰 3 工具（ToggleACS/ToggleGrid/GridSettings，旧 src/core/decorations/*）：
 *    ToggleProjectExtents 已由 viewer-next M4-T2 移植并在册，其余挂账；
 *  - 动画 2（CameraWalk/FlyToSelection）与渲染 3（SetRenderMode/ToggleAO/
 *    ToggleShadows，旧 src/core/animation|rendering/*）：挂账同上；
 *  - `tools.run('AccuDraw.SessionToggle')`（旧表顺手启动项）：AccuDraw 工具族
 *    未入注册表，跳过；AccuSnap snap/locate 使能已由 viewer-next
 *    ensureAccuSnap（M4-T2）覆盖；
 *  - 旧 useUndoManager（旧 src/core/undo/UndoManager）：M4-T4 走 BriefcaseTxns
 *    标准通道（connection.txns + tools.run('Undo'/'Redo')），不移植。
 */

import {
  FitViewTool,
  IModelApp,
  MeasureAreaByPointsTool,
  MeasureAreaTool,
  MeasureDistanceTool,
  MeasureLengthTool,
  MeasureLocationTool,
  MeasureVolumeTool,
  PanViewTool,
  RotateViewTool,
  ViewClipByElementTool,
  ViewClipByPlaneTool,
  ViewClipByRangeTool,
  ViewClipByShapeTool,
  ViewClipClearTool,
  ViewRedoTool,
  ViewUndoTool,
  WindowAreaTool,
  ZoomViewTool,
} from '@itwin/core-frontend';
import {
  ChamferEdgesTool,
  // —— 以下 5 项为 M4-T3 移植四工具（DraftFaces/CreateHole/MirrorElements/
  //    LinearPattern/CircularPattern），2026-10-22 随 editor 模块收编由
  //    viewer-next src/tools/modeling/ 迁入 @itwin/editor-frontend src/luban/
  //    modeling/，改从其导出面供给（建模功能归位第一方建模基座）——
  CircularPatternTool,
  CopyElementsTool,
  CreateArcTool,
  CreateBCurveTool,
  CreateBoxTool,
  CreateCircleTool,
  CreateConeTool,
  CreateCylinderTool,
  CreateEllipseTool,
  CreateHoleTool,
  CreateLineStringTool,
  CreateRectangleTool,
  CreateSphereTool,
  CreateTorusTool,
  DeleteElementsTool,
  DraftFacesTool,
  EditTools,
  HollowFacesTool,
  IntersectSolidElementsTool,
  LinearPatternTool,
  MirrorElementsTool,
  MoveElementsTool,
  OffsetFacesTool,
  RedoTool,
  RotateElementsTool,
  RoundEdgesTool,
  SubtractSolidElementsTool,
  SweepFacesTool,
  UndoTool,
  UniteSolidElementsTool,
} from '@itwin/editor-frontend';

import { ToggleProjectExtentsTool } from '../viewport/decorations/project-extents-decoration.js';
import { registerDefaultShortcuts } from './keyboard-shortcuts.js';

let registered = false;

/**
 * 幂等注册编辑工具（EditTools.initialize + 注册表 + 快捷键子集）。
 * 重复调用直返；失败不落 flag（可重试），错误向上抛给编排层呈现。
 */
export async function ensureEditTools(): Promise<void> {
  if (registered) return;

  // 旧 Editor.tsx:284 序：先 initialize（注册 vendored 内置 Undo/Redo、
  // Sketch/SolidModeling/SolidPrimitive/Transform/DeleteElements/ModifyCurve
  // 模块 + edit command handler），再叠加旧应用显式注册表。
  await EditTools.initialize();

  registerAllTools();
  registered = true;
}

/** 注册表主体（分组序同旧 registerAllTools；跳过项见文件头注登记）。 */
function registerAllTools(): void {
  // ── 视图操作 7（core-frontend）───────────────────────────────────────────
  IModelApp.tools.register(RotateViewTool);
  IModelApp.tools.register(PanViewTool);
  IModelApp.tools.register(FitViewTool);
  IModelApp.tools.register(ZoomViewTool);
  IModelApp.tools.register(WindowAreaTool);
  IModelApp.tools.register(ViewUndoTool);
  IModelApp.tools.register(ViewRedoTool);

  // ── 实体基元 5（editor-frontend；旧表 Sphere/Cylinder/Box 前置、Cone/Torus
  // 后置，此处按 brief 分组合并为一组）──────────────────────────────────────
  IModelApp.tools.register(CreateSphereTool);
  IModelApp.tools.register(CreateCylinderTool);
  IModelApp.tools.register(CreateBoxTool);
  IModelApp.tools.register(CreateConeTool);
  IModelApp.tools.register(CreateTorusTool);

  // ── 草图原生 6（editor-frontend SketchTools；鲁班草图绘制链见头注挂账）────
  IModelApp.tools.register(CreateLineStringTool);
  IModelApp.tools.register(CreateArcTool);
  IModelApp.tools.register(CreateCircleTool);
  IModelApp.tools.register(CreateEllipseTool);
  IModelApp.tools.register(CreateRectangleTool);
  IModelApp.tools.register(CreateBCurveTool);

  // ── 变换 4 + 撤销/重做 2（editor-frontend）───────────────────────────────
  // Undo/Redo 为 M4-T4 标准通道前置注册（旧表缺——旧快捷键 'LubanCad.Undo' 是
  // 死绑定；EditTools.initialize 虽经 registerModule 注册过，显式在册使 T4
  // 契约可钉）。ribbon 的 deleteBodies 命令同样落在 DeleteElements。
  IModelApp.tools.register(MoveElementsTool);
  IModelApp.tools.register(RotateElementsTool);
  IModelApp.tools.register(CopyElementsTool);
  IModelApp.tools.register(DeleteElementsTool);
  IModelApp.tools.register(UndoTool);
  IModelApp.tools.register(RedoTool);

  // ── 面边 / 阵列 / 布尔 13（前 8 项含移植四件 + M3 校准真实 toolId）────────
  IModelApp.tools.register(RoundEdgesTool);
  IModelApp.tools.register(ChamferEdgesTool);
  IModelApp.tools.register(HollowFacesTool);
  IModelApp.tools.register(DraftFacesTool);
  IModelApp.tools.register(CreateHoleTool);
  IModelApp.tools.register(MirrorElementsTool);
  IModelApp.tools.register(LinearPatternTool);
  IModelApp.tools.register(CircularPatternTool);
  IModelApp.tools.register(OffsetFacesTool);
  IModelApp.tools.register(SweepFacesTool);
  IModelApp.tools.register(UniteSolidElementsTool);
  IModelApp.tools.register(SubtractSolidElementsTool);
  IModelApp.tools.register(IntersectSolidElementsTool);

  // ── 测量 6（core-frontend）───────────────────────────────────────────────
  IModelApp.tools.register(MeasureDistanceTool);
  IModelApp.tools.register(MeasureLocationTool);
  IModelApp.tools.register(MeasureAreaByPointsTool);
  IModelApp.tools.register(MeasureLengthTool);
  IModelApp.tools.register(MeasureAreaTool);
  IModelApp.tools.register(MeasureVolumeTool);

  // ── 视图裁剪 5（core-frontend；剖切 2 见头注挂账）────────────────────────
  IModelApp.tools.register(ViewClipClearTool);
  IModelApp.tools.register(ViewClipByPlaneTool);
  IModelApp.tools.register(ViewClipByShapeTool);
  IModelApp.tools.register(ViewClipByRangeTool);
  IModelApp.tools.register(ViewClipByElementTool);

  // ── 装饰（viewer-next 移植件；ACS/网格装饰见头注挂账）────────────────────
  IModelApp.tools.register(ToggleProjectExtentsTool);

  // ── 快捷键子集（Undo/Redo/Delete/Escape；全表移植延后）──────────────────
  registerDefaultShortcuts();
}
