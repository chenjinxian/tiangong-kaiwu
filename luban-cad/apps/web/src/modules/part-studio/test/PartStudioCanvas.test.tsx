// src/modules/part-studio/test/PartStudioCanvas.test.tsx
//
// M4 Task 6（brief Step 1）：画布宿主的对话框寻址渲染——
//  1) T6-① key 必办：FeatureDialog 挂
//     `key={mode==='edit' ? featureId : 'new-'+featureType+(patternKind ? '-'+patternKind : '')}`
//     ——不同 featureId 切换时重挂（本地态不跨特征残留；M3-T6 台账①根治）；
//     B5：pattern 的 kind 参与 key（linear/circular 两入口互切重挂）；
//  2) new/extrude 提交链：对话框确认 → 宿主下传的 applyOp（Session
//     useFeatureSystem 直通）被调；✗ 取消 → closeDialog；M6-a T6 起载荷走
//     草图通道（sketches/connectionKey 透传 → {sketchId, regions,
//     profile:[]}——M6-c T3 面域寻址升级多选数组，getSketch 面域读面替身）；
//  3) sketch 寻址：SketchDialog 照旧按 dialog.active==='sketch' 渲染；
//     M6-a T4 起 sketch 提交链同款接线（✓ → applyOp 收 insertSketch →
//     真 sketchId 入 store → closeDialog；canEdit=false → ✓ 禁用）。
//
// 定位：宿主接线验收层；@itwin/core-frontend 模块级 mock（零真实查看器），
// 真实 store/i18n 参与（setup.ts 全局词库兜底，zh-CN 基线）。

import type { RefObject } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { BodyInfo, FeatureOp, FeatureOpResult } from '@luban-cad/shared';

// M6-a T6：面域读面 RPC 替身（FeatureDialog 拉伸草图通道 getSketch 直调）。
const featureRpc = vi.hoisted(() => ({
  getSketch: vi.fn(),
}));

