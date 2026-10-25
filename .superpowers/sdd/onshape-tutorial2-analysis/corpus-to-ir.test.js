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
