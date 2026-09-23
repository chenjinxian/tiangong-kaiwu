/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Types aligned with official iTwin Platform API
 * Following patterns from @itwin/itwins-client and @itwin/imodels-client
 */

// =============================================================================
// iTwin Types (formerly Project) - Aligned with @itwin/itwins-client
// =============================================================================
export type {
  // Entities
  ITwin,
  ITwinClass,
  ITwinSubClass,
  ITwinStatus,

  // Requests
  CreateITwinRequest,
  UpdateITwinRequest,
  GetITwinsRequestParams,

  // Responses
  ITwinListResponse,
  ITwinResponse,

  // Backward compatibility aliases
  Project,
  ProjectClass,
  ProjectSubClass,
  ProjectStatus,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectSearchResult,
  ProjectResponse,
} from './projects/types.js';

// =============================================================================
// iModel Types - Aligned with @itwin/imodels-client
// =============================================================================
export type {
  // Entities
  IModel,
  IModelState,
  Extent,
  Point3d,
  IModelLinks,

  // Requests
  CreateIModelRequest,
  UpdateIModelRequest,
  GetIModelsRequestParams,

  // Responses
  IModelListResponse,
} from './projects/types.js';

// =============================================================================
// Briefcase Types
// =============================================================================
export type {
  Briefcase,
  BriefcaseLinks,
  AcquireBriefcaseRequest,
  BriefcaseListResponse,

  // Backward compatibility
  BriefcaseInfo,
} from './projects/types.js';

// =============================================================================
// Changeset Types
// =============================================================================
export type {
  Changeset,
  ChangesetLinks,
  CreateChangesetRequest,
  ChangesetType,
  ChangesetListResponse,

  // Backward compatibility
  ChangesetInfo,

  // Changeset Comparison Types
  ElementChangeType,
  PropertyDifference,
  ChangedElement,
  ChangesetComparisonResult,
  ChangesetCompareResult,
} from './projects/types.js';

// =============================================================================
// Baseline File Upload Types
// =============================================================================
export type {
  BaselineFile,
  BaselineFileState,
  BaselineFileLinks,
  InitiateBaselineUploadResponse,
  CompleteBaselineUploadRequest,
} from './projects/types.js';

// =============================================================================
// Named Version Types
// =============================================================================
export type {
  NamedVersion,
  NamedVersionLinks,
  CreateNamedVersionRequest,
} from './projects/types.js';

// =============================================================================
// Conflict Detection Types
// =============================================================================
export type {
  Conflict,
  ConflictType,
  ConflictElementProps,
  ConflictResolution,
  ConflictDetectionResult,
  DetectConflictsRequest,
  ResolveConflictsRequest,
  ResolveConflictsResult,
} from './projects/types.js';

// =============================================================================
// Auth Types
// =============================================================================
export type {
  User,
  JwtPayload,
  LoginCredentials,
  RegisterData,
  AuthResponse,
  RefreshTokenRequest,
  PasswordResetRequest,
  ChangePasswordRequest,
  LoginResponse,
  RefreshTokenResponse,
} from './auth/types.js';

// =============================================================================
// Webhook Types
// =============================================================================
export type {
  WebhookEventType,
  WebhookEvent,
  WebhookSubscription,
  CreateWebhookSubscriptionRequest,
  UpdateWebhookSubscriptionRequest,
  WebhookSubscriptionResponse,
  WebhookDelivery,
  WebhookProcessingResult,
  NotificationMessage,
  WebhookEventFilter,
  PaginatedWebhookEvents,
  // Specific event types
  IModelCreatedEvent,
  IModelDeletedEvent,
  NamedVersionCreatedEvent,
  ChangesetPushedEvent,
  ChangesReadyEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberRoleUpdatedEvent,
  RoleAssignedEvent,
  RoleUnassignedEvent,
  InvitationCreatedEvent,
  ITwinCreatedEvent,
  ITwinDeletedEvent,
  ITwinUpdatedEvent,
  SynchronizationJobCompletedEvent,
  TransformationJobCompletedEvent,
  RealityModelingJobCompletedV1Event,
  RealityModelingJobCompletedV2Event,
  RealityAnalysisJobCompletedEvent,
  RealityConversionJobCompletedEvent,
  ChangedElementsJobCompletedEvent,
  ExportJobCompletedEvent,
  AnyWebhookEvent,
} from './webhooks/types.js';

// =============================================================================
// RPC Interface
// =============================================================================
export { OpenCloudRpcInterface } from './rpc/OpenCloudRpcInterface.js';

// =============================================================================
// Error Types
// =============================================================================
export {
  OpenCloudCADError,
  OpenCloudCADErrorCode,
  isOpenCloudCADError,
} from './errors/OpenCloudCADError.js';

// =============================================================================
// IPC Interface
// =============================================================================
export { openCloudIpcChannel } from './OpenCloudIpcInterface.js';
export type { OpenCloudIpcInterface, BriefcaseDownloadResult, CadFeatureRecord } from './OpenCloudIpcInterface.js';
