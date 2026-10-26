// IR 转换器 v2：docs/*.json（BTM 树）→ replay-cases/*.json（回放用例）
// 设计：REPLAY-DESIGN.md。几何直放优先；波次分类；金标准=massProperties.volume（米³）。
//
// v2 修复（2026-10-25，首跑 3 用例暴露的坑）：
// 1. extrude depth=0 根因：BTMParameterQuantity-147 的数值真值在 `expression`（"200 mm"/"25.0*in"
//    等字符串形态），`value` 恒 0 且 `units` 恒空。修复=parseQuantity 解析 expression（单位表换算米/弧度）。
//    语料实证：extrude/depth 全量 130 处中 129 处可解析（in/mm/millimeter），仅 1 处变量表达式
//    （"#Depth"）→ 该 PS 判参数缺口停链。
// 2. line 端点 null 根因：startParam/endParam 挂在**线段层**（BTMSketchCurveSegment-155.startParam），
//    不在 geometry（BTCurveGeometryLine-117 只有 pnt/dir 四字段）。v1 读 g.startParam → undefined →
//    NaN → JSON null。修复=从段层取（语料 869/869 线段全带段层参数）。
// 3. arc 中心/角度缺失根因：BTCurveGeometryCircle-115 字段名是 xCenter/yCenter/xDir/yDir/clockwise
//    （非 v1 假设的 pntX/pntY）；参数区间同挂在段层。修复=新字段名 + 段层参数。
//    【弧遍历方向实证裁决】clockwise 只编码**遍历方向**（区域几何无关）：占用角区间恒为
//    [startParam, endParam]（(xDir,yDir) 框架、CCW 增向）。证据=全语料切线连续性投票：
//    448 处弧-线相接关节（62 个 cw 弧 + 339 个非 cw 弧作对照）全部唯一支持「区间 [sp,ep] CCW」
//    解释（cw 反向解释 0 票）——弧上点 p(t)=c+r(cos(φ+t),sin(φ+t))，φ=atan2(yDir,xDir)。
//    转出恒为正 sweep（我们的 arc DTO 正 sweep=CCW），无孔洞歧义。
// 4. 无几何实体（BTMSketchPoint-158/Image/Text 126+21 处）不再误判 unsupported——点是辅助锚，跳过不计数。
// 5. 面域选择裁决（Wave 1）：extrude entities 查询的 deterministicIds=Onshape 面域确定性 id（文档级
//    不透明短码，如 "JGG"），无法静态映射到我们「面积降序」下标语义。诚实降级：
//    - deterministicIds 空 → 语义=整张草图的全部面域 → IR regions:"all"（执行器运行期按
//      sketchRegionsFrom 实际面域数全选——与我们 v1.8 regions 数组语义对齐）。
//    - deterministicIds 非空且尚无 sidecar → best-effort regions:[0]（最大面域）+ regionRisk。
//    【v4 已升级】feature-eval sidecar 提供 id→areaM2 时生成 regionAreas，执行器按面积唯一
//    直选；只有无法取得/无法唯一匹配时才回退上述 regionRisk 试拍，不再把短码当永久黑盒。
// 6. 链截断语义（设计裁决 4）：newSketch/extrude(可解析)/revolve(可解析)之外的特征出现 → 该 PS
//    降级 smoke（截断回放，建链不断言体积），stop 记录截断点。
//
// v3（2026-10-25，Wave 2 ①）revolve 接线：
// 1. 【关键发现：轴查询可静态精确映射】BTMSketchCurveSegment-155 携带 `entityId`（长码
//    "McPwp6kN-IiBK-HWLg-CgWs-7bWwRxVko9UJ" 形态），revolve 的 axis 查询
//    `sketchEntityQuery(id+"…wireOp",EntityType.EDGE,"<长码>")` 的长码与语料线段的 entityId
//    逐一相符（两 PS 全部 revolve 实证）——axis → 草图线实体下标是精确映射，非猜测。
//    同理 profile 的 imprint 派生边查询（makeQuery IMPRINT FACE + derivedFrom EDGE 长码 +
//    topologyDisambiguation ±1.0）也能映射到线段下标。
// 2. 【仍歧义：面域身份】imprint face 的 ±1.0 侧选语义（边方向哪一侧）与直引草图的
//    deterministicIds 短码（"JSC" 族，与 W1 extrude 的 "JGG" 同族）都无静态映射 → regionRisk
//    + regionIndex 0（最大面域 best-effort），与 W1 extrude 同口径；full 模式由执行器做
//    regionIndex 枚举试拍。profileEdges/disambig 记入 IR 留痕供后续精化。
// 3. 参数映射（Onshape revolve parameters 全量实测，两 PS 4 特征）：operationType(NEW/ADD)、
//    bodyType(SOLID)、endBound/startBound(BLIND)、fullRevolve(bool)、angle/angleBack
//    （BTMParameterQuantity-147 expression 真值 "30.0*degree"）、symmetric(bool)、
//    hasStartBound(bool)、oppositeDirection(bool)。fullRevolve=true 时 angle/angleBack 是
//    相位拆分（30°+330°=360°，旋转起点偏置）——对全周体形状/体积无影响，忽略并记账；
//    fullRevolve=false 时 angle 必须可解析、angleBack≠0 我方契约无对应 → 停链；
//    symmetric 我方 RevolveParams 无对应 → 停链。
// v5（2026-10-26，Wave 3）fillet/chamfer 接线：
// 1. 边引用可静态解析形态（Isomantle 实证）：`makeQuery(id+"<源特征>.opRevolve",
//    "SWEPT_EDGE",…)` + `originalSetDisambiguation([sketchEntityQuery(…wireOp,
//    EntityType.EDGE,"<段长码>"), …])`。一条查询通常携 **2 条相邻草图边**——被选中的
//    是二者**共享顶点**绕轴扫出的圆边（ORIGINAL_DEPENDENCY 去歧义语义）。三处独立
//    体积实证（fillet 1 / chamfer 1 双查询 / fillet 2）偏差 ≤9.2e-13 m³。
// 2. `qCompressed(...)` 形态（Fillet 5/6/7、Chamfer 2）不可静态解析 → 诚实停链
//    edge-query-unresolvable，不猜。
// 3. 参数：fillet radius + tangentPropagation→propagateSmooth；chamfer
//    EQUAL_OFFSETS→mode 1(Length)、TWO_OFFSETS→mode 2(Distances)、
//    OFFSET_ANGLE→mode 3(DistanceAngle)；oppositeDirection/variable radius/
//    非 CIRCULAR 截面 → 停链。边引用只接受源特征为已接线 revolve（其他源 → 停链）。
// v6（2026-10-26，Wave 3 下一增量）qCompressed 解码器 + CAP_EDGE 接线：
// 1. qcompressed-lib.js 解码 `%B5$` 内联 DSL 与 `&<hex 长度>$base64` zlib 压缩 DSL
//    （声明长度是十六进制；全语料 230 条 zlib 载荷逐一验证 == inflate 字节数）。
//    parseEdgeQuery 只接受**唯一**源 op（Extrude/Revolve）；Fillet 6 这类
//    opExtrude+opBoolean 复合链 → null → 停链 edge-query-unresolvable（不猜）。
// 2. 边引用统一加 kind：
//    - 可读 makeQuery（源 revolve）→ kind='vertex'（v5 共享顶点语义不变）；
//    - 压缩 CAP_EDGE（源 extrude）→ kind='cap-edge'（sourceFeatureId + isStart +
//      sketchEntityId）。v6.1 起 IR 草图实体携带语料段 entityId 原字符串；
//      query 的 sketchEntityId token（如 NFV8fKBSOMIUR4R5R6R7）按源拉伸草图的
//      entityId 最长前缀回映为 base id（NFV8fKBSOMIU），执行器可精确匹配盖边，
//      无需组合试拍；无匹配/歧义 → 停链 edge-sketch-entity-unmapped（不猜）。
//    其他 queryType（SWEPT_EDGE 等）→ 停链 edge-query-<type>；源非 Extrude →
//    edge-query-source-<op>；源特征未入 IR → edge-source-not-wired。
// 3. extrude operationType 增加 REMOVE（NEW/ADD/REMOVE）；其余校验**严格照旧**：
//    非 BLIND 边界一律停链（含 REMOVE+UP_TO_SURFACE）。控制器实测裁决（2026-10-26）：
//    Isomantle Extrude 2 的 UP_TO_SURFACE + oppositeDirection 与后续 Extrude 3 的几何
//    在默认草图平面近似下不可保真，放行会让 Fillet 5 的 CAP_EDGE 在错误几何上不可匹配
//    （执行器已实证）；故 Isomantle 必须在 Extrude 2 严格停链 endBound-UP_TO_SURFACE。
//    REMOVE 入 IR 与 cap-edge/entityId 能力保留，供未来 BLIND REMOVE 语料使用。
// v7（2026-10-26，Wave 3）Calculate Extrude 2：imprint 面驱动 + symmetric：
// 1. queryStringId 兼容名字两侧无空格的 `id+"<featureId>.wireOp"` / `.imprint` / `.opXxx"`
//    形态（v2 正则要求 `id + "` 带空格，Calculate 实证为 `id+"FfZ….wireOp"`），
//    捕获后取**第一个 `.` 之前**的纯 featureId（featureId 本身不含点）。
//    Extrude 2 的 entities 查询无 featureId：Sketch 2 的 imprint 面（`.imprint`/IMPRINT），
//    归一后唯一命中已建草图 → 照常按该草图处理；确定性 id（JJC）由 sidecar 面积锚定，
//    regionAreas=[0.012788027003996286]，regionRisk=false（无需面域试拍）。
// 2. extrude IR 增加 symmetric（仅参数 true 时下发；缺省省略）。Onshape symmetric=true 的
//    depth 是**总深**，与我方 ExtrudeParams 的 ±distance/2 语义一致，不折半。
//    Calculate Extrude 2：NEW/SOLID/BLIND/symmetric/12 in → distance=0.3048 m。
// 3. calculateBounds 从 IGNORED 移出 → 停链 feature-not-wired：它创建包围盒体，改变总体积
//    （Calculate 文档第二条 calculateBounds 使总体积 0.0041854→0.0214104 m³），继续忽略会
//    让用例误判 full 且污染金标准。
// v8（2026-10-26，Wave 3）Chamfer 1（Calculate）边引用接线：
// 1. 可读查询的 CAP_EDGE（源为已建 extrude）→ cap-edge ref：originalSetDisambiguation 的
//    EDGE 长码映射到源拉伸草图 IR 实体（精确 entityId 优先，其次前缀唯一命中）；
//    isStart 从 queryString 的 `"isStart":true|false` 解析（缺省 false）。
//    Calculate q0：源 Extrude 2 + 斜线 iRVg… + isStart=false（+z 盖边）。
// 2. 压缩查询的 CAP_EDGE 维持 v6 通路（源 extrude）；新增 SWEPT_EDGE（源 extrude）→
//    swept-edge ref：token 经最长前缀回映为草图实体（q2 → 9RlTx….bottom），
//    并从 DSL 的 `$left|$right|$top|$bottom` 最后一次出现取端点侧 side hint
//    （q2 → left，即底边左端点；无 hint 则省略，执行器试两端）。
//    【正则实证】side 后直接粘结构码（`$leftR4R5…`），t/R 同为单词字符 → `\b` 不成立；
//    改用「右侧非小写字母」界定，否则 side 恒缺失。
// 3. 同一 fillet/chamfer 可混合 vertex / cap-edge / swept-edge refs；cap/swept 之间只要求
//    同源（执行器契约），不再要求同 isStart（q0/q1 分别取 +z/−z 盖边，本就异侧）。
//    Calculate Chamfer 1：TWO_OFFSETS → mode 2，values1=2.5in(0.0635)、values2=1in(0.0254)，
//    3 个 refs；其后 Extrude 3（ADD）+ calculateBounds 停链。
// 4. transform 补入 IGNORED（原注释已声明「仅 TRANSLATION_3D 放行」，集合却漏项）：
//    Calculate Transform 2=TRANSLATION_3D → 跳过；其余 transform 仍在分支内停链。
//    否则链会误断在 Extrude 3 之前，到不了 calculateBounds。
const fs = require('fs');
const path = require('path');
const { decodeQCompressed, parseEdgeQuery } = require('./qcompressed-lib.js');

