/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * useImodelProgressStream — live subscription to the modeling-server /ws
 * progress broadcast (IModelProgressEvent contract, @luban-cad/shared).
 *
 * - Single module-level connection shared by every consumer (no duplicate
 *   sockets when several components subscribe).
 * - Filters messages to `type === 'imodel-progress'` and dispatches the
 *   parsed event to the caller-supplied `onEvent` (kept in a ref so the
 *   connection never needs to be rebuilt when the callback identity changes).
 * - Reconnects on close/error with exponential backoff: 1s × 2, capped at 30s.
 * - 断连立即 live:false（重连收到消息后恢复）.
 * - `live` flips back to false after 30s without a message; the next message
 *   revives it. Consumers use `live` to disable polling fallback.
 */

import { useEffect, useRef, useState } from 'react';
import type { IModelProgressEvent } from '@luban-cad/shared';
import { getStoredAuth } from '../../auth/services/auth/client.js';

// ============================================================================
// Types
// ============================================================================

export interface UseImodelProgressStreamOptions {
  /** Called with every parsed imodel-progress event received on the stream. */
  onEvent?: (event: IModelProgressEvent) => void;
}

export interface ImodelProgressStreamState {
  /** True while the stream has delivered a message within the staleness window. */
  live: boolean;
  /** Timestamp (Date.now()) of the last imodel-progress message, if any. */
  lastEventAt: number | null;
}

// ============================================================================
// Constants
// ============================================================================

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const STALE_AFTER_MS = 30000;

const PROGRESS_EVENT_TYPE = 'imodel-progress';

// ============================================================================
// Module-level singleton connection
// ============================================================================

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let staleTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let refCount = 0;

let streamState: ImodelProgressStreamState = { live: false, lastEventAt: null };

const eventListeners = new Set<(event: IModelProgressEvent) => void>();
const stateListeners = new Set<(state: ImodelProgressStreamState) => void>();

function isProgressEvent(value: unknown): value is IModelProgressEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === PROGRESS_EVENT_TYPE
  );
}

function publishState(patch: Partial<ImodelProgressStreamState>): void {
  streamState = { ...streamState, ...patch };
  for (const listener of stateListeners) {
    listener(streamState);
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearStaleTimer(): void {
  if (staleTimer !== null) {
    clearTimeout(staleTimer);
    staleTimer = null;
  }
}

function armStaleTimer(): void {
  clearStaleTimer();
  staleTimer = setTimeout(() => {
    staleTimer = null;
    publishState({ live: false });
  }, STALE_AFTER_MS);
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
    RECONNECT_MAX_DELAY_MS
  );
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function resolveWsUrl(): string {
  // Mirror the Editor backend URL convention: default to the modeling-server
  // origin when VITE_API_URL is unset, then convert to the ws scheme.
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4001';
  const wsBase = base.replace(/^http/i, 'ws');
  const token = getStoredAuth().tokens?.accessToken ?? '';
  return token
    ? `${wsBase}/ws?token=${encodeURIComponent(token)}`
    : `${wsBase}/ws`;
}

function connect(): void {
  clearReconnectTimer();

  let socketInstance: WebSocket;
  try {
    socketInstance = new WebSocket(resolveWsUrl());
  } catch {
    scheduleReconnect();
    return;
  }
  socket = socketInstance;

  socketInstance.onmessage = (message: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(message.data));
    } catch {
      return; // Not JSON — ignore.
    }
    if (!isProgressEvent(parsed)) return; // Foreign channel — ignore.

    reconnectAttempt = 0; // Backoff resets once the stream is healthy again.
    publishState({ live: true, lastEventAt: Date.now() });
    armStaleTimer();
    for (const listener of eventListeners) {
      listener(parsed);
    }
  };

  socketInstance.onclose = () => {
    handleDisconnect(socketInstance);
  };

  socketInstance.onerror = () => {
    if (socket !== socketInstance) return; // onclose already handled it.
    try {
      socketInstance.close();
    } catch {
      // Best effort — the socket is already dead.
    }
    handleDisconnect(socketInstance);
  };
}

/**
 * Shared disconnect path (close or error): drop the socket, stop the staleness
 * timer, drop back to not-live immediately — `live` must be true only while
 * messages actually flow, so polling fallback resumes through the dead-stream
 * window — and schedule the backoff reconnect.
 */
function handleDisconnect(closedSocket: WebSocket): void {
  if (socket !== closedSocket) return; // Already replaced or torn down.
  socket = null;
  clearStaleTimer();
  publishState({ live: false });
  scheduleReconnect();
}

function teardown(): void {
  clearReconnectTimer();
  clearStaleTimer();
  reconnectAttempt = 0;
  if (socket) {
    const staleSocket = socket;
    socket = null;
    staleSocket.onmessage = null;
    staleSocket.onerror = null;
    staleSocket.onclose = null;
    try {
      staleSocket.close();
    } catch {
      // Ignore — teardown must never throw.
    }
  }
  publishState({ live: false, lastEventAt: null });
}

/**
 * Register a consumer. The first consumer opens the shared connection; the
 * last consumer to unsubscribe closes it and clears all timers.
 */
function subscribe(
  onEvent: (event: IModelProgressEvent) => void,
  onStateChange: (state: ImodelProgressStreamState) => void
): () => void {
  eventListeners.add(onEvent);
  stateListeners.add(onStateChange);
  refCount += 1;
  if (refCount === 1) {
    reconnectAttempt = 0;
    connect();
  }

  return () => {
    eventListeners.delete(onEvent);
    stateListeners.delete(onStateChange);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      teardown();
    }
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Subscribe to the modeling-server iModel progress stream.
 *
 * Returns `{ live, lastEventAt }`; `live` is driven by actual traffic and
 * falls back to false after 30s of silence, so callers can re-enable polling.
 */
export function useImodelProgressStream(
  options: UseImodelProgressStreamOptions = {}
): ImodelProgressStreamState {
  const { onEvent } = options;
  const [snapshot, setSnapshot] = useState<ImodelProgressStreamState>(getStreamState);

  // Keep the callback in a ref: consumers may pass inline closures (e.g.
  // queryClient.invalidateQueries handlers) without churning the connection.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(
    () => subscribe(
      (event) => onEventRef.current?.(event),
      setSnapshot
    ),
    []
  );

  return snapshot;
}

function getStreamState(): ImodelProgressStreamState {
  return streamState;
}

/**
 * Reset the module-level singleton (connections, timers, subscriber sets).
 * Exists purely for test isolation — do not call from application code.
 */
export function __resetProgressStreamForTests(): void {
  teardown();
  eventListeners.clear();
  stateListeners.clear();
  refCount = 0;
  streamState = { live: false, lastEventAt: null };
}
