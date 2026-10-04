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
} from "./LubanFeatureRpcInterface.js";

describe("LubanFeatureRpcInterface", () => {
  it("接口名与版本固定", () => {
    expect(LubanFeatureRpcInterface.interfaceName).toBe("luban-cad/features-v1");
    expect(LubanFeatureRpcInterface.interfaceVersion).toBe("1.1.0");
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