const DOCS = path.join(__dirname, 'corpus', 'docs');
const OUT = path.join(__dirname, 'replay-cases');
fs.mkdirSync(OUT, { recursive: true });

// 可回放面（转换器能转出 ops 的特征）
const SKETCH = 'newSketch';
const EXTRUDE = 'extrude';
const REVOLVE = 'revolve';
const FILLET = 'fillet';
const CHAMFER = 'chamfer';
// 体积无关特征（注解/视图/变量——不改实体体积，回放时跳过）：
// transform 仅当 transformType=TRANSLATION_3D（纯平移，位置不变体积）才忽略；
// 其余 transform（COPY/ROTATION/SCALE/MATE_CONNECTORS）保守判停链。
const IGNORED = new Set(['arrow', 'surfaceTextWrapped', 'tagProfile', 'partName',
  'cPlane', 'mateConnector', 'fitSpline', 'threePoint', 'assignVariable', 'queryVariable',
  'simplifiedRep', 'partNumber',
  // v8：transform 按上方口径入集合（仅 TRANSLATION_3D 放行；其余在分支内停链）。
  // 此前遗漏导致 Calculate 的纯平移 Transform 2 被误判 feature-not-wired，链断在
  // Extrude 3 之前。
  'transform']);
// 生态特征（出现即整 PS 标记 ecosystem，不回放）
const ECOSYSTEM = ['wire', 'harness', 'mold', 'sheetMetal', 'Beam', 'SpurGear', 'planetary'];

// ---------------------------------------------------------------------------
// quantity 解析：expression 真值（"200 mm" / "25.0*in" / "45.0*degree" / 裸数）→ 米或弧度
// ---------------------------------------------------------------------------
const LEN = new Map([['m', 1], ['meter', 1], ['meters', 1],
  ['mm', 0.001], ['millimeter', 0.001], ['millimeters', 0.001],
  ['cm', 0.01], ['centimeter', 0.01], ['centimeters', 0.01],
  ['in', 0.0254], ['inch', 0.0254], ['inches', 0.0254],
  ['ft', 0.3048], ['foot', 0.3048], ['feet', 0.3048]]);
const ANG = new Map([['deg', Math.PI / 180], ['degree', Math.PI / 180], ['degrees', Math.PI / 180],
  ['rad', 1], ['radian', 1], ['radians', 1]]);
/** 解析 BTMParameterQuantity-147：优先 expression（真值所在），回退 value+units。
 * kind='length' 返回米，'angle' 返回弧度；不可解析返回 null。 */
function parseQuantity(prm, kind) {
  const table = kind === 'angle' ? ANG : LEN;
  const tryParse = (num, unit) => {
    if (num === undefined || num === null || Number.isNaN(num)) return null;
    if (!unit) return num; // 裸数：按基准单位（米/弧度）
    const k = table.get(unit.toLowerCase());
    return k === undefined ? null : num * k;
  };
  if (typeof prm.expression === 'string') {
    const m = prm.expression.match(/^\s*(-?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*\*?\s*([a-zA-Z°]*)\s*$/);
    if (m) {
      const r = tryParse(parseFloat(m[1]), m[2] || prm.units);
      if (r !== null) return r;
    }
    return null; // 有 expression 但非平凡形态（变量/算式）→ 不猜，如实 null
  }
  return tryParse(prm.value, prm.units);
}

// ---------------------------------------------------------------------------
// 草图实体转换
// ---------------------------------------------------------------------------
const TWO_PI = 2 * Math.PI;
function convertEntity(seg, dropped) {
  const g = seg.geometry || {};
  switch (g.btType) {
    case 'BTCurveGeometryLine-117': {
      // 参数在段层（v2 修复 #2）：p1 = pnt + dir*startParam
      const sp = seg.startParam ?? g.startParam;
      const ep = seg.endParam ?? g.endParam;
      if (typeof sp !== 'number' || typeof ep !== 'number') { dropped.noParam++; return null; }
      const p1 = [g.pntX + g.dirX * sp, g.pntY + g.dirY * sp];
      const p2 = [g.pntX + g.dirX * ep, g.pntY + g.dirY * ep];
      if (!p1.every(Number.isFinite) || !p2.every(Number.isFinite)) { dropped.nan++; return null; }
      if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 1e-12) { dropped.degenerate++; return null; }
      return { kind: 'line', p1, p2, construction: !!seg.isConstruction };
    }
    case 'BTCurveGeometryCircle-115': {
      const center = [g.xCenter, g.yCenter];
      if (!center.every(Number.isFinite) || !(g.radius > 0)) { dropped.nan++; return null; }
      const phi = Math.atan2(g.yDir, g.xDir);
      const sp = seg.startParam, ep = seg.endParam;
      if (typeof sp !== 'number' || typeof ep !== 'number' || Math.abs(ep - sp) >= TWO_PI - 1e-9) {
        // 无段层参数（BTMSketchCurve-4 整圆形态，语料 61/333）或全周 → circle
        return { kind: 'circle', center, radius: g.radius, construction: !!seg.isConstruction };
      }
      // 弧：占用区间 [sp,ep] CCW（v2 裁决 #3，切线投票实证）；sweep 恒正（我们 DTO 正=CCW）
      let sweep = ep - sp;
      if (sweep <= 1e-12) { dropped.degenerate++; return null; }
      if (sweep >= TWO_PI - 1e-9) return { kind: 'circle', center, radius: g.radius, construction: !!seg.isConstruction };
      const startAngle = (phi + sp) % TWO_PI;
      return { kind: 'arc', center, radius: g.radius, startAngle, sweepAngle: sweep, construction: !!seg.isConstruction };
    }
    case undefined:
      // 点/图片/文字等无几何实体（BTMSketchPoint-158 等）——区域几何无关，跳过
      dropped.aux++;
      return null;
    default:
      // 样条等暂不支持几何（InterpolatedSpline/Spline）→ 停链信号
      dropped.unsupported.push(g.btType);
      return null;
  }
}

