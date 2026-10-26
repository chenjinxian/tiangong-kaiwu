// TDD RED：v3 IR 富化契约——sidecar 面域锚、源 featureId、体积时间线、可追溯 id。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const zlib = require('node:zlib');

const CONVERTER = path.join(__dirname, 'corpus-to-ir.js');
const QLIB = path.join(__dirname, 'qcompressed-lib.js');
const SKETCH_ID = 'FhaRIPJee1Kfc9u_0';
const EXTRUDE_ID = 'FjMf30Buc46eOfb_0';
const DOC_ID = 'b1d910f6c2407f9e1ec854e5';
const ELEMENT_ID = '004523717e1b848038b729b3';

function minimalDoc() {
  return {
    name: 'Arrows - Custom feature', id: DOC_ID, status: 'ok',
    partStudios: [{
      elementId: ELEMENT_ID, name: 'Helical Flow',
      massProperties: { volume: 0.0005654866776461628, bodies: [{ name: '-all-', volume: 0.0005654866776461628 }] },
      features: { features: [
        { btType: 'BTMSketch-151', featureType: 'newSketch', featureId: SKETCH_ID, name: 'Sketch 1', entities: [
          { btType: 'BTMSketchCurveSegment-155', entityId: 'outer', geometry: { btType: 'BTCurveGeometryCircle-115', xCenter: 0, yCenter: 0, xDir: 1, yDir: 0, radius: 0.05 } },
          { btType: 'BTMSketchCurveSegment-155', entityId: 'inner', geometry: { btType: 'BTCurveGeometryCircle-115', xCenter: 0, yCenter: 0, xDir: 1, yDir: 0, radius: 0.04 } },
        ], parameters: [] },
        { btType: 'BTMFeature-134', featureType: 'extrude', featureId: EXTRUDE_ID, name: 'Extrude 1', parameters: [
          { parameterId: 'operationType', value: 'NEW' }, { parameterId: 'bodyType', value: 'SOLID' }, { parameterId: 'endBound', value: 'BLIND' },
          { parameterId: 'depth', expression: '200 mm', value: 0 },
          { parameterId: 'entities', queries: [{ featureId: SKETCH_ID, deterministicIds: ['JGG'] }] },
        ] },
      ] },
    }],
  };
}

// ---------------------------------------------------------------------------
// v5：fillet/chamfer 边引用 IR（可读 makeQuery → 草图顶点；qCompressed → 停链）
// ---------------------------------------------------------------------------
const REV_ID = 'Frev_0';
const SKETCH_V5 = 'Fsk_0';

function v5Doc(filletQuery) {
  const seg = (entityId, x1, y1, x2, y2) => ({
    btType: 'BTMSketchCurveSegment-155', entityId,
    startParam: 0, endParam: 1,
    geometry: { btType: 'BTCurveGeometryLine-117', pntX: x1, pntY: y1, dirX: x2 - x1, dirY: y2 - y1 },
  });
  return {
    name: 'v5 synthetic', id: 'v5-doc', status: 'ok',
    partStudios: [{
      elementId: 'v5-element', name: 'PS',
      massProperties: { volume: 0.0004, bodies: [{ name: '-all-', volume: 0.0004 }] },
      features: { features: [
        { btType: 'BTMSketch-151', featureType: 'newSketch', featureId: SKETCH_V5, name: 'Sketch 1',
          entities: [seg('e1', 0.04, -0.06, 0.04, 0.007), seg('e2', 0.04, 0.007, 0.048, 0.015)],
          parameters: [] },
        { btType: 'BTMFeature-134', featureType: 'revolve', featureId: REV_ID, name: 'Revolve 1', parameters: [
          { parameterId: 'operationType', value: 'NEW' }, { parameterId: 'bodyType', value: 'SOLID' },
          { parameterId: 'endBound', value: 'BLIND' }, { parameterId: 'fullRevolve', value: true },
          { parameterId: 'entities', queries: [{ featureId: SKETCH_V5 }] },
          { parameterId: 'axis', queries: [{ queryString: `query=sketchEntityQuery(id+"${SKETCH_V5}.wireOp",EntityType.EDGE,"e1")` }] },
        ] },
        { btType: 'BTMFeature-134', featureType: 'fillet', featureId: 'Ffil_0', name: 'Fillet 1', parameters: [
          { parameterId: 'entities', queries: [{ queryString: filletQuery }] },
          { parameterId: 'radius', expression: '2 mm', value: 0 },
          { parameterId: 'tangentPropagation', value: true },
          { parameterId: 'isVariable', value: false },
          { parameterId: 'crossSection', value: 'CIRCULAR' },
        ] },
      ] },
    }],
  };
}