vi.mock('@luban-cad/shared', async (importOriginal) => ({
  // ADR-0017：display-actions 消费 shared RENDER_DEFAULTS/rgbToHex；保留真实导出，
  // 只覆盖测试锚点。
  ...(await importOriginal<typeof import('@luban-cad/shared')>()),
  LUBAN_INIT_TXN_DESCRIPTION: 'partstudio init',
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

// B-model v1.17：FeatureDialog 经 useWorkspaceRef 读路由 ?model=（本文件无 Router；legacy 形态）。
vi.mock('@common/workspace/use-workspace-ref.js', () => ({
  useWorkspaceRef: () => null,
}));

// M-A5.2 T5：面/边删除通道（editor-frontend IPC）在宿主测试里替身化。
const subEntityDeleteMock = vi.hoisted(() => vi.fn());
vi.mock('../canvas/subentity-delete.js', () => ({
  deleteSelectedSubEntity: subEntityDeleteMock,
}));

// 2026-11-03：Onshape 选择运行时（选中所属实体/删除后清空子实体选择）替身化。
const clearOnshapeSelectionMock = vi.hoisted(() => vi.fn());
const clearOnshapeHighlightMock = vi.hoisted(() => vi.fn());
vi.mock('../internal/onshape-selection-runtime.js', () => ({
  clearActiveOnshapeSelection: clearOnshapeSelectionMock,
  clearActiveOnshapeHighlight: clearOnshapeHighlightMock,
}));

// ADR-0017 Stage D：草图平面模型面读取替身（真实通道需 SolidModeling 命令）。
const readBrepFaceHandleMock = vi.hoisted(() => vi.fn());
vi.mock('../internal/brep-topology.js', () => ({
  readBrepTopology: vi.fn(),
  readBrepFaceHandle: readBrepFaceHandleMock,
}));

const mocks = vi.hoisted(() => ({
  outputMessage: vi.fn(),
  viewport: null as unknown,
}));

vi.mock('@itwin/core-frontend', () => ({
  Tool: class {},
  // I-2 notifications 呈现桥（PartStudioPage → ViewerNotifications）：
  // ToasterNotificationManager extends NotificationManager——模块加载期即需基类。
  NotificationManager: class { public outputMessage(): void { /* 哑通道桩 */ } },
  // M4-T6：成功 toast 构造 NotifyMessageDetails——钉形替身。
  NotifyMessageDetails: class {
    priority: number;
    briefMessage: string;
    constructor(priority: number, briefMessage: string) {
      this.priority = priority;
      this.briefMessage = briefMessage;
    }
  },
  OutputMessagePriority: { None: 0, Success: 1, Error: 10, Warning: 11, Info: 12 },
  IModelApp: {
    tools: { run: vi.fn() },
    notifications: { outputMessage: mocks.outputMessage },
    viewManager: {
      get selectedView() {
        return mocks.viewport;
      },
    },
  },
  EmphasizeElements: {
    get: () => ({ clearEmphasizedElements: vi.fn() }),
    getOrCreate: () => ({
      emphasizeElements: vi.fn(),
      clearEmphasizedElements: vi.fn(),
      hideElements: vi.fn(),
    }),
  },
  StandardViewId: { Top: 'sv-top', Front: 'sv-front', Right: 'sv-right', Iso: 'sv-iso' },
}));

import { usePartStudioStore } from '../index.js';
import { PartStudioCanvas } from '../components/PartStudioCanvas.js';

function renderCanvas(
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>,
  opts?: {
    sketches?: ReadonlyArray<{ id: string; label: string }>;
    connectionKey?: string;
    connection?: BriefcaseConnection;
    bodies?: readonly BodyInfo[];
    canEdit?: boolean;
  },
): void {
  render(
    <PartStudioCanvas
      viewportRef={{ current: null } as RefObject<HTMLDivElement>}
      applyOp={applyOp}
      sketches={opts?.sketches}
      bodies={opts?.bodies}
      canEdit={opts?.canEdit ?? true}
      connection={
        opts?.connection
          ?? (opts?.connectionKey ? ({ key: opts.connectionKey } as unknown as BriefcaseConnection) : undefined)
      }
    />,
  );
}

function resetStore(): void {
  usePartStudioStore.setState({
    canvas: { selection: [], hiddenIds: [] },
    sketch: { isActive: false, activeSketchId: null, activeSketchPlane: null },
    dialog: { active: null },
    viewOnly: { isActive: false },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  featureRpc.getSketch.mockReset();
  subEntityDeleteMock.mockReset().mockResolvedValue(undefined);
  readBrepFaceHandleMock.mockReset();
  mocks.viewport = null;
  resetStore();
});

describe('FeatureDialog 宿主寻址（T6-① key 必办 + 提交链）', () => {
  it('edit 模式切换 featureId → key 变更重挂，本地态不跨特征残留', async () => {
    const user = userEvent.setup();
    renderCanvas();
    actOpenEdit('ex1', '拉伸 1');
    expect(screen.getByRole('dialog', { name: '拉伸 1' })).toBeDefined();
    // 写入本地态：展开起始偏移段并键入（重挂后必须消失；拔模输入已按未实现禁用）。
    await user.click(withinDialog().getByRole('button', { name: '起始偏移' }));
    await user.type(withinDialog().getByRole('textbox', { name: '起始偏移' }), '5');
    expect((withinDialog().getByRole('textbox', { name: '起始偏移' }) as HTMLInputElement).value).toBe('5');

    // 切换到另一特征（key: ex1 → ex2）→ 重挂，起始偏移回缺省（折叠+空）。
    actOpenEdit('ex2', '拉伸 2');
    expect(screen.getByRole('dialog', { name: '拉伸 2' })).toBeDefined();
    expect(withinDialog().queryByRole('textbox', { name: '起始偏移' })).toBeNull();
    expect(withinDialog().getByRole('button', { name: '起始偏移' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('B5：patternKind 参与 key —— pattern linear→circular 两入口切换重挂（kind 初值生效）', () => {
    // pattern 通道需 applyOp 在场（new + applyOp 才是参数化特征入口）。
    renderCanvas(vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' })));
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'pattern', patternKind: 'linear' });
    });
    expect((withinDialog().getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement).value).toBe('linear');
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'pattern', patternKind: 'circular' });
    });
    // 同 featureType 但 key 含 kind → 重挂后 useState 初值取 circular（非旧态残留）。
    expect((withinDialog().getByRole('combobox', { name: '阵列类型' }) as HTMLSelectElement).value).toBe('circular');
    expect((withinDialog().getByRole('combobox', { name: '方向轴' }) as HTMLSelectElement).value).toBe('Z');
  });

  it('new 模式与 edit 模式 key 不同族（new-extrude），互不串挂', async () => {
    renderCanvas();
    actOpenEdit('ex1', '拉伸 1');
    expect(screen.getByRole('dialog', { name: '拉伸 1' })).toBeDefined();
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    // new 模式标题=类型标签（词库），非上一特征的名称残留。
    expect(screen.getByRole('dialog', { name: '拉伸' })).toBeDefined();
    expect(screen.queryByRole('dialog', { name: '拉伸 1' })).toBeNull();
  });

  it('new 模式提交 → applyOp 直通（insertFeature/extrude 草图通道——M6-a T6 sketches/connectionKey 透传生效）+ closeDialog', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' }));
    // 宿主下传 sketches + connection.key → 对话框选中草图经 getSketch 拿面域 →
    // 载荷 {sketchId, regions, profile:[]}（M6-a T6 草图通道；M6-c T3 面域寻址
    // 升级为 regions 多选数组，regionIndex 不再发）。
    featureRpc.getSketch.mockResolvedValue({
      id: 'sk-1',
      entities: [],
      constraints: [],
      solve: { status: 'ok', dof: 0, failedConstraintIds: [], conflictingRank: [] },
      regions: [{ area: 0.25, outerEntityIds: [1, 2, 3, 4] }],
    });
    renderCanvas(applyOp, { sketches: [{ id: 'sk-1', label: '草图 1' }], connectionKey: 'canvas-key' });
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    // Onshape：草图自动取最近一张（无草图下拉），单面域自动选中。
    await withinDialog().findByText('草图 1 的面'); // 面域读取落定（通道就绪）
    await user.click(withinDialog().getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'insertFeature',
        featureType: 'extrude',
        params: { profile: [], distance: 10, sketchId: 'sk-1', regions: [0], operation: 'new' },
      }),
    );
    // 成功 → 宿主收合（closeDialog）。
    await waitFor(() => expect(usePartStudioStore.getState().dialog.active).toBeNull());
  });

  it('✗ 取消 → closeDialog（对话框不自销，受控口径）', async () => {
    const user = userEvent.setup();
    renderCanvas();
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    await user.click(withinDialog().getByRole('button', { name: '取消' }));
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
  });

  it('sketch 寻址：SketchDialog 照旧渲染（dialog.active=sketch）', async () => {
    const user = userEvent.setup();
    renderCanvas();
    act(() => {
      usePartStudioStore.getState().openSketchDialog('sk-1');
    });
    const dialog = screen.getByTestId('part-studio-sketch-dialog');
    expect(dialog).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
  });

  it('ADR-0017 Stage D：草图对话框期间拾取单个面 → 「模型面」平面选项；✓ 携带平面快照', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-face' }));
    readBrepFaceHandleMock.mockResolvedValue({
      bodyKey: 'body-1',
      subEntityId: 6,
      range: { low: [0, 0, 10], high: [20, 10, 10] },
      normal: [0, 0, 1],
      loops: [[{ kind: 'line', p0: [0, 0, 10], p1: [20, 0, 10] }]],
    });
    renderCanvas(applyOp, { connectionKey: 'briefcase-key' });
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{
        kind: 'face',
        id: 'face:body-1:1:6',
        ownerBodyKey: 'body-1',
        cacheId: 6,
        label: '面',
      }]);
    });
    await waitFor(() =>
      expect(readBrepFaceHandleMock).toHaveBeenCalledWith('briefcase-key', 'body-1', 6));
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: '草图平面' }).textContent).toContain('模型面'));
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'insertSketch',
        entities: [],
        constraints: [],
        plane: {
          origin: { x: 0, y: 0, z: 10 },
          normal: { x: 0, y: 0, z: 1 },
          xDir: { x: 1, y: 0, z: 0 },
        },
      }));
  });

  it('Stage D：非平面/读取失败 → Error toast、不设平面、✓ 仍禁用（不编造平面）', async () => {
    readBrepFaceHandleMock.mockResolvedValue(undefined);
    renderCanvas(undefined, { connectionKey: 'briefcase-key' });
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{
        kind: 'face', id: 'face:body-1:1:7', ownerBodyKey: 'body-1', cacheId: 7,
      }]);
    });
    await waitFor(() => expect(readBrepFaceHandleMock).toHaveBeenCalled());
    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalled());
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    expect((within(dialog).getByRole('combobox', { name: '草图平面' }) as HTMLButtonElement).textContent)
      .not.toContain('模型面');
    expect((within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sketch 提交链（M6-a T4）：✓ 创建并保持编辑态对话框，再次 ✓ 完成退出', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-new-1' }));
    renderCanvas(applyOp);
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    // Onshape：必须先选平面（视口/树/字段菜单），未选时 ✓ 禁用。
    await user.click(within(dialog).getByRole('combobox', { name: '草图平面' }));
    await user.click(screen.getByRole('option', { name: '上视' }));
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'insertSketch',
        entities: [],
        constraints: [],
        plane: {
          origin: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 0, z: 1 },
          xDir: { x: 1, y: 0, z: 0 },
        },
      }),
    );
    await waitFor(() =>
      expect(usePartStudioStore.getState().sketch).toEqual({
        isActive: true,
        activeSketchId: 'sk-new-1',
        activeSketchPlane: {
          origin: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 0, z: 1 },
          xDir: { x: 1, y: 0, z: 0 },
        },
        constructionMode: false,
      }),
    );
    // Onshape：创建后同一草图对话框保持打开（编辑态）；再次 ✓ = 完成退出。
    expect(usePartStudioStore.getState().dialog.active).toBe('sketch');
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() => expect(usePartStudioStore.getState().dialog.active).toBeNull());
    expect(usePartStudioStore.getState().sketch.isActive).toBe(false);
  });

  it('M6-a T5：sketch 确认链平面下发——选「前视」确认 → activeSketchPlane=前视 XZ 面三向量', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-front-1' }));
    renderCanvas(applyOp);
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    // 选基准面「前视」（字段菜单 → sketchPlaneFromOption 的判别域）。
    await user.click(within(dialog).getByRole('combobox', { name: '草图平面' }));
    await user.click(screen.getByRole('option', { name: '前视' }));
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(usePartStudioStore.getState().sketch).toEqual({
        isActive: true,
        activeSketchId: 'sk-front-1',
        activeSketchPlane: {
          origin: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 1, z: 0 },
          xDir: { x: 1, y: 0, z: 0 },
        },
        constructionMode: false,
      }),
    );
    // op 侧 plane 同步下发（T4 口径不变）。
    expect(applyOp).toHaveBeenCalledWith({
      kind: 'insertSketch',
      entities: [],
      constraints: [],
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        xDir: { x: 1, y: 0, z: 0 },
      },
    });
  });

  it('sketch + canEdit=false（B2 只读写门禁下传）→ SketchDialog ✓ 禁用 + 只读提示，applyOp 未发起', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'sk-1' }));
    render(
      <PartStudioCanvas
        viewportRef={{ current: null } as RefObject<HTMLDivElement>}
        applyOp={applyOp}
        canEdit={false}
      />,
    );
    act(() => {
      usePartStudioStore.getState().openSketchDialog();
    });
    const dialog = withinDialog().getByTestId('part-studio-sketch-dialog');
    expect(within(dialog).getByTestId('part-studio-sketch-dialog-readonly-hint')).toBeDefined();
    const confirm = within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.click(confirm);
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('viewOnly 置位 → 打开中的写面对话框整体收口（I-1 宿主职责），回切编辑不复活；仅查看态下打开亦即收', async () => {
    renderCanvas();
    actOpenEdit('ex1', '拉伸 1');
    expect(screen.getByTestId('part-studio-feature-dialog')).toBeDefined();
    act(() => {
      usePartStudioStore.getState().setViewOnly(true);
    });
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
    expect(usePartStudioStore.getState().dialog.active).toBeNull();
    // 仅查看态下被打开的对话框：打开即收（dialog.active 入依赖）。
    actOpenEdit('ex2', '拉伸 2');
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
    // 写面收口是终态：viewOnly 回切编辑不复活旧对话框。
    act(() => {
      usePartStudioStore.getState().setViewOnly(false);
    });
    expect(screen.queryByTestId('part-studio-feature-dialog')).toBeNull();
  });

  it('canEdit=false（B2 只读写门禁下传）→ 对话框 ✓ 禁用 + 只读提示（视图语义 viewOnly、写动作语义 canEdit 分线）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true, featureId: 'f1' }));
    render(
      <PartStudioCanvas
        viewportRef={{ current: null } as RefObject<HTMLDivElement>}
        applyOp={applyOp}
        canEdit={false}
      />,
    );
    act(() => {
      usePartStudioStore.getState().openFeatureDialog({ mode: 'new', featureType: 'extrude' });
    });
    // 权限只读下对话框不被收口（那是 viewOnly 语义）但提交面诚实关死。
    const dialog = withinDialog().getByTestId('part-studio-feature-dialog');
    expect(within(dialog).getByTestId('part-studio-feature-dialog-readonly-hint')).toBeDefined();
    expect((within(dialog).getByRole('button', { name: '确认' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: '确认' }));
    expect(applyOp).not.toHaveBeenCalled();
  });
});

