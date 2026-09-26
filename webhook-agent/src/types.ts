/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhook-agent INTERNAL types. Cross-service contract types
 * (event envelopes, content payloads, needBaseline, progress) live in
 * @luban-cad/shared — single source of contract truth (T1.2).
 */

import type { WebhookEvent } from '@luban-cad/shared';

/**
 * Processed event with metadata
 */
export interface ProcessedEvent extends WebhookEvent {
  /** Unique event ID */
  id: string;
  /** Processing status */
  status: 'received' | 'validated' | 'processing' | 'completed' | 'failed' | 'forwarded';
  /** Error message if failed */
  error?: string;
  /** Processing timestamp */
  processedAt?: string;
  /** Forward timestamp */
  forwardedAt?: string;
  /** Forward status to backend */
  forwardStatus?: 'pending' | 'success' | 'failed';
}

/**
 * Event forwarder configuration
 */
export interface ForwarderConfig {
  /** Backend URL to forward events */
  backendUrl: string;
  /** Forward timeout in ms */
  timeout: number;
  /** Retry attempts */
  retryAttempts: number;
  /** Retry delay in ms */
  retryDelay: number;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  /** Webhook secret for signature validation */
  secret: string;
  /** Webhook ID for activation */
  webhookId?: string;
  /** Server port */
  port: number;
  /** Allowed origins for CORS */
  allowedOrigins: string[];
  /** Backend URL for event forwarding */
  backendUrl: string;
}
