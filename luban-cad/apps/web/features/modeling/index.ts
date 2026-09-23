/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Solid Modeling Tools - Native iTwin.js tools from @itwin/editor-frontend
// RoundEdgesTool, ChamferEdgesTool, HollowFacesTool, OffsetFacesTool, SweepFacesTool
// UniteSolidElementsTool, SubtractSolidElementsTool, IntersectSolidElementsTool
// are now imported directly from @itwin/editor-frontend

// Custom Tools
export { SelectSubEntityTool, runSelectSubEntityTool } from './SelectSubEntityTool.js';
export { SetSketchPlaneTool } from './SetSketchPlaneTool.js';
export { DraftFacesTool, runDraftFacesTool } from './DraftFacesTool.js';
export { CreateHoleTool } from './CreateHoleTool.js';
export { MirrorElementsTool } from './MirrorElementsTool.js';
export { LinearPatternTool, CircularPatternTool } from './PatternTools.js';

// Components
export { ChamferEdgesDialog } from './components/ChamferEdgesDialog.js';
export { HollowFacesDialog } from './components/HollowFacesDialog.js';
export { RoundEdgesDialog } from './components/RoundEdgesDialog.js';
export { OffsetFacesDialog } from './components/OffsetFacesDialog.js';
export { SweepFacesDialog } from './components/SweepFacesDialog.js';
export { SubEntityPicker } from './components/SubEntityPicker.js';

// Hooks
export { useSolidModeling } from './hooks/useSolidModeling.js';
export { useSubEntitySelection } from './hooks/useSubEntitySelection.js';

// Types
export type {
  SolidModelingOptions,
  SolidModelingState,
  BlendEdgesParams,
  ChamferEdgesParams,
  HollowFacesParams,
  OffsetFacesParams,
} from './hooks/useSolidModeling.js';
