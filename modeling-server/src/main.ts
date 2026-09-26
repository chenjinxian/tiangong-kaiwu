/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * LubanCAD Backend Service
 * Pure Express + RPC implementation (no NestJS)
 */

import * as http from 'http';
import { IncomingMessage } from 'http';
import express, { Request, Response } from 'express';
import enableWs from 'express-ws';
import cors from 'cors';
import WebSocket from 'ws';
import { IpcHost, LocalhostIpcHost } from '@itwin/core-backend';
import { BackendIModelsAccess } from '@itwin/imodels-access-backend';
import { IModelsClient } from '@itwin/imodels-client-authoring';
import { AzureClientStorage, BlockBlobClientWrapperFactory } from '@itwin/object-storage-azure';
import { BentleyCloudRpcConfiguration, BentleyCloudRpcManager, IModelReadRpcInterface, IModelTileRpcInterface, RpcManager } from '@itwin/core-common';
import { EditCommandAdmin } from '@itwin/editor-backend';
import * as editorBuiltInCommands from '@itwin/editor-backend';
import { OpenCloudRpcInterface } from '@luban-cad/shared';
import { OpenCloudIpcHandler } from './ipc/OpenCloudIpcHandler.js';
import { OpenCloudRpcImpl } from './rpc/OpenCloudRpcImpl.js';
import { AppFunctionIpcHandler } from './ipc/AppFunctionIpcHandler.js';
import { ServiceAccountAuthClient } from './auth/ServiceAccountAuthClient.js';
import cookieParser from 'cookie-parser';
import { csrfMiddleware } from './middleware/csrf.js';
import { logger } from './utils/logger.js';
import { rateLimiter, sanitizeInput, securityAudit, securityHeaders } from './middleware/security.js';
import { verifyWsUpgrade } from './middleware/wsAuth.js';
import { createUserAuthRouter, notFoundHandler } from './routes/userAuth.js';
import { config } from './config.js';
import { createWebhookEventRoutes, registerProgressHandler } from './middleware/webhookEvents.js';

// Set Azurite base URI for CheckpointManager (overrides hardcoded Azure production URL)
// This allows V2CheckpointManager.toCloudContainerProps to use Azurite instead of Azure.
// itwinjs-core reads this process.env key (CheckpointManager) — it is an upstream
// contract and the one deliberate process.env write left in the codebase.
const azuriteBlobBaseUri = `http://${config.AZURITE_HOST}/${config.AZURITE_ACCOUNT_NAME}`;
process.env.IMJS_AZURE_BLOB_BASE_URI = azuriteBlobBaseUri;

// Store connected WebSocket clients
const wsClients = new Set<WebSocket>();

// iModel initialization progress tracking (in-memory, best-effort)
interface IModelProgress {
  step: string;
  progress: number;
  updatedAt: string;
}
const iModelProgressMap = new Map<string, IModelProgress>();

/**
 * Initialize the backend - IModelHost and RPC
 */
async function initializeBackend() {
  logger.info('Initializing LubanCAD Backend...');

  // Configure Azure storage for local azurite
  const azureStorage = new AzureClientStorage(new BlockBlobClientWrapperFactory());

  const iModelClient = new IModelsClient({
    api: { baseUrl: `${config.IMODELHUB_URL}/imodels` },
    cloudStorage: azureStorage,
  });
  const hubAccess = new BackendIModelsAccess(iModelClient);

  // Create service account auth client for backend-to-hub authentication
  const authClient = new ServiceAccountAuthClient({
    loginUrl: `${config.IMODELHUB_URL}/auth/email/login`,
    email: config.IMODELHUB_ADMIN_EMAIL,
    password: config.IMODELHUB_ADMIN_PASSWORD,
  });

  // Startup LocalhostIpcHost (supersedes IModelHost; enables WebSocket IPC for BriefcaseConnection)
  await LocalhostIpcHost.startup({
    localhostIpcHost: { noServer: true },  // we provide our own Express/ws server
    iModelHost: {
      hubAccess,
      authorizationClient: authClient,
      cacheDir: config.BRIEFCASE_CACHE_LOCATION,
    },
  });
  logger.info('LocalhostIpcHost initialized');

  // Register custom IPC handler for briefcase download
  OpenCloudIpcHandler.register();
  logger.info('OpenCloudIpcHandler registered on channel: open-cloud-ipc');

  // Register custom app function IPC handler to handle "key already in use" errors
  // This must be registered AFTER IpcHost.startup to override the default behavior
  AppFunctionIpcHandler.register();
  logger.info('AppFunctionIpcHandler registered on channel: itwinjs-core/ipc-app');

  EditCommandAdmin.registerModule(editorBuiltInCommands);
  logger.info('EditCommands registered (BasicManipulationCommand + SolidModelingCommand)');

  // Register OpenCloudRpcImpl - must be done after IpcHost.startup
  // This registers the RPC implementation for IPC forwarding
  RpcManager.registerImpl(OpenCloudRpcInterface, OpenCloudRpcImpl);
  logger.info('OpenCloudRpcInterface registered');

  // Initialize Bentley Cloud RPC Manager
  // Note: IModelReadRpcImpl and IModelTileRpcImpl are auto-registered by IModelHost.startup()
  const rpcConfig = BentleyCloudRpcManager.initializeImpl(
    { info: { title: 'LubanCAD', version: 'v1.0' } },
    [OpenCloudRpcInterface, IModelReadRpcInterface, IModelTileRpcInterface]
  );
  logger.info('BentleyCloudRpcManager initialized');

  return { hubAccess, rpcConfig };
}

