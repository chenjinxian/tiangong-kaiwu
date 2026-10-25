// TDD RED（集成验收）：现有回放用例必须具备 sidecar 面域映射与逐特征体积时间线。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CASES_DIR = path.join(__dirname, 'replay-cases');
const EVAL_DIR = path.join(__dirname, 'corpus', 'feature-eval');
const caseFiles = fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json'));

for (const file of caseFiles) {
  const c = JSON.parse(fs.readFileSync(path.join(CASES_DIR, file), 'utf8'));
  test(`${c.id}: sidecar 含区域面积与逐特征体积`, () => {
    const fp = path.join(EVAL_DIR, c.id + '.json');
    assert.ok(fs.existsSync(fp), `缺少 ${fp}（富化采集尚未完成）`);
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.equal(typeof data.docId, 'string');
    assert.equal(typeof data.elementId, 'string');
    assert.ok(data.sketches && Object.keys(data.sketches).length > 0, '缺草图面域映射');
    for (const [sketchId, sk] of Object.entries(data.sketches)) {
      assert.ok(Array.isArray(sk.regions) && sk.regions.length > 0, `${sketchId} 无面域`);
      for (const r of sk.regions) {
        assert.equal(typeof r.id, 'string');
        assert.ok(Number.isFinite(r.areaM2) && r.areaM2 > 0);
      }
    }
    assert.ok(Array.isArray(data.volumeTimeline) && data.volumeTimeline.length > 0, '缺体积时间线');
    data.volumeTimeline.forEach((p, i) => {
      assert.equal(p.rollback, i + 1);
      assert.equal(typeof p.featureId, 'string');
      assert.ok(Number.isFinite(p.volumeM3) && p.volumeM3 >= 0);
    });
  });
}
