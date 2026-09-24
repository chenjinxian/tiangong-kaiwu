/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Webhook event types from iTwin Platform
 * Based on imodelhub-services implementation
 */
export type WebhookEventType =
  // iModel events
  | 'iModels.iModelCreated.v1'
  | 'iModels.iModelDeleted.v1'
  | 'iModels.NamedVersionCreated.v1'
  | 'iModels.ChangesetPushed.v1'
  | 'iModels.changesReady.v1'
  // Access control events
  | 'accessControl.memberAdded.v1'
  | 'accessControl.memberRemoved.v1'
  | 'accessControl.memberRoleUpdated.v1'
  | 'accessControl.roleAssigned.v1'
  | 'accessControl.roleUnassigned.v1'
  | 'accessControl.invitationCreated.v1'
  // Project events
  | 'iTwins.iTwinCreated.v1'
  | 'iTwins.iTwinDeleted.v1'
  | 'iTwins.iTwinUpdated.v1'
  // Job completion events
  | 'synchronization.jobCompleted.v1'
  | 'transformations.jobCompleted.v1'
  | 'realityModeling.jobCompleted.v1'
  | 'realityModeling.jobCompleted.v2'
  | 'realityAnalysis.jobCompleted.v1'
  | 'realityConversion.jobCompleted.v1'
  | 'changedElements.jobCompleted.v1'
  | 'export.jobCompleted.v1';

/**
 * Base webhook event
 */
export interface WebhookEvent {
  eventType: WebhookEventType;
  iTwinId: string;
  messageId: string;
  webhookId: string;
  enqueuedDateTime: string;
}

// ========== iModel Events ==========

/**
 * iModel created event
 */
export interface IModelCreatedEvent extends WebhookEvent {
  eventType: 'iModels.iModelCreated.v1';
  content: {
    imodelId: string;
    imodelName: string;
    imodelDescription?: string;
    userId: string;
  };
}

/**
 * iModel deleted event
 */
export interface IModelDeletedEvent extends WebhookEvent {
  eventType: 'iModels.iModelDeleted.v1';
  content: {
    imodelId: string;
    userId: string;
  };
}

/**
 * Named version created event
 */
export interface NamedVersionCreatedEvent extends WebhookEvent {
  eventType: 'iModels.NamedVersionCreated.v1';
  content: {
    imodelId: string;
    namedVersionId: string;
    namedVersionName: string;
    changesetId: string;
    userId: string;
  };
}

/**
 * Changeset pushed event
 */
export interface ChangesetPushedEvent extends WebhookEvent {
  eventType: 'iModels.ChangesetPushed.v1';
  content: {
    imodelId: string;
    changesetId: string;
    changesetIndex: number;
    description?: string;
    userId: string;
  };
}

/**
 * Changes ready event - triggered when new changes are available to process
 */
export interface ChangesReadyEvent extends WebhookEvent {
  eventType: 'iModels.changesReady.v1';
  content: {
    imodelId: string;
    changesetId: string;
    changesetIndex: number;
    userId: string;
  };
}

// ========== Access Control Events ==========

/**
 * Member added event
 */
export interface MemberAddedEvent extends WebhookEvent {
  eventType: 'accessControl.memberAdded.v1';
  content: {
    memberId: string;
    memberType: 'User' | 'Service';
    roleId: string;
    roleName: string;
    eventCreatedBy: string;
  };
}

/**
 * Member removed event
 */
export interface MemberRemovedEvent extends WebhookEvent {
  eventType: 'accessControl.memberRemoved.v1';
  content: {
    memberId: string;
    memberType: 'User' | 'Service';
    eventCreatedBy: string;
  };
}

/**
 * Member role updated event
 */
export interface MemberRoleUpdatedEvent extends WebhookEvent {
  eventType: 'accessControl.memberRoleUpdated.v1';
  content: {
    memberId: string;
    memberType: 'User' | 'Service';
    newRoleId: string;
    newRoleName: string;
    oldRoleId: string;
    oldRoleName: string;
    eventCreatedBy: string;
  };
}

