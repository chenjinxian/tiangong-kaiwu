/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iModel Service Client
 * Provides iModel mutations and file operations
 */

import { getAuthorization } from '../../../shared/services/imodels/client.js';

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';
const API_URL = import.meta.env.VITE_API_URL || '';

export interface IModelProgress {
  step: string;
  progress: number;
  updatedAt?: string;
}

/**
 * Delete an iModel by ID
 */
export async function deleteIModel(iModelId: string): Promise<void> {
  const auth = await getAuthorization();
  const response = await fetch(`${BACKEND_URL}/imodels/${iModelId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to delete iModel: ${response.statusText}`);
  }
}

/**
 * Thrown when the hub does not expose a download link for an iModel.
 * UI should disable the download affordance when this is caught.
 */
export class NoDownloadLinkError extends Error {
  constructor(iModelId: string) {
    super(`No download link available for iModel ${iModelId}`);
    this.name = 'NoDownloadLinkError';
  }
}

/**
 * Get a download URL for an iModel baseline file.
 * Follows the official API pattern: the link, when present, is advertised as
 * `_links.download.href` on the iModel resource itself — there is no separate
 * download route. Absent link => NoDownloadLinkError (disable, don't guess).
 */
export async function getDownloadUrl(iModelId: string): Promise<string> {
  const auth = await getAuthorization();
  const response = await fetch(`${BACKEND_URL}/imodels/${iModelId}`, {
    headers: {
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to get iModel: ${response.statusText}`);
  }

  const result = await response.json() as { _links?: { download?: { href?: string } } };
  const href = result._links?.download?.href;
  if (!href) {
    throw new NoDownloadLinkError(iModelId);
  }
  return href;
}

/**
 * Get initialization progress for an iModel from the modeling-server
 */
export async function getIModelProgress(iModelId: string): Promise<IModelProgress> {
  const auth = await getAuthorization();
  const response = await fetch(`${API_URL}/api/imodels/${iModelId}/progress`, {
    headers: {
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch progress');
  }
  return response.json() as Promise<IModelProgress>;
}

/**
 * Retry failed iModel initialization via modeling-server -> webhook-agent
 */
export async function retryIModel(iModelId: string, iTwinId: string, imodelName?: string): Promise<void> {
  const auth = await getAuthorization();
  const response = await fetch(`${API_URL}/api/imodels/${iModelId}/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
    body: JSON.stringify({ iTwinId, imodelName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to retry iModel initialization');
  }
}

/**
 * Rename an iModel
 */
export async function renameIModel(iModelId: string, newName: string, newDescription?: string): Promise<void> {
  const auth = await getAuthorization();
  const response = await fetch(`${BACKEND_URL}/imodels/${iModelId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
    body: JSON.stringify({
      name: newName,
      ...(newDescription !== undefined && { description: newDescription }),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to rename iModel: ${response.statusText}`);
  }
}

/**
 * Copy an iModel to the same or different project.
 * Uses the official clone endpoint (POST /imodels/{id}/clone), which answers
 * 201 + Location header pointing at the new iModel (no JSON body).
 */
export async function copyIModel(
  sourceIModelId: string,
  targetITwinId: string,
  newName: string
): Promise<{ iModelId: string }> {
  const auth = await getAuthorization();
  const response = await fetch(`${BACKEND_URL}/imodels/${sourceIModelId}/clone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
    body: JSON.stringify({
      name: newName,
      targetITwinId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to copy iModel: ${response.statusText}`);
  }

  const location = response.headers.get('Location');
  if (!location) {
    throw new Error('Clone succeeded but the response carried no Location header');
  }
  const iModelId = location.substring(location.lastIndexOf('/') + 1);
  return { iModelId };
}
