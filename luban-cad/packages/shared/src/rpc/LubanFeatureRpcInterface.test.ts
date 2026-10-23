import { describe, expect, it, expectTypeOf } from "vitest";
import { LubanFeatureRpcInterface } from "./LubanFeatureRpcInterface.js";
import type {
  LubanFeatureType,
  ExtrudeParams,
  LubanTopologyId,
  FilletEdgeRef,
  FilletParams,
  ChamferParams,
  ShellParams,
  FeatureParams,
  FeatureOp,
  PreviewResult,
  FeatureFormField,
  FeatureFormFieldKind,
  FeatureFormModelEntry,
  FeatureFormModel,
  // M3-b v1.2
  SketchEntityDto,
  SketchConstraintDto,
  SketchSolveStatusDto,
  SketchSolveStateDto,
  SketchDto,
  SketchSummaryDto,
  // M6-a v1.6
  SketchRegionDto,
  SketchPlaneDto,
  // M6-b v1.7（T2）
  RevolveParams,
} from "./LubanFeatureRpcInterface.js";

describe("LubanFeatureRpcInterface", () => {
  it("接口名与版本固定（干净标识符：云端 RPC URL 按 - 与 / 切分，名字含 / - 无法寻址）", () => {
    expect(LubanFeatureRpcInterface.interfaceName).toBe("LubanFeatureRpcInterface");
    expect(LubanFeatureRpcInterface.interfaceVersion).toBe("1.7.0");
  });

  it("提供 getClient 静态入口（同 OpenCloudRpcInterface 模式）", () => {
    expect(typeof LubanFeatureRpcInterface.getClient).toBe("function");
  });
});

describe("M3-a v1.1 类型契约", () => {
  it("fillet 已入特征类型联合（编译期逐字断言）", () => {
    const t: LubanFeatureType = "fillet";
    expect(t).toBe("fillet");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell">();
  });

  it("FilletParams：邻面对边引用对（LubanTopologyId/FilletEdgeRef 形状）", () => {
    const faceA: LubanTopologyId = { nodeId: 1, entityId: 2 };
    const faceB: LubanTopologyId = { nodeId: 3, entityId: 4 };
    const ref: FilletEdgeRef = { faceA, faceB };
    const params: FilletParams = { radius: 2, propagateSmooth: true, edges: [ref] };
    expect(params.radius).toBe(2);
    expect(params.propagateSmooth).toBe(true);
    expect(params.edges).toEqual([{ faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 3, entityId: 4 } }]);
    expectTypeOf<FilletEdgeRef>().toEqualTypeOf<{ faceA: LubanTopologyId; faceB: LubanTopologyId }>();
    expectTypeOf<FilletParams>().toEqualTypeOf<{ radius: number; propagateSmooth: boolean; edges: FilletEdgeRef[] }>();
  });

  it("FeatureParams = ExtrudeParams | FilletParams | ChamferParams | ShellParams；新 FeatureOp 变体可构造", () => {
    expectTypeOf<FeatureParams>().toEqualTypeOf<ExtrudeParams | FilletParams | ChamferParams | ShellParams>();
    const insertFillet: FeatureOp = { kind: "insertFeature", featureType: "fillet", params: { radius: 1, propagateSmooth: false, edges: [] } };
    const insertChamfer: FeatureOp = { kind: "insertFeature", featureType: "chamfer", params: { mode: 1, propagateSmooth: true, edges: [], values1: 0.1 } };
    const insertShell: FeatureOp = { kind: "insertFeature", featureType: "shell", params: { defaultDistance: 0.1, faces: [{ nodeId: 1, entityId: 2 }], distances: 0 } };
    const suppress: FeatureOp = { kind: "setFeatureSuppressed", featureId: "f1", suppressed: true };
    const reorder: FeatureOp = { kind: "reorderFeature", featureId: "f1", to: 2 };
    expect(insertFillet.kind).toBe("insertFeature");
    expect(insertChamfer.kind).toBe("insertFeature");
    expect(insertShell.kind).toBe("insertFeature");
    expect(suppress.suppressed).toBe(true);
    expect(reorder.to).toBe(2);
  });

  it("PreviewResult / FeatureFormModel 形状", () => {
    const preview: PreviewResult = { ok: false, error: "bad edges", affected: [{ featureId: "f1", status: 3 }] };
    const field: FeatureFormField = { name: "radius", label: "半径", kind: "edgeRefs", readOnly: true };
    const faceField: FeatureFormField = { name: "faces", label: "面引用", kind: "faceRefs" };
    const model: FeatureFormModel = { fillet: { fields: [field] }, shell: { fields: [faceField] } };
    expect(preview.ok).toBe(false);
    expect(preview.affected[0]?.status).toBe(3);
    expect(model.fillet?.fields[0]?.kind).toBe("edgeRefs");
    expect(model.shell?.fields[0]?.kind).toBe("faceRefs");
    expectTypeOf<FeatureFormField["kind"]>().toEqualTypeOf<FeatureFormFieldKind>();
    expectTypeOf<FeatureFormModel>().toEqualTypeOf<Record<string, FeatureFormModelEntry>>();
  });

  it("v1.1 新增三 RPC 方法挂在类原型", () => {
    expect(typeof LubanFeatureRpcInterface.prototype.previewFeatureOp).toBe("function");
    expect(typeof LubanFeatureRpcInterface.prototype.resolveEdgeRef).toBe("function");
    expect(typeof LubanFeatureRpcInterface.prototype.resolveFaceRef).toBe("function");
    expect(typeof LubanFeatureRpcInterface.prototype.getFeatureFormModel).toBe("function");
  });
});

