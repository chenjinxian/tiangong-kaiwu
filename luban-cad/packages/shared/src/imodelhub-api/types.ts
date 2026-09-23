/**
 * iModelHub Services API Type Definitions
 *
 * This file contains accurate TypeScript types for the imodelhub-services API
 * to prevent type mismatches between frontend and backend.
 */

// =============================================================================
// Auth API Types
// =============================================================================

/**
 * User registration request
 * POST /api/v1/auth/email/register
 */
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * User role information
 */
export interface UserRole {
  id: number;
  name: string;
}

/**
 * User status information
 */
export interface UserStatus {
  id: number;
  name: string;
}

/**
 * User domain object
 */
export interface User {
  id: number | string;
  email: string | null;
  provider: string;
  socialId?: string | null;
  firstName: string | null;
  lastName: string | null;
  photo?: { id: string; path: string } | null;
  role?: UserRole | null;
  status?: UserStatus;
  createdAt: string; // ISO 8601 format
  updatedAt: string; // ISO 8601 format
  deletedAt: string | null;
}

/**
 * Login request
 * POST /api/v1/auth/email/login
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login response - IMPORTANT: This is the correct structure
 * Previously incorrect assumption: token.accessToken
 * Actual structure: token (string), refreshToken (string)
 */
export interface LoginResponse {
  token: string;        // JWT Access Token (direct string, not nested!)
  refreshToken: string; // JWT Refresh Token
  tokenExpires: number; // Expiration timestamp in milliseconds
  user: User;
}

/**
 * Refresh token request
 * POST /api/v1/auth/refresh
 */
export interface RefreshTokenRequest {
  refreshToken?: string;
}

/**
 * Refresh token response
 */
export interface RefreshTokenResponse {
  token: string;        // New Access Token
  refreshToken: string; // New Refresh Token
  tokenExpires: number; // New expiration timestamp
}

/**
 * Logout request
 * POST /api/v1/auth/logout
 */
export interface LogoutRequest {
  accessToken?: string;
  refreshToken?: string;
}

// =============================================================================
// iTwin API Types
// =============================================================================

/**
 * iTwin class types
 */
export type iTwinClass = 'Project' | 'Asset' | 'Portfolio';

/**
 * iTwin status
 */
export type iTwinStatus = 'Active' | 'Inactive';

/**
 * Create iTwin request
 * POST /api/v1/itwins
 */
export interface CreateiTwinRequest {
  class?: iTwinClass;
  subclass?: string;
  displayName: string;
  number?: string;
  parentId?: string;       // UUID
  iTwinAccountId?: string; // UUID
  description?: string;
  type?: string;
  data?: Record<string, unknown>;
  extent?: Record<string, unknown>;
  status?: iTwinStatus;
  dataCenterLocation?: string;
  ianaTimeZone?: string;
  imageName?: string;
  image?: string;
}

/**
 * Update iTwin request
 * PATCH /api/v1/itwins/:id
 */
export interface UpdateiTwinRequest extends Partial<CreateiTwinRequest> {}

/**
 * iTwin response object
 */
export interface iTwin {
  id: string;
  class: iTwinClass;
  subclass: string;
  displayName: string;
  number?: string;
  parentId?: string;
  iTwinAccountId?: string;
  description?: string;
  type?: string;
  data?: Record<string, unknown>;
  extent?: Record<string, unknown>;
  createdBy?: string;
  createdDateTime: string;      // ISO 8601 format
  lastModifiedDateTime: string; // ISO 8601 format
  status: iTwinStatus;
  dataCenterLocation?: string;
  ianaTimeZone?: string;
  imageName?: string;
  image?: string;
}

/**
 * iTwin list response
 * GET /api/v1/itwins
 */
export interface iTwinListResponse {
  iTwins: iTwin[];
  _links: {
    self: { href: string };
    next?: { href: string };
  };
}

/**
 * Single iTwin response
 * GET /api/v1/itwins/:id
 */
export interface iTwinDetailResponse {
  iTwin: iTwin;
}

/**
 * Pagination parameters for list endpoints
 */
export interface PaginationParams {
  $skip?: number;  // Default: 0
  $top?: number;   // Default: 10
}

// =============================================================================
// iModel API Types
// =============================================================================

/**
 * Create iModel request
 * POST /api/v1/imodels
 */
export interface CreateiModelRequest {
  iTwinId: string;  // Required - parent iTwin ID
  name: string;
  description?: string;
  extent?: Record<string, unknown>;
}

/**
 * iModel response object
 */
export interface iModel {
  id: string;
  name: string;
  description?: string;
  iTwinId: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  // Additional fields as per API spec
}

/**
 * iModel list response
 * GET /api/v1/itwins/:id/imodels
 */
export interface iModelListResponse {
  iModels: iModel[];
  _links: {
    self: { href: string };
    next?: { href: string };
  };
}

// =============================================================================
// Briefcase API Types
// =============================================================================

/**
 * Briefcase information
 */
export interface BriefcaseInfo {
  id: number;
  iModelId: string;
  userId: string | number;
  acquiredAt: string;
  // Additional fields
}

/**
 * Briefcase list response
 */
export interface BriefcaseListResponse {
  briefcases: BriefcaseInfo[];
}

// =============================================================================
// Changeset API Types
// =============================================================================

/**
 * Changeset type
 * 0 = Regular, 1 = Schema, 2 = SchemaAndData
 */
export type ChangesetType = 0 | 1 | 2;

/**
 * Create changeset request
 * POST /api/v1/imodels/:id/changesets
 */
export interface CreateChangesetRequest {
  parentId?: string;
  briefcaseId: number;
  description: string;
  changesType?: ChangesetType;
}

/**
 * Changeset information
 */
export interface ChangesetInfo {
  id: string;
  iModelId: string;
  parentId?: string;
  briefcaseId: number;
  description: string;
  changesType: ChangesetType;
  createdAt: string;
  // Additional fields
}

/**
 * Changeset list response
 */
export interface ChangesetListResponse {
  changesets: ChangesetInfo[];
  totalCount: number;
}

// =============================================================================
// Named Version API Types
// =============================================================================

/**
 * Create named version request
 * POST /api/v1/imodels/:id/namedversions
 */
export interface CreateNamedVersionRequest {
  name: string;
  description?: string;
  changesetId: string;
}

/**
 * Named version information
 */
export interface NamedVersion {
  id: string;
  name: string;
  description?: string;
  changesetId: string;
  createdAt: string;
}

// =============================================================================
// Member API Types
// =============================================================================

/**
 * Add member request
 * POST /api/v1/itwins/:id/members
 */
export interface AddMemberRequest {
  userId: string;
  roleId?: number;
}

/**
 * Update member request
 * PATCH /api/v1/itwins/:id/members/:userId
 */
export interface UpdateMemberRequest {
  roleId?: number;
}

/**
 * Member information
 */
export interface Member {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  joinedAt: string;
}

// =============================================================================
// Error Response Types
// =============================================================================

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/**
 * Validation error with field details
 */
export interface ValidationErrorResponse {
  statusCode: 422;
  errors: Array<{
    property: string;
    message: string;
  }>;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Generic API response wrapper
 */
export type ApiResponse<T> = T | ApiErrorResponse;

/**
 * Nullable type helper
 */
export type Nullable<T> = T | null;

/**
 * ISO 8601 date string
 */
export type ISODateString = string;

/**
 * UUID v4 string
 */
export type UUID = string;
