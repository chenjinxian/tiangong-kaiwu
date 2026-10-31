/*---------------------------------------------------------------------------------------------
* Copyright (c) LubanCAD. All rights reserved.
* Licensed under the MIT License.
*
* P2.6d / review C6：全局 Delete 对 authored LubanCAD.BodySolid 的守卫。
* - isAuthoredBodyProps 纯函数真值表（类名/marker/authored:false/缺 marker/字符串形态）；
* - DeleteElementsTool.processAgendaImmediate：body 选择 → warning、零 EditCommand/事务；
*   非 body/显式 orphan body → 原删除链（startCommand + deleteElements + saveChanges）；
* - getProps 必须收到解压后的 Id64Arg（压缩集合不能直接当 Id64Arg）。
* mock 口径：core-frontend 基类/通知面、EditTool(basicManipulationIpc) 模块级 mock；
* core-bentley 取真实枚举/压缩实现。
*--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompressedId64Set, IModelStatus } from '@itwin/core-bentley';
import {
  AUTHORED_BODY_DELETE_BLOCKED_MESSAGE,
  DeleteElementsTool,
  isAuthoredBodyProps,
} from '../DeleteElementsTool';

const mocks = vi.hoisted(() => ({
  outputMessage: vi.fn(),
  startCommand: vi.fn(),
  deleteElements: vi.fn(),
  saveChanges: vi.fn(),
  getProps: vi.fn(),
}));

vi.mock('@itwin/core-frontend', () => ({
  ElementSetTool: class {
    public agenda = { compressIds: () => '' };
    public iModel = { key: 'imodel-key', elements: { getProps: mocks.getProps } };
    public async saveChanges(): Promise<void> {
      mocks.saveChanges();
    }
  },
  IModelApp: { notifications: { outputMessage: mocks.outputMessage } },
  NotifyMessageDetails: class {
    public constructor(
      public readonly priority: number,
      public readonly briefMessage: string,
    ) {}
  },
  OutputMessagePriority: { Error: 3, Warning: 2, Info: 1, Success: 0 },
}));

vi.mock('../EditTool', () => ({
  EditTools: { startCommand: mocks.startCommand },
}));

vi.mock('../EditToolIpc', () => ({
  basicManipulationIpc: { deleteElements: mocks.deleteElements },
}));

const bodyProps = (id: string, marker: unknown = { authored: true, state: 'active' }): {
  id: string;
  classFullName: string;
  jsonProperties: any;
} => ({
  id,
  classFullName: 'LubanCAD:BodySolid',
  jsonProperties: { luban: { body: marker } },
});

const nonBodyProps = (id: string): {
  id: string;
  classFullName: string;
  jsonProperties: any;
} => ({
  id,
  classFullName: 'Generic:PhysicalObject',
  jsonProperties: undefined,
});

/** 造工具实例并注入 agenda/iModel 面（mock 基类字段可写）。 */
function makeTool(ids: string[], props: unknown[]): DeleteElementsTool {
  mocks.getProps.mockResolvedValue(props);
  const tool = new DeleteElementsTool();
  const anyTool = tool as unknown as {
    agenda: { compressIds: () => string };
    iModel: { key: string; elements: { getProps: typeof mocks.getProps } };
  };
  anyTool.agenda = { compressIds: () => CompressedId64Set.compressArray(ids) };
  anyTool.iModel = { key: 'imodel-key', elements: { getProps: mocks.getProps } };
  return tool;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProps.mockResolvedValue([]);
  mocks.deleteElements.mockResolvedValue(IModelStatus.Success);
});

