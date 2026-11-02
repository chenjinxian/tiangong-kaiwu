#!/usr/bin/env node
/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape Tutorial 2 "Build a Part" -> committed gold fixture.
 *
 * Raw source: apps/web/e2e/fixtures/onshape-tutorial2/raw/api-features.json
 * The raw API is authoritative for the six feature parameters, the 48 constraints
 * and the exact spline data. The playback geometry table below is hand-verified
 * against the Onshape final sketch because Onshape serializes line/arc geometry
 * with frame-relative parameters and implicit endpoints; using the raw arc
 * startParam/endParam directly produces the wrong branch (see
 * TUTORIAL2-FULL-STEPS.md and the proven Tutorial2VolumeReplay.test.ts).
 *
 * Units: Onshape source geometry is metres; playback is millimetres with the
 * proven Front-plane v = -y conversion.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RAW_DIR = path.resolve(HERE, '../../apps/web/e2e/fixtures/onshape-tutorial2/raw');
const DEFAULT_GOLD_DIR = path.resolve(HERE, '../../apps/web/e2e/fixtures/onshape-tutorial2/gold');

const SOURCE_IDS = {
  BASE: '4bbb934d-0ef4-4e83-bd87-71beb03a387b',
  RECT2: '4e1e7f54-c948-48b7-9be1-c759b32187ce',
  OFF: 'f224b4cb-e203-45c9-9eaa-14969bb7630d',
  RLEG: 'qWNQFZYz-YRwg-BDnY-Mkhf-yKiAhuXpCSrl',
  SARC: '51f3bc57-1325-4e7c-99b0-058aa69d2a80',
  THROAT: 'VN1vDrE9-9rhM-t6L7-seoI-iifckboQqW2z',
  AXIS: 'mIqPK4pu-UhI2-CuNv-TtCn-32D9RiMOUjL4',
  SPLINE: 'f4982b6b-8bb9-49bf-8bdc-2ed470ae9e6c',
};

/** Visible entity table (mm, playback v = -Onshape y). */
const ENTITIES = [
  { id: 1, sourceId: `${SOURCE_IDS.BASE}.rect.bottom`, kind: 'line', p1: { x: -41.275, y: -9.525 }, p2: { x: 41.275, y: -9.525 } },
  { id: 2, sourceId: `${SOURCE_IDS.BASE}.rect.top`, kind: 'line', p1: { x: -41.275, y: 9.525 }, p2: { x: 41.275, y: 9.525 } },
  { id: 3, sourceId: `${SOURCE_IDS.BASE}.rect.left`, kind: 'line', p1: { x: -41.275, y: -9.525 }, p2: { x: -41.275, y: 9.525 } },
  { id: 4, sourceId: `${SOURCE_IDS.BASE}.rect.right`, kind: 'line', p1: { x: 41.275, y: -9.525 }, p2: { x: 41.275, y: 9.525 } },
  { id: 5, sourceId: `${SOURCE_IDS.BASE}.rect.middle`, kind: 'point', x: 0, y: 0 },
  { id: 6, sourceId: SOURCE_IDS.RLEG, kind: 'line', p1: { x: 41.275, y: -9.525 }, p2: { x: 41.275, y: -27.0002 } },
  { id: 7, sourceId: SOURCE_IDS.SARC, kind: 'arc', center: { x: 57.15, y: -27.0002 }, radius: 15.875, startAngle: -Math.PI, sweepAngle: Math.PI / 2 },
  { id: 8, sourceId: SOURCE_IDS.THROAT, kind: 'line', p1: { x: 57.15, y: -42.8752 }, p2: { x: 85.725, y: -42.8752 } },
  { id: 9, sourceId: `${SOURCE_IDS.RECT2}.rect.bottom`, kind: 'line', p1: { x: 60.325, y: -38.1 }, p2: { x: 111.125, y: -38.1 } },
  { id: 10, sourceId: `${SOURCE_IDS.RECT2}.rect.top`, kind: 'line', p1: { x: 60.325, y: -66.675 }, p2: { x: 111.125, y: -66.675 } },
  { id: 11, sourceId: `${SOURCE_IDS.RECT2}.rect.left`, kind: 'line', p1: { x: 60.325, y: -38.1 }, p2: { x: 60.325, y: -66.675 } },
  { id: 12, sourceId: `${SOURCE_IDS.RECT2}.rect.right`, kind: 'line', p1: { x: 111.125, y: -38.1 }, p2: { x: 111.125, y: -66.675 } },
  { id: 13, sourceId: `${SOURCE_IDS.RECT2}.rect.middle`, kind: 'point', x: 85.725, y: -52.3875 },
  { id: 14, sourceId: `${SOURCE_IDS.OFF}.0`, kind: 'line', p1: { x: 57.15, y: -61.9252 }, p2: { x: 85.725, y: -61.9252 } },
  { id: 15, sourceId: `${SOURCE_IDS.OFF}.1`, kind: 'arc', center: { x: 57.15, y: -27.0002 }, radius: 34.925, startAngle: -Math.PI, sweepAngle: Math.PI / 2 },
  { id: 16, sourceId: `${SOURCE_IDS.OFF}.2`, kind: 'line', p1: { x: 22.225, y: -9.525 }, p2: { x: 22.225, y: -27.0002 } },
  { id: 17, sourceId: SOURCE_IDS.AXIS, kind: 'line', p1: { x: 85.725, y: -38.1 }, p2: { x: 85.725, y: -66.675 } },
  {
    id: 18,
    sourceId: SOURCE_IDS.SPLINE,
    kind: 'spline',
    fitPoints: [{ x: -41.275, y: -9.525 }, { x: 57.15, y: -61.9252 }],
    controlPoints: [
      { x: -41.275, y: -9.525 },
      { x: -39.539240300655365, y: -40.3054840862751 },
      { x: 16.844818368554112, y: -60.51863729953766 },
      { x: 57.15, y: -61.9252 },
    ],
    periodic: false,
  },
];

