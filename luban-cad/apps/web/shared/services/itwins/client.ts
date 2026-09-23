/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iTwins Client with Enhanced Error Handling
 * Wraps the official @itwin/itwins-client with better error handling
 */

import {
  type ITwin,
  ITwinsAccessClient,
  ITwinSubClass,
} from '@itwin/itwins-client';
import { getValidAccessToken, refreshAccessToken } from '../../../features/auth/services/auth/client.js';

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';

/**
 * Custom error class for iTwins API errors
 * Preserves HTTP status code for proper error handling
 */
export class ITwinsApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ITwinsApiError';
  }

  public get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  public get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  public get isForbidden(): boolean {
    return this.statusCode === 403;
  }
}

/**
 * Raw API client for direct fetch operations
 * Handles token refresh and automatic retry on 401 errors
 */
async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {},
  retryCount = 0
): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new ITwinsApiError('No authentication token', 401);
  }

  const url = `${BACKEND_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 401 errors - try to refresh token and retry once
  if (response.status === 401 && retryCount === 0) {
    try {
      await refreshAccessToken();
      // Retry the request with the new token
      return await fetchWithAuth(endpoint, options, retryCount + 1);
    } catch {
      // Refresh failed, throw 401 error
      throw new ITwinsApiError('Authentication failed', 401, 'Unauthorized');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ITwinsApiError(
      errorData.message || `HTTP ${response.status}`,
      response.status,
      errorData.code
    );
  }

  return response;
}

/**
 * Get a single iTwin by ID with proper 404 handling
 * Falls back to raw fetch if SDK returns generic error
 */
export async function getITwin(iTwinId: string): Promise<ITwin> {
  try {
    // Use fetchWithAuth which handles token refresh automatically
    const response = await fetchWithAuth(`/itwins/${iTwinId}`);
    const data = await response.json();

    // Backend returns { iTwin: { ... } }
    if (data.iTwin) {
      return data.iTwin;
    }

    // Fallback if response format is different
    return data;
  } catch (error) {
    if (error instanceof ITwinsApiError) {
      throw error;
    }

    // Handle SDK errors that don't provide status codes
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for common error patterns
    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      throw new ITwinsApiError(`iTwin with id ${iTwinId} not found`, 404, 'NotFound');
    }
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      throw new ITwinsApiError('Unauthorized', 401, 'Unauthorized');
    }

    throw new ITwinsApiError(errorMessage, 500);
  }
}

/**
 * Query iTwins with proper error handling
 */
export async function queryITwins(
  _subClass: ITwinSubClass = ITwinSubClass.Project,
  search?: string
): Promise<ITwin[]> {
  const params = new URLSearchParams();
  // Note: imodelhub-service stores 'subclass' as empty string, so we filter by 'class' instead
  params.append('class', 'Project');
  if (search) {
    params.append('$search', search);
  }

  const response = await fetchWithAuth(`/itwins?${params.toString()}`);
  const data = await response.json();

  // Backend returns { iTwins: [...] }
  return data.iTwins || [];
}

/**
 * Create a new iTwin
 */
export async function createITwin(data: {
  displayName: string;
  subClass?: ITwinSubClass;
  description?: string;
}): Promise<ITwin> {
  const response = await fetchWithAuth('/itwins', {
    method: 'POST',
    body: JSON.stringify({
      displayName: data.displayName,
      subClass: data.subClass || ITwinSubClass.Project,
      description: data.description,
    }),
  });

  const result = await response.json();
  return result.iTwin;
}

/**
 * Update an iTwin
 */
export async function updateITwin(
  iTwinId: string,
  data: {
    displayName?: string;
    description?: string;
    status?: string;
  }
): Promise<ITwin> {
  const response = await fetchWithAuth(`/itwins/${iTwinId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  const result = await response.json();
  return result.iTwin;
}

/**
 * Delete an iTwin
 */
export async function deleteITwin(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/${iTwinId}`, {
    method: 'DELETE',
  });
}

/**
 * Query favorite iTwins
 */
export async function queryFavoriteITwins(): Promise<ITwin[]> {
  const response = await fetchWithAuth('/itwins/favorites');
  const data = await response.json();
  return data.iTwins || [];
}

/**
 * Query recent iTwins
 */
export async function queryRecentITwins(): Promise<ITwin[]> {
  const response = await fetchWithAuth('/itwins/recents');
  const data = await response.json();
  return data.iTwins || [];
}

/**
 * Add iTwin to favorites
 */
export async function addToFavorites(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/favorites/${iTwinId}`, {
    method: 'POST',
  });
}

/**
 * Remove iTwin from favorites
 */
export async function removeFromFavorites(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/favorites/${iTwinId}`, {
    method: 'DELETE',
  });
}

/**
 * Add iTwin to recents
 */
export async function addToRecents(iTwinId: string): Promise<void> {
  await fetchWithAuth(`/itwins/recents/${iTwinId}`, {
    method: 'POST',
  });
}

// ============================================================================
// Legacy SDK Client (kept for backward compatibility)
// ============================================================================

/**
 * iTwins Client instance
 * Note: ITwinsAccessClient expects the base URL including /itwins path
 */
export const iTwinsClient = new ITwinsAccessClient(`${BACKEND_URL}/itwins`);

/**
 * Get authorization token for SDK operations
 * Returns "Bearer <token>" format required by backend
 * Note: @itwin/itwins-client sends this directly as the Authorization header
 */
export async function getAuthorization(): Promise<string> {
  const token = await getValidAccessToken();
  return token ? `Bearer ${token}` : '';
}

/**
 * Re-export SDK types
 */
export { ITwinSubClass };
export type {
  ITwin,
  ITwinsQueryArg,
} from '@itwin/itwins-client';
