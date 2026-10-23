/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * op DSL v1（RW2-T5）测试：FeatureOp 链 ↔ 可读 DSL 双向序列化。
 * 核心契约：
 *  - 往返恒等：opsToDsl → dslToOps 深等（全 10 分支覆盖），且文本级再发射稳定；
 *  - 默认值坑：fillet 的 propagateSmooth（Registry filletSchema .default(true)）发射恒写全键，
 *    parse 不得剥离显式给出的默认值（否则 序列化→parse→序列化 不恒等）；
 *  - 注释位：// 后内容解析即丢弃、发射不产注释（往返只对 op 语义恒等——选型见 RW2-T5 报告）；
 *  - 非法 op 抛错：结构校验（kind/featureType/字段形态）+ 注入校验器（zod，私有仓接线）双路径；
 *  - 边界：空链 / 单行 / 多行 / 空行与注释行混排 / CRLF。
 */
import { describe, expect, it } from "vitest";
import { dslToOps, opsToDsl, OpDslParseError } from "./opDsl.js";
import type { FeatureOp, FilletEdgeRef } from "./rpc/LubanFeatureRpcInterface.js";

const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];

/** 全 10 分支样本链（每分支恰一 op，含典型字段全集） */
const allKindsOps: FeatureOp[] = [
  { kind: "insertFeature", featureType: "extrude", params: { profile: tri, distance: 5 } },
  {
    kind: "insertFeature", featureType: "fillet",
    params: {
      radius: 2, propagateSmooth: true,
      edges: [{ faceA: { nodeId: 1, entityId: 2 }, faceB: { nodeId: 3, entityId: 4 } } satisfies FilletEdgeRef],
    },
  },
  { kind: "updateParams", featureId: "f-1", params: { profile: tri, distance: 7, sketchId: "sk-9" } },
  { kind: "deleteFeature", featureId: "f-2" },
  { kind: "setFeatureSuppressed", featureId: "f-3", suppressed: true },
  { kind: "reorderFeature", featureId: "f-4", to: 2 },
  { kind: "updateSketchConstraint", sketchId: "sk-1", constraintId: 3, value: 12.5 },
  {
    kind: "insertSketch",
    entities: [
      { kind: "point", id: 1, x: 0, y: 0 },
      { kind: "line", id: 2, p1: 1, p2: 3 },
      { kind: "circle", id: 4, center: 1, radius: 5 },
    ],
    constraints: [{ kind: "distance", id: 1, refs: [2], value: 12.5 }],
  },
  {
    kind: "updateSketch",
    sketchId: "sk-1",
    entities: [{ kind: "point", id: 1, x: 1, y: 1 }],
    constraints: [],
  },
  { kind: "deleteSketch", sketchId: "sk-2" },
  { kind: "undo" },
  { kind: "redo" },
];

