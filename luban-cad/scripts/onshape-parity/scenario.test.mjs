import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenario, validateScenario } from "./scenario.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TUTORIAL2 = path.join(
  HERE,
  "..",
  "..",
  "apps",
  "web",
  "e2e",
  "fixtures",
  "parity",
  "tutorial2.scenario.json",
);

function minimal(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "minimal",
    units: "mm",
    features: [
      {
        type: "sketch",
        name: "Sketch 1",
        params: { plane: {}, entities: [], constraints: [] },
      },
    ],
    expected: { volumeM3: 0, bodyCount: 0, tolerance: 0.01 },
    provenance: { capturedAt: "2026-11-04", status: "complete" },
    ...overrides,
  };
}

test("parity scenario v1：最小合法场景通过", () => {
  const result = validateScenario(minimal());
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("schemaVersion 必须为 1", () => {
  const result = validateScenario(minimal({ schemaVersion: 2 }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /schemaVersion/);
});

test("未知 feature type 被拒", () => {
  const value = minimal();
  value.features[0].type = "sheetMetal";
  const result = validateScenario(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /features\[0\]\.type/);
});

test("负体积 / 零容差被拒", () => {
  const negative = minimal({ expected: { volumeM3: -1, bodyCount: 0, tolerance: 0.01 } });
  assert.equal(validateScenario(negative).ok, false);
  const zeroTolerance = minimal({ expected: { volumeM3: 1, bodyCount: 1, tolerance: 0 } });
  assert.equal(validateScenario(zeroTolerance).ok, false);
});

test("逐 body 期望的负体积被拒", () => {
  const value = minimal({
    expected: {
      volumeM3: 1,
      bodyCount: 1,
      tolerance: 0.01,
      bodies: [{ partId: "JHD", volumeM3: -0.1 }],
    },
  });
  const result = validateScenario(value);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /expected\.bodies\[0\]\.volumeM3/);
});

test("blocked-evidence / blocked-capability 必须列 missing", () => {
  const blocked = minimal({ provenance: { capturedAt: "2026-11-04", status: "blocked-evidence" } });
  assert.equal(validateScenario(blocked).ok, false);
  const withMissing = minimal({
    provenance: {
      capturedAt: "2026-11-04",
      status: "blocked-capability",
      missing: ["DIAMETER"],
    },
  });
  assert.equal(validateScenario(withMissing).ok, true);
});

test("blocked 状态未知被拒", () => {
  const value = minimal({ provenance: { capturedAt: "2026-11-04", status: "unknown" } });
  assert.equal(validateScenario(value).ok, false);
});

test("hole 特征类型通过校验（ADR-0006 切片 A）", () => {
  const value = minimal();
  value.features.push({
    type: "hole",
    name: "Hole 1",
    params: { sketchId: "s1", pointIds: [1], diameterMm: 5, endBound: "throughAll" },
  });
  const result = validateScenario(value);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("cPlane 特征类型通过校验（ADR-0003 additive）", () => {
  const value = minimal();
  value.features.push({
    type: "cPlane",
    name: "Plane 2",
    params: { reference: "front", offsetMm: 25.4, flipNormal: false },
  });
  const result = validateScenario(value);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("Tutorial 2 场景 fixture 通过校验且保留金标体积", async () => {
  const scenario = await loadScenario(TUTORIAL2);
  assert.equal(scenario.features.length, 6);
  assert.equal(scenario.features[0].type, "sketch");
  assert.deepEqual(
    scenario.features.map((feature) => feature.type),
    ["sketch", "extrude", "extrude", "extrude", "revolve", "fillet"],
  );
  assert.equal(scenario.provenance.status, "complete");
  assert.equal(scenario.expected.bodyCount, 1);
  assert.equal(scenario.expected.tolerance, 0.005);
  assert.ok(Math.abs(scenario.expected.volumeM3 - 0.00035756817668004945) < 1e-15);
});