function convertSketch(ft, dropped) {
  const entities = [];
  const entityIdToIdx = new Map(); // 段 entityId（长码）→ IR entities 下标（v3：axis/profile 边映射键）
  for (const seg of ft.entities || []) {
    const e = convertEntity(seg, dropped);
    if (e && !e.construction) {
      if (seg.entityId && !entityIdToIdx.has(seg.entityId)) entityIdToIdx.set(seg.entityId, entities.length);
      // v6：保留语料段 entityId 原字符串（含 `.bottom` 等标签）——CAP_EDGE 短码回映键。
      entities.push({ ...e, entityId: seg.entityId });
    }
  }
  return { entities, entityIdToIdx };
}

// ---------------------------------------------------------------------------
// revolve 参数提取（v3）：parameters 全量形态见文件头注 v3 #3
// ---------------------------------------------------------------------------
/** 查询串里的 EDGE 长码（axis 直引 / imprint derivedFrom 共用形态）。 */
function edgeIdsInQuery(q) {
  const qs = typeof q.queryString === 'string' ? q.queryString : '';
  return [...qs.matchAll(/EntityType\.EDGE,"([A-Za-z0-9\-]+)"/g)].map(m => m[1]);
}
/** imprint 派生边的 disambiguation 权重（±1.0；侧选语义不可静态解析，仅留痕）。 */
function disambigInQuery(q) {
  const qs = typeof q.queryString === 'string' ? q.queryString : '';
  const m = qs.match(/\}\),\s*(-?[\d.]+)/);
  return m ? parseFloat(m[1]) : undefined;
}

function revolveParams(ft) {
  const P = {};
  for (const prm of ft.parameters || []) if (prm.parameterId) P[prm.parameterId] = prm;
  const fullRevolve = !!(P.fullRevolve && P.fullRevolve.value === true);
  const angle = fullRevolve ? undefined : (P.angle ? parseQuantity(P.angle, 'angle') : null);
  const angleBack = P.angleBack ? parseQuantity(P.angleBack, 'angle') : 0;
  const axisQ = ((P.axis && P.axis.queries) || []);
  const profileQ = ((P.entities && P.entities.queries) || []);
  return {
    operation: P.operationType ? P.operationType.value : undefined,
    bodyType: P.bodyType ? P.bodyType.value : undefined,
    endBound: P.endBound ? P.endBound.value : undefined,
    hasStartBound: !!(P.hasStartBound && P.hasStartBound.value === true),
    symmetric: !!(P.symmetric && P.symmetric.value === true),
    fullRevolve, angle, angleBack,
    axisQ, profileQ,
  };
}

// ---------------------------------------------------------------------------
// fillet / chamfer 参数提取（v5/v6/v8）
//
// 边引用两条通路（entities.queries[] 逐条）：
// 1) 可读 makeQuery（v5，Isomantle 实证；v8 扩展 CAP_EDGE）：
//   makeQuery(id+"<featureId>.opRevolve","SWEPT_EDGE",EntityType.EDGE,
//     {"disambiguationData":[originalSetDisambiguation([sketchEntityQuery(
//       id+"<sketchFeatureId>.wireOp",EntityType.EDGE,"<段 entityId 长码>")])]})
//    → 源回转特征 + 草图段长码。端点语义（三处独立体积实证，偏差 ≤9.2e-13 m³）：
//    SWEPT_EDGE 取草图段**终点**（p2）绕轴扫出的圆边，不是起点侧。
//   v8：同一形态的 queryType=CAP_EDGE + 源 `.opExtrude`（Calculate Chamfer 1 q0）
//    → cap-edge 引用（isStart 取自 `"isStart":true|false`，缺省 false）；EDGE 长码
//    映射到源拉伸草图 IR 实体（精确 entityId 优先，其次前缀唯一命中）。
// 2) qCompressed（v6）：qcompressed-lib.js 解码（%B5$ 内联 / &hex$ zlib），
//    parseEdgeQuery 只接受唯一源 op；本转换器消费源 Extrude 的：
//    - CAP_EDGE → cap-edge 引用（sourceFeatureId + isStart + sketchEntityId）；
//    - SWEPT_EDGE（v8）→ swept-edge 引用（sourceFeatureId + sketchEntityId + side?）；
//    sketchEntityId 由 query token 对源拉伸草图 IR 实体的 entityId 做最长前缀回映
//    （v6.1 精确映射）；swept-edge 的 side 取 DSL 内 `$left|$right|$top|$bottom`
//    最后一次出现（q2 → left），无 hint 则省略。
//    其他查询类型 → 停链 edge-query-<type>；多源/解不出 → edge-query-unresolvable；
//    短码无匹配/歧义 → edge-sketch-entity-unmapped。
// ---------------------------------------------------------------------------
function paramMap(ft) {
  const P = {};
  for (const prm of ft.parameters || []) if (prm.parameterId) P[prm.parameterId] = prm;
  return P;
}

/** entities 查询 → { sourceFeatureId, sourceOp, kind, entityLongIds[], isStart }；
 * 不可解析返回 null。一条查询可携 2 条草图边（ORIGINAL_DEPENDENCY 去歧义）——
 * 见 resolveEdgeVertex。isStart 供可读 CAP_EDGE 选盖侧（v8），缺省 false。 */
