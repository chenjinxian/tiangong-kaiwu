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
 * Get a download URL for an iModel baseline file
 * Returns a presigned URL or direct download link
 */
export async function getDownloadUrl(iModelId: string): Promise<string> {
  const auth = await getAuthorization();
  const response = await fetch(`${BACKEND_URL}/imodels/${iModelId}/download`, {
    headers: {
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to get download URL: ${response.statusText}`);
  }

  const result = await response.json() as { url: string };
  return result.url;
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
 * Copy an iModel to the same or different project
 */
export async function copyIModel(
  sourceIModelId: string,
  targetITwinId: string,
  newName: string
): Promise<{ iModelId: string }> {
  const auth = await getAuthorization();
  const response = await fetch(`${BACKEND_URL}/imodels/${sourceIModelId}/copy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
    body: JSON.stringify({
      targetITwinId,
      newName,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to copy iModel: ${response.statusText}`);
  }

  return response.json() as Promise<{ iModelId: string }>;
}

/**
 * Move an iModel to a different project
 */
export async function moveIModel(
  iModelId: string,
  sourceITwinId: string,
  targetITwinId: string
): Promise<void> {
  const auth = await getAuthorization();
  const response = await fetch(`${BACKEND_URL}/imodels/${iModelId}/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${auth.scheme} ${auth.token}`,
    },
    body: JSON.stringify({
      sourceITwinId,
      targetITwinId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to move iModel: ${response.statusText}`);
  }
}
