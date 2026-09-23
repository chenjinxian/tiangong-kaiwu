/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 */

// Components
export {
  BaseViewer,
  type BaseViewerProps,
  ViewerWithUI,
  type ViewerWithUIProps,
  // Tools
  ViewerToolbar,
  type ViewerToolbarProps,
  ViewCube,
  CompactViewCube,
  type ViewCubeProps,
  MeasurementTools,
  MeasurementPanel,
  type MeasurementToolsProps,
  type MeasurementType,
  type MeasurementResult,
  // New Tools
  ModelPicker,
  type ModelPickerProps,
  type ModelInfo,
  CategoryPicker,
  type CategoryPickerProps,
  type CategoryInfo,
  SelectionTools,
  type SelectionToolsProps,
  ViewSettingsPanel,
  type ViewSettingsPanelProps,
  ViewSwitcher,
  type ViewSwitcherProps,
  type ViewDefinition,
  SavedViewsPanel,
  type SavedViewsPanelProps,
  type SavedView,
  SectionToolsPanel,
  type SectionToolsPanelProps,
} from './components/index.js';

// Hooks
export {
  useIModel,
  useViewport,
  useBriefcaseConnection,
  type UseIModelOptions,
  type UseIModelResult,
  type UseViewportOptions,
  type UseViewportResult,
  type UseBriefcaseConnectionOptions,
  type UseBriefcaseConnectionResult,
} from './hooks/index.js';

// Types
export type {
  ViewerOptions,
  ViewerState,
  IModelLoadResult,
} from './types/index.js';
