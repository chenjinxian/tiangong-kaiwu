/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Durable dedup store for processed events (e.g. iModels the recovery checker
 * has already kicked off). State survives process restarts: every add() is
 * written synchronously to a small JSON file, and construction reloads it,
 * dropping entries older than ttlMs. A corrupted file is downgraded to an
 * empty store (with a logger.warn) rather than crashing startup.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from './utils/logger.js';

export interface ProcessedEventsStore {
  /** O(1) membership check. */
  has(id: string): boolean;
  /** Record an id in memory and persist the store synchronously. */
  add(id: string): void;
  /** Write the current in-memory state to disk (synchronous). */
  persist(): void;
  /** Number of live (non-expired) entries. */
  size(): number;
}

interface StoredEvent {
  id: string;
  ts: number;
}

/** Default dedup window: matches the recovery checker's 2-minute in-flight hold. */
const DEFAULT_TTL_MS = 120_000;

/**
 * Create a JSON-file-backed dedup store.
 *
 * @param filePath JSON file (format: {"events":[{"id":"...","ts":123}]})
 * @param ttlMs entries older than this are swept on load
 */
export function createProcessedEventsStore(
  filePath: string,
  ttlMs: number = DEFAULT_TTL_MS
): ProcessedEventsStore {
  // id -> timestamp; Map gives O(1) has() and preserves insertion order on persist.
  const events = new Map<string, number>();

  const ttlSweep = (now: number): void => {
    for (const [id, ts] of events) {
      if (now - ts > ttlMs) events.delete(id);
    }
  };

  const load = (): void => {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; // first run: nothing on disk yet
      logger.warn(`[ProcessedEventsStore] Failed to read ${filePath}, starting empty`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { events?: StoredEvent[] };
      for (const event of parsed.events ?? []) {
        if (typeof event?.id === 'string' && typeof event?.ts === 'number') {
          events.set(event.id, event.ts);
        }
      }
    } catch (error) {
      // Corrupted file: warn and continue with an empty store so startup
      // never depends on the durability file being intact.
      logger.warn(`[ProcessedEventsStore] Corrupted store file ${filePath}, starting empty`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    ttlSweep(Date.now());
  };

  const persist = (): void => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload = JSON.stringify({
      events: Array.from(events, ([id, ts]) => ({ id, ts })),
    });
    fs.writeFileSync(filePath, payload, 'utf8');
  };

  load();

  return {
    has: (id: string) => events.has(id),

    add: (id: string) => {
      events.set(id, Date.now());
      persist();
    },

    persist,

    size: () => events.size,
  };
}
