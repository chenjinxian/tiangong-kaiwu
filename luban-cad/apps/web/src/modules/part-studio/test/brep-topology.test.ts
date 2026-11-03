/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * BRep 拓扑读面（2026-11-03）：active/authored body 过滤、边/顶点几何收集、
 * 单条失败隔离、命令失败返回 undefined（调用方保留上一份显示）。
 */
import { describe, expect, it, vi } from 'vitest';
import type { ElementGeometryDataEntry } from '@itwin/core-common';
import { SubEntityType } from '@itwin/editor-common';
import type { BodyInfo } from '@luban-cad/shared';
import {
  readBrepTopology,
  type BrepTopologySource,
} from '../internal/brep-topology.js';

function body(bodyKey: string, active = true, authored = true): BodyInfo {
  return { bodyKey, active, authored };
}

function entry(): ElementGeometryDataEntry {
  return { opcode: 10, data: new Uint8Array([1, 2, 3]) } as unknown as ElementGeometryDataEntry;
}

function fakeSource(): BrepTopologySource & {
  startCommand: ReturnType<typeof vi.fn>;
  createCache: ReturnType<typeof vi.fn>;
  finishCommand: ReturnType<typeof vi.fn>;
  clearCache: ReturnType<typeof vi.fn>;
  getSubEntities: ReturnType<typeof vi.fn>;
  getGeometry: ReturnType<typeof vi.fn>;
} {
  const source = {
    startCommand: vi.fn(async () => 'solidModeling'),
    finishCommand: vi.fn(async () => 'solidModeling'),
    clearCache: vi.fn(async () => undefined),
    createCache: vi.fn(async (_bodyKey: string) => true),
    getSubEntities: vi.fn(async (_bodyKey: string, type: SubEntityType) => {
      if (type === SubEntityType.Edge)
        return [{ index: 0, type, id: 11 }, { index: 0, type, id: 12 }];
      if (type === SubEntityType.Vertex)
        return [{ index: 0, type, id: 21 }];
      return [];
    }),
    getGeometry: vi.fn(async (_bodyKey: string, props: { type: SubEntityType; id: number }) => {
      if (props.type === SubEntityType.Edge)
        return {
          geometry: entry(),
          range: { low: [0, 0, 0], high: [1, 1, 0] },
        };
      return {
        range: { low: [2, 3, 4], high: [2, 3, 4] },
      };
    }),
  };
  return source;
}

describe('readBrepTopology', () => {
  it('collects all edges/vertices of active authored bodies in one command', async () => {
    const source = fakeSource();
    const topology = await readBrepTopology('db-key', [
      body('body-1'),
      body('consumed', false),
      body('legacy', true, false),
    ], source);

    expect(source.startCommand).toHaveBeenCalledTimes(1);
    expect(source.startCommand).toHaveBeenCalledWith('db-key');
    expect(source.clearCache).toHaveBeenCalledTimes(1);
    expect(source.finishCommand).toHaveBeenCalledTimes(1);
    expect(source.createCache).toHaveBeenCalledTimes(1);
    expect(source.createCache).toHaveBeenCalledWith('body-1');

    expect(topology?.edges).toHaveLength(2);
    expect(topology?.edges[0]).toMatchObject({
      key: 'body-1:0:11',
      range: { low: [0, 0, 0], high: [1, 1, 0] },
    });
    expect(topology?.vertices).toEqual([{ x: 2, y: 3, z: 4 }]);
  });

  it('skips bodies whose cache cannot be created and edges whose geometry fails', async () => {
    const source = fakeSource();
    source.createCache.mockImplementation(async (bodyKey: string) => bodyKey !== 'bad-cache');
    source.getGeometry.mockImplementation(async (_bodyKey: string, props: { type: SubEntityType; id: number }) => {
      if (props.type === SubEntityType.Edge && props.id === 11)
        return undefined;
      if (props.type === SubEntityType.Edge)
        return { geometry: entry(), range: { low: [0, 0, 0], high: [1, 1, 0] } };
      return { range: { low: [1, 1, 1], high: [1, 1, 1] } };
    });

    const topology = await readBrepTopology('db-key', [body('bad-cache'), body('good')], source);
    expect(topology?.edges).toHaveLength(1);
    expect(topology?.edges.every((edge: { key: string }) => edge.key.startsWith('good:'))).toBe(true);
    expect(topology?.vertices).toHaveLength(1);
  });

  it('returns undefined when the edit command cannot start (keep previous display)', async () => {
    const source = fakeSource();
    source.startCommand.mockRejectedValue(new Error('command busy'));
    await expect(readBrepTopology('db-key', [body('body-1')], source)).resolves.toBeUndefined();
    expect(source.createCache).not.toHaveBeenCalled();
    expect(source.finishCommand).not.toHaveBeenCalled();
    expect(source.clearCache).not.toHaveBeenCalled();
  });

  it('returns empty topology for no active bodies without starting a command', async () => {
    const source = fakeSource();
    await expect(readBrepTopology('db-key', [body('consumed', false)], source))
      .resolves.toEqual({ edges: [], vertices: [] });
    expect(source.startCommand).not.toHaveBeenCalled();
  });
});