const COMPOSITE_LINES = {
  [`${SOURCE_IDS.BASE}.rect.bottom`]: 1,
  [`${SOURCE_IDS.BASE}.rect.top`]: 2,
  [`${SOURCE_IDS.BASE}.rect.left`]: 3,
  [`${SOURCE_IDS.BASE}.rect.right`]: 4,
  [`${SOURCE_IDS.RECT2}.rect.bottom`]: 9,
  [`${SOURCE_IDS.RECT2}.rect.top`]: 10,
  [`${SOURCE_IDS.RECT2}.rect.left`]: 11,
  [`${SOURCE_IDS.RECT2}.rect.right`]: 12,
};
const COMPOSITE_POINTS = {
  [`${SOURCE_IDS.BASE}.rect.middle`]: 5,
  [`${SOURCE_IDS.RECT2}.rect.middle`]: 13,
};
const WHOLE_IDS = {
  [SOURCE_IDS.RLEG]: 6,
  [SOURCE_IDS.SARC]: 7,
  [SOURCE_IDS.THROAT]: 8,
  [`${SOURCE_IDS.OFF}.0`]: 14,
  [`${SOURCE_IDS.OFF}.1`]: 15,
  [`${SOURCE_IDS.OFF}.2`]: 16,
  [SOURCE_IDS.AXIS]: 17,
  [SOURCE_IDS.SPLINE]: 18,
};
const ENTITY_BY_ID = new Map(ENTITIES.map((e) => [e.id, e]));

function param(message, id) {
  return (message.parameters || []).map((p) => p.message || p).find((p) => p.parameterId === id);
}
function boolParam(message, id) {
  const p = param(message, id);
  return p ? p.value === true : undefined;
}
function enumParam(message, id) {
  return param(message, id)?.value;
}
function expressionParam(message, id) {
  return param(message, id)?.expression;
}
function queryGeometryIds(message, id) {
  const p = param(message, id);
  if (!p || !Array.isArray(p.queries)) return [];
  const out = [];
  for (const q of p.queries) {
    const ids = q?.message?.geometryIds;
    if (Array.isArray(ids)) out.push(...ids);
  }
  return [...new Set(out)];
}