describe("M3-b v1.2 草图契约", () => {
  it("SketchEntityDto：point/line/circle 三变体（solver-neutral 形状；arc 见 M6-a v1.6 块）", () => {
    const point: SketchEntityDto = { kind: "point", id: 1, x: 0, y: 0 };
    const line: SketchEntityDto = { kind: "line", id: 2, p1: 1, p2: 3 };
    const circle: SketchEntityDto = { kind: "circle", id: 3, center: 4, radius: 5 };
    expect(point.kind).toBe("point");
    expect(line.p1).toBe(1);
    expect(circle.radius).toBe(5);
    // 坐标/半径为可选（未解算实体允许缺省）
    const unsolvedPoint: SketchEntityDto = { kind: "point", id: 9 };
    expect(unsolvedPoint.id).toBe(9);
    expectTypeOf<SketchEntityDto["kind"]>().toEqualTypeOf<"point" | "line" | "circle" | "arc">();
  });

  it("SketchConstraintDto：kind 联合逐字 + refs/value 形状", () => {
    const c: SketchConstraintDto = { kind: "distance", id: 10, refs: [1, 2], value: 12.5 };
    expect(c.kind).toBe("distance");
    expect(c.refs).toEqual([1, 2]);
    expect(c.value).toBe(12.5);
    const dimless: SketchConstraintDto = { kind: "horizontal", id: 11, refs: [2] };
    expect(dimless.value).toBeUndefined();
    expectTypeOf<SketchConstraintDto["kind"]>().toEqualTypeOf<
      "coincident" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "equal" | "distance" | "radius"
    >();
  });

  it("SketchSolveStateDto / SketchDto / SketchSummaryDto 形状", () => {
    const status: SketchSolveStatusDto = "underconstrained";
    const solve: SketchSolveStateDto = { status, dof: 2, failedConstraintIds: [], conflictingRank: [] };
    const sketch: SketchDto = {
      id: "sk-1",
      entities: [{ kind: "point", id: 1, x: 0, y: 0 }],
      constraints: [{ kind: "coincident", id: 10, refs: [1, 2] }],
      solve,
    };
    const summary: SketchSummaryDto = { id: "sk-1", entityCount: 1, constraintCount: 1 };
    expect(sketch.solve.dof).toBe(2);
    expect(sketch.solve.redundant).toBeUndefined();
    expect(summary.entityCount).toBe(1);
    expectTypeOf<SketchSolveStateDto["status"]>().toEqualTypeOf<SketchSolveStatusDto>();
    expectTypeOf<SketchDto["solve"]>().toEqualTypeOf<SketchSolveStateDto>();
  });

  it("FeatureOp 新变体 insertSketch/updateSketch 可构造（既有 8 分支不变）", () => {
    const insert: FeatureOp = {
      kind: "insertSketch",
      entities: [{ kind: "point", id: 1 }, { kind: "line", id: 2, p1: 1, p2: 1 }],
      constraints: [{ kind: "horizontal", id: 10, refs: [2] }],
    };
    const update: FeatureOp = {
      kind: "updateSketch",
      sketchId: "sk-1",
      entities: [{ kind: "circle", id: 3, center: 4, radius: 2 }],
      constraints: [{ kind: "radius", id: 11, refs: [3], value: 2 }],
    };
    expect(insert.kind).toBe("insertSketch");
    expect(update.sketchId).toBe("sk-1");
    // 既有 8 分支仍可赋值（回归锁）
    const legacy: FeatureOp[] = [
      { kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 } },
      { kind: "updateParams", featureId: "f1", params: { profile: [], distance: 1 } },
      { kind: "deleteFeature", featureId: "f1" },
      { kind: "setFeatureSuppressed", featureId: "f1", suppressed: false },
      { kind: "reorderFeature", featureId: "f1", to: 1 },
      { kind: "updateSketchConstraint", sketchId: "sk-1", constraintId: 10, value: 5 },
      { kind: "undo" },
      { kind: "redo" },
    ];
    expect(legacy).toHaveLength(8);
  });

  it("v1.2 新增 getSketch/listSketches RPC 方法挂在类原型", () => {
    expect(typeof LubanFeatureRpcInterface.prototype.getSketch).toBe("function");
    expect(typeof LubanFeatureRpcInterface.prototype.listSketches).toBe("function");
  });
});