/**
 * Role assigned event
 */
export interface RoleAssignedEvent extends WebhookEvent {
  eventType: 'accessControl.roleAssigned.v1';
  content: {
    memberId: string;
    memberType: 'User' | 'Service';
    roleId: string;
    roleName: string;
    eventCreatedBy: string;
  };
}

/**
 * Role unassigned event
 */
export interface RoleUnassignedEvent extends WebhookEvent {
  eventType: 'accessControl.roleUnassigned.v1';
  content: {
    memberId: string;
    memberType: 'User' | 'Service';
    roleId: string;
    roleName: string;
    eventCreatedBy: string;
  };
}

/**
 * Invitation created event
 */
export interface InvitationCreatedEvent extends WebhookEvent {
  eventType: 'accessControl.invitationCreated.v1';
  content: {
    invitationId: string;
    email: string;
    roleId: string;
    roleName: string;
    invitedBy: string;
  };
}

// ========== iTwin (Project) Events ==========

/**
 * iTwin created event
 */
export interface ITwinCreatedEvent extends WebhookEvent {
  eventType: 'iTwins.iTwinCreated.v1';
  content: {
    iTwinId: string;
    iTwinName: string;
    iTwinClass: string;
    userId: string;
  };
}

/**
 * iTwin deleted event
 */
export interface ITwinDeletedEvent extends WebhookEvent {
  eventType: 'iTwins.iTwinDeleted.v1';
  content: {
    iTwinId: string;
    userId: string;
  };
}

/**
 * iTwin updated event
 */
export interface ITwinUpdatedEvent extends WebhookEvent {
  eventType: 'iTwins.iTwinUpdated.v1';
  content: {
    iTwinId: string;
    displayName?: string;
    // eslint-disable-next-line id-denylist
    number?: string;
    status?: string;
    userId: string;
  };
}

// ========== Job Completion Events ==========

/**
 * Base job completed event
 */
interface JobCompletedContent {
  jobId: string;
  imodelId?: string;
  iTwinId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  userId: string;
  startedDateTime: string;
  completedDateTime: string;
  errorMessage?: string;
}

/**
 * Synchronization job completed event
 */
export interface SynchronizationJobCompletedEvent extends WebhookEvent {
  eventType: 'synchronization.jobCompleted.v1';
  content: JobCompletedContent & {
    sourceFiles: Array<{
      fileId: string;
      fileName: string;
      status: 'succeeded' | 'failed';
    }>;
  };
}

/**
 * Transformation job completed event
 */
export interface TransformationJobCompletedEvent extends WebhookEvent {
  eventType: 'transformations.jobCompleted.v1';
  content: JobCompletedContent & {
    transformationId: string;
    sourceIModelId: string;
    targetIModelId: string;
  };
}

/**
 * Reality modeling job completed event (v1)
 */
export interface RealityModelingJobCompletedV1Event extends WebhookEvent {
  eventType: 'realityModeling.jobCompleted.v1';
  content: JobCompletedContent & {
    realityDataId: string;
    realityDataName: string;
  };
}

/**
 * Reality modeling job completed event (v2)
 */
export interface RealityModelingJobCompletedV2Event extends WebhookEvent {
  eventType: 'realityModeling.jobCompleted.v2';
  content: JobCompletedContent & {
    realityDataId: string;
    realityDataName: string;
    outputs: Array<{
      type: string;
      realityDataId: string;
    }>;
  };
}

/**
 * Reality analysis job completed event
 */
export interface RealityAnalysisJobCompletedEvent extends WebhookEvent {
  eventType: 'realityAnalysis.jobCompleted.v1';
  content: JobCompletedContent & {
    analysisId: string;
    analysisType: string;
  };
}

/**
 * Reality conversion job completed event
 */
