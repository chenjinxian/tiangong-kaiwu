// web-initializer 验收（M0 移植 + M4 Task 1 引用计数 + M4 Task 2 in-flight 去重）：
//  - startViewer：socketUrl 组装/token 注入/RPC 通道面/幂等（既有口径，随文件迁入 host/test/）；
//  - acquireViewer/releaseViewer：页面级 host——release 只减引用、不 shutdown、
//    空计数安全 no-op、acquire 失败回滚计数（对齐 DTA）；
//  - in-flight promise 去重（M4 Task 2）：并发 acquire 共享同一 startup promise（恰一次）；
//  - P2.6c2 reload 竞态回归：BentleyCloudRpcManager.initializeClient 必须先于
//    LocalhostIpcApp.startup 执行（IpcApp.isValid 在 startup 首句即翻转）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factory 会被提升到文件顶部，先于 const 初始化执行（TDZ）——
// 被工厂引用的 mock 须用 vi.hoisted 一并提升（vitest 官方推荐写法）。
const { startupMock, initializeClientMock, webRpcMocks } = vi.hoisted(() => {
  const WebAppRpcRequest = class {};
  const protocol = { requestType: WebAppRpcRequest };
  return {
    startupMock: vi.fn().mockResolvedValue(undefined),
    initializeClientMock: vi.fn(),
    webRpcMocks: {
      WebAppRpcRequest,
      protocol,
      getClientForInterface: vi.fn(() => ({ configuration: { protocol } })),
    },
  };
});

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { initialized: false, accuSnap: { enableSnap: vi.fn(), enableLocate: vi.fn() } },
  IpcApp: { isValid: false },
  LocalhostIpcApp: { startup: startupMock, buildUrlForSocket: (u: URL) => u },
  // M6-a T5：SketchAccuSnap 的基类桩（class extends 在模块加载期求值——
  // 缺桩则 web-initializer 的静态 import 链 TypeError）。
  AccuSnap: class {},
}));
vi.mock('@itwin/core-common', () => ({
  BentleyCloudRpcManager: { initializeClient: initializeClientMock },
  IModelReadRpcInterface: class {},
  IModelTileRpcInterface: class {},
  IpcWebSocket: { transport: undefined },
  // M2 自动 429 等待：rate-limit-retry.ts 的基类与安装入口。
  WebAppRpcRequest: webRpcMocks.WebAppRpcRequest,
  RpcManager: { getClientForInterface: webRpcMocks.getClientForInterface },
}));
vi.mock('@luban-cad/shared', () => ({
  LubanRpcInterface: class {},
  LubanFeatureRpcInterface: class {},
}));
vi.mock('@itwin/editor-frontend', () => ({ EditTools: { initialize: vi.fn() } }));
vi.mock('@itwin/imodels-access-frontend', () => ({ FrontendIModelsAccess: class { constructor(public c: unknown) {} } }));
vi.mock('@itwin/imodels-client-management', () => ({ IModelsClient: class { constructor(public o: unknown) {} } }));

import { acquireViewer, releaseViewer, startViewer } from '../web-initializer.js';
import type { NotificationManager } from '@itwin/core-frontend';

