/**
 * Briefcase Client — LubanCAD 自有面（modeling-server :5401 自有路由）。
 * 契约同步裁决（Sync S3）：本 client 指向 modeling-server 自有路由，不属于
 * imodelhub 官方契约面，不随本波 hub 契约重写改动。
 */

import { fetchWithAuth } from '../../api/httpClient.js';
import { API_BASE_URL } from '../../api/baseUrl.js';

export interface DeviceInfo {
  name: string;
  platform: 'web' | 'desktop' | 'mobile';
  version: string;
}

export interface Briefcase {
  id: string;
  briefcaseId: number;
  imodelId: string;
  status: 'active' | 'released' | 'expired';
  acquiredAt: string;
  lastSyncAt?: string;
  lastPushAt?: string;
  changesetIndex: number;
  localPath?: string;
  syncUrl?: string;
  deviceInfo?: DeviceInfo;
  sync?: {
    canPull: boolean;
    canPush: boolean;
    pendingChanges: number;
    incomingChanges: number;
  };
}

export interface AcquireBriefcaseRequest {
  deviceInfo?: DeviceInfo;
}

export interface ReleaseBriefcaseRequest {
  pushChanges?: boolean;
  changeDescription?: string;
}

async function apiGet<T>(url: string, options?: { params?: Record<string, unknown> }): Promise<T> {
  const queryString = options?.params
    ? `?${new URLSearchParams(Object.entries(options.params).map(([k, v]) => [k, String(v)])).toString()}`
    : '';

  const response = await fetchWithAuth(`${url}${queryString}`, { baseUrl: API_BASE_URL });

  return response.json() as Promise<T>;
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetchWithAuth(url, {
    baseUrl: API_BASE_URL,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });

  return response.json() as Promise<T>;
}

export const briefcaseApi = {
  /**
   * Acquire a briefcase for editing
   */
  async acquire(imodelId: string, request?: AcquireBriefcaseRequest): Promise<Briefcase> {
    return apiPost<Briefcase>(`/api/imodels/${imodelId}/briefcases/acquire`, request);
  },

  /**
   * Release a briefcase
   */
  async release(briefcaseId: string, request?: ReleaseBriefcaseRequest): Promise<Briefcase> {
    return apiPost<Briefcase>(`/api/briefcases/${briefcaseId}/release`, request);
  },

  /**
   * Get briefcase by iModel ID
   */
  async getByImodel(imodelId: string): Promise<Briefcase | null> {
    try {
      const response = await apiGet<{ briefcases: Briefcase[] }>('/api/briefcases', {
        params: { imodelId, status: 'active' },
      });
      const briefcases = response.briefcases;
      return briefcases.find((b: Briefcase) => b.imodelId === imodelId) || null;
    } catch {
      return null;
    }
  },

  /**
   * Get briefcase details
   */
  async getById(briefcaseId: string): Promise<Briefcase> {
    return apiGet<Briefcase>(`/api/briefcases/${briefcaseId}`);
  },

  /**
   * List user's briefcases
   */
  async list(options?: { status?: string; limit?: number; offset?: number }): Promise<{
    briefcases: Briefcase[];
    total: number;
  }> {
    return apiGet<{ briefcases: Briefcase[]; total: number }>('/api/briefcases', { params: options });
  },
};
