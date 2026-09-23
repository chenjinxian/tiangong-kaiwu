/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthorization,
  type Webhook,
  type WebhookEvent,
  type WebhookEventType,
  webhooksClient,
} from './client.js';
import * as authClient from '../../../features/auth/services/auth/client.js';

// Mock the auth client
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  getAccessToken: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

describe('Webhooks Client', () => {
  const mockGetValidAccessToken = vi.mocked(authClient.getValidAccessToken);
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  describe('getAuthorization', () => {
    it('should return access token', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-token-123');

      const result = await getAuthorization();

      expect(result).toBe('test-token-123');
      expect(mockGetValidAccessToken).toHaveBeenCalled();
    });

    it('should return empty string when not authenticated', async () => {
      mockGetValidAccessToken.mockResolvedValue('');

      const result = await getAuthorization();

      expect(result).toBe('');
    });
  });

  describe('webhooksClient', () => {
    const mockWebhook: Webhook = {
      id: 'webhook-1',
      url: 'https://example.com/webhook',
      events: ['imodel.created'],
      iTwinId: 'itwin-1',
      isActive: true,
    };

    const mockWebhookEvent: WebhookEvent = {
      id: 'event-1',
      webhookId: 'webhook-1',
      eventType: 'imodel.created',
      payload: { imodelId: 'imodel-1' },
      timestamp: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      mockGetValidAccessToken.mockResolvedValue('test-token');
    });

    describe('getWebhooks', () => {
      it('should fetch webhooks for an iTwin', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ webhooks: [mockWebhook] }),
        });

        const result = await webhooksClient.getWebhooks('itwin-1');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/itwins/itwin-1/webhooks'),
          expect.objectContaining({
            headers: expect.objectContaining({
               
              Authorization: 'Bearer test-token',
            }),
          })
        );
        expect(result).toEqual([mockWebhook]);
      });

      it('should return empty array when no webhooks', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ webhooks: [] }),
        });

        const result = await webhooksClient.getWebhooks('itwin-1');

        expect(result).toEqual([]);
      });

      it('should return empty array when webhooks field missing', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({}),
        });

        const result = await webhooksClient.getWebhooks('itwin-1');

        expect(result).toEqual([]);
      });
    });

    describe('getWebhook', () => {
      it('should fetch a single webhook', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => mockWebhook,
        });

        const result = await webhooksClient.getWebhook('itwin-1', 'webhook-1');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/itwins/itwin-1/webhooks/webhook-1'),
          expect.any(Object)
        );
        expect(result).toEqual(mockWebhook);
      });
    });

    describe('createWebhook', () => {
      it('should create a new webhook', async () => {
        const createRequest = {
          url: 'https://example.com/webhook',
          events: ['imodel.created' as WebhookEventType],
          iTwinId: 'itwin-1',
        };
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => mockWebhook,
        });

        const result = await webhooksClient.createWebhook(createRequest);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/itwins/itwin-1/webhooks'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(createRequest),
          })
        );
        expect(result).toEqual(mockWebhook);
      });
    });

    describe('updateWebhook', () => {
      it('should update an existing webhook', async () => {
        const updateRequest = {
          url: 'https://example.com/new-webhook',
          isActive: false,
        };
        const updatedWebhook = { ...mockWebhook, ...updateRequest };
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => updatedWebhook,
        });

        const result = await webhooksClient.updateWebhook('itwin-1', 'webhook-1', updateRequest);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/itwins/itwin-1/webhooks/webhook-1'),
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify(updateRequest),
          })
        );
        expect(result).toEqual(updatedWebhook);
      });
    });

    describe('deleteWebhook', () => {
      it('should delete a webhook', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
        });

        await webhooksClient.deleteWebhook('itwin-1', 'webhook-1');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/itwins/itwin-1/webhooks/webhook-1'),
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });

    describe('getWebhookEvents', () => {
      it('should fetch events for a webhook', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ events: [mockWebhookEvent] }),
        });

        const result = await webhooksClient.getWebhookEvents('itwin-1', 'webhook-1');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/itwins/itwin-1/webhooks/webhook-1/events'),
          expect.any(Object)
        );
        expect(result).toEqual([mockWebhookEvent]);
      });

      it('should return empty array when no events', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({}),
        });

        const result = await webhooksClient.getWebhookEvents('itwin-1', 'webhook-1');

        expect(result).toEqual([]);
      });
    });

    describe('error handling', () => {
      it('should throw error on API failure', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        });

        await expect(webhooksClient.getWebhook('itwin-1', 'webhook-1')).rejects.toThrow(
          'Webhooks API error: 404 Not Found'
        );
      });

      it('should throw error on server error', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

        await expect(webhooksClient.getWebhooks('itwin-1')).rejects.toThrow(
          'Webhooks API error: 500 Internal Server Error'
        );
      });
    });
  });
});
