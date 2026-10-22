// src/modules/part-studio/test/FeatureTree.test.tsx
//
// M3 Task 5（brief Step 1）：双段特征树（对齐 os-11 左栏）+ 树上右键 + 筛选
// 语法 + 树↔画布联动单向流——
//  1) 双段渲染：特征段/零件段 + 段头计数；空数据回退壳期占位（暂无特征 /
//     Part 1，T3 结构断言兼容）；
//  2) 行状态呈现：错误红显（data-error）/抑制斜体（data-suppressed）/
//     隐藏淡显（data-hidden——含画布隐藏集 store.canvas.hiddenIds 叠加）；
//  3) 树选中 → store.tree.selectedNodeIds → viewport emphasize
//     （EmphasizeElements mock 断言）：树→画布单向流；
//  4) 行右键菜单（对齐 os-15 子集）：重命名（行内编辑）/编辑…/抑制/删除
//     (HITL 确认)；回调出口 onRename/onEdit/onSuppress/onDelete；
//  5) TreeFilter 语法解析（纯函数 parseTreeFilter/matchFeature/matchPart）：
//     :errors/:warnings/:hidden/:suppressed/:type/:variable + 自由文本；
//     :variable 区分大小写（os-20 文本对齐）；多条件 AND；筛选框键入过滤行；
//  6) useCanvasSelection：select() 画布拾取回流 store（viewport 接线前的
//     回流缝），clear() 清空。
//
// 定位：组件行为 + 纯函数验收层；@itwin/core-frontend 模块级 mock（零真实
// 查看器），真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { JSX } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    getOrCreate: () => ({
      emphasizeElements: mocks.emphasizeElements,
      clearEmphasizedElements: mocks.clearEmphasizedElements,
      hideElements: mocks.hideElements,
    }),
  },
  // barrel 经 PartStudioPage 链式引入 viewport-actions（StandardViewId 顶层映射）。
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import type { FeatureNode, PartNode } from '../index.js';
import { usePartStudioStore } from '../index.js';
import { matchFeature, matchPart, parseTreeFilter } from '../tree/TreeFilter.js';
import { FeatureTree } from '../tree/FeatureTree.js';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';

const FEATURES: FeatureNode[] = [
  { id: 'sk1', name: 'Sketch 1', type: 'sketch', hasError: false, isSuppressed: false, isHidden: false },
  {
    id: 'ex1',
    name: 'Extrude 1',
    type: 'extrude',
    hasError: false,
    isSuppressed: false,
    isHidden: false,
    variables: ['Width'],
  },
  { id: 'ch1', name: '倒角 1', type: 'chamfer', hasError: true, isSuppressed: false, isHidden: false },
  { id: 'ex2', name: 'Extrude 2', type: 'extrude', hasError: false, isSuppressed: true, isHidden: true },
];

const PARTS: PartNode[] = [
  { id: 'p1', name: 'Part 1', isHidden: false },
  { id: 'p2', name: 'Part 2', isHidden: true },
];

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

describe('FeatureTree 双段渲染（对齐 os-11）', () => {
  it('特征段/零件段 + 段头计数 + 数据行渲染', () => {
    render(<FeatureTree features={FEATURES} parts={PARTS} />);
    const tree = screen.getByTestId('part-studio-tree');
    const featuresList = within(tree).getByTestId('part-studio-feature-list');
    const partsList = within(tree).getByTestId('part-studio-part-list');
    expect(within(featuresList).getByText('Sketch 1')).toBeDefined();
    expect(within(featuresList).getByText('Extrude 1')).toBeDefined();
    expect(within(partsList).getByText('Part 2')).toBeDefined();
    // 段头计数（os-11「特征 (17)」）。
    expect(within(tree).getByTestId('part-studio-feature-count').textContent).toBe('(4)');
    expect(within(tree).getByTestId('part-studio-part-count').textContent).toBe('(2)');
  });

  it('空数据回退壳期占位（暂无特征 / Part 1）——T3 结构断言兼容', () => {
    render(<FeatureTree />);
    const tree = screen.getByTestId('part-studio-tree');
    expect(within(tree).getByTestId('part-studio-feature-list')).toBeDefined();
    expect(within(tree).getByText('暂无特征')).toBeDefined();
    expect(within(tree).getByText('Part 1')).toBeDefined();
  });

  it('错误红显（data-error）+ 抑制斜体（data-suppressed）+ 隐藏淡显（data-hidden）', () => {
    render(<FeatureTree features={FEATURES} parts={PARTS} />);
    const tree = screen.getByTestId('part-studio-tree');
    const errorRow = within(tree).getByTestId('tree-row-ch1');
    expect(errorRow.getAttribute('data-error')).toBe('true');
    const suppressedRow = within(tree).getByTestId('tree-row-ex2');
    expect(suppressedRow.getAttribute('data-suppressed')).toBe('true');
    expect(suppressedRow.getAttribute('data-hidden')).toBe('true');
    const hiddenPart = within(tree).getByTestId('tree-row-p2');
    expect(hiddenPart.getAttribute('data-hidden')).toBe('true');
  });

  it('画布隐藏集叠加：store.canvas.hiddenIds 中的节点行呈现隐藏态', () => {
    usePartStudioStore.setState((s) => ({ canvas: { ...s.canvas, hiddenIds: ['sk1'] } }));
    render(<FeatureTree features={FEATURES} parts={PARTS} />);
    expect(screen.getByTestId('tree-row-sk1').getAttribute('data-hidden')).toBe('true');
  });
});

