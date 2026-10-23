/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * M6-b T6：FilletEdgePickTool 单测——**换算管道与键控纯函数**（resolveEdgeRef
 * mock RPC 隔离 + filletEdgeRefKey 无关键 + 子实体过滤/缓存过滤形态 +
 * add/remove 回调映射）。
 *
 * 视口拾取链（boresite 命中/高亮图形/工具提示/右键退出经 ToolAdmin）依赖真实
 * ToolAdmin+briefcase 渲染面，jsdom 不可达——**归 T7 真栈冒烟**（诚实登记，
 * 同 SketchCreateTool.test 的状态机面口径）。工具类实例化不触 IModelApp
 *（LocateSubEntityTool 构造零副作用），测试经子类拓宽 protected 触达
 *（SketchCreateTool.test 先例）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// resolveEdgeRef RPC 替身（@luban-cad/shared 模块级 mock——工具仅消费
// LubanFeatureRpcInterface.getClient().resolveEdgeRef 一面）。
const featureRpc = vi.hoisted(() => ({
  resolveEdgeRef: vi.fn(),
}));

vi.mock('@luban-cad/shared', () => ({
  LubanFeatureRpcInterface: {
    getClient: () => featureRpc,
  },
}));

import { SubEntityType } from '@itwin/editor-common';
import type { SubEntityLocationProps } from '@itwin/editor-common';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { FilletEdgePickTool } from '../tools/modeling/FilletEdgePickTool.js';
import { filletEdgeRefKey } from '../tools/modeling/fillet-edge-ref.js';

/** 子类拓宽 protected 的测试触达口（TS 合法收窄面）。 */
class TestablePickTool extends FilletEdgePickTool {
  public callResolve(elementId: string, subEntityId: number) {
    return this.resolvePickedEdge(elementId, subEntityId);
  }
  public callAdd(id: string, props: SubEntityLocationProps) {
    return this.addSubEntity(id, props);
  }
  public callRemove(id: string, props?: SubEntityLocationProps) {
    return this.removeSubEntity(id, props);
  }
  public callRequiredSubEntityCount() {
    return this.requiredSubEntityCount;
  }
  public callWantSubEntityType(type: SubEntityType) {
    return this.wantSubEntityType(type);
  }
  public callGetSubEntityFilter() {
    return this.getSubEntityFilter();
  }
  public callGeometryCacheFilter() {
    return this.geometryCacheFilter;
  }
}

/** 拾取定位载荷替身（SubEntityProps.id=会话级 cache id）。 */
function edgePick(cacheId: number): SubEntityLocationProps {
  return { subEntity: { type: SubEntityType.Edge, id: cacheId } };
}

const REF_A: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 1, entityId: 3 } };
const REF_B: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 4 }, faceB: { nodeId: 1, entityId: 5 } };

interface CapturedCallbacks {
  added: FilletEdgeRef[];
  removed: FilletEdgeRef[];
  errors: string[];
  ended: number;
}

function makeTool(impl?: (elementId: string, subEntityId: number) => Promise<{ ok: boolean; ref?: FilletEdgeRef; error?: string }>): {
  tool: TestablePickTool;
  callbacks: CapturedCallbacks;
} {
  featureRpc.resolveEdgeRef.mockImplementation(
    async (elementId: string, subEntityId: number) => (impl ? impl(elementId, subEntityId) : { ok: true, ref: REF_A }),
  );
  const callbacks: CapturedCallbacks = { added: [], removed: [], errors: [], ended: 0 };
  const tool = new TestablePickTool({
    connectionKey: 'model-key',
    onEdgeAdded: (ref) => callbacks.added.push(ref),
    onEdgeRemoved: (ref) => callbacks.removed.push(ref),
    onError: (message) => callbacks.errors.push(message),
    onEnded: () => {
      callbacks.ended += 1;
    },
  });
  return { tool, callbacks };
}

beforeEach(() => {
  featureRpc.resolveEdgeRef.mockReset();
});

describe('M6-b T6：filletEdgeRefKey 无关键（面对序无关）', () => {
  it('面对序无关：{A,B} 与 {B,A} 同键（去重/反查共用）', () => {
    const straight: FilletEdgeRef = { faceA: { nodeId: 7, entityId: 1 }, faceB: { nodeId: 7, entityId: 2 } };
    const flipped: FilletEdgeRef = { faceA: { nodeId: 7, entityId: 2 }, faceB: { nodeId: 7, entityId: 1 } };
    expect(filletEdgeRefKey(straight)).toBe(filletEdgeRefKey(flipped));
  });

  it('不同边（共享一面的邻边）不同键', () => {
    const e1: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 1, entityId: 3 } };
    const e2: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 1, entityId: 9 } };
    expect(filletEdgeRefKey(e1)).not.toBe(filletEdgeRefKey(e2));
  });

  it('nodeId 参与键：同 entityId 异 body 不撞键', () => {
    const b1: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 1, entityId: 3 } };
    const b2: FilletEdgeRef = { faceA: { nodeId: 5, entityId: 2 }, faceB: { nodeId: 5, entityId: 3 } };
    expect(filletEdgeRefKey(b1)).not.toBe(filletEdgeRefKey(b2));
  });
});

