/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * op DSL v1（RW2-T5）测试：FeatureOp 链 ↔ 可读 DSL 双向序列化。
 * 核心契约：
 *  - 往返恒等：opsToDsl → dslToOps 深等（全分支覆盖，含 v1.71 updateVariables），
 *    且文本级再发射稳定；
 *  - 默认值坑：fillet 的 propagateSmooth（Registry filletSchema .default(true)）发射恒写全键，
 *    parse 不得剥离显式给出的默认值（否则 序列化→parse→序列化 不恒等）；
 *  - 注释位：// 后内容解析即丢弃、发射不产注释（往返只对 op 语义恒等——选型见 RW2-T5 报告）；
 *  - 非法 op 抛错：结构校验（kind/featureType/字段形态）+ 注入校验器（zod，私有仓接线）双路径；
 *  - 边界：空链 / 单行 / 多行 / 空行与注释行混排 / CRLF。
 */
import { describe, expect, it } from "vitest";
import { dslToOps, OpDslParseError, opsToDsl } from "./opDsl.js";
import type {
  FeatureOp, FeatureParams, FilletEdgeRef, LubanFeatureType, SketchExternalReferenceDto,
} from "./rpc/LubanFeatureRpcInterface.js";

const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];

/**
 * 编译期穷举：LubanFeatureType 新增成员时本对象缺键会直接 TS 报错；
 * 运行时再用 DSL 往返验证 opDsl 白名单确实放行每一种。
 * 这条测试专门防历史事故：revolve / booleanBodies 两次漏同步。
 */
const ALL_FEATURE_TYPES: Record<LubanFeatureType, true> = {
  extrude: true,
  booleanAdd: true,
  booleanSubtract: true,
  fillet: true,
  chamfer: true,
  shell: true,
  revolve: true,
  loft: true,
  sweep: true,
  mirror: true,
  pattern: true,
  featurePattern: true,
  featureMirror: true,
  booleanBodies: true,
  hole: true,
  cPlane: true,
  faceExtrude: true,
  transform: true,
  splitPart: true,
  moveFace: true,
};

describe("op DSL 白名单 × LubanFeatureType 全集", () => {
  it("每一种 Feature 类型都能通过 parse（opDsl 不得漏同步）", () => {
    for (const featureType of Object.keys(ALL_FEATURE_TYPES) as LubanFeatureType[]) {
      const op: FeatureOp = {
        kind: "insertFeature",
        featureType,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- compile-time whitelist probe uses a minimal payload
        params: { profile: [], distance: 1 } as unknown as FeatureParams,
      };
      expect(dslToOps(opsToDsl([op])), featureType).toEqual([op]);
    }
  });
});

