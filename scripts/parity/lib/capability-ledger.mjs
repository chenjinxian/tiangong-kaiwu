/**
 * Capability ledger builder/verifier shared logic.
 *
 * Single source of truth inputs (all public):
 *  - luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts
 *  - luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts
 *  - docs/parity/capability-overrides.json (curated status/evidence overrides)
 *
 * The ledger is generated; never hand-edit capability-ledger.json or
 * CAPABILITY-LEDGER.md. Status semantics live in docs/parity/STATUS-DEFINITIONS.md.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const GENERATED_AT = '2026-11-19';
export const OWNER = 'parity-program';

export const ALLOWED_STATUSES = new Set([
  'full',
  'partial',
  'gated',
  'blocked-license',
  'blocked-kernel',
  'blocked-design',
  'excluded',
  'planned',
]);

const SHARED_REL = 'luban-cad/packages/shared/src/rpc/LubanFeatureRpcInterface.ts';
const UI_REL = 'luban-cad/apps/web/src/modules/part-studio/internal/capabilities.ts';
const OVERRIDES_REL = 'docs/parity/capability-overrides.json';

const FEATURE_TO_UI = {
  extrude: 'extrude',
  booleanAdd: 'boolean',
  booleanSubtract: 'boolean',
  fillet: 'fillet',
  chamfer: 'chamfer',
  shell: 'shell',
  revolve: 'revolve',
  loft: 'loft',
  sweep: 'sweep',
  mirror: 'mirror',
  pattern: 'linearPattern',
  featurePattern: 'linearPattern',
  featureMirror: 'mirror',
  booleanBodies: 'boolean',
  hole: 'hole',
  cPlane: 'cPlane',
  faceExtrude: 'extrude',
  transform: 'transform',
  splitPart: 'splitPart',
  moveFace: 'moveFace',
};

const FEATURE_MISSING_FAMILIES = new Set([
  'draft',
  'rib',
  'thicken',
  'thread',
  'surfaces',
  'curves',
  'wrap',
  'sheetMetal',
  'frames',
  'deleteFace',
  'replaceFace',
  'deleteBodies',
  'curvePattern',
  'modifyFillet',
  'faceBlend',
]);

/**
 * 不属于 UI/feature/constraint/entity 自动来源的跨族能力行（如草图外部引用）。
 * overrides 只允许引用生成器已知 id；新增族必须先在此登记。
 */
const EXTRA_CAPABILITIES = [
  { id: 'sketch.externalRefs.modelEdge', family: 'sketch', onshapeEntry: 'sketch.externalRefs.modelEdge' },
  { id: 'sketch.externalRefs.pierce', family: 'sketch', onshapeEntry: 'sketch.externalRefs.pierce' },
];

const DOCUMENT_OR_NON_GEOMETRY = new Set([
  'render',
  'drawing',
  'material',
  'appearance',
  'notifications',
  'print',
  'assemblyEdit',
  'dependencies',
  'moveDocument',
  'restoreWorkspace',
  'copyWorkspace',
  'updateWorkspace',
  'workspaceProperties',
  'insertElement',
  'pauseRebuild',
  'featureHistory',
  'decal',
  'userFeatures',
]);

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function parseUiCapabilities(source) {
  const ui = new Map();
  const re = /^\s*([A-Za-z_][\w]*):\s*'(full|gated)',/gm;
  let match;
  while ((match = re.exec(source)) !== null) {
    ui.set(match[1], { status: match[2], line: lineAt(source, match.index) });
  }
  return ui;
}

function parseFeatureTypes(source) {
  const match = /export type LubanFeatureType\s*=\s*([^;]+);/.exec(source);
  if (!match) throw new Error('LubanFeatureType union not found');
  const line = lineAt(source, match.index);
  const types = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { types, line };
}

