// PatternTools（web-next M4 Task 3 移植验收）——
//  1) ID 收集回归（RW2-T3 子集移植自旧应用 apps/web/features/modeling/
//     PatternTools.test.ts）：doTransformedCopy 必须把「每个副本」的新 id 全部
//     收进 newIds（旧实现循环外只收末个，replaceAgenda 漏选其余副本）；
//  2) brief 行为断言子集：requireAcceptForSelectionSetOperation=false、
//     wantDynamics=false、wantAdditionalInput/wantRepeatOperation=false、
//     onProcessComplete=exitTool 语义（选择集收齐即执行，一次性退出）。
// mock 口径照抄旧测试（basicManipulationIpc/EditTools/Placement 桩）。
// 2026-10-22 随 editor 模块收编迁入本包 src/luban/modeling/test/：原
// vi.mock('@itwin/editor-frontend') 单块拆为三处包内被依赖文件的路径 mock
// （vitest 以解析后绝对路径为键，与被测件 '../../EditTool' 形态的相对导入
// 解析到同一文件）。

import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const mocks = vi.hoisted(() => {
  const mockInsertGeometricElement = vi.fn();
  const mockStartCommand = vi.fn().mockResolvedValue(undefined);
  const mockSaveChanges = vi.fn().mockResolvedValue(undefined);
  const mockReplaceAgenda = vi.fn().mockResolvedValue(undefined);
  const mockExitTool = vi.fn().mockResolvedValue(undefined);
  return {
    mockInsertGeometricElement,
    mockStartCommand,
    mockSaveChanges,
    mockReplaceAgenda,
    mockExitTool,
  };
});

vi.mock('../../../EditTool', () => ({
  EditTools: { startCommand: mocks.mockStartCommand },
}));

vi.mock('../../../EditToolIpc', () => ({
  basicManipulationIpc: { insertGeometricElement: mocks.mockInsertGeometricElement },
}));

vi.mock('../../../TransformElementsTool', () => ({
  CopyElementsTool: class MockCopyElementsTool {
    public iModel: any;
    public agenda = { elements: [] as string[] };
    public async exitTool(): Promise<void> { return mocks.mockExitTool(); }
    public async saveChanges(): Promise<void> { return mocks.mockSaveChanges(); }
    public async replaceAgenda(ids: unknown): Promise<void> { return mocks.mockReplaceAgenda(ids); }
    public initializeToolSettingPropertyValues(props: unknown): void { void props; }
    public async onInstall(): Promise<boolean> { return true; }
  },
}));

vi.mock('@itwin/core-geometry', () => {
  const makeTransform = (): any => ({
    multiplyTransformTransform: () => makeTransform(),
    multiplyPoint3d: (p: any) => ({ x: p.x + 1, y: p.y + 1, z: p.z }),
  });
  return {
    Angle: {
      createDegrees: (deg: number) => ({ degrees: deg, radians: (deg * Math.PI) / 180 }),
      createRadians: (r: number) => ({ degrees: (r * 180) / Math.PI, radians: r }),
    },
    Matrix3d: { createRotationAroundVector: () => ({}) },
    Point2d: { create: (x: number, y: number) => ({ x, y }) },
    Point3d: {
      create: (x: number, y: number, z: number) => ({ x, y, z }),
      createFrom: (p: any) => ({ x: p.x, y: p.y, z: p.z }),
    },
    Transform: {
      createIdentity: () => ({}),
      createTranslationXYZ: (): any => makeTransform(),
      createRefs: (): any => makeTransform(),
      createTranslation: (): any => makeTransform(),
    },
    Vector3d: {
      create: (x: number, y: number, z: number) => ({
        x, y, z,
        normalizeInPlace() { return this; },
        scale(n: number) { return { x: this.x * n, y: this.y * n, z: this.z * n }; },
      }),
    },
    YawPitchRollAngles: { createFromMatrix3d: () => ({}) },
  };
});

vi.mock('@itwin/core-common', () => {
  class Placement3d {
    public isValid = true;
    public constructor(public origin: any, public angles: any, public bbox: any) {}
    public static fromJSON(json: any): Placement3d { return new Placement3d(json.origin, json.angles, json.bbox); }
  }
  class Placement2d {
    public isValid = true;
    public constructor(public origin: any, public angle: any, public bbox: any) {}
    public static fromJSON(json: any): Placement2d { return new Placement2d(json.origin, json.angle, json.bbox); }
  }
  return {
    Code: { createEmpty: () => ({}) },
    isPlacement2dProps: () => false, // 测试走 3d placement 路径
    Placement3d,
    Placement2d,
  };
});

vi.mock('@itwin/appui-abstract', () => {
  class DialogProperty<T> {
    public value: T;
    public constructor(private readonly desc: { name: string }, initial: T) { this.value = initial; }
    public get name(): string { return this.desc.name; }
    public toDialogItem(): unknown { return { value: this.value }; }
  }
  return {
    DialogProperty,
    PropertyDescriptionHelper: { buildNumberEditorDescription: (name: string) => ({ name }) },
    PropertyEditorParamTypes: { Range: 'Range' },
  };
});

import { CircularPatternTool, LinearPatternTool } from '../PatternTools';

