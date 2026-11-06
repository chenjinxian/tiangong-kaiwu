// Test-only parity scenario validator (ADR-0003).
// No runtime dependency and no product RPC surface: scenarios are evidence/test
// artifacts, never a second modeling API.

import { readFile } from "node:fs/promises";

export const SCENARIO_SCHEMA_VERSION = 1;

export const FEATURE_TYPES = new Set([
  "sketch",
  "extrude",
  "revolve",
  "fillet",
  "chamfer",
  "shell",
  "mirror",
  "pattern",
  "booleanBodies",
  "booleanAdd",
  "booleanSubtract",
  "loft",
  "sweep",
  "hole",
  "cPlane",
  "faceExtrude",
]);

export const PROVENANCE_STATUSES = new Set([
  "complete",
  "blocked-evidence",
  "blocked-capability",
]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function checkVec3(errors, path, value) {
  if (!isObject(value)) {
    errors.push(`${path} 必须是 {x,y,z} 对象`);
    return;
  }
  for (const axis of ["x", "y", "z"]) {
    if (!isFiniteNumber(value[axis])) errors.push(`${path}.${axis} 必须是有限数字`);
  }
}

/**
 * Structural validation of a parity scenario v1.
 * Returns { ok, errors }. It validates the cross-field rules the JSON Schema
 * cannot express conveniently (blocked-* requires a non-empty missing list).
 */
export function validateScenario(value) {
  const errors = [];
  if (!isObject(value)) return { ok: false, errors: ["场景必须是 JSON 对象"] };

  if (value.schemaVersion !== SCENARIO_SCHEMA_VERSION)
    errors.push(`schemaVersion 必须为 ${SCENARIO_SCHEMA_VERSION}`);
  if (!isNonEmptyString(value.id)) errors.push("id 必须是非空字符串");
  if (value.units !== undefined && value.units !== "mm" && value.units !== "m")
    errors.push("units 只能是 mm 或 m");
  for (const key of ["docId", "elementId", "owner", "name"]) {
    if (value[key] !== undefined && typeof value[key] !== "string")
      errors.push(`${key} 必须是字符串`);
  }

  if (!Array.isArray(value.features)) {
    errors.push("features 必须是数组");
  } else {
    value.features.forEach((feature, index) => {
      const path = `features[${index}]`;
      if (!isObject(feature)) {
        errors.push(`${path} 必须是对象`);
        return;
      }
      if (!FEATURE_TYPES.has(feature.type))
        errors.push(`${path}.type 不支持：${String(feature.type)}`);
      if (!isNonEmptyString(feature.name)) errors.push(`${path}.name 必须是非空字符串`);
      if (!isObject(feature.params)) errors.push(`${path}.params 必须是对象`);
      if (feature.sourceFeatureId !== undefined && typeof feature.sourceFeatureId !== "string")
        errors.push(`${path}.sourceFeatureId 必须是字符串`);
      if (feature.sourceType !== undefined && typeof feature.sourceType !== "string")
        errors.push(`${path}.sourceType 必须是字符串`);
    });
  }

  const expected = value.expected;
  if (!isObject(expected)) {
    errors.push("expected 必须是对象");
  } else {
    if (!isFiniteNumber(expected.volumeM3) || expected.volumeM3 < 0)
      errors.push("expected.volumeM3 必须是 >= 0 的有限数字");
    if (!Number.isInteger(expected.bodyCount) || expected.bodyCount < 0)
      errors.push("expected.bodyCount 必须是 >= 0 的整数");
    if (!isFiniteNumber(expected.tolerance) || expected.tolerance <= 0 || expected.tolerance > 1)
      errors.push("expected.tolerance 必须在 (0,1] 内");
    if (expected.featureTree !== undefined) {
      if (!Array.isArray(expected.featureTree) || expected.featureTree.some((name) => typeof name !== "string"))
        errors.push("expected.featureTree 必须是字符串数组");
    }
    if (expected.bodies !== undefined) {
      if (!Array.isArray(expected.bodies)) {
        errors.push("expected.bodies 必须是数组");
      } else {
        expected.bodies.forEach((body, index) => {
          const path = `expected.bodies[${index}]`;
          if (!isObject(body)) {
            errors.push(`${path} 必须是对象`);
            return;
          }
          if (!isFiniteNumber(body.volumeM3) || body.volumeM3 < 0)
            errors.push(`${path}.volumeM3 必须是 >= 0 的有限数字`);
          if (body.massKg !== undefined && (!isFiniteNumber(body.massKg) || body.massKg < 0))
            errors.push(`${path}.massKg 必须是 >= 0 的有限数字`);
          if (body.centroid !== undefined) checkVec3(errors, `${path}.centroid`, body.centroid);
          if (body.partId !== undefined && typeof body.partId !== "string")
            errors.push(`${path}.partId 必须是字符串`);
          if (body.name !== undefined && typeof body.name !== "string")
            errors.push(`${path}.name 必须是字符串`);
        });
      }
    }
  }

  const provenance = value.provenance;
  if (!isObject(provenance)) {
    errors.push("provenance 必须是对象");
  } else {
    if (!isNonEmptyString(provenance.capturedAt))
      errors.push("provenance.capturedAt 必须是非空字符串");
    if (!PROVENANCE_STATUSES.has(provenance.status))
      errors.push(`provenance.status 不支持：${String(provenance.status)}`);
    if (provenance.missing !== undefined
      && (!Array.isArray(provenance.missing) || provenance.missing.some((item) => typeof item !== "string")))
      errors.push("provenance.missing 必须是字符串数组");
    if (provenance.status === "blocked-evidence" || provenance.status === "blocked-capability") {
      if (!Array.isArray(provenance.missing) || provenance.missing.length === 0)
        errors.push(`provenance.status=${provenance.status} 时必须列出非空 missing`);
    }
  }

  if (value.ui !== undefined) {
    if (!isObject(value.ui)) {
      errors.push("ui 必须是对象");
    } else {
      if (value.ui.evidence !== undefined) {
        if (!Array.isArray(value.ui.evidence)) {
          errors.push("ui.evidence 必须是数组");
        } else {
          value.ui.evidence.forEach((item, index) => {
            const path = `ui.evidence[${index}]`;
            if (!isObject(item)) {
              errors.push(`${path} 必须是对象`);
              return;
            }
            if (!["screenshot", "dom", "aria", "video"].includes(item.kind))
              errors.push(`${path}.kind 不支持：${String(item.kind)}`);
            if (!isNonEmptyString(item.path)) errors.push(`${path}.path 必须是非空字符串`);
          });
        }
      }
      if (value.ui.actions !== undefined
        && (!Array.isArray(value.ui.actions) || value.ui.actions.some((item) => typeof item !== "string")))
        errors.push("ui.actions 必须是字符串数组");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertScenario(value) {
  const result = validateScenario(value);
  if (!result.ok)
    throw new Error(`parity scenario 校验失败：\n- ${result.errors.join("\n- ")}`);
  return value;
}

export async function loadScenario(file) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`无法读取 parity scenario ${file}: ${error.message}`);
  }
  return assertScenario(parsed);
}