function parseConstraintKinds(source) {
  const iface = source.indexOf('export interface SketchConstraintDto');
  if (iface < 0) throw new Error('SketchConstraintDto not found');
  const end = source.indexOf('}', iface);
  const block = source.slice(iface, end);
  const kindLine = /kind:\s*([^;]+);/.exec(block);
  if (!kindLine) throw new Error('SketchConstraintDto.kind union not found');
  const kinds = [...kindLine[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { kinds, line: lineAt(source, iface + kindLine.index) };
}

function parseEntityKinds(source) {
  const start = source.indexOf('export type SketchEntityDto');
  if (start < 0) throw new Error('SketchEntityDto not found');
  const next = source.indexOf('export interface SketchConstraintDto', start);
  const block = source.slice(start, next < 0 ? source.length : next);
  const kinds = [];
  const lines = new Map();
  for (const m of block.matchAll(/kind:\s*"([^"]+)"/g)) {
    if (!kinds.includes(m[1])) kinds.push(m[1]);
    lines.set(m[1], lineAt(source, start + m.index));
  }
  return { kinds, line: lineAt(source, start), lines };
}

function parseInterfaceVersion(source) {
  const match = /interfaceVersion\s*=\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error('LubanFeatureRpcInterface.interfaceVersion not found');
  return match[1];
}

function hashSources(parts) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex');
}

function readOverrides(root) {
  const text = readFileSync(resolve(root, OVERRIDES_REL), 'utf8');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('capability-overrides.json must be an object');
  }
  return parsed.overrides ?? {};
}

function applyOverride(row, override) {
  if (!override) return row;
  if (override.status != null) row.status = override.status;
  if (override.scopeNote != null) row.scopeNote = override.scopeNote;
  if (override.missing != null) row.missing = [...override.missing];
  if (override.contractRef != null) row.contractRef = override.contractRef;
  if (override.uiRef != null) row.uiRef = override.uiRef;
  if (override.backendRef != null) row.backendRef = override.backendRef;
  if (override.kernelRef != null) row.kernelRef = override.kernelRef;
  if (override.evidence != null) row.evidence = [...override.evidence];
  if (override.wave != null) row.wave = override.wave;
  if (override.owner != null) row.owner = override.owner;
  if (override.lastUpdated != null) row.lastUpdated = override.lastUpdated;
  return row;
}

function defaultMissing(status) {
  if (status === 'partial') return ['未按七维 full 门审计（W0 基线）'];
  if (status === 'gated') return ['未实现（诚实 gated）'];
  if (status === 'planned') return ['未开工'];
  return [];
}

function defaultWave(family, key) {
  if (family === 'constraint' || family === 'entity') return 'W1';
  if (family === 'feature') return 'W3';
  if (key.startsWith('sketch')) return 'W2';
  if (FEATURE_MISSING_FAMILIES.has(key)) return 'W4';
  if (DOCUMENT_OR_NON_GEOMETRY.has(key)) return 'W5';
  return 'W2';
}

