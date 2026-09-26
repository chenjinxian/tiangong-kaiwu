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

interface MutableLogEntry {
  level?: LogLevel;
  message?: string;
  timestamp?: string;
  service?: string;
  version?: string;
  requestId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
}

class Logger {
  private service = "luban-cad-backend";
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
   * Format log entry as JSON (production) or pretty (development)
   */
  private format(entry: LogEntry): string {
    if (config.NODE_ENV === "production") {
      return JSON.stringify(entry);
    }

    // Pretty format for development
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const levelColor = this.getLevelColor(entry.level);
    const resetColor = "\x1b[0m";

    let output = `${timestamp} ${levelColor}[${entry.level.toUpperCase()}]${resetColor} ${entry.message}`;

    const meta: MutableLogEntry = { ...entry };
    delete meta.level;
    delete meta.message;
    delete meta.timestamp;
    delete meta.service;
    delete meta.version;

    if (Object.keys(meta).length > 0) {
      output += ` ${JSON.stringify(meta)}`;
    }

    return output;
  }

  /**
   * Get color code for log level
   */
  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE:
        return "\x1b[90m"; // Gray
      case LogLevel.DEBUG:
        return "\x1b[36m"; // Cyan
      case LogLevel.INFO:
        return "\x1b[32m"; // Green
      case LogLevel.WARN:
        return "\x1b[33m"; // Yellow
      case LogLevel.ERROR:
        return "\x1b[31m"; // Red
      case LogLevel.FATAL:
        return "\x1b[35m"; // Magenta
      default:
        return "\x1b[0m";
    }
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

    // Output to appropriate stream
    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      console.error(formatted);
    } else if (level === LogLevel.WARN) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Log trace message
   */
  trace(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, meta);
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * Log info message
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, {
      ...meta,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
  }

  /**
   * Log fatal message
   */
  fatal(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, {
      ...meta,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    });
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

  trace(message: string, meta?: Record<string, unknown>): void {
    this.parent.trace(message, { ...this.context, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.parent.debug(message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.parent.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.parent.warn(message, { ...this.context, ...meta });
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.parent.error(message, error, { ...this.context, ...meta });
  }

  fatal(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.parent.fatal(message, error, { ...this.context, ...meta });
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
