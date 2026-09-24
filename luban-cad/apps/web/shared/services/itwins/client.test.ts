/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthorization, iTwinsClient, ITwinSubClass } from './client.js';
import * as authClient from '../../../features/auth/services/auth/client.js';

// Mock the auth client
vi.mock('../../../features/auth/services/auth/client.js', () => ({
  getAccessToken: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

describe('iTwins Client', () => {
  const mockGetValidAccessToken = vi.mocked(authClient.getValidAccessToken);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthorization', () => {
    it('should return Bearer token format when authenticated', async () => {
      mockGetValidAccessToken.mockResolvedValue('test-token-123');

      const result = await getAuthorization();

      expect(result).toBe('Bearer test-token-123');
      expect(mockGetValidAccessToken).toHaveBeenCalled();
    });

    it('should return empty string when not authenticated', async () => {
      mockGetValidAccessToken.mockResolvedValue('');

      const result = await getAuthorization();

      expect(result).toBe('');
    });

    it('should handle null token gracefully', async () => {
      mockGetValidAccessToken.mockResolvedValue(null as unknown as string);

      const result = await getAuthorization();

      // The function concatenates 'Bearer ' with whatever token it gets
      expect(typeof result).toBe('string');
    });
  });

  describe('iTwinsClient', () => {
    it('should be exported as a singleton instance', () => {
      expect(iTwinsClient).toBeDefined();
    });

    it('should be an instance of ITwinsAccessClient', () => {
      // The client should have the _baseUrl property indicating it's an ITwinsAccessClient
      expect(iTwinsClient).toHaveProperty('_baseUrl');
    });
  });

  describe('ITwinSubClass', () => {
    it('should be re-exported from SDK', () => {
      expect(ITwinSubClass).toBeDefined();
    });

    it('should have Project subclass', () => {
      expect(ITwinSubClass.Project).toBeDefined();
    });
  });
});