function edgeRefFromQuery(q) {
  const qs = typeof q.queryString === 'string' ? q.queryString : '';
  if (!qs.includes('makeQuery(')) return null;
  const src = qs.match(/id\+"([A-Za-z0-9_-]+)\.op(\w+)"/);
  const kind = qs.match(/makeQuery\([^,]+,\s*"([A-Z_]+)"/);
  const entityLongIds = [...qs.matchAll(/sketchEntityQuery\(id\+"[^"]+\.wireOp",\s*EntityType\.EDGE,\s*"([^"]+)"/g)]
    .map((m) => m[1]);
  if (!src || !kind || entityLongIds.length === 0) return null;
  const start = qs.match(/"isStart"\s*:\s*(true|false)/);
  return {
    sourceFeatureId: src[1], sourceOp: src[2], kind: kind[1], entityLongIds,
    isStart: start ? start[1] === 'true' : false,
  };
}

/** 可读 CAP_EDGE 的 EDGE 长码 → 源拉伸草图 IR 实体 entityId（v8）。
 * 先精确匹配段 entityId；否则按前缀双向唯一匹配（语料标签 `.top` 或消歧后缀）。
 * 无命中/歧义 → null（调用方停链，不猜）。 */
function resolveReadableSketchEntityId(entities, longId) {
  const usable = entities.filter((e) => typeof e.entityId === 'string' && e.entityId);
  const exact = usable.filter((e) => e.entityId === longId);
  if (exact.length === 1) return exact[0].entityId;
  if (exact.length > 1) return null;
  const hits = usable.filter((e) => e.entityId.startsWith(longId) || longId.startsWith(e.entityId));
  return hits.length === 1 ? hits[0].entityId : null;
}

/** 压缩 SWEPT_EDGE 的端点侧 hint（v8）：DSL 内 `$left|$right|$top|$bottom` 的最后一次
 * 出现。注意语料里 side 后直接粘结构码（`$leftR4R5…`；t/R 都是单词字符，`\b` 不成立，
 * 任务单的 `\b` 形态在此语料上匹配不到），故用「后面不是小写字母」作右界。
 * 实体 id 标签用 `.` 连接（`.bottom`），不是 `$` 结构键，不会被误识别。
 * 无 hint → undefined（执行器会试线段两端）。 */
function sweptSideInDsl(dsl) {
  if (typeof dsl !== 'string') return undefined;
  const hits = [...dsl.matchAll(/\$(left|right|top|bottom)(?![a-z])/g)];
  return hits.length ? hits[hits.length - 1][1] : undefined;
}

/** CAP_EDGE query token（含 R4R5R6R7 等消歧后缀）→ 源拉伸草图实体 entityId（最长前缀）。
 * v6 实证：token 前缀就是草图段 entityId（Fillet 5 的 3 个圆：NFV8fKBSOMIU 等）。
 * 线条实体的标签带点（`k0KT7h6eEokP.bottom`），query token 去点拼接
 * （`k0KT7h6eEokPbottom...`）——先按原 entityId 匹配，失败再按去点归一化匹配一次。
 * 无命中或等长歧义 → null（调用方停链 edge-sketch-entity-unmapped，不猜）。 */
function resolveSketchEntityId(entities, token) {
  const pick = (normalizeDots) => {
    let best = null;
    let probeLen = -1;
    let tie = false;
    for (const e of entities) {
      const eid = e.entityId;
      if (typeof eid !== 'string' || !eid) continue;
      const probe = normalizeDots ? eid.replace(/\./g, '') : eid;
      if (!token.startsWith(probe)) continue;
      if (probe.length > probeLen) { best = eid; probeLen = probe.length; tie = false; }
      else if (probe.length === probeLen) tie = true;
    }
    return best !== null && !tie ? best : null;
  };
  return pick(false) ?? pick(true);
}

/** 去歧义草图边集 → 被扫出的顶点。1 条边取终点（p2）；≥2 条边取唯一公共端点
 * （ORIGINAL_DEPENDENCY 语义：相邻两棱共享的顶点绕轴扫出圆边——Isomantle 三处
 * 独立体积实证）。无唯一公共点 → null（诚实停链）。 */
function resolveEdgeVertex(entities, entityIndices) {
  const endpointsOf = (e) => [e.p1, e.p2];
  if (entityIndices.length === 1) return { vertex: entities[entityIndices[0]].p2, from: 'end' };
  const key = (p) => `${Math.round(p[0] * 1e9)}:${Math.round(p[1] * 1e9)}`;
  const counts = new Map();
  for (const idx of entityIndices) {
    for (const p of endpointsOf(entities[idx])) {
      const k = key(p);
      const cur = counts.get(k);
      counts.set(k, cur ? { p, n: cur.n + 1 } : { p, n: 1 });
    }
  }
  const shared = [...counts.values()].filter((v) => v.n >= 2);
  if (shared.length !== 1) return null;
  return { vertex: shared[0].p, from: 'shared' };
}

function filletParams(ft) {
  const P = paramMap(ft);
  const radius = P.radius ? parseQuantity(P.radius, 'length') : null;
  return {
    radius,
    propagateSmooth: !!(P.tangentPropagation && P.tangentPropagation.value === true),
    isVariable: !!(P.isVariable && P.isVariable.value === true),
    crossSection: P.crossSection ? P.crossSection.value : 'CIRCULAR',
    queries: (P.entities && P.entities.queries) || [],
  };
}

function chamferParams(ft) {
  const P = paramMap(ft);
  const type = P.chamferType ? P.chamferType.value : undefined;
  let mode;
  let values1;
  let values2;
  if (type === 'EQUAL_OFFSETS') {
    mode = 1; // 内核 Length：单距离
    values1 = P.width ? parseQuantity(P.width, 'length') : null;
  } else if (type === 'TWO_OFFSETS') {
    mode = 2; // 内核 Distances：双距离
    values1 = P.width1 ? parseQuantity(P.width1, 'length') : null;
    values2 = P.width2 ? parseQuantity(P.width2, 'length') : null;
  } else if (type === 'OFFSET_ANGLE') {
    mode = 3; // 内核 DistanceAngle：距离 + 角度（弧度）
    values1 = P.width ? parseQuantity(P.width, 'length') : null;
    values2 = P.angle ? parseQuantity(P.angle, 'angle') : null;
  }
  return {
    type, mode, values1, values2,
    oppositeDirection: !!(P.oppositeDirection && P.oppositeDirection.value === true),
    propagateSmooth: !!(P.tangentPropagation && P.tangentPropagation.value === true),
    queries: (P.entities && P.entities.queries) || [],
  };
}

// ---------------------------------------------------------------------------
// extrude 参数提取（v2 修复 #1）：expression 真值
// ---------------------------------------------------------------------------
function extrudeParams(ft) {
  const P = {};
  for (const prm of ft.parameters || []) if (prm.parameterId) P[prm.parameterId] = prm;
  const depth = P.depth ? parseQuantity(P.depth, 'length') : null;
  const has2nd = P.hasSecondDirection && P.hasSecondDirection.value === true;
  const secondDepth = has2nd && P.secondDirectionDepth ? parseQuantity(P.secondDirectionDepth, 'length') : 0;
  const flip2nd = !!(P.secondDirectionOppositeDirection && P.secondDirectionOppositeDirection.value === true);
  // deterministicIds 空 → 全面域；非空 → 单面域身份未知（best-effort [0]）
  const q = P.entities && P.entities.queries || [];
  const regionRisk = q.some(x => (x.deterministicIds || []).length > 0);
  const targetIds = [...new Set(q.map(x => x.featureId || queryStringId(x.queryString)).filter(Boolean))];
  return {
    operation: P.operationType ? P.operationType.value : undefined,
    bodyType: P.bodyType ? P.bodyType.value : undefined,
    endBound: P.endBound ? P.endBound.value : undefined,
    depth, has2nd, secondDepth, flip2nd,
    // v7：symmetric（仅 true 时下发 IR）。depth 语义=总深，与我方 ±d/2 一致。
    symmetric: !!(P.symmetric && P.symmetric.value === true),
    // v8：沿 −n 拉伸（Isomantle Extrude 1 实证）。执行器以翻转平面+镜像 v 等价表达。
    oppositeDirection: !!(P.oppositeDirection && P.oppositeDirection.value === true),
    hasDraft: !!(P.hasDraft && P.hasDraft.value === true),
    targetIds, regionRisk,
  };
}
// queryString 兜底（个别语料 featureId 为 null，id 内嵌在 queryStatement 里）
// v7：名字两侧空格可有可无（Calculate 实证 `id+"FfZ….wireOp"`）；捕获物可能是
// `"<featureId>.wireOp"` / `"<featureId>.imprint"` / `"<featureId>.opExtrude"`，
// 取第一个 `.` 之前的纯 featureId。无后缀（如 `id + "F1dr…_0"`）原样返回。
function queryStringId(qs) {
  if (typeof qs !== 'string') return undefined;
  const m = qs.match(/id\s*\+\s*"([^"]+)"/);
  return m ? m[1].replace(/\..*$/, '') : undefined;
}

// ---------------------------------------------------------------------------
// v6.3 草图平面类别（2026-10-26，Calculate Extrude 3 实证）：
// 语料 newSketch 的 sketchPlane 是**查询**而非显式平面。基准面（Front/Top/Right 的
// dummyQuery，可读或 qCompressed 形态）的 2D 坐标系可整体刚性映射到我方 XY——同一
// 基准面的所有草图共享同一映射，体积/相对几何均保真（Calculate/Sculpt 全 Top 即此情形）。
// 面/边派生平面（ORIGINAL_DEPENDENCY/derivedFrom/SWEPT_FACE 等）在 Onshape 内部有
// 独立 2D 帧，语料不携带该帧，无法保真复现 → 返回 undefined，消费该草图时停链。
// 缺省 sketchPlane（合成用例/旧数据）按 Front 处理，保持既有契约不变。
//
// v7（sketch-on-face planes）：corpus/sketch-planes/*.json sidecar（probe-sketch-planes.js
// 经 Onshape evPlane 采集的权威帧）出现时升级为**全保真**——基准面帧建 W 刚体映射
// （Onshape 世界 → 我方 XY 世界），派生平面帧经 W 变换后随草图 IR 下发（plane 字段）。
// 此后混合基准面不再依赖 NEW 独立体豁免——所有草图都落在精确位姿。sidecar 缺席时
// 保持 v6.3 语义（基准面=恒等 2D、派生=停链），既有用例与合成测试零改动。
// ---------------------------------------------------------------------------
function sketchPlaneClass(ft) {
  const q = (ft.parameters || []).find(p => p.parameterId === 'sketchPlane')?.queries?.[0];
  if (!q || typeof q.queryString !== 'string' || !q.queryString) return 'Front';
  let dsl = q.queryString;
  if (dsl.includes('qCompressed')) {
    const dec = decodeQCompressed(dsl);
    if (!dec) return undefined;
    dsl = dec.dsl;
  }
  // 派生平面即使词面上提到基准面也不当作可定位平面（不猜）。
  if (/ORIGINAL_DEPENDENCY|derivedFrom/.test(dsl)) return 'derived';
  const m = dsl.match(/(Front|Top|Right)\.?planeOp/);
  if (!m) return undefined;
  return /(?:dummyQuery|DUMMY)/.test(dsl) ? m[1] : undefined;
}

/** v6.3 兼容包装：无 sidecar 时的平面类别（基准面名 | undefined=派生/不可解码）。 */
function sketchPlaneFrame(ft) {
  const cls = sketchPlaneClass(ft);
  return cls === 'derived' ? undefined : cls;
}

// ---- v7 三维向量小工具（W 变换专用；语料米制） ----
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vNorm = (a) => {
  const m = Math.hypot(a[0], a[1], a[2]);
  return m < 1e-12 ? null : [a[0] / m, a[1] / m, a[2] / m];
};

/** 基准面 Onshape 帧 → W 刚体映射（Onshape 世界 → 我方 XY 世界）。
 * W(p) = R·p + t，R 的三行 = 基准面 (x, y=n×x, normal) —— 即「基准面草图 2D (u,v) →
 * 我方 (u,v,0)、法向 → +Z」。正交性/右手性校验不过返回 null（停链，不猜）。 */
function worldTransformFromDatum(datum) {
  if (!datum || !Array.isArray(datum.origin) || !Array.isArray(datum.normal) || !Array.isArray(datum.x)) return null;
  const x = vNorm(datum.x);
  const n = vNorm(datum.normal);
  if (!x || !n) return null;
  const y = vCross(n, x);
  const yn = vNorm(y);
  if (!yn || Math.abs(vDot(x, n)) > 1e-9 || Math.abs(vDot(x, yn)) > 1e-9) return null;
  const t = [-vDot(x, datum.origin), -vDot(yn, datum.origin), -vDot(n, datum.origin)];
  return { x, y: yn, n, t };
}

/** Onshape 帧 → 我方帧（经基准面 W）。任意输入不正交/缺字段返回 null。 */
function frameThroughW(frameOnshape, W) {
  if (!frameOnshape || !W) return null;
  const rot = (v) => {
    const vn = vNorm(v);
    return vn ? [vDot(W.x, vn), vDot(W.y, vn), vDot(W.n, vn)] : null;
  };
  const o = [
    vDot(W.x, frameOnshape.origin) + W.t[0],
    vDot(W.y, frameOnshape.origin) + W.t[1],
    vDot(W.n, frameOnshape.origin) + W.t[2],
  ];
  const x = rot(frameOnshape.x);
  const n = rot(frameOnshape.normal);
  if (!x || !n || Math.abs(vDot(x, n)) > 1e-9) return null;
  return { origin: o, x, normal: n };
}

// ---------------------------------------------------------------------------
// v4 sidecar 富化（feature-eval/*.json）：regionId→area 与 rollback→volume。
// 原始 docs 不改写；键=docId/elementId，查不到时完全走 v3 既有 regionRisk 回退。
// ---------------------------------------------------------------------------
const featureEvalByKey = new Map();
const FEATURE_EVAL_DIR = path.join(__dirname, 'corpus', 'feature-eval');
if (fs.existsSync(FEATURE_EVAL_DIR)) {
  for (const f of fs.readdirSync(FEATURE_EVAL_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(FEATURE_EVAL_DIR, f), 'utf8'));
      if (data.docId && data.elementId) featureEvalByKey.set(`${data.docId}/${data.elementId}`, data);
    } catch (e) {
      console.warn('忽略损坏的 feature-eval sidecar:', f, String(e).slice(0, 100));
    }
  }
}

