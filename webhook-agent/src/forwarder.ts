/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Event Forwarder - Sends processed events to Modeling-Server API
 *
 * Pure Webhook Receiver Architecture:
 *   Webhook-Agent receives webhook → processes → forwards to modeling-server via HTTP
 */

import type { ForwarderConfig, ProcessedEvent } from './types.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

/**
 * Event Forwarder
 *
 * Forwards processed webhook events to the Modeling-Server API.
 * Handles retries and error recovery.
 */
export class EventForwarder {
  private _config: ForwarderConfig;
  /** Undelivered events, held from first failure until success (or, after retries are exhausted, indefinitely for observability). */
  private _pendingEvents: Map<string, ProcessedEvent> = new Map();
  private _retryQueue: Array<{ event: ProcessedEvent; attempts: number }> = [];

  constructor(options: Partial<ForwarderConfig>) {
    this._config = {
      backendUrl: options.backendUrl || 'http://localhost:4001',
      timeout: options.timeout || 5000,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
    };

    // Start retry processor
    this._startRetryProcessor();
  }

  /**
   * Forward event to backend
   *
   * @param event - Processed webhook event
   * @returns Success status
   */
  public async forwardEvent(event: ProcessedEvent): Promise<boolean> {
    try {
      logger.debug(`[Forwarder] Forwarding event ${event.id} to backend`);

      const response = await this._sendEvent(event);

      if (response.ok) {
        event.forwardStatus = 'success';
        event.forwardedAt = new Date().toISOString();
        this._pendingEvents.delete(event.id);
        logger.info(`[Forwarder] Event ${event.id} forwarded successfully`);
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      logger.error(`[Forwarder] Failed to forward event ${event.id}`, { eventId: event.id, error });
      event.forwardStatus = 'failed';

      // Hold as pending while queued for retry, so the event stays observable
      // until it is delivered or retries are exhausted.
      this._pendingEvents.set(event.id, event);
      this._retryQueue.push({ event, attempts: 1 });
      return false;
    }
  }

  /**
   * Send event to backend API
   */
  private async _sendEvent(event: ProcessedEvent): Promise<Response> {
    const url = `${this._config.backendUrl}/api/webhook/events`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': config.BACKEND_API_KEY,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._config.timeout);

    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Start background retry processor
   */
  private _startRetryProcessor(): void {
    setInterval(async () => {
      if (this._retryQueue.length === 0) return;

      const item = this._retryQueue.shift();
      if (!item) return;

      const { event, attempts } = item;

      if (attempts >= this._config.retryAttempts) {
        // Retries exhausted: mark failed but keep the event observable in the
        // pending set instead of silently dropping it from the retry queue.
        event.forwardStatus = 'failed';
        logger.error(`[Forwarder] Max retries reached for event ${event.id}`);
        return;
      }

      logger.info(`[Forwarder] Retrying event ${event.id} (attempt ${attempts + 1})`);

      try {
        const response = await this._sendEvent(event);

        if (response.ok) {
          event.forwardStatus = 'success';
          event.forwardedAt = new Date().toISOString();
          this._pendingEvents.delete(event.id);
          logger.info(`[Forwarder] Event ${event.id} forwarded on retry`);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        logger.error(`[Forwarder] Retry failed for event ${event.id}`, { eventId: event.id, error });
        this._retryQueue.push({ event, attempts: attempts + 1 });
      }
    }, this._config.retryDelay);
  }

  /**
   * Get pending events count
   */
  public getPendingCount(): number {
    return this._pendingEvents.size;
  }

  /**
   * Get retry queue length
   */
  public getRetryQueueLength(): number {
    return this._retryQueue.length;
  }

  /**
   * Shutdown forwarder
   */
  public async shutdown(): Promise<void> {
    logger.info('[Forwarder] Shutting down...');

    // Wait for retry queue to process
    while (this._retryQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info('[Forwarder] Shutdown complete');
  }
}
