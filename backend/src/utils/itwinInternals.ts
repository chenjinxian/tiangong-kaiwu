/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Helpers for accessing iTwin.js internal APIs not exposed in public types.
 * These are necessary workarounds for the limited public API surface.
 */

import { IModelDb } from '@itwin/core-backend';

const NATIVE_DB_SYMBOL = Symbol.for('nativeDb_core-backend_INTERNAL_ONLY_DO_NOT_USE');

/** Access the native database handle on an IModelDb instance. */
export function getNativeDb(db: IModelDb): { hasPendingTxns(): boolean; hasUnsavedChanges(): boolean } | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as unknown as Record<symbol, unknown>)[NATIVE_DB_SYMBOL] as { hasPendingTxns(): boolean; hasUnsavedChanges(): boolean } | undefined;
}

/** Access the map of currently open IModelDb instances. */
export function getOpenDbs(): Map<string, IModelDb> | undefined {
  return (IModelDb as unknown as { _openDbs?: Map<string, IModelDb> })._openDbs;
}

/** Check if a database has pending transactions. */
export function hasPendingTxns(db: IModelDb): boolean {
  return getNativeDb(db)?.hasPendingTxns() ?? false;
}