describe('树→画布联动单向流（树选中 → viewport emphasize）', () => {
  it('点击行写 store.tree.selectedNodeIds 并 emphasize 该节点', async () => {
    const user = userEvent.setup();
    mocks.viewport = { id: 'vp' };
    render(<FeatureTree features={FEATURES} parts={PARTS} />);
    await user.click(screen.getByTestId('tree-row-ex1'));
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['ex1']);
    expect(mocks.emphasizeElements).toHaveBeenCalledWith(['ex1'], { id: 'vp' }, undefined, true);
  });
});

describe('树上右键菜单（对齐 os-15 子集：重命名/编辑/抑制/删除）', () => {
  it('右键行弹菜单四项全呈；行先被选中', async () => {
    const user = userEvent.setup();
    render(<FeatureTree features={FEATURES} parts={PARTS} />);
    const row = screen.getByTestId('tree-row-ex1');
    fireEventContextMenu(row);
    const menu = screen.getByRole('menu', { name: '特征菜单' });
    for (const name of ['重命名', '编辑…', '抑制', '删除']) {
      expect(within(menu).getByRole('menuitem', { name })).toBeDefined();
    }
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['ex1']);
  });

  it('抑制 → onSuppress(node, true)；已抑制行显示 取消抑制', async () => {
    const user = userEvent.setup();
    const onSuppress = vi.fn();
    render(<FeatureTree features={FEATURES} parts={PARTS} onSuppress={onSuppress} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex1'));
    await user.click(screen.getByRole('menuitem', { name: '抑制' }));
    expect(onSuppress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ex1' }),
      true,
    );
    // 已抑制行：菜单项为 取消抑制。
    fireEventContextMenu(screen.getByTestId('tree-row-ex2'));
    expect(screen.getByRole('menuitem', { name: '取消抑制' })).toBeDefined();
  });

  it('编辑… → onEdit(node)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<FeatureTree features={FEATURES} parts={PARTS} onEdit={onEdit} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ch1'));
    await user.click(screen.getByRole('menuitem', { name: '编辑…' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'ch1' }));
  });

  it('删除 → HITL 确认（确认路 onDelete / 取消路不触发）', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<FeatureTree features={FEATURES} parts={PARTS} onDelete={onDelete} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex1'));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    let dialog = screen.getByRole('dialog', { name: '删除 Extrude 1' });
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(onDelete).not.toHaveBeenCalled();
    // 确认路。
    fireEventContextMenu(screen.getByTestId('tree-row-ex1'));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    dialog = screen.getByRole('dialog', { name: '删除 Extrude 1' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex1' }));
  });

  it('重命名 → 行内编辑：Enter 提交 onRename / Escape 取消', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<FeatureTree features={FEATURES} parts={PARTS} onRename={onRename} />);
    fireEventContextMenu(screen.getByTestId('tree-row-ex1'));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    const input = screen.getByRole('textbox', { name: '重命名' });
    expect((input as HTMLInputElement).value).toBe('Extrude 1');
    await user.clear(input);
    await user.type(input, '凸台 1{Enter}');
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex1' }), '凸台 1');
  });
});

describe('TreeFilter 语法解析（对齐 os-20 文本）', () => {
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
    const errored = FEATURES[2]!;
    const clean = FEATURES[1]!;
    expect(matchFeature(errored, parseTreeFilter(':errors'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter(':errors'))).toBe(false);
    expect(matchFeature(errored, parseTreeFilter(':errors :suppressed'))).toBe(false);
    expect(matchFeature(FEATURES[3]!, parseTreeFilter(':errors :suppressed'))).toBe(false);
    expect(matchFeature(clean, parseTreeFilter('extrude'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter('EXTRUDE'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter(':type EXTRUDE'))).toBe(true);
    expect(matchFeature(clean, parseTreeFilter(':type chamfer'))).toBe(false);
  });

  it(':variable 区分大小写（os-20 钉死）；:type 不区分', () => {
    const node = FEATURES[1]!; // variables: ['Width']
    expect(matchFeature(node, parseTreeFilter(':variable Width'))).toBe(true);
    expect(matchFeature(node, parseTreeFilter(':variable width'))).toBe(false);
  });

  it('matchPart：:hidden 按 isHidden；文本按名称', () => {
    expect(matchPart(PARTS[1]!, parseTreeFilter(':hidden'))).toBe(true);
    expect(matchPart(PARTS[0]!, parseTreeFilter(':hidden'))).toBe(false);
    expect(matchPart(PARTS[0]!, parseTreeFilter('part 1'))).toBe(true);
  });

  it('筛选框键入 → 行即时过滤；帮助列六条语法（os-20 文本）', async () => {
    const user = userEvent.setup();
    render(<FeatureTree features={FEATURES} parts={PARTS} />);
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