/** Parse a length expression such as "3.25*inch", ".75*inch", "1*meter". */
export function parseLengthMm(expression) {
  if (typeof expression !== 'string') throw new Error(`length expression missing: ${expression}`);
  const match = expression.trim().match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\*\s*(inch|in|meter|m|millimeter|mm)$/);
  if (!match) throw new Error(`unsupported length expression: ${expression}`);
  const value = Number(match[1]);
  const unit = match[2];
  const mm = (unit === 'inch' || unit === 'in')
    ? value * 25.4
    : (unit === 'meter' || unit === 'm' ? value * 1000 : value);
  return Number(mm.toFixed(9));
}

function refPart(value) {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/\.(start|end)$/);
  return match ? match[1] : undefined;
}

function mapRef(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value);
  const directPoint = COMPOSITE_POINTS[s];
  if (directPoint !== undefined) return directPoint;
  const directLine = COMPOSITE_LINES[s];
  if (directLine !== undefined) return directLine;

  for (const [prefix, id] of Object.entries(COMPOSITE_LINES)) {
    if (s.startsWith(prefix + '.')) {
      const part = refPart(s);
      if (!part) throw new Error(`unmapped composite line ref: ${s}`);
      return { entity: id, part };
    }
  }
  for (const prefix of Object.keys(COMPOSITE_POINTS)) {
    if (s.startsWith(prefix + '.')) throw new Error(`unmapped point subref: ${s}`);
  }

  for (const [prefix, id] of Object.entries(WHOLE_IDS)) {
    if (s === prefix) return id;
    if (s.startsWith(prefix + '.')) {
      const rest = s.slice(prefix.length + 1);
      if (prefix === SOURCE_IDS.SPLINE) {
        if (rest === '0.internal' || rest === '1.internal') {
          return { entity: 18, part: 'point', index: rest === '0.internal' ? 0 : 1 };
        }
        if (rest === 'start' || rest === 'end') return { entity: 18, part: rest };
      }
      if (rest === 'start' || rest === 'end') return { entity: id, part: rest };
    }
  }
  throw new Error(`unmapped Onshape sketch ref: ${s}`);
}

function refEntityId(ref) {
  if (typeof ref === 'number') return ref;
  if (ref && ref.origin === true) return 0;
  return ref.entity;
}

function constraintKind(type) {
  const map = {
    COINCIDENT: 'coincident',
    MIDPOINT: 'midpoint',
    LENGTH: 'length',
    DISTANCE: 'distance',
    RADIUS: 'radius',
    PARALLEL: 'parallel',
    PERPENDICULAR: 'perpendicular',
    HORIZONTAL: 'horizontal',
    VERTICAL: 'vertical',
    TANGENT: 'tangent',
    OFFSET: 'offset',
  };
  if (!map[type]) throw new Error(`unsupported Onshape constraint type: ${type}`);
  return map[type];
}