/** 在画布容器内查询（对话框渲染于 part-studio-canvas 内）。 */
function withinDialog(): ReturnType<typeof within> {
  return within(screen.getByTestId('part-studio-canvas'));
}

function actOpenEdit(featureId: string, featureName: string): void {
  act(() => {
    usePartStudioStore.getState().openFeatureDialog({
      mode: 'edit',
      featureId,
      featureName,
      featureType: 'extrude',
    });
  });
}

// ── B6 M-A5 T2：画布 body 删除接线（Task 1 选中桥落地后不留死路）────────────
// F1 终审修复：part 选择未命中 active authored body（陈旧/被消费 id）不再静默
// no-op —— Error toast「实体已不可用，无法删除」+ 零 applyOp。

/** body 读面替身：Base（有源）/ NoSource（无源）/ Consumed（inactive）。 */
const CANVAS_BODIES: BodyInfo[] = [
  { bodyKey: '0x15', name: 'Base', active: true, authored: true, sourceFeatureId: 'ex1' },
  { bodyKey: '0x20', name: 'NoSource', active: true, authored: true },
  { bodyKey: '0x22', name: 'Consumed', active: false, authored: true, sourceFeatureId: 'ex9' },
];

/** 画布右键 → 点删除项 → HITL 确认（body 删除链的宿主集成路径）。 */
async function confirmCanvasDelete(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), { clientX: 40, clientY: 50 });
  await user.click(screen.getByRole('menuitem', { name: `删除 ${name}` }));
  const dialog = screen.getByRole('dialog', { name: `删除 ${name}` });
  await user.click(within(dialog).getByRole('button', { name: '删除' }));
}

