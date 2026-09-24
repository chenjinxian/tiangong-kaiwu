/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Types aligned with official iTwin Platform API
 * Following patterns from @itwin/itwins-client and @itwin/imodels-client
 */

// =============================================================================
// iTwin (Project) Types - Aligned with @itwin/itwins-client
// Source: /imodelhub-services/docs/itwins.json
// =============================================================================

/**
 * iTwin entity - Aligned with official API
 * Maps to: itwins-client/src/base/interfaces/iTwins.ts
 */
export interface ITwin {
  id: string;
  class: ITwinClass;
  subClass: ITwinSubClass;
  type?: string;
  number?: string;
  displayName: string;
  geographicLocation?: string;
  latitude?: number;
  longitude?: number;
  ianaTimeZone?: string;
  dataCenterLocation?: string;
  status: ITwinStatus;
  parentId?: string;
  iTwinAccountId?: string;
  imageName?: string;
  image?: string;
  createdDateTime: string;
  createdBy: string;
  lastModifiedDateTime: string;
  lastModifiedBy: string;
  // Frontend-specific fields
  isFavorite?: boolean;
}

/**
 * iTwin class enum
 * Maps to: itwins-client ITwinClass
 */
export type ITwinClass = 'Project' | 'Asset' | 'Portfolio';

/**
 * iTwin subclass enum
 * Maps to: itwins-client ITwinSubClass
 */
export type ITwinSubClass =
  | 'ConstructionProject'
  | 'Folder'
  | 'Facility'
  | 'CompoundFacility'
  | 'Building'
  | 'Campus'
  | 'Bridge'
  | 'Road'
  | 'Rail'
  | 'Tunnel'
  | 'Dam'
  | 'WaterTreatmentPlant'
  | 'WaterDistributionSystem'
  | 'Landscape'
  | 'Mine'
  | 'OilAndGasFacility'
  | 'Well'
  | 'Agriculture'
  | 'Park'
  | 'RecreationArea'
  | 'Structure'
  | 'WindFarm'
  | 'SolarFarm'
  | 'PowerPlant'
  | 'TransmissionLine'
  | 'Substation'
  | 'Stream'
  | 'River'
  | 'Coastline'
  | 'Lake'
  | 'Wetland'
  | 'City'
  | 'National';

/**
 * iTwin status enum
 */
export type ITwinStatus = 'Active' | 'Inactive' | 'Trial';

/**
 * Create iTwin request - Aligned with SDK pattern
 * Maps to: itwins-client CreateiTwinRequest
 */
export interface CreateITwinRequest {
  class?: ITwinClass;
  subClass?: ITwinSubClass;
  type?: string;
  displayName: string;
  number?: string;
  geographicLocation?: string;
  latitude?: number;
  longitude?: number;
  ianaTimeZone?: string;
  dataCenterLocation?: string;
  parentId?: string;
  iTwinAccountId?: string;
  imageName?: string;
}

/**
 * Update iTwin request
 */
export interface UpdateITwinRequest {
  class?: ITwinClass;
  subClass?: ITwinSubClass;
  type?: string;
  displayName?: string;
  number?: string;
  geographicLocation?: string;
  latitude?: number;
  longitude?: number;
  ianaTimeZone?: string;
  status?: ITwinStatus;
}

/**
 * Query parameters for getting iTwins
 * Maps to: itwins-client GetiTwinsRequestParams
 */
export interface GetITwinsRequestParams {
  /** OData-style skip */
  skip?: number;
  /** OData-style top (max 1000) */
  top?: number;
  /** Filter by subclass */
  subClass?: ITwinSubClass;
  /** Filter by display name (contains) */
  displayName?: string;
  /** Filter by number */
  number?: string;
  /** Sort field */
  sort?: 'displayName' | 'number' | 'createdDateTime' | 'lastModifiedDateTime';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Query scope */
  scope?: 'me' | 'organization' | 'favorites' | 'recents';
}

/**
 * iTwin list response
 * Maps to: itwins-client iTwinResponseWithPagination
 */
export interface ITwinListResponse {
  iTwins: ITwin[];
  _links: {
    self: { href: string };
    next?: { href: string };
    prev?: { href: string };
  };
}

/**
 * Single iTwin response
 */
export interface ITwinResponse {
  iTwin: ITwin;
}

// =============================================================================
// iModel Types - Aligned with @itwin/imodels-client
// Source: /imodelhub-services/docs/imodels-v2.json
// =============================================================================

/**
 * iModel entity
 * Maps to: imodels-client IModel
 */
export interface IModel {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  iTwinId: string;
  state: IModelState;
  containersEnabled?: number;
  dataCenterLocation?: string;
  extent?: Extent;
  thumbnailUrl?: string;
  thumbnailStoragePath?: string;
  baselineBriefcaseId?: string;
  baselineChangesetIndex?: number;
  changesetCount?: number;
  namedVersionCount?: number;
  briefcaseCount?: number;
  fileSize?: number;
  createdBy?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  _links?: IModelLinks;
}

