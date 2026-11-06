/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * BRep 拓扑读面（2026-11-03）：把 active authored body 的全部拓扑边/顶点
 * 读成显示层数据。数据源是 editor 的 SolidModeling 命令（与拾取工具同一
 * 几何缓存通道，不新增第二套建模 API）：
 *   startCommand(solidModeling) → createElementGeometryCache(body)
 *   → getBodySubEntities(Edge/Vertex) → getSubEntityGeometry(精确曲线/顶点范围)
 *
 * 失败语义：
 * - 命令无法启动（另一位编辑命令占用）→ undefined，调用方保留上一份拓扑
 *   （不闪空、不报错）；
 * - 单个 body/边失败 → 跳过该条，其余照常显示（诚实降级）；
 * - 无 active authored body → 空拓扑，不启动命令。
 *
 * 读面会**先清空几何缓存再重建**：SolidModeling 的 FindOrAddElement 是粘性的，
 * 新建/更新 body 若在几何落定前被读过一次会留下空缓存，后续 create 不再重灌
 * （真栈 e2e：新拉伸永久 0 边）。因此调用方只在无草图/对话框/子实体拾取工具的
 * 状态刷新，避免清掉进行中的拾取缓存；读完整理命令槽（finishCommand）。
 */
import { ElementGeometry, type ElementGeometryDataEntry } from '@itwin/core-common';
import { editorBuiltInCmdIds, SubEntityType } from '@itwin/editor-common';
import type { SubEntityGeometryProps, SubEntityProps } from '@itwin/editor-common';
import { Arc3d, CurveOps, LineSegment3d, Loop, ParityRegion, Range3d, type Range3dProps } from '@itwin/core-geometry';
import { EditTools, solidModelingIpc } from '@itwin/editor-frontend';
import type { BodyInfo } from '@luban-cad/shared';
import type {
  BrepTopology,
  BrepTopologyEdge,
  BrepTopologyVertex,
} from '@luban-cad/viewer';

/** BRep 拓扑读面的最小可替换数据源（测试注入用；生产实现见 editorSource）。 */
export interface BrepTopologySource {
  startCommand(iModelKey: string): Promise<unknown>;
  /** 结束本次只读命令，避免 edit command 常驻（工具活动时调用方应先禁用读面）。 */
  finishCommand(): Promise<unknown>;
  /** 丢弃粘性几何缓存，确保读到当前元素几何（工具活动时调用方须先禁用读面）。 */
  clearCache(): Promise<void>;
  createCache(bodyKey: string): Promise<boolean>;
  getSubEntities(
    bodyKey: string,
    type: SubEntityType,
    firstOnly: boolean,
  ): Promise<SubEntityProps[] | undefined>;
  getGeometry(
    bodyKey: string,
    props: SubEntityProps,
    opts: { wantRange?: true; wantGeometry?: true },
  ): Promise<SubEntityGeometryProps | undefined>;
}

/** 读面并发上限：边几何按 IPC 请求批量取，避免大模型一次性打爆 WS。 */
const GEOMETRY_CONCURRENCY = 16;

/** 生产数据源：editor SolidModeling 命令（与 FilletEdgePickTool/ElementGeometryCacheTool 同通道）。 */
export const editorBrepTopologySource: BrepTopologySource = {
  startCommand: (iModelKey) => EditTools.startCommand<string>({
    commandId: editorBuiltInCmdIds.cmdSolidModeling,
    iModelKey,
  }),
  finishCommand: () => EditTools.finishCommand(),
  clearCache: () => solidModelingIpc.clearElementGeometryCache(),
  createCache: (bodyKey) => solidModelingIpc.createElementGeometryCache(bodyKey, {
    parts: true,
    curves: false,
    surfaces: true,
    solids: true,
    other: false,
  }),
  getSubEntities: (bodyKey, type, firstOnly) =>
    solidModelingIpc.getBodySubEntities(bodyKey, type, firstOnly),
  getGeometry: (bodyKey, props, opts) =>
    solidModelingIpc.getSubEntityGeometry(bodyKey, props, opts),
};