const VIEWER_OPTIONS = { backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' };

describe('startViewer（移植自 WebInitializer）', () => {
  beforeEach(async () => {
    startupMock.mockClear();
    initializeClientMock.mockClear();
    webRpcMocks.protocol.requestType = webRpcMocks.WebAppRpcRequest;
    webRpcMocks.getClientForInterface.mockClear();
    const core = await import('@itwin/core-frontend');
    (core.IpcApp as unknown as { isValid: boolean }).isValid = false;
    (core.IModelApp as unknown as { initialized: boolean }).initialized = false;
  });

  it('组装 socketUrl 并注入 token', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400', accessToken: 'jwt-x' });
    expect(startupMock).toHaveBeenCalledTimes(1);
    const arg = startupMock.mock.calls[0][0];
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('localhost:5401');
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('token=jwt-x');
    expect(arg.iModelApp.publicPath).toBe('/');
    expect(arg.iModelApp.authorizationClient).toBeDefined();
    // 2026-11-02 Onshape 渲染对齐：禁止为每个 polyface 面片生成边线
    //（否则 Shaded 会把三角剖分线全部画出来）；保留 tileStorage。
    expect(arg.iModelApp.tileAdmin.generateAllPolyfaceEdges).toBe(false);
    expect(arg.iModelApp.tileAdmin.tileStorage).toBeDefined();
  });

  it('P2.8：getAccessToken 动态提供者——WS 用初值，RPC 每次取新值（过期刷新）', async () => {
    let token = 'jwt-1';
    const provider = vi.fn(async () => token);
    await startViewer({
      backendUrl: 'http://localhost:5401',
      hubUrl: 'http://localhost:5400',
      getAccessToken: provider,
    });
    const arg = startupMock.mock.calls[0][0];
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('token=jwt-1');
    expect(await arg.iModelApp.authorizationClient.getAccessToken()).toBe('jwt-1');
    token = 'jwt-2';
    expect(await arg.iModelApp.authorizationClient.getAccessToken()).toBe('jwt-2');
    expect(provider).toHaveBeenCalledTimes(3);
  });

  it('rpcInterfaces 含 4 通道（Luban/Feature/Read/Tile）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.rpcInterfaces).toHaveLength(4);
  });

  it('M2 429：所有 web RPC protocol 换成 429 感知 request class', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    expect(webRpcMocks.getClientForInterface).toHaveBeenCalledTimes(4);
    expect(webRpcMocks.protocol.requestType).not.toBe(webRpcMocks.WebAppRpcRequest);
  });

  it('P2.6c2 回归：RPC client 先于 host startup 注册（reload 竞态）', async () => {
    // LocalhostIpcApp.startup 首句即置 IpcApp.isValid；若 RPC 注册在其后，
    // 缓存 briefcase 可在 startup 完成前打开连接并触发 getClient() 崩溃
    // （"RPC interface ... is not initialized"，b-model reload 实测）。
    const order: string[] = [];
    initializeClientMock.mockImplementationOnce(() => {
      order.push('initializeClient');
    });
    startupMock.mockImplementationOnce(async () => {
      order.push('startup');
    });
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    expect(order).toEqual(['initializeClient', 'startup']);
  });

  it('M6-a T5：accuSnap 注入 SketchAccuSnap 实例（九模式捕捉子类，startup 官方注入点）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.accuSnap).toBeDefined();
    expect(typeof arg.iModelApp.accuSnap.getActiveSnapModes).toBe('function');
  });

  it('notifications 选项透传 IModelApp.startup（review-8 I-2 呈现桥的官方注入点）', async () => {
    const manager = { outputMessage: vi.fn() } as unknown as NotificationManager;
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400', notifications: manager });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.notifications).toBe(manager);
  });

  it('notifications 缺省 → 不注入（core 缺省 NotificationManager 兜底，行为同旧哑通道）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.notifications).toBeUndefined();
  });

  it('幂等：二次调用不再 startup 但仍重配 RPC', async () => {
    const { IpcApp, IModelApp } = await import('@itwin/core-frontend');
    (IpcApp as unknown as { isValid: boolean }).isValid = true;
    (IModelApp as unknown as { initialized: boolean }).initialized = true;
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    expect(startupMock).toHaveBeenCalledTimes(0);
    expect(initializeClientMock).toHaveBeenCalledTimes(1);
  });

  it('SPA 重入回归：IpcApp.isValid=true 但 IModelApp.initialized=false 必须重新 startup', async () => {
    // 旧实现只按 IpcApp.isValid 跳过 startup；IModelApp.shutdown 后 SPA 再进
    // 编辑器会停在“正在解析 Part Studio…”。两个状态都必须就绪才可幂等跳过。
    const { IpcApp, IModelApp } = await import('@itwin/core-frontend');
    (IpcApp as unknown as { isValid: boolean }).isValid = true;
    (IModelApp as unknown as { initialized: boolean }).initialized = false;
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    expect(startupMock).toHaveBeenCalledTimes(1);
  });
});

describe('acquireViewer/releaseViewer（页面级 host，DTA 对齐）', () => {
  beforeEach(async () => {
    startupMock.mockClear();
    initializeClientMock.mockClear();
    webRpcMocks.protocol.requestType = webRpcMocks.WebAppRpcRequest;
    webRpcMocks.getClientForInterface.mockClear();
    const core = await import('@itwin/core-frontend');
    (core.IpcApp as unknown as { isValid: boolean }).isValid = false;
    (core.IModelApp as unknown as { initialized: boolean }).initialized = true;
  });

  it('release 归零后 host 保活；再次 acquire 不重复 startup', async () => {
    // mock 的 startup 不会自动翻 IpcApp.isValid；手动落入首次 startup 成功后的
    // 页面级 host 状态，再验证 release → acquire 不重复 startup。
    await acquireViewer(VIEWER_OPTIONS);
    const { IpcApp, IModelApp } = await import('@itwin/core-frontend');
    (IpcApp as unknown as { isValid: boolean }).isValid = true;
    (IModelApp as unknown as { initialized: boolean }).initialized = true;
    await releaseViewer();
    await acquireViewer(VIEWER_OPTIONS);
    expect(startupMock).toHaveBeenCalledTimes(1);
    expect(initializeClientMock).toHaveBeenCalledTimes(2);
  });

  it('计数归零后 host 保活；空计数 release 是安全 no-op', async () => {
    await acquireViewer(VIEWER_OPTIONS);
    await releaseViewer();
    await releaseViewer(); // 第二次是不成对 release，只告警
    expect(startupMock).toHaveBeenCalledTimes(1);
  });

  it('acquire 失败回滚计数（失败方不持有 host）', async () => {
    startupMock.mockRejectedValueOnce(new Error('ipc unreachable'));
    await expect(acquireViewer(VIEWER_OPTIONS)).rejects.toThrow('ipc unreachable');
    await releaseViewer();
    expect(startupMock).toHaveBeenCalledTimes(1);
  });

  it('并发 acquire×2 → startup 恰一次（in-flight promise 去重），释放后仍保活', async () => {
    let releaseStartup!: () => void;
    startupMock.mockImplementationOnce(
      async () => new Promise<void>((resolve) => {
        releaseStartup = resolve;
      }),
    );
    const first = acquireViewer(VIEWER_OPTIONS);
    const second = acquireViewer(VIEWER_OPTIONS);
    await vi.waitFor(() => expect(startupMock).toHaveBeenCalledTimes(1), { timeout: 3000 });
    releaseStartup();
    await Promise.all([first, second]);
    await releaseViewer();
    await releaseViewer();
    expect(startupMock).toHaveBeenCalledTimes(1);
  });
});
