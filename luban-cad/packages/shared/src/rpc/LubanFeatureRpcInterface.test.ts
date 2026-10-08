import { describe, expect, it, expectTypeOf } from "vitest";
import { LubanFeatureRpcInterface } from "./LubanFeatureRpcInterface.js";
import type {
  LubanFeatureType,
  ExtrudeParams,
  LubanTopologyId,
  FilletEdgeRef,
  FilletParams,
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
} from "./LubanFeatureRpcInterface.js";

describe("LubanFeatureRpcInterface", () => {
  it("接口名与版本固定（干净标识符：云端 RPC URL 按 - 与 / 切分，名字含 / - 无法寻址）", () => {
    expect(LubanFeatureRpcInterface.interfaceName).toBe("LubanFeatureRpcInterface");
    expect(LubanFeatureRpcInterface.interfaceVersion).toBe("1.2.0");
  });

  it("提供 getClient 静态入口（同 OpenCloudRpcInterface 模式）", () => {
    expect(typeof LubanFeatureRpcInterface.getClient).toBe("function");
  });
});

describe("M3-a v1.1 类型契约", () => {
  it("fillet 已入特征类型联合（编译期逐字断言）", () => {
    const t: LubanFeatureType = "fillet";
    expect(t).toBe("fillet");
    expectTypeOf<LubanFeatureType>().toEqualTypeOf<"extrude" | "booleanAdd" | "booleanSubtract" | "fillet">();
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

  it("FeatureParams = ExtrudeParams | FilletParams；新 FeatureOp 变体可构造", () => {
    expectTypeOf<FeatureParams>().toEqualTypeOf<ExtrudeParams | FilletParams>();
    const insertFillet: FeatureOp = { kind: "insertFeature", featureType: "fillet", params: { radius: 1, propagateSmooth: false, edges: [] } };
    const suppress: FeatureOp = { kind: "setFeatureSuppressed", featureId: "f1", suppressed: true };
    const reorder: FeatureOp = { kind: "reorderFeature", featureId: "f1", to: 2 };
    expect(insertFillet.kind).toBe("insertFeature");
    expect(suppress.suppressed).toBe(true);
    expect(reorder.to).toBe(2);
  });

  it("PreviewResult / FeatureFormModel 形状", () => {
    const preview: PreviewResult = { ok: false, error: "bad edges", affected: [{ featureId: "f1", status: 3 }] };
    const field: FeatureFormField = { name: "radius", label: "半径", kind: "edgeRefs", readOnly: true };
    const model: FeatureFormModel = { fillet: { fields: [field] } };
    expect(preview.ok).toBe(false);
    expect(preview.affected[0]?.status).toBe(3);
    expect(model.fillet?.fields[0]?.kind).toBe("edgeRefs");
    expectTypeOf<FeatureFormField["kind"]>().toEqualTypeOf<FeatureFormFieldKind>();
    expectTypeOf<FeatureFormModel>().toEqualTypeOf<Record<string, FeatureFormModelEntry>>();
  });

  it("v1.1 新增三 RPC 方法挂在类原型", () => {
    expect(typeof LubanFeatureRpcInterface.prototype.previewFeatureOp).toBe("function");
    expect(typeof LubanFeatureRpcInterface.prototype.resolveEdgeRef).toBe("function");
    expect(typeof LubanFeatureRpcInterface.prototype.getFeatureFormModel).toBe("function");
  });
});

describe("M3-b v1.2 草图契约", () => {
  it("SketchEntityDto：point/line/circle 三变体（solver-neutral 形状）", () => {
    const point: SketchEntityDto = { kind: "point", id: 1, x: 0, y: 0 };
    const line: SketchEntityDto = { kind: "line", id: 2, p1: 1, p2: 3 };
    const circle: SketchEntityDto = { kind: "circle", id: 3, center: 4, radius: 5 };
    expect(point.kind).toBe("point");
    expect(line.p1).toBe(1);
    expect(circle.radius).toBe(5);
    // 坐标/半径为可选（未解算实体允许缺省）
    const unsolvedPoint: SketchEntityDto = { kind: "point", id: 9 };
    expect(unsolvedPoint.id).toBe(9);
    expectTypeOf<SketchEntityDto["kind"]>().toEqualTypeOf<"point" | "line" | "circle">();
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