describe("RW2-T3 v1.3 deleteSketch 契约", () => {
  it("FeatureOp 新增 deleteSketch 变体可构造（既有 9 分支不变）", () => {
    const del: FeatureOp = { kind: "deleteSketch", sketchId: "sk-1" };
    expect(del.kind).toBe("deleteSketch");
    expect(del.sketchId).toBe("sk-1");
    expectTypeOf<Extract<FeatureOp, { kind: "deleteSketch" }>>().toEqualTypeOf<{ kind: "deleteSketch"; sketchId: string }>();
    // 既有 9 分支仍可赋值（回归锁）
    const legacy: FeatureOp[] = [
      { kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 } },
      { kind: "updateParams", featureId: "f1", params: { profile: [], distance: 1 } },
      { kind: "deleteFeature", featureId: "f1" },
      { kind: "setFeatureSuppressed", featureId: "f1", suppressed: false },
      { kind: "reorderFeature", featureId: "f1", to: 1 },
      { kind: "updateSketchConstraint", sketchId: "sk-1", constraintId: 10, value: 5 },
      { kind: "insertSketch", entities: [], constraints: [] },
      { kind: "updateSketch", sketchId: "sk-1", entities: [], constraints: [] },
      { kind: "undo" },
      { kind: "redo" },
    ];
    expect(legacy).toHaveLength(10);
  });
});

describe("RW2-T6 v1.4 chamfer 契约", () => {
  it("chamfer 已入特征类型联合（编译期逐字断言）", () => {
    const t: LubanFeatureType = "chamfer";
    expect(t).toBe("chamfer");
  });

  it("ChamferParams：mode + 双值（标量或逐边数组）+ 邻面对边引用形状", () => {
    const ref: FilletEdgeRef = { faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 3, entityId: 4 } };
    const scalar: ChamferParams = { mode: 1, propagateSmooth: true, edges: [ref], values1: 0.1 };
    const dual: ChamferParams = { mode: 2, propagateSmooth: false, edges: [ref], values1: 0.1, values2: 0.2 };
    const perEdge: ChamferParams = { mode: 1, propagateSmooth: true, edges: [ref, ref], values1: [0.1, 0.2] };
    expect(scalar.mode).toBe(1);
    expect(dual.values2).toBe(0.2);
    expect(perEdge.values1).toEqual([0.1, 0.2]);
    expectTypeOf<ChamferParams>().toEqualTypeOf<{
      mode: number;
      propagateSmooth: boolean;
      edges: FilletEdgeRef[];
      values1: number | number[];
      values2?: number | number[] | undefined;
    }>();
  });
});

