/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useImodelProgressStream,
  __resetProgressStreamForTests,
} from './useImodelProgressStream.js';
import type { IModelProgressEvent } from '@luban-cad/shared';

/**
 * Minimal WebSocket stand-in: records constructor args and lets tests drive
 * server-side lifecycle (open / message / close) through the handler slots.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  sent: string[] = [];
  closed = false;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  // ---- test-side helpers (simulate the server) ----

  serverOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  serverMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  serverRawMessage(raw: string): void {
    this.onmessage?.({ data: raw });
  }

  serverClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }
}

const PROGRESS_EVENT: IModelProgressEvent = {
  type: 'imodel-progress',
  iModelId: 'im-1',
  step: 'baseline',
  progress: 42,
};

function seedAuth(token = 'jwt-token'): void {
  sessionStorage.setItem(
    'luban_cad_auth',
    JSON.stringify({
      accessToken: token,
      refreshToken: 'refresh-token',
      expiresIn: 900,
      expiresAt: Date.now() + 900 * 1000,
    })
  );
  sessionStorage.setItem(
    'luban_cad_user',
    JSON.stringify({ id: 'u1', email: 'a@b.c', name: 'A', plan: 'free' })
  );
}

describe('useImodelProgressStream', () => {
  // VITE_API_URL is unset in the test environment, so the socket URL is
  // derived from the current origin (same-host/path derivation asserted in
  // shared/api/baseUrl.test.ts); here it only pins scheme + path + token.
  const EXPECTED_WS_BASE =
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

  let onEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    seedAuth();
    onEvent = vi.fn();
    __resetProgressStreamForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects with token, dispatches parsed imodel-progress events and goes live', () => {
    const { result } = renderHook(() => useImodelProgressStream({ onEvent }));

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0];
    expect(socket.url).toBe(`${EXPECTED_WS_BASE}/ws?token=jwt-token`);
    expect(result.current.live).toBe(false);
    expect(result.current.lastEventAt).toBeNull();

    act(() => socket.serverOpen());
    act(() => socket.serverMessage(PROGRESS_EVENT));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(PROGRESS_EVENT);
    expect(result.current.live).toBe(true);
    expect(result.current.lastEventAt).not.toBeNull();
  });

  it('ignores foreign message types and malformed JSON', () => {
    const { result } = renderHook(() => useImodelProgressStream({ onEvent }));
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.serverOpen();
      socket.serverMessage({ type: 'webhook', payload: 'other' });
      socket.serverMessage({ iModelId: 'no-type' });
      socket.serverRawMessage('not json at all');
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(result.current.live).toBe(false);
    expect(result.current.lastEventAt).toBeNull();
  });

  it('reconnects with exponential backoff capped at 30s', () => {
    renderHook(() => useImodelProgressStream({ onEvent }));
    expect(MockWebSocket.instances).toHaveLength(1);

    let socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    // 1s, 2s, 4s, 8s, 16s, then capped at 30s
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      act(() => socket.serverClose());
      act(() => {
        vi.advanceTimersByTime(delay - 1);
      });
      const count = MockWebSocket.instances.length;
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(MockWebSocket.instances.length).toBe(count + 1);
      socket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      expect(socket.url).toBe(`${EXPECTED_WS_BASE}/ws?token=jwt-token`);
    }
  });

  it('flips live to false after 30s without messages, and revives on the next one', () => {
    const { result } = renderHook(() => useImodelProgressStream({ onEvent }));
    const socket = MockWebSocket.instances[0];

    act(() => socket.serverOpen());
    act(() => socket.serverMessage(PROGRESS_EVENT));
    expect(result.current.live).toBe(true);

    act(() => {
      vi.advanceTimersByTime(29999);
    });
    expect(result.current.live).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.live).toBe(false);

    // The next event revives the stream and re-arms the staleness timer.
    act(() => socket.serverMessage(PROGRESS_EVENT));
    expect(result.current.live).toBe(true);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('flips live to false immediately on disconnect and revives after reconnect', () => {
    const { result } = renderHook(() => useImodelProgressStream({ onEvent }));
    const first = MockWebSocket.instances[0];

    act(() => {
      first.serverOpen();
      first.serverMessage(PROGRESS_EVENT);
    });
    expect(result.current.live).toBe(true);

    // Server-initiated close: live drops immediately, no timer advance.
    act(() => first.serverClose());
    expect(result.current.live).toBe(false);

    // Backoff reconnect (1s) + fresh message revives the stream.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.instances[1];
    act(() => {
      second.serverOpen();
      second.serverMessage(PROGRESS_EVENT);
    });
    expect(result.current.live).toBe(true);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('shares a single connection across consumers and closes on the last unmount', () => {
    const first = renderHook(() => useImodelProgressStream());
    const second = renderHook(() => useImodelProgressStream({ onEvent }));

    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0];

    act(() => socket.serverMessage(PROGRESS_EVENT));
    expect(second.result.current.live).toBe(true);

    first.unmount();
    expect(socket.closed).toBe(false);

    second.unmount();
    expect(socket.closed).toBe(true);
  });
});
