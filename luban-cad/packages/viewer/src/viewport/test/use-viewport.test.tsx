// @vitest-environment jsdom
//
// useViewport（M3 Task 3 接线 + M4 Task 2 扩 ScreenViewport 创建主链）：
//  A) host 接线（M4 Task 1 既有口径）——挂载 → acquireViewer 以入参选项启动；
//     卸载 → releaseViewer；acquireViewer 拒绝 → error 相位；
//  B) 视口创建主链（M4 Task 2，移植自旧查看器包 useViewport.ts 全链）——
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
    invalidateSceneMock: vi.fn(),
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
function makeFakeView(initialModels: string[] = []): unknown {
  const view = new m.SpatialViewStateMock();
  const categories = new Set<string>();
  const models = new Set<string>(initialModels);
  (view as Record<string, unknown>).categorySelector = {
    has: (id: string) => categories.has(id),
    addCategories: (ids: string[]) => {
      ids.forEach((id) => categories.add(id));
      m.addCategoriesMock(ids);
    },
  };
  (view as Record<string, unknown>).modelSelector = {
    // ModelSelectorState.models 是 Set（P2.5 过滤需迭代既有选择器条目）
    get models() {
      return new Set(models);
    },
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
  // 断言出口：当前 selector 内的模型（Set 快照——P2.5 active-scope 过滤用）
  Object.defineProperty(view, 'selectedModels', { get: () => [...models] });
  return view;
}

/** 读取假 ViewState 当前 selector 内的模型。 */
function selectedModelsOf(view: unknown): string[] {
  return (view as { selectedModels: string[] }).selectedModels;
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
    invalidateScene: m.invalidateSceneMock,
    dispose: m.disposeMock,
  };
  return viewport;
}

