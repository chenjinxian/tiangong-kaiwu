import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factory 会被提升到文件顶部，先于 const 初始化执行（TDZ）——
// 被工厂引用的 mock 须用 vi.hoisted 一并提升（vitest 官方推荐写法）。
const { startupMock, initializeClientMock } = vi.hoisted(() => ({
  startupMock: vi.fn().mockResolvedValue(undefined),
  initializeClientMock: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { initialized: false, accuSnap: { enableSnap: vi.fn(), enableLocate: vi.fn() } },
  IpcApp: { isValid: false },
  LocalhostIpcApp: { startup: startupMock, buildUrlForSocket: (u: URL) => u },
}));
vi.mock('@itwin/core-common', () => ({
  BentleyCloudRpcManager: { initializeClient: initializeClientMock },
  IModelReadRpcInterface: class {},
  IModelTileRpcInterface: class {},
}));
vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: class {},
  LubanFeatureRpcInterface: class {},
}));
vi.mock('@itwin/editor-frontend', () => ({ EditTools: { initialize: vi.fn() } }));
vi.mock('@itwin/imodels-access-frontend', () => ({ FrontendIModelsAccess: class { constructor(public c: unknown) {} } }));
vi.mock('@itwin/imodels-client-management', () => ({ IModelsClient: class { constructor(public o: unknown) {} } }));

import { startViewer } from '../host/web-initializer.js';

describe('startViewer（移植自 WebInitializer）', () => {
  beforeEach(() => { startupMock.mockClear(); initializeClientMock.mockClear(); });

  it('组装 socketUrl 并注入 token', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400', accessToken: 'jwt-x' });
    expect(startupMock).toHaveBeenCalledTimes(1);
    const arg = startupMock.mock.calls[0][0];
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('localhost:5401');
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('token=jwt-x');
    expect(arg.iModelApp.publicPath).toBe('/');
    expect(arg.iModelApp.authorizationClient).toBeDefined();
  });

  it('rpcInterfaces 含 4 通道（OpenCloud/Feature/Read/Tile）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.rpcInterfaces).toHaveLength(4);
  });

  it('幂等：二次调用不再 startup 但仍重配 RPC', async () => {
    const { IpcApp } = await import('@itwin/core-frontend');
    (IpcApp as unknown as { isValid: boolean }).isValid = true;
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    expect(startupMock).toHaveBeenCalledTimes(0);
    expect(initializeClientMock).toHaveBeenCalledTimes(1);
  });
});
