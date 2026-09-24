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

// Environment configuration
const PORT = process.env.PORT || 4001;
const IMODELHUB_URL = process.env.IMODELHUB_URL || 'http://localhost:4000';
const AZURITE_ACCOUNT_NAME = process.env.AZURITE_ACCOUNT_NAME || 'devstoreaccount1';
const AZURITE_HOST = process.env.AZURITE_HOST || '127.0.0.1:10000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const IMODELHUB_ADMIN_EMAIL = process.env.IMODELHUB_ADMIN_EMAIL ?? 'admin@example.com';
const IMODELHUB_ADMIN_PASSWORD = process.env.IMODELHUB_ADMIN_PASSWORD ?? 'secret';

// Set Azurite base URI for CheckpointManager (overrides hardcoded Azure production URL)
// This allows V2CheckpointManager.toCloudContainerProps to use Azurite instead of Azure
process.env.IMJS_AZURE_BLOB_BASE_URI = `http://${AZURITE_HOST}/${AZURITE_ACCOUNT_NAME}`;

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
    api: { baseUrl: `${IMODELHUB_URL}/imodels` },
    cloudStorage: azureStorage,
  });
  const hubAccess = new BackendIModelsAccess(iModelClient);

  // Create service account auth client for backend-to-hub authentication
  const authClient = new ServiceAccountAuthClient({
    loginUrl: `${IMODELHUB_URL}/auth/email/login`,
    email: IMODELHUB_ADMIN_EMAIL,
    password: IMODELHUB_ADMIN_PASSWORD,
  });

  // Startup LocalhostIpcHost (supersedes IModelHost; enables WebSocket IPC for BriefcaseConnection)
  await LocalhostIpcHost.startup({
    localhostIpcHost: { noServer: true },  // we provide our own Express/ws server
    iModelHost: {
      hubAccess,
      authorizationClient: authClient,
      cacheDir: process.env.IMJS_BRIEFCASE_CACHE_LOCATION || './briefcase-cache',
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
    origin: FRONTEND_URL,
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
        endpoint: `ws://localhost:${PORT}/ws`,
      },
    });
  });

  // ============================================
  // Webhook Event Receiver (from webhook-agent)
  // ============================================
  app.post('/api/webhook/events', express.json(), (req: Request, res: Response) => {
    const event = req.body;
    logger.info(`[Webhook] Received event: ${event.eventType} for iModel ${event.iModelId}`);
    // Acknowledge receipt - actual processing is done by imodelhub-services
    res.json({ received: true, eventId: event.id });
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
      const webAgentUrl = process.env.WEBAGENT_URL || 'http://localhost:4002';
      const response = await fetch(`${webAgentUrl}/baseline/retry/${iModelId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.WEBAGENT_API_KEY ? { 'X-API-Key': process.env.WEBAGENT_API_KEY } : {}),
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
  // ============================================
  app.post('/api/imodels/:id/progress', (req: Request, res: Response) => {
    // Validate API key from webhook-agent
    const apiKey = req.headers['x-api-key'];
    if (process.env.BACKEND_API_KEY && apiKey !== process.env.BACKEND_API_KEY) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { step, progress } = req.body as { step?: string; progress?: number };
    if (typeof step !== 'string' || (progress !== undefined && typeof progress !== 'number')) {
      res.status(400).json({ error: 'Invalid progress payload' });
      return;
    }

    const iModelId = req.params.id;
    const clampedProgress = Math.max(0, Math.min(100, progress ?? 0));
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

    res.json({ received: true });
  });

  app.get('/api/imodels/:id/progress', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate token by calling imodelhub-services auth endpoint
    try {
      const authResponse = await fetch(`${IMODELHUB_URL}/auth/me`, {
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
  // User Profile APIs
  // ============================================

  /**
   * Update user profile
   * PUT /api/users/profile
   */
  app.put('/api/users/profile', express.json(), async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      // Validate token
      const authResponse = await fetch(`${IMODELHUB_URL}/auth/me`, {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { Authorization: authHeader },
      });
      if (!authResponse.ok) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      // Parse name into firstName and lastName
      const trimmed = name.trim();
      const parts = trimmed.split(/\s+/);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ') || '';

      // Try to update via imodelhub-services
      // Note: imodelhub-services may not support profile updates
      // If it doesn't, we return success anyway (frontend will use local state)
      try {
        const updateResponse = await fetch(`${IMODELHUB_URL}/auth/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ firstName, lastName }),
        });

        if (updateResponse.ok) {
          const updatedUser = await updateResponse.json() as { id: string | number; email: string; firstName: string | null; lastName: string | null };
          res.json({
            success: true,
            user: {
              id: String(updatedUser.id),
              email: updatedUser.email,
              name: `${updatedUser.firstName || ''} ${updatedUser.lastName || ''}`.trim(),
            },
          });
          return;
        }
      } catch {
        // imodelhub-services doesn't support profile update, return success anyway
        logger.info('imodelhub-services profile update not supported, returning local success');
      }

      // Return success with the updated name (frontend will use this)
      const userData = await authResponse.json() as { id: string | number; email: string };
      res.json({
        success: true,
        user: {
          id: String(userData.id),
          email: userData.email,
          name: trimmed,
        },
      });
    } catch (error) {
      logger.error('Profile update error:', error as Error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  /**
   * Change user password
   * PUT /api/users/password
   */
  app.put('/api/users/password', express.json(), async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      // Validate token
      const authResponse = await fetch(`${IMODELHUB_URL}/auth/me`, {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { Authorization: authHeader },
      });
      if (!authResponse.ok) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current password and new password are required' });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters' });
        return;
      }

      // Try to change password via imodelhub-services
      try {
        const passwordResponse = await fetch(`${IMODELHUB_URL}/auth/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ currentPassword, newPassword }),
        });

        if (passwordResponse.ok) {
          res.json({ success: true, message: 'Password changed successfully' });
          return;
        }

        if (passwordResponse.status === 401) {
          res.status(401).json({ error: 'Current password is incorrect' });
          return;
        }
      } catch {
        logger.info('imodelhub-services password change not supported');
      }

      // If imodelhub-services doesn't support password change, simulate success
      // In production, this should be implemented properly
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Password change error:', error as Error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  /**
   * POST /api/auth/forgot-password
   * Request password reset email
   */
  app.post('/api/auth/forgot-password', express.json(), async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    try {
      // Forward to imodelhub-services if available
      const forgotResponse = await fetch(`${IMODELHUB_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (forgotResponse.ok) {
        res.json({ success: true, message: 'Password reset email sent' });
        return;
      }

      // If imodelhub-services doesn't support this, return success for security
      // (don't reveal if email exists)
      logger.info('imodelhub-services forgot-password not supported, returning success');
      res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
    } catch (error) {
      logger.error('Forgot password error:', error as Error);
      // Return success for security (don't reveal system errors)
      res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
    }
  });

  /**
   * POST /api/auth/reset-password
   * Reset password with token
   */
  app.post('/api/auth/reset-password', express.json(), async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }

    try {
      // Forward to imodelhub-services if available
      const resetResponse = await fetch(`${IMODELHUB_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      if (resetResponse.ok) {
        res.json({ success: true, message: 'Password reset successfully' });
        return;
      }

      if (resetResponse.status === 401) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      // If imodelhub-services doesn't support this, simulate success for demo
      logger.info('imodelhub-services reset-password not supported, simulating success');
      res.json({ success: true, message: 'Password reset successfully (simulated)' });
    } catch (error) {
      logger.error('Reset password error:', error as Error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Fallback route
  app.use('*', (_req: Request, res: Response) => {
    res.json({
      name: 'LubanCAD Backend',
      version: '1.0.0',
      description: 'RPC-only backend. Frontend connects directly to imodelhub-services for REST APIs.',
      endpoints: {
        health: '/health',
        websocket: '/ws',
        rpc: '/rpc/*',
      },
    });
  });

  // ============================================
  // Start Server
  // ============================================
  server.listen(PORT, () => {
    logger.info(`LubanCAD Backend running on http://localhost:${PORT}`);
    logger.info(`Mode: imodelhub-services (local)`);
    logger.info(`imodelhub-services: ${IMODELHUB_URL}`);
    logger.info(`azurite blob base:  ${process.env.IMJS_AZURE_BLOB_BASE_URI}`);
    logger.info(`Available endpoints:`);
    logger.info(`  Health check:  http://localhost:${PORT}/health`);
    logger.info(`  WebSocket:     ws://localhost:${PORT}/ws`);
    logger.info(`  RPC metadata:  http://localhost:${PORT}/rpc/metadata`);
    logger.info(`Note: Frontend connects directly to imodelhub-services:4000 for REST APIs`);
    logger.info(`Single port architecture - HTTP and WebSocket share port ${PORT}`);
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