/** 预置默认桩：queryProps 有视图定义（Default 优先）、ECSQL reader 按表名吐行、模型未加载、模型范围非空。 */
function primeDefaults(
  fakeView: unknown,
  fakeViewport: Record<string, unknown>,
  modelIds: string[] = MODEL_IDS,
): void {
  m.queryPropsMock.mockResolvedValue(VIEW_SPECS);
  m.loadViewMock.mockResolvedValue(fakeView);
  m.queryReaderMock.mockImplementation((query: string) => {
    const ids = query.includes('SpatialCategory') ? CATEGORY_IDS : modelIds;
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
let latestError = '';
let latestAppliedModelKey: string | null | undefined;
// console.log 静音 spy（实现内有进度日志；经变量持有以便 afterEach 恢复）
let logSpy: ReturnType<typeof vi.spyOn>;

function Harness({
  iModel,
  notifications,
  activeModelIds,
}: {
  iModel?: IModelConnection;
  notifications?: unknown;
  activeModelIds?: readonly string[];
}) {
  const { viewportRef, phase, error, viewport, appliedModelKey } = useViewport({
    backendUrl: 'http://localhost:5300',
    hubUrl: 'http://localhost:5400',
    accessToken: 'jwt-x',
    iModel,
    notifications: notifications as never,
    activeModelIds,
  });
  latestViewport = viewport;
  latestPhase = phase;
  latestError = error ?? '';
  latestAppliedModelKey = appliedModelKey;
  return (
    <div
      ref={viewportRef}
      data-testid="viewport-host"
      data-phase={phase}
      data-error={error ?? ''}
      data-applied-key={appliedModelKey === undefined ? '' : appliedModelKey ?? 'all'}
    />
  );
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
  latestError = '';
  latestAppliedModelKey = undefined;
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
      backendUrl: 'http://localhost:5300',
      hubUrl: 'http://localhost:5400',
      accessToken: 'jwt-x',
      notifications: undefined,
    });
    await waitFor(() => expect(latestPhase).toBe('ready'));
  });

  it('notifications 选项透传 acquireViewer（review-8 I-2 呈现桥注入点）', async () => {
    const manager = { outputMessage: vi.fn() };
    render(<Harness notifications={manager} />);
    expect(m.acquireViewerMock).toHaveBeenCalledWith(
      expect.objectContaining({ notifications: manager }),
    );
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

  it('错误随链生灭：viewport 创建失败 → 切换 iModel 重走链成功 → 上一链错误清空（不污染新链相位呈现）', async () => {
    // 上一链失败现场：无视图定义且 createDefaultView 拒绝。
    const badView = makeFakeView();
    const badIModel = makeFakeIModel();
    primeDefaults(badView, makeFakeViewport(badIModel));
    m.queryPropsMock.mockResolvedValue([]);
    m.createDefaultViewMock.mockRejectedValue(new Error('no content'));

    const { getByTestId, rerender } = render(<Harness iModel={badIModel} />);
    await waitFor(() =>
      expect(getByTestId('viewport-host').getAttribute('data-error')).toBe('No view state available'),
    );

    // 切换健康 iModel（tab 切换重开场景）：新链创建成功，上一链错误必须随链
    // 终结清空——否则消费方（Session 错误面/状态栏）把健康链误报成失败。
    const goodView = makeFakeView();
    const goodIModel = makeFakeIModel();
    const goodViewport = makeFakeViewport(goodIModel);
    primeDefaults(goodView, goodViewport);
    rerender(<Harness iModel={goodIModel} />);
    await waitFor(() => expect(latestViewport).toBe(goodViewport));
    expect(getByTestId('viewport-host').getAttribute('data-error')).toBe('');
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

// ── B-model P2.5：active-scope 过滤（每个 Part Studio = 一个 PhysicalModel）──
describe('useViewport active-scope 过滤（P2.5）', () => {
  const RANGES: Record<string, { low: number[]; high: number[] }> = {
    'model-1': { low: [0, 0, 0], high: [10, 10, 10] },
    'model-2': { low: [100, 100, 100], high: [110, 110, 110] },
    'model-3': { low: [200, 200, 200], high: [210, 210, 210] },
  };
  const ALL_MODELS = ['model-1', 'model-2', 'model-3'];

  function primeRanges(): void {
    m.queryModelRangesMock.mockImplementation(async (ids: string[]) =>
      ids.map((id) => RANGES[id]),
    );
  }

  function lastFitRange(): Range3d {
    return m.lookAtVolumeMock.mock.calls.at(-1)?.[0] as Range3d;
  }

  /** 指定参数模式的首次/末次调用序（invocationCallOrder；找不到返回 undefined）。 */
  function firstCallOrder(fn: ReturnType<typeof vi.fn>, ids: string[]): number | undefined {
    const index = fn.mock.calls.findIndex((args) => (args[0] as string[])?.join(',') === ids.join(','));
    return index < 0 ? undefined : fn.mock.invocationCallOrder[index];
  }
  function lastCallOrder(fn: ReturnType<typeof vi.fn>, ids: string[]): number | undefined {
    for (let i = fn.mock.calls.length - 1; i >= 0; i -= 1) {
      if ((fn.mock.calls[i][0] as string[])?.join(',') === ids.join(',')) {
        return fn.mock.invocationCallOrder[i];
      }
    }
    return undefined;
  }

  it('B active scope：只显示 activeModelIds 内模型（视图既有其他模型被移除）、只加载它并按它取景', async () => {
    const fakeView = makeFakeView(['model-1', 'model-3']);
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();

    render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await waitFor(() => expect(m.lookAtVolumeMock).toHaveBeenCalled());

    // selector 只剩 active model（视图里预置的 model-1/model-3 必须移除——
    // 隐藏 scope 的几何不得可见/可拾取）。
    expect(selectedModelsOf(fakeView)).toEqual(['model-2']);
    expect(m.dropModelsMock).toHaveBeenCalledWith(['model-1', 'model-3']);
    expect(m.loadModelsMock).toHaveBeenCalledWith(['model-2']);
    // 取景只看 active model。
    expect(m.queryModelRangesMock).toHaveBeenLastCalledWith(['model-2']);
    expect(lastFitRange().toJSON()).toEqual(RANGES['model-2']);
  });

  it('切 active scope：不重建 viewport/不重开连接，drop 旧模型、add 新模型并重新取景', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();

    const { rerender } = render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-2']));
    expect(lastFitRange().toJSON()).toEqual(RANGES['model-2']);

    rerender(<Harness iModel={fakeIModel} activeModelIds={['model-3']} />);
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-3']));
    await waitFor(() => expect(m.queryModelRangesMock).toHaveBeenLastCalledWith(['model-3']));
    await waitFor(() => expect(lastFitRange().toJSON()).toEqual(RANGES['model-3']));

    // 同上一条 iModel/连接：viewport 仅创建一次、不重新 acquire。
    expect(m.createViewportMock).toHaveBeenCalledTimes(1);
    expect(m.addViewportMock).toHaveBeenCalledTimes(1);
    expect(m.acquireViewerMock).toHaveBeenCalledTimes(1);
    expect(m.loadModelsMock).toHaveBeenCalledWith(['model-3']);
    // 场景失效（scope 切换必须重绘）
    expect(m.invalidateSceneMock).toHaveBeenCalled();
    expect(latestAppliedModelKey).toBe('["model-3"]');

    // F5：切换路径的 load 后 drop+add（refs 重建）及顺序——load → drop →
    // add（末次）→ queryModelRanges → lookAt。删掉 drop/add 时真机切 scope
    // 会因 SpatialRefs 缓存不重建而无 tile。
    const loadOrder = firstCallOrder(m.loadModelsMock, ['model-3']);
    const dropOrder = firstCallOrder(m.dropModelsMock, ['model-3']);
    const addOrder = lastCallOrder(m.addModelsMock, ['model-3']);
    const rangesOrder = firstCallOrder(m.queryModelRangesMock, ['model-3']);
    const fitOrder = m.lookAtVolumeMock.mock.invocationCallOrder.at(-1);
    expect(loadOrder).toBeDefined();
    expect(dropOrder).toBeDefined();
    expect(addOrder).toBeDefined();
    expect(rangesOrder).toBeDefined();
    expect(dropOrder as number).toBeGreaterThan(loadOrder as number);
    expect(addOrder as number).toBeGreaterThan(dropOrder as number);
    expect(rangesOrder as number).toBeGreaterThan(addOrder as number);
    expect(fitOrder as number).toBeGreaterThan(rangesOrder as number);
  });

  it('切到已加载模型：只 add 不 load（selector 变化本身触发 refs 重建）+ 重取景', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    // 预加载：切换不需要 ModelState.load，只靠 addModels 触发 refs 重建。
    m.getLoadedMock.mockReturnValue(true);

    const { rerender } = render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-2']));
    expect(m.loadModelsMock).not.toHaveBeenCalled();

    rerender(<Harness iModel={fakeIModel} activeModelIds={['model-3']} />);
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-3']));
    await waitFor(() => expect(lastFitRange().toJSON()).toEqual(RANGES['model-3']));

    expect(m.loadModelsMock).not.toHaveBeenCalled();
    expect(m.dropModelsMock).toHaveBeenCalledWith(['model-2']);
    expect(m.addModelsMock).toHaveBeenCalledWith(['model-3']);
    expect(m.queryModelRangesMock).toHaveBeenLastCalledWith(['model-3']);
  });

  it('同一白名单内容重渲染不重复取景（无关渲染不触发 fit 循环）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();

    const { rerender } = render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await waitFor(() => expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(1));

    // 新数组、同内容（父级重渲染形态）：不得再次 query/fit。
    rerender(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await flushAsync();
    expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(1);
    expect(m.queryModelRangesMock).toHaveBeenCalledTimes(1);
  });

  it('A 旧文档（activeModelIds 缺省）：全模型行为不变（无过滤 drop、联合范围取景）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    // 预先加载：避免 BRep 补链的 drop/add refs 重建干扰「过滤 drop」断言。
    m.getLoadedMock.mockReturnValue(true);

    render(<Harness iModel={fakeIModel} activeModelIds={undefined} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await waitFor(() => expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(1));

    expect(selectedModelsOf(fakeView)).toEqual(ALL_MODELS);
    expect(m.dropModelsMock).not.toHaveBeenCalled();
    expect(m.queryModelRangesMock).toHaveBeenLastCalledWith(ALL_MODELS);
    expect(lastFitRange().toJSON()).toEqual({ low: [0, 0, 0], high: [210, 210, 210] });
  });

  it('空白名单（无完整 active scope）：不加载/不选择任何模型、不取景——绝不回落全模型', async () => {
    const fakeView = makeFakeView(['model-1']);
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();

    render(<Harness iModel={fakeIModel} activeModelIds={[]} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await flushAsync();

    expect(selectedModelsOf(fakeView)).toEqual([]);
    expect(m.addModelsMock).not.toHaveBeenCalled();
    expect(m.loadModelsMock).not.toHaveBeenCalled();
    expect(m.queryModelRangesMock).not.toHaveBeenCalled();
    expect(m.lookAtVolumeMock).not.toHaveBeenCalled();
  });

  it('active scope 切换为空白名单（damaged）：清空 selector 且不取景（不回落全模型）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();

    const { rerender } = render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-2']));
    const fitCallsBefore = m.lookAtVolumeMock.mock.calls.length;

    rerender(<Harness iModel={fakeIModel} activeModelIds={[]} />);
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual([]));
    await flushAsync();
    expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(fitCallsBefore);
  });

  it('F2：快速连切且 range 响应乱序——被取代的旧 scope 不得覆盖新 scope 取景', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    // 预加载：切换跳过 load，直接进 range 查询（复现竞态窗口）。
    m.getLoadedMock.mockReturnValue(true);

    const { rerender } = render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await waitFor(() => expect(lastFitRange().toJSON()).toEqual(RANGES['model-2']));

    // 切换期间挂起两次 range 查询，手工乱序放行。
    const pending = new Map<string, (ranges: unknown) => void>();
    m.queryModelRangesMock.mockImplementation(
      async (ids: string[]) => new Promise((resolve) => {
        pending.set(ids.join(','), resolve);
      }),
    );

    await act(async () => {
      rerender(<Harness iModel={fakeIModel} activeModelIds={['model-3']} />);
    });
    await waitFor(() => expect(pending.has('model-3')).toBe(true));
    await act(async () => {
      rerender(<Harness iModel={fakeIModel} activeModelIds={['model-1']} />);
    });
    await waitFor(() => expect(pending.has('model-1')).toBe(true));

    // 新 scope（model-1）先返回 → 取景；旧 scope（model-3）晚到必须被丢弃。
    const fitsBefore = m.lookAtVolumeMock.mock.calls.length;
    pending.get('model-1')?.([RANGES['model-1']]);
    await flushAsync();
    expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(fitsBefore + 1);
    expect(lastFitRange().toJSON()).toEqual(RANGES['model-1']);

    pending.get('model-3')?.([RANGES['model-3']]);
    await flushAsync();
    expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(fitsBefore + 1);
    expect(lastFitRange().toJSON()).toEqual(RANGES['model-1']);
    expect(selectedModelsOf(fakeView)).toEqual(['model-1']);
  });

  it('F3：B 物理模型 ECSQL 失败 → fail-closed 清空 + 错误可见 + 不标记已应用；恢复后重试成功', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    // 仅 PhysicalModel 查询失败（类目查询照常）。
    m.queryReaderMock.mockImplementation((query: string) => {
      if (query.includes('PhysicalModel')) throw new Error('ecsql down');
      return (async function* () {
        for (const id of CATEGORY_IDS) yield [id];
      })();
    });

    const { getByTestId, rerender } = render(
      <Harness iModel={fakeIModel} activeModelIds={['model-1']} />,
    );
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await waitFor(() => expect(latestError).toContain('物理模型'));
    expect(getByTestId('viewport-host').getAttribute('data-error')).toContain('物理模型');
    // fail-closed：无可见模型、不取景、未标记已应用（不可静默到刷新才恢复）。
    expect(selectedModelsOf(fakeView)).toEqual([]);
    expect(m.lookAtVolumeMock).not.toHaveBeenCalled();
    expect(latestAppliedModelKey).toBeUndefined();
    expect(getByTestId('viewport-host').getAttribute('data-applied-key')).toBe('');

    // 恢复 ECSQL（模拟瞬时故障）→ 切 scope 触发重试 → 应用成功、错误清除。
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    await act(async () => {
      rerender(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    });
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-2']));
    await waitFor(() => expect(latestAppliedModelKey).toBe('["model-2"]'));
    await waitFor(() => expect(latestError).toBe(''));
  });

  it('F3：失败后切回原 scope 不得命中陈旧「已应用」签名（fail-closed 清空后必须重建）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    m.getLoadedMock.mockReturnValue(true);

    const { rerender } = render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(latestAppliedModelKey).toBe('["model-2"]'));

    // 切到 model-3 时 ECSQL 失败 → fail-closed 清空；旧 ["model-2"] 签名必须作废。
    m.queryReaderMock.mockImplementation((query: string) => {
      if (query.includes('PhysicalModel')) throw new Error('ecsql down');
      return (async function* () {
        for (const id of CATEGORY_IDS) yield [id];
      })();
    });
    await act(async () => {
      rerender(<Harness iModel={fakeIModel} activeModelIds={['model-3']} />);
    });
    await waitFor(() => expect(latestError).toContain('物理模型'));
    expect(selectedModelsOf(fakeView)).toEqual([]);
    expect(latestAppliedModelKey).toBeUndefined();

    // 恢复后切回 model-2：不得因陈旧签名匹配而跳过重建。
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    await act(async () => {
      rerender(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    });
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-2']));
    await waitFor(() => expect(latestAppliedModelKey).toBe('["model-2"]'));
    expect(latestError).toBe('');
  });

  it('F3：A legacy（activeModelIds 缺省）物理模型查询失败保持旧行为（视同空、不报错）', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    m.queryReaderMock.mockImplementation((query: string) => {
      if (query.includes('PhysicalModel')) throw new Error('ecsql down');
      return (async function* () {
        for (const id of CATEGORY_IDS) yield [id];
      })();
    });

    render(<Harness iModel={fakeIModel} activeModelIds={undefined} />);
    await waitFor(() => expect(latestViewport).toBe(fakeViewport));
    await flushAsync();
    expect(latestError).toBe('');
    expect(m.lookAtVolumeMock).not.toHaveBeenCalled();
  });

  it('F4：iModel 切换后晚到的过滤（load 期间）不再操作已 dispose 的 viewport', async () => {
    const fakeView = makeFakeView();
    const fakeIModel = makeFakeIModel();
    const fakeViewport = makeFakeViewport(fakeIModel);
    primeDefaults(fakeView, fakeViewport, ALL_MODELS);
    primeRanges();
    // 缺省 getLoaded=false：切换会走 load；先让首链 load 正常完成。

    const { rerender } = render(<Harness iModel={fakeIModel} activeModelIds={['model-2']} />);
    await waitFor(() => expect(selectedModelsOf(fakeView)).toEqual(['model-2']));

    let releaseLoad!: () => void;
    m.loadModelsMock.mockImplementation(
      async () => new Promise<void>((resolve) => {
        releaseLoad = resolve;
      }),
    );

    await act(async () => {
      rerender(<Harness iModel={fakeIModel} activeModelIds={['model-3']} />);
    });
    await waitFor(() => expect(m.loadModelsMock).toHaveBeenCalledWith(['model-3']));
    // load 在途时切换 iModel（视口拆除）——快照副作用次数。
    const dropCalls = m.dropModelsMock.mock.calls.length;
    const addCalls = m.addModelsMock.mock.calls.length;
    const syncCalls = m.synchWithViewMock.mock.calls.length;
    const invalidateCalls = m.invalidateSceneMock.mock.calls.length;
    const fitCalls = m.lookAtVolumeMock.mock.calls.length;
    await act(async () => {
      rerender(<Harness iModel={undefined} />);
    });
    expect(latestViewport).toBeUndefined();

    releaseLoad();
    await flushAsync();

    // 晚到 load 落定：不得再 drop/add refs、不得 synch/invalidate/fit。
    expect(m.dropModelsMock).toHaveBeenCalledTimes(dropCalls);
    expect(m.addModelsMock).toHaveBeenCalledTimes(addCalls);
    expect(m.synchWithViewMock).toHaveBeenCalledTimes(syncCalls);
    expect(m.invalidateSceneMock).toHaveBeenCalledTimes(invalidateCalls);
    expect(m.lookAtVolumeMock).toHaveBeenCalledTimes(fitCalls);
  });
});
