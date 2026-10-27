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
  // M7 v1.10
  BooleanParams,
  // B2 v1.11
  LoftParams,
  // B3 v1.12
  SweepParams,
  // B4 v1.13
  MirrorParams,
  // B5 v1.14
  PatternParams,
  // B6 M-A3.1 v1.15
  BodyRef,
  BodyInfo,
} from "./LubanFeatureRpcInterface.js";

describe("LubanFeatureRpcInterface", () => {
  it("接口名与版本固定（干净标识符：云端 RPC URL 按 - 与 / 切分，名字含 / - 无法寻址）", () => {
    expect(LubanFeatureRpcInterface.interfaceName).toBe("LubanFeatureRpcInterface");
    expect(LubanFeatureRpcInterface.interfaceVersion).toBe("1.15.0");
  });

  it("提供 getClient 静态入口（同 OpenCloudRpcInterface 模式）", () => {
    expect(typeof LubanFeatureRpcInterface.getClient).toBe("function");
  });
});

describe("M3-a v1.1 类型契约", () => {
  it("fillet 已入特征类型联合（编译期逐字断言）", () => {
    const t: LubanFeatureType = "fillet";
    expect(t).toBe("fillet");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep" | "mirror" | "pattern">();
  });

  it("FilletParams：边自身 id 单引用（M6-d v1.9 纯换；LubanTopologyId/FilletEdgeRef 形状）", () => {
    const edge: LubanTopologyId = { nodeId: 1, entityId: 2 };
    const ref: FilletEdgeRef = { edge };
    const params: FilletParams = { radius: 2, propagateSmooth: true, edges: [ref] };
    expect(params.radius).toBe(2);
    expect(params.propagateSmooth).toBe(true);
    expect(params.edges).toEqual([{ edge: { nodeId: 1, entityId: 2 } }]);
    expectTypeOf<FilletEdgeRef>().toEqualTypeOf<{ edge: LubanTopologyId }>();
    expectTypeOf<FilletParams>().toEqualTypeOf<{ radius: number; propagateSmooth: boolean; edges: FilletEdgeRef[] }>();
  });

  it("FeatureParams = ExtrudeParams | FilletParams | ChamferParams | ShellParams | RevolveParams | BooleanParams；新 FeatureOp 变体可构造", () => {
    expectTypeOf<FeatureParams>().toEqualTypeOf<ExtrudeParams | FilletParams | ChamferParams | ShellParams | RevolveParams | BooleanParams | LoftParams | SweepParams | MirrorParams | PatternParams>();
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

  it("ChamferParams：mode + 双值（标量或逐边数组）+ 边自身 id 引用形状（v1.9 同批纯换）", () => {
    const ref: FilletEdgeRef = { edge: { nodeId: 1, entityId: 2 } };
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
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep" | "mirror" | "pattern">();
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
    expectTypeOf<FeatureParams>().toEqualTypeOf<ExtrudeParams | FilletParams | ChamferParams | ShellParams | RevolveParams | BooleanParams | LoftParams | SweepParams | MirrorParams | PatternParams>();
  });
});

describe("B2 v1.11 契约（loft 多截面放样——LoftParams）", () => {
  it("loft 已入特征类型联合 + LoftParams 形状（sketchIds 二元组 / sections 可选 / bodyType SOLID）", () => {
    const t: LubanFeatureType = "loft";
    expect(t).toBe("loft");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep" | "mirror" | "pattern">();
    const minimal: LoftParams = { sketchIds: ["sk-1", "sk-2"], bodyType: "SOLID" };
    const withSections: LoftParams = { sketchIds: ["sk-1", "sk-2"], sections: 2, bodyType: "SOLID" };
    expect(minimal.sketchIds).toEqual(["sk-1", "sk-2"]);
    expect(withSections.sections).toBe(2);
    expect(withSections.bodyType).toBe("SOLID");
    expectTypeOf<LoftParams>().toEqualTypeOf<{
      sketchIds: [string, string];
      sections?: number;
      bodyType: "SOLID";
    }>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(withSections))).toEqual(withSections);
  });

  it("insertFeature op 携带 loft params 可构造（FeatureParams 联合扩展回归锁）", () => {
    const insert: FeatureOp = {
      kind: "insertFeature", featureType: "loft",
      params: { sketchIds: ["sk-1", "sk-2"], bodyType: "SOLID" },
    };
    expect(insert.featureType).toBe("loft");
    expect((insert.params as LoftParams).sketchIds).toHaveLength(2);
  });
});

