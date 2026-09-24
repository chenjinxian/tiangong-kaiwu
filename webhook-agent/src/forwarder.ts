/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Event Forwarder - Sends processed events to Backend API
 *
 * Pure Webhook Receiver Architecture:
 *   Web-Agent receives webhook → processes → forwards to Backend via HTTP
 */

import type { ForwarderConfig, ProcessedEvent } from './types.js';

/**
 * Event Forwarder
 *
 * Forwards processed webhook events to the Backend API.
 * Handles retries and error recovery.
 */
export class EventForwarder {
  private _config: ForwarderConfig;
  private _pendingEvents: Map<string, ProcessedEvent> = new Map();
  private _retryQueue: Array<{ event: ProcessedEvent; attempts: number }> = [];

  constructor(config: Partial<ForwarderConfig>) {
    this._config = {
      backendUrl: config.backendUrl || 'http://localhost:4001',
      apiKey: config.apiKey,
      timeout: config.timeout || 5000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
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
      // eslint-disable-next-line no-console
      console.log(`[Forwarder] Forwarding event ${event.id} to backend`);

      const response = await this._sendEvent(event);

      if (response.ok) {
        event.forwardStatus = 'success';
        event.forwardedAt = new Date().toISOString();
        // eslint-disable-next-line no-console
        console.log(`[Forwarder] Event ${event.id} forwarded successfully`);
        return true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[Forwarder] Failed to forward event ${event.id}:`, error);
      event.forwardStatus = 'failed';

      // Queue for retry
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
    };

    if (this._config.apiKey) {
      headers['X-API-Key'] = this._config.apiKey;
    }

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
        // eslint-disable-next-line no-console
        console.error(`[Forwarder] Max retries reached for event ${event.id}`);
        return;
      }

      // eslint-disable-next-line no-console
      console.log(`[Forwarder] Retrying event ${event.id} (attempt ${attempts + 1})`);

      try {
        const response = await this._sendEvent(event);

        if (response.ok) {
          event.forwardStatus = 'success';
          event.forwardedAt = new Date().toISOString();
          // eslint-disable-next-line no-console
          console.log(`[Forwarder] Event ${event.id} forwarded on retry`);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[Forwarder] Retry failed for event ${event.id}:`, error);
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
    // eslint-disable-next-line no-console
    console.log('[Forwarder] Shutting down...');

    // Wait for retry queue to process
    while (this._retryQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // eslint-disable-next-line no-console
    console.log('[Forwarder] Shutdown complete');
  }
}