describe('B6 M-A5 T2：画布 part 删除接线（deleteFeature + sourceFeatureId）', () => {
  it('part 选择（命中 active authored body）→ applyOp 精确载荷（featureId=source，targetBodyId=bodyKey）+ 成功 toast', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderCanvas(applyOp, { bodies: CANVAS_BODIES });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x15', label: 'Base' }]);
    });
    await confirmCanvasDelete(user, 'Base');
    await waitFor(() =>
      expect(applyOp).toHaveBeenCalledWith({
        kind: 'deleteFeature',
        featureId: 'ex1',
        targetBodyId: '0x15',
      }),
    );
    // 成功 toast（树删除同口径）+ 选择集清空（既有 HITL 语义）。
    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalled());
    const details = mocks.outputMessage.mock.calls.at(-1)?.[0] as { priority: number; briefMessage: string };
    expect(details.priority).toBe(1); // OutputMessagePriority.Success
    expect(details.briefMessage).toBe('已删除 Base');
    expect(usePartStudioStore.getState().canvas.selection).toHaveLength(0);
  });

  it('无 sourceFeatureId → Error toast「实体无驱动源，无法删除」，不发 op', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderCanvas(applyOp, { bodies: CANVAS_BODIES });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x20', label: 'NoSource' }]);
    });
    await confirmCanvasDelete(user, 'NoSource');
    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalledTimes(1));
    const details = mocks.outputMessage.mock.calls[0]?.[0] as { priority: number; briefMessage: string };
    expect(details.priority).toBe(10); // OutputMessagePriority.Error
    expect(details.briefMessage).toBe('实体无驱动源，无法删除');
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('失败结果 → Error toast 含 result.error（不乐观改树）；异常 → Error toast 含异常消息', async () => {
    const user = userEvent.setup();
    const applyOp = vi
      .fn<(op: FeatureOp) => Promise<FeatureOpResult>>()
      .mockResolvedValueOnce({ ok: false, error: 'feature not found' })
      .mockRejectedValueOnce(new Error('rpc boom'));
    renderCanvas(applyOp, { bodies: CANVAS_BODIES });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x15', label: 'Base' }]);
    });
    await confirmCanvasDelete(user, 'Base');
    await waitFor(() =>
      expect((mocks.outputMessage.mock.calls.at(-1)?.[0] as { briefMessage: string }).briefMessage).toContain(
        'feature not found',
      ),
    );
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x15', label: 'Base' }]);
    });
    await confirmCanvasDelete(user, 'Base');
    await waitFor(() =>
      expect((mocks.outputMessage.mock.calls.at(-1)?.[0] as { briefMessage: string }).briefMessage).toContain(
        'rpc boom',
      ),
    );
  });

  it('非 part 选择项（edge）删除项禁用，不进入 body 删除（无 HITL/op/toast）', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderCanvas(applyOp, { bodies: CANVAS_BODIES });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([
        { kind: 'edge', id: 'e1', label: '边 1', ownerBodyKey: '0x15' },
      ]);
    });
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), { clientX: 40, clientY: 50 });
    const del = screen.getByRole('menuitem', { name: '删除' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    await user.click(del);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(applyOp).not.toHaveBeenCalled();
    expect(mocks.outputMessage).not.toHaveBeenCalled();
  });

  it('part 选择未命中 active authored body（inactive/未知 id）→ Error toast「实体已不可用，无法删除」，不发 op', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderCanvas(applyOp, { bodies: CANVAS_BODIES });
    // inactive 的 Consumed（0x22）：选择桥残留的陈旧 id——不猜测，但也不静默。
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x22', label: 'Consumed' }]);
    });
    await confirmCanvasDelete(user, 'Consumed');
    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalledTimes(1));
    const details = mocks.outputMessage.mock.calls[0]?.[0] as { priority: number; briefMessage: string };
    expect(details.priority).toBe(10); // OutputMessagePriority.Error
    expect(details.briefMessage).toBe('实体已不可用，无法删除');
    expect(applyOp).not.toHaveBeenCalled();
    // 未知 id 同面拒收（同一选择桥残留语义）。
    mocks.outputMessage.mockClear();
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0xdead', label: 'Ghost' }]);
    });
    await confirmCanvasDelete(user, 'Ghost');
    await waitFor(() =>
      expect((mocks.outputMessage.mock.calls.at(-1)?.[0] as { briefMessage: string }).briefMessage).toBe(
        '实体已不可用，无法删除',
      ),
    );
    expect(applyOp).not.toHaveBeenCalled();
  });

  it('canEdit=false：删除项 disabled + title，点击不打开 HITL；applyOp 未发起', async () => {
    const user = userEvent.setup();
    const applyOp = vi.fn(async (_op: FeatureOp): Promise<FeatureOpResult> => ({ ok: true }));
    renderCanvas(applyOp, { bodies: CANVAS_BODIES, canEdit: false });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([{ kind: 'part', id: '0x15', label: 'Base' }]);
    });
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), { clientX: 40, clientY: 50 });
    const del = screen.getByRole('menuitem', { name: '删除 Base' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.getAttribute('title')).toBe('当前为只读权限，无法删除');
    await user.click(del);
    expect(screen.queryByRole('dialog', { name: '删除 Base' })).toBeNull();
    expect(applyOp).not.toHaveBeenCalled();
  });
});