function parseConstraint(c, index) {
  const m = c.message;
  const type = m.constraintType;
  const kind = constraintKind(type);
  const first = mapRef(param(m, 'localFirst')?.value);
  const second = mapRef(param(m, 'localSecond')?.value);
  const mid = mapRef(param(m, 'localMidpoint')?.value);
  const e1 = mapRef(param(m, 'localEntity1')?.value);
  const e2 = mapRef(param(m, 'localEntity2')?.value);
  const offset = mapRef(param(m, 'localOffset')?.value);
  const secondOffset = mapRef(param(m, 'localSecondOffset')?.value);
  const master = mapRef(param(m, 'localMaster')?.value);
  const master2 = mapRef(param(m, 'localSecond')?.value);
  const lengthExpr = expressionParam(m, 'length');

  let refs;
  let value;
  if (kind === 'midpoint') {
    // Onshape has two serializations:
    //  - point-between-points: localMidpoint + localEntity1 + localEntity2 (all points)
    //  - point-on-line:        localEntity1 = point, localEntity2 = line (no localMidpoint)
    let midpoint = mid;
    let a = e1;
    let b = e2;
    if (midpoint === undefined) {
      if (typeof e1 !== 'number' && typeof e2 === 'number') { midpoint = e1; a = e2; b = undefined; }
      else if (typeof e2 !== 'number' && typeof e1 === 'number') { midpoint = e2; a = e1; b = undefined; }
    }
    if (midpoint === undefined || a === undefined) throw new Error(`midpoint refs missing at ${index}: ${JSON.stringify(m)}`);
    if (b === undefined) refs = [midpoint, a];
    else if (typeof a === 'number' || typeof b === 'number') refs = [midpoint, typeof a === 'number' ? a : b];
    else refs = [midpoint, a, b];
  } else if (kind === 'coincident') {
    const external = param(m, 'externalSecond');
    const other = second !== undefined ? second : external ? { origin: true } : undefined;
    if (first === undefined || other === undefined) throw new Error(`coincident refs missing at ${index}`);
    refs = [first, other];
  } else if (kind === 'offset') {
    if (offset === undefined || secondOffset === undefined || master === undefined || master2 === undefined) {
      throw new Error(`offset refs missing at ${index}`);
    }
    refs = [offset, master, secondOffset, master2];
    value = 19.05; // .75 in, tied to the offset distance row (constraint 40)
  } else {
    if (first === undefined) throw new Error(`constraint ${index} missing localFirst`);
    refs = kind === 'horizontal' || kind === 'vertical'
      ? (second !== undefined ? [first, second] : [first])
      : (second !== undefined ? [first, second] : [first]);
    if (lengthExpr !== undefined) value = parseLengthMm(lengthExpr);
  }

  const result = {
    id: index,
    sourceIndex: index - 1,
    sourceType: type,
    kind,
    refs,
  };
  if (value !== undefined) result.valueMm = Number(value.toFixed(9));
  if (kind === 'offset') {
    result.pairs = [
      { offset: offset, master: master },
      { offset: secondOffset, master: master2 },
    ];
    result.valueSource = '.75*inch';
  } else if (lengthExpr !== undefined) {
    result.valueSource = lengthExpr;
  }
  return result;
}

function collectConstraints(sketchMessage) {
  const constraints = sketchMessage.constraints.map((c, i) => parseConstraint(c, i + 1));
  const dimensions = constraints
    .filter((c) => c.kind === 'length' || c.kind === 'distance' || c.kind === 'radius')
    .map((c) => ({ constraintId: c.id, kind: c.kind, valueMm: c.valueMm, valueSource: c.valueSource, refs: c.refs }));
  const histogram = {};
  for (const c of constraints) histogram[c.kind] = (histogram[c.kind] ?? 0) + 1;
  return { constraints, dimensions, histogram };
}

function mapRegionRole(geometryId) {
  // JGe 与 JGW 是**不同**的 Onshape 面域（历史 fixture 曾误合并为 rightRect）：
  // - JGe = 拱形环带中带（483.87 mm²，rect2 轴左 H1/H2 间块）→ Extrude 2 的第二面域；
  // - JGW = rect2 轴右半（725.775 mm²）→ Revolve 1 的旋转面域。
  // API 特征选择逐字：Extrude 2 = JGa+JGe，Revolve 1 = JGW。
  const map = {
    JGG: 'base',
    JGa: 'band',
    JGe: 'bandWing',
    JGK: 'lobe',
    JGW: 'revolveProfile',
  };
  return map[geometryId] ?? undefined;
}