function runConverterOn(doc) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-ir-v5-'));
  fs.mkdirSync(path.join(tmp, 'corpus', 'docs'), { recursive: true });
  fs.copyFileSync(CONVERTER, path.join(tmp, 'corpus-to-ir.js'));
  fs.copyFileSync(QLIB, path.join(tmp, 'qcompressed-lib.js'));
  fs.writeFileSync(path.join(tmp, 'corpus', 'docs', 'v5.json'), JSON.stringify(doc));
  execFileSync(process.execPath, [path.join(tmp, 'corpus-to-ir.js')], { cwd: tmp, stdio: 'pipe' });
  const files = fs.readdirSync(path.join(tmp, 'replay-cases')).filter((f) => f.endsWith('.json'));
  const c = files.length ? JSON.parse(fs.readFileSync(path.join(tmp, 'replay-cases', files[0]), 'utf8')) : undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
  return c;
}

test('v5：可读 makeQuery 的 fillet → 共享顶点边引用 + 半径', () => {
  const q = `query=makeQuery(id+"${REV_ID}.opRevolve","SWEPT_EDGE",EntityType.EDGE,{"disambiguationData":[originalSetDisambiguation([sketchEntityQuery(id+"${SKETCH_V5}.wireOp",EntityType.EDGE,"e1"),sketchEntityQuery(id+"${SKETCH_V5}.wireOp",EntityType.EDGE,"e2")])]})`;
  const c = runConverterOn(v5Doc(q));
  assert.ok(c, '应产出用例');
  const fillet = c.ops.find((o) => o.op === 'fillet');
  assert.ok(fillet, '应含 fillet op');
  assert.equal(fillet.radius, 0.002);
  assert.equal(fillet.propagateSmooth, true);
  assert.equal(fillet.edgeRefs.length, 1);
  assert.equal(fillet.edgeRefs[0].kind, 'vertex');
  assert.equal(fillet.edgeRefs[0].sourceFeatureId, REV_ID);
  assert.equal(fillet.edgeRefs[0].vertexFrom, 'shared');
  assert.deepEqual(fillet.edgeRefs[0].vertex, [0.04, 0.007]);
});

test('v5：qCompressed 边查询 → 诚实停链 edge-query-unresolvable（保留已建链）', () => {
  const q = 'query=qCompressed(1.0,"%B5$QueryM6S12$disambiguationDataA1M2S12$disambiguationTypeS13$ORIGINAL_DEPENDENCYS9$originalsA1C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$h")';
  const c = runConverterOn(v5Doc(q));
  assert.ok(c, '截断链应产出 smoke 用例');
  assert.equal(c.mode, 'smoke');
  assert.deepEqual(c.stop, { featureType: 'fillet', reason: 'edge-query-unresolvable' });
  assert.equal(c.ops.filter((o) => o.op === 'fillet').length, 0);
});

