/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 移植自 `packages/web-viewer/src/WebInitializer.ts` 的 `initializeWeb()`（2026-10-21）：
 * 导出更名 `startViewer`/`stopViewer`，`hubUrl` 必填并用于 IModelsClient baseUrl；
 * AccuSnap 轮询补启提取至 `../tools/ensure-accusnap.ts`（语义不变）。
 *
 * web-next M4 Task 1（2026-10-22）：stopViewer 收归私有 `shutdownViewer`，新增
 * `acquireViewer`/`releaseViewer` 模块级引用计数——多消费方（多页签/多视口）共享
 * 同一 host 生命周期，计数 1→0 才真正 shutdown（M3 终审 T3-③「卸载无条件 stopViewer」
 * 收口：先卸载方不再杀掉后挂载方的 host）；acquire 复用 startViewer 幂等体。
 *
 * web-next M4 Task 2（2026-10-22）：startViewer 加 in-flight promise 去重——并发
 * acquire 共享同一 startup promise（startup 恰一次）；release 归零的 shutdown 在途
 * 时，新 acquire 等它落定再重新 startup——防「release 归零 shutdown 进行中 + 新
 * acquire」交错拿到假就绪（IpcApp.isValid 未翻转、host 随即 shutdown）。
 * 同步首段语义保持：队列空闲时 startup 的同步前缀（LocalTransport 创建 +
 * IpcApp._ipc 就位）仍在调用方同步帧内完成，后续 IPC 调用可立即入 socket 缓冲。
 */

import { IModelApp, IpcApp, LocalhostIpcApp, type NotificationManager } from '@itwin/core-frontend';
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
  /**
   * 自定义 NotificationManager（review-8 I-2：notifications 呈现桥）——经
   * IModelApp.startup 的官方注入点（IModelAppOptions.notifications）替换 core
   * 缺省的哑通道基类（outputMessage 空实现，工具/连接错误面对用户不可见）。
   * 缺省不注入（哑通道兜底，行为同旧）；仅在真正 startup 的分支生效（幂等重入
   * 分支沿用既有实例——host 生命期内实例不变）。web-next 传 iTwinUI toaster 桥
   * （app 层 ViewerNotifications），本包不引 UI 依赖。
   */
  notifications?: NotificationManager;
}

/** in-flight startup promise：并发 startViewer 共享同一次 startup（恰一次）。 */
let inFlightStartup: Promise<void> | null = null;
/** in-flight shutdown promise：release 归零的 shutdown 进行中，新 startup 须等它落定。 */
let inFlightShutdown: Promise<void> | null = null;

/**
 * Start the iTwin.js viewer for the Web platform.
 *
 * This function initializes:
 * - IModelApp with web-specific configuration
 * - BentleyCloudRpcManager for RPC communication
 *
 * Idempotent: when `IpcApp.isValid` is already true the `LocalhostIpcApp.startup`
 * is skipped, but the RPC client is still (re)configured.
 * 并发语义：在飞行中（in-flight 未落定）的并发方共享同一 startup promise、
 * 不做 RPC 重配；in-flight 落定后的再次调用仍走幂等体、照常幂等重配 RPC。
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
  if (inFlightStartup) {
    return inFlightStartup;
  }
  const run = async (): Promise<void> => {
    // release 归零的 shutdown 在途：等它落定再 startup——否则「shutdown 进行中 +
    // 新 acquire」交错，新方拿到假就绪（IpcApp.isValid 未翻转、host 随即 shutdown）
    if (inFlightShutdown) {
      await inFlightShutdown;
    }
    await doStartViewer(options);
  };
  inFlightStartup = run().finally(() => {
    inFlightStartup = null;
  });
  return inFlightStartup;
}

async function doStartViewer(options: StartViewerOptions): Promise<void> {
  const { backendUrl, hubUrl, accessToken, notifications } = options;

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
          // notifications 注入点（review-8 I-2）：IModelApp.ts:467 的
          // `opts.notifications ?? new NotificationManager()`——缺省 undefined
          // 时 core 兜底哑通道（行为不变）。仅在本 startup 分支生效；幂等重入
          // 分支不重复 startup，沿用既有实例。
          notifications,
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
 * 引用计数（模块级）：当前持有 viewer host 的消费方数量。
 * 1→0 时执行 host shutdown；0 时的 release 是安全 no-op。
 */
let viewerRefCount = 0;

/**
 * Acquire the viewer host（引用计数 +1）并确保运行时已初始化。
 *
 * 内部复用 {@link startViewer} 幂等体：host 已就绪时只重配 RPC，不重复 startup。
 * acquire 失败时回滚计数（失败方不持有 host），异常原样上抛。
 */
export async function acquireViewer(options: StartViewerOptions): Promise<void> {
  viewerRefCount++;
  try {
    await startViewer(options);
  } catch (err) {
    viewerRefCount--;
    throw err;
  }
}

/**
 * Release the viewer host（引用计数 -1）。
 *
 * 计数 1→0 才执行 host shutdown（IModelApp.shutdown）；仍有其它消费方时仅减计数。
 * 计数已为 0 时安全 no-op（防重放卸载）。
 */
export async function releaseViewer(): Promise<void> {
  if (viewerRefCount === 0) {
    // eslint-disable-next-line no-console
    console.warn('[WebInitializer] releaseViewer called without a matching acquireViewer — ignored');
    return;
  }
  viewerRefCount--;
  if (viewerRefCount > 0) return;
  await shutdownViewer();
}

/**
 * Shut down the iTwin.js viewer（原 stopViewer，私有——只经 releaseViewer 计数归零触发）。
 * 并发 release（StrictMode 连卸）共享同一次 shutdown；在途标记供 startViewer 等待。
 */
async function shutdownViewer(): Promise<void> {
  if (inFlightShutdown) {
    await inFlightShutdown;
    return;
  }
  const run = (async (): Promise<void> => {
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
  })();
  inFlightShutdown = run;
  try {
    await run;
  } finally {
    inFlightShutdown = null;
  }
}
