/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for WebInitializer module
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeWeb, shutdownWeb } from './WebInitializer.js';

// Mock iTwin.js dependencies
vi.mock('@itwin/core-frontend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelApp: {
    initialized: false,
    startup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    accuSnap: {
      enableSnap: vi.fn(),
      enableLocate: vi.fn(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IpcApp: {
    isValid: false,
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  LocalhostIpcApp: {
    startup: vi.fn().mockResolvedValue(undefined),
    buildUrlForSocket: vi.fn().mockImplementation((url: URL) => `ws://${url.host}/ipc`),
  },
}));

vi.mock('@itwin/editor-frontend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  EditTools: {
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@itwin/imodels-access-frontend', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  FrontendIModelsAccess: vi.fn().mockImplementation(() => ({
    getAccessToken: vi.fn(),
  })),
}));

vi.mock('@itwin/imodels-client-management', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelsClient: vi.fn().mockImplementation(() => ({
    getAccessToken: vi.fn(),
  })),
}));

vi.mock('@itwin/core-common', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  BentleyCloudRpcManager: {
    initializeClient: vi.fn(),
  },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelReadRpcInterface: { interfaceName: 'IModelReadRpcInterface' },
  // eslint-disable-next-line @typescript-eslint/naming-convention
  IModelTileRpcInterface: { interfaceName: 'IModelTileRpcInterface' },
}));

vi.mock('@open-cloud-cad/shared', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  OpenCloudRpcInterface: {
    interfaceName: 'OpenCloudRpcInterface',
  },
}));

describe('WebInitializer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset plain property values that vi.clearAllMocks() does not restore
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { IpcApp, IModelApp } = await import('@itwin/core-frontend');
    vi.mocked(IpcApp).isValid = false;
    vi.mocked(IModelApp).initialized = false;
  });

  describe('initializeWeb', () => {
    it('should initialize successfully with default options', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { LocalhostIpcApp: localhostIpcApp } = await import('@itwin/core-frontend');
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { BentleyCloudRpcManager: rpcManager } = await import('@itwin/core-common');

      await initializeWeb({
        backendUrl: 'http://localhost:4001',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(localhostIpcApp.startup).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(rpcManager.initializeClient).toHaveBeenCalled();
    });

    it('should use custom iModelHub URL when provided', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { IModelsClient: iModelsClient } = await import('@itwin/imodels-client-management');

      await initializeWeb({
        backendUrl: 'http://localhost:4001',
        iModelHubUrl: 'http://custom-hub:5000',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(iModelsClient).toHaveBeenCalledWith(
        expect.objectContaining({
          api: { baseUrl: 'http://custom-hub:5000/imodels' },
        })
      );
    });

    it('should skip initialization if already initialized', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { IpcApp: ipcApp, LocalhostIpcApp: localhostIpcApp } = await import('@itwin/core-frontend');
      vi.mocked(ipcApp).isValid = true;

      await initializeWeb({
        backendUrl: 'http://localhost:4001',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(localhostIpcApp.startup).not.toHaveBeenCalled();
    });
  });

  describe('shutdownWeb', () => {
    it('should shutdown successfully when initialized', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { IModelApp: iModelApp } = await import('@itwin/core-frontend');
      vi.mocked(iModelApp).initialized = true;

      await shutdownWeb();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(iModelApp.shutdown).toHaveBeenCalled();
    });

    it('should not throw when not initialized', async () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { IModelApp: iModelApp } = await import('@itwin/core-frontend');
      vi.mocked(iModelApp).initialized = false;

      await expect(shutdownWeb()).resolves.not.toThrow();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(iModelApp.shutdown).not.toHaveBeenCalled();
    });
  });
});