/** 有界并发 map（顺序保持；失败项以 undefined 回填，不中断整批）。 */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R | undefined>,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index]!, index);
      } catch {
        results[index] = undefined;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function isActiveAuthored(body: BodyInfo): boolean {
  return body.active !== false && body.authored !== false;
}

function vertexFromRange(range: Range3dProps | undefined): BrepTopologyVertex | undefined {
  if (!range)
    return undefined;
  const center = Range3d.fromJSON(range).center;
  return { x: center.x, y: center.y, z: center.z };
}

/**
 * 读取指定 iModel 中 active authored bodies 的完整 BRep 拓扑。
 * 返回 undefined = 命令无法启动（调用方保留旧数据）；否则返回（可能为空的）拓扑。
 */
export async function readBrepTopology(
  iModelKey: string,
  bodies: readonly BodyInfo[],
  source: BrepTopologySource = editorBrepTopologySource,
): Promise<BrepTopology | undefined> {
  const active = bodies.filter(isActiveAuthored);
  if (active.length === 0)
    return { edges: [], vertices: [] };

  try {
    await source.startCommand(iModelKey);
  } catch {
    return undefined;
  }

  try {
    // SolidModeling 的 FindOrAddElement 是粘性的：刚提交的 body 若在几何落定前
    // 被读过一次，会留下空缓存，后续 create 不会重灌（真栈 e2e 实测：新建拉伸
    // 永久 0 边）。读面必须先丢弃旧缓存；调用方已把读面限制在无拾取工具的状态。
    try {
      await source.clearCache();
    } catch {
      // 缓存清理失败不阻断读取（可能读到旧几何，但不会崩）
    }
    return await readActiveBodies(active, source);
  } finally {
    // 查询命令是一次性的：读面结束立即收口，避免 SolidModeling 命令常驻
    // 占用 editor 命令槽（真栈曾因页面反复打开留下常驻命令导致 MS 无响应）。
    try {
      await source.finishCommand();
    } catch {
      // 命令已经被其他工具收口：无需重复报错
    }
  }
}

async function readActiveBodies(
  active: readonly BodyInfo[],
  source: BrepTopologySource,
): Promise<BrepTopology> {
  const edges: BrepTopologyEdge[] = [];
  const vertices: BrepTopologyVertex[] = [];

  for (const body of active) {
    let created = false;
    try {
      created = await source.createCache(body.bodyKey);
    } catch {
      created = false;
    }
    if (!created)
      continue;

    let edgeProps: SubEntityProps[] = [];
    let vertexProps: SubEntityProps[] = [];
    try {
      [edgeProps, vertexProps] = await Promise.all([
        source.getSubEntities(body.bodyKey, SubEntityType.Edge, false).then((rows) => rows ?? []),
        source.getSubEntities(body.bodyKey, SubEntityType.Vertex, false).then((rows) => rows ?? []),
      ]);
    } catch {
      continue;
    }

    const edgeGeometries = await mapLimit(edgeProps, GEOMETRY_CONCURRENCY, (props) =>
      source.getGeometry(body.bodyKey, props, { wantRange: true, wantGeometry: true }));
    for (let i = 0; i < edgeGeometries.length; i++) {
      const geometry = edgeGeometries[i];
      if (!geometry?.geometry)
        continue;
      const props = edgeProps[i]!;
      edges.push({
        key: `${body.bodyKey}:${props.index ?? 0}:${props.id}`,
        entry: geometry.geometry as ElementGeometryDataEntry,
        ...(geometry.range ? { range: geometry.range } : {}),
      });
    }

    const vertexGeometries = await mapLimit(vertexProps, GEOMETRY_CONCURRENCY, (props) =>
      source.getGeometry(body.bodyKey, props, { wantRange: true }));
    for (const geometry of vertexGeometries) {
      const vertex = vertexFromRange(geometry?.range);
      if (vertex)
        vertices.push(vertex);
    }
  }

  return { edges, vertices };
}

/** 可序列化的边几何（E2E 选择器解析用；不进入产品事实源）。 */
export type BrepEdgeCurve =
  | { kind: 'line'; p0: [number, number, number]; p1: [number, number, number] }
  | {
    kind: 'arc';
    center: [number, number, number];
    radius: number;
    normal: [number, number, number];
    start: [number, number, number];
    end: [number, number, number];
    sweepRadians: number;
  }
  | { kind: 'other'; geometryType: string };

export interface BrepEdgeHandle {
  bodyKey: string;
  subEntityId: number;
  curve: BrepEdgeCurve;
}

function pointTuple(p: { x: number; y: number; z: number }): [number, number, number] {
  return [p.x, p.y, p.z];
}

function curveDescriptor(entry: ElementGeometryDataEntry): BrepEdgeCurve | undefined {
  let geometry: ReturnType<typeof ElementGeometry.toGeometryQuery>;
  try {
    geometry = ElementGeometry.toGeometryQuery(entry);
  } catch {
    return undefined;
  }
  if (!geometry) return undefined;
  if (geometry instanceof LineSegment3d) {
    return { kind: 'line', p0: pointTuple(geometry.point0Ref), p1: pointTuple(geometry.point1Ref) };
  }
  if (geometry instanceof Arc3d) {
    const start = geometry.startPoint();
    const end = geometry.endPoint();
    return {
      kind: 'arc',
      center: pointTuple(geometry.center),
      radius: geometry.vector0.magnitude(),
      normal: pointTuple(geometry.perpendicularVector),
      start: pointTuple(start),
      end: pointTuple(end),
      sweepRadians: geometry.sweep.sweepRadians,
    };
  }
  return { kind: 'other', geometryType: geometry.geometryCategory };
}

/**
 * 读 active authored body 的边几何 + 缓存子实体 id（E2E selector resolver 专用）。
 * 通道与 readBrepTopology 完全一致（SolidModeling 命令 + 几何缓存），但保留
 * `props.id` 供 `resolveEdgeRef` 把拾取 id 换成边自身持久 id。
 * 返回 undefined = 命令无法启动；空数组 = 无 active authored body。
 */
/** 可序列化的面边界环曲线（E2E face selector / faceExtrude 解析用；不进入产品事实源）。 */
export type BrepFaceLoopCurve =
  | { kind: 'line'; p0: [number, number, number]; p1: [number, number, number] }
  | {
    kind: 'arc';
    center: [number, number, number];
    radius: number;
    normal: [number, number, number];
    start: [number, number, number];
    end: [number, number, number];
    sweepRadians: number;
  }
  | { kind: 'other'; geometryType: string };

export interface BrepFaceHandle {
  bodyKey: string;
  subEntityId: number;
  range: { low: [number, number, number]; high: [number, number, number] };
  normal: [number, number, number];
  loops: BrepFaceLoopCurve[][];
}

function primitiveDescriptor(curve: unknown): BrepFaceLoopCurve | undefined {
  if (curve instanceof LineSegment3d)
    return { kind: 'line', p0: pointTuple(curve.point0Ref), p1: pointTuple(curve.point1Ref) };
  if (curve instanceof Arc3d) {
    const start = curve.startPoint();
    const end = curve.endPoint();
    return {
      kind: 'arc',
      center: pointTuple(curve.center),
      radius: curve.vector0.magnitude(),
      normal: pointTuple(curve.perpendicularVector),
      start: pointTuple(start),
      end: pointTuple(end),
      sweepRadians: curve.sweep.sweepRadians,
    };
  }
  const category = (curve as { geometryCategory?: string } | undefined)?.geometryCategory;
  return category ? { kind: 'other', geometryType: category } : undefined;
}

function loopDescriptors(loop: Loop): BrepFaceLoopCurve[] {
  return loop.children
    .map(primitiveDescriptor)
    .filter((curve): curve is BrepFaceLoopCurve => curve !== undefined);
}

/**
 * 读 active authored body 的面拓扑（dev-only 观测面）：缓存面子实体 id + 范围 + 平面法线 +
 * 边界环曲线。面几何条目经 `ElementGeometry.toGeometryQuery` 得到 Loop/ParityRegion
 * （spike 2026-11-06 实证；planar face 可经 CurveOps.isPlanar 取局部平面）。
 * 与 readBrepEdgeHandles 同通道；先查一次 Edge 再查 Face（原生缓存需先有子实体查询
 * 才会填充 Face 列表——Tutorial 2 探针实测，直接 Face 返回空）。
 */
export async function readBrepFaceHandles(
  iModelKey: string,
  bodies: readonly BodyInfo[],
  source: BrepTopologySource = editorBrepTopologySource,
): Promise<BrepFaceHandle[] | undefined> {
  const active = bodies.filter(isActiveAuthored);
  if (active.length === 0) return [];
  try {
    await source.startCommand(iModelKey);
  } catch {
    return undefined;
  }
  try {
    try {
      await source.clearCache();
    } catch {
      // 缓存清理失败不阻断。
    }
    const out: BrepFaceHandle[] = [];
    for (const body of active) {
      let created = false;
      try {
        created = await source.createCache(body.bodyKey);
      } catch {
        created = false;
      }
      if (!created) continue;
      try {
        await source.getSubEntities(body.bodyKey, SubEntityType.Edge, false);
      } catch {
        // 预热失败：Face 查询可能为空，按空集处理。
      }
      let faceProps: SubEntityProps[] = [];
      try {
        faceProps = (await source.getSubEntities(body.bodyKey, SubEntityType.Face, false)) ?? [];
      } catch {
        continue;
      }
      for (const props of faceProps) {
        const geometry = await source.getGeometry(body.bodyKey, props, { wantGeometry: true, wantRange: true });
        if (!geometry?.geometry || !geometry.range) continue;
        let query;
        try {
          query = ElementGeometry.toGeometryQuery(geometry.geometry as ElementGeometryDataEntry);
        } catch {
          continue;
        }
        if (!(query instanceof Loop) && !(query instanceof ParityRegion)) continue;
        const plane = CurveOps.isPlanar(query);
        if (!plane) continue;
        const range = Range3d.fromJSON(geometry.range);
        const loops = query instanceof Loop ? [loopDescriptors(query)] : query.children.map(loopDescriptors);
        out.push({
          bodyKey: body.bodyKey,
          subEntityId: Number(props.id),
          range: { low: pointTuple(range.low), high: pointTuple(range.high) },
          normal: pointTuple(plane.matrix.columnZ()),
          loops,
        });
      }
    }
    return out;
  } finally {
    try {
      await source.finishCommand();
    } catch {
      // 命令已被其他工具收口。
    }
  }
}

export async function readBrepEdgeHandles(
  iModelKey: string,
  bodies: readonly BodyInfo[],
  source: BrepTopologySource = editorBrepTopologySource,
): Promise<BrepEdgeHandle[] | undefined> {
  const active = bodies.filter(isActiveAuthored);
  if (active.length === 0) return [];
  try {
    await source.startCommand(iModelKey);
  } catch {
    return undefined;
  }
  try {
    try {
      await source.clearCache();
    } catch {
      // 缓存清理失败不阻断；下面仍按当前缓存读取。
    }
    const out: BrepEdgeHandle[] = [];
    for (const body of active) {
      let created = false;
      try {
        created = await source.createCache(body.bodyKey);
      } catch {
        created = false;
      }
      if (!created) continue;
      let edgeProps: SubEntityProps[] = [];
      try {
        edgeProps = (await source.getSubEntities(body.bodyKey, SubEntityType.Edge, false)) ?? [];
      } catch {
        continue;
      }
      const geometries = await mapLimit(edgeProps, GEOMETRY_CONCURRENCY, (props) =>
        source.getGeometry(body.bodyKey, props, { wantGeometry: true }));
      for (let i = 0; i < geometries.length; i++) {
        const geometry = geometries[i];
        if (!geometry?.geometry) continue;
        const curve = curveDescriptor(geometry.geometry as ElementGeometryDataEntry);
        if (!curve) continue;
        out.push({
          bodyKey: body.bodyKey,
          subEntityId: Number(edgeProps[i]!.id),
          curve,
        });
      }
    }
    return out;
  } finally {
    try {
      await source.finishCommand();
    } catch {
      // 命令已被其他工具收口。
    }
  }
}
