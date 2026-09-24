/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhook Types for iTwin Platform
 * Pure Webhook Receiver - No WebSocket
 */

/**
 * Base event structure from iTwin Platform
 */
export interface WebhookEvent {
  /** Event type identifier */
  eventType: string;
  /** iTwin ID where event occurred */
  iTwinId: string;
  /** Message ID for deduplication */
  messageId?: string;
  /** Webhook ID */
  webhookId?: string;
  /** Enqueued timestamp */
  enqueuedDateTime?: string;
  /** Event-specific payload */
  content: unknown;
}

/**
 * iModel deleted event
 */
export interface IModelDeletedEvent {
  imodelId: string;
  imodelName: string;
  imodelDescription: string;
}

/**
 * iModel created event
 */
export interface IModelCreatedEvent {
  imodelId: string;
  imodelName: string;
  imodelDescription: string;
  userId?: string;
}

/**
 * iModel created - needs baseline file generation
 * Internal event type for async baseline generation
 */
export interface IModelCreatedNeedBaselineEvent {
  imodelId: string;
  imodelName: string;
  imodelDescription: string;
  userId?: string;
  iTwinId: string;
  needBaseline: boolean;
}

/**
 * iModel updated event
 */
export interface IModelUpdatedEvent {
  imodelId: string;
  imodelName: string;
  changes: string[];
}

/**
 * Changeset pushed event
 */
export interface ChangesetPushedEvent {
  imodelId: string;
  changesetId: string;
  changesetIndex: number;
  briefcaseId?: number;
  description: string;
  pushedBy: string;
}

/**
 * Named version created event
 */
export interface NamedVersionCreatedEvent {
  imodelId: string;
  versionId: string;
  versionName: string;
  changesetId: string;
}

/**
 * Member added event
 */
export interface MemberAddedEvent {
  memberId: string;
  memberType?: string;
  roleId: string;
  roleName: string;
  eventCreatedBy?: string;
}

/**
 * Member removed event
 */
export interface MemberRemovedEvent {
  memberId: string;
}

/**
 * Member role updated event
 */
export interface MemberRoleUpdatedEvent {
  memberId: string;
  newRoleId: string;
  newRoleName: string;
  oldRoleId: string;
  oldRoleName: string;
}

/**
 * Briefcase acquired event
 */
export interface BriefcaseAcquiredEvent {
  imodelId: string;
  briefcaseId: number;
  acquiredBy: string;
}

/**
 * Briefcase released event
 */
export interface BriefcaseReleasedEvent {
  imodelId: string;
  briefcaseId: number;
  releasedBy: string;
}

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
  /** API key for authentication */
  apiKey?: string;
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
  /** API key for backend authentication */
  backendApiKey?: string;
}
