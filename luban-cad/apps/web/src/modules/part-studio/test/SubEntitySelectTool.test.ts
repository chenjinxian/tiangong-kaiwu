/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * B6 M-A5.2 T2：SubEntitySelectTool 单测——面/边拾取形态 + 持久 ref 换算管道。
 * 视口拾取链（boresite/高亮/ToolAdmin）依赖真实渲染面，归 T6 真栈；本文件
 * 用子类拓宽 protected 触达（FilletEdgePickTool.test 先例）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const featureRpc = vi.hoisted(() => ({
  resolveFaceRef: vi.fn(),
  resolveEdgeRef: vi.fn(),
}));

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: { getClient: () => featureRpc },
}));

import { EventHandled } from '@itwin/core-frontend';
import { SubEntityType } from '@itwin/editor-common';
import type { SubEntityLocationProps } from '@itwin/editor-common';
import { SubEntitySelectTool } from '../tools/modeling/SubEntitySelectTool.js';

const faceProps = { subEntity: { type: SubEntityType.Face, id: 7 } } as SubEntityLocationProps;
const edgeProps = { subEntity: { type: SubEntityType.Edge, id: 9 } } as SubEntityLocationProps;

class TestableTool extends SubEntitySelectTool {
  public removeSubEntityCalls = 0;
  public exitToolCalls = 0;

  public callAdd(id: string, props: SubEntityLocationProps) {
    return this.addSubEntity(id, props);
  }
  public callWant(type: SubEntityType) {
    return this.wantSubEntityType(type);
  }
  public callRequired() {
    return this.requiredSubEntityCount;
  }
  public callCacheFilter() {
    return this.geometryCacheFilter;
  }
  public callNotifyEnded() {
    return this.notifyEnded();
  }
  public callReset() {
    return this.onResetButtonUp({} as never);
  }
  protected override async removeSubEntity(id: string, props?: SubEntityLocationProps): Promise<void> {
    ++this.removeSubEntityCalls;
    return super.removeSubEntity(id, props);
  }
  public override async exitTool(): Promise<void> {
    ++this.exitToolCalls;
  }
}

function makeTool(kind: 'face' | 'edge') {
  const picked: unknown[] = [];
  const errors: string[] = [];
  let ended = 0;
  const tool = new TestableTool({
    kind,
    connectionKey: 'model-key',
    onPicked: (selection) => picked.push(selection),
    onError: (message) => errors.push(message),
    onEnded: () => {
      ended += 1;
    },
  });
  return { tool, picked, errors, getEnded: () => ended };
}

beforeEach(() => {
  featureRpc.resolveFaceRef.mockReset();
  featureRpc.resolveEdgeRef.mockReset();
});

describe('SubEntitySelectTool 拾取形态', () => {
  it('toolId/namespace；面只认 Face，边只认 Edge；多选累积', () => {
    const face = makeTool('face').tool;
    const edge = makeTool('edge').tool;

    expect(SubEntitySelectTool.toolId).toBe('LubanCAD.SelectSubEntity');
    expect(SubEntitySelectTool.namespace).toBe('LubanCad');
    expect(face.callWant(SubEntityType.Face)).toBe(true);
    expect(face.callWant(SubEntityType.Edge)).toBe(false);
    expect(edge.callWant(SubEntityType.Edge)).toBe(true);
    expect(face.callRequired()).toBe(Number.POSITIVE_INFINITY);
    expect(face.callCacheFilter()).toEqual({ parts: true, curves: false, surfaces: true, solids: true, other: false });
  });

  it('face resolve 成功 → owner/topology/stable id', async () => {
    featureRpc.resolveFaceRef.mockResolvedValue({ ok: true, ref: { nodeId: 1, entityId: 3 } });
    const { tool, picked } = makeTool('face');

    await tool.callAdd('0x15', faceProps);

    expect(featureRpc.resolveFaceRef).toHaveBeenCalledWith('model-key', '0x15', 7);
    expect(picked).toEqual([{
      kind: 'face', id: 'face:1:3', ownerBodyKey: '0x15',
      topologyId: { nodeId: 1, entityId: 3 }, label: expect.any(String),
    }]);
  });

  it('edge resolve 成功 → ref.edge 持久 id', async () => {
    featureRpc.resolveEdgeRef.mockResolvedValue({ ok: true, ref: { edge: { nodeId: 2, entityId: 5 } } });
    const { tool, picked } = makeTool('edge');

    await tool.callAdd('0x18', edgeProps);

    expect(featureRpc.resolveEdgeRef).toHaveBeenCalledWith('model-key', '0x18', 9);
    expect(picked).toEqual([{
      kind: 'edge', id: 'edge:2:5', ownerBodyKey: '0x18',
      topologyId: { nodeId: 2, entityId: 5 }, label: expect.any(String),
    }]);
  });

  it('resolve 失败 → onError + removeSubEntity；RPC 异常同面', async () => {
    featureRpc.resolveFaceRef.mockResolvedValue({ ok: false, error: 'bad face' });
    const { tool, picked, errors } = makeTool('face');

    await tool.callAdd('0x15', faceProps);

    expect(errors).toEqual(['bad face']);
    expect(tool.removeSubEntityCalls).toBe(1);
    expect(picked).toEqual([]);

    featureRpc.resolveFaceRef.mockRejectedValue(new Error('连接断开'));
    await tool.callAdd('0x15', faceProps);
    expect(errors).toEqual(['bad face', '连接断开']);
  });

  it('右键不退出（EventHandled.Yes）；notifyEnded 回调 onEnded', async () => {
    const { tool, getEnded } = makeTool('face');

    const handled = await tool.callReset();

    expect(handled).toBe(EventHandled.Yes);
    expect(tool.exitToolCalls).toBe(0);
    tool.callNotifyEnded();
    expect(getEnded()).toBe(1);
  });
});
