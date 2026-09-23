/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthorization, iModelsManagementClient } from './client.js';
import * as authClient from '../../../features/auth/services/auth/client.js';

// Mock the auth client
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  getAccessToken: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

describe('iModels Client', () => {
  const mockGetValidAccessToken = vi.mocked(authClient.getValidAccessToken);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthorization', () => {
    it('should return authorization with Bearer scheme when authenticated', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-token-123');

      const result = await getAuthorization();

      expect(result).toEqual({
        scheme: 'Bearer',
        token: 'test-token-123',
      });
      expect(mockGetValidAccessToken).toHaveBeenCalled();
    });

    it('should throw error when not authenticated', async () => {
      mockGetValidAccessToken.mockResolvedValue('');

      await expect(getAuthorization()).rejects.toThrow('Not authenticated');
    });

    it('should throw error when token is null/undefined', async () => {
      mockGetValidAccessToken.mockResolvedValue(null as unknown as string);

      await expect(getAuthorization()).rejects.toThrow('Not authenticated');
    });
  });

  describe('iModelsManagementClient', () => {
    it('should be exported as a singleton instance', () => {
      expect(iModelsManagementClient).toBeDefined();
    });

    it('should have the expected API configuration', () => {
      // The client should be configured with base URL
      expect(iModelsManagementClient).toHaveProperty('iModels');
    });
  });
});
