/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import {
  IModelApp,
  RotateViewTool,
  PanViewTool,
  FitViewTool,
  ViewUndoTool,
  ViewRedoTool,
  ZoomViewTool,
  WindowAreaTool,
  MeasureDistanceTool as CoreMeasureDistanceTool,
  MeasureLocationTool,
  MeasureAreaByPointsTool,
  MeasureLengthTool,
  MeasureAreaTool as CoreMeasureAreaTool,
  MeasureVolumeTool,
  ViewClipClearTool,
  ViewClipByPlaneTool,
  ViewClipByShapeTool,
  ViewClipByRangeTool,
  ViewClipByElementTool,
} from '@itwin/core-frontend';
import {
  CreateSphereTool, CreateCylinderTool, CreateBoxTool, CreateConeTool, CreateTorusTool,
  MoveElementsTool, RotateElementsTool, CopyElementsTool, DeleteElementsTool,
  // Solid modeling tools from iTwin.js
  UniteSolidElementsTool, SubtractSolidElementsTool, IntersectSolidElementsTool,
  RoundEdgesTool, ChamferEdgesTool, HollowFacesTool, OffsetFacesTool, SweepFacesTool,
  // Sketch tools from iTwin.js
  CreateLineStringTool, CreateArcTool, CreateCircleTool, CreateEllipseTool, CreateRectangleTool, CreateBCurveTool,
} from '@itwin/editor-frontend';
import { LinearPatternTool, CircularPatternTool } from '../modeling/PatternTools.js';
// TODO: Fix @itwin/core-markup module resolution
// import {
//   LineTool,
//   RectangleTool,
//   CircleTool,
//   EllipseTool,
//   ArrowTool,
//   CloudTool,
//   PolygonTool,
//   SketchTool,
//   PlaceTextTool,
//   DistanceTool,
//   SymbolTool,
//   SelectTool as MarkupSelectTool,
// } from '@itwin/core-markup';
import { SetSketchPlaneTool } from '../modeling/SetSketchPlaneTool.js';
import { SelectSubEntityTool } from '../modeling/SelectSubEntityTool.js';
import { DraftFacesTool } from '../modeling/DraftFacesTool.js';
import { CreateHoleTool } from '../modeling/CreateHoleTool.js';
import { MirrorElementsTool } from '../modeling/MirrorElementsTool.js';
import {
  FenceSelectTool,
  SelectAllTool,
  InvertSelectionTool,
  ClearSelectionTool,
  SelectByCategoryTool,
} from '../../src/core/tools/index.js';
// Note: Measurement tools from core-frontend are used instead
// import {
//   MeasureDistanceTool,
//   MeasureAngleTool,
//   MeasureAreaTool,
// } from '../../src/core/measurement/index.js';
import {
  SectionByPlaneTool,
  ClearSectionTool,
} from '../../src/core/section/index.js';
import {
  ToggleACSTool,
} from '../../src/core/decorations/ACSDecoration.js';
import {
  ToggleGridTool,
  GridSettingsTool,
} from '../../src/core/decorations/GridDecoration.js';
import {
  ToggleProjectExtentsTool,
} from '../../src/core/decorations/ProjectExtentsDecoration.js';
import {
  CameraWalkTool,
  FlyToSelectionTool,
} from '../../src/core/animation/index.js';
import {
  ToggleShadowsTool,
  ToggleAOTool,
  SetRenderModeTool,
} from '../../src/core/rendering/index.js';
import { registerDefaultShortcuts } from '../../src/core/shortcuts/index.js';

/**
 * 注册所有编辑器工具
 * 替代 Editor.tsx 中的内联工具注册
 */
