/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Frontend logger — thin leveled wrapper over console with a pluggable
 * sink. Reconstructed in T2.3 (original never committed).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = import.meta.env.DEV ? 'debug' : 'warn';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/** Optional remote sink (e.g. error-reporting service). Errors are forwarded. */
let remoteSink: ((level: LogLevel, message: string, context?: unknown) => void) | undefined;

export function setRemoteSink(sink: (level: LogLevel, message: string, context?: unknown) => void): void {
  remoteSink = sink;
}

function emit(level: LogLevel, message: string, context?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const args = context === undefined ? [message] : [message, context];
  // eslint-disable-next-line no-console
  console[level](...args);
  if (level === 'error' && remoteSink) {
    try { remoteSink(level, message, context); } catch { /* sink must not break the app */ }
  }
}

export const logger = {
  debug: (message: string, context?: unknown) => emit('debug', message, context),
  info: (message: string, context?: unknown) => emit('info', message, context),
  warn: (message: string, context?: unknown) => emit('warn', message, context),
  error: (message: string, context?: unknown) => emit('error', message, context),
};

export type Logger = typeof logger;
