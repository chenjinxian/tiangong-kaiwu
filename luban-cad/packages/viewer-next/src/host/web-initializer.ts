/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 移植自 `packages/web-viewer/src/WebInitializer.ts` 的 `initializeWeb()`（2026-10-21）：
 * 导出更名 `startViewer`/`stopViewer`，`hubUrl` 必填并用于 IModelsClient baseUrl；
 * AccuSnap 轮询补启提取至 `../tools/ensure-accusnap.ts`（语义不变）。
 */

import { IModelApp, IpcApp, LocalhostIpcApp } from '@itwin/core-frontend';
import { FrontendIModelsAccess } from '@itwin/imodels-access-frontend';
import { BentleyCloudRpcManager, IModelReadRpcInterface, IModelTileRpcInterface } from '@itwin/core-common';
import { IModelsClient } from '@itwin/imodels-client-management';
import { LubanFeatureRpcInterface, OpenCloudRpcInterface } from '@luban-cad/shared';
import { ensureAccuSnap } from '../tools/ensure-accusnap.js';

export interface StartViewerOptions {
  /** Backend RPC URL（modeling-server） */
  backendUrl: string;
  /** iModelHub URL（imodelhub-services） */
  hubUrl: string;
  /** Access token for WebSocket authentication */
  accessToken?: string;
}

/**
 * Start the iTwin.js viewer for the Web platform.
 *
 * This function initializes:
 * - IModelApp with web-specific configuration
 * - BentleyCloudRpcManager for RPC communication
 *
 * Idempotent: when `IpcApp.isValid` is already true the `LocalhostIpcApp.startup`
 * is skipped, but the RPC client is still (re)configured.
 *
 * @example
 * ```ts
 * await startViewer({
 *   backendUrl: 'http://localhost:5401',
 *   hubUrl: 'http://localhost:5400',
 *   accessToken: 'jwt-...'
 * });
 * ```
 */