// v7：sketch-planes sidecar（probe-sketch-planes.js 采集的 evPlane 权威帧）。
const sketchPlanesByKey = new Map();
const SKETCH_PLANES_DIR = path.join(__dirname, 'corpus', 'sketch-planes');
if (fs.existsSync(SKETCH_PLANES_DIR)) {
  for (const f of fs.readdirSync(SKETCH_PLANES_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SKETCH_PLANES_DIR, f), 'utf8'));
      if (data.docId && data.elementId) sketchPlanesByKey.set(`${data.docId}/${data.elementId}`, data);
    } catch (e) {
      console.warn('忽略损坏的 sketch-planes sidecar:', f, String(e).slice(0, 100));
    }
  }
}

/** 把 queries 上的 deterministicIds 全量翻译成面积；任何一个未知即整体回退（不部分猜测）。 */
function areasForDeterministicIds(queries, sketchFeatureId, evalData) {
  const ids = [...new Set((queries || []).flatMap(q => q.deterministicIds || []))];
  if (!ids.length) return { ids, areas: undefined, resolved: false };
  const regions = evalData && evalData.sketches && evalData.sketches[sketchFeatureId]
    ? evalData.sketches[sketchFeatureId].regions : undefined;
  const areas = ids.map(id => (regions || []).find(r => r.id === id)?.areaM2);
  const resolved = areas.every(a => typeof a === 'number' && Number.isFinite(a) && a > 0);
  return { ids, areas: resolved ? areas : undefined, resolved };
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
const cases = [];
const stats = { full: 0, smoke: 0, imported: 0, missingVol: 0, ecosystem: 0, multiBody: 0,
  noExtrude: 0, emptySketch: 0 };
const stopReasons = new Map();   // 截断原因 → 计数
const missingList = new Map();   // 暂缺特征 → 计数
const droppedTotals = { noParam: 0, nan: 0, degenerate: 0, aux: 0 };
const geomUnsupported = new Map();
let regionRiskCount = 0;

for (const f of fs.readdirSync(DOCS).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(DOCS, f), 'utf8'));
  if (d.status !== 'ok' || !d.partStudios) continue;
  for (const ps of d.partStudios) {
    const feats = (ps.features && ps.features.features) || [];
    if (!feats.length) continue;
    const types = feats.map(x => x.featureType || x.type);
    const vol = ps.massProperties && ps.massProperties.volume;
    if (!vol || vol <= 0) { stats.missingVol++; continue; }
    if (types.some(t => ECOSYSTEM.some(e => (t || '').startsWith(e)))) { stats.ecosystem++; continue; }
    if ((ps.massProperties.bodies || []).length !== 1) { stats.multiBody++; continue; }
    if (types.some(t => (t || '').startsWith('import'))) { stats.imported++; continue; }
    const evalData = featureEvalByKey.get(`${d.id}/${ps.elementId}`);
    const planesData = sketchPlanesByKey.get(`${d.id}/${ps.elementId}`);

    // ---- 链转换（顺序遍历；遇不可回放特征停链）----
    const dropped = { noParam: 0, nan: 0, degenerate: 0, aux: 0, unsupported: [] };
    const sketches = [];               // 去重后的 IR 草图
    // sketches 下标 → 平面类别：基准面名（v6.3 字符串语义）/ 对象帧 {origin,normal,x}
    // （v7 sidecar 全保真，我方世界系）/ undefined（派生平面无帧，不可消费）。
    const sketchFrames = [];
    let primaryFrame;                  // 首个被消费的**字符串帧**（基准面纪律；亦作 W 的构建锚）
    let primaryFrameIsStr = false;     // 字符串帧纪律仍活跃（对象帧出现即失效——两种帧均精确）
    let W;                             // v7：Onshape 世界 → 我方 XY 世界（首个基准面草图惰性构建）
    const sketchByKey = new Map();     // sketch featureId → sketches 下标
    const sketchKeyByIdx = [];         // sketches 下标 → sketch featureId
    const sketchEntityIds = new Map(); // sketch featureId → 段 entityId→IR 下标（revolve 轴/边映射）
    const revolveByFeatureId = new Map(); // 回转 sourceFeatureId → {sketchIndex, axisEntityIndex}（v5 边引用）
    const extrudeByFeatureId = new Map(); // 拉伸 sourceFeatureId → IR extrude op（v6 CAP_EDGE 边引用源校验）
    const emptySketch = new Set();     // 转换后零实体的 sketch 下标
    const ops = [];
    let stop = null;

    const stopChain = (type, reason) => { if (!stop) stop = { featureType: type, reason }; };

    /** 段 entityId → {sketchIndex, entityIndex}（全草图唯一命中；axis/profile 边映射共用）。 */
    const resolveEntityId = (eid) => {
      const hits = [];
      for (const [fid, m] of sketchEntityIds) {
        const idx = m.get(eid);
        if (idx !== undefined) hits.push({ sketchIndex: sketchByKey.get(fid), entityIndex: idx });
      }
      return hits.length === 1 ? hits[0] : null;
    };

    for (const ft of feats) {
      const t = ft.featureType || ft.type;
      if (t === SKETCH) {
        const conv = convertSketch(ft, dropped);
        const key = ft.featureId;
        if (key && !sketchByKey.has(key)) {
          const idx = sketches.length;
          if (conv.entities.length === 0) emptySketch.add(idx);
          // v7 平面解析：缺 sidecar → v6.3 类别（基准面名/undefined）；有 sidecar → 对象帧。
          // W 以首个基准面草图惰性构建（语料链序：基准面草图恒先于派生草图）。
          const cls = sketchPlaneClass(ft);
          let frame;
          if (planesData) {
            const onshape = planesData.sketchPlanes?.[key];
            if (typeof cls === 'string' && cls !== 'derived' && planesData.datums?.[cls]) {
              W = W ?? worldTransformFromDatum(planesData.datums[cls]);
              frame = W ? frameThroughW(planesData.datums[cls], W) : cls;
            } else if (onshape && W) {
              // 派生/未解码类别：evPlane 帧即权威（v7 设计，合成用例真栈已绿）。
              // 【2026-10-26 真案实验记录】消费后 Calculate Sketch 3（sketch-on-face
              // ADD 挤出）内核 op=8 status=65542 布尔失败、Isomantle 体网格化
              // bad allocation——真实派生面全保真回放卡在内核 floor。两案语料 IR
              // 在私仓维持提交态截断（sketch-plane-derived 停链）直至内核跟进；
              // 帧消费语义本身正确（单测 v7 钉死），勿因两案回退。
              frame = frameThroughW(onshape, W);
            } else {
              frame = cls === 'derived' ? undefined : cls;
            }
          } else {
            frame = cls === 'derived' ? undefined : cls;
          }
          sketches.push({ name: ft.name, featureId: key, entities: conv.entities,
            ...(frame && typeof frame === 'object' ? { plane: frame } : {}) });
          sketchFrames.push(frame);
          sketchByKey.set(key, idx);
          sketchKeyByIdx[idx] = key;
          sketchEntityIds.set(key, conv.entityIdToIdx);
        }
      } else if (t === EXTRUDE) {
        const ep = extrudeParams(ft);
        // 参数/语义缺口逐项判停（诚实记账，不做静默近似）
        if (ep.depth === null || !(ep.depth > 0)) { stopChain(t, 'depth-unparseable'); break; }
        if (!['NEW', 'ADD', 'REMOVE'].includes(ep.operation)) { stopChain(t, 'operation-' + ep.operation); break; }
        if (ep.bodyType !== 'SOLID') { stopChain(t, 'bodyType-' + ep.bodyType); break; }
        // 严格口径：只接受 BLIND（REMOVE 也不例外）。端面绑定（UP_TO_SURFACE 等）在我方
        // 只有 distance 的 extrude/booleanSubtract 契约里不可保真——Isomantle Extrude 2
        // 实测：UP_TO_SURFACE+oppositeDirection 与后续 Extrude 3 几何冲突，放行会让
        // Fillet 5 的 CAP_EDGE 建在错误几何上。故一律停链，不做距离近似。
        if (ep.endBound !== 'BLIND') { stopChain(t, 'endBound-' + ep.endBound); break; }
        if (ep.hasDraft) { stopChain(t, 'hasDraft'); break; }
        if (ep.has2nd && ep.flip2nd) { stopChain(t, 'secondDirection-flipped'); break; }
        // v7：imprint 面驱动（Calculate Extrude 2）——entities 查询无 featureId，queryString
        // 为 `id+"<sketch>.wireOp"` + `id+"<sketch>.imprint"`；归一后若唯一命中已建草图，
        // 与 qSketchRegion 直引等价处理（面域身份由 deterministicIds→sidecar 面积锚定）。
        // 命中非草图/无命中仍走下方 sketch-not-found 停链，不猜。
        if (ep.targetIds.length !== 1) { stopChain(t, 'targets-' + ep.targetIds.length + '-sketches'); break; }
        const sketchIndex = sketchByKey.get(ep.targetIds[0]);
        if (sketchIndex === undefined) { stopChain(t, 'sketch-not-found'); break; }
        if (emptySketch.has(sketchIndex)) { stopChain(t, 'empty-sketch'); break; }
        // v6.3/v7：无帧草图消费即停；字符串帧（v6.3）混合基准面只允许 NEW 独立体；
        // 对象帧（v7 sidecar 全保真）与字符串帧混用**不再停链**（2026-10-26 sidecar
        // 全采集后裁决：两种帧均精确——字符串→基准面表、对象→sidecar 位姿，
        // 混用=精确+精确，无近似面）。对象帧之间跨基准面亦不停——ADD/REMOVE
        // 相对几何可保真。
        const frame = sketchFrames[sketchIndex];
        if (!frame) { stopChain(t, 'sketch-plane-derived'); break; }
        const frameIsObj = typeof frame === 'object';
        if (!frameIsObj && primaryFrameIsStr && frame !== primaryFrame && ep.operation !== 'NEW') {
          stopChain(t, 'sketch-plane-mixed-frames'); break;
        }
        if (!frameIsObj && primaryFrame === undefined) { primaryFrame = frame; primaryFrameIsStr = true; }
        if (frameIsObj) primaryFrameIsStr = false;
        const entityQueries = (ft.parameters || []).find(p => p.parameterId === 'entities')?.queries || [];
        const regionAreas = areasForDeterministicIds(entityQueries, ep.targetIds[0], evalData);
        const extrudeOp = {
          op: 'extrude', sketchIndex,
          sourceFeatureId: ft.featureId,
          operation: ep.operation,
          distance: ep.has2nd ? ep.depth + ep.secondDepth : ep.depth, // 第二方向（反向侧）并入总跨
          ...(ep.symmetric ? { symmetric: true } : {}), // v7：仅 true 下发（缺省省略）
          ...(ep.oppositeDirection ? { oppositeDirection: true } : {}), // v8：沿 −n 拉伸
          regions: ep.regionRisk ? [0] : 'all',
          regionRisk: ep.regionRisk && !regionAreas.resolved,
          ...(regionAreas.resolved ? { regionAreas: regionAreas.areas } : {}),
        };
        ops.push(extrudeOp);
        extrudeByFeatureId.set(ft.featureId, extrudeOp);
      } else if (t === REVOLVE) {
        const rp = revolveParams(ft);
        // 语义门槛（诚实记账，不做静默近似）
        if (rp.operation !== 'NEW' && rp.operation !== 'ADD') { stopChain(t, 'operation-' + rp.operation); break; }
        if (rp.bodyType !== 'SOLID') { stopChain(t, 'bodyType-' + rp.bodyType); break; }
        if (rp.endBound !== 'BLIND') { stopChain(t, 'endBound-' + rp.endBound); break; }
        if (rp.hasStartBound) { stopChain(t, 'hasStartBound'); break; }
        if (rp.symmetric) { stopChain(t, 'symmetric-unsupported'); break; }
        if (!rp.fullRevolve) {
          if (rp.angle === null || rp.angle === undefined) { stopChain(t, 'angle-unparseable'); break; }
          if (rp.angleBack !== 0) { stopChain(t, 'angleBack-unsupported'); break; }
        }
        // profile：直引单草图（面域身份未知→regionRisk）或 imprint 派生边（±1.0 侧选→regionRisk）
        if (rp.profileQ.length !== 1) { stopChain(t, 'profile-queries-' + rp.profileQ.length); break; }
        const pq = rp.profileQ[0];
        let sketchIndex = undefined;
        let profileEdges = [];
        let profileDisambig = [];
        if (pq.featureId) {
          sketchIndex = sketchByKey.get(pq.featureId);
        } else {
          const eids = edgeIdsInQuery(pq);
          const resolved = eids.map(resolveEntityId);
          if (!eids.length || resolved.some(r => r === null)) { stopChain(t, 'profile-edge-unmapped'); break; }
          if (new Set(resolved.map(r => r.sketchIndex)).size !== 1) { stopChain(t, 'profile-edges-cross-sketch'); break; }
          sketchIndex = resolved[0].sketchIndex;
          profileEdges = resolved.map(r => r.entityIndex);
          profileDisambig = resolved.map(() => disambigInQuery(pq));
        }
        if (sketchIndex === undefined) { stopChain(t, 'sketch-not-found'); break; }
        if (emptySketch.has(sketchIndex)) { stopChain(t, 'empty-sketch'); break; }
        // v6.3/v7：同回转——无帧停链；字符串帧混合基准面仅 NEW 允许；对象帧跨基准面
        // 允许；对象×字符串混用不停（两帧均精确，2026-10-26 裁决，同 extrude 段注）。
        const frame = sketchFrames[sketchIndex];
        if (!frame) { stopChain(t, 'sketch-plane-derived'); break; }
        const frameIsObj = typeof frame === 'object';
        if (!frameIsObj && primaryFrameIsStr && frame !== primaryFrame && rp.operation !== 'NEW') {
          stopChain(t, 'sketch-plane-mixed-frames'); break;
        }
        if (!frameIsObj && primaryFrame === undefined) { primaryFrame = frame; primaryFrameIsStr = true; }
        if (frameIsObj) primaryFrameIsStr = false;
        // axis：sketchEntityQuery EDGE 长码 → 段 entityId 精确映射（v3 关键发现）
        if (rp.axisQ.length !== 1) { stopChain(t, 'axis-queries-' + rp.axisQ.length); break; }
        const axEids = edgeIdsInQuery(rp.axisQ[0]);
        if (axEids.length !== 1) { stopChain(t, 'axis-unmapped'); break; }
        const ax = resolveEntityId(axEids[0]);
        if (!ax) { stopChain(t, 'axis-unmapped'); break; }
        if (ax.sketchIndex !== sketchIndex) { stopChain(t, 'axis-cross-sketch'); break; }
        if (sketches[sketchIndex].entities[ax.entityIndex].kind !== 'line') { stopChain(t, 'axis-not-line'); break; }
        const profileAreas = pq.featureId ? areasForDeterministicIds([pq], pq.featureId, evalData) : { resolved: false };
        ops.push({
          op: 'revolve', sketchIndex,
          sourceFeatureId: ft.featureId,
          axisEntityIndex: ax.entityIndex,
          fullRevolve: rp.fullRevolve,
          ...(rp.fullRevolve ? {} : { angle: rp.angle }),
          regionIndex: 0,           // 无面积锚时仍 best-effort；有则由执行器按面积唯一直选
          regionRisk: !profileAreas.resolved,
          ...(profileAreas.resolved ? { regionAreas: profileAreas.areas } : {}),
          profileEdges, profileDisambig,   // 留痕：imprint 派生边（直引时为空）+ ±1.0 侧选权重
        });
        revolveByFeatureId.set(ft.featureId, { sketchIndex, axisEntityIndex: ax.entityIndex });
      } else if (t === FILLET || t === CHAMFER) {
        const pp = t === FILLET ? filletParams(ft) : chamferParams(ft);
        // 语义门槛（诚实记账，不做静默近似）
        if (t === FILLET) {
          if (pp.radius === null || !(pp.radius > 0)) { stopChain(t, 'radius-unparseable'); break; }
          if (pp.isVariable) { stopChain(t, 'variable-radius'); break; }
          if (pp.crossSection !== 'CIRCULAR') { stopChain(t, 'crossSection-' + pp.crossSection); break; }
        } else {
          if (!pp.mode) { stopChain(t, 'chamferType-' + (pp.type || '?')); break; }
          if (pp.values1 === null || !(pp.values1 > 0)) { stopChain(t, 'width-unparseable'); break; }
          if (pp.mode >= 2 && (pp.values2 === null || !(pp.values2 > 0))) { stopChain(t, 'width2-unparseable'); break; }
          if (pp.oppositeDirection) { stopChain(t, 'opposite-direction'); break; }
        }
        if (!pp.queries.length) { stopChain(t, 'edge-queries-0'); break; }
        const edgeRefs = [];
        // v8：cap-edge / swept-edge 的源拉伸（同源校验 + op.sketchIndex 回填）。
        // vertex（源 revolve）不参与同源校验——执行器分区消费两类引用。
        let edgeSource = null;
        let bad = null;
        /** cap-edge/swept-edge 必须同源（执行器契约）；首次记录源拉伸草图下标。
         * 不再要求同 isStart：Calculate q0/q1 分别取 +z/−z 盖边，本就异侧。 */
        const noteEdgeSource = (sourceFeatureId, srcOp) => {
          if (edgeSource && edgeSource.sourceFeatureId !== sourceFeatureId) return false;
          if (!edgeSource) edgeSource = { sourceFeatureId, sketchIndex: srcOp.sketchIndex };
          return true;
        };
        for (const q of pp.queries) {
          // 通路 1：可读 makeQuery
          const ref = edgeRefFromQuery(q);
          if (ref) {
            if (ref.kind === 'SWEPT_EDGE') {
              // v5：源 revolve + 2 条相邻草图边 → 共享顶点绕轴扫出的圆边
              const src = revolveByFeatureId.get(ref.sourceFeatureId);
              if (!src) { bad = 'edge-source-not-revolve'; break; }
              const idMap = sketchEntityIds.get(sketchKeyByIdx[src.sketchIndex]);
              const entityIndices = ref.entityLongIds.map((eid) => idMap?.get(eid));
              if (entityIndices.some((i) => i === undefined)) { bad = 'edge-entity-unmapped'; break; }
              if (entityIndices.some((i) => sketches[src.sketchIndex].entities[i].kind !== 'line')) {
                bad = 'edge-entity-not-line'; break;
              }
              const resolved = resolveEdgeVertex(sketches[src.sketchIndex].entities, entityIndices);
              if (!resolved) { bad = 'edge-vertex-ambiguous'; break; }
              edgeRefs.push({
                kind: 'vertex',
                sourceFeatureId: ref.sourceFeatureId,
                sketchIndex: src.sketchIndex,
                axisEntityIndex: src.axisEntityIndex,
                vertex: resolved.vertex,
                vertexFrom: resolved.from,
              });
              continue;
            }
            if (ref.kind === 'CAP_EDGE') {
              // v8：源 extrude + 盖边草图实体长码 → cap-edge（q0：isStart=false → +z 盖）。
              // 源非 Extrude → 停链；源未入 IR / REMOVE → 停链（执行器无对应通道）。
              if (ref.sourceOp !== 'Extrude') { bad = 'edge-query-source-' + ref.sourceOp; break; }
              const srcOp = extrudeByFeatureId.get(ref.sourceFeatureId);
              if (!srcOp) { bad = 'edge-source-not-wired'; break; }
              if (srcOp.operation === 'REMOVE') { bad = 'edge-source-remove'; break; }
              const srcSketch = sketches[srcOp.sketchIndex];
              const mappedIds = ref.entityLongIds
                .map((eid) => resolveReadableSketchEntityId(srcSketch.entities, eid));
              if (!mappedIds.length || mappedIds.some((eid) => eid === null)) {
                bad = 'edge-sketch-entity-unmapped'; break;
              }
              if (!noteEdgeSource(ref.sourceFeatureId, srcOp)) { bad = 'edge-cap-refs-inconsistent'; break; }
              for (const eid of mappedIds) {
                edgeRefs.push({
                  kind: 'cap-edge',
                  sourceFeatureId: ref.sourceFeatureId,
                  isStart: ref.isStart,
                  sketchEntityId: eid,
                });
              }
              continue;
            }
            bad = 'edge-query-' + ref.kind; break;
          }
          // 通路 2：qCompressed（内联 %B5$ / zlib &hex$）→ 唯一源 op + 外层查询类型
          const decoded = decodeQCompressed(q.queryString);
          const parsed = decoded && parseEdgeQuery(decoded.dsl);
          if (!parsed) { bad = 'edge-query-unresolvable'; break; }
          if (parsed.queryType !== 'CAP_EDGE' && parsed.queryType !== 'SWEPT_EDGE') {
            bad = 'edge-query-' + parsed.queryType; break;
          }
          if (parsed.sourceOp !== 'Extrude') { bad = 'edge-query-source-' + parsed.sourceOp; break; }
          const srcOp = extrudeByFeatureId.get(parsed.sourceFeatureId);
          if (!srcOp) { bad = 'edge-source-not-wired'; break; }
          // 执行器边通道明确拒绝 REMOVE 源（booleanSubtract 无「新生盖边」快照）
          if (srcOp.operation === 'REMOVE') { bad = 'edge-source-remove'; break; }
          // v6：query token → 源拉伸草图实体 entityId（最长前缀，见 resolveSketchEntityId）。
          // 无匹配/等长歧义 → 停链，不把短码当黑盒交给执行器猜。
          const srcSketch = sketches[srcOp.sketchIndex];
          const mappedIds = parsed.sketchEntityIds.map((tok) => resolveSketchEntityId(srcSketch.entities, tok));
          if (!mappedIds.length || mappedIds.some((eid) => eid === null)) {
            bad = 'edge-sketch-entity-unmapped'; break;
          }
          if (!noteEdgeSource(parsed.sourceFeatureId, srcOp)) { bad = 'edge-cap-refs-inconsistent'; break; }
          if (parsed.queryType === 'CAP_EDGE') {
            // cap-edge：源特征 + 起始盖侧 + 草图实体 entityId；不携 sketchIndex。
            for (const eid of mappedIds) {
              edgeRefs.push({
                kind: 'cap-edge',
                sourceFeatureId: parsed.sourceFeatureId,
                isStart: parsed.isStart,
                sketchEntityId: eid,
              });
            }
          } else {
            // v8 swept-edge：源拉伸草图实体 + 端点侧 hint（q2：底边 + left）。
            // side 缺省省略 → 执行器会试线段两端。
            const side = sweptSideInDsl(decoded.dsl);
            for (const eid of mappedIds) {
              edgeRefs.push({
                kind: 'swept-edge',
                sourceFeatureId: parsed.sourceFeatureId,
                sketchEntityId: eid,
                ...(side ? { side } : {}),
              });
            }
          }
        }
        if (bad) { stopChain(t, bad); break; }
        // op 自身 sketchIndex：vertex 引用取草图下标；纯 cap/swept-edge 回填源拉伸草图
        // （IR 契约「草图先于引用」；caseOut 的 used/remap 因此不会写出 undefined）。
        const opSketchIndex = edgeRefs.find((r) => r.sketchIndex !== undefined)?.sketchIndex
          ?? edgeSource?.sketchIndex;
        ops.push({
          op: t,
          sketchIndex: opSketchIndex,
          sourceFeatureId: ft.featureId,
          propagateSmooth: pp.propagateSmooth,
          ...(t === FILLET
            ? { radius: pp.radius }
            : { mode: pp.mode, values1: pp.values1, ...(pp.values2 !== undefined ? { values2: pp.values2 } : {}) }),
          edgeRefs,
        });
      } else if (IGNORED.has(t)) {
        if (t === 'transform') {
          const tt = (ft.parameters || []).find(p => p.parameterId === 'transformType');
          if (tt && tt.value !== 'TRANSLATION_3D') { stopChain(t, 'transform-' + (tt.value || '?')); break; }
        }
        // 其余 IGNORED：体积无关，跳过
      } else {
        stopChain(t, 'feature-not-wired');
        break;
      }
    }

    droppedTotals.noParam += dropped.noParam; droppedTotals.nan += dropped.nan;
    droppedTotals.degenerate += dropped.degenerate; droppedTotals.aux += dropped.aux;
    for (const bt of dropped.unsupported) geomUnsupported.set(bt, (geomUnsupported.get(bt) || 0) + 1);
    if (dropped.unsupported.length) { stopChain('newSketch', 'unsupported-geometry'); }

    if (stop) {
      stopReasons.set(stop.reason, (stopReasons.get(stop.reason) || 0) + 1);
      // 截断链：有 extrude op → smoke（建链不断言）；无 → 不产用例
      if (!ops.length) continue;
      const id = slugOf(d.name, ps.elementId);
      cases.push(caseOut(id, d, ps, sketches, ops, 'smoke', undefined, stop, types));
      stats.smoke++;
      continue;
    }
    if (!ops.length) { stats.noExtrude++; continue; }
    if (ops.some(o => o.regionRisk)) regionRiskCount++;
    const id = slugOf(d.name, ps.elementId);
    cases.push(caseOut(id, d, ps, sketches, ops, 'full', vol, null, types));
    stats.full++;
  }
}

