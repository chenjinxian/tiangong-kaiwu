/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhook Agent - Pure Webhook Receiver
 *
 * This application receives webhook events from iTwin Platform,
 * validates their signatures, processes them, and forwards to Modeling-Server API.
 *
 * Architecture: Pure Webhook Receiver (No WebSocket)
 *   iTwin Platform → Webhook-Agent (4002) → Modeling-Server API (4001) → Frontend (polls)
 *
 * Usage:
 *   npm run dev          # Development mode with hot reload
 *   npm run build        # Build for production
 *   npm start            # Run production build
 *
 * Environment variables:
 *   WEBHOOK_SECRET       - Webhook secret for signature validation (required)
 *   PORT                 - HTTP server port (default: 4002)
 *   BACKEND_URL          - Modeling-Server API URL for event forwarding (default: http://localhost:4001)
 *   BACKEND_API_KEY      - API key for backend authentication (optional)
 *   ALLOWED_ORIGINS      - CORS allowed origins (default: *)
 *   DEBUG                - Enable debug logging (default: false)
 *
 *   Baseline Generation:
 *   BLOB_STORAGE_URL     - Azurite blob storage URL (default: http://127.0.0.1:10000/devstoreaccount1)
 *   BLOB_ACCOUNT_NAME    - Blob storage account name (default: devstoreaccount1)
 *   BLOB_ACCOUNT_KEY     - Blob storage account key (default: Azurite default key)
 *   BLOB_CONTAINER_NAME  - Container name for baseline files (default: imodel-baselines)
 *   IMODELHUB_API_URL    - imodelhub-services API URL (default: http://localhost:4000)
 *   IMODELHUB_API_KEY    - API key for imodelhub-services (optional)
 */

import http from 'http';
import express from 'express';
import dotenv from 'dotenv';
import { createWebhookServer } from './webhook-server.js';
import { builtinHandlers, EventProcessor } from './processor.js';
import { EventForwarder } from './forwarder.js';
import { BaselineGenerator } from './baseline-generator.js';
import type { IModelCreatedNeedBaselineEvent, WebhookConfig, WebhookEvent } from './types.js';

// Load environment variables
dotenv.config();

/**
 * Load configuration from environment
 */
function loadConfig(): WebhookConfig {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error('[Config] Error: WEBHOOK_SECRET environment variable is required');
    process.exit(1);
  }

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

  return {
    secret,
    webhookId: process.env.WEBHOOK_ID,
    port: parseInt(process.env.PORT || '4002', 10),
    allowedOrigins,
    backendUrl: process.env.BACKEND_URL || 'http://localhost:4001',
    backendApiKey: process.env.BACKEND_API_KEY,
  };
}

/**
 * Load baseline generator configuration
 */
function loadBaselineConfig() {
  return {
    blobStorageUrl: process.env.BLOB_STORAGE_URL || 'http://127.0.0.1:10000/devstoreaccount1',
    blobAccountName: process.env.BLOB_ACCOUNT_NAME || 'devstoreaccount1',
    blobAccountKey: process.env.BLOB_ACCOUNT_KEY || 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==',
    blobContainerName: process.env.BLOB_CONTAINER_NAME || 'imodelhub',
    imodelhubApiUrl: process.env.IMODELHUB_API_URL || 'http://localhost:4000',
    imodelhubApiKey: process.env.IMODELHUB_API_KEY,
  };
}

/**
 * Load recovery checker configuration
 */
function loadRecoveryConfig() {
  return {
    // Check interval in minutes (default: 5 minutes)
    checkIntervalMinutes: parseInt(process.env.RECOVERY_CHECK_INTERVAL_MINUTES || '5', 10),
    // Enable/disable automatic recovery (default: true)
    enabled: process.env.DISABLE_AUTOMATIC_RECOVERY !== 'true',
    // Maximum number of iModels to process per check (default: 10)
    maxPerCheck: parseInt(process.env.RECOVERY_MAX_PER_CHECK || '10', 10),
  };
}

/**
 * iModel state from API
 */
interface IModelState {
  id: string;
  name: string;
  iTwinId: string;
  state: string;
  createdAt: string;
}

/**
 * Query uninitialized iModels from imodelhub-services admin endpoint
 */
async function queryUninitializedIModels(
  imodelhubApiUrl: string,
  imodelhubApiKey: string | undefined,
  maxResults: number
): Promise<IModelState[]> {
  const url = `${imodelhubApiUrl}/imodels/admin/uninitialized?limit=${maxResults}`;

  const headers: Record<string, string> = {};
  if (imodelhubApiKey) {
    headers['X-API-Key'] = imodelhubApiKey;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to query uninitialized iModels: HTTP ${response.status}`);
  }

  const data = await response.json() as { iModels: IModelState[] };
  return data.iModels || [];
}

/**
 * Query failed initialization iModels from imodelhub-services
 * Note: The admin endpoint now returns both notInitialized and initializationFailed
 */
async function queryFailedIModels(
  imodelhubApiUrl: string,
  imodelhubApiKey: string | undefined,
  _maxResults: number
): Promise<IModelState[]> {
  // The admin endpoint already returns both notInitialized and initializationFailed
  // This function is kept for compatibility but returns empty array
  // since queryUninitializedIModels now returns all pending iModels
  return [];
}

/**
 * Track iModels currently being processed to prevent duplicate processing
 */
const processingIModels = new Set<string>();

/**
 * Run recovery check for uninitialized iModels
 */
async function runRecoveryCheck(
  baselineGenerator: BaselineGenerator,
  imodelhubApiUrl: string,
  imodelhubApiKey: string | undefined,
  maxPerCheck: number,
  debug: boolean
): Promise<void> {
  const startTime = Date.now();

  try {
    // Query both notInitialized and initializationFailed iModels
    const [uninitialized, failed] = await Promise.all([
      queryUninitializedIModels(imodelhubApiUrl, imodelhubApiKey, maxPerCheck),
      queryFailedIModels(imodelhubApiUrl, imodelhubApiKey, maxPerCheck),
    ]);

    const allPending = [...uninitialized, ...failed];

    if (allPending.length === 0) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log('[RecoveryChecker] No uninitialized iModels found');
      }
      return;
    }

    // Filter out iModels that are currently being processed
    const eligibleForProcessing = allPending.filter(imodel => !processingIModels.has(imodel.id));

    if (eligibleForProcessing.length === 0) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log('[RecoveryChecker] All pending iModels are already being processed');
      }
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`[RecoveryChecker] Found ${allPending.length} iModels needing initialization (${uninitialized.length} notInitialized, ${failed.length} failed), ${eligibleForProcessing.length} eligible for processing`);

    // Process each iModel
    for (const iModel of eligibleForProcessing.slice(0, maxPerCheck)) {
      // Skip if already being processed (double-check in case of race conditions)
      if (processingIModels.has(iModel.id)) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(`[RecoveryChecker] Skipping iModel ${iModel.id} - already being processed`);
        }
        continue;
      }

      // Mark as being processed
      processingIModels.add(iModel.id);

      // eslint-disable-next-line no-console
      console.log(`[RecoveryChecker] Processing iModel ${iModel.id} (${iModel.name}) - state: ${iModel.state}`);

      try {
        // Create a synthetic event for the baseline generator
        const syntheticContent = {
          imodelId: iModel.id,
          imodelName: iModel.name,
          imodelDescription: '',
          iTwinId: iModel.iTwinId,
          needBaseline: true,
        };

        const syntheticEvent: WebhookEvent = {
          eventType: 'iModels.iModelCreated.v1',
          iTwinId: iModel.iTwinId,
          webhookId: 'recovery-checker',
          enqueuedDateTime: new Date().toISOString(),
          content: syntheticContent,
        };

        // Trigger baseline generation
        await baselineGenerator.handleIModelCreated(syntheticEvent, syntheticContent);

        // eslint-disable-next-line no-console
        console.log(`[RecoveryChecker] Successfully initiated baseline generation for iModel ${iModel.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // eslint-disable-next-line no-console
        console.error(`[RecoveryChecker] Failed to process iModel ${iModel.id}:`, errorMessage);
      } finally {
        // Remove from processing set after a delay to prevent immediate re-processing
        // Keep it in the set for 2 minutes to allow initialization to complete
        setTimeout(() => {
          processingIModels.delete(iModel.id);
          if (debug) {
            // eslint-disable-next-line no-console
            console.log(`[RecoveryChecker] Removed iModel ${iModel.id} from processing set`);
          }
        }, 2 * 60 * 1000);
      }
    }

    const duration = Date.now() - startTime;
    // eslint-disable-next-line no-console
    console.log(`[RecoveryChecker] Check completed in ${duration}ms, processed ${Math.min(eligibleForProcessing.length, maxPerCheck)} iModels`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // eslint-disable-next-line no-console
    console.error('[RecoveryChecker] Error during recovery check:', errorMessage);
  }
}

/**
 * Start periodic recovery checker
 */
function startRecoveryChecker(
  baselineGenerator: BaselineGenerator,
  imodelhubApiUrl: string,
  imodelhubApiKey: string | undefined,
  checkIntervalMinutes: number,
  maxPerCheck: number,
  debug: boolean
): NodeJS.Timeout {
  const intervalMs = checkIntervalMinutes * 60 * 1000;

  // eslint-disable-next-line no-console
  console.log(`[RecoveryChecker] Starting automatic recovery checker (interval: ${checkIntervalMinutes} minutes, max per check: ${maxPerCheck})`);

  // Run immediately on startup
  runRecoveryCheck(baselineGenerator, imodelhubApiUrl, imodelhubApiKey, maxPerCheck, debug);

  // Schedule periodic checks
  const intervalId = setInterval(() => {
    runRecoveryCheck(baselineGenerator, imodelhubApiUrl, imodelhubApiKey, maxPerCheck, debug);
  }, intervalMs);

  return intervalId;
}

/**
 * Main application
 */
async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('╔══════════════════════════════════════════════════════════════╗');
  // eslint-disable-next-line no-console
  console.log('║       LubanCAD - Webhook Agent                         ║');
  // eslint-disable-next-line no-console
  console.log('║       Pure Webhook Receiver (No WebSocket)                   ║');
  // eslint-disable-next-line no-console
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const config = loadConfig();
  const debug = process.env.DEBUG === 'true';

  // eslint-disable-next-line no-console
  console.log(`[Config] Port: ${config.port}`);
  // eslint-disable-next-line no-console
  console.log(`[Config] Backend URL: ${config.backendUrl}`);
  // eslint-disable-next-line no-console
  console.log(`[Config] Mode: Pure Webhook Receiver`);
  // eslint-disable-next-line no-console
  console.log(`[Config] Debug: ${debug}`);

  // Create event processor
  const processor = new EventProcessor({ debug });

  // Progress notifier to backend
  async function notifyBackendProgress(iModelId: string, step: string, progress: number): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.backendApiKey) {
        headers['X-API-Key'] = config.backendApiKey;
      }
      const response = await fetch(`${config.backendUrl}/api/imodels/${iModelId}/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ step, progress }),
      });
      if (!response.ok && debug) {
        // eslint-disable-next-line no-console
        console.warn(`[Progress] Backend returned ${response.status} for iModel ${iModelId}`);
      }
    } catch {
      // Ignore errors - progress is best-effort
    }
  }

  // Initialize baseline generator
  const baselineConfig = loadBaselineConfig();
  const baselineGenerator = new BaselineGenerator({
    ...baselineConfig,
    onProgress: notifyBackendProgress,
  });
  await baselineGenerator.initialize();

  // Register built-in event handlers
  // Handle iModel created - check if baseline generation is needed
  processor.on('*', builtinHandlers.onIModelCreated((event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] iModel created: ${content.imodelName} (${content.imodelId})`);

    // Check if this is an empty iModel needing baseline generation
    // The event content includes needBaseline flag from imodelhub-services
    const needBaseline = (content as IModelCreatedNeedBaselineEvent).needBaseline === true;
    if (needBaseline) {
      // eslint-disable-next-line no-console
      console.log(`[Event] Triggering baseline generation for iModel ${content.imodelId}`);

      // Trigger async baseline generation (don't await - webhook must respond quickly)
      baselineGenerator.handleIModelCreated(event, content as IModelCreatedNeedBaselineEvent)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[BaselineGenerator] Error:', err);
        });
    }
  }));

  processor.on('*', builtinHandlers.onIModelDeleted((_event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] iModel deleted: ${content.imodelName} (${content.imodelId})`);
  }));

  processor.on('*', builtinHandlers.onChangesetPushed((_event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] Changeset pushed: index ${content.changesetIndex} on iModel ${content.imodelId}`);
  }));

  processor.on('*', builtinHandlers.onNamedVersionCreated((_event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] Named version created: ${content.versionName} on iModel ${content.imodelId}`);
  }));

  processor.on('*', builtinHandlers.onMemberAdded((_event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] Member added: ${content.memberId} with role ${content.roleName}`);
  }));

  processor.on('*', builtinHandlers.onMemberRemoved((_event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] Member removed: ${content.memberId}`);
  }));

  processor.on('*', builtinHandlers.onBriefcaseAcquired((_event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] Briefcase acquired: ${content.briefcaseId} on iModel ${content.imodelId} by ${content.acquiredBy}`);
  }));

  processor.on('*', builtinHandlers.onBriefcaseReleased((_event, content) => {
    // eslint-disable-next-line no-console
    console.log(`[Event] Briefcase released: ${content.briefcaseId} on iModel ${content.imodelId} by ${content.releasedBy}`);
  }));

  // Create event forwarder
  const forwarder = new EventForwarder({
    backendUrl: config.backendUrl,
    apiKey: config.backendApiKey,
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
  });

  // Create HTTP server (baselineGenerator is passed to handle /baseline/process endpoint)
  const app = createWebhookServer({ config, processor, forwarder, baselineGenerator });

  const server = http.createServer(app);

  // Start automatic recovery checker for uninitialized iModels
  const recoveryConfig = loadRecoveryConfig();
  let recoveryIntervalId: NodeJS.Timeout | undefined;
  if (recoveryConfig.enabled) {
    recoveryIntervalId = startRecoveryChecker(
      baselineGenerator,
      baselineConfig.imodelhubApiUrl,
      baselineConfig.imodelhubApiKey,
      recoveryConfig.checkIntervalMinutes,
      recoveryConfig.maxPerCheck,
      debug
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('[RecoveryChecker] Automatic recovery is disabled');
  }

  // Graceful shutdown
  const shutdown = (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

    // Clear recovery checker interval
    if (recoveryIntervalId) {
      clearInterval(recoveryIntervalId);
    }

    server.close(async () => {
      await baselineGenerator.shutdown();
      await forwarder.shutdown();
      // eslint-disable-next-line no-console
      console.log('[Shutdown] Server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('[Shutdown] Forced shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start server
  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`\n✅ Webhook Agent started`);
    // eslint-disable-next-line no-console
    console.log(`   HTTP:   http://localhost:${config.port}`);
    // eslint-disable-next-line no-console
    console.log(`   Health: http://localhost:${config.port}/health`);
    // eslint-disable-next-line no-console
    console.log(`\n📡 Pure Webhook Receiver - Events forwarded to Modeling-Server API`);
    // eslint-disable-next-line no-console
    console.log(`   Backend: ${config.backendUrl}`);
    // eslint-disable-next-line no-console
    console.log(`\n🎯 Ready to receive webhooks from iTwin Platform\n`);
  });
}

// Run main
main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
