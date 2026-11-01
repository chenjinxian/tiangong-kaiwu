/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Error types following SDK patterns from @itwin/imodels-client
 */

/**
 * Error codes for LubanCAD operations
 * Maps to: imodels-client IModelsErrorCode
 */
export type LubanCADErrorCode =
  // Authentication errors
  | 'Unauthorized'
  | 'TokenExpired'
  | 'InvalidCredentials'

  // Authorization errors
  | 'Forbidden'
  | 'InsufficientPermissions'

  // Resource errors
  | 'NotFound'
  | 'AlreadyExists'
  | 'Conflict'

  // Validation errors
  | 'InvalidRequest'
  | 'ValidationFailed'
  | 'MissingRequiredProperty'

  // iModel specific errors
  | 'iModelNotInitialized'
  | 'iModelAlreadyInitialized'
  | 'BaselineFileUploadFailed'
  | 'BaselineFileProcessingFailed'

  // Briefcase errors
  | 'BriefcaseNotFound'
  | 'BriefcaseAlreadyAcquired'
  | 'MaximumBriefcasesExceeded'

  // Changeset errors
  | 'ChangesetNotFound'
  | 'InvalidChangesetParent'

  // Network/IO errors
  | 'NetworkError'
  | 'Timeout'
  | 'UploadFailed'
  | 'DownloadFailed'

  // Generic errors
  | 'Unknown'
  | 'InternalServerError';

/**
 * Standard error structure for LubanCAD
 * Maps to: imodels-client IModelsError
 */
export class LubanCADError extends Error {
  /**
   * Error code categorizing the error
   */
  public readonly code: LubanCADErrorCode;

  /**
   * HTTP status code (if applicable)
   */
  public readonly statusCode?: number;

  /**
   * Additional error details
   */
  public readonly details?: Record<string, unknown>;

  /**
   * Original error that caused this error
   */
  public readonly originalError?: Error;

  constructor(params: {
    code: LubanCADErrorCode;
    message: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    originalError?: Error;
  }) {
    super(params.message);
    this.name = 'LubanCADError';
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.details = params.details;
    this.originalError = params.originalError;

    // Maintain proper stack trace in V8 environments
    const errorConstructor = Error as any;
    if (errorConstructor.captureStackTrace) {
      errorConstructor.captureStackTrace(this, LubanCADError);
    }
  }

  // 公共错误分类 API 以方法形态发布（前后端共用），改成访问器属破坏性变更。
  /* eslint-disable @itwin/prefer-get -- 公共 API 形态稳定 */
  /**
   * Check if this is a specific error type
   */
  public isCode(code: LubanCADErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Check if this is an authentication error
   */
  public isAuthenticationError(): boolean {
    return ['Unauthorized', 'TokenExpired', 'InvalidCredentials'].includes(this.code);
  }

  /**
   * Check if this is a not found error
   */
  public isNotFoundError(): boolean {
    return this.code === 'NotFound';
  }

  /**
   * Check if this is a validation error
   */
  public isValidationError(): boolean {
    return ['InvalidRequest', 'ValidationFailed', 'MissingRequiredProperty'].includes(this.code);
  }

  /**
   * Check if this is a network error (potentially retryable)
   */
  public isRetryableError(): boolean {
    return ['NetworkError', 'Timeout', 'InternalServerError'].includes(this.code);
  }
  /* eslint-enable @itwin/prefer-get */

  /**
   * Create a simple error representation for logging
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Type guard to check if an error is an LubanCADError
 */
export function isLubanCADError(error: unknown): error is LubanCADError {
  return error instanceof LubanCADError;
}

/**
 * Create an error from an HTTP response
 */
export function createErrorFromResponse(
  statusCode: number,
  responseData: unknown,
  originalError?: Error
): LubanCADError {
  const data = responseData as Record<string, unknown>;
  const message = (data?.message as string) || (data?.error as string) || 'Unknown error';

  // Map HTTP status codes to error codes
  let code: LubanCADErrorCode = 'Unknown';

  switch (statusCode) {
    case 400:
      code = 'InvalidRequest';
      break;
    case 401:
      code = 'Unauthorized';
      break;
    case 403:
      code = 'Forbidden';
      break;
    case 404:
      code = 'NotFound';
      break;
    case 409:
      code = 'Conflict';
      break;
    case 422:
      code = 'ValidationFailed';
      break;
    case 429:
      code = 'Timeout';
      break;
    case 500:
    case 502:
    case 503:
    case 504:
      code = 'InternalServerError';
      break;
  }

  return new LubanCADError({
    code,
    message,
    statusCode,
    details: data,
    originalError,
  });
}