function slugOf(s, id) { return (s || 'unnamed').replace(/[^\w一-龥-]+/g, '-').slice(0, 40) + '-' + String(id).slice(-6); }

function caseOut(id, d, ps, sketches, ops, mode, vol, stop, types) {
  // 只下发被 ops 引用的草图（未引用的构造草图不下发；v5 边引用草图一并计入）。
  // v6：cap-edge 引用没有 sketchIndex（只有源特征 + 盖侧）——跳过，不得把
  // undefined 塞进 used/remap（否则 JSON 里会出现无意义的 sketchIndex 键或空引用）。
  const used = new Set();
  for (const o of ops) {
    used.add(o.sketchIndex);
    for (const r of o.edgeRefs || []) {
      if (r.sketchIndex !== undefined) used.add(r.sketchIndex);
    }
  }
  const remap = new Map(); let n = 0;
  const outSketches = [];
  for (let i = 0; i < sketches.length; i++) {
    if (!used.has(i)) continue;
    remap.set(i, n++);
    outSketches.push({ name: sketches[i].name, entities: sketches[i].entities,
      ...(sketches[i].plane ? { plane: sketches[i].plane } : {}) }); // v7：显式平面随 IR 下发
  }
  const outOps = ops.map(o => ({
    ...o,
    sketchIndex: remap.get(o.sketchIndex),
    ...(o.edgeRefs ? {
      edgeRefs: o.edgeRefs.map(r => (r.sketchIndex === undefined
        ? { ...r } // cap-edge：原样（无 sketchIndex）
        : { ...r, sketchIndex: remap.get(r.sketchIndex) })),
    } : {}),
  }));
  // 曲线轮廓标注保留作安全网：Wave 2 已把直线路径改为精确 api_sweep_with_options，
  // Arrows 偏差 −1.57%→0.0001%（详见 REPLAY-DESIGN Wave 2）；若后续新几何再现超差，
  // 仍可按 knownCurveFloor 走 documented tolerance，而不是悄悄放宽全部门禁。
  const knownCurveFloor = mode === 'full' && outSketches.some(s =>
    s.entities.some(e => e.kind === 'circle' || e.kind === 'arc'));
  const evalData = featureEvalByKey.get(`${d.id}/${ps.elementId}`);
  return {
    id, docId: d.id, elementId: ps.elementId, doc: d.name.slice(0, 50), ps: ps.name,
    units: 'meter', mode,
    ...(mode === 'full' ? { expectedVolume: vol } : {}),
    bodyCount: 1,
    ...(knownCurveFloor ? { knownCurveFloor: true } : {}),
    sketches: outSketches,
    ops: outOps,
    ...(evalData && evalData.volumeTimeline ? { volumeTimeline: evalData.volumeTimeline } : {}),
    ...(stop ? { stop } : {}),
    featureTypes: types,
  };
}

for (const c of cases) fs.writeFileSync(path.join(OUT, c.id + '.json'), JSON.stringify(c, null, 1));

console.log('== 转换完成 ==');
console.log('full（体积对拍）:', stats.full, '（其中含 regionRisk 面域猜测的:', regionRiskCount, '）| smoke（截断建链）:', stats.smoke);
console.log('不回放：importForeign', stats.imported, '| 生态', stats.ecosystem, '| multi-body', stats.multiBody,
  '| 无体积', stats.missingVol, '| 无 extrude', stats.noExtrude);
console.log('截断原因分布:', [...stopReasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '×' + v).join(' '));
console.log('丢弃实体: 无参', droppedTotals.noParam, '非有限', droppedTotals.nan, '退化', droppedTotals.degenerate, '辅助点/图文', droppedTotals.aux);
console.log('不支持几何类型:', [...geomUnsupported.entries()].map(([k, v]) => k + '×' + v).join(' '));
