// project-extents-decoration（M4 Task 2，D4 必办挂账）：项目范围线框盒
// 装饰件移植验收——toggle 开关状态机 + decorate 绘制行为 + toolId 钉死（Agent
// 复用规约：同 toolId 禁第二套，类名/toolId 与旧应用一致）。
// mock 口径：@itwin/core-frontend 模块级 mock（viewManager.addDecorator 可观测、
// GraphicType 常量、Tool 基类桩）；core-common 取真实模块（ColorDef 对比度/透明度
// 语义真实参与）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AxisAlignedBox3d, ColorDef } from '@itwin/core-common';
import type { DecorateContext, IModelConnection } from '@itwin/core-frontend';

const { addDecoratorMock, removeListenerMock } = vi.hoisted(() => {
  const removeListener = vi.fn();
  return { addDecoratorMock: vi.fn((_decorator: unknown) => removeListener), removeListenerMock: removeListener };
});

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { viewManager: { addDecorator: addDecoratorMock } },
  GraphicType: { WorldDecoration: 1, WorldOverlay: 2 },
  Tool: class {},
}));

import {
  ProjectExtentsDecoration,
  toggleProjectExtents,
  ToggleProjectExtentsTool,
} from '../decorations/project-extents-decoration.js';

const EXTENTS = { low: { x: -1, y: -2, z: -3 }, high: { x: 1, y: 2, z: 3 } } as unknown as AxisAlignedBox3d;

function makeFakeConnection(): IModelConnection {
  return { projectExtents: EXTENTS } as unknown as IModelConnection;
}

/** 构造假 DecorateContext：两个 graphic builder（WorldDecoration/WorldOverlay 各一）。 */
function makeContext(isSpatial: boolean) {
  const makeBuilder = () => ({ setSymbology: vi.fn(), addRangeBox: vi.fn() });
  const builders = [makeBuilder(), makeBuilder()];
  const createGraphicBuilder = vi.fn().mockReturnValueOnce(builders[0]).mockReturnValueOnce(builders[1]);
  const context = {
    viewport: { view: { isSpatialView: () => isSpatial, backgroundColor: ColorDef.black } },
    createGraphicBuilder,
    addDecorationFromBuilder: vi.fn(),
  };
  return { context: context as unknown as DecorateContext, builders, createGraphicBuilder };
}

/** 取当前注册的装饰件实例（经 addDecorator 捕获）。 */
function activeDecorator(): ProjectExtentsDecoration {
  return addDecoratorMock.mock.calls[0][0] as ProjectExtentsDecoration;
}

const CONNECTION = makeFakeConnection();

beforeEach(() => {
  vi.clearAllMocks();
  addDecoratorMock.mockReturnValue(removeListenerMock);
});

// 用例间复位模块级单例（防开关状态渗漏）
afterEach(() => {
  toggleProjectExtents(CONNECTION, false);
});

describe('toggleProjectExtents 开关状态机', () => {
  it('on → 装饰件注册（addDecorator 恰一次）、isActive=true、返回 true', () => {
    expect(toggleProjectExtents(CONNECTION, true)).toBe(true);
    expect(ProjectExtentsDecoration.isActive).toBe(true);
    expect(addDecoratorMock).toHaveBeenCalledTimes(1);
    expect(activeDecorator()).toBeInstanceOf(ProjectExtentsDecoration);
  });

  it('重复 on → 幂等（不重复注册）', () => {
    toggleProjectExtents(CONNECTION, true);
    expect(toggleProjectExtents(CONNECTION, true)).toBe(true);
    expect(addDecoratorMock).toHaveBeenCalledTimes(1);
  });

  it('off → 移除监听（构造返回的 remove 函数被调）、isActive=false、返回 false', () => {
    toggleProjectExtents(CONNECTION, true);
    expect(toggleProjectExtents(CONNECTION, false)).toBe(false);
    expect(ProjectExtentsDecoration.isActive).toBe(false);
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
    // off 再 off → 安全幂等（仍 false）
    expect(toggleProjectExtents(CONNECTION, false)).toBe(false);
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
  });

  it('enabled 缺省 → 翻转当前状态', () => {
    expect(toggleProjectExtents(CONNECTION)).toBe(true);
    expect(toggleProjectExtents(CONNECTION)).toBe(false);
    expect(ProjectExtentsDecoration.isActive).toBe(false);
  });

  it('装饰件持有打开连接的 projectExtents', () => {
    toggleProjectExtents(CONNECTION, true);
    expect((activeDecorator() as unknown as { _extents: unknown })._extents).toBe(EXTENTS);
  });
});

describe('ProjectExtentsDecoration.decorate 绘制行为', () => {
  it('空间视图：WorldDecoration + WorldOverlay 两个 range box（对比度取白）', () => {
    toggleProjectExtents(CONNECTION, true);
    const decorator = activeDecorator();
    const { context, builders, createGraphicBuilder } = makeContext(true);

    decorator.decorate(context);

    expect(createGraphicBuilder).toHaveBeenCalledTimes(2);
    expect(createGraphicBuilder).toHaveBeenNthCalledWith(1, 1); // GraphicType.WorldDecoration
    expect(createGraphicBuilder).toHaveBeenNthCalledWith(2, 2); // GraphicType.WorldOverlay
    for (const builder of builders) {
      expect(builder.addRangeBox).toHaveBeenCalledWith(EXTENTS);
      expect(builder.setSymbology).toHaveBeenCalledTimes(1);
    }
    // 可见线 = 背景对比度取白；隐藏线 = 同色 100 透明度
    const visSymbology = builders[0].setSymbology.mock.calls[0] as unknown[];
    const hidSymbology = builders[1].setSymbology.mock.calls[0] as unknown[];
    const contrastWhite = ColorDef.white.adjustedForContrast(ColorDef.black);
    expect((visSymbology[0] as ColorDef).tbgr).toBe(contrastWhite.tbgr);
    expect((hidSymbology[0] as ColorDef).tbgr).toBe(contrastWhite.withAlpha(100).tbgr);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.addDecorationFromBuilder).toHaveBeenCalledTimes(2);
  });

  it('非空间视图：不建 builder、不投装饰', () => {
    toggleProjectExtents(CONNECTION, true);
    const decorator = activeDecorator();
    const { context, createGraphicBuilder } = makeContext(false);

    decorator.decorate(context);

    expect(createGraphicBuilder).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.addDecorationFromBuilder).not.toHaveBeenCalled();
  });
});

describe('ToggleProjectExtentsTool（Agent 复用口径钉死）', () => {
  it('toolId/命名空间与旧应用一致', () => {
    expect(ToggleProjectExtentsTool.toolId).toBe('ToggleProjectExtents');
    expect(ToggleProjectExtentsTool.namespace).toBe('LubanCad');
    expect(ToggleProjectExtentsTool.minArgs).toBe(0);
    expect(ToggleProjectExtentsTool.maxArgs).toBe(0);
  });
});
