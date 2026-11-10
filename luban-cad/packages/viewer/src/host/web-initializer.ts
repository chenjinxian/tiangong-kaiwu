/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 移植自旧查看器包的 `WebInitializer.ts` 之 `initializeWeb()`（2026-10-21；旧包已删除）：
 * 导出更名 `startViewer`/`stopViewer`，`hubUrl` 必填并用于 IModelsClient baseUrl；
 * AccuSnap 轮询补启提取至 `../tools/ensure-accusnap.ts`（语义不变）。
 *
 * M4 Task 1（2026-10-22，2026-11-10 修订）：`acquireViewer`/`releaseViewer`
 * 只做消费方引用计数，**不拥有 host 生命周期**。对齐 iTwin.js
 * display-test-app：LocalhostIpcApp/IpcApp/IModelApp 由页面持有，首次进入
 * 编辑器 startup 一次，路由/Viewport 卸载只关闭 BriefcaseConnection，绝不在
 * release 归零时 shutdown（否则 SPA 重入会复用/重建死 WebSocket，卡在
 * “正在解析 Part Studio…”）。显式停止查看器需要整页刷新。
 *
 * M4 Task 2（2026-10-22）：startViewer 加 in-flight promise 去重——并发
 * acquire 共享同一 startup promise（startup 恰一次）。
 * 同步首段语义保持：队列空闲时 startup 的同步前缀（LocalTransport 创建 +
 * IpcApp._ipc 就位）仍在调用方同步帧内完成，后续 IPC 调用可立即入 socket 缓冲。
 */

import { IModelApp, IpcApp, LocalhostIpcApp, type NotificationManager } from '@itwin/core-frontend';
import { ITwinLocalization } from '@itwin/core-i18n';
import { FrontendIModelsAccess } from '@itwin/imodels-access-frontend';
import { BentleyCloudRpcManager, IModelReadRpcInterface, IModelTileRpcInterface } from '@itwin/core-common';
import { IModelsClient } from '@itwin/imodels-client-management';
import { LubanFeatureRpcInterface, LubanRpcInterface } from '@luban-cad/shared';
import { ensureAccuSnap } from '../tools/ensure-accusnap.js';
import { MissAwareFetchCloudStorage } from '../tile/miss-aware-storage.js';
import { installE2EHooks } from './e2e-hooks.js';
import { installRateLimitAwareRequests } from './rate-limit-retry.js';

export interface StartViewerOptions {
  /** Backend RPC URL（modeling-server） */
  backendUrl: string;
  /** iModelHub URL（imodelhub-services） */
  hubUrl: string;
  /** Access token for WebSocket authentication（静态值；由 getAccessToken 接管时忽略） */
  accessToken?: string;
  /**
   * 动态 access token 提供者（裸 JWT，不含 "Bearer "）——启动时取一次用于 WS
   * 握手；之后 RPC/tile 每次经 IModelApp.authorizationClient 重新取值，支持
   * AuthSession 单飞刷新（P2.8：替代 15 分钟即过期的静态 token）。消费方须传
   * 稳定身份（useCallback），避免 useViewport 重 acquire。
   */
  getAccessToken?: () => Promise<string>;
  /**
   * 自定义 NotificationManager（review-8 I-2：notifications 呈现桥）——经
   * IModelApp.startup 的官方注入点（IModelAppOptions.notifications）替换 core
   * 缺省的哑通道基类（outputMessage 空实现，工具/连接错误面对用户不可见）。
   * 缺省不注入（哑通道兜底，行为同旧）；仅在真正 startup 的分支生效（幂等重入
   * 分支沿用既有实例——host 生命期内实例不变）。apps/web 传 iTwinUI toaster 桥
   * （app 层 ViewerNotifications），本包不引 UI 依赖。
   */
  notifications?: NotificationManager;
}

/** in-flight startup promise：并发 startViewer 共享同一次 startup（恰一次）。 */
let inFlightStartup: Promise<void> | null = null;

