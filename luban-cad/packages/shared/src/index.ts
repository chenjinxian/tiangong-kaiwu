/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Types aligned with official iTwin Platform API
 * Following patterns from @itwin/itwins-client and @itwin/imodels-client
 */

// 兼容别名再导出（第 29–36、69、83、90 行）：Project*/BriefcaseInfo/ChangesetInfo/
// ChangesetCompareResult 是历史公开 API，线上契约与持久化 schema 的迁移窗口内
// 仍被消费；新代码请用新名。
/* eslint-disable @typescript-eslint/no-deprecated -- 兼容别名再导出 */

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
/* eslint-enable @typescript-eslint/no-deprecated */

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
  // Content payload aliases (envelope-free) + local extension contracts
  IModelCreatedContent,
  IModelDeletedContent,
  ChangesetPushedContent,
  NamedVersionCreatedContent,
  MemberAddedContent,
  MemberRemovedContent,
  MemberRoleUpdatedContent,
  IModelCreatedNeedBaselineEvent,
  IModelProgressPayload,
  IModelProgressEvent,
} from './webhooks/types.js';

// =============================================================================
// RPC Interface
// =============================================================================
export { LubanRpcInterface } from './rpc/LubanRpcInterface.js';
export { LubanFeatureRpcInterface } from './rpc/LubanFeatureRpcInterface.js';
export type {
  LubanFeatureType, ExtrudeParams, FeatureOp, FeatureTreeEntry, FeatureOpResult,
  // M3-a v1.1
  LubanTopologyId, FilletEdgeRef, FilletParams, FeatureParams, PreviewResult, FeaturePreviewGeometryDto,
  FeatureFormField, FeatureFormModel,
  FeatureFormFieldKind, FeatureFormModelEntry,
  // M3-b v1.2
  SketchEntityDto, SketchConstraintDto, SketchSolveStatusDto, SketchSolveStateDto, SketchDto, SketchSummaryDto,
  // v1.35（ADR-0009 切片 1a）
  SketchExternalRef, SketchProjectedMarker, SketchProjectionRequest,
  // Tutorial 2 v1.19
  SketchRef, SketchPointDto, FeatureBooleanOperation, MassPropertiesDto,
  // RW2-T6 v1.4
  ChamferParams,
  // RW2-T7 v1.5
  ShellParams,
  // M6-a v1.6
  SketchRegionDto, SketchPlaneDto,
  // M6-b v1.7（T2）
  RevolveParams,
  // M7 v1.10（boolean 草图驱动）
  BooleanParams,
  // B2 v1.11（loft 多截面放样）
  LoftParams,
  // B3 v1.12（sweep 轮廓沿路径）
  SweepParams,
  // B4 v1.13（mirror 平面镜像）
  MirrorParams,
  MirrorPlaneLine,
  // B5 v1.14（pattern PART 级阵列）
  PatternParams,
  // B6 M-A3.1 v1.15（NEW-body / body 读面）
  BodyRef, BodyInfo,
  // B6 M-A4.1 v1.16（body boolean）
  BooleanBodiesParams,
  // B-model P2.2 v1.18（Part Studio 注册表）
  PartStudioInfo,
  // ADR-0006 切片 A（v1.26，简单钻孔）
  HoleParams,
  HoleVertexRef,
  // ADR-0006 切片 B1（v1.29，cPlane 基准面）
  CPlaneParams,
  CPlaneReference,
  FaceExtrudeParams,
  FeaturePatternParams,
  PatternAxisLine,
  TransformParams,
  SplitPartParams,
  MoveFaceParams,
  FeatureMirrorParams,
} from './rpc/LubanFeatureRpcInterface.js';

// =============================================================================
// 草图 imprint 面域选择（纯几何工具，backend 离线回放 + web 真栈回放共用）
// =============================================================================
export {
  imprintEdgeSideFromSign,
  resolveImprintEdgeGeometry,
  pickImprintRegionByEdgeSide,
} from './sketch/imprint-region.js';
export type {
  ImprintEdgeSide,
  ImprintEdgeGeometry,
  ImprintEdgeRegionPick,
} from './sketch/imprint-region.js';

// =============================================================================
// 面域面积证据选择（2026-11-09 P2.2：面选择查询在被分割面集上的精确反解）
// =============================================================================
export { selectProfileRegionsByArea } from './sketch/profile-area-select.js';
export type {
  AreaSelectableRegion,
  ProfileAreaSelectOptions,
  ProfileAreaSelection,
  RegionBoundsMm,
  RegionCentroidMm,
  RegionFaceEvidence,
} from './sketch/profile-area-select.js';

// =============================================================================
// op DSL v1（RW2-T5：FeatureOp 链双向序列化，KCL 等价物第一步）
// =============================================================================
export { opsToDsl, dslToOps, OpDslParseError } from './opDsl.js';
export type { OpDslValidator, OpDslParseOptions } from './opDsl.js';

// =============================================================================
// Error Types
// =============================================================================
export {
  LubanCADError,
  LubanCADErrorCode,
  isLubanCADError,
} from './errors/LubanCADError.js';

// =============================================================================
// IPC Interface
// =============================================================================
export { lubanIpcChannel } from './LubanIpcInterface.js';
export type { LubanIpcInterface, BriefcaseDownloadResult } from './LubanIpcInterface.js';
export { LUBAN_INIT_TXN_DESCRIPTION } from './constants.js';