export function buildLedger(root) {
  const sharedPath = resolve(root, SHARED_REL);
  const uiPath = resolve(root, UI_REL);
  const shared = readFileSync(sharedPath, 'utf8');
  const uiSource = readFileSync(uiPath, 'utf8');
  const overrides = readOverrides(root);

  const ui = parseUiCapabilities(uiSource);
  const features = parseFeatureTypes(shared);
  const constraints = parseConstraintKinds(shared);
  const entities = parseEntityKinds(shared);
  const version = parseInterfaceVersion(shared);

  const rows = [];
  const knownIds = new Set();

  for (const [key, info] of [...ui.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `ui.${key}`;
    knownIds.add(id);
    rows.push(applyOverride({
      id,
      family: 'tooling',
      onshapeEntry: key,
      status: info.status === 'full' ? 'partial' : 'gated',
      scopeNote: info.status === 'full'
        ? 'UI 入口可用；全量七维证据未审计'
        : 'UI 入口 gated（能力引导）',
      missing: defaultMissing(info.status === 'full' ? 'partial' : 'gated', 'ui'),
      contractRef: null,
      uiRef: `${UI_REL}:${info.line}`,
      backendRef: null,
      kernelRef: null,
      evidence: [],
      wave: defaultWave('ui', key),
      owner: OWNER,
      lastUpdated: null,
    }, overrides[id]));
  }

  for (const type of features.types.sort()) {
    const id = `feature.${type}`;
    knownIds.add(id);
    const tool = FEATURE_TO_UI[type];
    const toolInfo = tool ? ui.get(tool) : undefined;
    const status = toolInfo?.status === 'gated' ? 'gated' : 'partial';
    rows.push(applyOverride({
      id,
      family: 'feature',
      onshapeEntry: type,
      status,
      scopeNote: tool
        ? `LubanFeatureType=${type}；映射 UI 工具 ${tool}`
        : `LubanFeatureType=${type}；无直接 UI 映射`,
      missing: defaultMissing(status, 'feature'),
      contractRef: `${SHARED_REL}:${features.line}`,
      uiRef: toolInfo ? `${UI_REL}:${toolInfo.line}` : null,
      backendRef: null,
      kernelRef: null,
      evidence: [],
      wave: defaultWave('feature', type),
      owner: OWNER,
      lastUpdated: null,
    }, overrides[id]));
  }

  for (const kind of constraints.kinds.sort()) {
    const id = `constraint.${kind}`;
    knownIds.add(id);
    rows.push(applyOverride({
      id,
      family: 'constraint',
      onshapeEntry: kind,
      status: 'partial',
      scopeNote: '契约存在；实体组合/求解器覆盖未审计',
      missing: defaultMissing('partial', 'constraint'),
      contractRef: `${SHARED_REL}:${constraints.line}`,
      uiRef: null,
      backendRef: null,
      kernelRef: null,
      evidence: [],
      wave: 'W1',
      owner: OWNER,
      lastUpdated: null,
    }, overrides[id]));
  }

  for (const kind of entities.kinds.sort()) {
    const id = `entity.${kind}`;
    knownIds.add(id);
    rows.push(applyOverride({
      id,
      family: 'entity',
      onshapeEntry: kind,
      status: 'partial',
      scopeNote: '契约存在；创建/编辑/面域/渲染/拾取覆盖未审计',
      missing: defaultMissing('partial', 'entity'),
      contractRef: `${SHARED_REL}:${entities.lines.get(kind) ?? entities.line}`,
      uiRef: null,
      backendRef: null,
      kernelRef: null,
      evidence: [],
      wave: 'W1',
      owner: OWNER,
      lastUpdated: null,
    }, overrides[id]));
  }

  for (const extra of EXTRA_CAPABILITIES) {
    knownIds.add(extra.id);
    rows.push(applyOverride({
      id: extra.id,
      family: extra.family,
      onshapeEntry: extra.onshapeEntry,
      status: 'partial',
      scopeNote: '未审计',
      missing: defaultMissing('partial'),
      contractRef: null,
      uiRef: null,
      backendRef: null,
      kernelRef: null,
      evidence: [],
      wave: 'W2',
      owner: OWNER,
      lastUpdated: null,
    }, overrides[extra.id]));
  }

  for (const id of Object.keys(overrides)) {
    if (!knownIds.has(id)) {
      throw new Error(`capability-overrides.json references unknown capability id: ${id}`);
    }
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));

  const countByStatus = {};
  for (const row of rows) {
    countByStatus[row.status] = (countByStatus[row.status] ?? 0) + 1;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: GENERATED_AT,
    sources: {
      sharedInterfaceVersion: version,
      sharedFile: SHARED_REL,
      uiFile: UI_REL,
      overridesFile: OVERRIDES_REL,
      uiCapabilities: ui.size,
      featureTypes: features.types.length,
      constraintKinds: constraints.kinds.length,
      entityKinds: entities.kinds.length,
    },
    counts: {
      total: rows.length,
      byStatus: Object.fromEntries(Object.entries(countByStatus).sort(([a], [b]) => a.localeCompare(b))),
    },
    sourceHash: hashSources([shared, uiSource, JSON.stringify(readOverrides(root))]),
    rows,
  };
}