describe("B3 v1.12 契约（sweep 轮廓沿路径——SweepParams）", () => {
  it("sweep 已入特征类型联合 + SweepParams 形状（轮廓草图/路径草图 + bodyType SOLID）", () => {
    const t: LubanFeatureType = "sweep";
    expect(t).toBe("sweep");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep" | "mirror" | "pattern">();
    const params: SweepParams = { profileSketchId: "sk-profile", pathSketchId: "sk-path", bodyType: "SOLID" };
    expect(params.profileSketchId).toBe("sk-profile");
    expect(params.pathSketchId).toBe("sk-path");
    expect(params.bodyType).toBe("SOLID");
    expectTypeOf<SweepParams>().toEqualTypeOf<{
      profileSketchId: string;
      pathSketchId: string;
      bodyType: "SOLID";
    }>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
  });

  it("insertFeature op 携带 sweep params 可构造（FeatureParams 联合扩展回归锁）", () => {
    const insert: FeatureOp = {
      kind: "insertFeature", featureType: "sweep",
      params: { profileSketchId: "sk-profile", pathSketchId: "sk-path", bodyType: "SOLID" },
    };
    expect(insert.featureType).toBe("sweep");
    expect((insert.params as SweepParams).pathSketchId).toBe("sk-path");
  });
});

describe("B4 v1.13 契约（mirror 平面镜像——MirrorParams）", () => {
  it("mirror 已入特征类型联合 + MirrorParams 形状（世界平面三选一 + keepOriginal 字面量 true）", () => {
    const t: LubanFeatureType = "mirror";
    expect(t).toBe("mirror");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep" | "mirror" | "pattern">();
    const params: MirrorParams = { plane: "XZ", keepOriginal: true };
    expect(params.plane).toBe("XZ");
    expect(params.keepOriginal).toBe(true);
    expectTypeOf<MirrorParams>().toEqualTypeOf<{
      plane: "XY" | "YZ" | "XZ";
      keepOriginal: true;
    }>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
    // 三个世界平面均可构造
    const planes: MirrorParams["plane"][] = ["XY", "YZ", "XZ"];
    expect(planes).toEqual(["XY", "YZ", "XZ"]);
  });

  it("insertFeature/updateParams op 携带 mirror params 可构造（FeatureParams 联合扩展回归锁）", () => {
    const insert: FeatureOp = { kind: "insertFeature", featureType: "mirror", params: { plane: "XY", keepOriginal: true } };
    const update: FeatureOp = { kind: "updateParams", featureId: "f1", params: { plane: "YZ", keepOriginal: true } };
    expect(insert.featureType).toBe("mirror");
    expect((update.params as MirrorParams).plane).toBe("YZ");
  });
});