describe("RW2-T7 v1.5 shell 契约", () => {
  it("shell 已入特征类型联合（编译期逐字断言）", () => {
    const t: LubanFeatureType = "shell";
    expect(t).toBe("shell");
  });

  it("ShellParams：defaultDistance + 面拓扑 id 集 + distances（标量或逐面数组；0=穿孔语义入值域）", () => {
    const face: LubanTopologyId = { nodeId: 1, entityId: 2 };
    const scalar: ShellParams = { defaultDistance: 0.1, faces: [face], distances: 0 }; // 0=穿孔移除该面
    const perFace: ShellParams = { defaultDistance: -0.2, faces: [face, { nodeId: 1, entityId: 3 }], distances: [0.15, 0] };
    expect(scalar.defaultDistance).toBe(0.1);
    expect(scalar.distances).toBe(0);
    expect(perFace.distances).toEqual([0.15, 0]);
    expectTypeOf<ShellParams>().toEqualTypeOf<{
      defaultDistance: number;
      faces: LubanTopologyId[];
      distances: number | number[];
    }>();
    // 值域钉：负距离（内缩）与 0（穿孔）均为合法形态（与 chamfer 正值域刻意不同）
    const inward: ShellParams = { defaultDistance: 0.1, faces: [face], distances: -0.05 };
    expect(inward.distances).toBe(-0.05);
  });

  it("v1.5 新增 resolveFaceRef RPC 方法挂在类原型", () => {
    expect(typeof LubanFeatureRpcInterface.prototype.resolveFaceRef).toBe("function");
  });
});

describe("M6-a v1.6 契约（arc 实体 + regions 面域 + regionIndex + insertSketch plane）", () => {
  it("arc DTO 可构造且 JSON 序列化往返字段保持（center 引用 point id；角度弧度制）", () => {
    const arc: SketchEntityDto = { kind: "arc", id: 7, center: 1, radius: 2.5, startAngle: 0, sweepAngle: Math.PI / 2 };
    const roundTripped = JSON.parse(JSON.stringify(arc)) as SketchEntityDto;
    expect(roundTripped).toEqual(arc);
    // 缺省形态（待后端解算）：radius/startAngle/sweepAngle 全省略仍合法
    const unsolvedArc: SketchEntityDto = { kind: "arc", id: 8, center: 1 };
    expect(JSON.parse(JSON.stringify(unsolvedArc))).toEqual(unsolvedArc);
    expectTypeOf<Extract<SketchEntityDto, { kind: "arc" }>>().toEqualTypeOf<{
      kind: "arc"; id: number; center: number; radius?: number; startAngle?: number; sweepAngle?: number;
    }>();
  });

  it("SketchDto 带 regions 可构造；regions 缺省向后兼容（旧形态无 regions 仍编译通过）", () => {
    const solve: SketchSolveStateDto = { status: "ok", dof: 0, failedConstraintIds: [], conflictingRank: [] };
    const regions: SketchRegionDto[] = [
      { area: 12.5, outerEntityIds: [2, 3, 4], holeEntityIds: [5] },
      { area: 3, outerEntityIds: [6] },
    ];
    const withRegions: SketchDto = { id: "sk-1", entities: [], constraints: [], solve, regions };
    expect(withRegions.regions?.[0]?.area).toBe(12.5);
    expect(withRegions.regions?.[1]?.holeEntityIds).toBeUndefined();
    // 旧后端形态：无 regions 字段仍是合法 SketchDto
    const legacy: SketchDto = { id: "sk-2", entities: [], constraints: [], solve };
    expect(legacy.regions).toBeUndefined();
    expectTypeOf<SketchDto["regions"]>().toEqualTypeOf<SketchRegionDto[] | undefined>();
  });

  it("insertSketch op 带/不带 plane 均可构造（缺省=XY@z=0 保持 M3-b 语义）", () => {
    const plane: SketchPlaneDto = {
      origin: { x: 0, y: 0, z: 0.1 },
      normal: { x: 0, y: 0, z: 1 },
      xDir: { x: 1, y: 0, z: 0 },
    };
    const withPlane: FeatureOp = { kind: "insertSketch", entities: [], constraints: [], plane };
    const withoutPlane: FeatureOp = { kind: "insertSketch", entities: [], constraints: [] };
    expect(withPlane.kind).toBe("insertSketch");
    expect(withoutPlane.kind).toBe("insertSketch");
    expectTypeOf<Extract<FeatureOp, { kind: "insertSketch" }>["plane"]>().toEqualTypeOf<SketchPlaneDto | undefined>();
  });

  it("ExtrudeParams 带 regionIndex 可构造（sketchId 模式选面域；缺省 0=最大面域）", () => {
    const withRegion: ExtrudeParams = { profile: [], distance: 5, sketchId: "sk-1", regionIndex: 2 };
    const withoutRegion: ExtrudeParams = { profile: [], distance: 5, sketchId: "sk-1" };
    expect(withRegion.regionIndex).toBe(2);
    expect(withoutRegion.regionIndex).toBeUndefined();
    expectTypeOf<ExtrudeParams["regionIndex"]>().toEqualTypeOf<number | undefined>();
  });
});

