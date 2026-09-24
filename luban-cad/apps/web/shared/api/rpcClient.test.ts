/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOpenCloudRpcClient,
  initializeAll,
  initializeIModelApp,
  initializeRpcClient,
  setupWebSocket,
} from './rpcClient.js';

describe('RPC Client', () => {
  let mockWebSocket: {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onopen: (() => void) | null;
    onmessage: ((event: { data: string }) => void) | null;
    onerror: ((error: unknown) => void) | null;
    onclose: (() => void) | null;
    readyState: number;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      readyState: WebSocket.CONNECTING,
    };

    global.WebSocket = vi.fn().mockImplementation(() => mockWebSocket) as unknown as typeof WebSocket;

    // Silence console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('setupWebSocket', () => {
    it('should create WebSocket with default URL', () => {
      setupWebSocket();

      expect(global.WebSocket).toHaveBeenCalledWith(
        expect.stringContaining('ws://')
      );
    });

    it('should create WebSocket with custom URL', () => {
      const customUrl = 'ws://custom-server.com/ws';
      setupWebSocket(customUrl);

      expect(global.WebSocket).toHaveBeenCalledWith(customUrl);
    });

    it('should subscribe to channels on open', () => {
      setupWebSocket();

      // Simulate WebSocket open
      mockWebSocket.onopen?.();

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribe',
          channels: ['webhook', 'system'],
        })
      );
    });

    it('should handle incoming messages', () => {
      const onEvent = vi.fn();
      setupWebSocket('ws://test/ws', onEvent);

      // Simulate incoming message
      mockWebSocket.onmessage?.({ data: JSON.stringify({ type: 'test', data: 'value' }) });

      expect(onEvent).toHaveBeenCalledWith({ type: 'test', data: 'value' });
    });

    it('should handle messages without callback', () => {
      setupWebSocket('ws://test/ws');

      // Should not throw
      mockWebSocket.onmessage?.({ data: JSON.stringify({ type: 'test' }) });
    });

    it('should handle JSON parse errors', () => {
      setupWebSocket('ws://test/ws');

      // Should not throw
      mockWebSocket.onmessage?.({ data: 'invalid json' });

      expect(console.error).toHaveBeenCalledWith(
        '❌ Error parsing WebSocket message:',
        expect.any(Error)
      );
    });

    it('should handle WebSocket errors', () => {
      setupWebSocket('ws://test/ws');

      const error = new Error('Connection failed');
      mockWebSocket.onerror?.(error);

      expect(console.error).toHaveBeenCalledWith('❌ WebSocket error:', error);
    });

    it('should reconnect on close', () => {
      setupWebSocket('ws://test/ws');

      mockWebSocket.onclose?.();

      expect(console.log).toHaveBeenCalledWith('🔌 WebSocket disconnected');

      // Fast-forward timers
      vi.advanceTimersByTime(5000);

      expect(console.log).toHaveBeenCalledWith('🔄 Attempting to reconnect...');
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
    });

    it('should return WebSocket instance', () => {
      const ws = setupWebSocket('ws://test/ws');

      expect(ws).toBe(mockWebSocket);
    });
  });

  describe('initializeRpcClient', () => {
    it('should log that RPC is disabled', () => {
      initializeRpcClient('http://localhost:4001');

      expect(console.log).toHaveBeenCalledWith('RPC client disabled - using REST API');
    });

    it('should work without parameters', () => {
      initializeRpcClient();

      expect(console.log).toHaveBeenCalledWith('RPC client disabled - using REST API');
    });
  });

  describe('initializeIModelApp', () => {
    it('should log that IModelApp is disabled', async () => {
      await initializeIModelApp('http://localhost:4001');

      expect(console.log).toHaveBeenCalledWith('IModelApp initialization disabled - using REST API');
    });

    it('should work without parameters', async () => {
      await initializeIModelApp();

      expect(console.log).toHaveBeenCalledWith('IModelApp initialization disabled - using REST API');
    });
  });

  describe('getOpenCloudRpcClient', () => {
    it('should return null', () => {
      const result = getOpenCloudRpcClient();

      expect(result).toBeNull();
    });
  });

  describe('initializeAll', () => {
    it('should initialize with WebSocket', async () => {
      const result = await initializeAll({
        wsUrl: 'ws://test/ws',
        onWebSocketEvent: vi.fn(),
      });

      expect(result.ws).toBe(mockWebSocket);
      expect(result.rpc).toBeNull();
    });

    it('should work without WebSocket', async () => {
      const result = await initializeAll();

      expect(result.ws).toBeNull();
      expect(result.rpc).toBeNull();
    });

    it('should pass options to WebSocket', async () => {
      const onEvent = vi.fn();
      await initializeAll({
        wsUrl: 'ws://custom/ws',
        onWebSocketEvent: onEvent,
      });

      expect(global.WebSocket).toHaveBeenCalledWith('ws://custom/ws');
    });

    it('should ignore other options', async () => {
      const result = await initializeAll({
        backendUrl: 'http://backend',
        urlPrefix: 'prefix',
      });

      expect(result.ws).toBeNull();
    });
  });
});
