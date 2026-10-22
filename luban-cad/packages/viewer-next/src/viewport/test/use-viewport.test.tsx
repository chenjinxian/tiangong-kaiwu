// @vitest-environment jsdom
//
// useViewport（web-next M3 Task 3 接线 + M4 Task 2 扩 ScreenViewport 创建主链）：
//  A) host 接线（M4 Task 1 既有口径）——挂载 → acquireViewer 以入参选项启动；
//     卸载 → releaseViewer；acquireViewer 拒绝 → error 相位；
//  B) 视口创建主链（M4 Task 2，移植自旧 viewer-core useViewport.ts 全链）——
//     iModel 就位 → getDefaultViewState（queryProps→load，Default 命名视图优先）→
//     类目/模型补全 → ScreenViewport.create → addViewport → setupViewCategoriesAndModels
//     （BRep 不渲染两断点：ModelState 显式 load + drop/add 触发 refs 重建）→
//     queryModelRanges 内容感知取景；卸载 drop+dispose；cancelled 不 setState。
//
// mock 口径：@itwin/core-frontend 模块级 mock（IModelApp.viewManager / ScreenViewport /
// ViewCreator3d / SpatialViewState 全 mock，零真实渲染、零 core-frontend 加载）；
// host/web-initializer 模块级 mock（零 host 启动）；@itwin/core-geometry 取真实模块
// （内容感知取景的联合范围断言用真实 Range3d 语义）。

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IModelConnection, ScreenViewport } from '@itwin/core-frontend';
import { Range3d } from '@itwin/core-geometry';

const m = vi.hoisted(() => {
  // instanceof 锚：实现里 `view instanceof SpatialViewState` 分支用
  class SpatialViewStateMock {
    /* 纯类型标记 */
  }
  return {
    SpatialViewStateMock,
    acquireViewerMock: vi.fn().mockResolvedValue(undefined),
    releaseViewerMock: vi.fn().mockResolvedValue(undefined),
    createViewportMock: vi.fn(),
    addViewportMock: vi.fn(),
    dropViewportMock: vi.fn(),
    disposeMock: vi.fn(),
    queryPropsMock: vi.fn(),
    loadViewMock: vi.fn(),
    createDefaultViewMock: vi.fn(),
    queryReaderMock: vi.fn(),
    getLoadedMock: vi.fn(),
    loadModelsMock: vi.fn().mockResolvedValue(undefined),
    queryModelRangesMock: vi.fn(),
    addCategoriesMock: vi.fn(),
    addModelsMock: vi.fn(),
    dropModelsMock: vi.fn(),
    synchWithViewMock: vi.fn(),
    lookAtVolumeMock: vi.fn(),
  };
});

vi.mock('../../host/web-initializer.js', () => ({
  acquireViewer: m.acquireViewerMock,
  releaseViewer: m.releaseViewerMock,
}));

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { viewManager: { addViewport: m.addViewportMock, dropViewport: m.dropViewportMock } },
  ScreenViewport: { create: m.createViewportMock },
  ViewCreator3d: class {
    public createDefaultView = m.createDefaultViewMock;
  },
  SpatialViewState: m.SpatialViewStateMock,
}));

import { useViewport } from '../use-viewport.js';

const CATEGORY_IDS = ['cat-1', 'cat-2'];
const MODEL_IDS = ['model-1'];
const VIEW_SPECS = [{ id: 'view-default', code: { value: 'Default' } }, { id: 'view-other', code: { value: 'Top' } }];

/** 构造假 ViewState：SpatialViewState 实例（过 instanceof）+ 类目/模型 selector 记账。 */
function makeFakeView(): unknown {
  const view = new m.SpatialViewStateMock();
  const categories = new Set<string>();
  const models = new Set<string>();
  (view as Record<string, unknown>).categorySelector = {
    has: (id: string) => categories.has(id),
    addCategories: (ids: string[]) => {
      ids.forEach((id) => categories.add(id));
      m.addCategoriesMock(ids);
    },
  };
  (view as Record<string, unknown>).modelSelector = {
    has: (id: string) => models.has(id),
    addModels: (ids: string[]) => {
      ids.forEach((id) => models.add(id));
      m.addModelsMock(ids);
    },
    dropModels: (ids: string[]) => {
      ids.forEach((id) => models.delete(id));
      m.dropModelsMock(ids);
    },
  };
  // 内容感知取景入口（实现打在 view.lookAtViewAlignedVolume）
  (view as Record<string, unknown>).lookAtViewAlignedVolume = m.lookAtVolumeMock;
  return view;
}

