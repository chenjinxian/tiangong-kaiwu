/**
 * Public /examples catalog generation/validation (W6-E6, 2026-11-19).
 *
 * Single source: docs/parity/public-catalog.input.json — a sanitized projection of
 * the private tri-state registry's `strict && publicEligible` rows. The input may be
 * committed because it contains only display fields (no doc/element ids, raw
 * features, coordinates, evidence paths or private repo paths).
 *
 * Generated artifact: luban-cad/apps/web/src/modules/examples/catalog.ts (never
 * hand-edit). scripts/parity/verify-public-catalog.mjs fails if the checked-in file
 * diverges from the input or if any entry is not strict/public-safe.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const INPUT_REL = 'docs/parity/public-catalog.input.json';
export const OUTPUT_REL = 'luban-cad/apps/web/src/modules/examples/catalog.ts';

const ALLOWED_KEYS = new Set([
  'id', 'title', 'owner', 'document', 'partStudio', 'projectName', 'imodelName',
  'volumeMm3', 'cover', 'strictness', 'note',
]);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ABS_PATH_RE = /(?:[A-Za-z]:[\\/]|(?:^|\s)\/(?:home|users|tmp|var|opt)\/)/i;
const FORBIDDEN_TEXT_RE = /(?:docId|elementId|featureId|imodelId|changesetId|evidence|onshape-parity-data|luban-backend)/i;

export function readInput(root) {
  return JSON.parse(readFileSync(resolve(root, INPUT_REL), 'utf8'));
}

export function validateInput(root, input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ['input must be an object'];
  }
  if (input.schemaVersion !== 1) errors.push(`schemaVersion must be 1 (got ${input.schemaVersion})`);
  if (input.legacy !== undefined && typeof input.legacy !== 'boolean')
    errors.push('legacy must be a boolean when present');
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    errors.push('entries must be a non-empty array');
    return errors;
  }
  const ids = new Set();
  input.entries.forEach((entry, index) => {
    const at = `entries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${at} must be an object`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_KEYS.has(key)) errors.push(`${at} has forbidden/unknown key "${key}"`);
    }
    for (const key of ['id', 'title', 'owner', 'document', 'partStudio', 'projectName', 'imodelName', 'cover']) {
      if (typeof entry[key] !== 'string' || entry[key].length === 0) errors.push(`${at}.${key} must be a non-empty string`);
    }
    if (typeof entry.id === 'string') {
      if (ids.has(entry.id)) errors.push(`${at}.id duplicated: ${entry.id}`);
      ids.add(entry.id);
    }
    if (!Number.isFinite(entry.volumeMm3) || entry.volumeMm3 <= 0) errors.push(`${at}.volumeMm3 must be finite > 0`);
    if (entry.strictness !== 'strict' && entry.strictness !== 'strict-oracle')
      errors.push(`${at}.strictness must be strict|strict-oracle (got ${entry.strictness})`);
    if (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length === 0))
      errors.push(`${at}.note must be a non-empty string when present`);
    if (typeof entry.cover === 'string' && !entry.cover.startsWith('/showcase/'))
      errors.push(`${at}.cover must be under /showcase/`);
    if (typeof entry.cover === 'string' && entry.cover.startsWith('/showcase/')
      && !existsSync(resolve(root, 'luban-cad/apps/web/public', entry.cover.slice(1))))
      errors.push(`${at}.cover file missing in apps/web/public: ${entry.cover}`);
    // Public-safety scan of display text (no ids/raw evidence/private paths).
    for (const key of Object.keys(entry)) {
      if (typeof entry[key] !== 'string') continue;
      const value = entry[key];
      if (UUID_RE.test(value)) errors.push(`${at}.${key} contains a UUID`);
      if (ABS_PATH_RE.test(value)) errors.push(`${at}.${key} contains an absolute path`);
      if (FORBIDDEN_TEXT_RE.test(value)) errors.push(`${at}.${key} contains private evidence/id marker`);
    }
  });
  return errors;
}

function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function renderCatalog(input) {
  const entries = input.entries.map((entry) => {
    const lines = [
      `    id: ${quote(entry.id)},`,
      `    title: ${quote(entry.title)},`,
      `    owner: ${quote(entry.owner)},`,
      `    document: ${quote(entry.document)},`,
      `    partStudio: ${quote(entry.partStudio)},`,
      `    projectName: ${quote(entry.projectName)},`,
      `    imodelName: ${quote(entry.imodelName)},`,
      `    volumeMm3: ${entry.volumeMm3},`,
      `    cover: ${quote(entry.cover)},`,
      `    strictness: ${quote(entry.strictness)},`,
    ];
    if (entry.note !== undefined) lines.push(`    note: ${quote(entry.note)},`);
    return `  {\n${lines.join('\n')}\n  },`;
  });
  return `/**
 * 全部 Onshape 示例目录（public, 只读投影）。
 *
 * GENERATED FILE — do not edit. Source: docs/parity/public-catalog.input.json
 * （脱敏投影；不含 doc/element id、原始 features、坐标、证据路径或私有仓路径）。
 * 重新生成：node scripts/parity/build-public-catalog.mjs
 * 校验：node scripts/parity/verify-public-catalog.mjs
 *
 * ⚠️ 状态口径（W0 2026-11-19 重审）：旧 22 条公共示例已全部降级为 approx
 * （publicEligible=0）；\`EXAMPLE_CATALOG_LEGACY=true\` 是本投影的机器可读标记。
 * 本文件仅供旧演示导航；strict 目录待 W6 重审晋级后重新生成，页面不得把本投影
 * 宣称为 strict。
 *
 * \`projectName + imodelName\` 用于运行时按名解析真实 iModel；不硬编码 UUID。
 */

export type ExampleStrictness = 'strict' | 'strict-oracle';

/** W0 重审后的旧投影标记：true = 本目录条目均为旧演示（approx，不计 strict）。 */
export const EXAMPLE_CATALOG_LEGACY = ${input.legacy === false ? 'false' : 'true'};

export interface ExampleCatalogEntry {
  /** 稳定 slug（同私有 index 的 source 组合）。 */
  id: string;
  /** 展示标题（document / Part Studio 的可读组合）。 */
  title: string;
  owner: string;
  document: string;
  partStudio: string;
  /** 持久 iModel 所在项目；运行时只按名匹配，不写 UUID。 */
  projectName: string;
  /** 持久 iModel 名；与 e2e/示例库现状一致。 */
  imodelName: string;
  /** Onshape 目标体积（mm³，私有 index 的 expected totalVolumeMm3）。 */
  volumeMm3: number;
  /** 公共封面（真实栈截图）。 */
  cover: string;
  strictness: ExampleStrictness;
  note?: string;
}

export const EXAMPLE_CATALOG: readonly ExampleCatalogEntry[] = [
${entries.join('\n')}
];

export const EXAMPLE_OWNERS: readonly string[] = Array.from(
  new Set(EXAMPLE_CATALOG.map((entry) => entry.owner)),
);

export const EXAMPLE_CATALOG_PROJECT_NAMES: readonly string[] = Array.from(
  new Set(EXAMPLE_CATALOG.map((entry) => entry.projectName)),
);

/** 目标体积的只读展示（mm³；极小的 WARNING LABEL 保留 3 位小数）。 */
export function formatExampleVolume(volumeMm3: number): string {
  if (!Number.isFinite(volumeMm3)) return '—';
  if (volumeMm3 < 1) return \`\${volumeMm3.toFixed(3)} mm³\`;
  return \`\${volumeMm3.toLocaleString('en-US', { maximumFractionDigits: 3 })} mm³\`;
}
`;
}
