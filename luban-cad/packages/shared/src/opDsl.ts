/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * op DSL v1（RW2-T5）：FeatureOp 链 ↔ 可读 DSL 双向序列化——「KCL 等价物」第一步。
 * 定位=序列化格式而非语言（spec 裁决#1）：每行一 op，既是人审 diff 载体也是 AI 生成目标表示。
 *
 * DSL 形态（v1）：
 *   op <kind> [featureType] {json payload} [// 注释]
 * - kind：FeatureOp 判别联合的 10 分支判别键；
 * - featureType：仅 insertFeature 接受（必填）；updateParams 的参数 schema 双键定位
 *   （kind+featureType）由服务端按 featureId 解析，DSL 层不重复承载（往返恒等不丢信息）；
 * - payload：insertFeature 直接为 params 对象，其余 kind 为 op 除 kind/featureType 外全部字段的 JSON（紧凑单行）；
 * - 注释：`//` 后内容解析即丢弃、发射不产注释——往返只对 op 语义恒等（选型记录见 RW2-T5 报告）；
 *   剥离须字符串感知（JSON 字符串值内的 // 不视为注释起点）。
 *
 * 恒等契约：
 * - 发射端 JSON.stringify(params) 恒写 op 对象已携带的全部键（含 schema 默认值如 fillet 的
 *   propagateSmooth:true）——防「序列化→zod parse（.default 补全/未知键剥离）→再序列化」不恒等；
 * - 解析端结构校验（kind 白名单/featureType 白名单/字段形态/纯对象 payload），未知键剥离即规范化
 *   （对齐 zod 非严格对象语义）；params 深层校验不在本层——经 validate 注入（私有仓
 *   FeatureTypeRegistry 的 zod schema 由 modeling-server 侧接线，shared 包不依赖 zod）。
 *
 * M6-a v1.6 同步：insertSketch 增可选 plane（SketchPlaneDto：origin/normal/xDir 三向量，世界系米制）——
 * 发射端恒写已携带的 plane，解析端按形态校验后透传（缺省不带，保持旧 DSL 文本逐字稳定）。
 */
import type { FeatureOp, FeatureParams, LubanFeatureType } from "./rpc/LubanFeatureRpcInterface.js";

/** 注入校验器（zod 接线位）：逐 op 调用，可抛错拒收或返回规范化 op（如 .default 补全）。 */
export type OpDslValidator = (op: FeatureOp, index: number) => FeatureOp;
export interface OpDslParseOptions { validate?: OpDslValidator }

/** DSL 解析错误：带 1 基行号（人审 diff 定位）。 */
export class OpDslParseError extends Error {
  public constructor(public readonly lineNo: number, message: string) {
    super(`第 ${lineNo} 行: ${message}`);
    this.name = "OpDslParseError";
  }
}

const FEATURE_TYPES: readonly LubanFeatureType[] = ["extrude", "booleanAdd", "booleanSubtract", "fillet", "chamfer", "shell"];
const OP_KINDS: readonly FeatureOp["kind"][] = [
  "insertFeature", "updateParams", "deleteFeature", "setFeatureSuppressed", "reorderFeature",
  "updateSketchConstraint", "insertSketch", "updateSketch", "deleteSketch", "undo", "redo",
];
const OP_KIND_SET = new Set<string>(OP_KINDS);

// =============================================================================
// 发射（op 链 → DSL 文本）
// =============================================================================

/** FeatureOp 链 → DSL 文本（每行一 op，\n 连接；空链 → 空串）。 */
export function opsToDsl(ops: FeatureOp[]): string {
  return ops.map(opToLine).join("\n");
}

function opToLine(op: FeatureOp): string {
  switch (op.kind) {
    case "insertFeature":
      return `op insertFeature ${op.featureType} ${JSON.stringify(op.params)}`;
    case "updateParams":
      return `op updateParams ${JSON.stringify({ featureId: op.featureId, params: op.params })}`;
    case "deleteFeature":
      return `op deleteFeature ${JSON.stringify({ featureId: op.featureId })}`;
    case "setFeatureSuppressed":
      return `op setFeatureSuppressed ${JSON.stringify({ featureId: op.featureId, suppressed: op.suppressed })}`;
    case "reorderFeature":
      return `op reorderFeature ${JSON.stringify({ featureId: op.featureId, to: op.to })}`;
    case "updateSketchConstraint":
      return `op updateSketchConstraint ${JSON.stringify({ sketchId: op.sketchId, constraintId: op.constraintId, value: op.value })}`;
    case "insertSketch":
      // M6-a v1.6：plane 为可选声明字段——携带时恒写（往返恒等），缺省时保持旧文本形态
      return `op insertSketch ${JSON.stringify(op.plane === undefined
        ? { entities: op.entities, constraints: op.constraints }
        : { entities: op.entities, constraints: op.constraints, plane: op.plane })}`;
    case "updateSketch":
      return `op updateSketch ${JSON.stringify({ sketchId: op.sketchId, entities: op.entities, constraints: op.constraints })}`;
    case "deleteSketch":
      return `op deleteSketch ${JSON.stringify({ sketchId: op.sketchId })}`;
    case "undo":
      return "op undo {}";
    case "redo":
      return "op redo {}";
  }
}

// =============================================================================
// 解析（DSL 文本 → op 链）
// =============================================================================

/** DSL 文本 → FeatureOp 链。空行/整行注释跳过；结构非法抛 OpDslParseError（带行号）。 */
export function dslToOps(dsl: string, options?: OpDslParseOptions): FeatureOp[] {
  const ops: FeatureOp[] = [];
  const lines = dsl.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (line === "")
      continue;
    const op = parseLine(line, i + 1);
    ops.push(options?.validate ? options.validate(op, ops.length) : op);
  }
  return ops;
}