/**
 * iModel state enum
 * Maps to: imodels-client IModelState
 */
export type IModelState =
  | 'initialized'      // Baseline file uploaded and processed
  | 'notInitialized'   // Created but no baseline file
  | 'inactive'
  | 'deleted';

/**
 * Geographic extent
 */
export interface Extent {
  southWest: Point3d;
  northEast: Point3d;
}

/**
 * 3D Point
 */
export interface Point3d {
  latitude: number;
  longitude: number;
  height?: number;
}

/**
 * iModel HATEOAS links
 */
export interface IModelLinks {
  creator?: { href: string };
  thumbnail?: { href: string };
  imodel?: { href: string };
}

/**
 * Create iModel request
 * Maps to: imodels-client CreateEmptyiModelParams
 */
export interface CreateIModelRequest {
  iTwinId: string;
  name: string;
  description?: string;
  extent?: Extent;
  containersEnabled?: number;
}

/**
 * Update iModel request
 */
export interface UpdateIModelRequest {
  name?: string;
  description?: string;
  extent?: Extent;
  dataCenterLocation?: string;
}

/**
 * Query parameters for getting iModels
 * Maps to: imodels-client GetiModelListParams
 */
export interface GetIModelsRequestParams {
  skip?: number;
  top?: number;
  name?: string;
}

/**
 * iModel list response
 */
export interface IModelListResponse {
  iModels: IModel[];
  _links: {
    self: { href: string };
    next?: { href: string };
    prev?: { href: string };
  };
}

// =============================================================================
// Briefcase Types - Aligned with @itwin/imodels-client
// =============================================================================

/**
 * Briefcase entity
 * Maps to: imodels-client Briefcase
 */
export interface Briefcase {
  briefcaseId: number;
  iModelId: string;
  userId: string;
  acquiredDateTime: string;
  fileSize?: number;
  deviceName?: string;
  applicationId?: string;
  applicationName?: string;
  _links?: BriefcaseLinks;
}

/**
 * Briefcase links
 */
export interface BriefcaseLinks {
  owner?: { href: string };
  creator?: { href: string };
  application?: { href: string };
}

/**
 * Acquire briefcase request
 * Maps to: imodels-client AcquireBriefcaseParams
 */
export interface AcquireBriefcaseRequest {
  deviceName?: string;
  applicationId?: string;
  applicationName?: string;
}

/**
 * Briefcase list response
 */
export interface BriefcaseListResponse {
  briefcases: Briefcase[];
}

// =============================================================================
// Changeset Types - Aligned with @itwin/imodels-client
// =============================================================================

/**
 * Changeset entity
 * Maps to: imodels-client Changeset
 */
export interface Changeset {
  id: string;
  displayName?: string;
  index: number;
  parentId?: string;
  description?: string;
  briefcaseId: number;
  creatorId?: string;
  pushDateTime?: string;
  fileSize?: number;
  _links?: ChangesetLinks;
}

/**
 * Changeset links
 */
export interface ChangesetLinks {
  download?: { href: string };
  upload?: { href: string };
}

/**
 * Create changeset request
 */
export interface CreateChangesetRequest {
  parentId?: string;
  briefcaseId: number;
  description: string;
  changesType?: ChangesetType;
}

/**
 * Changeset type
 */
export type ChangesetType = 0 | 1 | 2;

/**
 * Changeset list response
 */
export interface ChangesetListResponse {
  changesets: Changeset[];
  totalCount?: number;
  _links?: {
    self: { href: string };
    next?: { href: string };
  };
}

// =============================================================================
// Baseline File Upload Types - Aligned with imodels-client
// =============================================================================

/**
 * Baseline file state
 * Maps to: imodels-client BaselineFileState
 */
export type BaselineFileState =
  | 'initialized'   // Successfully uploaded and processed
  | 'notInitialized'; // Not yet uploaded

/**
 * Baseline file information
 */
export interface BaselineFile {
  id: string;
  iModelId: string;
  state: BaselineFileState;
  fileSize: number;
  uploadUrl?: string;
  uploadId?: string;
  _links?: BaselineFileLinks;
}

/**
 * Baseline file links
 */
export interface BaselineFileLinks {
  upload?: { href: string };
  complete?: { href: string };
  confirm?: { href: string };
  creator?: { href: string };
}

/**
 * Initiate baseline file upload response
 */
export interface InitiateBaselineUploadResponse {
  uploadUrl: string;
  uploadId: string;
  expiresAt: string;
}

/**
 * Complete baseline file upload request
 */
export interface CompleteBaselineUploadRequest {
  uploadId: string;
  fileName: string;
  fileSize: number;
  checksum?: string;
}

// =============================================================================
// Named Version Types
// =============================================================================

/**
 * Named version entity
 */
