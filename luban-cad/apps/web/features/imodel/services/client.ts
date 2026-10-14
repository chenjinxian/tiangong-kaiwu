/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iModel Service Client
 * Provides iModel mutations and file operations
 */

import { fetchWithAuth } from '../../../shared/api/httpClient.js';
import { API_BASE_URL } from '../../../shared/api/baseUrl.js';
import type { IModelProgressPayload } from '@luban-cad/shared';

/**
 * Delete an iModel by ID
 */
export async function deleteIModel(iModelId: string): Promise<void> {
  await fetchWithAuth(`/imodels/${iModelId}`, {
    method: 'DELETE',
  });
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
  const response = await fetchWithAuth(`/imodels/${iModelId}`);

  // eslint-disable-next-line @typescript-eslint/naming-convention -- `_links` is the external iModels API contract (HAL style)
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
export async function getIModelProgress(iModelId: string): Promise<IModelProgressPayload> {
  const response = await fetchWithAuth(`/api/imodels/${iModelId}/progress`, {
    baseUrl: API_BASE_URL,
  });
  return response.json() as Promise<IModelProgressPayload>;
}

/**
 * Retry failed iModel initialization via modeling-server -> imodelhub-services requeue
 */
export async function retryIModel(iModelId: string, iTwinId: string, imodelName?: string): Promise<void> {
  await fetchWithAuth(`/api/imodels/${iModelId}/retry`, {
    baseUrl: API_BASE_URL,
    method: 'POST',
    body: JSON.stringify({ iTwinId, imodelName }),
  });
}

/**
 * Rename an iModel
 */
export async function renameIModel(iModelId: string, newName: string, newDescription?: string): Promise<void> {
  await fetchWithAuth(`/imodels/${iModelId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: newName,
      ...(newDescription !== undefined && { description: newDescription }),
    }),
  });
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
  const response = await fetchWithAuth(`/imodels/${sourceIModelId}/clone`, {
    method: 'POST',
    body: JSON.stringify({
      name: newName,
      targetITwinId,
    }),
  });

  const location = response.headers.get('Location');
  if (!location) {
    throw new Error('Clone succeeded but the response carried no Location header');
  }
  const iModelId = location.substring(location.lastIndexOf('/') + 1);
  return { iModelId };
}
