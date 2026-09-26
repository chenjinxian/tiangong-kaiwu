import { afterEach, describe, expect, it, vi } from 'vitest';

// Config seam: the logger reads the frozen `config` singleton at import time,
// and the real config validates eagerly (exiting the test process on machines
// without a repo-root .env). Mocked wholesale like the other suites; the
// logger only consumes LOG_LEVEL from it.
vi.mock('../config.js', () => ({
  config: { LOG_LEVEL: 'info' },
}));

import { LogLevel, logger } from './logger.js';

describe('logger', () => {
  afterEach(() => logger.setLevel(LogLevel.INFO));

  it('emits one JSON line per call with level, message, context, timestamp, service', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((l: string) => lines.push(l));
    logger.info('baseline done', { iModelId: 'im-1' });
    spy.mockRestore();
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ level: 'info', message: 'baseline done', service: 'webhook-agent', iModelId: 'im-1' });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('suppresses levels below the configured threshold', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((l: string) => lines.push(l));
    logger.setLevel(LogLevel.WARN);
    logger.info('should not appear');
    logger.warn('should appear');
    spy.mockRestore();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).level).toBe('warn');
  });

  it('writes errors to console.error with level error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('boom', { code: 500 });
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it('serializes Error instances in context with name, message and stack', () => {
    const lines: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation((l: string) => lines.push(l));
    logger.error('failed', { error: new Error('boom') });
    err.mockRestore();
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.error.name).toBe('Error');
    expect(entry.error.message).toBe('boom');
    expect(typeof entry.error.stack).toBe('string');
    expect(entry.error.stack.length).toBeGreaterThan(0);
  });
});