/**
 * Start the iTwin.js viewer for the Web platform.
 *
 * This function initializes:
 * - IModelApp with web-specific configuration
 * - BentleyCloudRpcManager for RPC communication
 *
 * **页面级生命周期（对齐 itwinjs-core display-test-app）**：LocalhostIpcApp/
 * IpcApp/IModelApp 只在页面首次需要查看器时 startup 一次，之后由页面持有，
 * 不随 React 路由/Viewport 卸载而 shutdown。离开编辑器只关闭
 * `BriefcaseConnection`/iModel；再次进入复用同一条 /ipc WebSocket。
 * 页面刷新/关闭由浏览器销毁 WebSocket，后端 `LocalhostIpcHost` 在 connection
 * close 时清理；显式停止查看器需要整页刷新（DTA 同口径）。
 *
 * Idempotent: when both `IpcApp.isValid` and `IModelApp.initialized` are true,
 * `LocalhostIpcApp.startup` is skipped, but the RPC client/token is still
 * (re)configured.
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
  inFlightStartup = doStartViewer(options).finally(() => {
    inFlightStartup = null;
  });
  return inFlightStartup;
}

async function doStartViewer(options: StartViewerOptions): Promise<void> {
  // P2.8：E2E 观测面（仅 VITE_E2E_HOOKS=true 生效；生产镜像缺省关闭）。
  installE2EHooks();
  const { backendUrl, hubUrl, accessToken, getAccessToken, notifications } = options;

  const rpcInterfaces = [LubanRpcInterface, LubanFeatureRpcInterface, IModelReadRpcInterface, IModelTileRpcInterface];

  // P2.6c2 发布级修复（重载崩溃实证）：RPC client 必须在 host startup **之前**注册。
  // `LocalhostIpcApp.startup` 的第一句就把 `IpcApp.isValid` 置真（_ipc 赋值），而
  // IModelApp.startup 完成要 ~1s；useBriefcaseConnection 只看 isValid，缓存的
  // briefcase 可在该窗口内打开连接，随后 useEditorSession 的 effect 调
  // `LubanFeatureRpcInterface.getClient()` —— 旧代码在 startup 尾部才
  // `initializeClient`，于是抛 "RPC interface ... is not initialized" 并被 React
  // 路由 ErrorBoundary 整页接管（B 文档每次 reload 的时序彩票；e2e 表现为
  // 状态栏消失后 helper 挂起）。initializeClient 幂等且不依赖 IModelApp 实例
  // （标准 iTwin.js 用法即先 initializeClient 再 startup），提前到此处关闭竞态。
  BentleyCloudRpcManager.initializeClient(
    { info: { title: 'LubanCAD', version: 'v1.0' }, uriPrefix: backendUrl },
    rpcInterfaces,
  );
  // M2 自动 429 等待（2026-11-01）：在 initializeClient 之后、任何 RPC 请求之前
  // 换上 429 感知 request class；识别后端 JSON retryAfter 并做有界等待。
  // 详见 host/rate-limit-retry.ts 头注。
  installRateLimitAwareRequests(rpcInterfaces);

  // 两个状态都必须就绪才算“已在运行”：IModelApp.shutdown 会把 initialized 置假，
  // 但 IpcApp.isValid 只有在 IpcApp.shutdown 后才清；只看 isValid 会在 SPA
  // 路由重入时跳过 startup，留下 IModelApp.initialized=false（2026-11-10 实测）。
  if (!IpcApp.isValid || !IModelApp.initialized) {
    // eslint-disable-next-line no-console
    console.log('[WebInitializer] Initializing LubanCAD Web Viewer...');
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] iModelHub URL: ${hubUrl}`);

    const socketUrl = LocalhostIpcApp.buildUrlForSocket(new URL(backendUrl));
    // WS 握手 token：动态提供者优先（这里取一次初值；之后的 RPC/tile 请求由
    // authorizationClient 每次重取，token 过期可经 AuthSession 单飞刷新）。
    const socketToken = getAccessToken ? await getAccessToken() : accessToken;
    if (socketToken) {
      socketUrl.searchParams.set('token', socketToken);
    }
    // eslint-disable-next-line no-console
    console.log(`[WebInitializer] IPC WebSocket URL: ${socketUrl.toString()}`);

    // Create iModel client for hub access
    const iModelClient = new IModelsClient({
      api: { baseUrl: `${hubUrl}/imodels` },
    });

    try {
      // M6-a T5：SketchAccuSnap 懒引（ensureEditTools 同款口径——class extends
      // AccuSnap 静态引出会把基类存在性强加给消费方的 core-frontend mock 面；
      // 仅首次 startup 分支用到，懒引零运行时语义差异）。
      const { SketchAccuSnap: sketchAccuSnapClass } = await import('../tools/sketch-accu-snap.js');
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
          // 2026-11-05 官方 ViewCube 评估：iTwin 包 locale（UiIModelComponents/
          // UiComponents）用绝对 URL。默认 ITwinLocalization 的 loadPath 是相对
          // 路径，BrowserRouter 的 /documents/:iTwinId/:iModelId 会把
          // `locales/en/*.json` 解析到页面子路径（404 + SPA 回退 HTML）。此处只
          // 改 URL 模板，语言检测/回退语义沿用 ITwinLocalization 默认。
          localization: new ITwinLocalization({
            urlTemplate: '/locales/{{lng}}/{{ns}}.json',
          }),
          // P2.8：tile cache miss 由部署代理改写为 204，前端存储把 204/404 当 miss
          // 抛错交给 TileStorage 的原生回退——避免浏览器对真实 404 打 console 噪声。
          // 2026-11-02 渲染对齐：generateAllPolyfaceEdges 缺省 true 会为每个 polyface
          // 面片发边线，Shaded 下整模型泛三角网格线；关闭后由拓扑/折角推断真实
          // BRep 特征边（边线显示仍由 render-profile 的 visEdges 控制）。
          tileAdmin: {
            tileStorage: new MissAwareFetchCloudStorage(),
            generateAllPolyfaceEdges: false,
          },
          // M6-a T5：AccuSnap 换 SketchAccuSnap 子类（九模式优先级表——草图
          // 绘制链的端点/中点/圆心/交点捕捉面；应用级单例，全局捕捉面同步变宽，
          // 边界见 tools/sketch-accu-snap.ts 头注）。仅首次 startup 分支生效
          //（幂等重入沿用既有实例，与 notifications 注记同口径）。
          accuSnap: new sketchAccuSnapClass(),
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
          hubAccess: new FrontendIModelsAccess(iModelClient),
          // 静态资源（imdl worker 等）就在 web 容器静态根——`/workspace/default/` 前缀
          // 会让 iTwin.js 拼出 `<origin>/workspace/default/scripts/parse-imdl-worker.js`，
          // 落到 SPA 回退返回 index.html（worker 解码器 404），几何渲染不出（2026-10-09 实证）。
          publicPath: '/',
          // tile/原生 RPC 通道（IModelTileRpcInterface 等 checkToken=true 的接口）要求前端提供
          // authorizationClient 取 access token 放请求头；缺失则 tile 请求根本发不出（2026-10-09 实证：
          // MS 日志零 tile 请求痕迹，几何渲染不出）。此处把 WS 用的同一 token 接上。
          ...(getAccessToken
            ? {
                authorizationClient: {
                  getAccessToken: async () => getAccessToken(),
                },
              }
            : accessToken
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

  // 幂等重入分支不重跑 startup；动态 token 提供者仍须接管 RPC/tile 授权
  // （静态 accessToken 在 15 分钟窗口后无法刷新，RPC 会以过期 token 恒失败）。
  if (getAccessToken) {
    IModelApp.authorizationClient = { getAccessToken: async () => getAccessToken() };
  }

  // Note: EditTools.initialize() is called from the editor shell after IModelApp is fully initialized
  // This avoids race conditions during startup

  // Enable AccuSnap for geometry-aware cursor snapping（轮询补启，语义同原 WebInitializer 内联实现）。
  // 不阻塞启动序列：未就绪时由 ensureAccuSnap 在后台轮询补启。
  void ensureAccuSnap().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn('[WebInitializer] AccuSnap polling error:', err);
  });

  // RPC client 在 startup 前已注册（见函数头部竞态注记）；此处不再重复调用。

  // eslint-disable-next-line no-console
  console.log('Web viewer initialized successfully');
}

/**
 * 引用计数（模块级）：当前持有 viewer host 的消费方数量。
 *
 * **不拥有 host 生命周期**：计数归零后 host 仍由页面持有（DTA 同口径）。
 * 离开编辑器时消费方只关闭自己的 BriefcaseConnection；页面刷新/关闭由浏览器
 * 销毁 WebSocket，由后端 connection close 清理。
 */
let viewerRefCount = 0;

/**
 * Acquire the viewer host（引用计数 +1）并确保运行时已初始化。
 *
 * 内部复用 {@link startViewer} 幂等体：host 已就绪时只重配 RPC/token，不重复
 * startup。acquire 失败时回滚计数（失败方不持有 host），异常原样上抛。
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
 * **只减引用，不 shutdown**：路由/Viewport 卸载不是页面的结束。IModelApp/
 * IpcApp/WebSocket 由页面生命周期持有；下次进入编辑器直接复用。计数归零时
 * 的唯一动作是记录引用归零，不能调用 IpcApp.shutdown（否则会重演
 * “WebSocket CLOSING/CLOSED → 正在解析 Part Studio…” 的 SPA 重入故障）。
 * 计数已为 0 时安全 no-op（防重放卸载）。
 */
export async function releaseViewer(): Promise<void> {
  if (viewerRefCount === 0) {
    // eslint-disable-next-line no-console
    console.warn('[WebInitializer] releaseViewer called without a matching acquireViewer — ignored');
    return;
  }
  viewerRefCount--;
  if (viewerRefCount === 0) {
    // eslint-disable-next-line no-console
    console.log('[WebInitializer] viewer consumers released; host kept alive for page lifetime');
  }
}
