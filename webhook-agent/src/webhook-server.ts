/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhook HTTP Server - Pure Webhook Receiver
 *
 * Receives webhook events from iTwin Platform, validates signatures,
 * processes them, and forwards to Backend API.
 * NO WebSocket - follows pure webhook receiver pattern.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import type { WebhookConfig } from './types.js';
import type { IModelCreatedNeedBaselineEvent } from '@luban-cad/shared';
import type { IncomingWebhookEvent } from './processor.js';
import { validateRequest } from './validator.js';
import { EventProcessor } from './processor.js';
import { EventForwarder } from './forwarder.js';
import { BaselineGenerator } from './baseline-generator.js';
import { config as appConfig } from './config.js';
import { logger } from './utils/logger.js';

/**
 * Webhook Server options
 */
export interface WebhookServerOptions {
  config: WebhookConfig;
  processor: EventProcessor;
  forwarder: EventForwarder;
  baselineGenerator?: BaselineGenerator;
}

/**
 * Create and configure Express webhook server
 *
 * @param options - Server configuration
 * @returns Express application
 */
export function createWebhookServer(options: WebhookServerOptions): express.Application {
  const { config, processor, forwarder } = options;

  const app = express();

  // Enable CORS
  app.use(cors({
    origin: config.allowedOrigins,
    credentials: true,
  }));

  // Raw body parser for signature validation (must be before any JSON parser)
  app.use(express.text({ type: 'application/json' }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'webhook-agent',
      mode: 'pure-webhook-receiver',
      timestamp: new Date().toISOString(),
      stats: {
        pendingEvents: forwarder.getPendingCount(),
        retryQueueLength: forwarder.getRetryQueueLength(),
      },
    });
  });

  // Webhook events endpoint - receives from iTwin Platform
  app.post('/webhook/events', async (req: Request, res: Response) => {
    const signatureHeader = req.headers.signature as string | undefined;
    const rawBody = req.body as string | Buffer;

    // DEBUG: Log detailed request info
    logger.debug('[Webhook] Received request');
    logger.debug('[Webhook] Headers', { headers: req.headers });
    logger.debug('[Webhook] Body type', { bodyType: typeof rawBody });
    logger.debug('[Webhook] Body length', { bodyLength: rawBody ? (typeof rawBody === 'string' ? rawBody.length : rawBody.length) : 0 });
    logger.debug('[Webhook] Body preview', { bodyPreview: rawBody ? String(rawBody).substring(0, 200) : 'empty' });

    if (!signatureHeader || !rawBody) {
      logger.warn('[Webhook] Missing signature or body');
      res.sendStatus(401);
      return;
    }

    // Validate signature
    const validation = validateRequest(
      config.secret,
      req.headers as Record<string, string | string[] | undefined>,
      rawBody
    );

    // DEBUG: Log validation result
    logger.debug('[Webhook] Validation result', { validation });

    if (!validation.valid) {
      logger.warn('[Webhook] Invalid signature', { error: validation.error });
      res.sendStatus(401);
      return;
    }

    // Parse event
    let event: IncomingWebhookEvent;
    try {
      const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString();
      event = JSON.parse(bodyString) as IncomingWebhookEvent;
    } catch {
      logger.error('[Webhook] Failed to parse event body');
      res.sendStatus(400);
      return;
    }

    logger.info(`[Webhook] Received: ${event.eventType} for iTwin ${event.iTwinId}`);

    // Respond immediately (iTwin Platform has 5 second timeout)
    res.sendStatus(200);

    // Process event asynchronously
    try {
      const processedEvent = await processor.processEvent(event);

      // Forward to backend
      await forwarder.forwardEvent(processedEvent);
    } catch (error) {
      logger.error('[Webhook] Failed to process/forward event', { error });
    }
  });

  // Get recent events endpoint (for debugging/monitoring)
  app.get('/webhook/events/recent', (_req: Request, res: Response) => {
    const events = processor.getRecentEvents(100);
    res.json({
      events,
      count: events.length,
      timestamp: new Date().toISOString(),
    });
  });

  // Get events by type
  app.get('/webhook/events/:type', (req: Request, res: Response) => {
    const { type } = req.params;
    const events = processor.getEventsByType(type);
    res.json({
      events,
      eventType: type,
      count: events.length,
    });
  });

  // Forwarder stats
  app.get('/forwarder/stats', (_req: Request, res: Response) => {
    res.json({
      pendingEvents: forwarder.getPendingCount(),
      retryQueueLength: forwarder.getRetryQueueLength(),
      backendUrl: config.backendUrl,
    });
  });

  // Baseline processing endpoint (called by imodelhub-services)
  if (options.baselineGenerator) {
    const baselineGenerator = options.baselineGenerator;
    // Track iModels currently being processed to prevent duplicate processing
    const processingIModels = new Set<string>();

    app.post('/baseline/process', async (req: Request, res: Response) => {
      // Parse JSON body manually since webhook-server uses express.text()
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(req.body as string);
      } catch {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }

      const { iModelId, iTwinId, sourceBlobPath, fileSize } = body;

      if (!iModelId || !iTwinId || !sourceBlobPath) {
        res.status(400).json({ error: 'Missing required fields: iModelId, iTwinId, sourceBlobPath' });
        return;
      }

      const iModelIdStr = iModelId as string;

      // Check if already being processed
      if (processingIModels.has(iModelIdStr)) {
        logger.debug(`[BaselineProcess] Skipping iModel ${iModelIdStr} - already being processed`);
        res.status(200).json({ message: 'Already being processed', iModelId: iModelIdStr });
        return;
      }

      // Mark as being processed
      processingIModels.add(iModelIdStr);

      logger.info(`[BaselineProcess] Received request to process user baseline for iModel ${iModelIdStr}`);

      // Respond immediately
      res.status(202).json({ message: 'Processing started', iModelId: iModelIdStr });

      // Process asynchronously
      try {
        await baselineGenerator.processUserBaseline(iModelIdStr, iTwinId as string, sourceBlobPath as string, (fileSize as number) || 0);
        logger.info(`[BaselineProcess] Completed processing for iModel ${iModelIdStr}`);
      } catch (error) {
        logger.error(`[BaselineProcess] Failed to process for iModel ${iModelIdStr}`, { iModelId: iModelIdStr, error });
      } finally {
        // Remove from processing set after a delay to prevent immediate re-processing
        setTimeout(() => {
          processingIModels.delete(iModelIdStr);
        }, 2 * 60 * 1000);
      }
    });

    // Retry baseline generation for a failed iModel
    app.post('/baseline/retry/:iModelId', async (req: Request, res: Response) => {
      // Service-to-service auth: modeling-server sends X-API-Key (WEBAGENT_API_KEY,
      // same value it uses outbound — mirrors MS's requireApiKey pattern).
      if (req.headers['x-api-key'] !== appConfig.WEBAGENT_API_KEY) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { iModelId } = req.params;
      // Parse JSON body manually
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(req.body as string);
      } catch {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }

      const { iTwinId, imodelName } = body;
      if (!iModelId || !iTwinId) {
        res.status(400).json({ error: 'Missing required fields: iModelId, iTwinId' });
        return;
      }

      logger.info(`[BaselineRetry] Retrying baseline generation for iModel ${iModelId}`);

      // Respond immediately
      res.status(202).json({ message: 'Retry started', iModelId });

      // Trigger baseline generation asynchronously with a synthetic event
      const content = {
        imodelId: iModelId as string,
        imodelName: (imodelName as string) || `iModel-${iModelId}`,
        needBaseline: true,
      };
      const event = {
        eventType: 'iModels.iModelCreated.v1' as const,
        iTwinId: iTwinId as string,
        messageId: `retry-${iModelId}-${Date.now()}`,
        webhookId: 'baseline-retry',
        enqueuedDateTime: new Date().toISOString(),
        content,
      };

      try {
        await baselineGenerator.handleIModelCreated(event, content as unknown as IModelCreatedNeedBaselineEvent);
        logger.info(`[BaselineRetry] Retry completed for iModel ${iModelId}`);
      } catch (error) {
        logger.error(`[BaselineRetry] Retry failed for iModel ${iModelId}`, { iModelId, error });
      }
    });
  }

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    logger.error('[Server] Error', { error: err });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