export function renderMarkdown(ledger) {
  const lines = [];
  lines.push('# Capability Ledger（生成产物，勿手改）');
  lines.push('');
  lines.push('> 由 `scripts/parity/build-capability-ledger.mjs` 生成；状态定义见');
  lines.push('> [`STATUS-DEFINITIONS.md`](./STATUS-DEFINITIONS.md)。修改来源或');
  lines.push('> `capability-overrides.json` 后重新生成并运行 verify。');
  lines.push('');
  lines.push(`- shared 接口版本：\`${ledger.sources.sharedInterfaceVersion}\``);
  lines.push(`- 生成日期：${ledger.generatedAt}`);
  lines.push(`- 行数：${ledger.counts.total}`);
  lines.push(`- 状态分布：${Object.entries(ledger.counts.byStatus).map(([k, v]) => `${k}=${v}`).join('，')}`);
  lines.push('');
  lines.push('| ID | Family | Status | Wave | Scope / Missing | UI | Contract | Backend | Kernel | Evidence |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const row of ledger.rows) {
    const scope = [row.scopeNote, ...(row.missing ?? [])].filter(Boolean).join('；')
      .replaceAll('|', '\\|');
    lines.push(`| \`${row.id}\` | ${row.family} | ${row.status} | ${row.wave} | ${scope} | ${row.uiRef ?? '—'} | ${row.contractRef ?? '—'} | ${row.backendRef ?? '—'} | ${row.kernelRef ?? '—'} | ${(row.evidence ?? []).join('<br>') || '—'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function verifyLedger(root) {
  const errors = [];
  const ledgerPath = resolve(root, 'docs/parity/capability-ledger.json');
  let checkedIn;
  try {
    checkedIn = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    return [`无法读取 ${ledgerPath}: ${error.message}`];
  }

  let generated;
  try {
    generated = buildLedger(root);
  } catch (error) {
    return [`生成失败: ${error.message}`];
  }

  if (checkedIn.schemaVersion !== generated.schemaVersion) {
    errors.push(`schemaVersion 不一致: ${checkedIn.schemaVersion} != ${generated.schemaVersion}`);
  }
  if (checkedIn.sourceHash !== generated.sourceHash) {
    errors.push('sourceHash 不一致：能力来源已变化，请重新生成 capability ledger');
  }
  if (JSON.stringify(checkedIn.sources) !== JSON.stringify(generated.sources)) {
    errors.push('sources 不一致：来源统计已变化，请重新生成');
  }
  if (JSON.stringify(checkedIn.counts) !== JSON.stringify(generated.counts)) {
    errors.push('counts 不一致：能力数量已变化，请重新生成');
  }
  if (JSON.stringify(checkedIn.rows) !== JSON.stringify(generated.rows)) {
    errors.push('rows 不一致：账本与生成结果不同，请重新生成（勿手改产物）');
  }

  const ids = new Set();
  for (const row of checkedIn.rows ?? []) {
    if (ids.has(row.id)) errors.push(`重复 capability id: ${row.id}`);
    ids.add(row.id);
    if (!ALLOWED_STATUSES.has(row.status)) {
      errors.push(`非法状态 ${row.id}: ${row.status}`);
    }
    if (row.status === 'full') {
      if (!row.evidence || row.evidence.length === 0) {
        errors.push(`full 行缺少证据: ${row.id}`);
      }
      if (!row.uiRef || !row.contractRef) {
        errors.push(`full 行缺少 uiRef/contractRef: ${row.id}`);
      }
    }
    if (row.id.startsWith('ui.') && row.status === 'excluded') {
      errors.push(`UI 能力不应标 excluded: ${row.id}`);
    }
  }

  if (!checkedIn.rows?.some((row) => row.id.startsWith('ui.'))) {
    errors.push('账本缺少 UI 能力行');
  }
  if (!checkedIn.rows?.some((row) => row.id.startsWith('feature.'))) {
    errors.push('账本缺少 feature 行');
  }
  if (!checkedIn.rows?.some((row) => row.id.startsWith('constraint.'))) {
    errors.push('账本缺少 constraint 行');
  }
  if (!checkedIn.rows?.some((row) => row.id.startsWith('entity.'))) {
    errors.push('账本缺少 entity 行');
  }

  const raw = JSON.stringify(checkedIn);
  for (const forbidden of ['D:\\\\Github', 'onshape-parity-data', 'imodel-native', 'luban-backend']) {
    if (raw.includes(forbidden)) {
      errors.push(`账本包含私有路径/仓名: ${forbidden}`);
    }
  }

  return errors;
}
