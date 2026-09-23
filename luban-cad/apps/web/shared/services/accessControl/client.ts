/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Access Control Client - Placeholder
 * Member and role management
 *
 * Note: The @itwin/access-control-client package API may differ from expected.
 * This is a placeholder implementation using REST API calls.
 */

import { getValidAccessToken } from '../../../features/auth/services/auth/client.js';

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';

// Placeholder types
export interface Member {
  id: string;
  userId: string;
  email: string;
  role: string;
  status: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export interface Permission {
  id: string;
  name: string;
  description: string;
}

export interface CreateMemberRequest {
  userId: string;
  roleId: string;
}

export interface UpdateMemberRequest {
  roleId?: string;
  status?: string;
}

/**
 * Access Control Client
 * Uses REST API until SDK is fully integrated
 */
class AccessControlClient {
  private _baseUrl: string;

  constructor(baseUrl: string) {
    this._baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async fetch(path: string, options: RequestInit = {}, retryCount = 0): Promise<Response> {
    const token = await getValidAccessToken();
    const url = `${this._baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      /* eslint-disable @typescript-eslint/naming-convention */
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    // Handle 401 errors - refresh token and retry once
    if (response.status === 401 && retryCount === 0) {
      return this.fetch(path, options, retryCount + 1);
    }

    if (!response.ok) {
      throw new Error(`Access Control API error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  public async getMembers(iTwinId: string): Promise<Member[]> {
    const response = await this.fetch(`/itwins/${iTwinId}/members`);
    const data = await response.json();
    return data.members || [];
  }

  public async getMember(iTwinId: string, memberId: string): Promise<Member> {
    const response = await this.fetch(`/itwins/${iTwinId}/members/${memberId}`);
    return response.json();
  }

  public async createMember(iTwinId: string, request: CreateMemberRequest): Promise<Member> {
    const response = await this.fetch(`/itwins/${iTwinId}/members`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response.json();
  }

  public async updateMember(iTwinId: string, memberId: string, request: UpdateMemberRequest): Promise<Member> {
    const response = await this.fetch(`/itwins/${iTwinId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    return response.json();
  }

  public async deleteMember(iTwinId: string, memberId: string): Promise<void> {
    await this.fetch(`/itwins/${iTwinId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }

  public async getRoles(iTwinId: string): Promise<Role[]> {
    const response = await this.fetch(`/itwins/${iTwinId}/roles`);
    const data = await response.json();
    return data.roles || [];
  }
}

/**
 * Access Control Client instance
 */
export const accessControlClient = new AccessControlClient(`${BACKEND_URL}/accesscontrol`);

/**
 * Get access token for access control operations
 */
export async function getAuthorization(): Promise<string> {
  return getValidAccessToken();
}
