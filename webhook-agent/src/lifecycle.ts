/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * IModelHost lifecycle pairing.
 *
 * IModelHost is a process-global singleton: `startup()` re-installs the host
 * platform (native libs, tile cache, backend-locals) and `shutdown()` tears
 * it down. This module makes the pairing explicit and idempotent so that:
 * - startup happens exactly once per process (main.ts calls it at boot; the
 *   baseline generator's hot paths merely ensure it), and
 * - teardown happens exactly once per process, flushing the event forwarder
 *   first, driven by the SIGTERM/SIGINT handlers in main.ts.
 *
 * Idempotency flags are set only after their work completes, so a failed
 * startup can be retried by the next caller instead of latching a bad state.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
import { IModelHost } from '@itwin/core-backend';
import { logger } from './utils/logger.js';

/** Set once IModelHost.startup() has resolved successfully. */
let started = false;
/** Set once shutdownAll() has run to completion (success or logged failure). */
let shutDown = false;

/** Minimal structural shape of the forwarder needed at shutdown. */
export interface ShutdownCapable {
  shutdown(): Promise<void>;
}

/**
 * Ensure the process-global IModelHost is started. Idempotent: repeated calls
 * after a successful startup are no-ops, so hot paths (baseline generation)
 * can call this freely instead of each owning a startup call.
 */
export async function ensureIModelHostStarted(): Promise<void> {
  if (started) return;

  try {
    await IModelHost.startup();
    started = true;
    logger.info('[Lifecycle] IModelHost started (process-global, single startup)');
  } catch (error) {
    // Not latching `started`: the next caller retries rather than proceeding
    // against an unstarted host.
    logger.error('[Lifecycle] IModelHost.startup failed', { error });
  }
}

/**
 * Tear the process down once: flush the event forwarder, then shut IModelHost
 * down. Idempotent, so signal handlers and other cleanup paths can all call
 * it without double-flushing or double-shutdown.
 */
export async function shutdownAll(forwarder?: ShutdownCapable): Promise<void> {
  if (shutDown) return;

  if (forwarder) {
    try {
      await forwarder.shutdown();
    } catch (error) {
      logger.error('[Lifecycle] forwarder.shutdown failed', { error });
    }
  }

  try {
    await IModelHost.shutdown();
    logger.info('[Lifecycle] IModelHost shut down');
  } catch (error) {
    logger.error('[Lifecycle] IModelHost.shutdown failed', { error });
  }

  shutDown = true;
}
