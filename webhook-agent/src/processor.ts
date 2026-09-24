/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhook Event Processor
 *
 * Processes validated webhook events and dispatches them to handlers.
 */

import type {
  BriefcaseAcquiredEvent,
  BriefcaseReleasedEvent,
  ChangesetPushedEvent,
  IModelCreatedEvent,
  IModelDeletedEvent,
  MemberAddedEvent,
  MemberRemovedEvent,
  MemberRoleUpdatedEvent,
  NamedVersionCreatedEvent,
  ProcessedEvent,
  WebhookEvent,
} from './types.js';

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: WebhookEvent, content: T) => Promise<void> | void;

/**
 * Event handlers registry
 */
export interface EventHandlers {
  [eventType: string]: EventHandler<unknown>[];
}

/**
 * Event processor options
 */
export interface ProcessorOptions {
  /** Maximum concurrent event processing */
  maxConcurrent?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Webhook Event Processor
 *
 * Manages event handlers and processes incoming webhook events.
 */
export class EventProcessor {
  private _handlers: EventHandlers = {};
  private _options: ProcessorOptions;
  private _processingQueue: ProcessedEvent[] = [];

  constructor(options: ProcessorOptions = {}) {
    this._options = {
      maxConcurrent: 10,
      debug: false,
      ...options,
    };
  }

  /**
   * Register an event handler
   *
   * @param eventType - Event type to handle (or '*' for all events)
   * @param handler - Handler function
   */
  public on<T>(eventType: string, handler: EventHandler<T>): void {
    if (!this._handlers[eventType]) {
      this._handlers[eventType] = [];
    }
    this._handlers[eventType].push(handler as EventHandler<unknown>);

    if (this._options.debug) {
      // eslint-disable-next-line no-console
      console.log(`[Processor] Registered handler for ${eventType}`);
    }
  }

  /**
   * Remove an event handler
   *
   * @param eventType - Event type
   * @param handler - Handler function to remove
   */
  public off<T>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this._handlers[eventType];
    if (!handlers) return;

    const index = handlers.indexOf(handler as EventHandler<unknown>);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Process an incoming webhook event
   *
   * @param event - Parsed webhook event
   * @returns Processed event with status
   */
  public async processEvent(event: WebhookEvent): Promise<ProcessedEvent> {
    const processedEvent: ProcessedEvent = {
      ...event,
      id: this._generateEventId(),
      status: 'processing',
      processedAt: new Date().toISOString(),
    };

    if (this._options.debug) {
      // eslint-disable-next-line no-console
      console.log(`[Processor] Processing event: ${event.eventType}`);
    }

    try {
      // Get handlers for this event type
      const specificHandlers = this._handlers[event.eventType] || [];
      const wildcardHandlers = this._handlers['*'] || [];
      const handlers = [...specificHandlers, ...wildcardHandlers];

      if (handlers.length === 0) {
        if (this._options.debug) {
          // eslint-disable-next-line no-console
          console.log(`[Processor] No handlers for ${event.eventType}`);
        }
      } else {
        // Execute all handlers concurrently
        await Promise.all(
          handlers.map(async (handler) => {
            try {
              await handler(event, event.content);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error(`[Processor] Handler error for ${event.eventType}:`, error);
            }
          })
        );
      }

      processedEvent.status = 'completed';

      if (this._options.debug) {
        // eslint-disable-next-line no-console
        console.log(`[Processor] Event completed: ${event.eventType}`);
      }
    } catch (error) {
      processedEvent.status = 'failed';
      processedEvent.error = error instanceof Error ? error.message : 'Unknown error';
      // eslint-disable-next-line no-console
      console.error(`[Processor] Event failed: ${event.eventType}`, error);
    }

    this._processingQueue.push(processedEvent);

    // Keep only last 1000 events
    if (this._processingQueue.length > 1000) {
      this._processingQueue.shift();
    }

    return processedEvent;
  }

  /**
   * Get recent processed events
   *
   * @param limit - Maximum number of events to return
   * @returns Recent processed events
   */
  public getRecentEvents(limit: number = 100): ProcessedEvent[] {
    return this._processingQueue.slice(-limit);
  }

  /**
   * Get events by type
   *
   * @param eventType - Event type to filter by
   * @returns Matching events
   */
  public getEventsByType(eventType: string): ProcessedEvent[] {
    return this._processingQueue.filter((e) => e.eventType === eventType);
  }

  /**
   * Generate unique event ID
   */
  private _generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Built-in event handlers for common iTwin Platform events
 */
export const builtinHandlers = {
  /**
   * Handle iModel deletion
   */
  onIModelDeleted: (callback: (event: WebhookEvent, content: IModelDeletedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'iModels.iModelDeleted.v1') {
        callback(event, content as IModelDeletedEvent);
      }
    };
  },

  /**
   * Handle iModel creation
   */
  onIModelCreated: (callback: (event: WebhookEvent, content: IModelCreatedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'iModels.iModelCreated.v1') {
        callback(event, content as IModelCreatedEvent);
      }
    };
  },

  /**
   * Handle changeset push
   */
  onChangesetPushed: (callback: (event: WebhookEvent, content: ChangesetPushedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'iModels.ChangesetPushed.v1') {
        callback(event, content as ChangesetPushedEvent);
      }
    };
  },

  /**
   * Handle named version creation
   */
  onNamedVersionCreated: (callback: (event: WebhookEvent, content: NamedVersionCreatedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'iModels.NamedVersionCreated.v1') {
        callback(event, content as NamedVersionCreatedEvent);
      }
    };
  },

  /**
   * Handle member added
   */
  onMemberAdded: (callback: (event: WebhookEvent, content: MemberAddedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'accessControl.memberAdded.v1') {
        callback(event, content as MemberAddedEvent);
      }
    };
  },

  /**
   * Handle member removed
   */
  onMemberRemoved: (callback: (event: WebhookEvent, content: MemberRemovedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'accessControl.memberRemoved.v1') {
        callback(event, content as MemberRemovedEvent);
      }
    };
  },

  /**
   * Handle member role updated
   */
  onMemberRoleUpdated: (callback: (event: WebhookEvent, content: MemberRoleUpdatedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'accessControl.memberRoleUpdated.v1') {
        callback(event, content as MemberRoleUpdatedEvent);
      }
    };
  },

  /**
   * Handle briefcase acquired
   */
  onBriefcaseAcquired: (callback: (event: WebhookEvent, content: BriefcaseAcquiredEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'iModels.BriefcaseAcquired.v1') {
        callback(event, content as BriefcaseAcquiredEvent);
      }
    };
  },

  /**
   * Handle briefcase released
   */
  onBriefcaseReleased: (callback: (event: WebhookEvent, content: BriefcaseReleasedEvent) => void) => {
    return (event: WebhookEvent, content: unknown) => {
      if (event.eventType === 'iModels.BriefcaseReleased.v1') {
        callback(event, content as BriefcaseReleasedEvent);
      }
    };
  },
};
