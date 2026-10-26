// Onshape qCompressed 边查询解码器（Wave 3 v6 增量）
//
// 背景（Isomantle 实数实证，2026-10-26）：
//   fillet/chamfer 的 entities.queries[] 有两族形态：
//   1) 可读 makeQuery(...) —— 已有 v5 解析器（corpus-to-ir.js edgeRefFromQuery）。
//   2) qCompressed(1.0,"<payload>",id) —— payload 有两种：
//      a. `%B5$Query...`：内联紧凑 DSL（未压缩，语料最常见）。
//      b. `&<hex长度>$<base64>`：base64 解码后是 zlib(deflate) 压缩的 `%B5$...` DSL。
//         注意声明长度是**十六进制**（0x214=532 字节，全语料 230 条 zlib 载荷逐一验证
//         声明长度 == inflate 后字节长度）。
//
// DSL 结构（B5 版）不是自由文本，而是带字典回指的紧凑序列：
//   - 字符串首次出现形如 `S<码>$<原文>`，重复出现只留回指 `S<码>` / `R<码>`；
//   - 源特征形如 `<featureId>op<Op>`（如 `F0rTG271Y1X9Wh3_3opExtrude`）；
//     草图输入是 `<sketchFeatureId>wireOp`（wireOp 不是源特征，必须排除）；
//   - 外层查询类型在源 op 之后以回指键 + 值出现：`opExtrudeRbS8$CAP_EDGE`；
//   - originals 内层草图查询会以**字面量**出现一次：`queryTypeSd$SKETCH_ENTITYSe`
//     （值后紧跟的单个大写字母是结构码，不是类型名的一部分）。
//
// 本模块只做**诚实解析**：解不出的形态返回 null，由转换器停链，不做几何猜测。
// 只使用 node:zlib（无第三方依赖）。
const zlib = require('node:zlib');

/** qCompressed 载荷截取（内层引号在原始 JSON 中为 \"，解析成 JS 字符串后就是普通 "）。 */
const PAYLOAD_RE = /qCompressed\(1\.0,"([\s\S]*?)",id\);/;

/**
 * qCompressed 查询串 → { compressed, version, dsl }；不可识别一律 null。
 * - 内联：payload 以 `%B5$` 开头 → compressed=false，dsl 原样返回。
 * - 压缩：`&<hex 长度>$<base64>` → base64 解码 + zlib.inflateSync → `%B5$...`。
 *   声明长度（hex 解析）必须等于 inflate 后字节长度；base64 字符集/压缩流/版本前缀
 *   任一不符即 null（宁可停链，不把损坏载荷当有效查询）。
 * 目前实证只有 B5 版 DSL，其他 `%B<x>$` 版本不猜测 → null。
 */
function decodeQCompressed(queryString) {
  if (typeof queryString !== 'string') return null;
  const m = queryString.match(PAYLOAD_RE);
  if (!m) return null;
  const payload = m[1];

  // 形态 a：内联未压缩 DSL。
  if (payload.startsWith('%B5$')) return { compressed: false, version: 'B5', dsl: payload };

  // 形态 b：&<hex 长度>$<base64>（长度是十六进制；语料实证）。
  const zm = payload.match(/^&([0-9a-f]+)\$([A-Za-z0-9+/]+={0,2})$/);
  if (!zm) return null;
  const declared = parseInt(zm[1], 16);
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.from(zm[2], 'base64'));
  } catch {
    return null; // 非 zlib/deflate 流、base64 损坏等
  }
  if (raw.length !== declared) return null; // 声明长度不符 → 损坏/截断
  const dsl = raw.toString('utf8');
  if (!dsl.startsWith('%B5$')) return null; // 未知 DSL 版本不解析
  return { compressed: true, version: 'B5', dsl };
}

// ---------------------------------------------------------------------------
// DSL token 提取
// ---------------------------------------------------------------------------

/** 源 op 记号：`<featureId>op<CamelCaseOp>`，op 名后紧跟结构回指 `R<小写字母>`。
 * 非贪婪匹配 + 结构回指边界，避免把 `RbS8` 之类的结构码吃进 op 名（v6 实测坑：
 * 贪婪 `[A-Za-z]+` 会把 opExtrudeRbS8 解析成 op 名 "ExtrudeRbS"）。
 * 排除 `wireOp`（草图输入）与 `importOp`（单独识别）。 */
const OP_TOKEN_RE = /([A-Za-z0-9_-]+)op([A-Z][A-Za-z]*?)R[a-z]/g;
/** 导入源特征：`<featureId>importOp`（后接 S 码，无 R 回指），单独计入源 op 集。 */
const IMPORT_TOKEN_RE = /([A-Za-z0-9_-]+)importOp/g;

/** 草图实体短码：`sketchEntityIdS<码>$<token>`。
 * token 原文形如 `NFV8fKBSOMIUR4R5R6R7`——前缀 `NFV8fKBSOMIU` 是草图段 entityId，
 * 后缀 `R4R5R6R7` 是拓扑/包围盒消歧结构码（v6 控制器实证；转换器按最长前缀回映）。
 * 边界=下一个 `S<码>$` 结构键（码可含负号/点，如 `S-12.1$`）。 */