describe('isAuthoredBodyProps（P2.6d/C6）', () => {
  it('authored:true（对象/字符串 jsonProperties）→ true', () => {
    expect(isAuthoredBodyProps(bodyProps('0x1'))).toBe(true);
    expect(isAuthoredBodyProps({
      classFullName: 'LubanCAD:BodySolid',
      jsonProperties: JSON.stringify({ luban: { body: { authored: true } } }),
    })).toBe(true);
  });

  it('缺 marker → true（保守：旧库 body 由后端 heuristic 认 authored）', () => {
    expect(isAuthoredBodyProps({
      classFullName: 'LubanCAD:BodySolid',
      jsonProperties: {},
    })).toBe(true);
    expect(isAuthoredBodyProps({
      classFullName: 'LubanCAD:BodySolid',
      jsonProperties: 'not-json',
    })).toBe(true);
  });

  it('显式 authored:false（直改 orphan）→ false；非 BodySolid → false', () => {
    expect(isAuthoredBodyProps(bodyProps('0x2', { authored: false }))).toBe(false);
    expect(isAuthoredBodyProps(nonBodyProps('0x3'))).toBe(false);
    expect(isAuthoredBodyProps({
      classFullName: 'LubanCAD:Sketch',
      jsonProperties: undefined,
    })).toBe(false);
  });
});

describe('DeleteElementsTool — authored body 守卫', () => {
  it('body 选择：warning + 零 EditCommand/deleteElements/saveChanges；getProps 收解压 ids', async () => {
    const ids = ['0x1', '0x2'];
    const tool = makeTool(ids, [bodyProps('0x1')]);

    await tool.processAgendaImmediate();

    expect(mocks.getProps).toHaveBeenCalledWith(['0x1', '0x2']);
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
    const details = mocks.outputMessage.mock.calls[0][0] as {
      priority: number;
      briefMessage: string;
    };
    expect(details.priority).toBe(2); // OutputMessagePriority.Warning
    expect(details.briefMessage).toBe(AUTHORED_BODY_DELETE_BLOCKED_MESSAGE);
    expect(details.briefMessage).toContain('实体由特征树管理');
    expect(details.briefMessage).toContain('bodies are managed by the feature tree');
    expect(mocks.startCommand).not.toHaveBeenCalled();
    expect(mocks.deleteElements).not.toHaveBeenCalled();
    expect(mocks.saveChanges).not.toHaveBeenCalled();
  });

  it('混合选择（body + 普通元素）：整体拒删（不触碰任何元素）', async () => {
    const tool = makeTool(['0x1', '0x3'], [bodyProps('0x1'), nonBodyProps('0x3')]);

    await tool.processAgendaImmediate();

    expect(mocks.startCommand).not.toHaveBeenCalled();
    expect(mocks.deleteElements).not.toHaveBeenCalled();
    expect(mocks.outputMessage).toHaveBeenCalledTimes(1);
  });

  it('非 body 选择：原删除链照旧（startCommand + deleteElements + saveChanges）', async () => {
    const ids = ['0x3', '0x4'];
    const tool = makeTool(ids, [nonBodyProps('0x3'), nonBodyProps('0x4')]);

    await tool.processAgendaImmediate();

    expect(mocks.startCommand).toHaveBeenCalledTimes(1);
    expect(mocks.startCommand.mock.calls[0][0]).toMatchObject({
      commandId: 'basicManipulation',
      iModelKey: 'imodel-key',
    });
    expect(mocks.deleteElements).toHaveBeenCalledWith(
      CompressedId64Set.compressArray(ids),
    );
    expect(mocks.saveChanges).toHaveBeenCalledTimes(1);
    expect(mocks.outputMessage).not.toHaveBeenCalled();
  });

  it('显式 authored:false 的 orphan BodySolid：允许直删（非生命周期 body）', async () => {
    const tool = makeTool(['0x5'], [bodyProps('0x5', { authored: false })]);

    await tool.processAgendaImmediate();

    expect(mocks.startCommand).toHaveBeenCalledTimes(1);
    expect(mocks.deleteElements).toHaveBeenCalledTimes(1);
    expect(mocks.saveChanges).toHaveBeenCalledTimes(1);
  });

  it('空选择：不取 props、不进守卫分支（原删除链不回归）', async () => {
    const tool = makeTool([], []);

    await tool.processAgendaImmediate();

    expect(mocks.getProps).not.toHaveBeenCalled();
    expect(mocks.startCommand).toHaveBeenCalledTimes(1);
    expect(mocks.deleteElements).toHaveBeenCalledTimes(1);
  });
});