describe("M6-b v1.7 契约（SketchDto.plane 落库回传——T1 plane 全链）", () => {
  it("SketchDto 带 plane 可构造；plane 缺省向后兼容（旧形态无 plane 仍编译通过）", () => {
    const solve: SketchSolveStateDto = { status: "ok", dof: 0, failedConstraintIds: [], conflictingRank: [] };
    const plane: SketchPlaneDto = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 }, // Front 面
      xDir: { x: 1, y: 0, z: 0 },
    };
    const withPlane: SketchDto = { id: "sk-1", entities: [], constraints: [], solve, plane };
    expect(withPlane.plane?.normal.y).toBe(1);
    // 旧库/旧后端形态：无 plane 字段仍是合法 SketchDto（缺省 XY@z=0 语义由消费方兜底）
    const legacy: SketchDto = { id: "sk-2", entities: [], constraints: [], solve };
    expect(legacy.plane).toBeUndefined();
    expectTypeOf<SketchDto["plane"]>().toEqualTypeOf<SketchPlaneDto | undefined>();
  });
});

describe("M6-b v1.7 契约（revolve 特征——T2 旋转通道）", () => {
  it("revolve 已入特征类型联合（编译期逐字断言）", () => {
    const t: LubanFeatureType = "revolve";
    expect(t).toBe("revolve");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve">();
  });

  it("RevolveParams：全周（angle 忽略）与部分角度（angle 必填形态）均可构造；regionIndex 缺省向后兼容", () => {
    // 全周：360°（angle 键可省——服务端忽略）
    const full: RevolveParams = { sketchId: "sk-1", axis: { sketchEntityId: 11 }, fullRevolve: true };
    expect(full.fullRevolve).toBe(true);
    expect(full.angle).toBeUndefined();
    expect(full.regionIndex).toBeUndefined();
    // 部分角度：angle 弧度制
    const partial: RevolveParams = { sketchId: "sk-1", regionIndex: 0, axis: { sketchEntityId: 11 }, fullRevolve: false, angle: Math.PI };
    expect(partial.angle).toBe(Math.PI);
    expectTypeOf<RevolveParams>().toEqualTypeOf<{
      sketchId: string;
      regionIndex?: number;
      axis: { sketchEntityId: number };
      fullRevolve: boolean;
      angle?: number;
    }>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(partial))).toEqual(partial);
  });

  it("insertFeature op 携带 revolve params 可构造（FeatureParams 联合扩展回归锁）", () => {
    const insert: FeatureOp = { kind: "insertFeature", featureType: "revolve", params: { sketchId: "sk-1", axis: { sketchEntityId: 11 }, fullRevolve: true } };
    const update: FeatureOp = { kind: "updateParams", featureId: "f1", params: { sketchId: "sk-1", axis: { sketchEntityId: 11 }, fullRevolve: false, angle: Math.PI / 2 } };
    expect(insert.featureType).toBe("revolve");
    expect(update.kind).toBe("updateParams");
    expectTypeOf<FeatureParams>().toEqualTypeOf<ExtrudeParams | FilletParams | ChamferParams | ShellParams | RevolveParams>();
  });
});

describe("M6-b v1.7 契约（extrude symmetric 对称拉伸——T3）", () => {
  it("ExtrudeParams 带 symmetric 可构造（sketchId 与内联 profile 两模式同效）；缺省向后兼容", () => {
    // sketchId 模式（Tutorial 2 主路径）：对称拉伸 depth=总深
    const sketchMode: ExtrudeParams = { profile: [], distance: 3, sketchId: "sk-1", symmetric: true };
    expect(sketchMode.symmetric).toBe(true);
    // 内联 profile 模式：语义同效
    const inlineMode: ExtrudeParams = { profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], distance: 3, symmetric: true };
    expect(inlineMode.symmetric).toBe(true);
    // 旧载荷形态（无 symmetric 键）仍合法——缺省 false=单向拉伸（既有行为）
    const legacy: ExtrudeParams = { profile: [], distance: 3, sketchId: "sk-1" };
    expect(legacy.symmetric).toBeUndefined();
    expectTypeOf<ExtrudeParams["symmetric"]>().toEqualTypeOf<boolean | undefined>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(sketchMode))).toEqual(sketchMode);
  });
});
