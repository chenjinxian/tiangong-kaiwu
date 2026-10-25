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
//    不透明短码，如 "JGG"），无法映射到我们「面积降序」下标语义。诚实降级：
//    - deterministicIds 空 → 语义=整张草图的全部面域 → IR regions:"all"（执行器运行期按
//      sketchRegionsFrom 实际面域数全选——与我们 v1.8 regions 数组语义对齐）。
//    - deterministicIds 非空 → 单面域但身份未知 → best-effort regions:[0]（最大面域）+ regionRisk
//      标记（单面域草图时精确；多面域时可能错域——体积对拍会暴露，报告单列）。
// 6. 链截断语义（设计裁决 4）：newSketch/extrude(可解析)之外的特征（含 W1 已有面但执行器未接线的
//    revolve/fillet 等）出现 → 该 PS 降级 smoke（截断回放，建链不断言体积），stop 记录截断点。
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, 'corpus', 'docs');
const OUT = path.join(__dirname, 'replay-cases');
fs.mkdirSync(OUT, { recursive: true });

// W1 可回放面（转换器能转出 ops 的特征）
const SKETCH = 'newSketch';
const EXTRUDE = 'extrude';
// 体积无关特征（注解/视图/变量——不改实体体积，回放时跳过）：
// transform 仅当 transformType=TRANSLATION_3D（纯平移，位置不变体积）才忽略；
// 其余 transform（COPY/ROTATION/SCALE/MATE_CONNECTORS）保守判停链。
const IGNORED = new Set(['arrow', 'surfaceTextWrapped', 'tagProfile', 'partName',
  'cPlane', 'mateConnector', 'fitSpline', 'threePoint', 'assignVariable', 'queryVariable',
  'simplifiedRep', 'calculateBounds', 'partNumber']);
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
  for (const seg of ft.entities || []) {
    const e = convertEntity(seg, dropped);
    if (e && !e.construction) entities.push(e);
  }
  return entities;
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
    hasDraft: !!(P.hasDraft && P.hasDraft.value === true),
    targetIds, regionRisk,
  };
}
// queryString 兜底（个别语料 featureId 为 null，id 内嵌在 queryStatement 里）
function queryStringId(qs) {
  if (typeof qs !== 'string') return undefined;
  const m = qs.match(/id \+ "([^"]+)"/);
  return m ? m[1] : undefined;
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

    // ---- 链转换（顺序遍历；遇不可回放特征停链）----
    const dropped = { noParam: 0, nan: 0, degenerate: 0, aux: 0, unsupported: [] };
    const sketches = [];               // 去重后的 IR 草图
    const sketchByKey = new Map();     // sketch featureId → sketches 下标
    const emptySketch = new Set();     // 转换后零实体的 sketch 下标
    const ops = [];
    let stop = null;

    const stopChain = (type, reason) => { if (!stop) stop = { featureType: type, reason }; };

    for (const ft of feats) {
      const t = ft.featureType || ft.type;
      if (t === SKETCH) {
        const entities = convertSketch(ft, dropped);
        const key = ft.featureId;
        if (key && !sketchByKey.has(key)) {
          const idx = sketches.length;
          if (entities.length === 0) emptySketch.add(idx);
          sketches.push({ name: ft.name, featureId: key, entities });
          sketchByKey.set(key, idx);
        }
      } else if (t === EXTRUDE) {
        const ep = extrudeParams(ft);
        // 参数/语义缺口逐项判停（诚实记账，不做静默近似）
        if (ep.depth === null || !(ep.depth > 0)) { stopChain(t, 'depth-unparseable'); break; }
        if (ep.operation !== 'NEW' && ep.operation !== 'ADD') { stopChain(t, 'operation-' + ep.operation); break; }
        if (ep.bodyType !== 'SOLID') { stopChain(t, 'bodyType-' + ep.bodyType); break; }
        if (ep.endBound !== 'BLIND') { stopChain(t, 'endBound-' + ep.endBound); break; }
        if (ep.hasDraft) { stopChain(t, 'hasDraft'); break; }
        if (ep.has2nd && ep.flip2nd) { stopChain(t, 'secondDirection-flipped'); break; }
        if (ep.targetIds.length !== 1) { stopChain(t, 'targets-' + ep.targetIds.length + '-sketches'); break; }
        const sketchIndex = sketchByKey.get(ep.targetIds[0]);
        if (sketchIndex === undefined) { stopChain(t, 'sketch-not-found'); break; }
        if (emptySketch.has(sketchIndex)) { stopChain(t, 'empty-sketch'); break; }
        ops.push({
          op: 'extrude', sketchIndex,
          operation: ep.operation,
          distance: ep.has2nd ? ep.depth + ep.secondDepth : ep.depth, // 第二方向（反向侧）并入总跨
          regions: ep.regionRisk ? [0] : 'all',
          regionRisk: ep.regionRisk,
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
    if (ops.some(o => o.op === 'extrude' && o.regionRisk)) regionRiskCount++;
    const id = slugOf(d.name, ps.elementId);
    cases.push(caseOut(id, d, ps, sketches, ops, 'full', vol, null, types));
    stats.full++;
  }
}

function slugOf(s, id) { return (s || 'unnamed').replace(/[^\w一-龥-]+/g, '-').slice(0, 40) + '-' + String(id).slice(-6); }

function caseOut(id, d, ps, sketches, ops, mode, vol, stop, types) {
  // 只下发被 ops 引用的草图（未引用的构造草图不下发）
  const used = new Set(ops.map(o => o.sketchIndex));
  const remap = new Map(); let n = 0;
  const outSketches = [];
  for (let i = 0; i < sketches.length; i++) {
    if (!used.has(i)) continue;
    remap.set(i, n++);
    outSketches.push({ name: sketches[i].name, entities: sketches[i].entities });
  }
  const outOps = ops.map(o => ({ ...o, sketchIndex: remap.get(o.sketchIndex) }));
  return {
    id, doc: d.name.slice(0, 50), ps: ps.name,
    units: 'meter', mode,
    ...(mode === 'full' ? { expectedVolume: vol } : {}),
    bodyCount: 1,
    sketches: outSketches,
    ops: outOps,
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
