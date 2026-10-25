// TDD RED：FeatureScript 响应解析与 lambda 构造（feature-eval-lib.js 尚待实现）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const libPath = path.join(__dirname, 'feature-eval-lib.js');
const lib = fs.existsSync(libPath) ? require(libPath) : {};

test('parseFeatureScriptResponse 把 BTM FSValue 树还原为普通 JS 值', () => {
  assert.equal(typeof lib.parseFeatureScriptResponse, 'function');
  const raw = {
    btType: 'BTFeatureScriptEvalResponse-1859',
    sourceMicroversion: 'mv-1',
    result: {
      btType: 'com.belmonttech.serialize.fsvalue.BTFSValueArray',
      value: [
        { btType: 'com.belmonttech.serialize.fsvalue.BTFSValueMap', value: [
          { btType: 'BTFSValueMapEntry-2077', key: { value: 'id' }, value: { btType: 'com.belmonttech.serialize.fsvalue.BTFSValueString', value: 'JGG' } },
          { btType: 'BTFSValueMapEntry-2077', key: { value: 'areaM2' }, value: { btType: 'com.belmonttech.serialize.fsvalue.BTFSValueNumber', value: 0.0028274333882308137 } },
        ] },
      ],
    },
  };
  const parsed = lib.parseFeatureScriptResponse(raw);
  assert.deepEqual(parsed.result, [{ id: 'JGG', areaM2: 0.0028274333882308137 }]);
  assert.equal(parsed.sourceMicroversion, 'mv-1');
});

test('lambda 构造器携带草图 featureId 与只读求值语义', () => {
  assert.equal(typeof lib.buildSketchRegionLambda, 'function');
  assert.equal(typeof lib.buildVolumeLambda, 'function');
  const region = lib.buildSketchRegionLambda('FhaRIPJee1Kfc9u_0');
  assert.match(region, /qSketchRegion\(makeId\("FhaRIPJee1Kfc9u_0"\)\)/);
  assert.match(region, /transientQueriesToStrings/);
  assert.match(region, /evArea/);
  assert.doesNotMatch(region, /addFeature|deleteFeature|extrude\(/);
  assert.match(lib.buildVolumeLambda(), /evVolume/);
  assert.match(lib.buildVolumeLambda(), /qEverything\(\)/);
});