/** 注释剥离（字符串感知：JSON 字符串值内的 // 与转义引号不参与判定）。 */
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") { inString = true; continue; }
    if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

function parseLine(line: string, lineNo: number): FeatureOp {
  if (!line.startsWith("op") || (line.length > 2 && !/\s/.test(line[2])))
    throw new OpDslParseError(lineNo, `行须以 "op <kind>" 开头: ${line}`);
  let rest = line.slice(2).trimStart();
  const kindEnd = rest.search(/\s/);
  const kind = kindEnd === -1 ? rest : rest.slice(0, kindEnd);
  if (!OP_KIND_SET.has(kind))
    throw new OpDslParseError(lineNo, `未知 op kind: ${kind}`);
  rest = kindEnd === -1 ? "" : rest.slice(kindEnd).trimStart();
  // featureType 令牌：仅当下一个令牌非 { 起始时取（insertFeature 必填，其余 kind 携带即拒收）
  let featureType: string | undefined;
  if (rest !== "" && rest[0] !== "{") {
    const ftEnd = rest.search(/\s/);
    featureType = ftEnd === -1 ? rest : rest.slice(0, ftEnd);
    rest = ftEnd === -1 ? "" : rest.slice(ftEnd).trimStart();
  }
  if (rest === "" || rest[0] !== "{")
    throw new OpDslParseError(lineNo, `payload 须为单行 {...} JSON: ${line}`);
  let payload: unknown;
  try {
    payload = JSON.parse(rest);
  } catch {
    throw new OpDslParseError(lineNo, `payload 不是合法 JSON: ${rest.slice(0, 100)}`);
  }
  if (!isPlainObject(payload))
    throw new OpDslParseError(lineNo, "payload 须为 JSON 对象（非数组/标量/null）");
  return buildOp(lineNo, kind as FeatureOp["kind"], featureType, payload);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 逐 kind 结构校验 + 规范化（未知键剥离，对齐 zod 非严格对象语义；只保留声明字段）。 */
function buildOp(lineNo: number, kind: FeatureOp["kind"], featureType: string | undefined, p: Record<string, unknown>): FeatureOp {
  const err = (msg: string): OpDslParseError => new OpDslParseError(lineNo, `${kind}: ${msg}`);
  const asStr = (v: unknown, name: string): string => {
    if (typeof v !== "string") throw err(`${name} 须为 string`);
    return v;
  };
  const asNum = (v: unknown, name: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw err(`${name} 须为 number`);
    return v;
  };
  const asBool = (v: unknown, name: string): boolean => {
    if (typeof v !== "boolean") throw err(`${name} 须为 boolean`);
    return v;
  };
  const asArr = (v: unknown, name: string): unknown[] => {
    if (!Array.isArray(v)) throw err(`${name} 须为数组`);
    return v;
  };
  const asObj = (v: unknown, name: string): Record<string, unknown> => {
    if (!isPlainObject(v)) throw err(`${name} 须为对象`);
    return v;
  };
  /** M6-a v1.6：SketchPlaneDto 向量形态（{x,y,z} 全 number；世界系米制，深层正交性归内核/服务端裁决） */
  const asVec3 = (v: unknown, name: string): { x: number; y: number; z: number } => {
    const o = asObj(v, name);
    return { x: asNum(o.x, `${name}.x`), y: asNum(o.y, `${name}.y`), z: asNum(o.z, `${name}.z`) };
  };
  const noFeatureType = (): void => {
    if (featureType !== undefined) throw err("featureType 令牌仅 insertFeature 接受");
  };

  switch (kind) {
    case "insertFeature": {
      if (featureType === undefined)
        throw err("须带 featureType（双键 kind+featureType 定位 schema）");
      if (!FEATURE_TYPES.includes(featureType as LubanFeatureType))
        throw err(`未知 featureType: ${featureType}（合法: ${FEATURE_TYPES.join("/")}）`);
      return { kind, featureType: featureType as LubanFeatureType, params: p as unknown as FeatureParams };
    }
    case "updateParams":
      noFeatureType();
      return { kind, featureId: asStr(p.featureId, "featureId"), params: asObj(p.params, "params") as unknown as FeatureParams };
    case "deleteFeature":
      noFeatureType();
      return { kind, featureId: asStr(p.featureId, "featureId") };
    case "setFeatureSuppressed":
      noFeatureType();
      return { kind, featureId: asStr(p.featureId, "featureId"), suppressed: asBool(p.suppressed, "suppressed") };
    case "reorderFeature":
      noFeatureType();
      return { kind, featureId: asStr(p.featureId, "featureId"), to: asNum(p.to, "to") };
    case "updateSketchConstraint":
      noFeatureType();
      return { kind, sketchId: asStr(p.sketchId, "sketchId"), constraintId: asNum(p.constraintId, "constraintId"), value: asNum(p.value, "value") };
    case "insertSketch": {
      noFeatureType();
      const entities = asArr(p.entities, "entities");
      const constraints = asArr(p.constraints, "constraints");
      if (p.plane === undefined)
        return { kind, entities, constraints } as unknown as FeatureOp;
      // M6-a v1.6：plane 为声明字段（不再按未知键剥离），形态校验后透传
      const plane = asObj(p.plane, "plane");
      return {
        kind, entities, constraints,
        plane: { origin: asVec3(plane.origin, "plane.origin"), normal: asVec3(plane.normal, "plane.normal"), xDir: asVec3(plane.xDir, "plane.xDir") },
      } as unknown as FeatureOp;
    }
    case "updateSketch":
      noFeatureType();
      return { kind, sketchId: asStr(p.sketchId, "sketchId"), entities: asArr(p.entities, "entities"), constraints: asArr(p.constraints, "constraints") } as unknown as FeatureOp;
    case "deleteSketch":
      noFeatureType();
      return { kind, sketchId: asStr(p.sketchId, "sketchId") };
    case "undo":
    case "redo":
      noFeatureType();
      return { kind };  // payload 未知键剥离（规范化语义）
  }
}