/** 构造假 IModelConnection：views/models 查询面 + ECSQL reader。 */
function makeFakeIModel(): IModelConnection {
  return {
    views: { queryProps: m.queryPropsMock, load: m.loadViewMock },
    models: { getLoaded: m.getLoadedMock, load: m.loadModelsMock, queryModelRanges: m.queryModelRangesMock },
    createQueryReader: m.queryReaderMock,
  } as unknown as IModelConnection;
}

/** 构造假 ScreenViewport：view 由 create mock 注入（与传入 ViewState 同一实例）。 */
function makeFakeViewport(iModel: IModelConnection): Record<string, unknown> {
  const viewport: Record<string, unknown> = {
    iModel,
    view: null,
    viewRect: { aspect: 1.2 },
    synchWithView: m.synchWithViewMock,
    dispose: m.disposeMock,
  };
  return viewport;
}

/** 预置默认桩：queryProps 有视图定义（Default 优先）、ECSQL reader 按表名吐行、模型未加载、模型范围非空。 */
function primeDefaults(fakeView: unknown, fakeViewport: Record<string, unknown>): void {
  m.queryPropsMock.mockResolvedValue(VIEW_SPECS);
  m.loadViewMock.mockResolvedValue(fakeView);
  m.queryReaderMock.mockImplementation((query: string) => {
    const ids = query.includes('SpatialCategory') ? CATEGORY_IDS : MODEL_IDS;
    return (async function* () {
      for (const id of ids) yield [id];
    })();
  });
  m.getLoadedMock.mockReturnValue(false);
  m.createViewportMock.mockImplementation((_div: HTMLElement, view: unknown) => {
    fakeViewport.view = view;
    return fakeViewport;
  });
  m.queryModelRangesMock.mockResolvedValue([{ low: [0, 0, 0], high: [10, 10, 10] }]);
}

// hook 出口的 viewport 逐渲染采样（renderHook 不可挂 div，用宿主组件采样）。
let latestViewport: ScreenViewport | undefined;
let latestPhase = '';
// console.log 静音 spy（实现内有进度日志；经变量持有以便 afterEach 恢复）
let logSpy: ReturnType<typeof vi.spyOn>;

function Harness({ iModel }: { iModel?: IModelConnection }) {
  const { viewportRef, phase, error, viewport } = useViewport({
    backendUrl: 'http://localhost:5310',
    hubUrl: 'http://localhost:5400',
    accessToken: 'jwt-x',
    iModel,
  });
  latestViewport = viewport;
  latestPhase = phase;
  return <div ref={viewportRef} data-testid="viewport-host" data-phase={phase} data-error={error ?? ''} />;
}

/** 推进宏任务队列，让 hook 内 async 创建链走完（act 包裹防 act 告警）。 */
async function flushAsync(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  // resetAllMocks（非 clearAllMocks）：清掉上一用例经 mockRejectedValue/
  // mockImplementation 注入的实现，防跨用例渗漏（mockClear 只清调用史）。
  vi.resetAllMocks();
  m.acquireViewerMock.mockResolvedValue(undefined);
  m.releaseViewerMock.mockResolvedValue(undefined);
  m.loadModelsMock.mockResolvedValue(undefined);
  latestViewport = undefined;
  latestPhase = '';
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
  cleanup();
});

describe('useViewport host 接线（M4 Task 1 既有口径）', () => {
  it('挂载 → acquireViewer 以选项启动；ready 相位透传 DOM', async () => {
    render(<Harness />);
    // acquireViewer 是 host 面（StartViewerOptions，无 iModel 键）——iModel 属视口创建链入参
    expect(m.acquireViewerMock).toHaveBeenCalledWith({
      backendUrl: 'http://localhost:5310',
      hubUrl: 'http://localhost:5400',
      accessToken: 'jwt-x',
    });
    await waitFor(() => expect(latestPhase).toBe('ready'));
  });

  it('卸载 → releaseViewer 回收', async () => {
    const { unmount } = render(<Harness />);
    await waitFor(() => expect(latestPhase).toBe('ready'));
    unmount();
    expect(m.releaseViewerMock).toHaveBeenCalledTimes(1);
  });

  it('acquireViewer 拒绝 → error 相位 + 可读消息', async () => {
    m.acquireViewerMock.mockRejectedValue(new Error('ipc unreachable'));
    const { getByTestId } = render(<Harness />);
    await waitFor(() => expect(getByTestId('viewport-host').getAttribute('data-phase')).toBe('error'));
    expect(getByTestId('viewport-host').getAttribute('data-error')).toBe('ipc unreachable');
    expect(m.releaseViewerMock).not.toHaveBeenCalled();
  });
});

