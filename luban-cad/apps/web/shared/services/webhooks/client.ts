/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhooks Client - Placeholder
 *
 * NOTE: @itwin/webhooks-client package does not exist.
 * Webhooks functionality will be implemented via direct REST API calls
 * or when an official SDK package becomes available.
 */

import { getValidAccessToken } from '../../../features/auth/services/auth/client.js';

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';

// Placeholder types
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  iTwinId: string;
  isActive: boolean;
}

export interface WebhookEvent {
  id: string;
  webhookId: string;
  eventType: string;
  payload: unknown;
  timestamp: string;
}

export type WebhookEventType = 'imodel.created' | 'imodel.deleted' | 'changeset.pushed' | 'namedversion.created';

export interface CreateWebhookRequest {
  url: string;
  events: WebhookEventType[];
  iTwinId: string;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: WebhookEventType[];
  isActive?: boolean;
}

/**
 * Placeholder Webhooks Client
 * Uses REST API until an official SDK is available
 */
class WebhooksClient {
  private readonly _baseUrl: string;

  public constructor(config: { baseUrl: string }) {
    this._baseUrl = `${config.baseUrl.replace(/\/webhooks$/, '')  }/webhooks`;
  }

  private async _fetch(path: string, options: RequestInit = {}, retryCount = 0): Promise<Response> {
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
      return this._fetch(path, options, retryCount + 1);
    }

    if (!response.ok) {
      throw new Error(`Webhooks API error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  public async getWebhooks(iTwinId: string): Promise<Webhook[]> {
    const response = await this._fetch(`/itwins/${iTwinId}/webhooks`);
    const data = await response.json();
    return data.webhooks || [];
  }

  public async getWebhook(iTwinId: string, webhookId: string): Promise<Webhook> {
    const response = await this._fetch(`/itwins/${iTwinId}/webhooks/${webhookId}`);
    return response.json();
  }

  public async createWebhook(request: CreateWebhookRequest): Promise<Webhook> {
    const response = await this._fetch(`/itwins/${request.iTwinId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response.json();
  }

  public async updateWebhook(iTwinId: string, webhookId: string, request: UpdateWebhookRequest): Promise<Webhook> {
    const response = await this._fetch(`/itwins/${iTwinId}/webhooks/${webhookId}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    return response.json();
  }

  public async deleteWebhook(iTwinId: string, webhookId: string): Promise<void> {
    await this._fetch(`/itwins/${iTwinId}/webhooks/${webhookId}`, {
      method: 'DELETE',
    });
  }

  public async getWebhookEvents(iTwinId: string, webhookId: string): Promise<WebhookEvent[]> {
    const response = await this._fetch(`/itwins/${iTwinId}/webhooks/${webhookId}/events`);
    const data = await response.json();
    return data.events || [];
  }
}

/**
 * Webhooks Client instance
 */
export const webhooksClient = new WebhooksClient({
  baseUrl: `${BACKEND_URL}/webhooks`,
});

/**
 * Get access token for webhooks operations
 */
export async function getAuthorization(): Promise<string> {
  return getValidAccessToken();
}
