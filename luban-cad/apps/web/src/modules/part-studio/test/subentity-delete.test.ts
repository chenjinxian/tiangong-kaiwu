/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * B6 M-A5.2：面/边删除通道单测——同一 SolidModeling 命令内建缓存，
 * 持久拓扑 id 反查 cache id（facesFromId/edgesFromOwnId），再调
 * `deleteSubEntities` 并保存事务；不走 body 删除。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const editorMocks = vi.hoisted(() => ({
  startCommand: vi.fn(),
  createElementGeometryCache: vi.fn(),
  facesFromId: vi.fn(),
  edgesFromOwnId: vi.fn(),
  deleteSubEntities: vi.fn(),
}));

vi.mock('@itwin/editor-frontend', () => ({
  EditTools: { startCommand: editorMocks.startCommand },
  solidModelingIpc: {
    createElementGeometryCache: editorMocks.createElementGeometryCache,
    facesFromId: editorMocks.facesFromId,
    edgesFromOwnId: editorMocks.edgesFromOwnId,
    deleteSubEntities: editorMocks.deleteSubEntities,
  },
}));

import { editorBuiltInCmdIds, SubEntityType } from '@itwin/editor-common';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { deleteSelectedSubEntity } from '../canvas/subentity-delete.js';
import { registerBrepHoverController } from '../internal/brep-command-coordinator.js';
import type { CanvasSelection } from '../types.js';

function connection(): { key: string; saveChanges: ReturnType<typeof vi.fn> } {
  return { key: 'briefcase-key', saveChanges: vi.fn() };
}

beforeEach(() => {
  editorMocks.startCommand.mockReset().mockResolvedValue('cmd-1');
  editorMocks.createElementGeometryCache.mockReset().mockResolvedValue(true);
  editorMocks.facesFromId.mockReset().mockResolvedValue(['7']);
  editorMocks.edgesFromOwnId.mockReset().mockResolvedValue(['9']);
  editorMocks.deleteSubEntities.mockReset().mockResolvedValue({});
});

let unregisterHoverController: (() => void) | undefined;

afterEach(() => {
  unregisterHoverController?.();
  unregisterHoverController = undefined;
});

describe('deleteSelectedSubEntity', () => {
  it('face：建缓存 → facesFromId 反查（含分裂片）→ deleteSubEntities → saveChanges', async () => {
    editorMocks.facesFromId.mockResolvedValue(['7', '8']);
    const conn = connection();
    const selection: CanvasSelection[] = [
      { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18', topologyId: { nodeId: 1, entityId: 3 } },
    ];

    await deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, selection);

    expect(editorMocks.startCommand).toHaveBeenCalledWith({
      commandId: editorBuiltInCmdIds.cmdSolidModeling,
      iModelKey: 'briefcase-key',
    });
    expect(editorMocks.createElementGeometryCache).toHaveBeenCalledWith(
      '0x18',
      expect.objectContaining({ parts: true, surfaces: true, solids: true }),
    );
    expect(editorMocks.facesFromId).toHaveBeenCalledWith('0x18', 1, 3);
    expect(editorMocks.deleteSubEntities).toHaveBeenCalledWith(
      '0x18',
      {
        subEntities: [
          { id: 7, type: SubEntityType.Face },
          { id: 8, type: SubEntityType.Face },
        ],
      },
      expect.objectContaining({ writeChanges: true }),
    );
    expect(conn.saveChanges).toHaveBeenCalledTimes(1);
  });

  it('edge：edgesFromOwnId → type=Edge', async () => {
    const conn = connection();
    await deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'edge', id: 'edge:2:5', ownerBodyKey: '0x19', topologyId: { nodeId: 2, entityId: 5 } },
    ]);

    expect(editorMocks.edgesFromOwnId).toHaveBeenCalledWith('0x19', 2, 5);
    expect(editorMocks.deleteSubEntities).toHaveBeenCalledWith(
      '0x19',
      { subEntities: [{ id: 9, type: SubEntityType.Edge }] },
      expect.anything(),
    );
  });

  it('缺 topologyId / owner / 非 face-edge → 拒绝且不发起命令', async () => {
    const conn = connection();
    await expect(deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18' },
    ])).rejects.toThrow(/topologyId/);
    await expect(deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'edge', id: 'edge:2:5', topologyId: { nodeId: 1, entityId: 2 } },
    ])).rejects.toThrow(/ownerBodyKey/);
    await expect(deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'part', id: 'p1', ownerBodyKey: '0x18', topologyId: { nodeId: 1, entityId: 2 } },
    ])).rejects.toThrow(/face\/edge/);
    expect(editorMocks.startCommand).not.toHaveBeenCalled();
  });

  it('反查无 cache id → 抛错且不删除', async () => {
    editorMocks.facesFromId.mockResolvedValue([]);
    const conn = connection();
    await expect(deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18', topologyId: { nodeId: 1, entityId: 3 } },
    ])).rejects.toThrow(/反查面\/边/);
    expect(editorMocks.deleteSubEntities).not.toHaveBeenCalled();
  });

  it('IPC 返回 undefined → 抛错且不保存', async () => {
    editorMocks.deleteSubEntities.mockResolvedValue(undefined);
    const conn = connection();
    await expect(deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18', topologyId: { nodeId: 1, entityId: 3 } },
    ])).rejects.toThrow(/未返回几何结果/);
    expect(conn.saveChanges).not.toHaveBeenCalled();
  });

  it('注册 hover 控制器时：建缓存/反查/删除/保存全在 suspend 与 resume 之间', async () => {
    const events: string[] = [];
    unregisterHoverController = registerBrepHoverController({
      suspend: async () => { events.push('suspend'); },
      resume: () => { events.push('resume'); },
    });
    editorMocks.startCommand.mockImplementation(async () => { events.push('startCommand'); return 'cmd-1'; });
    editorMocks.createElementGeometryCache.mockImplementation(async () => { events.push('cache'); return true; });
    editorMocks.facesFromId.mockImplementation(async () => { events.push('facesFromId'); return ['7']; });
    editorMocks.deleteSubEntities.mockImplementation(async () => { events.push('delete'); return {}; });
    const conn = connection();
    conn.saveChanges.mockImplementation(async () => { events.push('saveChanges'); });

    await deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18', topologyId: { nodeId: 1, entityId: 3 } },
    ]);

    expect(events).toEqual([
      'suspend', 'startCommand', 'cache', 'facesFromId', 'delete', 'saveChanges', 'resume',
    ]);
  });

  it('注册 hover 控制器时：命令失败仍 resume（队列不悬挂）', async () => {
    const events: string[] = [];
    unregisterHoverController = registerBrepHoverController({
      suspend: async () => { events.push('suspend'); },
      resume: () => { events.push('resume'); },
    });
    editorMocks.deleteSubEntities.mockImplementation(async () => { events.push('delete'); return undefined; });
    const conn = connection();

    await expect(deleteSelectedSubEntity(conn as unknown as BriefcaseConnection, [
      { kind: 'face', id: 'face:1:3', ownerBodyKey: '0x18', topologyId: { nodeId: 1, entityId: 3 } },
    ])).rejects.toThrow(/未返回几何结果/);

    expect(events).toEqual(['suspend', 'delete', 'resume']);
    expect(conn.saveChanges).not.toHaveBeenCalled();
  });
});