function parseFeatures(featureResponse, sketchInfo) {
  const features = [];
  for (const entry of featureResponse.features) {
    const m = entry.message;
    if (entry.typeName === 'BTMSketch') {
      features.push({
        name: 'Sketch 1',
        featureId: m.featureId,
        type: 'newSketch',
        sourceType: m.featureType,
        entityCount: ENTITIES.length,
        constraintCount: sketchInfo.constraints.length,
      });
      continue;
    }
    if (entry.typeName !== 'BTMFeature') continue;
    const type = m.featureType;
    const common = {
      name: m.name,
      featureId: m.featureId,
      type,
      operation: enumParam(m, 'operationType')?.toLowerCase(),
    };
    if (type === 'extrude') {
      const geometryIds = queryGeometryIds(m, 'entities');
      features.push({
        ...common,
        depthMm: parseLengthMm(expressionParam(m, 'depth')),
        symmetric: boolParam(m, 'symmetric') === true,
        endBound: enumParam(m, 'endBound'),
        regionRoles: geometryIds.map((id) => mapRegionRole(id) ?? id),
        regionGeometryIds: geometryIds,
        booleanScope: queryGeometryIds(m, 'booleanScope'),
        allMerge: boolParam(m, 'defaultScope') === true,
      });
    } else if (type === 'revolve') {
      const geometryIds = queryGeometryIds(m, 'entities');
      const axisIds = queryGeometryIds(m, 'axis');
      features.push({
        ...common,
        fullRevolve: boolParam(m, 'fullRevolve') === true,
        revolveType: enumParam(m, 'revolveType'),
        regionRoles: geometryIds.map((id) => mapRegionRole(id) ?? id),
        regionGeometryIds: geometryIds,
        axisGeometryIds: axisIds,
        axisEntityId: 17,
        booleanScope: queryGeometryIds(m, 'booleanScope'),
        allMerge: boolParam(m, 'defaultScope') === true,
      });
    } else if (type === 'fillet') {
      const edgeIds = queryGeometryIds(m, 'entities');
      features.push({
        ...common,
        radiusMm: parseLengthMm(expressionParam(m, 'radius')),
        tangentPropagation: boolParam(m, 'tangentPropagation') === true,
        onshapeEdgeIds: edgeIds,
        edgeIntent: {
          // Onshape 选底座四条短 Z 竖棱（19.05 mm 板厚），不是四条长 Y 深棱。证据：
          // recapture-2026-11-01/feature-fillet-1.png 四段等长橙色竖线。
          kind: 'box-end-short-edges',
          sourceFeature: 'Extrude 1',
          cornersMm: [
            { x: -41.275, y: -63.5 },
            { x: 41.275, y: -63.5 },
            { x: 41.275, y: 63.5 },
            { x: -41.275, y: 63.5 },
          ],
          axis: 'z',
          lengthMm: 19.05,
          extentMm: [-9.525, 9.525],
          // 后端 replay 实测 own id（Tutorial2VolumeReplay）；不沿用旧长棱的未验证 1:9..1:12。
          expectedOwnIds: ['1:1', '1:3', '1:8', '1:10'],
        },
      });
    } else {
      throw new Error(`unsupported feature type: ${type}`);
    }
  }
  return features;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function buildGold(rawDir = DEFAULT_RAW_DIR) {
  const featuresPath = path.join(rawDir, 'api-features.json');
  const featureResponse = readJson(featuresPath);
  const sketch = featureResponse.features.find((f) => f.typeName === 'BTMSketch');
  if (!sketch) throw new Error('BTMSketch not found');
  const { constraints, dimensions, histogram } = collectConstraints(sketch.message);
  const features = parseFeatures(featureResponse, { constraints });

  const gold = {
    schemaVersion: 1,
    id: 'onshape-tutorial2-build-a-part',
    source: {
      provider: 'onshape',
      docId: '5f5052a120e3451a48484808',
      workspaceId: 'e29786d0f5f8d8839772903f',
      elementId: 'c0cf346ec3bef1726450f500',
      elementName: 'First Part',
      microversion: featureResponse.sourceMicroversion,
      capturedAt: '2026-11-01',
      rawFeaturesSha256: sha256File(featuresPath),
    },
    units: { source: 'meter', playback: 'millimeter', display: 'inch' },
    coordinateFrame: {
      source: 'onshape-sketch-y-up',
      playback: 'luban-v-negative',
      transform: 'v = -y',
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        xDir: { x: 1, y: 0, z: 0 },
      },
    },
    sketch: {
      featureId: sketch.message.featureId,
      visibleEntityIds: ENTITIES.map((e) => e.id),
      entities: ENTITIES,
      constraints,
      constraintHistogram: histogram,
      dimensions,
      plane: {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        xDir: { x: 1, y: 0, z: 0 },
      },
      axisEntityId: 17,
    },
    regions: [
      { role: 'base', onshapeIds: ['JGG'], areaMm2: 1572.585 },
      { role: 'band', onshapeIds: ['JGa'], areaMm2: 1153.56 },
      { role: 'bandWing', onshapeIds: ['JGe'], aliases: ['middleBand'], areaMm2: 483.87 },
      { role: 'revolveProfile', onshapeIds: ['JGW'], aliases: ['rightRect', 'rightBlock'], areaMm2: 725.775 },
      { role: 'lobe', onshapeIds: ['JGK'], areaMm2: 2298.36 },
    ],
    features,
    expected: {
      bodyCount: 1,
      featureTree: ['Sketch 1', 'Extrude 1', 'Extrude 2', 'Extrude 3', 'Revolve 1', 'Fillet 1'],
      featureStatuses: 'all-ok',
      visibleEntityCount: 18,
      entityKindCounts: { line: 13, arc: 2, spline: 1, point: 2 },
      constraintHistogram: histogram,
      dimensionCount: dimensions.length,
      volumeM3Api: 0.00035756817668004945,
      volumeCm3Api: 357.5681766800494,
      volumeIn3Api: 21.820148910143363,
      volumeIn3Ui: 21.82,
      surfaceAreaIn2Ui: 76.23,
      legacyGoldCm3: 358.2,
      // 2026-11-02 角色修正（E2=JGa+JGe, R1=JGW）后的实测值；短棱圆角理论去材 0.422。
      lubanNoFilletReplayCm3: 357.988,
      lubanFourEdgeFilletCm3: 357.566,
      filletRemovalCm3: 0.422,
      legacyTolerance: 0.01,
      targetTolerance: 0.005,
    },
  };

  const stepsPath = path.join(rawDir, 'reconstructed-steps.json');
  if (fs.existsSync(stepsPath)) {
    const steps = readJson(stepsPath);
    gold.process = {
      officialTutorialText: false,
      officialClickstream: false,
      reconstructed: true,
      provenance: steps.provenance,
      steps: steps.steps,
    };
  }
  return gold;
}

