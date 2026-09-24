/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import { IModelApp, IpcApp, LocalhostIpcApp } from '@itwin/core-frontend';
import { EditTools } from '@itwin/editor-frontend';
import { FrontendIModelsAccess } from '@itwin/imodels-access-frontend';
import { BentleyCloudRpcManager, IModelReadRpcInterface, IModelTileRpcInterface } from '@itwin/core-common';
import { IModelsClient } from '@itwin/imodels-client-management';
import { OpenCloudRpcInterface } from '@luban-cad/shared';

export interface WebInitializerOptions {
  /** Backend RPC URL */
  backendUrl: string;
  /** iModelHub URL */
  iModelHubUrl?: string;
  /** Access token for WebSocket authentication */
  accessToken?: string;
}

/**
 * Initialize iTwin.js for Web platform
 *
 * This function initializes:
 * - IModelApp with web-specific configuration
 * - BentleyCloudRpcManager for RPC communication
 *
 * @example
 * ```ts
 * await initializeWeb({
 *   backendUrl: 'http://localhost:4001',
 *   iModelHubUrl: 'http://localhost:4000'
 * });
 * ```
 */
export async function initializeWeb(options: WebInitializerOptions): Promise<void> {
  const { backendUrl, iModelHubUrl = '', accessToken } = options;

  const rpcInterfaces = [OpenCloudRpcInterface, IModelReadRpcInterface, IModelTileRpcInterface];

  if (!IpcApp.isValid) {
    // eslint-disable-next-line no-console
    console.log('[WebInitializer] Initializing LubanCAD Web Viewer...');
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] iModelHub URL: ${iModelHubUrl}`);

    const socketUrl = LocalhostIpcApp.buildUrlForSocket(new URL(backendUrl));
    // Append access token for WebSocket authentication
    if (accessToken) {
      socketUrl.searchParams.set('token', accessToken);
    }
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] IPC WebSocket URL: ${socketUrl.toString()}`);

    // Create iModel client for hub access
    const iModelClient = new IModelsClient({
      api: { baseUrl: `${iModelHubUrl}/imodels` },
    });

    try {
      // Initialize with LocalhostIpcApp (subclass of IModelApp).
      // This enables IpcApp.isValid = true, which is required for BriefcaseConnection.
      // The existing CheckpointConnection (read-only) path is unaffected.
      await LocalhostIpcApp.startup({
        localhostIpcApp: {
          // Connects to backend's /ipc WebSocket (ws://backendUrl/ipc)
          socketUrl,
        },
        iModelApp: {
          rpcInterfaces,
          hubAccess: new FrontendIModelsAccess(iModelClient),
          publicPath: '/workspace/default/',
        },
      });

      // eslint-disable-next-line no-console
      console.log(`[WebInitializer] IpcApp.isValid after startup: ${IpcApp.isValid}`);
      // eslint-disable-next-line no-console
      console.log(`[WebInitializer] IModelApp.initialized: ${IModelApp.initialized}`);
      // eslint-disable-next-line no-console
      console.log(`[WebInitializer] IModelApp.toolAdmin: ${IModelApp.toolAdmin ? 'Available' : 'NOT AVAILABLE'}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[WebInitializer] Error during LocalhostIpcApp.startup:', err);
      throw err;
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[WebInitializer] IModelApp already initialized, reconfiguring RPC client...');
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] IModelApp.initialized: ${IModelApp.initialized}`);
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] IModelApp.toolAdmin: ${IModelApp.toolAdmin ? 'Available' : 'NOT AVAILABLE'}`);
  }

  // Note: EditTools.initialize() is called from Editor.tsx after IModelApp is fully initialized
  // This avoids race conditions during startup

  // Enable AccuSnap for geometry-aware cursor snapping
  // Only enable if accuSnap is available (may not be available during React StrictMode double-invoke)
  if (IModelApp.accuSnap) {
    IModelApp.accuSnap.enableSnap(true);
    IModelApp.accuSnap.enableLocate(true);
    // eslint-disable-next-line no-console
    console.log('AccuSnap enabled (snap + locate)');
  } else {
    // eslint-disable-next-line no-console
    console.warn('AccuSnap not available, skipping AccuSnap initialization');
  }

  // Always configure RPC client (idempotent - safe to call multiple times)
  BentleyCloudRpcManager.initializeClient(
    { info: { title: 'LubanCAD', version: 'v1.0' }, uriPrefix: backendUrl },
    rpcInterfaces,
  );

  // eslint-disable-next-line no-console
  console.log('Web viewer initialized successfully');
}

/**
 * Shutdown iTwin.js
 */
export async function shutdownWeb(): Promise<void> {
  if (IModelApp.initialized) {
    try {
      await IModelApp.shutdown();
      // eslint-disable-next-line no-console
      console.log('Web viewer shut down');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('IModelApp shutdown error (likely React StrictMode double-invoke):', err);
    }
  }
}
