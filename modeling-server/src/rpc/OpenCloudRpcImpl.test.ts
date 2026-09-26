/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for OpenCloudRpcImpl
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

// OpenCloudRpcImpl.ts loads config.ts at module scope; config exits when
// secrets are missing. (config is frozen — cacheDir tests assert against it.)
vi.hoisted(() => {
  process.env.BACKEND_API_KEY ??= 'a'.repeat(32);
  process.env.WEBAGENT_API_KEY ??= 'b'.repeat(32);
  process.env.CSRF_SECRET ??= 'c'.repeat(32);
  process.env.IMODELHUB_ADMIN_EMAIL ??= 'admin@test.local';
  process.env.IMODELHUB_ADMIN_PASSWORD ??= 'd'.repeat(16);
});

// Mock fs module
vi.mock('fs');

// Mock iTwin.js dependencies
vi.mock('@itwin/core-backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@itwin/core-backend')>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    IModelHost: {
      initialized: true,
      authorizationClient: {
        getAccessToken: vi.fn(),
      },
      shutdown: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    IModelDb: {
      findByKey: vi.fn(),
      tryFindByKey: vi.fn(),
    },
  };
});

vi.mock('@itwin/core-common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@itwin/core-common')>();
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    RpcManager: {
      registerImpl: vi.fn(),
    },
  };
});

// Mock editor-backend
vi.mock('@itwin/editor-backend', () => {
  return {
    EditCommandAdmin: {
      commands: new Map(),
      activeCommand: undefined,
      finishCommand: vi.fn().mockResolvedValue(undefined),
      runCommand: vi.fn().mockResolvedValue({ commandId: 'test-cmd', version: '1.0.0' }),
      registerModule: vi.fn(),
    },
  };
});

// Import after mocks are set up
import { OpenCloudRpcImpl } from './OpenCloudRpcImpl.js';
import { IModelHost } from '@itwin/core-backend';
import { EditCommandAdmin } from '@itwin/editor-backend';

