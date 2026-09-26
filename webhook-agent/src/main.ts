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
 * Environment configuration: single source is src/config.ts (zod-validated,
 * loads the repo-root .env). Mandatory secrets: AZURITE_ACCOUNT_KEY,
 * WEBHOOK_SECRET, IMODELHUB_API_KEY (HUB outbound), BACKEND_API_KEY
 * (modeling-server outbound, same value MS validates inbound),
 * IMODELHUB_ADMIN_EMAIL, IMODELHUB_ADMIN_PASSWORD. Dev defaults cover PORT,
 * IMODELHUB_URL, MODELING_SERVER_URL (replaces BACKEND_URL),
 * AZURITE_ACCOUNT_NAME, AZURITE_HOST (replaces BLOB_*), LOG_LEVEL and
 * RECOVERY_*.
 */

import http from 'http';
import express from 'express';
import { createWebhookServer } from './webhook-server.js';
import { builtinHandlers, EventProcessor } from './processor.js';
import { EventForwarder } from './forwarder.js';
import { BaselineGenerator } from './baseline-generator.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import type { WebhookConfig } from './types.js';
import type { IModelCreatedNeedBaselineEvent, WebhookEvent } from '@luban-cad/shared';

/** Container holding generated baseline files (not app config — fixed by convention). */
const BASELINE_CONTAINER_NAME = 'imodelhub';

/**
 * Build webhook server configuration from the validated config module
 */
function buildWebhookConfig(): WebhookConfig {
  return {
    secret: config.WEBHOOK_SECRET,
    port: config.PORT,
    // CORS config is not part of the webhook-agent schema; keep the previous
    // permissive default (the value used whenever ALLOWED_ORIGINS was unset).
    allowedOrigins: ['*'],
    backendUrl: config.MODELING_SERVER_URL,
  };
}

/**
 * Build baseline generator configuration from the validated config module
 */
function buildBaselineConfig() {
  return {
    // Previous BLOB_STORAGE_URL default: http://127.0.0.1:10000/devstoreaccount1
    blobStorageUrl: `http://${config.AZURITE_HOST}/${config.AZURITE_ACCOUNT_NAME}`,
    blobAccountName: config.AZURITE_ACCOUNT_NAME,
    blobAccountKey: config.AZURITE_ACCOUNT_KEY,
    blobContainerName: BASELINE_CONTAINER_NAME,
  };
}

/**
 * Load recovery checker configuration
 */
