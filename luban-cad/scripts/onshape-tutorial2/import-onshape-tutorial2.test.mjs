import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGold, parseLengthMm, validateGold } from './import-onshape-tutorial2.mjs';

test('length expression parser handles Onshape inch units', () => {
  assert.equal(parseLengthMm('3.25*inch'), 82.55);
  assert.equal(parseLengthMm('.75*inch'), 19.05);
  assert.equal(parseLengthMm('1*meter'), 1000);
  assert.throws(() => parseLengthMm('3.25*furlong'), /unsupported length expression/);
});

test('Tutorial 2 gold fixture has the literal Onshape inventory', () => {
  const gold = buildGold();
  assert.equal(validateGold(gold), true);
  assert.equal(gold.sketch.visibleEntityIds.length, 18);
  assert.deepEqual(
    gold.sketch.entities.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {}),
    { line: 13, arc: 2, spline: 1, point: 2 },
  );
  assert.equal(gold.sketch.constraints.length, 48);
  assert.equal(gold.sketch.dimensions.length, 9);
  assert.deepEqual(gold.sketch.constraintHistogram, {
    midpoint: 6, perpendicular: 2, parallel: 4, horizontal: 3, coincident: 18,
    length: 4, vertical: 2, tangent: 2, radius: 1, distance: 4, offset: 2,
  });
});

test('spline is exactly the captured cubic Bezier', () => {
  const gold = buildGold();
  const spline = gold.sketch.entities.find((e) => e.kind === 'spline');
  assert.deepEqual(spline.fitPoints, [
    { x: -41.275, y: -9.525 },
    { x: 57.15, y: -61.9252 },
  ]);
  assert.deepEqual(spline.controlPoints, [
    { x: -41.275, y: -9.525 },
    { x: -39.539240300655365, y: -40.3054840862751 },
    { x: 16.844818368554112, y: -60.51863729953766 },
    { x: 57.15, y: -61.9252 },
  ]);
});

test('origin, midpoint, tangent and offset constraints are preserved', () => {
  const gold = buildGold();
  const byId = new Map(gold.sketch.constraints.map((c) => [c.id, c]));
  assert.deepEqual(byId.get(11).refs, [5, { origin: true }]);
  assert.deepEqual(byId.get(43).refs, [{ entity: 17, part: 'start' }, 9]);
  assert.deepEqual(byId.get(44).refs, [{ entity: 17, part: 'end' }, 10]);
  assert.deepEqual(byId.get(45).refs, [{ entity: 18, part: 'point', index: 0 }, { entity: 1, part: 'start' }]);
  assert.deepEqual(byId.get(47).refs, [{ entity: 18, part: 'start' }, { entity: 18, part: 'point', index: 0 }]);
  assert.deepEqual(byId.get(41).pairs, [{ offset: 16, master: 6 }, { offset: 15, master: 7 }]);
  assert.deepEqual(byId.get(42).pairs, [{ offset: 16, master: 6 }, { offset: 14, master: 8 }]);
  assert.equal(byId.get(17).kind, 'tangent');
  assert.equal(byId.get(19).kind, 'tangent');
});

test('nine dimensions carry the exact inch values', () => {
  const gold = buildGold();
  const values = gold.sketch.dimensions.map((d) => d.valueMm).sort((a, b) => a - b);
  assert.deepEqual(values, [15.875, 19.05, 19.05, 28.575, 44.45, 50.8, 52.4002, 76.2, 82.55]);
});

test('six features match the Onshape chain and ADD scope semantics', () => {
  const gold = buildGold();
  assert.deepEqual(gold.features.map((f) => f.name), [
    'Sketch 1', 'Extrude 1', 'Extrude 2', 'Extrude 3', 'Revolve 1', 'Fillet 1',
  ]);
  const extrudes = gold.features.filter((f) => f.type === 'extrude');
  assert.deepEqual(extrudes.map((f) => f.operation), ['new', 'add', 'add']);
  assert.deepEqual(extrudes.map((f) => f.depthMm), [127, 50.8, 15.875]);
  assert.deepEqual(extrudes.map((f) => f.regionRoles), [['base'], ['band', 'bandWing'], ['lobe']]);
  assert.deepEqual(extrudes[0].booleanScope, []);
  assert.deepEqual(extrudes[1].booleanScope, ['JHD']);
  assert.deepEqual(extrudes[2].booleanScope, ['JHD']);
  assert.equal(extrudes.every((f) => f.symmetric), true);
  const revolve = gold.features.find((f) => f.type === 'revolve');
  assert.equal(revolve.fullRevolve, true);
  assert.equal(revolve.regionRoles[0], 'revolveProfile');
  assert.equal(revolve.axisEntityId, 17);
  const fillet = gold.features.find((f) => f.type === 'fillet');
  assert.equal(fillet.radiusMm, 5.08);
  assert.equal(fillet.tangentPropagation, true);
  assert.deepEqual(fillet.onshapeEdgeIds, ['JHt', 'JHl', 'JHp', 'JHh']);
  assert.equal(fillet.edgeIntent.kind, 'box-end-short-edges');
  assert.equal(fillet.edgeIntent.axis, 'z');
  assert.equal(fillet.edgeIntent.lengthMm, 19.05);
  assert.deepEqual(fillet.edgeIntent.extentMm, [-9.525, 9.525]);
  assert.deepEqual(fillet.edgeIntent.expectedOwnIds, ['1:1', '1:3', '1:8', '1:10']);
});

test('region roles split JGe (band wing) from JGW (revolve profile)', () => {
  const gold = buildGold();
  const areas = gold.regions.map((r) => r.areaMm2);
  assert.equal(new Set(areas).size, areas.length);
  const wing = gold.regions.find((r) => r.role === 'bandWing');
  assert.deepEqual(wing.onshapeIds, ['JGe']);
  assert.equal(wing.areaMm2, 483.87);
  const revolve = gold.regions.find((r) => r.role === 'revolveProfile');
  assert.deepEqual(revolve.onshapeIds, ['JGW']);
  assert.equal(revolve.areaMm2, 725.775);
  assert.equal(revolve.aliases.includes('rightBlock'), true);
  assert.equal(gold.regions.some((r) => r.role === 'rightRect'), false);
});

test('gold volume is the API value, not the legacy prose value', () => {
  const gold = buildGold();
  assert.equal(gold.expected.volumeCm3Api, 357.5681766800494);
  assert.equal(gold.expected.volumeIn3Api, 21.820148910143363);
  assert.equal(gold.expected.legacyGoldCm3, 358.2);
  assert.equal(gold.expected.lubanNoFilletReplayCm3, 357.988);
  assert.equal(gold.expected.lubanFourEdgeFilletCm3, 357.566);
  assert.equal(gold.expected.filletRemovalCm3, 0.422);
});

test('converter output is deterministic', () => {
  const a = JSON.stringify(buildGold());
  const b = JSON.stringify(buildGold());
  assert.equal(a, b);
});