/** 造一个挂好 mock iModel 的工具实例（loadProps 恒回 3d placement 元素 props）。 */
function makeTool(ToolClass: typeof LinearPatternTool | typeof CircularPatternTool): any {
  const tool = new (ToolClass as any)();
  tool.iModel = {
    key: 'test-imodel',
    elements: {
      loadProps: vi.fn().mockResolvedValue({
        classFullName: 'TestDomain:TestElement',
        model: '0x11',
        category: '0x21',
        placement: {
          origin: { x: 0, y: 0, z: 0, plus: (o: any) => ({ x: o.x, y: o.y, z: o.z }) },
          angles: { toMatrix3d: () => ({ multiplyMatrixMatrix: () => ({}) }) },
          bbox: {},
        },
        geom: [],
        userLabel: 'Part',
      }),
    },
  };
  return tool;
}

/** insertGeometricElement 依序回 0x101.. 递增 id。 */
function mockInserts(count: number): void {
  for (let i = 1; i <= count; i++) {
    const id = `0x${(0x100 + i).toString(16)}`;
    mocks.mockInsertGeometricElement.mockResolvedValueOnce(id);
  }
}

describe('LinearPatternTool — ID 收集（RW2-T3 回归子集）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('count=4 → 3 个副本的 id 全部入 newIds（非仅末个）', async () => {
    const tool = makeTool(LinearPatternTool);
    tool.setParameters(4, 10);
    mockInserts(3);

    const ids = await tool.doTransformedCopy(['0x1'], {}, 3);

    expect(mocks.mockInsertGeometricElement).toHaveBeenCalledTimes(3);
    expect(ids).toEqual(['0x101', '0x102', '0x103']);
  });

  it('多源元素：每源各自收齐全部副本 id', async () => {
    const tool = makeTool(LinearPatternTool);
    tool.setParameters(3, 10); // 每源 2 副本
    mockInserts(4);

    const ids = await tool.doTransformedCopy(['0x1', '0x2'], {}, 2);

    expect(mocks.mockInsertGeometricElement).toHaveBeenCalledTimes(4);
    expect(ids).toEqual(['0x101', '0x102', '0x103', '0x104']);
  });
});

describe('CircularPatternTool — ID 收集（RW2-T3 回归子集）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('count=5 → 4 个副本的 id 全部入 newIds（非仅末个）', async () => {
    const tool = makeTool(CircularPatternTool);
    tool.setParameters(5, 360);
    mockInserts(4);

    const ids = await tool.doTransformedCopy(['0x1'], {}, 4);

    expect(mocks.mockInsertGeometricElement).toHaveBeenCalledTimes(4);
    expect(ids).toEqual(['0x101', '0x102', '0x103', '0x104']);
  });
});

describe('PatternTools — brief 行为断言（选择集收齐即执行 + 一次性退出）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('toolId 与旧应用一致（Agent 复用规约：同 toolId 禁第二套）', () => {
    expect(LinearPatternTool.toolId).toBe('LinearPattern');
    expect(CircularPatternTool.toolId).toBe('CircularPattern');
  });

  it('requireAcceptForSelectionSetOperation=false（选择后立即执行，不等确认点击）', () => {
    const proto = LinearPatternTool.prototype as unknown as Record<string, unknown>;
    expect(proto.requireAcceptForSelectionSetOperation).toBe(false);
    const circularProto = CircularPatternTool.prototype as unknown as Record<string, unknown>;
    expect(circularProto.requireAcceptForSelectionSetOperation).toBe(false);
  });

  it('wantDynamics=false（无跟随光标动态）；wantAdditionalInput/wantRepeatOperation=false', () => {
    for (const ToolClass of [LinearPatternTool, CircularPatternTool]) {
      const proto = ToolClass.prototype as unknown as Record<string, unknown>;
      expect(proto.wantDynamics).toBe(false);
      expect(proto.wantAdditionalInput).toBe(false);
      expect(proto.wantRepeatOperation).toBe(false);
    }
  });

  it('processAgendaImmediate：doTransformedCopy → saveChanges → replaceAgenda → exitTool', async () => {
    const tool = makeTool(LinearPatternTool);
    tool.setParameters(3, 10);
    mockInserts(2);
    tool.agenda = { elements: ['0x1'] };

    await tool.processAgendaImmediate();

    expect(mocks.mockStartCommand).toHaveBeenCalledWith({ commandId: 'basicManipulation', iModelKey: 'test-imodel' });
    expect(mocks.mockSaveChanges).toHaveBeenCalledTimes(1);
    expect(mocks.mockReplaceAgenda).toHaveBeenCalledWith(['0x101', '0x102']);
    expect(mocks.mockExitTool).toHaveBeenCalledTimes(1);
  });

  it('onProcessComplete = exitTool（工具执行完成后自动退出，不重复）', async () => {
    const tool = makeTool(LinearPatternTool);
    await tool.onProcessComplete();
    expect(mocks.mockExitTool).toHaveBeenCalledTimes(1);
  });

  it('副本插入失败（insert 抛错）→ 返回 undefined，不 replaceAgenda', async () => {
    const tool = makeTool(LinearPatternTool);
    tool.setParameters(3, 10);
    mocks.mockInsertGeometricElement.mockRejectedValue(new Error('ipc down'));

    const ids = await tool.doTransformedCopy(['0x1'], {}, 2);

    expect(ids).toBeUndefined();
  });
});