describe('B6 M-A5.2 T5：选中所属实体宿主动作', () => {
  it('选中所属实体 → 清空 Onshape 选择 + 树选中 + SelectionSet.replace(owner)', async () => {
    const user = userEvent.setup();
    const selectionSet = { replace: vi.fn() };
    renderCanvas(undefined, {
      connection: { key: 'k', selectionSet } as unknown as BriefcaseConnection,
    });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([
        { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18' },
      ]);
    });
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), {
      clientX: 60, clientY: 70,
    });
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    await user.click(within(menu).getByRole('menuitem', { name: '选中所属实体' }));

    expect(clearOnshapeHighlightMock).toHaveBeenCalledTimes(1);
    expect(usePartStudioStore.getState().tree.selectedNodeIds).toEqual(['0x18']);
    expect(selectionSet.replace).toHaveBeenCalledWith(['0x18']);
  });
});

describe('B6 M-A5.2：面/边删除宿主动作', () => {
  it('cacheId 选择 → HITL 确认 → deleteSelectedSubEntity + 清空选择 + 成功 toast', async () => {
    const user = userEvent.setup();
    const connection = { key: 'k' } as unknown as BriefcaseConnection;
    renderCanvas(undefined, { connection });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([
        { kind: 'face', id: 'face:1:3', label: '面', ownerBodyKey: '0x18', cacheId: 7 },
      ]);
    });
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), {
      clientX: 60, clientY: 70,
    });
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    await user.click(within(menu).getByRole('menuitem', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除 面' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(subEntityDeleteMock).toHaveBeenCalledWith(connection, expect.any(Array)));
    await waitFor(() => expect(clearOnshapeSelectionMock).toHaveBeenCalledTimes(1));
    expect(mocks.outputMessage).toHaveBeenCalledWith(
      expect.objectContaining({ briefMessage: '面/边已删除' }),
    );
  });

  it('删除失败 → Error toast，保持选择（可重拾），不清空 Onshape 选择', async () => {
    subEntityDeleteMock.mockRejectedValueOnce(new Error('内核拒收'));
    const user = userEvent.setup();
    renderCanvas(undefined, { connection: { key: 'k' } as unknown as BriefcaseConnection });
    act(() => {
      usePartStudioStore.getState().setCanvasSelection([
        { kind: 'edge', id: 'edge:2:5', label: '边', ownerBodyKey: '0x18', cacheId: 9 },
      ]);
    });
    fireEvent.contextMenu(screen.getByTestId('part-studio-canvas'), {
      clientX: 60, clientY: 70,
    });
    const menu = screen.getByRole('menu', { name: '画布菜单' });
    await user.click(within(menu).getByRole('menuitem', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除 边' });
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mocks.outputMessage).toHaveBeenCalledWith(
      expect.objectContaining({ briefMessage: expect.stringContaining('内核拒收') }),
    ));
    expect(clearOnshapeSelectionMock).not.toHaveBeenCalled();
  });
});