describe('useViewport 视口创建主链（M4 Task 2）', () => {
  it('iModel 未就位 → 不创建（create 零调用）、viewport undefined', async () => {
    render(<Harness />);
    await flushAsync();
    expect(m.createViewportMock).not.toHaveBeenCalled();
    expect(latestViewport).toBeUndefined();
  });

  it('iModel 就位 → viewport 创建 + addViewport + result 出口；Default 命名视图优先', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);

    render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));

    expect(m.createViewportMock).toHaveBeenCalledTimes(1);
    expect(m.addViewportMock).toHaveBeenCalledTimes(1);
    expect(m.addViewportMock).toHaveBeenCalledWith(fakeViewport);
    // Default 命名视图优先（find(code.value==='Default')）
    expect(m.loadViewMock).toHaveBeenCalledWith('view-default');
    // 类目/模型补全（getDefaultViewState 的 ensure pass）
    expect(m.addCategoriesMock).toHaveBeenCalledWith(['cat-1']);
    expect(m.addCategoriesMock).toHaveBeenCalledWith(['cat-2']);
    expect(m.addModelsMock).toHaveBeenCalledWith(['model-1']);
  });

  it('调用序：queryProps→load→类目/模型补齐→create→addViewport→BRep 断点② refs 重建→queryModelRanges→lookAt', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);

    render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(m.lookAtVolumeMock).toHaveBeenCalled());

    const first = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0];
    expect(first(m.queryPropsMock)).toBeLessThan(first(m.loadViewMock));
    expect(first(m.loadViewMock)).toBeLessThan(first(m.addCategoriesMock));
    expect(first(m.addCategoriesMock)).toBeLessThan(first(m.createViewportMock));
    expect(first(m.createViewportMock)).toBeLessThan(first(m.addViewportMock));
    // BRep 断点②：drop/add refs 重建发生在 viewport 创建之后（首帧后重建）
    expect(first(m.addViewportMock)).toBeLessThan(first(m.dropModelsMock));
    expect(first(m.dropModelsMock)).toBeLessThan(first(m.queryModelRangesMock));
    expect(first(m.queryModelRangesMock)).toBeLessThan(first(m.lookAtVolumeMock));
  });

  it('BRep 不渲染两断点：ModelState 显式 load + drop/add 触发 refs 重建', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);

    render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));

    // 断点①：getLoaded=false → ModelState 必须显式 load（addModels 不触发加载）
    expect(m.loadModelsMock).toHaveBeenCalledWith(['model-1']);
    // 断点②：load 完成 → drop+add 已加载的 model 触发 markModelSelectorChanged → refs 重建
    expect(m.dropModelsMock).toHaveBeenCalledWith(['model-1']);
    expect(m.addModelsMock).toHaveBeenCalledWith(['model-1']);
    const lastAdd = m.addModelsMock.mock.invocationCallOrder.at(-1);
    const load = m.loadModelsMock.mock.invocationCallOrder[0];
    const drop = m.dropModelsMock.mock.invocationCallOrder[0];
    expect(drop).toBeGreaterThan(load);
    expect(lastAdd).toBeGreaterThan(drop);
    // 补齐后与视口同步
    expect(m.synchWithViewMock).toHaveBeenCalledWith({});
  });

  it('内容感知取景：queryModelRanges 联合范围 → lookAtViewAlignedVolume(union, aspect)', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);
    m.queryModelRangesMock.mockResolvedValue([
      { low: [0, 0, 0], high: [10, 10, 10] },
      { low: [5, 5, 5], high: [20, 12, 30] },
    ]);

    render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(m.lookAtVolumeMock).toHaveBeenCalled());

    expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(1);
    const union = m.lookAtVolumeMock.mock.calls[0][0] as Range3d;
    expect(union.toJSON()).toEqual({ low: [0, 0, 0], high: [20, 12, 30] });
    expect(m.lookAtVolumeMock.mock.calls[0][1]).toBe(1.2);
    expect(m.synchWithViewMock).toHaveBeenCalledWith({});
  });

  it('queryModelRanges 拒绝 → 维持既有取景（不 lookAt、不出 error）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);
    m.queryModelRangesMock.mockRejectedValue(new Error('backend down'));

    const { getByTestId } = render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));

    expect(m.lookAtVolumeMock).not.toHaveBeenCalled();
    expect(getByTestId('viewport-host').getAttribute('data-error')).toBe('');
  });

  it('queryModelRanges 空范围 → 维持既有取景（isNull 不取景）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);
    m.queryModelRangesMock.mockResolvedValue([]);

    render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));

    expect(m.lookAtVolumeMock).not.toHaveBeenCalled();
  });

  it('无视图定义 → ViewCreator3d.createDefaultView 兜底（含类目/模型补全）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);
    m.queryPropsMock.mockResolvedValue([]);
    m.createDefaultViewMock.mockResolvedValue(fakeView);

    render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));

    expect(m.createDefaultViewMock).toHaveBeenCalledTimes(1);
    expect(m.loadViewMock).not.toHaveBeenCalled();
    expect(m.createViewportMock).toHaveBeenCalledWith(expect.anything(), fakeView);
  });

  it('无视图定义且 createDefaultView 失败 → error 相位可读消息、viewport 恒 undefined', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);
    m.queryPropsMock.mockResolvedValue([]);
    m.createDefaultViewMock.mockRejectedValue(new Error('no content'));

    const { getByTestId } = render(<Harness iModel={fakeIModel} />);
    await waitFor(() =>
      expect(getByTestId('viewport-host').getAttribute('data-error')).toBe('No view state available'),
    );
    expect(latestViewport).toBeUndefined();
    expect(m.createViewportMock).not.toHaveBeenCalled();
  });

  it('卸载 → dropViewport + dispose 恰一次', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);

    const { unmount } = render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    unmount();

    expect(m.dropViewportMock).toHaveBeenCalledTimes(1);
    expect(m.dropViewportMock).toHaveBeenCalledWith(fakeViewport);
    expect(m.disposeMock).toHaveBeenCalledTimes(1);
  });

  it('StrictMode cancelled（创建前卸载）→ 不 create、恢复后不复活、不出 error', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);
    // queryProps 悬挂——卸载后放行
    let releaseQuery!: () => void;
    m.queryPropsMock.mockImplementation(
      async () => new Promise((resolve) => {
        releaseQuery = () => resolve(VIEW_SPECS);
      }),
    );

    const { getByTestId, unmount } = render(<Harness iModel={fakeIModel} />);
    const host = getByTestId('viewport-host');
    unmount();
    releaseQuery();
    await flushAsync();

    expect(m.createViewportMock).not.toHaveBeenCalled();
    expect(m.addViewportMock).not.toHaveBeenCalled();
    expect(latestViewport).toBeUndefined();
    expect(host.getAttribute('data-error')).toBe('');
  });

  it('StrictMode cancelled（创建后、补齐前卸载）→ cleanup drop+dispose；恢复后不 setState（viewport 不复活）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport);
    // queryModelRanges 悬挂（创建链最后一环）——卸载后放行：
    // create→addViewport 均已发生，setViewport 在 setup 全链落定后执行，
    // cancelled 哨兵须拦下这个「卸载后才完成」的 setState。
    let releaseRanges!: () => void;
    m.queryModelRangesMock.mockImplementation(
      async () => new Promise((resolve) => {
        releaseRanges = () => resolve([]);
      }),
    );

    const { unmount } = render(<Harness iModel={fakeIModel} />);
    await waitFor(() => expect(m.addViewportMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(m.dropViewportMock).toHaveBeenCalledWith(fakeViewport);
    expect(m.disposeMock).toHaveBeenCalledTimes(1);

    // 放行悬挂的补齐链：cancelled 哨兵拦下 setState——viewport 不复活
    releaseRanges();
    await flushAsync();
    expect(latestViewport).toBeUndefined();
  });
});