/** 全分支样本链（每 kind 恰一 op，含典型字段全集；insertFeature 两个样本） */
const allKindsOps: FeatureOp[] = [
  { kind: "insertFeature", featureType: "extrude", params: { profile: tri, distance: 5 } },
  {
    kind: "insertFeature", featureType: "fillet",
    params: {
      radius: 2, propagateSmooth: true,
      edges: [{ edge: { nodeId: 1, entityId: 2 } } satisfies FilletEdgeRef], // M6-d v1.9：边自身 id 单引用
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
  // v1.71（ADR-0020）：整表覆写变量
  { kind: "updateVariables", variables: [{ id: "v1", name: "width", expression: "25.4 * 2" }] },
  { kind: "undo" },
  { kind: "redo" },
];

describe("op DSL v1 往返恒等", () => {
  it("全分支（含 updateVariables）：opsToDsl → dslToOps 深等", () => {
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
    const dsl = `op insertFeature fillet {"radius":2,"edges":[{"edge":{"nodeId":1,"entityId":2}}]}`;
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

describe("op DSL × M6-c T5（FEATURE_TYPES 白名单补 revolve）", () => {
  /** revolve 全参样本（shared v1.7 RevolveParams：sketchId 寻址 + regionIndex 单选 + 轴 + 全周/角度）。 */
  const revolveOp: FeatureOp = {
    kind: "insertFeature",
    featureType: "revolve",
    params: {
      profile: [],
      sketchId: "sk-1",
      regionIndex: 0,
      axis: { sketchEntityId: 3 },
      fullRevolve: true,
    },
  };

  it("M6-b T2 漏同步修复：`op insertFeature revolve {...}` 结构 parse 放行（不再误抛未知 featureType）", () => {
    const dsl = opsToDsl([revolveOp]);
    expect(dslToOps(dsl)).toEqual([revolveOp]);
  });

  it("revolve 往返恒等 + 文本级稳定（featureType 为裸令牌形态）", () => {
    const dsl = opsToDsl([revolveOp]);
    expect(dsl.startsWith("op insertFeature revolve {")).toBe(true);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });
});

describe("op DSL × B2 v1.11（FEATURE_TYPES 白名单补 loft）", () => {
  /** loft 全参样本（shared v1.11 LoftParams：两张截面草图 + 可选 sections + SOLID）。 */
  const loftOp: FeatureOp = {
    kind: "insertFeature",
    featureType: "loft",
    params: { sketchIds: ["sk-1", "sk-2"], sections: 2, bodyType: "SOLID" },
  };

  it("`op insertFeature loft {...}` 结构 parse 放行（白名单与 LubanFeatureType 全集对齐）", () => {
    expect(dslToOps(opsToDsl([loftOp]))).toEqual([loftOp]);
  });

  it("loft 往返恒等 + 文本级稳定", () => {
    const dsl = opsToDsl([loftOp]);
    expect(dsl.startsWith("op insertFeature loft {")).toBe(true);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });
});

describe("op DSL × B3 v1.12（FEATURE_TYPES 白名单补 sweep）", () => {
  /** sweep 全参样本（shared v1.12 SweepParams：轮廓草图 + 路径草图 + SOLID）。 */
  const sweepOp: FeatureOp = {
    kind: "insertFeature",
    featureType: "sweep",
    params: { profileSketchId: "sk-profile", pathSketchId: "sk-path", bodyType: "SOLID" },
  };

  it("`op insertFeature sweep {...}` 结构 parse 放行（白名单与 LubanFeatureType 全集对齐）", () => {
    expect(dslToOps(opsToDsl([sweepOp]))).toEqual([sweepOp]);
  });

  it("sweep 往返恒等 + 文本级稳定", () => {
    const dsl = opsToDsl([sweepOp]);
    expect(dsl.startsWith("op insertFeature sweep {")).toBe(true);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });
});

describe("op DSL × B4 v1.13（FEATURE_TYPES 白名单补 mirror）", () => {
  /** mirror 全参样本（shared v1.13 MirrorParams：世界平面 + keepOriginal 字面量 true）。 */
  const mirrorOp: FeatureOp = {
    kind: "insertFeature",
    featureType: "mirror",
    params: { plane: "XZ", keepOriginal: true },
  };

  it("`op insertFeature mirror {...}` 结构 parse 放行（白名单与 LubanFeatureType 全集对齐）", () => {
    expect(dslToOps(opsToDsl([mirrorOp]))).toEqual([mirrorOp]);
  });

  it("mirror 往返恒等 + 文本级稳定", () => {
    const dsl = opsToDsl([mirrorOp]);
    expect(dsl.startsWith("op insertFeature mirror {")).toBe(true);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });
});

describe("op DSL × B5 v1.14（FEATURE_TYPES 白名单补 pattern）", () => {
  /** pattern 全参样本（shared v1.14 PatternParams：线性 PART 阵列）。 */
  const patternOp: FeatureOp = {
    kind: "insertFeature",
    featureType: "pattern",
    params: { kind: "linear", count: 3, spacing: 10, axis: "X" },
  };

  it("`op insertFeature pattern {...}` 结构 parse 放行（白名单与 LubanFeatureType 全集对齐）", () => {
    expect(dslToOps(opsToDsl([patternOp]))).toEqual([patternOp]);
  });

  it("pattern 往返恒等 + 文本级稳定", () => {
    const dsl = opsToDsl([patternOp]);
    expect(dsl.startsWith("op insertFeature pattern {")).toBe(true);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });
});

describe("op DSL × B6 M-A3.2a（targetBodyId 双向）", () => {
  it("insertFeature + targetBodyId 往返深等（包装 payload {params,targetBodyId}）+ 文本再发射稳定", () => {
    const op: FeatureOp = {
      kind: "insertFeature",
      featureType: "extrude",
      params: { profile: [], distance: 1, newBody: true },
      targetBodyId: "0x15",
    };
    const dsl = opsToDsl([op]);
    expect(dsl).toContain('"targetBodyId":"0x15"');
    expect(dsl).toContain('"params":{');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("insertFeature 无 target 的旧文本形态逐字不变（payload 仍是裸 params）", () => {
    const dsl = opsToDsl([{ kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 } }]);
    expect(dsl).toBe('op insertFeature extrude {"profile":[],"distance":1}');
    expect(dsl).not.toContain('"params":');
    expect(dslToOps(dsl)).toEqual([
      { kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 } },
    ]);
  });

  it("deleteFeature + targetBodyId 往返深等；缺省文本逐字不变（旧链零漂移）", () => {
    const op: FeatureOp = { kind: "deleteFeature", featureId: "f-1", targetBodyId: "0x18" };
    expect(dslToOps(opsToDsl([op]))).toEqual([op]);
    expect(opsToDsl(dslToOps(opsToDsl([op])))).toBe(opsToDsl([op]));
    expect(opsToDsl([{ kind: "deleteFeature", featureId: "f-1" }]))
      .toBe('op deleteFeature {"featureId":"f-1"}');
  });

  it("v1.65 多目标 fillet：targetBodyIds 与每边 bodyKey 往返不丢；旧单目标文本零漂移", () => {
    const op: FeatureOp = {
      kind: "insertFeature",
      featureType: "fillet",
      params: {
        radius: 2,
        propagateSmooth: false,
        edges: [
          { edge: "1:1", bodyKey: "b1" },
          { edge: "2:1", bodyKey: "b2" },
        ],
      },
      targetBodyIds: ["b1", "b2"],
    };
    const dsl = opsToDsl([op]);
    expect(dsl).toContain('"targetBodyIds":["b1","b2"]');
    expect(dsl).toContain('"bodyKey":"b1"');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
    expect(dslToOps('op insertFeature fillet {"radius":2,"propagateSmooth":false,"edges":[{"edge":"1:1"}]}'))
      .toEqual([{ kind: "insertFeature", featureType: "fillet", params: { radius: 2, propagateSmooth: false, edges: [{ edge: "1:1" }] } }]);
  });

  it("v1.65 多目标校验：targetBodyId/targetBodyIds 互斥、数组非空/不重复/非 string 拒收", () => {
    expect(() => dslToOps('op insertFeature fillet {"params":{"radius":2,"propagateSmooth":false,"edges":[]},"targetBodyId":"b1","targetBodyIds":["b2"]}'))
      .toThrow(/targetBodyId/);
    expect(() => dslToOps('op insertFeature fillet {"params":{"radius":2,"propagateSmooth":false,"edges":[]},"targetBodyIds":[]}'))
      .toThrow(/targetBodyIds/);
    expect(() => dslToOps('op insertFeature fillet {"params":{"radius":2,"propagateSmooth":false,"edges":[]},"targetBodyIds":["b1","b1"]}'))
      .toThrow(/targetBodyIds/);
    expect(() => dslToOps('op insertFeature fillet {"params":{"radius":2,"propagateSmooth":false,"edges":[]},"targetBodyIds":[1]}'))
      .toThrow(/targetBodyIds/);
  });

  it("targetBodyId 形态校验：非 string 拒收（insert 包装与 delete 两路）", () => {
    expect(() => dslToOps('op deleteFeature {"featureId":"f-1","targetBodyId":42}'))
      .toThrow(/targetBodyId/);
    expect(() => dslToOps('op insertFeature extrude {"params":{"profile":[],"distance":1},"targetBodyId":42}'))
      .toThrow(/targetBodyId/);
  });
});

describe("op DSL × v1.26/v1.29（FEATURE_TYPES 白名单补 hole/cPlane）", () => {
  it("hole 往返恒等 + 文本级稳定", () => {
    const op: FeatureOp = {
      kind: "insertFeature",
      featureType: "hole",
      params: { sketchId: "sk-1", pointIds: [1], diameterMm: 5, endBound: "blind", depthMm: 10 },
    };
    const dsl = opsToDsl([op]);
    expect(dsl.startsWith("op insertFeature hole {")).toBe(true);
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("cPlane 往返恒等 + 文本级稳定", () => {
    const op: FeatureOp = {
      kind: "insertFeature",
      featureType: "cPlane",
      params: { reference: "top", offsetMm: 1, flipNormal: false },
    };
    const dsl = opsToDsl([op]);
    expect(dsl.startsWith("op insertFeature cPlane {")).toBe(true);
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
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

  it("v1.35 projections 往返深等（与 plane 可共存）", () => {
    const op: FeatureOp = {
      kind: "insertSketch", entities: [], constraints: [], plane,
      projections: [{ sourceSketchId: "0x2000000000a", sourceEntityId: 11, entityId: 101 }],
    };
    expect(dslToOps(opsToDsl([op]))).toEqual([op]);
  });
});

describe("op DSL × v1.73（extrude distanceExpression 深度表达式）", () => {
  it("insertFeature 携带 distanceExpression 往返深等 + 文本级稳定", () => {
    const op: FeatureOp = {
      kind: "insertFeature",
      featureType: "extrude",
      params: { profile: tri, distance: 20, sketchId: "sk-1", distanceExpression: "#width * 2" },
    };
    const dsl = opsToDsl([op]);
    expect(dsl).toContain('"distanceExpression":"#width * 2"');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("updateParams 携带 distanceExpression（物化 distance + 表达式原文）往返深等", () => {
    const op: FeatureOp = {
      kind: "updateParams",
      featureId: "f-1",
      params: { profile: [], distance: 10, sketchId: "sk-1", distanceExpression: "5 * 2" },
    };
    const dsl = opsToDsl([op]);
    expect(dsl).toContain('"distanceExpression":"5 * 2"');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("无表达式的旧 extrude 文本逐字不变（opDsl 无需改写）", () => {
    const dsl = opsToDsl([{ kind: "insertFeature", featureType: "extrude", params: { profile: [], distance: 1 } }]);
    expect(dsl).toBe('op insertFeature extrude {"profile":[],"distance":1}');
  });
});

describe("op DSL × v1.71（updateVariables 变量表整表覆写）", () => {
  const op: FeatureOp = {
    kind: "updateVariables",
    variables: [
      { id: "v1", name: "width", expression: "25.4 * 2" },
      { id: "v2", name: "height", expression: "#width / 2" },
    ],
  };

  it("往返恒等 + 文本级稳定（op updateVariables {variables:[...]}）", () => {
    const dsl = opsToDsl([op]);
    expect(dsl.startsWith("op updateVariables {")).toBe(true);
    expect(dsl).toContain('"variables"');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("v1.72：type/description 随 DSL 往返（未知键选择性剥离）", () => {
    const typed: FeatureOp = {
      kind: "updateVariables",
      variables: [
        { id: "v1", name: "width", expression: "10", type: "length", description: "板宽" },
        { id: "v2", name: "ang", expression: "45", type: "angle" },
        { id: "v3", name: "plain", expression: "3", type: "number", description: "" },
      ],
    };
    const dsl = opsToDsl([typed]);
    expect(dsl).toContain('"type":"length"');
    expect(dsl).toContain('"description":"板宽"');
    expect(dslToOps(dsl)).toEqual([typed]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);

    // 已声明字段保留、未声明键剥离（对齐 zod 非严格对象语义）
    expect(dslToOps(
      `op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","type":"number","description":"x","stale":true}],"extra":1}`,
    )).toEqual([{
      kind: "updateVariables",
      variables: [{ id: "v1", name: "a", expression: "1", type: "number", description: "x" }],
    }]);
  });

  it("v1.72 结构校验：type 非四值/非 string、description 非 string 拒收（四值 string 通过）", () => {
    const badCases = [
      `op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","type":"mass"}]}`,
      `op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","type":5}]}`,
      `op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","type":null}]}`,
      `op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","description":5}]}`,
      `op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","description":null}]}`,
    ];
    for (const dsl of badCases)
      expect(() => dslToOps(dsl), dsl).toThrow(OpDslParseError);
    for (const type of ["length", "angle", "number", "any"] as const)
      expect(dslToOps(`op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","type":"${type}"}]}`))
        .toEqual([{ kind: "updateVariables", variables: [{ id: "v1", name: "a", expression: "1", type }] }]);
  });

  it("空变量表可往返（合法：清空整表）", () => {
    const empty: FeatureOp = { kind: "updateVariables", variables: [] };
    expect(dslToOps(opsToDsl([empty]))).toEqual([empty]);
    expect(opsToDsl([empty])).toBe("op updateVariables {\"variables\":[]}");
  });

  it("未知键剥离（对齐 zod 非严格对象语义）", () => {
    expect(dslToOps(`op updateVariables {"variables":[{"id":"v1","name":"a","expression":"1","stale":true}],"extra":1}`))
      .toEqual([{ kind: "updateVariables", variables: [{ id: "v1", name: "a", expression: "1" }] }]);
  });

  it("语义校验不在 DSL 层：非法名/重复名/不可求值表达式仍可结构解析（归后端门禁）", () => {
    const dsl = `op updateVariables {"variables":[{"id":"v1","name":"1bad","expression":"1 +"},{"id":"v2","name":"1bad","expression":"#nope"}]}`;
    expect(dslToOps(dsl)).toEqual([{
      kind: "updateVariables",
      variables: [
        { id: "v1", name: "1bad", expression: "1 +" },
        { id: "v2", name: "1bad", expression: "#nope" },
      ],
    }]);
  });

  it("结构校验：variables 非数组/项非对象/三键缺失或非 string 一律拒收；featureType 令牌拒收", () => {
    const badCases = [
      `op updateVariables {"variables":{}}`,
      `op updateVariables {"variables":[1]}`,
      `op updateVariables {"variables":[{"name":"a","expression":"1"}]}`,
      `op updateVariables {"variables":[{"id":"v1","expression":"1"}]}`,
      `op updateVariables {"variables":[{"id":"v1","name":"a"}]}`,
      `op updateVariables {"variables":[{"id":1,"name":"a","expression":"1"}]}`,
      `op updateVariables {"variables":[{"id":"v1","name":2,"expression":"1"}]}`,
      `op updateVariables {"variables":[{"id":"v1","name":"a","expression":3}]}`,
      `op updateVariables extrude {"variables":[]}`,
    ];
    for (const dsl of badCases)
      expect(() => dslToOps(dsl), dsl).toThrow(OpDslParseError);
  });
});

describe("op DSL × v1.74（其他特征数值字段表达式）", () => {
  const edge: FilletEdgeRef = { edge: { nodeId: 1, entityId: 3 } };

  it("fillet radiusExpression / shell defaultDistanceExpression 往返深等 + 文本级稳定", () => {
    const ops: FeatureOp[] = [
      {
        kind: "insertFeature", featureType: "fillet",
        params: { radius: 8, radiusExpression: "#r * 2", propagateSmooth: true, edges: [edge] },
      },
      {
        kind: "insertFeature", featureType: "shell",
        params: {
          defaultDistance: -0.2, defaultDistanceExpression: "0 - #t",
          faces: [{ nodeId: 1, entityId: 3 }], distances: 0,
        },
      },
    ];
    for (const op of ops) {
      const dsl = opsToDsl([op]);
      expect(dslToOps(dsl)).toEqual([op]);
      expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
    }
    expect(opsToDsl([ops[0]])).toContain('"radiusExpression":"#r * 2"');
    expect(opsToDsl([ops[1]])).toContain('"defaultDistanceExpression":"0 - #t"');
  });

  it("hole diameterExpression/depthExpression 往返深等", () => {
    const op: FeatureOp = {
      kind: "insertFeature", featureType: "hole",
      params: {
        sketchId: "sk-1", diameterMm: 6.35, diameterExpression: "#holeDia",
        endBound: "blind", depthMm: 5, depthExpression: "#plateT / 2",
      },
    };
    const dsl = opsToDsl([op]);
    expect(dsl).toContain('"diameterExpression":"#holeDia"');
    expect(dsl).toContain('"depthExpression":"#plateT / 2"');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("extrude 四键（secondDirection 嵌套目标）与 revolve angleExpression 往返深等", () => {
    const extrude: FeatureOp = {
      kind: "updateParams", featureId: "f-1",
      params: {
        profile: [], distance: 10, sketchId: "sk-1",
        secondDirection: { endBound: "blind", distanceMm: 5, direction: "backward" },
        secondDirectionDistanceExpression: "#d2", startOffsetExpression: "0 - #off",
        bodyType: "THIN", thinThicknessMm: 1, thinThicknessExpression: "#wall",
        draftAngleDeg: 5, draftAngleExpression: "#deg / 2",
      },
    };
    const revolve: FeatureOp = {
      kind: "updateParams", featureId: "f-2",
      params: {
        sketchId: "sk-1", axis: { sketchEntityId: 14 }, fullRevolve: false,
        angle: Math.PI, angleExpression: "180",
      },
    };
    for (const op of [extrude, revolve]) {
      const dsl = opsToDsl([op]);
      expect(dslToOps(dsl)).toEqual([op]);
      expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
    }
    const allDsl = opsToDsl([extrude]);
    for (const key of [
      "secondDirectionDistanceExpression", "startOffsetExpression",
      "thinThicknessExpression", "draftAngleExpression",
    ])
      expect(allDsl).toContain(`"${key}"`);
  });

  it("无表达式的旧 fillet/shell/hole/revolve 文本逐字不变（opDsl 无需改写）", () => {
    const cases: Array<[FeatureOp, string]> = [
      [
        { kind: "insertFeature", featureType: "fillet", params: { radius: 1, propagateSmooth: true, edges: [edge] } },
        'op insertFeature fillet {"radius":1,"propagateSmooth":true,"edges":[{"edge":{"nodeId":1,"entityId":3}}]}',
      ],
      [
        { kind: "insertFeature", featureType: "shell", params: { defaultDistance: 0.1, faces: [{ nodeId: 1, entityId: 3 }], distances: 0 } },
        'op insertFeature shell {"defaultDistance":0.1,"faces":[{"nodeId":1,"entityId":3}],"distances":0}',
      ],
      [
        { kind: "insertFeature", featureType: "hole", params: { sketchId: "sk-1", diameterMm: 4, endBound: "throughAll" } },
        'op insertFeature hole {"sketchId":"sk-1","diameterMm":4,"endBound":"throughAll"}',
      ],
      [
        { kind: "insertFeature", featureType: "revolve", params: { sketchId: "sk-1", axis: { sketchEntityId: 14 }, fullRevolve: true } },
        'op insertFeature revolve {"sketchId":"sk-1","axis":{"sketchEntityId":14},"fullRevolve":true}',
      ],
    ];
    for (const [op, expected] of cases)
      expect(opsToDsl([op])).toBe(expected);
  });
});

describe("op DSL × v1.85（externalRefs 发射/解析；草图外部引用 S1）", () => {
  const externalRefs: SketchExternalReferenceDto[] = [
    {
      id: 1, kind: "project",
      source: { kind: "bodyEdge", bodyId: "0x2000000000b", topologyRef: { nodeId: 10, entityId: 11 } },
      entityIds: [1, 2, 3],
    },
    {
      id: 2, kind: "projectEndpoint",
      source: { kind: "bodyEdge", bodyId: "0x2000000000b", topologyRef: { nodeId: 12, entityId: 13 }, part: "start" },
      entityIds: [4],
    },
    {
      id: 3, kind: "project",
      source: { kind: "sketchEntity", sketchId: "0x2000000000c", entityId: 21 },
      entityIds: [5, 6], construction: true,
    },
  ];

  it("insertSketch externalRefs 往返深等 + 文本级稳定", () => {
    const op: FeatureOp = { kind: "insertSketch", entities: [], constraints: [], externalRefs };
    const dsl = opsToDsl([op]);
    expect(dsl).toContain('"externalRefs"');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("updateSketch externalRefs 往返深等 + 文本级稳定", () => {
    const op: FeatureOp = { kind: "updateSketch", sketchId: "0xa", entities: [], constraints: [], externalRefs };
    const dsl = opsToDsl([op]);
    expect(dsl).toContain('"externalRefs"');
    expect(dslToOps(dsl)).toEqual([op]);
    expect(opsToDsl(dslToOps(dsl))).toBe(dsl);
  });

  it("缺省不发射 externalRefs（旧 updateSketch 文本逐字不变）", () => {
    const dsl = opsToDsl([{ kind: "updateSketch", sketchId: "s", entities: [], constraints: [] }]);
    expect(dsl).toBe('op updateSketch {"sketchId":"s","entities":[],"constraints":[]}');
  });

  it("projections 新 {entityId, source} 分支往返深等（旧 sourceSketchId 分支并存）", () => {
    const op: FeatureOp = {
      kind: "insertSketch", entities: [], constraints: [],
      projections: [
        { entityId: 7, sourceSketchId: "0xa", sourceEntityId: 11 },
        { entityId: 8, source: { kind: "bodyEdge", bodyId: "0xb", topologyRef: { nodeId: 1, entityId: 2 } } },
      ],
    };
    expect(dslToOps(opsToDsl([op]))).toEqual([op]);
  });

  it("非法 externalRefs 形态拒收（id/kind/source.kind/topologyRef/entityIds）", () => {
    const bad = [
      `op updateSketch {"sketchId":"s","entities":[],"constraints":[],"externalRefs":[{"kind":"project","source":{"kind":"bodyEdge","bodyId":"b","topologyRef":{"nodeId":1,"entityId":2}},"entityIds":[1]}]}`,
      `op updateSketch {"sketchId":"s","entities":[],"constraints":[],"externalRefs":[{"id":1,"kind":"frobnicate","source":{"kind":"bodyEdge","bodyId":"b","topologyRef":{"nodeId":1,"entityId":2}},"entityIds":[1]}]}`,
      `op updateSketch {"sketchId":"s","entities":[],"constraints":[],"externalRefs":[{"id":1,"kind":"project","source":{"kind":"warp","bodyId":"b"},"entityIds":[1]}]}`,
      `op updateSketch {"sketchId":"s","entities":[],"constraints":[],"externalRefs":[{"id":1,"kind":"project","source":{"kind":"bodyEdge","bodyId":"b","topologyRef":{"nodeId":"1","entityId":2}},"entityIds":[1]}]}`,
      `op updateSketch {"sketchId":"s","entities":[],"constraints":[],"externalRefs":[{"id":1,"kind":"project","source":{"kind":"sketchEntity","sketchId":"a","entityId":1},"entityIds":"x"}]}`,
    ];
    for (const dsl of bad)
      expect(() => dslToOps(dsl)).toThrow(OpDslParseError);
  });
});