export function registerAllTools(): void {
  // View manipulation tools from @itwin/core-frontend
  IModelApp.tools.register(RotateViewTool);
  IModelApp.tools.register(PanViewTool);
  IModelApp.tools.register(FitViewTool);
  IModelApp.tools.register(ZoomViewTool);
  IModelApp.tools.register(WindowAreaTool);
  IModelApp.tools.register(ViewUndoTool);
  IModelApp.tools.register(ViewRedoTool);

  // Solid primitive tools from @itwin/editor-frontend
  IModelApp.tools.register(CreateSphereTool);
  IModelApp.tools.register(CreateCylinderTool);
  IModelApp.tools.register(CreateBoxTool);

  // Sketch tools from @itwin/editor-frontend
  IModelApp.tools.register(CreateLineStringTool);
  IModelApp.tools.register(CreateArcTool);
  IModelApp.tools.register(CreateCircleTool);
  IModelApp.tools.register(CreateEllipseTool);
  IModelApp.tools.register(CreateRectangleTool);
  IModelApp.tools.register(CreateBCurveTool);

  // Transform tools
  IModelApp.tools.register(MoveElementsTool);
  IModelApp.tools.register(RotateElementsTool);
  IModelApp.tools.register(CopyElementsTool);
  IModelApp.tools.register(DeleteElementsTool);

  // Modeling tools - iTwin.js native tools
  IModelApp.tools.register(SetSketchPlaneTool);
  IModelApp.tools.register(SelectSubEntityTool);
  // Solid modeling tools from @itwin/editor-frontend
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

  // Boolean tools - iTwin.js native tools
  IModelApp.tools.register(UniteSolidElementsTool);
  IModelApp.tools.register(SubtractSolidElementsTool);
  IModelApp.tools.register(IntersectSolidElementsTool);

  // Solid primitive tools (5) - additional primitives
  IModelApp.tools.register(CreateConeTool);
  IModelApp.tools.register(CreateTorusTool);

  // Markup tools (12) - Temporarily disabled due to module resolution issue
  // IModelApp.tools.register(LineTool);
  // IModelApp.tools.register(RectangleTool);
  // IModelApp.tools.register(CircleTool);
  // IModelApp.tools.register(EllipseTool);
  // IModelApp.tools.register(ArrowTool);
  // IModelApp.tools.register(CloudTool);
  // IModelApp.tools.register(PolygonTool);
  // IModelApp.tools.register(SketchTool);
  // IModelApp.tools.register(PlaceTextTool);
  // IModelApp.tools.register(DistanceTool);
  // IModelApp.tools.register(SymbolTool);
  // IModelApp.tools.register(MarkupSelectTool);

  // View clip tools (5)
  IModelApp.tools.register(ViewClipClearTool);
  IModelApp.tools.register(ViewClipByPlaneTool);
  IModelApp.tools.register(ViewClipByShapeTool);
  IModelApp.tools.register(ViewClipByRangeTool);
  IModelApp.tools.register(ViewClipByElementTool);

  // Enable AccuDraw
  void IModelApp.tools.run('AccuDraw.SessionToggle');

  // Selection tools
  IModelApp.tools.register(FenceSelectTool);
  IModelApp.tools.register(SelectAllTool);
  IModelApp.tools.register(InvertSelectionTool);
  IModelApp.tools.register(ClearSelectionTool);
  IModelApp.tools.register(SelectByCategoryTool);

  // Measurement tools (6)
  IModelApp.tools.register(CoreMeasureDistanceTool);
  IModelApp.tools.register(MeasureLocationTool);
  IModelApp.tools.register(MeasureAreaByPointsTool);
  IModelApp.tools.register(MeasureLengthTool);
  IModelApp.tools.register(CoreMeasureAreaTool);
  IModelApp.tools.register(MeasureVolumeTool);

  // Section/clipping tools
  IModelApp.tools.register(SectionByPlaneTool);
  IModelApp.tools.register(ClearSectionTool);

  // Decoration tools (ACS, Grid, Project Extents)
  IModelApp.tools.register(ToggleACSTool);
  IModelApp.tools.register(ToggleGridTool);
  IModelApp.tools.register(GridSettingsTool);
  IModelApp.tools.register(ToggleProjectExtentsTool);

  // Animation tools
  IModelApp.tools.register(CameraWalkTool);
  IModelApp.tools.register(FlyToSelectionTool);

  // Rendering tools
  IModelApp.tools.register(ToggleShadowsTool);
  IModelApp.tools.register(ToggleAOTool);
  IModelApp.tools.register(SetRenderModeTool);

  // Keyboard shortcuts
  registerDefaultShortcuts();
}
