// src/modules/part-studio/test/FeatureTree.test.tsx
//
// M3 Task 5（brief Step 1）：双段特征树（对齐 os-11 左栏）+ 树上右键 + 筛选
// 语法 + 树↔画布联动单向流。M4 Task 6（拉伸闭环）演进——真数据源接线：
//  1) 特征段数据源切 `entries`（useFeatureSystem.tree 直通的 FeatureTreeEntry[]，
//     由 useFeatureTree 映射为视图模型行：类型标签+序号命名/status≠0 红显/
//     suppressed 斜体）；壳期「假 Part 1」占位移除（M3 终审 T5-②③ 收口）；
//  2) 六态完备：特征段 loading 骨架/error（+重试）/empty；零件段 loading/
//     error/empty——零件段=iModel 物理元素查询（SELECT ECInstanceId,CodeValue
//     FROM BisCore.GeometricElement3d 经 connection.createQueryReader，诚实
//     呈现数量与名）；
//  3) 行状态呈现/树↔画布联动（emphasize + 卸载清空）/右键菜单/TreeFilter 语法
//     沿 M3 语义（M3 终审 T5-①：emphasize key 稳定序列化 + unmount 清理）；
//     M6-c T5 增：零件段查询滤草图（LubanCAD.Sketch NOT IN 子查询）+ 特征
//     编辑态体高亮（对话框在场 → 体集 Onshape 橙覆盖，extraEmphasizedIds 通道）。
//
// 定位：组件行为 + 纯函数验收层；@itwin/core-frontend 模块级 mock（零真实
// 查看器），真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { JSX } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BodyInfo, FeatureTreeEntry } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  emphasizeElements: vi.fn(),
  clearEmphasizedElements: vi.fn(),
  hideElements: vi.fn(),
  // B6 M-A3.2a：consumed body 几何隐藏/撤销恢复（neverDrawn 集重建）。
  clearHiddenElements: vi.fn(),
  // M6-c T5：特征编辑态体高亮通道（Onshape 橙 color-only 覆盖）。
  overrideElements: vi.fn(),
  clearOverriddenElements: vi.fn(),
  /** 测试可改写：null=无 viewport（emphasize 效果静默跳过）。 */
  viewport: null as unknown,
}));