function loadRecoveryConfig() {
  return {
    // Check interval in minutes (default: 5 minutes)
    checkIntervalMinutes: config.RECOVERY_CHECK_INTERVAL_MINUTES,
    // Enable/disable automatic recovery (default: true)
    enabled: !config.DISABLE_AUTOMATIC_RECOVERY,
    // Maximum number of iModels to process per check (default: 10)
    maxPerCheck: config.RECOVERY_MAX_PER_CHECK,
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
async function queryUninitializedIModels(maxResults: number): Promise<IModelState[]> {
  const url = `${config.IMODELHUB_URL}/imodels/admin/uninitialized?limit=${maxResults}`;

  const response = await fetch(url, {
    headers: { 'X-API-Key': config.IMODELHUB_API_KEY },
  });
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
  maxPerCheck: number,
  debug: boolean
): Promise<void> {
  const startTime = Date.now();

  try {
    // Query both notInitialized and initializationFailed iModels
    const [uninitialized, failed] = await Promise.all([
      queryUninitializedIModels(maxPerCheck),
      queryFailedIModels(maxPerCheck),
    ]);

    const allPending = [...uninitialized, ...failed];

    if (allPending.length === 0) {
      if (debug) {
        logger.debug('[RecoveryChecker] No uninitialized iModels found');
      }
      return;
    }

    // Filter out iModels that are currently being processed
    const eligibleForProcessing = allPending.filter(imodel => !processingIModels.has(imodel.id));

    if (eligibleForProcessing.length === 0) {
      if (debug) {
        logger.debug('[RecoveryChecker] All pending iModels are already being processed');
      }
      return;
    }

    logger.info(`[RecoveryChecker] Found ${allPending.length} iModels needing initialization (${uninitialized.length} notInitialized, ${failed.length} failed), ${eligibleForProcessing.length} eligible for processing`);

    // Process each iModel
    for (const iModel of eligibleForProcessing.slice(0, maxPerCheck)) {
      // Skip if already being processed (double-check in case of race conditions)
      if (processingIModels.has(iModel.id)) {
        if (debug) {
          logger.debug(`[RecoveryChecker] Skipping iModel ${iModel.id} - already being processed`);
        }
        continue;
      }

      // Mark as being processed
      processingIModels.add(iModel.id);

      logger.info(`[RecoveryChecker] Processing iModel ${iModel.id} (${iModel.name}) - state: ${iModel.state}`);

      try {
        // Create a synthetic event for the baseline generator
        const syntheticContent = {
          imodelId: iModel.id,
          imodelName: iModel.name,
          imodelDescription: '',
          iTwinId: iModel.iTwinId,
          needBaseline: true,
        };

        const syntheticEvent = {
          eventType: 'iModels.iModelCreated.v1' as const,
          iTwinId: iModel.iTwinId,
          messageId: `recovery-${iModel.id}-${Date.now()}`,
          webhookId: 'recovery-checker',
          enqueuedDateTime: new Date().toISOString(),
          content: syntheticContent,
        };

        // Trigger baseline generation
        await baselineGenerator.handleIModelCreated(syntheticEvent, syntheticContent);

        logger.info(`[RecoveryChecker] Successfully initiated baseline generation for iModel ${iModel.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[RecoveryChecker] Failed to process iModel ${iModel.id}`, { iModelId: iModel.id, error: errorMessage });
      } finally {
        // Remove from processing set after a delay to prevent immediate re-processing
        // Keep it in the set for 2 minutes to allow initialization to complete
        setTimeout(() => {
          processingIModels.delete(iModel.id);
          if (debug) {
            logger.debug(`[RecoveryChecker] Removed iModel ${iModel.id} from processing set`);
          }
        }, 2 * 60 * 1000);
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[RecoveryChecker] Check completed in ${duration}ms, processed ${Math.min(eligibleForProcessing.length, maxPerCheck)} iModels`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[RecoveryChecker] Error during recovery check', { error: errorMessage });
  }
}

/**
 * Start periodic recovery checker
 */
function startRecoveryChecker(
  baselineGenerator: BaselineGenerator,
  checkIntervalMinutes: number,
  maxPerCheck: number,
  debug: boolean
): NodeJS.Timeout {
  const intervalMs = checkIntervalMinutes * 60 * 1000;

  logger.info(`[RecoveryChecker] Starting automatic recovery checker (interval: ${checkIntervalMinutes} minutes, max per check: ${maxPerCheck})`);

  // Run immediately on startup
  runRecoveryCheck(baselineGenerator, maxPerCheck, debug);

  // Schedule periodic checks
  const intervalId = setInterval(() => {
    runRecoveryCheck(baselineGenerator, maxPerCheck, debug);
  }, intervalMs);

  return intervalId;
}

/**
 * Main application
 */
async function main(): Promise<void> {
  logger.info('╔══════════════════════════════════════════════════════════════╗');
  logger.info('║       LubanCAD - Webhook Agent                         ║');
  logger.info('║       Pure Webhook Receiver (No WebSocket)                   ║');
  logger.info('╚══════════════════════════════════════════════════════════════╝');

  const webhookConfig = buildWebhookConfig();
  const debug = config.LOG_LEVEL === 'debug';

  logger.info(`[Config] Port: ${webhookConfig.port}`);
  logger.info(`[Config] Backend URL: ${webhookConfig.backendUrl}`);
  logger.info(`[Config] Mode: Pure Webhook Receiver`);
  logger.info(`[Config] Debug: ${debug}`);

  // Create event processor
  const processor = new EventProcessor({ debug });

  // Progress notifier to backend
  async function notifyBackendProgress(iModelId: string, step: string, progress: number): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-API-Key': config.BACKEND_API_KEY,
      };
      const response = await fetch(`${webhookConfig.backendUrl}/api/imodels/${iModelId}/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ step, progress }),
      });
      if (!response.ok && debug) {
        logger.warn(`[Progress] Backend returned ${response.status} for iModel ${iModelId}`);
      }
    } catch (error) {
      // Progress is best-effort — a failed POST never fails the baseline
      // run — but the miss is surfaced with route context, not swallowed.
      logger.warn(`[Progress] Failed to post progress to modeling-server for iModel ${iModelId}`, {
        iModelId,
        step,
        progress,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Initialize baseline generator
  const baselineConfig = buildBaselineConfig();
  const baselineGenerator = new BaselineGenerator({
    ...baselineConfig,
    onProgress: notifyBackendProgress,
  });
  await baselineGenerator.initialize();

  // Register built-in event handlers
  // Handle iModel created - check if baseline generation is needed
  processor.on('*', builtinHandlers.onIModelCreated((event, content) => {
    logger.info(`[Event] iModel created: ${content.imodelName} (${content.imodelId})`);

    // Check if this is an empty iModel needing baseline generation
    // The event content includes needBaseline flag from imodelhub-services
    const needBaseline = (content as IModelCreatedNeedBaselineEvent).needBaseline === true;
    if (needBaseline) {
      logger.info(`[Event] Triggering baseline generation for iModel ${content.imodelId}`);

      // Trigger async baseline generation (don't await - webhook must respond quickly)
      baselineGenerator.handleIModelCreated(event, content as IModelCreatedNeedBaselineEvent)
        .catch((err) => {
          logger.error('[BaselineGenerator] Error', { iModelId: content.imodelId, error: err });
        });
    }
  }));

  processor.on('*', builtinHandlers.onIModelDeleted((_event, content) => {
    logger.info(`[Event] iModel deleted: ${content.imodelId}`);
  }));

  processor.on('*', builtinHandlers.onChangesetPushed((_event, content) => {
    logger.info(`[Event] Changeset pushed: index ${content.changesetIndex} on iModel ${content.imodelId}`);
  }));

  processor.on('*', builtinHandlers.onNamedVersionCreated((_event, content) => {
    logger.info(`[Event] Named version created: ${content.namedVersionName} on iModel ${content.imodelId}`);
  }));

  processor.on('*', builtinHandlers.onMemberAdded((_event, content) => {
    logger.info(`[Event] Member added: ${content.memberId} with role ${content.roleName}`);
  }));

  processor.on('*', builtinHandlers.onMemberRemoved((_event, content) => {
    logger.info(`[Event] Member removed: ${content.memberId}`);
  }));


  // Create event forwarder
  const forwarder = new EventForwarder({
    backendUrl: webhookConfig.backendUrl,
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
  });

  // Create HTTP server (baselineGenerator is passed to handle /baseline/process endpoint)
  const app = createWebhookServer({ config: webhookConfig, processor, forwarder, baselineGenerator });

  const server = http.createServer(app);

  // Start automatic recovery checker for uninitialized iModels
  const recoveryConfig = loadRecoveryConfig();
  let recoveryIntervalId: NodeJS.Timeout | undefined;
  if (recoveryConfig.enabled) {
    recoveryIntervalId = startRecoveryChecker(
      baselineGenerator,
      recoveryConfig.checkIntervalMinutes,
      recoveryConfig.maxPerCheck,
      debug
    );
  } else {
    logger.info('[RecoveryChecker] Automatic recovery is disabled');
  }

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

    // Clear recovery checker interval
    if (recoveryIntervalId) {
      clearInterval(recoveryIntervalId);
    }

    server.close(async () => {
      await baselineGenerator.shutdown();
      await forwarder.shutdown();
      logger.info('[Shutdown] Server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('[Shutdown] Forced shutdown');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start server
  server.listen(webhookConfig.port, () => {
    logger.info(`\n✅ Webhook Agent started`);
    logger.info(`   HTTP:   http://localhost:${webhookConfig.port}`);
    logger.info(`   Health: http://localhost:${webhookConfig.port}/health`);
    logger.info(`\n📡 Pure Webhook Receiver - Events forwarded to Modeling-Server API`);
    logger.info(`   Backend: ${webhookConfig.backendUrl}`);
    logger.info(`\n🎯 Ready to receive webhooks from iTwin Platform\n`);
  });
}

// Run main
main().catch((error) => {
  logger.error('[Main] Fatal error', { error });
  process.exit(1);
});