test('转换器把 regionId→area 与 rollback→volume sidecar 接入 IR', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-ir-v3-'));
  try {
    fs.mkdirSync(path.join(tmp, 'corpus', 'docs'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'corpus', 'feature-eval'), { recursive: true });
    fs.copyFileSync(CONVERTER, path.join(tmp, 'corpus-to-ir.js'));
    fs.copyFileSync(QLIB, path.join(tmp, 'qcompressed-lib.js'));
    fs.writeFileSync(path.join(tmp, 'corpus', 'docs', 'arrows.json'), JSON.stringify(minimalDoc()));
    fs.writeFileSync(path.join(tmp, 'corpus', 'feature-eval', 'case.json'), JSON.stringify({
      docId: DOC_ID, elementId: ELEMENT_ID,
      sketches: { [SKETCH_ID]: { regions: [
        { id: 'JGC', areaM2: 0.00502654824574367 }, { id: 'JGG', areaM2: 0.0028274333882308137 },
      ] } },
      volumeTimeline: [
        { rollback: 1, featureId: SKETCH_ID, featureType: 'newSketch', volumeM3: 0 },
        { rollback: 2, featureId: EXTRUDE_ID, featureType: 'extrude', volumeM3: 0.0005654866776461628 },
      ],
    }));
    execFileSync(process.execPath, [path.join(tmp, 'corpus-to-ir.js')], { cwd: tmp, stdio: 'pipe' });
    const files = fs.readdirSync(path.join(tmp, 'replay-cases')).filter(f => f.endsWith('.json'));
    assert.equal(files.length, 1);
    const c = JSON.parse(fs.readFileSync(path.join(tmp, 'replay-cases', files[0]), 'utf8'));
    assert.equal(c.docId, DOC_ID);
    assert.equal(c.elementId, ELEMENT_ID);
    assert.equal(c.ops[0].sourceFeatureId, EXTRUDE_ID);
    assert.deepEqual(c.ops[0].regionAreas, [0.0028274333882308137]);
    assert.equal(c.ops[0].regionRisk, false);
    assert.equal(c.volumeTimeline.length, 2);
    assert.equal(c.volumeTimeline[1].featureId, EXTRUDE_ID);
    assert.equal(c.volumeTimeline[1].volumeM3, 0.0005654866776461628);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// v6：qCompressed 解码 + CAP_EDGE 接线 + REMOVE 拉伸
// ---------------------------------------------------------------------------
const EXT_ID = 'Fext_1';
const SKETCH_CAP = 'Fsk_cap';

/** 与真实 Isomantle 语料同构的最小 CAP_EDGE/SWEPT_EDGE 压缩查询（%B5$ 内联）。
 * seed 只改草图短码（解析不消费）；外层类型走源 op 后的回指键 `R<b>S8$<TYPE>`。 */
function capEdgeQuery(seed, { isStart = false, type = 'CAP_EDGE' } = {}) {
  return 'query=qCompressed(1.0,"%B5$QueryM6S12$disambiguationDataA1M2S12$disambiguationTypeS13$'
    + 'ORIGINAL_DEPENDENCYS9$originalsA1C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$historyTypeS8$'
    + 'CREATIONSb$operationIdB2$IdA1S11.6$' + SKETCH_CAP + 'wireOpS9$queryTypeSd$SKETCH_ENTITYSe$'
    + 'sketchEntityIdSc$' + seed + 'R4R5R6R7S7$isStart' + (isStart ? 'T' : 'F') + 'R8CbA1S11.9$'
    + EXT_ID + 'opExtrudeRbS8$' + type + '",id);';
}

/** zlib 压缩形态（&<hex 长度>$base64），与语料 Fillet 6 同编码。 */
function zlibQuery(dsl) {
  const raw = Buffer.from(dsl, 'utf8');
  const packed = zlib.deflateSync(raw);
  return 'query=qCompressed(1.0,"&' + packed.length.toString(16) + '$'
    + packed.toString('base64') + '",id);';
}

/** v6 合成 doc：草图（两条线）→ extrude（可指定 ADD/REMOVE/边界）→ 可选 fillet。 */
function v6Doc({ operation = 'ADD', endBound = 'BLIND', queries = null } = {}) {
  const seg = (entityId, x1, y1, x2, y2) => ({
    btType: 'BTMSketchCurveSegment-155', entityId,
    startParam: 0, endParam: 1,
    geometry: { btType: 'BTCurveGeometryLine-117', pntX: x1, pntY: y1, dirX: x2 - x1, dirY: y2 - y1 },
  });
  const feats = [
    { btType: 'BTMSketch-151', featureType: 'newSketch', featureId: SKETCH_CAP, name: 'Sketch cap',
      entities: [seg('c1', 0, 0, 0.05, 0), seg('c2', 0.05, 0, 0.05, 0.05), seg('c3', 0.05, 0.05, 0, 0.05)],
      parameters: [] },
    { btType: 'BTMFeature-134', featureType: 'extrude', featureId: EXT_ID, name: 'Extrude 1', parameters: [
      { parameterId: 'operationType', value: operation },
      { parameterId: 'bodyType', value: 'SOLID' },
      { parameterId: 'endBound', value: endBound },
      { parameterId: 'depth', expression: '10 mm', value: 0 },
      { parameterId: 'entities', queries: [{ featureId: SKETCH_CAP }] },
    ] },
  ];
  if (queries) {
    feats.push({ btType: 'BTMFeature-134', featureType: 'fillet', featureId: 'Ffil_cap', name: 'Fillet cap', parameters: [
      { parameterId: 'entities', queries: queries.map((queryString) => ({ queryString })) },
      { parameterId: 'radius', expression: '1 mm', value: 0 },
      { parameterId: 'tangentPropagation', value: true },
      { parameterId: 'isVariable', value: false },
      { parameterId: 'crossSection', value: 'CIRCULAR' },
    ] });
  }
  return {
    name: 'v6 synthetic', id: 'v6-doc', status: 'ok',
    partStudios: [{
      elementId: 'v6-element', name: 'PS',
      massProperties: { volume: 0.0004, bodies: [{ name: '-all-', volume: 0.0004 }] },
      features: { features: feats },
    }],
  };
}

test('v6：extrude REMOVE 入 IR（operation=REMOVE，不再停链）', () => {
  const c = runConverterOn(v6Doc({ operation: 'REMOVE' }));
  assert.ok(c, '应产出用例');
  assert.equal(c.mode, 'full');
  assert.equal(c.ops.length, 1);
  assert.equal(c.ops[0].op, 'extrude');
  assert.equal(c.ops[0].operation, 'REMOVE');
  assert.equal(c.ops[0].distance, 0.01);
  assert.equal('endBound' in c.ops[0], false);
  assert.equal(c.stop, undefined);
});

test('v6：REMOVE+UP_TO_SURFACE 严格停链 endBound-UP_TO_SURFACE（无距离近似）', () => {
  // 首个 extrude 已是 ADD BLIND（建链保留），第二个 REMOVE+UP_TO_SURFACE 必须停链
  const doc = v6Doc();
  doc.partStudios[0].features.features.push({
    btType: 'BTMFeature-134', featureType: 'extrude', featureId: 'Fext_remove', name: 'Extrude remove',
    parameters: [
      { parameterId: 'operationType', value: 'REMOVE' },
      { parameterId: 'bodyType', value: 'SOLID' },
      { parameterId: 'endBound', value: 'UP_TO_SURFACE' },
      { parameterId: 'depth', expression: '10 mm', value: 0 },
      { parameterId: 'entities', queries: [{ featureId: SKETCH_CAP }] },
    ],
  });
  const c = runConverterOn(doc);
  assert.ok(c, '截断链应产出 smoke 用例');
  assert.equal(c.mode, 'smoke');
  assert.deepEqual(c.stop, { featureType: 'extrude', reason: 'endBound-UP_TO_SURFACE' });
  assert.equal(c.ops.length, 1);
  assert.equal(c.ops[0].sourceFeatureId, EXT_ID);
  assert.equal(c.ops[0].operation, 'ADD');
  // 严格口径：REMOVE+UP_TO_SURFACE 不进 IR，且不得写端面近似标记
  assert.equal(c.ops.filter((o) => o.operation === 'REMOVE').length, 0);
  assert.equal('endBound' in c.ops[0], false);
});

test('v6：CAP_EDGE 压缩查询（3 条）→ 3 个 cap-edge ref，短码精确回映', () => {
  const queries = [capEdgeQuery('c1'), capEdgeQuery('c2'), capEdgeQuery('c3')];
  const c = runConverterOn(v6Doc({ queries }));
  assert.ok(c, '应产出用例');
  assert.equal(c.mode, 'full');
  // IR 草图实体携带语料段 entityId 原字符串
  assert.deepEqual(c.sketches[0].entities.map((e) => e.entityId), ['c1', 'c2', 'c3']);
  const fillet = c.ops.find((o) => o.op === 'fillet');
  assert.ok(fillet, '应含 fillet op');
  assert.equal(fillet.radius, 0.001);
  // 3 条查询各 1 个短码 → 3 个 ref；token 的 R4R5R6R7 消歧后缀被最长前缀剥离
  assert.deepEqual(fillet.edgeRefs, [
    { kind: 'cap-edge', sourceFeatureId: EXT_ID, isStart: false, sketchEntityId: 'c1' },
    { kind: 'cap-edge', sourceFeatureId: EXT_ID, isStart: false, sketchEntityId: 'c2' },
    { kind: 'cap-edge', sourceFeatureId: EXT_ID, isStart: false, sketchEntityId: 'c3' },
  ]);
  for (const ref of fillet.edgeRefs) {
    assert.equal('sketchIndex' in ref, false, 'cap-edge 不得写 sketchIndex（含 undefined）');
  }
  // op 的 sketchIndex 回填源拉伸草图（remap 后为 0），草图仍被下发
  assert.equal(fillet.sketchIndex, 0);
  assert.equal(c.sketches.length, 1);
});

test('v6：CAP_EDGE 短码无匹配 → 停链 edge-sketch-entity-unmapped（保留已建链）', () => {
  const c = runConverterOn(v6Doc({ queries: [capEdgeQuery('zzz')] }));
  assert.ok(c, '截断链应产出 smoke 用例');
  assert.equal(c.mode, 'smoke');
  assert.deepEqual(c.stop, { featureType: 'fillet', reason: 'edge-sketch-entity-unmapped' });
  assert.equal(c.ops.filter((o) => o.op === 'fillet').length, 0);
  assert.equal(c.ops.filter((o) => o.op === 'extrude').length, 1);
});

test('v6：SWEPT_EDGE 压缩查询可解码但未接线 → 停链 edge-query-SWEPT_EDGE（保留已建链）', () => {
  const c = runConverterOn(v6Doc({ queries: [capEdgeQuery('a', { type: 'SWEPT_EDGE' })] }));
  assert.ok(c, '截断链应产出 smoke 用例');
  assert.equal(c.mode, 'smoke');
  assert.deepEqual(c.stop, { featureType: 'fillet', reason: 'edge-query-SWEPT_EDGE' });
  assert.equal(c.ops.filter((o) => o.op === 'fillet').length, 0);
  assert.equal(c.ops.filter((o) => o.op === 'extrude').length, 1);
});

test('v6：多源 zlib 压缩查询 → 停链 edge-query-unresolvable（保留已建链）', () => {
  // 与 Fillet 6 同构：同一 DSL 同时含 opExtrude + opBoolean（复合链）→ parseEdgeQuery null
  const multi = '%B5$QueryM5S11.9$Fext_1opExtrudeRbS8$CAP_EDGES11.9$Fbool_1opBooleanReS5$MERGE';
  const c = runConverterOn(v6Doc({ queries: [zlibQuery(multi)] }));
  assert.ok(c, '截断链应产出 smoke 用例');
  assert.equal(c.mode, 'smoke');
  assert.deepEqual(c.stop, { featureType: 'fillet', reason: 'edge-query-unresolvable' });
  assert.equal(c.ops.filter((o) => o.op === 'fillet').length, 0);
  assert.equal(c.ops.filter((o) => o.op === 'extrude').length, 1);
});
