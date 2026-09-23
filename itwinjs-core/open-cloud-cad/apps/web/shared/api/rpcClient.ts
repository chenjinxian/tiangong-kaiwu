/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 */

// RPC client is temporarily disabled - using REST API instead
// import { RpcConfiguration, RpcInterfaceDefinition } from '@itwin/core-common';
// import { BentleyCloudRpcManager, IModelReadRpcInterface, IModelTileRpcInterface } from '@itwin/core-common';
// import { IModelApp } from '@itwin/core-frontend';

// /**
//  * Initialize RPC client for browser mode
//  * @param backendUrl Backend server URL (e.g., 'http://localhost:3001')
//  */
// export function initializeRpcClient(backendUrl: string = 'http://localhost:4001'): void {
//   // Configure RPC for cloud/brower mode
//   const rpcParams = {
//     info: { title: 'Open Cloud CAD', version: 'v1.0' },
//     uriPrefix: backendUrl,
//   };

//   BentleyCloudRpcManager.initializeClient(rpcParams, rpcInterfaces);
//   console.log('✅ RPC Client initialized:', backendUrl);
// }

/**
 * Setup WebSocket connection for real-time events
 * @param wsUrl WebSocket server URL
 * @param onEvent Callback for incoming events
 * @param token Optional Bearer token for authentication
 * @returns WebSocket instance
 */
export function setupWebSocket(
  wsUrl: string = `ws://${import.meta.env.VITE_RPC_URL?.replace('http://', '') || 'localhost:4001'}/ws`,
  onEvent?: (event: unknown) => void,
  token?: string
): WebSocket {
  // Append token as query parameter for WebSocket auth
  const authenticatedUrl = token
    ? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    : wsUrl;
  const ws = new WebSocket(authenticatedUrl);

  ws.onopen = () => {
    // Subscribe to channels
    ws.send(JSON.stringify({
      type: 'subscribe',
      channels: ['webhook', 'system'],
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (onEvent) {
        onEvent(data);
      }
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('🔌 WebSocket disconnected');
    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect...');
      setupWebSocket(wsUrl, onEvent, token);
    }, 5000);
  };

  return ws;
}

// Placeholder exports for compatibility
export const initializeRpcClient = (_backendUrl?: string): void => {
  console.log('RPC client disabled - using REST API');
};

export const initializeIModelApp = async (_urlPrefix?: string): Promise<void> => {
  console.log('IModelApp initialization disabled - using REST API');
};

export const getOpenCloudRpcClient = (): unknown => {
  return null;
};

export const initializeAll = async (options: {
  backendUrl?: string;
  wsUrl?: string;
  urlPrefix?: string;
  onWebSocketEvent?: (event: unknown) => void;
  token?: string;
} = {}): Promise<{ rpc: unknown; ws: WebSocket | null }> => {
  const { wsUrl, onWebSocketEvent, token } = options;

  // Only setup WebSocket
  const ws = wsUrl ? setupWebSocket(wsUrl, onWebSocketEvent, token) : null;

  return { rpc: null, ws };
};