describe("op DSL v1 往返恒等", () => {
  it("全 10 分支：opsToDsl → dslToOps 深等", () => {
    expect(dslToOps(opsToDsl(allKindsOps))).toEqual(allKindsOps);
  });

  it("文本级稳定：parse 后再发射与原 DSL 逐字一致", () => {
    const dsl = opsToDsl(allKindsOps);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("单行与多行等价：单行 DSL 解析出单 op", () => {
    const dsl = `op deleteFeature {"featureId":"f-1"}`;
    expect(dslToOps(dsl)).toEqual([{ kind: "deleteFeature", featureId: "f-1" }]);
  });
});

describe("op DSL v1 默认值坑（propagateSmooth）", () => {
  it("发射恒写全 schema 键：fillet op 的 propagateSmooth:true 显式出现在 DSL 中", () => {
    const dsl = opsToDsl([allKindsOps[1]]);
    expect(dsl).toContain('"propagateSmooth":true');
  });

  it("结构 parse 不剥离显式默认值：往返后 propagateSmooth:true 仍在（防 序列化→parse→序列化 不恒等）", () => {
    const roundTripped = dslToOps(opsToDsl([allKindsOps[1]]));
    const params = (roundTripped[0] as { params: { propagateSmooth: boolean } }).params;
    expect(params.propagateSmooth).toBe(true);
  });
});

describe("op DSL v1 注释位语义（解析丢弃 / 发射不产注释）", () => {
  it("行尾注释与整行注释解析即丢弃，op 语义不受注释影响", () => {
    const dsl = [
      "// 头部注释：这是 AI 生成的特征链",
      `op insertFeature extrude {"profile":[{"x":0,"y":0}],"distance":5} // 拉伸基体`,
      "",
      "  // 缩进的整行注释",
      `op deleteFeature {"featureId":"f-1"}`,
    ].join("\n");
    expect(dslToOps(dsl)).toEqual([
      { kind: "insertFeature", featureType: "extrude", params: { profile: [{ x: 0, y: 0 }], distance: 5 } },
      { kind: "deleteFeature", featureId: "f-1" },
    ]);
  });

  it("发射输出不含任何注释标记（注释不参与往返，担保只及 op 语义）", () => {
    expect(opsToDsl(allKindsOps)).not.toContain("//");
  });

  it("JSON 字符串值内的 // 不被误切（注释剥离须字符串感知）", () => {
    const dsl = `op deleteFeature {"featureId":"a//b"}`;
    expect(dslToOps(dsl)).toEqual([{ kind: "deleteFeature", featureId: "a//b" }]);
  });

  it("注释掉的 op 行不参与解析", () => {
    const dsl = `// op deleteFeature {"featureId":"ghost"}\nop redo {}`;
    expect(dslToOps(dsl)).toEqual([{ kind: "redo" }]);
  });
});

describe("op DSL v1 结构校验失败路径（非法 op 抛 OpDslParseError）", () => {
  const badCases: Array<[string, string]> = [
    ["未知 kind", `op frobnicate {}`],
    ["行首非 op", `deleteFeature {"featureId":"f-1"}`],
    ["kind 与 op 粘连", `opdeleteFeature {}`],
    ["insertFeature 缺 featureType（双键定位缺一不可）", `op insertFeature {"distance":5}`],
    ["insertFeature 未知 featureType", `op insertFeature warp {"distance":5}`],
    ["featureType 错位（仅 insertFeature 接受）", `op undo extrude {}`],
    ["payload 非 JSON", `op deleteFeature {featureId}`],
    ["payload 非对象", `op deleteFeature [1,2]`],
    ["deleteFeature 缺 featureId", `op deleteFeature {}`],
    ["deleteFeature featureId 形态错", `op deleteFeature {"featureId":42}`],
    ["setFeatureSuppressed.suppressed 非 boolean", `op setFeatureSuppressed {"featureId":"f-1","suppressed":"yes"}`],
    ["updateParams 缺 params", `op updateParams {"featureId":"f-1"}`],
    ["updateSketchConstraint.value 非 number", `op updateSketchConstraint {"sketchId":"s","constraintId":1,"value":"x"}`],
    ["insertSketch.entities 非数组", `op insertSketch {"entities":{},"constraints":[]}`],
    ["insertSketch.plane 非对象（M6-a v1.6）", `op insertSketch {"entities":[],"constraints":[],"plane":1}`],
    ["insertSketch.plane.origin.x 非 number（M6-a v1.6）", `op insertSketch {"entities":[],"constraints":[],"plane":{"origin":{"x":"0","y":0,"z":0},"normal":{"x":0,"y":0,"z":1},"xDir":{"x":1,"y":0,"z":0}}}`],
    ["reorderFeature.to 非 number", `op reorderFeature {"featureId":"f-1","to":"top"}`],
  ];

  it.each(badCases)("%s", (_name, dsl) => {
    expect(() => dslToOps(dsl)).toThrow(OpDslParseError);
  });

  it("错误带行号（多行人审定位）", () => {
    try {
      dslToOps(`op undo {}\nop deleteFeature {}`);
      expect.unreachable("应抛 OpDslParseError");
    } catch (e) {
      expect(e).toBeInstanceOf(OpDslParseError);
      expect((e as OpDslParseError).lineNo).toBe(2);
    }
  });
});

describe("op DSL v1 规范化语义（对齐 zod 非严格对象剥离未知键）", () => {
  it("payload 未知键解析即剥离", () => {
    expect(dslToOps(`op deleteFeature {"featureId":"f-1","stale":true}`))
      .toEqual([{ kind: "deleteFeature", featureId: "f-1" }]);
  });

  it("undo/redo payload 归一为无字段 op", () => {
    expect(dslToOps(`op undo {"legacy":1}`)).toEqual([{ kind: "undo" }]);
  });

  it("params 内容逐字保留（深校验归注入校验器）", () => {
    const params = { profile: tri, distance: 5, sketchId: "sk-1" };
    const ops = dslToOps(opsToDsl([{ kind: "insertFeature", featureType: "extrude", params }]));
    expect(ops).toEqual([{ kind: "insertFeature", featureType: "extrude", params }]);
  });
});

describe("op DSL v1 注入校验器（zod 接线位：私有仓 FeatureTypeRegistry）", () => {
  it("validate 按 op 下标逐 op 调用，可规范化（模拟 filletSchema .default(true) 补全）", () => {
    const dsl = `op insertFeature fillet {"radius":2,"edges":[{"faceA":{"nodeId":1,"entityId":2},"faceB":{"nodeId":3,"entityId":4}}]}`;
    const seen: number[] = [];
    const ops = dslToOps(dsl, {
      validate: (op, index) => {
        seen.push(index);
        if (op.kind === "insertFeature" && op.featureType === "fillet") {
          const p = op.params as { propagateSmooth?: boolean };
          return { ...op, params: { propagateSmooth: true, ...p } };
        }
        return op;
      },
    });
    expect(seen).toEqual([0]);
    expect((ops[0] as { params: { propagateSmooth: boolean } }).params.propagateSmooth).toBe(true);
  });

  it("注入校验器抛错即整体拒收（zod 校验失败路径）", () => {
    const dsl = `op insertFeature extrude {"profile":[],"distance":-1}`;
    expect(() => dslToOps(dsl, {
      validate: (op) => {
        if (op.kind === "insertFeature" && op.featureType === "extrude") {
          const p = op.params as { distance: number };
          if (!(p.distance > 0)) throw new Error("distance 须为正数（zod .positive()）");
        }
        return op;
      },
    })).toThrow("distance 须为正数");
  });
});

describe("op DSL v1 边界", () => {
  it("空链 → 空串；空串/纯注释/纯空白 → 空链", () => {
    expect(opsToDsl([])).toBe("");
    expect(dslToOps("")).toEqual([]);
    expect(dslToOps("\n\n  \n")).toEqual([]);
    expect(dslToOps("// 只有注释\n// 没有 op\n")).toEqual([]);
  });

  it("CRLF 与行首缩进容错", () => {
    const dsl = "  op undo {}\r\n\top redo {}\r\n";
    expect(dslToOps(dsl)).toEqual([{ kind: "undo" }, { kind: "redo" }]);
  });

  it("updateParams 全键往返（sketchId 互斥对参与）", () => {
    const op: FeatureOp = {
      kind: "updateParams", featureId: "f-1",
      params: { profile: [], distance: 3, sketchId: "sk-1" },
    };
    expect(dslToOps(opsToDsl([op]))).toEqual([op]);
  });
});

describe("op DSL × M6-a v1.6（insertSketch plane 同步）", () => {
  const plane = {
    origin: { x: 0, y: 0, z: 0.1 },
    normal: { x: 0, y: 0, z: 1 },
    xDir: { x: 1, y: 0, z: 0 },
  };

  it("带 plane 的 insertSketch 往返深等（plane 是声明字段，不再按未知键剥离）", () => {
    const op: FeatureOp = {
      kind: "insertSketch",
      entities: [{ kind: "point", id: 1, x: 0, y: 0 }],
      constraints: [],
      plane,
    };
    expect(dslToOps(opsToDsl([op]))).toEqual([op]);
  });

  it("文本级稳定：带 plane 的 DSL parse 后再发射逐字一致", () => {
    const dsl = opsToDsl([{ kind: "insertSketch", entities: [], constraints: [], plane }]);
    expect(dsl).toContain('"plane"');
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("缺省不带 plane 的 DSL 文本形态与 M3-b 时期逐字一致（旧链不漂移）", () => {
    const dsl = `op insertSketch {"entities":[],"constraints":[]}`;
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
    expect(dslToOps(dsl)).toEqual([{ kind: "insertSketch", entities: [], constraints: [] }]);
  });
});