export function validateGold(gold) {
  const errors = [];
  const eq = (actual, expected, label) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  eq(gold.sketch.visibleEntityIds.length, 18, 'visibleEntityIds');
  const entityCounts = { line: 0, arc: 0, spline: 0, point: 0 };
  for (const e of gold.sketch.entities) entityCounts[e.kind] = (entityCounts[e.kind] ?? 0) + 1;
  eq(entityCounts, { line: 13, arc: 2, spline: 1, point: 2 }, 'entityKindCounts');
  eq(gold.sketch.constraints.length, 48, 'constraintCount');
  const expectedHistogram = {
    coincident: 18, midpoint: 6, length: 4, distance: 4, parallel: 4, horizontal: 3,
    perpendicular: 2, vertical: 2, tangent: 2, offset: 2, radius: 1,
  };
  const sortedHistogram = Object.fromEntries(Object.entries(gold.sketch.constraintHistogram).sort(([a], [b]) => a.localeCompare(b)));
  const sortedExpectedHistogram = Object.fromEntries(Object.entries(expectedHistogram).sort(([a], [b]) => a.localeCompare(b)));
  eq(sortedHistogram, sortedExpectedHistogram, 'constraintHistogram');
  eq(gold.sketch.dimensions.length, 9, 'dimensionCount');
  eq(gold.features.map((f) => f.name), ['Sketch 1', 'Extrude 1', 'Extrude 2', 'Extrude 3', 'Revolve 1', 'Fillet 1'], 'featureTree');
  const extrudes = gold.features.filter((f) => f.type === 'extrude');
  eq(extrudes.map((f) => f.depthMm), [127, 50.8, 15.875], 'extrudeDepths');
  eq(extrudes.map((f) => f.operation), ['new', 'add', 'add'], 'extrudeOperations');
  eq(extrudes.map((f) => f.regionRoles), [['base'], ['band', 'bandWing'], ['lobe']], 'extrudeRegions');
  eq(extrudes.every((f) => f.symmetric === true), true, 'extrudeSymmetric');
  const revolve = gold.features.find((f) => f.type === 'revolve');
  eq(revolve.fullRevolve, true, 'revolveFull');
  eq(revolve.operation, 'add', 'revolveOperation');
  eq(revolve.regionRoles, ['revolveProfile'], 'revolveRegion');
  eq(revolve.axisEntityId, 17, 'revolveAxis');
  const fillet = gold.features.find((f) => f.type === 'fillet');
  eq(fillet.radiusMm, 5.08, 'filletRadius');
  eq(fillet.tangentPropagation, true, 'filletTangent');
  eq(fillet.onshapeEdgeIds.length, 4, 'filletEdgeCount');
  eq(fillet.edgeIntent.kind, 'box-end-short-edges', 'filletEdgeIntentKind');
  eq(fillet.edgeIntent.axis, 'z', 'filletEdgeAxis');
  eq(fillet.edgeIntent.lengthMm, 19.05, 'filletEdgeLength');
  eq(fillet.edgeIntent.cornersMm, [
    { x: -41.275, y: -63.5 }, { x: 41.275, y: -63.5 },
    { x: 41.275, y: 63.5 }, { x: -41.275, y: 63.5 },
  ], 'filletEdgeCorners');

  const spline = gold.sketch.entities.find((e) => e.kind === 'spline');
  if (!spline) errors.push('missing spline');
  else {
    const startDerivative = {
      x: (spline.controlPoints[1].x - spline.controlPoints[0].x) * 3,
      y: (spline.controlPoints[1].y - spline.controlPoints[0].y) * 3,
    };
    const endDerivative = {
      x: (spline.controlPoints[3].x - spline.controlPoints[2].x) * 3,
      y: (spline.controlPoints[3].y - spline.controlPoints[2].y) * 3,
    };
    const close = (a, b) => Math.abs(a - b) < 1e-9;
    // API derivatives are metres; playback is millimetres.
    if (!close(startDerivative.x, 5.207279098033923) || !close(startDerivative.y, -92.34145225882531)) {
      errors.push(`spline start derivative mismatch: ${JSON.stringify(startDerivative)}`);
    }
    if (!close(endDerivative.x, 120.91554489433769) || !close(endDerivative.y, -4.219688101387065)) {
      errors.push(`spline end derivative mismatch: ${JSON.stringify(endDerivative)}`);
    }
  }

  for (const c of gold.sketch.constraints) {
    for (const ref of c.refs) {
      const id = refEntityId(ref);
      if (!ENTITY_BY_ID.has(id) && id !== 0) errors.push(`constraint ${c.id} references missing entity ${id}`);
    }
  }
  const dimensionValues = gold.sketch.dimensions.map((d) => Number(d.valueMm.toFixed(4))).sort((a, b) => a - b);
  eq(dimensionValues, [15.875, 19.05, 19.05, 28.575, 50.8, 52.4002, 76.2, 82.55, 44.45].sort((a, b) => a - b), 'dimensionValues');
  if (errors.length) throw new Error('Gold fixture validation failed:\n' + errors.join('\n'));
  return true;
}