/**
 * Setup Express server with WebSocket support
 * Single port architecture - HTTP and WebSocket share the same port
 */
function setupServer(rpcConfig: BentleyCloudRpcConfiguration): http.Server {
  const app = express();

  // Create HTTP server before enabling WebSocket support so that express-ws
  // can hook into the actual server's 'upgrade' event (not an internal one).
  const server = http.createServer(app);
  enableWs(app, server, {
    wsOptions: {
      // Verify JWT token on all WebSocket upgrade requests (/ws and /ipc)
      verifyClient: async (
        info: { origin: string; secure: boolean; req: IncomingMessage },
        callback: (res: boolean, code?: number, message?: string) => void
      ) => {
        try {
          const allowed = await verifyWsUpgrade(info.req);
          callback(allowed ? true : false, allowed ? 200 : 401, allowed ? '' : 'Unauthorized');
        } catch {
          callback(false, 503, 'Auth service unavailable');
        }
      },
    },
  });

  // Middleware
  app.use(cookieParser());
  app.use(securityHeaders);
  app.use(securityAudit);
  app.use(rateLimiter());
  app.use(sanitizeInput);
  app.use(csrfMiddleware);

  app.use(cors({
    origin: config.FRONTEND_URL,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ limit: '10mb', type: 'text/plain' }));

  // ============================================
  // WebSocket Endpoint
  // ============================================
   
  (app as any).ws('/ws', (ws: WebSocket, _req: Request) => {
    logger.info('New WebSocket client connected');
    wsClients.add(ws);

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to LubanCAD Backend',
      timestamp: new Date().toISOString(),
    }));

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
      wsClients.delete(ws);
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error:', error);
      wsClients.delete(ws);
    });
  });

  // IPC WebSocket endpoint for iTwin.js BriefcaseConnection (LocalhostIpcHost)
  (app as any).ws('/ipc', (ws: WebSocket) => {
    logger.info('New IPC WebSocket connection established');

    // Add logging for WebSocket messages
    const originalSend = ws.send.bind(ws);
    ws.send = (...args: any[]) => {
      const data = args[0]?.toString() || '';
      if (data.includes('editingScope') || data.includes('txns')) {
        logger.info(`[IPC-WS-Backend] Sending: ${data.substring(0, 500)}`);
      }
      return (originalSend as (...args: any[]) => void)(...args);
    };

    LocalhostIpcHost.connect(ws as any);
  });

  // ============================================
  // RPC Endpoints (BentleyCloud RPC URL format: /{title}/{version}/mode/...)
  // ============================================
  const protocol = rpcConfig.protocol as unknown as {
    handleOperationGetRequest: (req: Request, res: Response) => Promise<void>;
    handleOperationPostRequest: (req: Request, res: Response) => Promise<void>;
    handleOpenApiDescriptionRequest: (req: Request, res: Response) => Promise<void>;
  };

  // GET requests (mode/1 = web mode)
  app.get('/:title/:version/mode/*', async (req: Request, res: Response) => {
    try {
      await protocol.handleOperationGetRequest(req, res);
    } catch (error) {
      logger.error('RPC GET error:', error as Error, { url: req.url });
      res.status(500).json({ error: 'RPC processing error' });
    }
  });

  // POST requests (mode/2 = application mode)
  app.post('/:title/:version/mode/*', async (req: Request, res: Response) => {
    try {
      await protocol.handleOperationPostRequest(req, res);
    } catch (error) {
      logger.error('RPC POST error:', error as Error, { url: req.url });
      res.status(500).json({ error: 'RPC processing error' });
    }
  });

  app.get('/rpc/metadata', async (req: Request, res: Response) => {
    try {
      await protocol.handleOpenApiDescriptionRequest(req, res);
    } catch (error) {
      logger.error('RPC metadata error:', error as Error);
      res.status(500).json({ error: 'RPC metadata error' });
    }
  });

  // ============================================
  // Health & Status Endpoints
  // ============================================
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      websocket: {
        connectedClients: wsClients.size,
        endpoint: `ws://localhost:${config.PORT}/ws`,
      },
    });
  });

  // ============================================
  // Webhook Event Receiver (from webhook-agent)
  // Inbound API key is REQUIRED (enforced in webhookEvents.ts).
  // ============================================
  app.use(createWebhookEventRoutes());
  // Progress store stays here; webhookEvents.ts forwards validated payloads.
  registerProgressHandler((iModelId, step, progress) => {
    const clampedProgress = Math.max(0, Math.min(100, progress));
    iModelProgressMap.set(iModelId, {
      step: step || '处理中',
      progress: clampedProgress,
      updatedAt: new Date().toISOString(),
    });

    // Evict completed entries after a delay to prevent unbounded growth
    if (clampedProgress >= 100) {
      setTimeout(() => {
        iModelProgressMap.delete(iModelId);
      }, 60000);
    }
  });

  // ============================================
  // Retry failed iModel initialization
  // ============================================
  app.post('/api/imodels/:id/retry', express.json(), async (req: Request, res: Response) => {
    const iModelId = req.params.id;
    const { iTwinId, imodelName } = req.body as { iTwinId?: string; imodelName?: string };

    if (!iTwinId) {
      res.status(400).json({ error: 'Missing required field: iTwinId' });
      return;
    }

    try {
      const response = await fetch(`${config.WEBAGENT_URL}/baseline/retry/${iModelId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.WEBAGENT_API_KEY,
        },
        body: JSON.stringify({ iTwinId, imodelName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, string>;
        res.status(response.status).json({ error: errorData.error || 'Retry request failed' });
        return;
      }

      res.json({ success: true, message: 'Retry initiated', iModelId });
    } catch (error) {
      logger.error('Failed to retry iModel initialization:', error as Error);
      res.status(502).json({ error: 'Failed to communicate with webhook-agent' });
    }
  });

  // ============================================
  // iModel Initialization Progress Tracking
  // (POST /api/imodels/:id/progress lives in webhookEvents.ts, API-key guarded)
  // ============================================
  app.get('/api/imodels/:id/progress', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate token by calling imodelhub-services auth endpoint
    try {
      const authResponse = await fetch(`${config.IMODELHUB_URL}/auth/me`, {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { Authorization: authHeader },
      });
      if (!authResponse.ok) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
    } catch {
      res.status(503).json({ error: 'Auth service unavailable' });
      return;
    }

    const progress = iModelProgressMap.get(req.params.id);
    if (progress) {
      res.json(progress);
    } else {
      res.json({ step: '等待开始', progress: 0, updatedAt: new Date().toISOString() });
    }
  });

  // ============================================
  // User Profile & Password APIs (forwarded to imodelhub-services)
  // ============================================
  app.use(createUserAuthRouter());

  app.use(notFoundHandler);

  // ============================================
  // Start Server
  // ============================================
  server.listen(config.PORT, () => {
    logger.info(`LubanCAD Backend running on http://localhost:${config.PORT}`);
    logger.info(`Mode: imodelhub-services (local)`);
    logger.info(`imodelhub-services: ${config.IMODELHUB_URL}`);
    logger.info(`azurite blob base:  ${azuriteBlobBaseUri}`);
    logger.info(`Available endpoints:`);
    logger.info(`  Health check:  http://localhost:${config.PORT}/health`);
    logger.info(`  WebSocket:     ws://localhost:${config.PORT}/ws`);
    logger.info(`  RPC metadata:  http://localhost:${config.PORT}/rpc/metadata`);
    logger.info(`Note: Frontend connects directly to imodelhub-services:4000 for REST APIs`);
    logger.info(`Single port architecture - HTTP and WebSocket share port ${config.PORT}`);
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Initialize backend
    const { rpcConfig } = await initializeBackend();

    // Setup server
    const server = setupServer(rpcConfig);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Shutting down...');

      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('Server closed');
          resolve();
        });
      });

      wsClients.forEach((ws) => ws.close());

      await IpcHost.shutdown();
      logger.info('LocalhostIpcHost shutdown');

      process.exit(0);
    });
  } catch (error) {
    logger.fatal('Failed to start backend:', error as Error);
    process.exit(1);
  }
}

// Run main
void main();
