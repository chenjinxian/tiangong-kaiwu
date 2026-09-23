/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Components
export { IModelCard } from './components/IModelCard.js';
export { CreateIModelDialog } from './components/CreateIModelDialog.js';
export { CreateIModelWorkflow } from './components/CreateIModelWorkflow.js';
export { BriefcaseStatus } from './components/BriefcaseStatus.js';

// Hooks - React Query based (recommended)
export {
  useIModels,
  useIModel,
  useCreateIModelMutation,
  useCreateIModelWithBaselineMutation,
  useDeleteIModelMutation,
  type IModel,
} from './hooks/useIModelsQuery.js';

export { useBriefcase } from './hooks/useBriefcase.js';
export { useIModelPermission, determineEditorMode } from './hooks/useIModelPermission.js';
export { useBaselineUpload } from './hooks/useBaselineUpload.js';

// Types
export type { IModelPermission, EditorMode } from './hooks/useIModelPermission.js';