describe('M6-b T6：拾取形态（BlendEdgesTool 同款过滤/多选累积）', () => {
  it('wantSubEntityType 只认 Edge；filter={laminarEdges,smoothEdges}；cacheFilter 体+曲面', () => {
    const { tool } = makeTool();
    expect(tool.callWantSubEntityType(SubEntityType.Edge)).toBe(true);
    expect(tool.callWantSubEntityType(SubEntityType.Face)).toBe(false);
    expect(tool.callWantSubEntityType(SubEntityType.Vertex)).toBe(false);
    expect(tool.callGetSubEntityFilter()).toEqual({ laminarEdges: true, smoothEdges: true });
    expect(tool.callGeometryCacheFilter()).toEqual({ parts: true, curves: false, surfaces: true, solids: true, other: false });
  });

  it('多选累积：requiredSubEntityCount=∞（结束权在右键/Esc/宿主 stop）', () => {
    const { tool } = makeTool();
    expect(tool.callRequiredSubEntityCount()).toBe(Number.POSITIVE_INFINITY);
  });

  it('toolId/namespace：Fillet.PickEdges @ LubanCad（直构通道仍带身份标识）', () => {
    expect(FilletEdgePickTool.toolId).toBe('Fillet.PickEdges');
    expect(FilletEdgePickTool.namespace).toBe('LubanCad');
  });
});

describe('M6-b T6：resolvePickedEdge 换算管道（mock RPC 隔离）', () => {
  it('ok 回包 → ref 透传（connectionKey/elementId/subEntityId 原样寻址）', async () => {
    const { tool, callbacks } = makeTool();
    featureRpc.resolveEdgeRef.mockResolvedValue({ ok: true, ref: REF_B });
    const ref = await tool.callResolve('0x1f', 5);
    expect(ref).toEqual(REF_B);
    expect(featureRpc.resolveEdgeRef).toHaveBeenCalledWith('model-key', '0x1f', 5);
    expect(callbacks.errors).toHaveLength(0);
  });

  it('ok:false 带后端 error → 原文回报 onError，返回 undefined（不静默）', async () => {
    const { tool, callbacks } = makeTool();
    featureRpc.resolveEdgeRef.mockResolvedValue({ ok: false, error: '边未命中任何邻面对' });
    expect(await tool.callResolve('0x1f', 5)).toBeUndefined();
    expect(callbacks.errors).toEqual(['边未命中任何邻面对']);
  });

  it('ok:false 无 error → 本地化兜底文案（词表 filletPick.resolveFailed）', async () => {
    const { tool, callbacks } = makeTool();
    featureRpc.resolveEdgeRef.mockResolvedValue({ ok: false });
    expect(await tool.callResolve('0x1f', 5)).toBeUndefined();
    expect(callbacks.errors).toHaveLength(1);
    expect(callbacks.errors[0]).not.toBe('');
  });

  it('RPC 异常（连接断开）→ 异常消息回报 onError，不逃逸', async () => {
    const { tool, callbacks } = makeTool();
    featureRpc.resolveEdgeRef.mockRejectedValue(new Error('连接断开'));
    expect(await tool.callResolve('0x1f', 5)).toBeUndefined();
    expect(callbacks.errors).toEqual(['连接断开']);
  });
});

describe('M6-b T6：add/remove 回调映射（cache id → ref 反查）', () => {
  it('拾得→onEdgeAdded；再点同边移除→onEdgeRemoved（同 ref 回传）', async () => {
    let call = 0;
    const { tool, callbacks } = makeTool(() => Promise.resolve({ ok: true, ref: call++ === 0 ? REF_A : REF_B }));
    await tool.callAdd('0x1f', edgePick(5));
    expect(callbacks.added).toEqual([REF_A]);
    expect(callbacks.removed).toHaveLength(0);
    await tool.callRemove('0x1f', edgePick(5));
    expect(callbacks.removed).toEqual([REF_A]);
  });

  it('换算失败：onError 回报且不 onEdgeAdded；随后移除（高亮回落）不误发 onEdgeRemoved', async () => {
    const { tool, callbacks } = makeTool(() => Promise.resolve({ ok: false, error: '解析失败' }));
    await tool.callAdd('0x1f', edgePick(5));
    expect(callbacks.errors).toEqual(['解析失败']);
    expect(callbacks.added).toHaveLength(0);
    // 失败回退路径经 removeSubEntity 摘高亮——映射无此键，回调静默。
    await tool.callRemove('0x1f', edgePick(5));
    expect(callbacks.removed).toHaveLength(0);
  });

  it('外来移除（未拾过的 cache id）→ 无回调', async () => {
    const { tool, callbacks } = makeTool();
    await tool.callAdd('0x1f', edgePick(5));
    callbacks.added.length = 0;
    await tool.callRemove('0x1f', edgePick(99));
    expect(callbacks.added).toHaveLength(0);
    expect(callbacks.removed).toHaveLength(0);
  });

  it('pop-last 变体（无 props）：回落最后一条已拾并回报 onEdgeRemoved', async () => {
    const { tool, callbacks } = makeTool(() => Promise.resolve({ ok: true, ref: REF_A }));
    await tool.callAdd('0x1f', edgePick(5));
    await tool.callAdd('0x1f', edgePick(6));
    expect(callbacks.added).toHaveLength(2);
    await tool.callRemove('0x1f'); // 基座 chooseNextHit 的 pop-last 形态
    expect(callbacks.removed).toEqual([REF_A]);
  });
});
