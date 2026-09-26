/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Inbound routes from webhook-agent. The API key is REQUIRED — there is no
 * optional mode (config enforces its presence at startup).
 */
import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import type { AnyWebhookEvent, IModelProgressPayload } from '@luban-cad/shared';
import { logger } from '../utils/logger.js';

export function createWebhookEventRoutes(): Router {
  const router = Router();

  const requireApiKey = (req: Request, res: Response): boolean => {
    if (req.headers['x-api-key'] !== config.BACKEND_API_KEY) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  };

  router.post('/api/webhook/events', (req: Request, res: Response) => {
    if (!requireApiKey(req, res)) return;
    const event = req.body as AnyWebhookEvent;
    logger.info(`[Webhook] Received event: ${event.eventType} (${event.messageId})`);
    res.json({ received: true, messageId: event.messageId });
  });

  router.post('/api/imodels/:id/progress', (req: Request, res: Response) => {
    if (!requireApiKey(req, res)) return;
    const { step, progress } = req.body as IModelProgressPayload;
    if (typeof step !== 'string' || (progress !== undefined && typeof progress !== 'number')) {
      res.status(400).json({ error: 'Invalid progress payload' });
      return;
    }
    // progress store stays in main.ts; emit via callback registered by main
    onProgress?.(req.params.id, step, progress ?? 0);
    res.json({ received: true });
  });

  return router;
}

// main.ts registers its in-memory progress map here (avoids duplicating state).
let onProgress: ((id: string, step: string, progress: number) => void) | undefined;
export function registerProgressHandler(fn: (id: string, step: string, progress: number) => void): void {
  onProgress = fn;
}
