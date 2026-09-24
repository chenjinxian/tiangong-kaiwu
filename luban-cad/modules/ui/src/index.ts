/**-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * LubanCAD UI Module
 * React components and hooks for LubanCAD
 *
 * @packageDocumentation
 */

// Components
export { CloudCadViewer } from "./components/CloudCadViewer.js";
export { FeatureTree } from "./components/FeatureTree.js";
export { MainToolbar } from "./components/MainToolbar.js";
export { SketchToolbar } from "./components/SketchToolbar.js";
export { Toolbar } from "./components/Toolbar.js";
export { ToolButton } from "./components/ToolButton.js";

// Context
export {
  CloudCadContext,
  CloudCadProvider,
  type CloudCadContextValue,
  type CloudCadProviderProps,
} from "./context/CloudCadContext.js";

// Hooks
export { useCloudCad } from "./hooks/useCloudCad.js";
export { useFeatureManager } from "./hooks/useFeatureManager.js";
export { useSketch } from "./hooks/useSketch.js";

// Version
export const UI_VERSION = "2.0.0";
