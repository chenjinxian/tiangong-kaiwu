import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProcessedEventsStore } from './processedEventsStore.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('processedEventsStore', () => {
  it('round-trips entries across restarts and persists on add', () => {
    dir = mkdtempSync(join(tmpdir(), 'pes-'));
    const file = join(dir, 'processed-events.json');
    createProcessedEventsStore(file).add('im-1');
    const reloaded = createProcessedEventsStore(file);
    expect(reloaded.has('im-1')).toBe(true);
    expect(reloaded.has('im-2')).toBe(false);
  });

  it('expires entries older than the TTL on load', () => {
    dir = mkdtempSync(join(tmpdir(), 'pes-'));
    const file = join(dir, 'processed-events.json');
    writeFileSync(file, JSON.stringify({ events: [{ id: 'old', ts: Date.now() - 60 * 60 * 1000 }] }));
    const store = createProcessedEventsStore(file, 120_000);
    expect(store.has('old')).toBe(false);
  });

  it('recovers from a corrupted file with an empty store', () => {
    dir = mkdtempSync(join(tmpdir(), 'pes-'));
    const file = join(dir, 'processed-events.json');
    writeFileSync(file, '{not json');
    const store = createProcessedEventsStore(file);
    expect(store.size()).toBe(0);
    store.add('im-3');
    expect(JSON.parse(readFileSync(file, 'utf8')).events).toHaveLength(1);
  });

  it('expires entries on read without a reload (in-process TTL)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pes-'));
    const file = join(dir, 'processed-events.json');
    const store = createProcessedEventsStore(file, 10);
    store.add('fresh');
    expect(store.has('fresh')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(store.has('fresh')).toBe(false);
    expect(store.size()).toBe(0);
  });
});