const SKETCH_ENTITY_ID_RE = /sketchEntityIdS[0-9a-z.+-]+\$([A-Za-z0-9._-]+?)(?=S[0-9a-z.+-]+\$|$)/g;
/** 草图特征：`<featureId>wireOp`（originals 里的草图输入）。 */
const SKETCH_FEATURE_RE = /([A-Za-z0-9_-]+)wireOp/g;

/** 已知查询类型（用于去掉字面量后面粘着的单字母结构码，如 SKETCH_ENTITYS → SKETCH_ENTITY）。 */
const KNOWN_QUERY_TYPES = [
  'SKETCH_ENTITY', 'CAP_EDGE', 'SWEPT_EDGE', 'CAP_FACE', 'SWEPT_BODY', 'CAP_BODY',
  'BODY', 'FACE', 'EDGE', 'VERTEX', 'IMPORT',
];
function normalizeQueryType(raw) {
  // 结构码是单个大写字母（语料实证：SKETCH_ENTITYSe、IMPORTC、IMPORTR）。
  if (raw.length > 1) {
    const head = raw.slice(0, -1);
    if (KNOWN_QUERY_TYPES.includes(head)) return head;
  }
  return raw;
}

/**
 * DSL → 所有「查询类型 token」，按出现位置升序。
 * 两处来源：
 *   1) 字面量键 `queryType...$<TYPE>`（originals 内层草图查询）；
 *   2) 源 op 尾部回指形态 `op<Op>R<a-z>S<码>$<TYPE>`（外层查询自身的 queryType）。
 * 外层 token 在源 op 之后，位置最靠后 → 取最后一个即为外层查询类型（任务口径）。
 */
function queryTypeTokens(dsl) {
  const hits = [];
  for (const m of dsl.matchAll(/queryType[^$]*\$([A-Z][A-Z0-9_]*)/g)) {
    hits.push({ index: m.index, type: normalizeQueryType(m[1]) });
  }
  for (const m of dsl.matchAll(/op[A-Z][A-Za-z]*?R[a-z]S[0-9a-z.]+\$([A-Z][A-Z0-9_]*)/g)) {
    hits.push({ index: m.index, type: normalizeQueryType(m[1]) });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/**
 * DSL → { sourceFeatureId, sourceOp, queryType, isStart, sketchEntityIds, sketchFeatureIds }；
 * 不可解析/多源/缺字段 → null。
 *
 * 解析规则（诚实边界）：
 * - 源 op 集：opExtrude/opRevolve/opBoolean/... 以及 importOp；按 `featureId|op` 去重。
 *   必须**唯一**且为 Extrude|Revolve —— 多源（derivedFrom/boolean 复合链，如 Fillet 6
 *   同时含 opExtrude+opBoolean）一律 null，不猜。
 * - queryType：取 DSL 中最后一个 queryType token（见 queryTypeTokens）。
 * - isStart：最后一次出现的 `isStart F/T`；DSL 未携带时缺省 false。
 * - sketchEntityIds：`sketchEntityId` token 的**原文**数组（含 R4R5R6R7 等消歧后缀，
 *   不在此层截断；转换器按源草图 entityId 最长前缀回映）。
 * - sketchFeatureIds：DSL 中 `...wireOp` 的草图 featureId 集合（去重，保持出现序）。
 */
function parseEdgeQuery(dsl) {
  if (typeof dsl !== 'string' || !dsl.startsWith('%B5$')) return null;

  // ---- 源 op 集 ----
  const opMatches = [...dsl.matchAll(OP_TOKEN_RE)].map((m) => ({ featureId: m[1], op: m[2] }));
  for (const m of dsl.matchAll(IMPORT_TOKEN_RE)) {
    opMatches.push({ featureId: m[1], op: 'Import' });
  }
  // 去重：同一源特征在 DSL 里可能被引用多次，按 featureId+op 合并后才判「唯一源」。
  const unique = new Map();
  for (const tok of opMatches) unique.set(tok.featureId + '|' + tok.op, tok);
  if (unique.size !== 1) return null; // 多源/无源 → 不解析
  const src = [...unique.values()][0];
  if (src.op !== 'Extrude' && src.op !== 'Revolve') return null; // 唯一源必须是拉伸/回转

  // ---- 外层查询类型：最后一个 queryType token ----
  const types = queryTypeTokens(dsl);
  if (!types.length) return null;
  const queryType = types[types.length - 1].type;

  // ---- isStart：最后一次出现为准，缺省 false ----
  const starts = [...dsl.matchAll(/isStart([FT])/g)];
  const isStart = starts.length ? starts[starts.length - 1][1] === 'T' : false;

  // ---- 草图实体短码（原文）+ 草图特征（去重保序）----
  const sketchEntityIds = [...dsl.matchAll(SKETCH_ENTITY_ID_RE)].map((m) => m[1]);
  const sketchFeatureIds = [...new Set([...dsl.matchAll(SKETCH_FEATURE_RE)].map((m) => m[1]))];

  return { sourceFeatureId: src.featureId, sourceOp: src.op, queryType, isStart, sketchEntityIds, sketchFeatureIds };
}

module.exports = { decodeQCompressed, parseEdgeQuery };