export interface NamedVersion {
  id: string;
  name: string;
  description?: string;
  changesetId: string;
  changesetIndex: number;
  createdDateTime: string;
  createdBy: string;
  _links?: NamedVersionLinks;
}

/**
 * Named version links
 */
export interface NamedVersionLinks {
  creator?: { href: string };
  changeset?: { href: string };
}

/**
 * Create named version request
 */
export interface CreateNamedVersionRequest {
  name: string;
  description?: string;
  changesetId: string;
}

// =============================================================================
// Backward Compatibility Aliases
// These maintain compatibility with existing code while transitioning to SDK naming
// =============================================================================

/** @deprecated Use ITwin instead */
export type Project = ITwin;
/** @deprecated Use ITwinClass instead */
export type ProjectClass = ITwinClass;
/** @deprecated Use ITwinSubClass instead */
export type ProjectSubClass = ITwinSubClass;
/** @deprecated Use ITwinStatus instead */
export type ProjectStatus = ITwinStatus;
/** @deprecated Use CreateITwinRequest instead */
export type CreateProjectRequest = CreateITwinRequest;
/** @deprecated Use UpdateITwinRequest instead */
export type UpdateProjectRequest = UpdateITwinRequest;
/** @deprecated Use ITwinListResponse instead */
export type ProjectSearchResult = ITwinListResponse;
/** @deprecated Use ITwinResponse instead */
export type ProjectResponse = ITwinResponse;
/** @deprecated Use Briefcase instead */
export type BriefcaseInfo = Briefcase;
/** @deprecated Use Changeset instead */
export type ChangesetInfo = Changeset;

// =============================================================================
// Changeset Comparison Types
// =============================================================================

/**
 * Element change type in changeset comparison
 */
export type ElementChangeType = 'added' | 'modified' | 'deleted';

/**
 * Property difference for a changed element
 */
export interface PropertyDifference {
  propertyName: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Changed element in changeset comparison
 */
export interface ChangedElement {
  elementId: string;
  className: string;
  code: string;
  changeType: ElementChangeType;
  propertyDifferences?: PropertyDifference[];
}

/**
 * Changeset comparison result
 */
export interface ChangesetComparisonResult {
  sourceChangesetId: string;
  targetChangesetId: string;
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  changedElements: ChangedElement[];
  totalBytesChanged?: number;
}

// Backward compatibility
/** @deprecated Use ChangesetComparisonResult instead */
export type ChangesetCompareResult = ChangesetComparisonResult;

// =============================================================================
// Conflict Detection Types
// =============================================================================

/**
 * Conflict type - describes the nature of the conflict
 */
export type ConflictType = 'modify-modify' | 'delete-modify' | 'modify-delete' | 'add-add' | 'delete-delete';

/**
 * Element properties for conflict resolution
 */
export interface ConflictElementProps {
  elementId: string;
  className: string;
  code: string;
  geometry?: unknown;
  properties: Record<string, unknown>;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

/**
 * Individual conflict between local and remote changes
 */
export interface Conflict {
  /** Unique identifier for the conflict */
  id: string;
  /** Element ID that has conflict */
  elementId: string;
  /** Type of conflict */
  type: ConflictType;
  /** Local version of the element (our changes) */
  localVersion: ConflictElementProps;
  /** Remote version of the element (their changes) */
  remoteVersion: ConflictElementProps;
  /** Base version (common ancestor) if available */
  baseVersion?: ConflictElementProps;
  /** Current resolution state */
  resolution?: ConflictResolution;
  /** Whether this conflict has been resolved */
  isResolved: boolean;
}

/**
 * Conflict resolution options
 */
export type ConflictResolution = 'local' | 'remote' | 'merged' | 'manual';

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  /** Whether conflicts were detected */
  hasConflicts: boolean;
  /** Total number of conflicts */
  totalConflicts: number;
  /** List of individual conflicts */
  conflicts: Conflict[];
  /** Summary by conflict type */
  summary: {
    modifyModify: number;
    deleteModify: number;
    modifyDelete: number;
    addAdd: number;
  };
  /** The changeset that would be pulled */
  targetChangesetId: string;
  /** Current local changeset */
  currentChangesetId: string;
}

/**
 * Request to detect conflicts before pulling
 */
export interface DetectConflictsRequest {
  iModelId: string;
  briefcaseId: number;
  targetChangesetId: string;
}

/**
 * Request to resolve conflicts
 */
export interface ResolveConflictsRequest {
  iModelId: string;
  briefcaseId: number;
  /** Map of conflict IDs to their resolutions */
  resolutions: Record<string, ConflictResolution>;
  /** Manual merged values for 'manual' resolution */
  manualValues?: Record<string, ConflictElementProps>;
}

/**
 * Result after resolving conflicts
 */
export interface ResolveConflictsResult {
  success: boolean;
  /** Number of conflicts resolved */
  resolvedCount: number;
  /** Conflicts that could not be resolved */
  unresolvedConflicts?: Conflict[];
  /** Error message if resolution failed */
  error?: string;
}
