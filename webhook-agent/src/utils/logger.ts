/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Backend logger utility
 * Provides structured logging compatible with popular logging services
 */

import * as fs from "node:fs";
import type { Request, Response } from "express";
import { config } from "../config.js";

/**
 * Package version, read from package.json (npm only injects
 * npm_package_version when running through npm scripts, so read the file
 * directly to get the same value everywhere).
 */
function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as { version?: string };
    return pkg.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export enum LogLevel {
  TRACE = "trace",
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  FATAL = "fatal",
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  version?: string;
  requestId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
}

class Logger {
  private service = "webhook-agent";
  private version = readPackageVersion();
  private level: LogLevel = LogLevel.INFO;

  private readonly levelPriority: Record<LogLevel, number> = {
    [LogLevel.TRACE]: 0,
    [LogLevel.DEBUG]: 1,
    [LogLevel.INFO]: 2,
    [LogLevel.WARN]: 3,
    [LogLevel.ERROR]: 4,
    [LogLevel.FATAL]: 5,
  };

  constructor() {
    // Log level comes from validated config (LOG_LEVEL)
    this.level = config.LOG_LEVEL as LogLevel;
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.level];
  }

  /**
   * Format log entry as a single JSON line (structured output only, so log
   * shippers and tests can parse every line). Error instances are expanded
   * explicitly: name/message/stack are non-enumerable, so a bare
   * JSON.stringify would emit {}.
   */
  private format(entry: LogEntry): string {
    return JSON.stringify(entry, (k, v) =>
      v instanceof Error
        ? { name: v.name, message: v.message, stack: v.stack }
        : v
    );
  }

  /**
   * Write log entry (public for external access)
   */
  public log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      version: this.version,
      ...meta,
    };

    const formatted = this.format(entry);

    // Output to appropriate stream: errors and fatals go to stderr,
    // everything else to stdout.
    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log trace message
   */
  trace(message: string, context?: object): void {
    this.log(LogLevel.TRACE, message, context as Record<string, unknown>);
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: object): void {
    this.log(LogLevel.DEBUG, message, context as Record<string, unknown>);
  }

  /**
   * Log info message
   */
  info(message: string, context?: object): void {
    this.log(LogLevel.INFO, message, context as Record<string, unknown>);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: object): void {
    this.log(LogLevel.WARN, message, context as Record<string, unknown>);
  }

  /**
   * Log error message
   */
  error(message: string, context?: object): void {
    this.log(LogLevel.ERROR, message, context as Record<string, unknown>);
  }

  /**
   * Log fatal message
   */
  fatal(message: string, context?: object): void {
    this.log(LogLevel.FATAL, message, context as Record<string, unknown>);
  }

  /**
   * Create a child logger with additional context
   */
  child(meta: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, meta);
  }
}

/**
 * Child logger with predefined context
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: Record<string, unknown>
  ) {}

  trace(message: string, context?: object): void {
    this.parent.trace(message, { ...this.context, ...(context as Record<string, unknown>) });
  }

  debug(message: string, context?: object): void {
    this.parent.debug(message, { ...this.context, ...(context as Record<string, unknown>) });
  }

  info(message: string, context?: object): void {
    this.parent.info(message, { ...this.context, ...(context as Record<string, unknown>) });
  }

  warn(message: string, context?: object): void {
    this.parent.warn(message, { ...this.context, ...(context as Record<string, unknown>) });
  }

  error(message: string, context?: object): void {
    this.parent.error(message, { ...this.context, ...(context as Record<string, unknown>) });
  }

  fatal(message: string, context?: object): void {
    this.parent.fatal(message, { ...this.context, ...(context as Record<string, unknown>) });
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Express middleware for request logging
 */
export function requestLogger(req: Request, res: Response, next: () => void): void {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Add request ID to response headers
  res.setHeader("X-Request-ID", requestId);

  // Log request start
  logger.debug("Request started", {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get("user-agent"),
    ip: req.ip,
  });

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;

    logger.log(level, "Request completed", {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get("content-length"),
    });
  });

  next();
}