export interface RealityConversionJobCompletedEvent extends WebhookEvent {
  eventType: 'realityConversion.jobCompleted.v1';
  content: JobCompletedContent & {
    conversionId: string;
    sourceRealityDataId: string;
  };
}

/**
 * Changed elements job completed event
 */
export interface ChangedElementsJobCompletedEvent extends WebhookEvent {
  eventType: 'changedElements.jobCompleted.v1';
  content: JobCompletedContent & {
    comparisonId: string;
    sourceChangesetId: string;
    targetChangesetId: string;
    changedElementsCount: number;
  };
}

/**
 * Export job completed event
 */
export interface ExportJobCompletedEvent extends WebhookEvent {
  eventType: 'export.jobCompleted.v1';
  content: JobCompletedContent & {
    exportId: string;
    format: 'IFC' | 'STEP' | 'OBJ' | 'GLTF' | 'FBX';
    downloadUrl?: string;
    fileSize?: number;
  };
}

/**
 * Union type for all webhook events
 */
export type AnyWebhookEvent =
  | IModelCreatedEvent
  | IModelDeletedEvent
  | NamedVersionCreatedEvent
  | ChangesetPushedEvent
  | ChangesReadyEvent
  | MemberAddedEvent
  | MemberRemovedEvent
  | MemberRoleUpdatedEvent
  | RoleAssignedEvent
  | RoleUnassignedEvent
  | InvitationCreatedEvent
  | ITwinCreatedEvent
  | ITwinDeletedEvent
  | ITwinUpdatedEvent
  | SynchronizationJobCompletedEvent
  | TransformationJobCompletedEvent
  | RealityModelingJobCompletedV1Event
  | RealityModelingJobCompletedV2Event
  | RealityAnalysisJobCompletedEvent
  | RealityConversionJobCompletedEvent
  | ChangedElementsJobCompletedEvent
  | ExportJobCompletedEvent;

// ========== Webhook Subscription Types ==========

/**
 * Webhook subscription configuration
 */
export interface WebhookSubscription {
  id: string;
  callbackUrl: string;
  eventTypes: WebhookEventType[];
  scope: 'Account' | 'iTwin';
  iTwinId?: string;
  active: boolean;
  secret: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

/**
 * Create webhook subscription request
 */
export interface CreateWebhookSubscriptionRequest {
  callbackUrl: string;
  eventTypes: WebhookEventType[];
  scope: 'Account' | 'iTwin';
  iTwinId?: string;
}

/**
 * Update webhook subscription request
 */
export interface UpdateWebhookSubscriptionRequest {
  callbackUrl?: string;
  eventTypes?: WebhookEventType[];
  active?: boolean;
}

/**
 * Webhook subscription response
 */
export interface WebhookSubscriptionResponse {
  id: string;
  callbackUrl: string;
  eventTypes: WebhookEventType[];
  scope: 'Account' | 'iTwin';
  iTwinId?: string;
  active: boolean;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

/**
 * Webhook delivery attempt
 */
export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  eventType: WebhookEventType;
  payload: AnyWebhookEvent;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed' | 'retrying';
  retryCount: number;
  httpStatusCode?: number;
  errorMessage?: string;
  createdDateTime: string;
  deliveredDateTime?: string;
  nextRetryDateTime?: string;
}

/**
 * Webhook event processing result
 */
export interface WebhookProcessingResult {
  success: boolean;
  messageId: string;
  processedAt: string;
  error?: string;
}

/**
 * Notification message sent to clients
 */
export interface NotificationMessage {
  type: 'webhook' | 'system' | 'user';
  event?: AnyWebhookEvent;
  message?: string;
  timestamp: string;
  read: boolean;
}

/**
 * Webhook event filter options
 */
export interface WebhookEventFilter {
  eventTypes?: WebhookEventType[];
  iTwinId?: string;
  imodelId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Paginated webhook events response
 */
export interface PaginatedWebhookEvents {
  events: AnyWebhookEvent[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
}
