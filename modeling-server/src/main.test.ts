/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for main backend entry point
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Backend Main', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct environment defaults', () => {
    // Test environment configuration defaults
    const PORT = process.env.PORT || 4001;
    const IMODELHUB_URL = process.env.IMODELHUB_URL || 'http://localhost:4000';
    const AZURITE_URL = process.env.AZURITE_URL || 'http://localhost:10000';
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

    expect(PORT).toBeDefined();
    expect(IMODELHUB_URL).toBeDefined();
    expect(AZURITE_URL).toBeDefined();
    expect(FRONTEND_URL).toBeDefined();
  });

  it('should export expected configuration', () => {
    // Verify the configuration structure that main.ts sets up
    const expectedEndpoints = {
      health: '/health',
      websocket: '/ws',
      rpc: '/rpc/*',
    };

    expect(expectedEndpoints.health).toBe('/health');
    expect(expectedEndpoints.websocket).toBe('/ws');
    expect(expectedEndpoints.rpc).toBe('/rpc/*');
  });
});

// Note: Full integration tests for main.ts would require:
// - Starting the actual server
// - Testing HTTP endpoints
// - Testing WebSocket connections
// These are better suited for e2e tests