describe("B5 v1.14 契约（pattern PART 级阵列——PatternParams）", () => {
  it("pattern 已入特征类型联合 + PatternParams 形状（kind/count/spacing?/angle?/axis）", () => {
    const t: LubanFeatureType = "pattern";
    expect(t).toBe("pattern");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet" | "chamfer" | "shell" | "revolve" | "loft" | "sweep" | "mirror" | "pattern">();
    // 线性：count 含原件、spacing 沿 axis（世界 X/Y/Z）
    const linear: PatternParams = { kind: "linear", count: 3, spacing: 10, axis: "X" };
    expect(linear.kind).toBe("linear");
    expect(linear.count).toBe(3);
    expect(linear.spacing).toBe(10);
    expect(linear.axis).toBe("X");
    // 圆周：绕世界 Z 过原点，angle 度制 (0,360]（count 含原件）
    const circular: PatternParams = { kind: "circular", count: 4, angle: 360, axis: "Z" };
    expect(circular.angle).toBe(360);
    expectTypeOf<PatternParams>().toEqualTypeOf<{
      kind: "linear" | "circular";
      count: number;
      spacing?: number;
      angle?: number;
      axis: "X" | "Y" | "Z";
    }>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(linear))).toEqual(linear);
    expect(JSON.parse(JSON.stringify(circular))).toEqual(circular);
    const axes: PatternParams["axis"][] = ["X", "Y", "Z"];
    expect(axes).toEqual(["X", "Y", "Z"]);
    const kinds: PatternParams["kind"][] = ["linear", "circular"];
    expect(kinds).toEqual(["linear", "circular"]);
  });

  it("insertFeature/updateParams op 携带 pattern params 可构造（FeatureParams 联合扩展回归锁）", () => {
    const insert: FeatureOp = { kind: "insertFeature", featureType: "pattern", params: { kind: "linear", count: 3, spacing: 10, axis: "X" } };
    const update: FeatureOp = { kind: "updateParams", featureId: "f1", params: { kind: "circular", count: 4, angle: 180, axis: "Z" } };
    expect(insert.featureType).toBe("pattern");
    expect((update.params as PatternParams).kind).toBe("circular");
  });
});

describe("B6 M-A3.1 v1.15 契约（NEW-body / body 读面 / 显式目标）", () => {
  it("ExtrudeParams.newBody 可选布尔；缺省向后兼容（旧载荷无键仍合法）；JSON 往返保持", () => {
    const withNew: ExtrudeParams = { profile: [], distance: 3, sketchId: "sk-1", newBody: true };
    const inlineNew: ExtrudeParams = { profile: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], distance: 2, newBody: true };
    const legacy: ExtrudeParams = { profile: [], distance: 3, sketchId: "sk-1" };
    expect(withNew.newBody).toBe(true);
    expect(inlineNew.newBody).toBe(true);
    expect(legacy.newBody).toBeUndefined();
    expectTypeOf<ExtrudeParams["newBody"]>().toEqualTypeOf<boolean | undefined>();
    expect(JSON.parse(JSON.stringify(withNew))).toEqual(withNew);
  });

  it("BodyRef 形状（bodyKey 单键）与 BodyInfo（active/sourceFeatureId/authored/name 可选面）", () => {
    const ref: BodyRef = { bodyKey: "0x15" };
    const active: BodyInfo = { bodyKey: "0x15", name: "Body 1", active: true, sourceFeatureId: "0x16", authored: true };
    const consumed: BodyInfo = { bodyKey: "0x18", active: false, authored: true };
    expect(ref.bodyKey).toBe("0x15");
    expect(active.sourceFeatureId).toBe("0x16");
    expect(consumed.active).toBe(false);
    expectTypeOf<BodyRef>().toEqualTypeOf<{ bodyKey: string }>();
    expectTypeOf<BodyInfo>().toEqualTypeOf<{
      bodyKey: string;
      name?: string;
      active: boolean;
      sourceFeatureId?: string;
      authored?: boolean;
    }>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(active))).toEqual(active);
    expect(JSON.parse(JSON.stringify(consumed))).toEqual(consumed);
  });

  it("FeatureOp.insertFeature 增可选 targetBodyId（N>1 regular insert 显式目标；N≤1 legacy 可缺省）", () => {
    const targeted: FeatureOp = {
      kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 }, targetBodyId: "0x18",
    };
    const legacy: FeatureOp = { kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 } };
    const newBody: FeatureOp = {
      kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1, newBody: true }, targetBodyId: "0x15",
    };
    expect(targeted.targetBodyId).toBe("0x18");
    expect(legacy.targetBodyId).toBeUndefined();
    expect((newBody.params as ExtrudeParams).newBody).toBe(true);
    expectTypeOf<Extract<FeatureOp, { kind: "insertFeature" }>>().toEqualTypeOf<{
      kind: "insertFeature";
      featureType: LubanFeatureType;
      params: FeatureParams;
      targetBodyId?: string;
    }>();
  });

  it("v1.15 新增 getBodies RPC 方法挂在类原型（只读 body 读面）", () => {
    expect(typeof LubanFeatureRpcInterface.prototype.getBodies).toBe("function");
  });
});