describe('OpenCloudRpcImpl', () => {
  let rpcImpl: OpenCloudRpcImpl;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to return a valid token
    vi.mocked(IModelHost.authorizationClient!.getAccessToken).mockResolvedValue('mock-token');
    vi.mocked(IModelHost.shutdown).mockResolvedValue(undefined);
    rpcImpl = new OpenCloudRpcImpl();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Briefcase Operations', () => {
    it('should throw error for acquireBriefcase', async () => {
      await expect(rpcImpl.acquireBriefcase('test-imodel-id')).rejects.toThrow(
        'Use imodelhub-services REST API for briefcase operations'
      );
    });

    it('should throw error for releaseBriefcase', async () => {
      await expect(rpcImpl.releaseBriefcase('test-imodel-id', 1)).rejects.toThrow(
        'Use imodelhub-services REST API for briefcase operations'
      );
    });

    it('should throw error for pullChangesets', async () => {
      await expect(rpcImpl.pullChangesets('test-imodel-id', 1)).rejects.toThrow(
        'Use imodelhub-services REST API for changeset operations'
      );
    });

    it('should throw error for pushChanges', async () => {
      await expect(rpcImpl.pushChanges('test-imodel-id', 1, 'test')).rejects.toThrow(
        'Use imodelhub-services REST API for changeset operations'
      );
    });
  });

  describe('File Operations', () => {
    it('should return Uint8Array for exportIModel', async () => {
      // Mock IModelDb.tryFindByKey to return a valid iModel
      const { IModelDb } = await import('@itwin/core-backend');
      const mockIModel = {
        // Support iterable protocol (for await...of)
        withPreparedStatement: vi.fn((_sql: string, callback: (stmt: unknown) => unknown) => {
          const mockStmt = {
            *[Symbol.iterator]() {
              // Empty iterator - no rows
            },
            step: () => false,
          };
          return callback(mockStmt);
        }),
      };
      vi.mocked(IModelDb.tryFindByKey).mockReturnValue(mockIModel as unknown as ReturnType<typeof IModelDb.tryFindByKey>);
      const result = await rpcImpl.exportIModel('test-imodel-id', 'GLTF');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0); // Returns header data even for empty model
    });

    it('should read external saved views if file exists', async () => {
      const mockContent = JSON.stringify({ views: [] });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(mockContent));

      const result = await rpcImpl.readExternalSavedViews('test.bim');
      expect(result).toBe(mockContent);
      expect(fs.readFileSync).toHaveBeenCalledWith('test_ESV.json');
    });

    it('should return empty string when saved views file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await rpcImpl.readExternalSavedViews('test.bim');
      expect(result).toBe('');
    });

    it('should write external saved views', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

      await rpcImpl.writeExternalSavedViews('test.bim', '{"views":[]}');
      expect(fs.writeFileSync).toHaveBeenCalledWith('test_ESV.json', '{"views":[]}');
    });

    it('should read external camera paths if file exists', async () => {
      const mockContent = JSON.stringify({ paths: [] });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(mockContent));

      const result = await rpcImpl.readExternalCameraPaths('test.bim');
      expect(result).toBe(mockContent);
      expect(fs.readFileSync).toHaveBeenCalledWith('test_cameraPaths.json');
    });

    it('should write external camera paths', async () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

      await rpcImpl.writeExternalCameraPaths('test.bim', '{"paths":[]}');
      expect(fs.writeFileSync).toHaveBeenCalledWith('test_cameraPaths.json', '{"paths":[]}');
    });

    it('should read external file if exists', async () => {
      const mockContent = 'test content';
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from(mockContent));

      const result = await rpcImpl.readExternalFile('test.txt');
      expect(result).toBe(mockContent);
    });

    it('should create directory when writing file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);

      await rpcImpl.writeExternalFile('path/to/file.txt', 'content');
      expect(fs.mkdirSync).toHaveBeenCalledWith('path/to', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('path/to/file.txt', 'content');
    });
  });

  describe('Configuration', () => {
    it('should return configuration', async () => {
      const config = await rpcImpl.getConfiguration();
      expect(config).toHaveProperty('version');
      expect(config).toHaveProperty('apiVersion');
      expect(config).toHaveProperty('cacheDir');
      expect(config).toHaveProperty('maxUploadSize');
    });

    it('should report the configured cache directory', async () => {
      // cacheDir now comes from config (frozen at import) instead of process.env
      const { config } = await import('../config.js');
      const result = await rpcImpl.getConfiguration();
      expect(result.cacheDir).toBe(config.BRIEFCASE_CACHE_LOCATION);
    });
  });

  describe('Authentication', () => {
    it('should return access token', async () => {
      const token = await rpcImpl.getAccessToken();
      expect(token).toBe('mock-token');
    });

    it('should throw error when not authenticated', async () => {
      vi.mocked(IModelHost.authorizationClient!.getAccessToken).mockResolvedValueOnce(undefined as unknown as string);

      await expect(rpcImpl.getAccessToken()).rejects.toThrow('Not authenticated');
    });
  });

  describe('Lifecycle', () => {
    it('should shutdown IModelHost', async () => {
      await rpcImpl.terminate();
      expect(IModelHost.shutdown).toHaveBeenCalled();
    });
  });

  describe('Editor Commands', () => {
    it('should throw error when command not registered', async () => {
      await expect(rpcImpl.startEditCommand('unregistered-cmd', 'imodel-key')).rejects.toThrow(
        'Command not registered [unregistered-cmd]'
      );
    });

    it('should return empty response for empty commandId', async () => {
      const result = await rpcImpl.startEditCommand('', 'imodel-key');
      expect(result).toEqual({ commandId: '', version: '0.0.0' });
    });

    it('should throw error when no active command for callEditMethod', async () => {
      await expect(rpcImpl.callEditMethod('someMethod')).rejects.toThrow(
        'No active command'
      );
    });

    it('should finish edit command', async () => {
      const result = await rpcImpl.finishEditCommand();
      expect(result).toBe('done');
      expect(EditCommandAdmin.finishCommand).toHaveBeenCalled();
    });
  });
});

// T1.1: conflict detection / changeset comparison are NOT implemented against
// the real hub — they must say so explicitly instead of returning silent empties.
describe('Conflict feature degradation (T1.1)', () => {
  let impl: InstanceType<typeof import('./OpenCloudRpcImpl.js').OpenCloudRpcImpl>;

  beforeEach(async () => {
    const { IModelDb } = await import('@itwin/core-backend');
    vi.mocked(IModelDb.tryFindByKey).mockReturnValue({ changeset: { id: 'cs-1' } } as never);
    impl = new (await import('./OpenCloudRpcImpl.js')).OpenCloudRpcImpl();
  });

  it('detectConflicts returns featureAvailable=false instead of a fake no-conflict answer', async () => {
    const result = await impl.detectConflicts({ iModelId: 'im-1', briefcaseId: 1, targetChangesetId: 'cs-2' });
    expect(result.featureAvailable).toBe(false);
    expect(result.hasConflicts).toBe(false);
    expect(result.totalConflicts).toBe(0);
    expect(result.conflicts).toEqual([]);
  });

  it('compareChangesets returns featureAvailable=false instead of mock structure', async () => {
    const result = await impl.compareChangesets('im-1', 'cs-1', 'cs-2');
    expect(result.featureAvailable).toBe(false);
  });

  it('resolveConflicts returns featureAvailable=false', async () => {
    const result = await impl.resolveConflicts({ iModelId: 'im-1', briefcaseId: 1, resolutions: {} });
    expect(result.featureAvailable).toBe(false);
  });
});
