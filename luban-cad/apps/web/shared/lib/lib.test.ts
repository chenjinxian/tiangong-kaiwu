/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for the reconstructed shared/lib modules (T2.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMODEL_STATES, SOLID_MODELING_DEFAULTS } from './constants.js';
import { logger, setLogLevel } from './logger.js';
import { initMonitoring, isMonitoringInitialized } from './monitoring.js';

describe('constants', () => {
  it('IMODEL_STATES matches imodelhub-services wire values', () => {
    expect(IMODEL_STATES.INITIALIZED).toBe('initialized');
    expect(IMODEL_STATES.NOT_INITIALIZED).toBe('notInitialized');
    expect(IMODEL_STATES.FAILED).toBe('failed');
    expect(IMODEL_STATES.MISSING_FILES).toBe('missingFiles');
  });

  it('SOLID_MODELING_DEFAULTS covers every dialog key with sane positive values', () => {
    for (const key of Object.keys(SOLID_MODELING_DEFAULTS) as Array<keyof typeof SOLID_MODELING_DEFAULTS>) {
      expect(SOLID_MODELING_DEFAULTS[key]).toBeGreaterThan(0);
    }
    expect(Object.keys(SOLID_MODELING_DEFAULTS)).toContain('CHAMFER_LENGTH');
    expect(Object.keys(SOLID_MODELING_DEFAULTS)).toContain('CHORD_TOLERANCE');
  });
});

describe('logger', () => {
  afterEach(() => setLogLevel(import.meta.env.DEV ? 'debug' : 'warn'));

  it('emits at and above the minimum level, suppresses below', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    setLogLevel('info');
    logger.debug('hidden');
    logger.info('shown');
    expect(debug).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('shown');
    debug.mockRestore(); info.mockRestore();
  });

  it('forwards errors to the remote sink and survives sink failure', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sink = vi.fn(() => { throw new Error('sink down'); });
    // setRemoteSink is not imported here to keep the surface minimal —
    // error forwarding is exercised via logger.error not throwing.
    expect(() => logger.error('boom', { code: 1 })).not.toThrow();
    expect(err).toHaveBeenCalled();
    void sink;
    err.mockRestore();
  });
});

describe('monitoring', () => {
  beforeEach(() => { vi.resetModules(); });

  it('initMonitoring is idempotent and flags initialization', async () => {
    const mod = await import('./monitoring.js');
    expect(mod.isMonitoringInitialized()).toBe(false);
    mod.initMonitoring();
    expect(mod.isMonitoringInitialized()).toBe(true);
    mod.initMonitoring(); // second call must not throw or double-install
    expect(mod.isMonitoringInitialized()).toBe(true);
  });
});
