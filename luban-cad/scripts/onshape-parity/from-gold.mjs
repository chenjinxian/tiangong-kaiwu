// Convert a Tutorial-2-style gold fixture into parity scenario v1.
// The gold fixture is already a curated representation of the Onshape source;
// this wrapper keeps the scenario contract versioned and replay-ready without
// requiring the private raw corpus.
//
// Usage (from luban-cad):
//   node scripts/onshape-parity/from-gold.mjs \
//     --gold apps/web/e2e/fixtures/onshape-tutorial2/gold/tutorial2.gold.json \
//     --out apps/web/e2e/fixtures/parity/tutorial2.scenario.json

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { assertScenario } from "./scenario.mjs";

const { values } = parseArgs({
  options: {
    gold: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.gold || !values.out) {
  console.error("用法：node scripts/onshape-parity/from-gold.mjs --gold <gold.json> --out <scenario.json>");
  process.exit(2);
}

const goldPath = path.resolve(values.gold);
const outPath = path.resolve(values.out);
const gold = JSON.parse(await readFile(goldPath, "utf8"));

if (!gold.sketch || !Array.isArray(gold.features) || !gold.expected)
  throw new Error("gold fixture 缺少 sketch/features/expected");

const features = [
  {
    type: "sketch",
    name: gold.features[0]?.name ?? "Sketch 1",
    sourceFeatureId: gold.sketch.featureId,
    sourceType: "newSketch",
    params: {
      plane: gold.sketch.plane,
      entities: gold.sketch.entities,
      constraints: gold.sketch.constraints,
      axisEntityId: gold.sketch.axisEntityId,
      visibleEntityIds: gold.sketch.visibleEntityIds,
    },
  },
];

for (const feature of gold.features) {
  const { name, featureId, type, sourceType, ...params } = feature;
  if (type === "newSketch") continue;
  features.push({
    type,
    name,
    sourceFeatureId: featureId,
    ...(sourceType ? { sourceType } : {}),
    params,
  });
}

const provenance = {
  capturedAt: gold.source?.capturedAt ?? new Date().toISOString().slice(0, 10),
  ...(gold.source?.microversion ? { sourceMicroversion: gold.source.microversion } : {}),
  ...(gold.source?.rawFeaturesSha256 ? { rawFeaturesSha256: gold.source.rawFeaturesSha256 } : {}),
  status: "complete",
  notes: [
    `gold=${path.basename(goldPath)}`,
    `volumeCm3Api=${gold.expected.volumeCm3Api}`,
    `volumeCm3Luban=${gold.expected.lubanFourEdgeFilletCm3}`,
  ],
};

const scenario = assertScenario({
  schemaVersion: 1,
  id: gold.id ?? `onshape-${gold.source?.docId}-${gold.source?.elementId}`,
  docId: gold.source?.docId,
  elementId: gold.source?.elementId,
  owner: gold.source?.provider,
  name: gold.source?.elementName,
  units: "mm",
  features,
  expected: {
    volumeM3: gold.expected.volumeM3Api,
    bodyCount: gold.expected.bodyCount,
    featureTree: gold.expected.featureTree,
    tolerance: gold.expected.targetTolerance ?? 0.01,
    notes: [
      `volumeCm3Api=${gold.expected.volumeCm3Api}`,
      `lubanNoFilletCm3=${gold.expected.lubanNoFilletReplayCm3}`,
      `lubanFourEdgeFilletCm3=${gold.expected.lubanFourEdgeFilletCm3}`,
      `filletRemovalCm3=${gold.expected.filletRemovalCm3}`,
    ],
  },
  provenance,
});

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (${features.length} features)`);