describe("M7 v1.10 契约（boolean 草图驱动——BooleanParams）", () => {
  it("BooleanParams：sketchId/regions/distance/operation 形状；operation 为 unite|subtract 字面量联合", () => {
    const single: BooleanParams = { sketchId: "sk-1", distance: 5, operation: "subtract" };
    const multi: BooleanParams = { sketchId: "sk-1", regions: [0, 2], distance: 5, operation: "unite" };
    expect(single.operation).toBe("subtract");
    expect(single.regions).toBeUndefined();
    expect(multi.regions).toEqual([0, 2]);
    expectTypeOf<BooleanParams>().toEqualTypeOf<{
      sketchId: string;
      regionIndex?: number;
      regions?: number[];
      distance: number;
      operation: "unite" | "subtract";
    }>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(multi))).toEqual(multi);
  });

  it("insertFeature op 携带布尔草图参数可构造（featureType 名不变：booleanAdd/booleanSubtract，operation 映射类型）", () => {
    const add: FeatureOp = { kind: "insertFeature", featureType: "booleanAdd", params: { sketchId: "sk-1", distance: 2, operation: "unite" } };
    const subtract: FeatureOp = {
      kind: "updateParams", featureId: "f1",
      params: { sketchId: "sk-1", regions: [1], distance: 3, operation: "subtract" },
    };
    expect(add.featureType).toBe("booleanAdd");
    expect(subtract.kind).toBe("updateParams");
    expect((subtract.params as BooleanParams).operation).toBe("subtract");
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

describe("M6-c v1.8 契约（extrude regions 多面域选择——T1 复合面域拉伸）", () => {
  it("ExtrudeParams 带 regions 数组可构造（多面域组合拉伸）；与 regionIndex/symmetric 正交组合", () => {
    // Tutorial 2 E3 形态：双面域组合 + 对称拉伸
    const dual: ExtrudeParams = { profile: [], distance: 15.875, sketchId: "sk-1", regions: [0, 2], symmetric: true };
    expect(dual.regions).toEqual([0, 2]);
    expect(dual.symmetric).toBe(true);
    // 多面域与单面域简写互斥（服务端 zod 拒收同给两键——类型层不禁止，运行时契约在 Registry）
    expectTypeOf<ExtrudeParams["regions"]>().toEqualTypeOf<number[] | undefined>();
    // JSON 序列化往返保持（RPC 载荷形态）
    expect(JSON.parse(JSON.stringify(dual))).toEqual(dual);
  });

  it("regions 缺省向后兼容：regionIndex 简写与全缺省（=[0] 最大面域）两旧形态均合法", () => {
    // v1.7 旧形态：单面域简写（deprecated 但兼容保留一版）
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- 兼容路径契约钉（v1.8 起 deprecated）
    const legacySingle: ExtrudeParams = { profile: [], distance: 5, sketchId: "sk-1", regionIndex: 2 };
    expect(legacySingle.regions).toBeUndefined();
    // 全缺省：无 regions 无 regionIndex → 服务端按 [0]=最大面域裁决（v1.6 以来既有行为）
    const legacyDefault: ExtrudeParams = { profile: [], distance: 5, sketchId: "sk-1" };
    expect(legacyDefault.regions).toBeUndefined();
    expect(legacyDefault.regionIndex).toBeUndefined();
  });
});
