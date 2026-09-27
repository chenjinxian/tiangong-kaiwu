/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared modeling-server base-URL resolution for the web app.
 *
 * `VITE_API_URL` is OPTIONAL and its EMPTY value is meaningful: it selects
 * same-origin relative URLs, so every modeling-server face (/api, /ws, /ipc)
 * is served through the reverse proxy (nginx) on the current origin — the
 * deployment premise for the same-origin session-cookie path. Production
 * images build WITHOUT the variable; local dev sets
 * `VITE_API_URL=http://localhost:4001` (apps/web/.env.development) so the
 * dev server talks to the modeling-server directly.
 */

function configuredBase(): string {
  return import.meta.env.VITE_API_URL ?? '';
}

/**
 * Prefix for modeling-server fetch calls (`''` = same-origin relative URL).
 * Every caller prefixes it directly: `${API_BASE_URL}/api/...`.
 */
export const API_BASE_URL: string = configuredBase();

/**
 * Resolve a modeling-server WebSocket URL from a path that starts with `/`
 * (e.g. `/ws`, `/ws?token=...`). Derives the ws/wss scheme from the current
 * origin when `VITE_API_URL` is unset, or from the configured base
 * (http -> ws) when set.
 */
export function wsUrl(path: string): string {
  const base = configuredBase();
  if (base === '') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  }
  return `${base.replace(/^http/i, 'ws')}${path}`;
}
