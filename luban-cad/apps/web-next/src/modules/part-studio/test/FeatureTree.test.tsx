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
//     沿 M3 语义（M3 终审 T5-①：emphasize key 稳定序列化 + unmount 清理）。
//
// 定位：组件行为 + 纯函数验收层；@itwin/core-frontend 模块级 mock（零真实
// 查看器），真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { JSX } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureTreeEntry } from '@luban-cad/shared';

const mocks = vi.hoisted(() => ({
  emphasizeElements: vi.fn(),
  clearEmphasizedElements: vi.fn(),
  hideElements: vi.fn(),
  /** 测试可改写：null=无 viewport（emphasize 效果静默跳过）。 */
  viewport: null as unknown,
}));

vi.mock('@itwin/core-frontend', () => ({
  // Tool 基类桩：part-studio barrel → PartStudioPage → viewer-next 装饰件
  // （ToggleProjectExtentsTool extends Tool）模块加载期即需 Tool 存在。
  Tool: class {},
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
    get: () => ({ clearEmphasizedElements: mocks.clearEmphasizedElements }),
    getOrCreate: () => ({
      emphasizeElements: mocks.emphasizeElements,
      clearEmphasizedElements: mocks.clearEmphasizedElements,
      hideElements: mocks.hideElements,
    }),
  },
  // barrel 经 PartStudioPage 链式引入 viewport-actions（StandardViewId 顶层映射）。
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import { usePartStudioStore } from '../index.js';
import { matchFeature, matchPart, parseTreeFilter } from '../tree/TreeFilter.js';
import { FeatureTree } from '../tree/FeatureTree.js';
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

/** store 复位：canvas/tree 切片回缺省（用例间互不渗漏）。 */
function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    tree: { activeTab: 'features', selectedNodeIds: [], expandedNodeIds: [] },
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
    // 查询形状钉死：物理元素全量（ECInstanceId + CodeValue）。
    expect(connection.createQueryReader).toHaveBeenCalledWith(
      expect.stringContaining('FROM BisCore.GeometricElement3d'),
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
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex2' }));
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
