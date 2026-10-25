// TDD RED：v3 IR 富化契约——sidecar 面域锚、源 featureId、体积时间线、可追溯 id。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CONVERTER = path.join(__dirname, 'corpus-to-ir.js');
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
