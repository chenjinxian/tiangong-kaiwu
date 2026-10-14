/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
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
import { ApiError } from '../../api/httpClient.js';

// Mock the auth client
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  getAccessToken: vi.fn(),
  getValidAccessToken: vi.fn(),
  refreshAccessToken: vi.fn(),
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
      it('should throw ApiError on API failure (unified httpClient envelope)', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ error: { code: 'NotFound', message: 'webhook missing' } }), { status: 404 }),
        );

        const err = await webhooksClient.getWebhook('itwin-1', 'webhook-1').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(404);
        expect((err as ApiError).code).toBe('NotFound');
        expect((err as ApiError).message).toBe('webhook missing');
      });

      it('should throw ApiError on server error, falling back to HTTP status text', async () => {
        mockFetch.mockResolvedValue(new Response('not json', { status: 500, statusText: 'Internal Server Error' }));

        const err = await webhooksClient.getWebhooks('itwin-1').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).statusCode).toBe(500);
        expect((err as ApiError).message).toBe('HTTP 500');
      });
    });
  });
});