vi.mock('@itwin/core-frontend', () => ({
  // Tool 基类桩：part-studio barrel → PartStudioPage → viewer-next 装饰件
  // （ToggleProjectExtentsTool extends Tool）模块加载期即需 Tool 存在。
  Tool: class {},
  // I-2 notifications 呈现桥（PartStudioPage → ViewerNotifications）：
  // ToasterNotificationManager extends NotificationManager——模块加载期即需基类。
  NotificationManager: class { public outputMessage(): void { /* 哑通道桩 */ } },
  IModelApp: {
    tools: {
      run: vi.fn(),
    },
    viewManager: {
      get selectedView() {
        return mocks.viewport;
      },
    },
  },
  EmphasizeElements: {
    // M4-T6 T5-①：卸载清理走 get（不 getOrCreate——不因清理而创建实例）。
    get: () => ({
      clearEmphasizedElements: mocks.clearEmphasizedElements,
      clearOverriddenElements: mocks.clearOverriddenElements,
    }),
    getOrCreate: () => ({
      emphasizeElements: mocks.emphasizeElements,
      clearEmphasizedElements: mocks.clearEmphasizedElements,
      hideElements: mocks.hideElements,
      clearHiddenElements: mocks.clearHiddenElements,
      overrideElements: mocks.overrideElements,
      clearOverriddenElements: mocks.clearOverriddenElements,
    }),
  },
  // barrel 经 PartStudioPage 链式引入 viewport-actions（StandardViewId 顶层映射）。
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import { ColorDef, FeatureOverrideType } from '@itwin/core-common';
import { usePartStudioStore } from '../index.js';
import { matchFeature, matchPart, parseTreeFilter } from '../tree/TreeFilter.js';
import { deleteTargetBodyIdForFeature, FeatureTree } from '../tree/FeatureTree.js';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';

/**
 * 特征段原始条目（useFeatureSystem.tree 同形）。命名映射（useFeatureTree）：
 * 同类型按 orderKey 序自增——ex1→拉伸 1 / ex2→拉伸 2 / ch1→倒角 1 / ex3→拉伸 3。
 */
const ENTRIES: FeatureTreeEntry[] = [
  { id: 'ex1', featureType: 'extrude', orderKey: 1, suppressed: false, status: 0, params: {} },
  { id: 'ex2', featureType: 'extrude', orderKey: 2, suppressed: false, status: 0, params: {} },
  { id: 'ch1', featureType: 'chamfer', orderKey: 3, suppressed: false, status: 1, params: {} },
  { id: 'ex3', featureType: 'extrude', orderKey: 4, suppressed: true, status: 0, params: {} },
];

/**
 * body 读面替身（getBodies 同形；M-A3.2a）：active authored 才入零件段。
 * - 0x15 Base（ex1 驱动）；0x18 consumed（旧，删除后 active=false）；
 * - 0x20 无 name → 缺省「实体 N」（按 active 列表序）；0x22 authored=false（orphan 防御）。
 */
const BODIES: BodyInfo[] = [
  { bodyKey: '0x15', name: 'Base', active: true, authored: true, sourceFeatureId: 'ex1' },
  { bodyKey: '0x18', name: 'Old body', active: false, authored: true },
  { bodyKey: '0x20', active: true, authored: true, sourceFeatureId: 'ex2' },
  { bodyKey: '0x22', name: 'Orphan', active: true, authored: false },
];

/** 零件段查询替身（createQueryReader 异步可迭代；诚实呈现行数组）。 */
function partsConnection(
  rows: ReadonlyArray<readonly [id: string, name?: string]>,
  mode: 'ok' | 'fail' | 'pending' = 'ok',
) {
  return {
    key: 'test.bim',
    isReadonly: false,
    createQueryReader: vi.fn(() => {
      if (mode === 'pending') {
        // 永不落定的行游标（loading 骨架驻留）。
        return {
          [Symbol.asyncIterator]() {
            return { next: () => new Promise<IteratorResult<unknown[]>>(() => undefined) };
          },
        };
      }
      return (async function* () {
        if (mode === 'fail') throw new Error('ECSQL boom');
        for (const [id, name] of rows) yield [id, name];
      })();
    }),
  };
}

type PartsConnection = ReturnType<typeof partsConnection>;

/** store 复位：canvas/tree 切片回缺省（用例间互不渗漏；M6-a T7 起 sketch 切片同复位；M6-c T5 起 dialog 切片同复位）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null },
    dialog: { active: null },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewport = null;
  resetStore();
});

describe('FeatureTree 双段渲染（对齐 os-11；真数据源 entries）', () => {
  it('特征段映射渲染（类型标签+序号）+ 段头计数 + 零件段查询行', async () => {
    const connection = partsConnection([['0x1', 'Part 1'], ['0x2', 'Part 2']]);
    render(<FeatureTree entries={ENTRIES} connection={connection as never} />);
    const tree = screen.getByTestId('part-studio-tree');
    const featuresList = within(tree).getByTestId('part-studio-feature-list');
    const partsList = within(tree).getByTestId('part-studio-part-list');
    // 同类型按 orderKey 序自增命名（拉伸 1/拉伸 2/拉伸 3；chamfer→倒角 1）。
    expect(within(featuresList).getByText('拉伸 1')).toBeDefined();
    expect(within(featuresList).getByText('拉伸 2')).toBeDefined();
    expect(within(featuresList).getByText('倒角 1')).toBeDefined();
    expect(within(featuresList).getByText('拉伸 3')).toBeDefined();
    // 零件段=物理元素查询产物（诚实呈现名）。
    await waitFor(() => expect(within(partsList).getByText('Part 1')).toBeDefined());
    expect(within(partsList).getByText('Part 2')).toBeDefined();
    // 段头计数（os-11「特征 (17)」）。
    expect(within(tree).getByTestId('part-studio-feature-count').textContent).toBe('(4)');
    expect(within(tree).getByTestId('part-studio-part-count').textContent).toBe('(2)');
    // 查询形状钉死：物理元素行（ECInstanceId + CodeValue），草图元素排除
    //（M6-c T5 小项批：LubanCAD.Sketch 子查询 NOT IN——零件数语义不含草图）。
    expect(connection.createQueryReader).toHaveBeenCalledWith(
      expect.stringContaining('FROM BisCore.GeometricElement3d'),
    );
    expect(connection.createQueryReader).toHaveBeenCalledWith(
      expect.stringContaining('NOT IN (SELECT ECInstanceId FROM LubanCAD.Sketch)'),
    );
  });

  it('空数据 → 特征段/零件段 empty 态（壳期假 Part 1 占位已移除，M3 T5-②③ 收口）', () => {
    render(<FeatureTree />);
    const tree = screen.getByTestId('part-studio-tree');
    expect(within(tree).getByTestId('part-studio-feature-list')).toBeDefined();
    expect(within(tree).getByText('暂无特征')).toBeDefined();
    expect(within(tree).getByText('暂无零件')).toBeDefined();
    expect(within(tree).queryByText('Part 1')).toBeNull();
  });

  it('CodeValue 缺失 → 未命名实体回退（诚实呈现 id）', async () => {
    const connection = partsConnection([['0x9', undefined]]);
    render(<FeatureTree entries={[]} connection={connection as never} />);
    await waitFor(() =>
      expect(within(screen.getByTestId('part-studio-part-list')).getByText('未命名实体 0x9')).toBeDefined(),
    );
  });

  it('行状态呈现：status≠0 红显（data-error）+ 抑制斜体（data-suppressed）', () => {
    render(<FeatureTree entries={ENTRIES} />);
    const tree = screen.getByTestId('part-studio-tree');
    const errorRow = within(tree).getByTestId('tree-row-ch1');
    expect(errorRow.getAttribute('data-error')).toBe('true');
    const suppressedRow = within(tree).getByTestId('tree-row-ex3');
    expect(suppressedRow.getAttribute('data-suppressed')).toBe('true');
  });

  it('画布隐藏集叠加：store.canvas.hiddenIds 中的节点行呈现隐藏态', () => {
    usePartStudioStore.setState((s) => ({ canvas: { ...s.canvas, hiddenIds: ['ex1'] } }));
    render(<FeatureTree entries={ENTRIES} />);
    expect(screen.getByTestId('tree-row-ex1').getAttribute('data-hidden')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// B6 M-A3.2a：零件段 = authored active body（getBodies 读面）+ consumed 几何隐藏
// ---------------------------------------------------------------------------
describe('B6 M-A3.2a 零件段 = authored active body（getBodies 读面）', () => {
  it('只显示 active/authored body；consumed/orphan 排除；名称取 BodyInfo.name（缺省 实体 N）；legacy 物理查询不发起', async () => {
    const connection = partsConnection([['p1', 'Part 1']]);
    render(<FeatureTree entries={ENTRIES} bodies={BODIES} connection={connection as never} />);
    const tree = screen.getByTestId('part-studio-tree');
    const partsList = within(tree).getByTestId('part-studio-part-list');
    await waitFor(() => expect(within(partsList).getByText('Base')).toBeDefined());
    // consumed（Old body）与 authored=false（Orphan）都不入零件段。
    expect(within(partsList).queryByText('Old body')).toBeNull();
    expect(within(partsList).queryByText('Orphan')).toBeNull();
    // 无 name → 缺省「实体 N」（N=active authored 列表序）。
    expect(within(partsList).getByText('实体 2')).toBeDefined();
    expect(within(tree).getByTestId('part-studio-part-count').textContent).toBe('(2)');
    // 读面在场时不再跑 BisCore.GeometricElement3d 全量查询（不显示其它模型/副本）。
    expect(connection.createQueryReader).not.toHaveBeenCalled();
  });

  it('bodiesLoading（读面未就绪）→ 零件段骨架，legacy 物理查询不抢先发起', () => {
    const connection = partsConnection([['p1', 'Part 1']]);
    render(<FeatureTree entries={[]} bodiesLoading connection={connection as never} />);
    expect(within(screen.getByTestId('part-studio-tree')).getByTestId('part-studio-tree-loading')).toBeDefined();
    expect(connection.createQueryReader).not.toHaveBeenCalled();
  });

  it('body 读面初次失败（未 loaded）→ legacy 行保留的同时显示可见错误 + 重试（不静默回退）', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const connection = partsConnection([['p1', 'Part 1']]);
    render(
      <FeatureTree entries={[]} connection={connection as never} bodiesError="init race" onRetry={onRetry} />,
    );
    const warning = await screen.findByTestId('part-studio-part-read-surface-error');
    expect(warning.textContent).toContain('init race');
    // legacy 行仍诚实呈现（回退不是静默的：错误条与行同时在場）。
    expect(
      within(screen.getByTestId('part-studio-part-list')).getByText('Part 1'),
    ).toBeDefined();
    await user.click(within(warning).getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('bodiesError（读面刷新失败）→ 零件段就地错误条（重试走同一 refresh 出口）', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FeatureTree entries={[]} bodies={[]} bodiesError="getBodies boom" onRetry={onRetry} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('getBodies boom');
    await user.click(within(alert).getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('consumed 几何视口隐藏；与手动隐藏并集；undo 恢复 active 后重新可见', async () => {
    mocks.viewport = { id: 'vp' };
    const { rerender } = render(<FeatureTree entries={ENTRIES} bodies={BODIES} />);
    // 首次：仅 consumed body（0x18）进 neverDrawn（replace=true 重建集）。
    await waitFor(() => expect(mocks.hideElements).toHaveBeenCalledWith(['0x18'], { id: 'vp' }, true));
    // 手动隐藏 0x15（store.hiddenIds）→ 并集重算，用户隐藏不被 consumed 通道吞掉。
    act(() => {
      usePartStudioStore.setState((s) => ({ canvas: { ...s.canvas, hiddenIds: ['0x15'] } }));
    });
    await waitFor(() =>
      expect(mocks.hideElements).toHaveBeenLastCalledWith(['0x18', '0x15'], { id: 'vp' }, true),
    );
    // undo 恢复 active（0x18 active=true）且无手动隐藏 → 清 neverDrawn 重新可见。
    act(() => {
      usePartStudioStore.setState((s) => ({ canvas: { ...s.canvas, hiddenIds: [] } }));
    });
    rerender(
      <FeatureTree
        entries={ENTRIES}
        bodies={BODIES.map((body) => (body.bodyKey === '0x18' ? { ...body, active: true } : body))}
      />,
    );
    await waitFor(() => expect(mocks.clearHiddenElements).toHaveBeenCalledWith({ id: 'vp' }));
  });

  it('无 viewport（壳期/测试态）→ 隐藏效果静默跳过，不抛错', () => {
    render(<FeatureTree entries={ENTRIES} bodies={BODIES} />);
    expect(mocks.hideElements).not.toHaveBeenCalled();
    expect(mocks.clearHiddenElements).not.toHaveBeenCalled();
  });

  it('viewport 晚于 getBodies 出现 → 应用 consumed hide（I3：effect 依赖真 viewport）', async () => {
    const { rerender } = render(<FeatureTree entries={ENTRIES} bodies={BODIES} />);
    expect(mocks.hideElements).not.toHaveBeenCalled();
    const lateViewport = { id: 'late-vp' };
    rerender(<FeatureTree entries={ENTRIES} bodies={BODIES} viewport={lateViewport as never} />);
    await waitFor(() =>
      expect(mocks.hideElements).toHaveBeenCalledWith(['0x18'], lateViewport, true),
    );
  });
});

describe('B6 M-A3.2a delete target 映射（getBodies.sourceFeatureId 契约）', () => {
  it('feature→active authored body 唯一源映射；consumed/无源/未提供 → undefined', () => {
    expect(deleteTargetBodyIdForFeature(BODIES, 'ex1')).toBe('0x15');
    expect(deleteTargetBodyIdForFeature(BODIES, 'ex2')).toBe('0x20');
    expect(deleteTargetBodyIdForFeature(BODIES, 'ch1')).toBeUndefined();
    expect(deleteTargetBodyIdForFeature(undefined, 'ex1')).toBeUndefined();
  });

  it('HITL 删除回调第二参携带 targetBodyId（无映射时 undefined——N>1 由后端诚实拒收）', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<FeatureTree entries={ENTRIES} bodies={BODIES} onDelete={onDelete} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex1'));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除 拉伸 1' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex1' }), '0x15');
  });
});

describe('六态完备（特征段 loading/error/empty × 零件段 loading/error/empty）', () => {
  it('特征段 loading → 骨架行（data-testid 树加载锚点），数据行不渲染', () => {
    render(<FeatureTree entries={ENTRIES} loading />);
    const tree = screen.getByTestId('part-studio-tree');
    expect(within(tree).getByTestId('part-studio-tree-loading')).toBeDefined();
    expect(within(tree).queryByText('拉伸 1')).toBeNull();
  });

  it('特征段 error → 就地错误条 + 重试钮（回调出口 onRetry）', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FeatureTree entries={[]} error="RPC 悬挂" onRetry={onRetry} />);
    const alert = within(screen.getByTestId('part-studio-tree')).getByRole('alert');
    expect(alert.textContent).toContain('RPC 悬挂');
    await user.click(within(alert).getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('零件段 loading → 骨架行；查询落定前不渲染行', () => {
    const connection = partsConnection([], 'pending');
    render(<FeatureTree entries={[]} connection={connection as never} />);
    expect(within(screen.getByTestId('part-studio-tree')).getByTestId('part-studio-tree-loading')).toBeDefined();
  });

  it('零件段 error → 就地错误条（查询异常如实呈现）', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const connection = partsConnection([], 'fail');
      render(<FeatureTree entries={[]} connection={connection as never} />);
      const alert = await within(screen.getByTestId('part-studio-tree')).findByRole('alert');
      expect(alert.textContent).toContain('ECSQL boom');
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

describe('树→画布联动单向流（树选中 → viewport emphasize；M4-T6 T5-① 收口）', () => {
  it('点击行写 store.tree.selectedNodeIds 并 emphasize 该节点', async () => {
    const user = userEvent.setup();
    mocks.viewport = { id: 'vp' };
    render(<FeatureTree entries={ENTRIES} />);
    await user.click(screen.getByTestId('tree-row-ex2'));
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['ex2']);
    expect(mocks.emphasizeElements).toHaveBeenCalledWith(['ex2'], { id: 'vp' }, undefined, true);
  });

  it('emphasize 键稳定序列化：拼串碰撞集合（["a","bc"] vs ["ab","c"]）仍触发重跑', async () => {
    mocks.viewport = { id: 'vp' };
    render(<FeatureTree entries={ENTRIES} />);
    act(() => {
      usePartStudioStore.getState().setSelectedNodeIds(['a', 'bc']);
    });
    const first = mocks.emphasizeElements.mock.calls.length;
    // join('') 碰撞回归：两组不同集合拼串同形（'abc'），稳定序列化后必须重跑。
    act(() => {
      usePartStudioStore.getState().setSelectedNodeIds(['ab', 'c']);
    });
    await waitFor(() =>
      expect(mocks.emphasizeElements.mock.calls.length).toBeGreaterThan(first),
    );
    expect(mocks.emphasizeElements).toHaveBeenLastCalledWith(['ab', 'c'], { id: 'vp' }, undefined, true);
  });

  it('卸载清空 emphasize（有 viewport：清理走 EmphasizeElements.get，不反向建实例）', async () => {
    const user = userEvent.setup();
    mocks.viewport = { id: 'vp' };
    const { unmount } = render(<FeatureTree entries={ENTRIES} />);
    await user.click(screen.getByTestId('tree-row-ex1'));
    expect(mocks.emphasizeElements).toHaveBeenCalled();
    const clears = mocks.clearEmphasizedElements.mock.calls.length;
    unmount();
    expect(mocks.clearEmphasizedElements.mock.calls.length).toBeGreaterThan(clears);
  });

  it('卸载时无 viewport → emphasize 全链静默跳过（应用/清理均不触碰）', async () => {
    const user = userEvent.setup();
    mocks.viewport = null;
    const { unmount } = render(<FeatureTree entries={ENTRIES} />);
    await user.click(screen.getByTestId('tree-row-ex1'));
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['ex1']);
    expect(mocks.emphasizeElements).not.toHaveBeenCalled();
    expect(mocks.clearEmphasizedElements).not.toHaveBeenCalled();
    unmount();
    expect(mocks.clearEmphasizedElements).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// M6-c T5：特征编辑态体高亮（采集规格 §视口交互的最小通道）——特征对话框
// 在场 → 零件段体集（草图已滤）经 useCanvasSelection extraEmphasizedIds 打
// Onshape 橙 color-only 覆盖；关闭/空集 → clearOverriddenElements 清场。
// 「后续特征半透明灰显」挂账（per-feature 归属映射缺位）——见 useCanvasSelection 头注。
// ---------------------------------------------------------------------------
describe('特征编辑态体高亮（M6-c T5：对话框在场 → 体集 Onshape 橙覆盖）', () => {
  /** FEATURE_EDIT_HIGHLIGHT_COLOR（真实 ColorDef——@itwin/core-common 未 mock，与 hook 同源取值）。 */
  const ORANGE = ColorDef.from(0xf3, 0xad, 0x3e);
  const COLOR_ONLY = FeatureOverrideType.ColorOnly;

  it('对话框打开 → 体集 overrideElements 橙覆盖（replace 整集）；关闭 → clearOverriddenElements 清场', async () => {
    mocks.viewport = { id: 'vp' };
    const connection = partsConnection([['0x1', 'Part 1']]);
    render(<FeatureTree entries={ENTRIES} connection={connection as never} />);
    await waitFor(() =>
      expect(within(screen.getByTestId('part-studio-part-list')).getByText('Part 1')).toBeDefined(),
    );
    expect(mocks.overrideElements).not.toHaveBeenCalled();
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    await waitFor(() =>
      expect(mocks.overrideElements).toHaveBeenCalledWith(['0x1'], { id: 'vp' }, ORANGE, COLOR_ONLY, true),
    );
    act(() => {
      usePartStudioStore.getState().closeDialog();
    });
    await waitFor(() => expect(mocks.clearOverriddenElements).toHaveBeenCalled());
    expect(mocks.overrideElements).toHaveBeenCalledTimes(1); // 关闭后不重复打覆盖
  });

  it('对话框未开 → 只清场不打覆盖（空集通道）', async () => {
    mocks.viewport = { id: 'vp' };
    render(<FeatureTree entries={ENTRIES} />);
    await waitFor(() => expect(mocks.clearOverriddenElements).toHaveBeenCalled());
    expect(mocks.overrideElements).not.toHaveBeenCalled();
  });
});

describe('树上右键菜单（对齐 os-15 子集：重命名/编辑/抑制/删除）', () => {
  it('右键行弹菜单四项全呈；行先被选中', async () => {
    const user = userEvent.setup();
    render(<FeatureTree entries={ENTRIES} />);
    const row = screen.getByTestId('tree-row-ex2');
    fireEventContextMenu(row);
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    for (const name of ['重命名', '编辑…', '抑制', '删除']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeDefined();
    }
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['ex2']);
  });

  it('抑制 → onSuppress(node, true)；已抑制行显示 取消抑制', async () => {
    const user = userEvent.setup();
    const onSuppress = vi.fn();
    render(<FeatureTree entries={ENTRIES} onSuppress={onSuppress} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex2'));
    await user.click(screen.getByRole('menuitem', { name: '抑制' }));
    expect(onSuppress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ex2' }),
      true,
    );
    // 已抑制行：菜单项为 取消抑制。
    fireEventContextMenu(screen.getByTestId('tree-row-ex3'));
    expect(screen.getByRole('menuitem', { name: '取消抑制' })).toBeDefined();
  });

  it('编辑… → onEdit(node)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<FeatureTree entries={ENTRIES} onEdit={onEdit} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ch1'));
    await user.click(screen.getByRole('menuitem', { name: '编辑…' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch1' }));
  });

  it('删除 → HITL 确认（确认路 onDelete / 取消路不触发）', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<FeatureTree entries={ENTRIES} onDelete={onDelete} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex2'));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    let dialog = screen.getByRole('dialog', { name: '删除 拉伸 2' });
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(onDelete).not.toHaveBeenCalled();
    // 确认路。
    fireEventContextMenu(screen.getByTestId('tree-row-ex2'));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    dialog = screen.getByRole('dialog', { name: '删除 拉伸 2' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    // B6 M-A3.2a：无 body 读面 → 第二参 undefined（N≤1 legacy 不需 target）。
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex2' }), undefined);
  });

  it('重命名 → 行内编辑：Enter 提交 onRename / Escape 取消', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<FeatureTree entries={ENTRIES} onRename={onRename} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex2'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    const input = screen.getByRole('textbox', { name: '重命名' });
    expect((input as HTMLInputElement).value).toBe('拉伸 2');
    await user.clear(input);
    await user.type(input, '凸台 1{Enter}');
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex2' }), '凸台 1');
  });
});

describe('TreeFilter 语法解析（对齐 os-20 文本）', () => {
  const featureNodes = [
    { id: 'sk1', name: 'Sketch 1', type: 'sketch', hasError: false, isSuppressed: false, isHidden: false },
    { id: 'ex1', name: 'Extrude 1', type: 'extrude', hasError: false, isSuppressed: false, isHidden: false, variables: ['Width'] },
    { id: 'ch1', name: '倒角 1', type: 'chamfer', hasError: true, isSuppressed: false, isHidden: false },
    { id: 'ex2', name: 'Extrude 2', type: 'extrude', hasError: false, isSuppressed: true, isHidden: true },
  ];
  const partNodes = [
    { id: 'p1', name: 'Part 1', isHidden: false },
    { id: 'p2', name: 'Part 2', isHidden: true },
  ];

  it('parseTreeFilter：空串/单谓词/带值谓词/多条件 AND/引号值', () => {
    expect(parseTreeFilter('')).toEqual({
      text: '',
      errorsOnly: false,
      warningsOnly: false,
      hiddenOnly: false,
      suppressedOnly: false,
      types: [],
      variables: [],
    });
    expect(parseTreeFilter(':errors')).toMatchObject({ errorsOnly: true });
    expect(parseTreeFilter(':warnings')).toMatchObject({ warningsOnly: true });
    expect(parseTreeFilter(':hidden')).toMatchObject({ hiddenOnly: true });
    expect(parseTreeFilter(':suppressed')).toMatchObject({ suppressedOnly: true });
    expect(parseTreeFilter(':type extrude')).toMatchObject({ types: ['extrude'] });
    expect(parseTreeFilter(':type "my feature"')).toMatchObject({ types: ['my feature'] });
    expect(parseTreeFilter(':variable Width')).toMatchObject({ variables: ['Width'] });
    const multi = parseTreeFilter(':errors :type chamfer 倒角');
    expect(multi.errorsOnly).toBe(true);
    expect(multi.types).toEqual(['chamfer']);
    expect(multi.text).toBe('倒角');
    // 未知谓词不炸：原样并入文本条件。
    expect(parseTreeFilter(':folder x').text).toBe('x');
  });

  it('matchFeature：:errors 只留有错；组合条件 AND；自由文本名称子串', () => {
    const errored = featureNodes[2]!;
    const clean = featureNodes[1]!;
    expect(matchFeature(errored, parseTreeFilter(':errors'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter(':errors'))).toBe(false);
    expect(matchFeature(errored, parseTreeFilter(':errors :suppressed'))).toBe(false);
    expect(matchFeature(featureNodes[3]!, parseTreeFilter(':errors :suppressed'))).toBe(false);
    expect(matchFeature(clean, parseTreeFilter('extrude'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter('EXTRUDE'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter(':type EXTRUDE'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter(':type chamfer'))).toBe(false);
  });

  it(':variable 区分大小写（os-20 钉死）；:type 不区分', () => {
    const node = featureNodes[1]!; // variables: ['Width']
    expect(matchFeature(node, parseTreeFilter(':variable Width'))).toBe(true);
    expect(matchFeature(node, parseTreeFilter(':variable width'))).toBe(false);
  });

  it('matchPart：:hidden 按 isHidden；文本按名称', () => {
    expect(matchPart(partNodes[1]!, parseTreeFilter(':hidden'))).toBe(true);
    expect(matchPart(partNodes[0]!, parseTreeFilter(':hidden'))).toBe(false);
    expect(matchPart(partNodes[0]!, parseTreeFilter('part 1'))).toBe(true);
  });

  it('筛选框键入 → 行即时过滤；帮助列六条语法（os-20 文本）', async () => {
    const user = userEvent.setup();
    render(<FeatureTree entries={ENTRIES} />);
    const filterBox = screen.getByRole('textbox', { name: '按名称或类型筛选' });
    await user.type(filterBox, ':errors');
    expect(screen.getByTestId('tree-row-ch1')).toBeDefined();
    expect(screen.queryByTestId('tree-row-ex1')).toBeNull();
    // 语法帮助。
    await user.click(screen.getByRole('button', { name: '筛选语法' }));
    expect(screen.getByText(/按有错误的特征和主体进行筛选/)).toBeDefined();
    expect(screen.getByText(/按使用或更改特定变量的特征进行筛选/)).toBeDefined();
  });
});

describe('useCanvasSelection：画布拾取回流 store', () => {
  function Probe(): JSX.Element {
    const { selection, select, clear } = useCanvasSelection();
    return (
      <div>
        <button
          type="button"
          data-testid="pick"
          onClick={() => select([{ kind: 'part', id: 'p9', label: 'Part 9' }])}
        >
          pick
        </button>
        <button type="button" data-testid="clear" onClick={clear}>
          clear
        </button>
        <span data-testid="sel">{selection.map((s) => s.id).join(',')}</span>
      </div>
    );
  }

  it('select() 写 store.canvas.selection；clear() 清空', async () => {
    const user = userEvent.setup();
    render(<Probe />);
    await user.click(screen.getByTestId('pick'));
    expect(usePartStudioStore.getState().canvas.selection).toEqual([
      { kind: 'part', id: 'p9', label: 'Part 9' },
    ]);
    expect(screen.getByTestId('sel').textContent).toBe('p9');
    await user.click(screen.getByTestId('clear'));
    expect(usePartStudioStore.getState().canvas.selection).toEqual([]);
  });
});

/** jsdom 无 userEvent 右键便捷 API：直发 contextMenu 事件。 */
function fireEventContextMenu(element: HTMLElement): void {
  fireEvent.contextMenu(element);
}

// ── M4 Task 8（M3 终审挂账清偿）────────────────────────────────────────────

describe('M4-T8 D3：特征段头三工具钮（os-11 段头形态）', () => {
  it('特征段头渲染 插入元素/暂停重建/特征历史 三钮；点击 gated 项开能力引导对话框', async () => {
    const user = userEvent.setup();
    render(<FeatureTree entries={ENTRIES} />);
    const tree = screen.getByTestId('part-studio-tree');
    // 三钮照常渲染（完整 UI 面：不灰化不删减），零件段头无此钮组。
    for (const name of ['插入元素', '暂停重建', '特征历史']) {
      expect(within(tree).getByRole('button', { name })).toBeDefined();
    }
    // 点击 gated 项 → 能力引导对话框（能力注册表路由）。
    await user.click(within(tree).getByRole('button', { name: '插入元素' }));
    const capabilityDialog = screen.getByRole('dialog', { name: '插入元素（规划中）' });
    // Escape dismissal 可达前提（review-8 I-1 P2 补齐）：打开即焦点入对话框
    //（自研对话框无 iTwinUI setFocus——挂 autoFocus 等价面）。
    expect(capabilityDialog.contains(document.activeElement)).toBe(true);
  });
});

describe('M4-T8 D5：树右键菜单项左置图标（os-15 V20）', () => {
  it('右键菜单每项带图标（svg 在场，aria-hidden）', () => {
    render(<FeatureTree entries={ENTRIES} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex1'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);
    for (const itemEl of items) {
      const icon = itemEl.querySelector('svg');
      expect(icon, `菜单项「${itemEl.textContent}」缺图标`).not.toBeNull();
      expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

// ── M6-a T7：草图节点本地化 + 编辑入口（双击/右键两路）─────────────────────

/** M6-b T1：Front 基准面（后端树行 params.plane 回显的断言基准；SketchDialog sketchPlaneFromOption 同款三向量）。 */
const FRONT_PLANE_DTO = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xDir: { x: 1, y: 0, z: 0 },
} as const;

/** M6-a T7：草图节点（featureType='sketch'）×2 + 对照特征节点；M6-b T1 增带 plane 树行 sk3。 */
const SKETCH_TREE_ENTRIES: FeatureTreeEntry[] = [
  { id: 'sk1', featureType: 'sketch', orderKey: 1, suppressed: false, status: 0, params: {} },
  { id: 'sk2', featureType: 'sketch', orderKey: 2, suppressed: false, status: 0, params: {} },
  { id: 'ex9', featureType: 'extrude', orderKey: 3, suppressed: false, status: 0, params: {} },
  { id: 'sk3', featureType: 'sketch', orderKey: 4, suppressed: false, status: 0, params: { plane: FRONT_PLANE_DTO } },
];

describe('M6-a T7：草图节点本地化 + 编辑入口（Onshape 语义=双击进编辑）', () => {
  it('sketch 条目显示名走 i18n（草图 1/草图 2），非回退原始串；行图标在场', () => {
    render(<FeatureTree entries={SKETCH_TREE_ENTRIES} />);
    const tree = screen.getByTestId('part-studio-tree');
    // featureTypes.sketch 入词库：同类型序号自增命名（草图 1/草图 2），非回退原始串。
    expect(within(tree).getByText('草图 1')).toBeDefined();
    expect(within(tree).getByText('草图 2')).toBeDefined();
    expect(within(tree).queryByText('sketch 1')).toBeNull();
    // 行图标（SvgDraw 占位，M6-c 再校）：svg 在场且 aria-hidden。
    const icon = screen.getByTestId('tree-row-sk1').querySelector('.part-studio-tree-row__icon svg');
    expect(icon).not.toBeNull();
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
    // 非 sketch 节点无图标（既有呈现面不变）。
    expect(screen.getByTestId('tree-row-ex9').querySelector('.part-studio-tree-row__icon')).toBeNull();
  });

  it('双击 sketch 节点 → enterSketch 进草图模式（store 断言+行红显联动）；无 plane 树行=契约缺省 XY@z=0', async () => {
    const user = userEvent.setup();
    render(<FeatureTree entries={SKETCH_TREE_ENTRIES} />);
    await user.dblClick(screen.getByTestId('tree-row-sk1'));
    const sketch = usePartStudioStore.getState().sketch;
    expect(sketch.isActive).toBe(true);
    expect(sketch.activeSketchId).toBe('sk1');
    // M6-b T1：树行 params 无 plane（旧库/未携平面）→ null=契约缺省 XY@z=0（回显降级语义）。
    expect(sketch.activeSketchPlane).toBeNull();
    // 树红显进行中草图（os-30 联动既有面）。
    expect(screen.getByTestId('tree-row-sk1').getAttribute('data-sketch-active')).toBe('true');
  });

  it('M6-b T1：编辑入口回显树行 params.plane → activeSketchPlane（双击/右键两路同义+串场防御）', async () => {
    const user = userEvent.setup();
    render(<FeatureTree entries={SKETCH_TREE_ENTRIES} />);
    // 双击带平面草图行 → 落库真平面入 store（AccuDraw/绘制投影的消费面）
    await user.dblClick(screen.getByTestId('tree-row-sk3'));
    let sketch = usePartStudioStore.getState().sketch;
    expect(sketch.isActive).toBe(true);
    expect(sketch.activeSketchId).toBe('sk3');
    expect(sketch.activeSketchPlane).toEqual(FRONT_PLANE_DTO);
    // 串场防御：上一会话残留异面后，编辑无 plane 草图归零（enterSketch 先归零再回显的序保证）
    act(() => {
      usePartStudioStore.setState({ sketch: { isActive: false, activeSketchId: null, activeSketchPlane: FRONT_PLANE_DTO } });
    });
    await user.dblClick(screen.getByTestId('tree-row-sk1'));
    sketch = usePartStudioStore.getState().sketch;
    expect(sketch.activeSketchId).toBe('sk1');
    expect(sketch.activeSketchPlane).toBeNull();
    // 右键路与双击同义：带平面行经菜单进编辑 → 同一平面回显
    act(() => { usePartStudioStore.getState().exitSketch(); });
    fireEventContextMenu(screen.getByTestId('tree-row-sk3'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    await user.click(within(menu).getByRole('menuitem', { name: '编辑草图…' }));
    sketch = usePartStudioStore.getState().sketch;
    expect(sketch.isActive).toBe(true);
    expect(sketch.activeSketchPlane).toEqual(FRONT_PLANE_DTO);
  });

  it('双击非 sketch 节点 → 不进草图模式（既有行为不变）', async () => {
    const user = userEvent.setup();
    render(<FeatureTree entries={SKETCH_TREE_ENTRIES} />);
    await user.dblClick(screen.getByTestId('tree-row-ex9'));
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
    expect(usePartStudioStore.getState().sketch.activeSketchId).toBeNull();
  });

  it('右键 sketch 节点：菜单有「编辑草图…」（带图标）、无「编辑…」；点击进草图模式', async () => {
    const user = userEvent.setup();
    render(<FeatureTree entries={SKETCH_TREE_ENTRIES} />);
    fireEventContextMenu(screen.getByTestId('tree-row-sk2'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    const editSketch = within(menu).getByRole('menuitem', { name: '编辑草图…' });
    // 通用「编辑…」（FeatureDialog 路由）对 sketch 节点隐藏——草图不走特征对话框。
    expect(within(menu).queryByRole('menuitem', { name: '编辑…' })).toBeNull();
    // 菜单项左置图标（os-15 V20 同口径）。
    const icon = editSketch.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.closest('[aria-hidden="true"]')).not.toBeNull();
    await user.click(editSketch);
    expect(usePartStudioStore.getState().sketch.isActive).toBe(true);
    expect(usePartStudioStore.getState().sketch.activeSketchId).toBe('sk2');
    // 菜单收合。
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('右键非 sketch 节点：菜单有「编辑…」、无「编辑草图…」（既有行为不变）', () => {
    render(<FeatureTree entries={SKETCH_TREE_ENTRIES} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex9'));
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    expect(within(menu).getByRole('menuitem', { name: '编辑…' })).toBeDefined();
    expect(within(menu).queryByRole('menuitem', { name: '编辑草图…' })).toBeNull();
  });
});