function writeOutputs(rawDir, goldDir) {
  const gold = buildGold(rawDir);
  validateGold(gold);
  fs.mkdirSync(goldDir, { recursive: true });
  const goldPath = path.join(goldDir, 'tutorial2.gold.json');
  fs.writeFileSync(goldPath, JSON.stringify(gold, null, 2) + '\n', 'utf8');
  const files = ['api-elements.json', 'api-features.json', 'api-massproperties.json', 'api-parts.json', 'reconstructed-steps.json'];
  const manifest = {
    generatedAt: new Date().toISOString(),
    files: files.filter((f) => fs.existsSync(path.join(rawDir, f))).map((f) => ({
      path: `../raw/${f}`,
      sha256: sha256File(path.join(rawDir, f)),
      bytes: fs.statSync(path.join(rawDir, f)).size,
    })).concat([{ path: 'tutorial2.gold.json', sha256: sha256File(goldPath), bytes: fs.statSync(goldPath).size }]),
  };
  fs.writeFileSync(path.join(goldDir, 'manifest.sha256.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { gold, goldPath, manifest };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const rawDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_RAW_DIR;
  const goldDir = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_GOLD_DIR;
  const { gold, goldPath, manifest } = writeOutputs(rawDir, goldDir);
  console.log(`wrote ${goldPath}`);
  console.log(`entities=${gold.sketch.entities.length} constraints=${gold.sketch.constraints.length} dimensions=${gold.sketch.dimensions.length} features=${gold.features.length}`);
  console.log(`histogram=${JSON.stringify(gold.sketch.constraintHistogram)}`);
  console.log(`manifest files=${manifest.files.length}`);
}