export async function startViewer(options: StartViewerOptions): Promise<void> {
  const { backendUrl, hubUrl, accessToken } = options;

  const rpcInterfaces = [OpenCloudRpcInterface, LubanFeatureRpcInterface, IModelReadRpcInterface, IModelTileRpcInterface];

  if (!IpcApp.isValid) {
    // eslint-disable-next-line no-console
    console.log('[WebInitializer] Initializing LubanCAD Web Viewer...');
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] iModelHub URL: ${hubUrl}`);

    const socketUrl = LocalhostIpcApp.buildUrlForSocket(new URL(backendUrl));
    // Append access token for WebSocket authentication
    if (accessToken) {
      socketUrl.searchParams.set('token', accessToken);
    }
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] IPC WebSocket URL: ${socketUrl.toString()}`);

    // Create iModel client for hub access
    const iModelClient = new IModelsClient({
      api: { baseUrl: `${hubUrl}/imodels` },
    });

    try {
      // Initialize with LocalhostIpcApp (subclass of IModelApp).
      // This enables IpcApp.isValid = true, which is required for BriefcaseConnection.
      // The existing CheckpointConnection (read-only) path is unaffected.
      await LocalhostIpcApp.startup({
        localhostIpcApp: {
          // Connects to backend's /ipc WebSocket (ws://backendUrl/ipc)
          socketUrl,
        },
        iModelApp: {
          rpcInterfaces,
          // tile 范围 flags（2026-10-10 重开显示断点定案）：useProjectExtents/expandProjectExtents
          // 开启时 native 对空 extents 库算出畸形膨胀的 root range（2×2×3 方块 → ±840），且 tile
          // 头 contentRange 落在 range.low 角 → 前端 tile 选择按声明范围恒剔除 → 几何永不渲染
          // （服务端 bisect：两 flag 关闭后 range 恰为内容包络、Imdl 头坐标中心化正确——
          // TileProbe/TreePropsProbe 实测）。TileAdmin 官方配置出口，非 fork 改动；native 侧
          // 根因（expandProjectExtents 的 range 簿记）另行立案。
          // tile 范围 flags 注记（2026-10-10 定案）：曾疑 useProjectExtents/expandProjectExtents
          // 导致「畸形膨胀 range + contentRange 落 range.low 角」而关闭两 flag——后证实 -840 的
          // contentRange 是 Imdl v9 中心化坐标系的合法值（props.location 负责去中心化），flags
          // 全开（0x1d）下选择/绘制/渲染全链正常；重开空屏的唯一根因是初始相机取景空 extents
          // （useViewport 内容感知取景已修）。故保持上游默认 flags，不加覆盖。
          // Type cast: @itwin/imodels-access-frontend (npm 6.x) implements its own
          // bundled FrontendHubAccess identity, structurally identical to
          // core-frontend's (link: 5.14.0-dev) — cross-copy assignment fails tsc only.
          hubAccess: new FrontendIModelsAccess(iModelClient) as never,
          // 静态资源（imdl worker 等）就在 web 容器静态根——`/workspace/default/` 前缀
          // 会让 iTwin.js 拼出 `<origin>/workspace/default/scripts/parse-imdl-worker.js`，
          // 落到 SPA 回退返回 index.html（worker 解码器 404），几何渲染不出（2026-10-09 实证）。
          publicPath: '/',
          // tile/原生 RPC 通道（IModelTileRpcInterface 等 checkToken=true 的接口）要求前端提供
          // authorizationClient 取 access token 放请求头；缺失则 tile 请求根本发不出（2026-10-09 实证：
          // MS 日志零 tile 请求痕迹，几何渲染不出）。此处把 WS 用的同一 token 接上。
          ...(accessToken
            ? {
                authorizationClient: {
                  getAccessToken: async () => accessToken,
                },
              }
            : {}),
        },
      });

      // eslint-disable-next-line no-console
      console.log(`[WebInitializer] IpcApp.isValid after startup: ${IpcApp.isValid}`);
      // eslint-disable-next-line no-console
      console.log(`[WebInitializer] IModelApp.initialized: ${IModelApp.initialized}`);
      // eslint-disable-next-line no-console
      console.log(`[WebInitializer] IModelApp.toolAdmin: ${IModelApp.toolAdmin ? 'Available' : 'NOT AVAILABLE'}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[WebInitializer] Error during LocalhostIpcApp.startup:', err);
      throw err;
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[WebInitializer] IModelApp already initialized, reconfiguring RPC client...');
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] IModelApp.initialized: ${IModelApp.initialized}`);
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] IModelApp.toolAdmin: ${IModelApp.toolAdmin ? 'Available' : 'NOT AVAILABLE'}`);
  }

  // Note: EditTools.initialize() is called from the editor shell after IModelApp is fully initialized
  // This avoids race conditions during startup

  // Enable AccuSnap for geometry-aware cursor snapping（轮询补启，语义同原 WebInitializer 内联实现）。
  // 不阻塞启动序列：未就绪时由 ensureAccuSnap 在后台轮询补启。
  void ensureAccuSnap().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[WebInitializer] AccuSnap polling error:', err);
  });

  // Always configure RPC client (idempotent - safe to call multiple times)
  BentleyCloudRpcManager.initializeClient(
    { info: { title: 'LubanCAD', version: 'v1.0' }, uriPrefix: backendUrl },
    rpcInterfaces,
  );

  // eslint-disable-next-line no-console
  console.log('Web viewer initialized successfully');
}

/**
 * Stop the iTwin.js viewer.
 */
export async function stopViewer(): Promise<void> {
  if (IModelApp.initialized) {
    try {
      await IModelApp.shutdown();
      // eslint-disable-next-line no-console
      console.log('Web viewer shut down');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('IModelApp shutdown error (likely React StrictMode double-invoke):', err);
    }
  }
}
