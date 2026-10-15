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
 * 改道（Sync S3）：iModel 资源自身的 `_links` 无 download；官方契约把链接放在
 * GET /imodels/:id/baselinefile 响应的 `_links.download.href`。兼容两种线格式：
 * 官方 `{baselineFile: {_links: {download: {href}}}}` 包络与平铺 `{_links: {download}}`。
 * 缺席 => NoDownloadLinkError（禁用入口，勿猜）。
 * 注：imodelhub-services 当前 getBaselineFile 尚未回 `_links`（仅 state/fileSize 等
 * 平铺字段），故当下实际行为即缺席分支；hub 按官方契约补齐后本函数自然生效。
 */
export async function getDownloadUrl(iModelId: string): Promise<string> {
  const response = await fetchWithAuth(`/imodels/${iModelId}/baselinefile`);

  const result = await response.json() as {
    baselineFile?: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `_links` is the external iModels API contract (HAL style)
      _links?: { download?: { href?: string } };
    };
    // eslint-disable-next-line @typescript-eslint/naming-convention -- `_links` is the external iModels API contract (HAL style)
    _links?: { download?: { href?: string } };
  };
  const href = result.baselineFile?._links?.download?.href ?? result._links?.download?.href;
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
