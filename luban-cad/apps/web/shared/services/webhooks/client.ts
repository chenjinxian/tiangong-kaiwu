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
import { fetchWithAuth } from '../../api/httpClient.js';

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

  public async getWebhooks(iTwinId: string): Promise<Webhook[]> {
    const response = await fetchWithAuth(`/itwins/${iTwinId}/webhooks`, { baseUrl: this._baseUrl });
    const data = await response.json();
    return data.webhooks || [];
  }

  public async getWebhook(iTwinId: string, webhookId: string): Promise<Webhook> {
    const response = await fetchWithAuth(`/itwins/${iTwinId}/webhooks/${webhookId}`, { baseUrl: this._baseUrl });
    return response.json();
  }

  public async createWebhook(request: CreateWebhookRequest): Promise<Webhook> {
    const response = await fetchWithAuth(`/itwins/${request.iTwinId}/webhooks`, {
      baseUrl: this._baseUrl,
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response.json();
  }

  public async updateWebhook(iTwinId: string, webhookId: string, request: UpdateWebhookRequest): Promise<Webhook> {
    const response = await fetchWithAuth(`/itwins/${iTwinId}/webhooks/${webhookId}`, {
      baseUrl: this._baseUrl,
      method: 'PATCH',
      body: JSON.stringify(request),
    });
    return response.json();
  }

  public async deleteWebhook(iTwinId: string, webhookId: string): Promise<void> {
    await fetchWithAuth(`/itwins/${iTwinId}/webhooks/${webhookId}`, {
      baseUrl: this._baseUrl,
      method: 'DELETE',
    });
  }

  public async getWebhookEvents(iTwinId: string, webhookId: string): Promise<WebhookEvent[]> {
    const response = await fetchWithAuth(`/itwins/${iTwinId}/webhooks/${webhookId}/events`, { baseUrl: this._baseUrl });
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
