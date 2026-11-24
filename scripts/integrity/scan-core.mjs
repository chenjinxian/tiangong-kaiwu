/**
 * Pure scan logic for scripts/integrity/Invoke-IntegrityScan.mjs.
 *
 * This module performs no I/O. Callers supply a normalized *snapshot* of Hub
 * metadata (changesets, baselines, checkpoints, named versions, iModels) and an
 * *inventory* of object-store blobs (name, size, optional sha256/sha1/md5).
 *
 * The scan is intentionally conservative:
 *  - A reference that cannot be mapped to a blob path is reported as
 *    `unverified` (scan incomplete, exit 3), never as clean.
 *  - Chain roots are computed from stored chainHash values; this module does
 *    not independently re-hash the canonical changeset row tuple (documented
 *    limitation).
 *  - Orphan detection is opt-in via prefixes because an object store can hold
 *    blobs owned by other lifecycle components (checkpoint blocks, tiles).
 */

import { createHash } from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const REPORT_KIND = 'tiangong-kaiwu-integrity-scan';
export const EXIT_CODES = Object.freeze({
  OK: 0,
  FINDINGS: 1,
  USAGE: 2,
  INCOMPLETE: 3,
});

export const LIMITATIONS = Object.freeze([
  'Read-only consistency check of mapped Hub metadata against an object-store inventory; it does not repair, quarantine, delete, or migrate anything.',
  'Does not prove backup restorability, RPO, or RTO. Those require a restore drill in an isolated environment (docs/operations/DR-DRILL.md).',
  'Does not validate BIS/model semantics, geometry, element contents, tiles, briefcases, Redis/queue state, or host-local caches.',
  'Does not independently recompute canonical changeset chainHash values; it only reports stored chain roots and checks parent/prevHash consistency.',
  'SHA-256/SHA-1 equality proves the scanned blob bytes match the declared digest. It is not a signature and cannot detect coordinated tampering of DB + storage.',
  'Checkpoint CloudSqlite block completeness/readback is out of scope; a checkpoint row and its container can be mapped only when the adapter supplies a concrete blob path.',
  'Orphan detection covers only configured prefixes and can report false orphans for blobs owned by other lifecycle components unless prefixes are narrowed correctly.',
  'The scan is not a cross-store atomic snapshot. A live writer can change DB rows or blobs while the scan is running; use a quiesced or isolated target for strong conclusions.',
  'The live Postgres adapter depends on the Hub schema version. Unmapped tables/columns surface as incomplete (exit 3), not clean.',
  'Azurite is development-only; its well-known credentials and non-versioned storage are not a production integrity or security control.',
]);

const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const COMMITTED = 'fileuploaded';
const PENDING = 'waitingforfile';

export class IntegrityInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntegrityInputError';
  }
}

const REMEDIATIONS = Object.freeze({
  'missing-changeset-blob':
    'Restore the missing changeset blob from the same backup set (DB + object store together). Do not fabricate a blob or edit the changeset row.',
  'blob-size-mismatch':
    'Treat the changeset as corrupt. Restore both DB and object store from the same verified backup set and rerun the scan.',
  'blob-sha256-mismatch':
    'Treat the changeset as corrupt. Restore both DB and object store from the same verified backup set and rerun the scan.',
  'blob-sha1-mismatch':
    'Treat the changeset as corrupt. Restore both DB and object store from the same verified backup set and rerun the scan.',
  'missing-changeset':
    'A contiguous committed index range is missing. Restore the ledger from a backup set and investigate the writer that removed or failed to persist the row.',
  'missing-parent':
    'The ledger has a committed changeset without a parent link. Restore from backup; do not patch parentId in place.',
  'dangling-parent':
    'parentId does not resolve to a committed changeset in the same iModel. Restore the missing row or the whole ledger from the same backup set.',
  'parent-index-mismatch':
    'Parent link points to the wrong index. Treat the ledger as corrupt and restore from a verified backup set.',
  'prev-hash-mismatch':
    'prevHash does not match the parent chainHash. Treat the chain as broken and restore from a verified backup set.',
  'duplicate-changeset-index':
    'Two active rows claim one index. Determine whether a waitingForFile row is a ghost; restore/recover using the approved D2 path, not ad-hoc deletes.',
  'pending-changeset-in-chain':
    'A waitingForFile row occupies an already committed index. Run the approved stale-changeset recovery path; do not delete rows manually.',
  'missing-baseline':
    'No baseline object is mapped for an iModel that has changesets. Restore the baseline from backup or repair through the approved baseline generator path.',
  'missing-baseline-blob':
    'The baseline blob is missing from storage. Restore the object store from the same backup set; do not regenerate a baseline in place.',
  'missing-checkpoint-blob':
    'The checkpoint blob is missing from storage. Do not use the checkpoint as a version; restore both DB and object store from the same verified backup set.',
  'unsupported-checksum':
    'The declared checksum is neither 40-hex SHA-1 nor 64-hex SHA-256. Record and verify it through an approved integrity adapter; do not treat the content as verified.',
  'dangling-baseline-row':
    'A baseline row references an iModel that is not present in the scanned metadata. Restore the metadata or narrow the scan scope.',
  'checkpoint-target-missing':
    'A checkpoint references a changeset that is not present. Restore the ledger/checkpoint metadata from the same backup set.',
  'checkpoint-target-not-uploaded':
    'A successful checkpoint targets a changeset that is not committed. Do not expose it as a version; restore/investigate through the approved checkpoint recovery path.',
  'invalid-checkpoint':
    'A successful checkpoint lacks a positive size or required identity/hash. Do not use it as a version; regenerate through the approved worker path after restoring data.',
  'duplicate-successful-checkpoint':
    'More than one successful checkpoint claims the same iModel/index. Investigate the checkpoint control plane; retain the verified row only through an approved migration.',
  'dangling-named-version':
    'A Named Version references a missing changeset. Restore the ledger from backup; do not silently retarget the version.',
  'orphan-blob':
    'A blob under the configured managed prefix has no DB reference. Quarantine/delete only after an approved reconciliation; the scan itself is read-only.',
  'dangling-imodel-row':
    'Rows reference an iModel absent from the scanned metadata. Restore metadata or narrow the scan scope; do not delete rows to make the scan green.',
  'changeset-without-blob-reference':
    'A committed changeset row has no mapped blob path. Extend the adapter mapping/configuration; the scan cannot verify content without it.',
  'unknown-changeset-state':
    'A changeset state is not recognized by this tool. Validate the Hub schema version before trusting any clean result.',
  'checkpoint-scheduled':
    'A checkpoint is still scheduled. Do not treat it as an available version; verify the checkpoint job/worker state.',
  'checkpoint-failed':
    'A checkpoint is failed. Do not treat it as an available version; follow the approved checkpoint recovery path.',
  'named-version-checkpoint-missing':
    'A Named Version has no successful checkpoint. It is a metadata-only version until a real checkpoint is generated and verified.',
  'named-version-checkpoint-not-ready':
    'A Named Version points at a checkpoint that is not successful. Do not present its checkpoint as ready.',
  'imodel-changeset-count-mismatch':
    'The iModel changesetCount disagrees with the scanned ledger. Treat as metadata drift and investigate before relying on history counts.',
  'legacy-chain':
    'One or more committed changesets have no chainHash. The stored chain root is unavailable; do not describe this chain as verified.',
  'orphan-scan-skipped':
    'Orphan detection was not performed. Pass one or more --orphan-prefix values (or managedPrefixes in the inventory) to enable it.',
});

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pickField(object, names) {
  if (!isPlainObject(object)) return undefined;
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(object, name)) {
      const value = object[name];
      if (value !== undefined) return value;
    }
  }
  const normalized = new Map();
  for (const [key, value] of Object.entries(object)) {
    normalized.set(key.replace(/[_\s-]/g, '').toLowerCase(), value);
  }
  for (const name of names) {
    const key = name.replace(/[_\s-]/g, '').toLowerCase();
    if (normalized.has(key)) return normalized.get(key);
  }
  return undefined;
}

function requireString(value, field, { nullable = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (nullable) return null;
    throw new IntegrityInputError(`${field} is required`);
  }
  if (typeof value !== 'string') {
    throw new IntegrityInputError(`${field} must be a string`);
  }
  return value;
}

function optionalString(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new IntegrityInputError(`${field} must be a string or null`);
  }
  return value;
}

function optionalInteger(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number)) {
    throw new IntegrityInputError(`${field} must be an integer`);
  }
  return number;
}

function requiredInteger(value, field) {
  const number = optionalInteger(value, field);
  if (number === null) throw new IntegrityInputError(`${field} is required`);
  return number;
}

function normalizeDigest(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return String(value).toLowerCase();
  const trimmed = value.trim().toLowerCase();
  return trimmed.replace(/^sha256:/, '').replace(/^sha1:/, '');
}

function normalizeArray(raw, field, allowUndefined = true) {
  if (raw === undefined || raw === null) {
    if (allowUndefined) return undefined;
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new IntegrityInputError(`${field} must be an array`);
  }
  return raw;
}

function normalizeChangeset(raw, position) {
  const prefix = `changesets[${position}]`;
  if (!isPlainObject(raw)) throw new IntegrityInputError(`${prefix} must be an object`);
  return {
    iModelId: requireString(
      pickField(raw, ['iModelId', 'imodelId', 'imodel_id', 'modelId']),
      `${prefix}.iModelId`,
    ),
    id: optionalString(pickField(raw, ['id', 'changesetId', 'changeset_id']), `${prefix}.id`),
    index: requiredInteger(
      pickField(raw, ['index', 'changesetIndex', 'changeset_index']),
      `${prefix}.index`,
    ),
    parentId: optionalString(pickField(raw, ['parentId', 'parent_id']), `${prefix}.parentId`),
    prevHash: normalizeDigest(pickField(raw, ['prevHash', 'prev_hash'])),
    chainHash: normalizeDigest(pickField(raw, ['chainHash', 'chain_hash'])),
    checksum: normalizeDigest(pickField(raw, ['checksum', 'sha256', 'contentSha256', 'content_sha256'])),
    fileSize: optionalInteger(pickField(raw, ['fileSize', 'file_size', 'size']), `${prefix}.fileSize`),
    blobPath: optionalString(
      pickField(raw, ['blobPath', 'blob_path', 'filePath', 'file_path', 'objectKey', 'object_key']),
      `${prefix}.blobPath`,
    ),
    state: optionalString(pickField(raw, ['state', 'status']), `${prefix}.state`),
    deletedAt: optionalString(pickField(raw, ['deletedAt', 'deleted_at']), `${prefix}.deletedAt`),
    deleted: pickField(raw, ['deleted']) === true,
    briefcaseId: optionalString(pickField(raw, ['briefcaseId', 'briefcase_id']), `${prefix}.briefcaseId`),
    createdAt: optionalString(pickField(raw, ['createdAt', 'created_at']), `${prefix}.createdAt`),
  };
}

function normalizeBaseline(raw, position) {
  const prefix = `baselines[${position}]`;
  if (!isPlainObject(raw)) throw new IntegrityInputError(`${prefix} must be an object`);
  return {
    iModelId: requireString(
      pickField(raw, ['iModelId', 'imodelId', 'imodel_id']),
      `${prefix}.iModelId`,
    ),
    name: optionalString(pickField(raw, ['name', 'fileName', 'file_name']), `${prefix}.name`),
    blobPath: optionalString(
      pickField(raw, ['blobPath', 'blob_path', 'filePath', 'file_path', 'objectKey', 'object_key']),
      `${prefix}.blobPath`,
    ),
    fileSize: optionalInteger(pickField(raw, ['fileSize', 'file_size', 'size']), `${prefix}.fileSize`),
    sha256: normalizeDigest(pickField(raw, ['sha256', 'checksum', 'contentSha256', 'content_sha256'])),
    state: optionalString(pickField(raw, ['state', 'status']), `${prefix}.state`),
    deletedAt: optionalString(pickField(raw, ['deletedAt', 'deleted_at']), `${prefix}.deletedAt`),
  };
}

function normalizeCheckpoint(raw, position) {
  const prefix = `checkpoints[${position}]`;
  if (!isPlainObject(raw)) throw new IntegrityInputError(`${prefix} must be an object`);
  return {
    id: optionalString(pickField(raw, ['id', 'checkpointId', 'checkpoint_id']), `${prefix}.id`),
    iModelId: requireString(
      pickField(raw, ['iModelId', 'imodelId', 'imodel_id']),
      `${prefix}.iModelId`,
    ),
    changesetId: optionalString(
      pickField(raw, ['changesetId', 'changeset_id']),
      `${prefix}.changesetId`,
    ),
    changesetIndex: optionalInteger(
      pickField(raw, ['changesetIndex', 'changeset_index', 'index']),
      `${prefix}.changesetIndex`,
    ),
    state: optionalString(pickField(raw, ['state', 'status']), `${prefix}.state`),
    fileSize: optionalInteger(pickField(raw, ['fileSize', 'file_size', 'size']), `${prefix}.fileSize`),
    contentSha256: normalizeDigest(
      pickField(raw, ['contentSha256', 'content_sha256', 'sha256', 'checksum']),
    ),
    dbName: optionalString(pickField(raw, ['dbName', 'db_name']), `${prefix}.dbName`),
    manifestPath: optionalString(
      pickField(raw, ['manifestPath', 'manifest_path']),
      `${prefix}.manifestPath`,
    ),
    blobPath: optionalString(
      pickField(raw, ['blobPath', 'blob_path', 'objectKey', 'object_key']),
      `${prefix}.blobPath`,
    ),
    deletedAt: optionalString(pickField(raw, ['deletedAt', 'deleted_at']), `${prefix}.deletedAt`),
  };
}

function normalizeNamedVersion(raw, position) {
  const prefix = `namedVersions[${position}]`;
  if (!isPlainObject(raw)) throw new IntegrityInputError(`${prefix} must be an object`);
  return {
    id: optionalString(pickField(raw, ['id', 'namedVersionId', 'named_version_id']), `${prefix}.id`),
    name: optionalString(pickField(raw, ['name']), `${prefix}.name`),
    iModelId: requireString(
      pickField(raw, ['iModelId', 'imodelId', 'imodel_id']),
      `${prefix}.iModelId`,
    ),
    changesetId: optionalString(
      pickField(raw, ['changesetId', 'changeset_id']),
      `${prefix}.changesetId`,
    ),
    changesetIndex: optionalInteger(
      pickField(raw, ['changesetIndex', 'changeset_index']),
      `${prefix}.changesetIndex`,
    ),
    state: optionalString(pickField(raw, ['state', 'status']), `${prefix}.state`),
    deletedAt: optionalString(pickField(raw, ['deletedAt', 'deleted_at']), `${prefix}.deletedAt`),
  };
}

function normalizeIModel(raw, position) {
  const prefix = `imodels[${position}]`;
  if (!isPlainObject(raw)) throw new IntegrityInputError(`${prefix} must be an object`);
  const baselineRaw = pickField(raw, ['baseline']);
  const iModelId = requireString(
    pickField(raw, ['id', 'iModelId', 'imodelId', 'imodel_id']),
    `${prefix}.id`,
  );
  const baseline =
    baselineRaw !== undefined && baselineRaw !== null
      ? normalizeBaseline({ iModelId, ...(isPlainObject(baselineRaw) ? baselineRaw : {}) }, position)
      : null;
  return {
    id: iModelId,
    name: optionalString(pickField(raw, ['name']), `${prefix}.name`),
    state: optionalString(pickField(raw, ['state', 'status']), `${prefix}.state`),
    changesetCount: optionalInteger(
      pickField(raw, ['changesetCount', 'changeset_count', 'changesetsCount']),
      `${prefix}.changesetCount`,
    ),
    deletedAt: optionalString(pickField(raw, ['deletedAt', 'deleted_at']), `${prefix}.deletedAt`),
    baseline,
  };
}

export function normalizeSnapshot(raw) {
  if (!isPlainObject(raw)) throw new IntegrityInputError('snapshot must be a JSON object');
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== SCHEMA_VERSION) {
    throw new IntegrityInputError(
      `unsupported snapshot schemaVersion ${raw.schemaVersion}; expected ${SCHEMA_VERSION}`,
    );
  }

  if (raw.changesets === undefined) {
    throw new IntegrityInputError('snapshot.changesets is required; use [] for an empty ledger');
  }
  const changesetsRaw = normalizeArray(raw.changesets, 'changesets', false);
  const changesets = changesetsRaw.map(normalizeChangeset);
  const baselinesRaw = normalizeArray(raw.baselines, 'baselines');
  const checkpointsRaw = normalizeArray(raw.checkpoints, 'checkpoints');
  const namedVersionsRaw = normalizeArray(raw.namedVersions, 'namedVersions');
  const imodelsRaw = normalizeArray(raw.imodels, 'imodels');

  const imodels = imodelsRaw?.map(normalizeIModel);
  const baselines = baselinesRaw?.map(normalizeBaseline);

  // Inline iModel baselines are merged into the baseline collection. Explicit
  // baselines win when both are present.
  const baselineByIModel = new Map();
  for (const baseline of baselines ?? []) baselineByIModel.set(baseline.iModelId, baseline);
  for (const iModel of imodels ?? []) {
    if (iModel.baseline && !baselineByIModel.has(iModel.id)) {
      baselineByIModel.set(iModel.id, iModel.baseline);
    }
  }
  const hasInlineBaselines = [...baselineByIModel.values()].length > 0;
  const baselineCollection =
    baselines === undefined && !hasInlineBaselines ? undefined : [...baselineByIModel.values()];
  const baselinesKnown =
    raw.baselinesKnown !== false && (raw.baselines !== undefined || hasInlineBaselines);

  return {
    schemaVersion: SCHEMA_VERSION,
    source: isPlainObject(raw.source) ? raw.source : {},
    changesets,
    baselines: baselineCollection,
    baselinesKnown,
    checkpoints: checkpointsRaw?.map(normalizeCheckpoint),
    namedVersions: namedVersionsRaw?.map(normalizeNamedVersion),
    imodels,
    unmapped: normalizeArray(raw.unmapped, 'unmapped') ?? [],
  };
}

export function normalizeInventory(raw) {
  if (!isPlainObject(raw)) throw new IntegrityInputError('blob inventory must be a JSON object');
  let blobsRaw;
  if (Array.isArray(raw)) {
    blobsRaw = raw;
  } else {
    if (raw.schemaVersion !== undefined && raw.schemaVersion !== SCHEMA_VERSION) {
      throw new IntegrityInputError(
        `unsupported inventory schemaVersion ${raw.schemaVersion}; expected ${SCHEMA_VERSION}`,
      );
    }
    if (raw.blobs === undefined) {
      throw new IntegrityInputError('inventory.blobs is required; use [] for an explicitly empty object store');
    }
    blobsRaw = normalizeArray(raw.blobs, 'blobs', false);
  }

  const seen = new Set();
  const blobs = blobsRaw.map((rawBlob, position) => {
    if (!isPlainObject(rawBlob)) {
      throw new IntegrityInputError(`blobs[${position}] must be an object`);
    }
    const name = requireString(pickField(rawBlob, ['name', 'blobName', 'blob_name', 'key', 'path']), `blobs[${position}].name`);
    if (seen.has(name)) throw new IntegrityInputError(`duplicate blob name in inventory: ${name}`);
    seen.add(name);
    const size = optionalInteger(pickField(rawBlob, ['size', 'bytes', 'contentLength', 'content_length']), `blobs[${position}].size`);
    if (size === null || size < 0) throw new IntegrityInputError(`blobs[${position}].size is required`);
    return {
      name,
      size,
      sha256: normalizeDigest(pickField(rawBlob, ['sha256', 'contentSha256', 'content_sha256'])),
      sha1: normalizeDigest(pickField(rawBlob, ['sha1', 'contentSha1', 'content_sha1'])),
      md5: optionalString(pickField(rawBlob, ['md5', 'contentMd5', 'content_md5']), `blobs[${position}].md5`),
      lastModified: optionalString(
        pickField(rawBlob, ['lastModified', 'last_modified']),
        `blobs[${position}].lastModified`,
      ),
    };
  });

  const managedPrefixes = normalizeArray(
    raw && !Array.isArray(raw) ? raw.managedPrefixes : undefined,
    'managedPrefixes',
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    source: raw && !Array.isArray(raw) && isPlainObject(raw.source) ? raw.source : {},
    complete: raw && !Array.isArray(raw) ? raw.complete !== false : true,
    hashMode: raw && !Array.isArray(raw) ? optionalString(raw.hashMode, 'hashMode') : null,
    managedPrefixes: (managedPrefixes ?? []).filter((value) => typeof value === 'string' && value.length > 0),
    blobs,
  };
}

export function collectReferencedBlobPaths(snapshot) {
  const paths = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.trim() !== '') paths.add(value.trim());
  };
  for (const changeset of snapshot.changesets) add(changeset.blobPath);
  for (const baseline of snapshot.baselines ?? []) {
    add(baseline.blobPath);
    add(baseline.name);
  }
  for (const checkpoint of snapshot.checkpoints ?? []) {
    add(checkpoint.blobPath);
    add(checkpoint.dbName);
    add(checkpoint.manifestPath);
  }
  return paths;
}

export function computeChainRoot(committedRows) {
  const rows = [...committedRows]
    .filter((row) => row.index >= 1)
    .sort((left, right) => left.index - right.index);
  if (rows.length === 0) return { root: null, legacy: false, complete: true };
  for (const row of rows) {
    if (!row.chainHash) return { root: null, legacy: true, complete: false };
  }
  let canonical = '';
  for (const row of rows) {
    canonical += `${row.index}|${row.id ?? ''}|${row.chainHash}\n`;
  }
  return { root: sha256Hex(`${canonical}\n`), legacy: false, complete: true };
}

function stateOf(row) {
  return typeof row.state === 'string' ? row.state.toLowerCase() : null;
}

function isCommitted(row) {
  return stateOf(row) === COMMITTED && !row.deletedAt && !row.deleted;
}

function isPending(row) {
  return stateOf(row) === PENDING && !row.deletedAt && !row.deleted;
}

function isActive(row) {
  return !row.deletedAt && !row.deleted;
}

function finding(report, code, severity, fields = {}) {
  report.findings.push({
    code,
    severity,
    remediation: REMEDIATIONS[code] ?? null,
    ...fields,
  });
}

function unverified(report, code, fields = {}) {
  report.unverified.push({ code, ...fields });
}

function normalizeState(value) {
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function gapRanges(indices, expectedMax) {
  const present = new Set(indices);
  const ranges = [];
  let start = null;
  for (let index = 1; index <= expectedMax; index += 1) {
    if (!present.has(index)) {
      if (start === null) start = index;
    } else if (start !== null) {
      ranges.push([start, index - 1]);
      start = null;
    }
  }
  if (start !== null) ranges.push([start, expectedMax]);
  return ranges;
}

function checkBlobReference(report, blobByName, inventory, { blobPath, declaredSize, declaredSha256, declaredSha1, expectedSha, rowKind, iModelId, changesetId, changesetIndex, checkpointId }) {
  const reference = {
    rowKind,
    iModelId,
    changesetId: changesetId ?? null,
    changesetIndex: changesetIndex ?? null,
    checkpointId: checkpointId ?? null,
    blobPath,
  };

  if (!blobPath) {
    unverified(report, `${rowKind}-blob-unmapped`, {
      ...reference,
      detail: `${rowKind} row has no blob path mapped by the adapter`,
    });
    return { blob: null, referenced: false };
  }

  const blob = blobByName.get(blobPath);
  if (!blob) {
    if (inventory.complete === false) {
      unverified(report, 'blob-listing-incomplete', {
        ...reference,
        detail: 'Blob inventory is marked incomplete; absence cannot be treated as a missing object',
      });
    } else {
      finding(report, `missing-${rowKind}-blob`, 'error', {
        ...reference,
        detail: `${rowKind} references a blob that is not present in the object-store inventory`,
      });
    }
    return { blob: null, referenced: true };
  }

  if (typeof declaredSize === 'number' && declaredSize >= 0 && blob.size !== declaredSize) {
    finding(report, 'blob-size-mismatch', 'error', {
      ...reference,
      expected: declaredSize,
      actual: blob.size,
      detail: `${rowKind} declares ${declaredSize} bytes but storage reports ${blob.size}`,
    });
  }

  if (expectedSha && !SHA256_RE.test(expectedSha) && !SHA1_RE.test(expectedSha)) {
    finding(report, 'unsupported-checksum', 'warning', {
      ...reference,
      expected: expectedSha,
      detail: 'Declared checksum is neither 40-hex SHA-1 nor 64-hex SHA-256',
    });
    unverified(report, 'checksum-not-verifiable', {
      ...reference,
      expected: expectedSha,
      detail: 'Declared checksum format is not supported by this scan',
    });
  }

  const sha256 = declaredSha256 ?? (typeof expectedSha === 'string' && SHA256_RE.test(expectedSha) ? expectedSha : null);
  if (sha256) {
    if (!SHA256_RE.test(sha256)) {
      finding(report, 'unsupported-checksum', 'warning', {
        ...reference,
        expected: sha256,
        detail: 'Declared checksum is not a 64-hex SHA-256 value',
      });
    } else if (!blob.sha256) {
      unverified(report, 'sha256-not-collected', {
        ...reference,
        detail: 'Declared SHA-256 was not verifiable because the blob inventory contains no SHA-256',
      });
    } else if (blob.sha256 !== sha256) {
      finding(report, 'blob-sha256-mismatch', 'error', {
        ...reference,
        expected: sha256,
        actual: blob.sha256,
        detail: `${rowKind} declared SHA-256 does not match storage bytes`,
      });
    }
  }

  const sha1 = declaredSha1 ?? (typeof expectedSha === 'string' && SHA1_RE.test(expectedSha) ? expectedSha : null);
  if (sha1) {
    if (!blob.sha1) {
      unverified(report, 'sha1-not-collected', {
        ...reference,
        detail: 'Declared SHA-1 was not verifiable because the blob inventory contains no SHA-1',
      });
    } else if (blob.sha1 !== sha1) {
      finding(report, 'blob-sha1-mismatch', 'error', {
        ...reference,
        expected: sha1,
        actual: blob.sha1,
        detail: `${rowKind} declared SHA-1 does not match storage bytes`,
      });
    }
  }

  return { blob, referenced: true };
}

/**
 * @param {ReturnType<typeof normalizeSnapshot>} snapshot
 * @param {ReturnType<typeof normalizeInventory>} inventory
 * @param {{
 *   generatedAt?: string,
 *   mode?: string,
 *   source?: object,
 *   orphanPrefixes?: string[],
 *   failOnWarnings?: boolean,
 *   target?: object
 * }} [options]
 */
export function scanIntegrity(snapshot, inventory, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const report = {
    schemaVersion: SCHEMA_VERSION,
    kind: REPORT_KIND,
    tool: 'scripts/integrity/Invoke-IntegrityScan.mjs',
    generatedAtUtc: generatedAt,
    readOnly: true,
    mode: options.mode ?? 'snapshot',
    source: options.source ?? snapshot.source,
    target: options.target ?? {},
    options: {
      orphanPrefixes: options.orphanPrefixes ?? [],
      failOnWarnings: options.failOnWarnings === true,
    },
    summary: {
      imodels: 0,
      changesets: 0,
      committedChangesets: 0,
      pendingChangesets: 0,
      deletedChangesets: 0,
      baselines: 0,
      checkpoints: 0,
      namedVersions: 0,
      blobs: inventory.blobs.length,
      errors: 0,
      warnings: 0,
      infos: 0,
      unverified: 0,
    },
    chains: [],
    findings: [],
    unverified: [],
    limitations: [...LIMITATIONS],
  };

  const blobByName = new Map(inventory.blobs.map((blob) => [blob.name, blob]));
  const activeIModels = (snapshot.imodels ?? []).filter((iModel) => !iModel.deletedAt);
  const imodelById = new Map(activeIModels.map((iModel) => [iModel.id, iModel]));
  const activeChangesets = snapshot.changesets.filter(isActive);
  const committedByIModel = new Map();
  const allRowsByIModel = new Map();
  const rowsById = new Map();

  report.summary.changesets = snapshot.changesets.length;
  report.summary.deletedChangesets = snapshot.changesets.length - activeChangesets.length;
  report.summary.baselines = snapshot.baselines?.length ?? 0;
  report.summary.checkpoints = snapshot.checkpoints?.length ?? 0;
  report.summary.namedVersions = snapshot.namedVersions?.length ?? 0;
  report.summary.imodels = snapshot.imodels?.length ?? 0;

  // Collection completeness. Missing collections make a clean result impossible.
  if (snapshot.baselines === undefined) {
    unverified(report, 'baseline-inventory-unavailable', {
      detail: 'Snapshot has no baselines collection; baseline objects were not checked',
    });
  }
  if (snapshot.checkpoints === undefined) {
    unverified(report, 'checkpoint-inventory-unavailable', {
      detail: 'Snapshot has no checkpoints collection; checkpoints were not checked',
    });
  }
  if (snapshot.namedVersions === undefined) {
    unverified(report, 'named-version-inventory-unavailable', {
      detail: 'Snapshot has no namedVersions collection; Named Versions were not checked',
    });
  }
  if (snapshot.imodels === undefined) {
    unverified(report, 'imodel-inventory-unavailable', {
      detail: 'Snapshot has no imodels collection; changesetCount/baseline ownership was not checked',
    });
  }
  for (const warning of snapshot.unmapped ?? []) {
    unverified(report, 'adapter-mapping-incomplete', {
      detail: typeof warning === 'string' ? warning : warning?.detail ?? 'adapter reported an unmapped field',
      area: typeof warning === 'object' && warning !== null ? warning.area ?? null : null,
    });
  }
  if (inventory.complete === false) {
    unverified(report, 'blob-inventory-incomplete', {
      detail: 'Blob inventory is explicitly marked incomplete',
    });
  }

  for (const row of activeChangesets) {
    if (row.deletedAt || row.deleted) continue;
    if (!allRowsByIModel.has(row.iModelId)) allRowsByIModel.set(row.iModelId, []);
    allRowsByIModel.get(row.iModelId).push(row);
    if (row.id) rowsById.set(row.id, row);
  }

  // Dangling iModel references.
  if (snapshot.imodels !== undefined) {
    const iModelIds = new Set();
    for (const row of activeChangesets) iModelIds.add(row.iModelId);
    for (const baseline of snapshot.baselines ?? []) iModelIds.add(baseline.iModelId);
    for (const checkpoint of snapshot.checkpoints ?? []) iModelIds.add(checkpoint.iModelId);
    for (const version of snapshot.namedVersions ?? []) iModelIds.add(version.iModelId);
    for (const iModelId of iModelIds) {
      if (!imodelById.has(iModelId)) {
        finding(report, 'dangling-imodel-row', 'error', {
          iModelId,
          detail: 'Scanned rows reference an iModel absent from the imodels collection',
        });
      }
    }
  }

  // Changeset ledger checks.
  for (const [iModelId, rows] of allRowsByIModel) {
    const indexCounts = new Map();
    for (const row of rows) indexCounts.set(row.index, (indexCounts.get(row.index) ?? 0) + 1);
    for (const [index, count] of indexCounts) {
      if (count > 1) {
        finding(report, 'duplicate-changeset-index', 'error', {
          iModelId,
          changesetIndex: index,
          detail: `${count} active changeset rows claim index ${index}`,
        });
      }
    }

    const committed = rows.filter(isCommitted).sort((left, right) => left.index - right.index);
    const pending = rows.filter(isPending).sort((left, right) => left.index - right.index);
    committedByIModel.set(iModelId, committed);
    report.summary.committedChangesets += committed.length;
    report.summary.pendingChangesets += pending.length;

    for (const row of committed) {
      if (row.index === 0) continue;
      if (!row.id) {
        finding(report, 'missing-parent', 'error', {
          iModelId,
          changesetIndex: row.index,
          detail: 'Committed changeset row has no id',
        });
      }
      const expectedParentIndex = row.index - 1;
      const parentByIndex = committed.find((candidate) => candidate.index === expectedParentIndex) ?? null;
      let parent = null;
      if (row.parentId) {
        parent = rowsById.get(row.parentId) ?? null;
        if (!parent || parent.iModelId !== iModelId || !isCommitted(parent)) {
          finding(report, 'dangling-parent', 'error', {
            iModelId,
            changesetId: row.id,
            changesetIndex: row.index,
            parentId: row.parentId,
            detail: `parentId ${row.parentId} does not resolve to a committed changeset in this iModel`,
          });
          parent = null;
        } else if (parent.index !== expectedParentIndex) {
          finding(report, 'parent-index-mismatch', 'error', {
            iModelId,
            changesetId: row.id,
            changesetIndex: row.index,
            parentId: row.parentId,
            expected: expectedParentIndex,
            actual: parent.index,
            detail: 'Parent changeset has the wrong index',
          });
        }
      } else if (row.index > 1 && !parentByIndex) {
        // Index 1 may legitimately have no parentId (the baseline is its parent).
        finding(report, 'missing-parent', 'error', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'Committed changeset row has no parent link and no parent at index-1',
        });
      }
      if (!parent && row.index > 1) parent = parentByIndex;
      if (parent && row.prevHash && parent.chainHash && row.prevHash !== parent.chainHash) {
        finding(report, 'prev-hash-mismatch', 'error', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          expected: parent.chainHash,
          actual: row.prevHash,
          detail: 'prevHash does not match the parent chainHash',
        });
      }
      if (parent && !row.prevHash && parent.chainHash) {
        unverified(report, 'prev-hash-not-available', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'Changeset row has no prevHash; parent linkage cannot be cryptographically checked',
        });
      }
    }

    const headIndex = committed.length > 0 ? Math.max(...committed.map((row) => row.index)) : 0;
    if (headIndex > 0) {
      for (const [start, end] of gapRanges(committed.map((row) => row.index), headIndex)) {
        finding(report, 'missing-changeset', 'error', {
          iModelId,
          expectedRange: start === end ? String(start) : `${start}-${end}`,
          detail: `Committed changeset index range ${start}-${end} is missing`,
        });
      }
    }

    for (const row of pending) {
      if (row.index <= headIndex) {
        finding(report, 'pending-changeset-in-chain', 'error', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: `waitingForFile row occupies committed index ${row.index}`,
        });
      } else {
        finding(report, 'pending-changeset', 'warning', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'waitingForFile row is not part of the committed ledger; it must be completed or recovered through the approved path',
        });
      }
    }

    for (const row of rows) {
      if (stateOf(row) === null) {
        finding(report, 'unknown-changeset-state', 'warning', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'Changeset state is missing or null',
        });
      } else if (![COMMITTED, PENDING].includes(stateOf(row))) {
        finding(report, 'unknown-changeset-state', 'warning', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          state: row.state,
          detail: `Unrecognized changeset state ${row.state}`,
        });
      }
    }

    const { root, legacy, complete } = computeChainRoot(committed);
    const pendingIndices = pending.map((row) => row.index);
    report.chains.push({
      iModelId,
      headIndex: headIndex || null,
      headChangesetId: committed.length > 0 ? committed[committed.length - 1].id : null,
      committedCount: committed.length,
      chainRoot: root,
      chainRootComplete: complete,
      legacyChain: legacy,
      pendingIndexes: pendingIndices,
    });
    if (legacy) {
      finding(report, 'legacy-chain', 'warning', {
        iModelId,
        detail: 'At least one committed changeset has no chainHash; chain root cannot be computed',
      });
      unverified(report, 'legacy-chain-root-unavailable', {
        iModelId,
        detail: 'Legacy rows have null chainHash; the chain root is unavailable and the chain is not verified',
      });
    }

    const iModel = imodelById.get(iModelId);
    if (iModel && typeof iModel.changesetCount === 'number' && iModel.changesetCount !== committed.length) {
      finding(report, 'imodel-changeset-count-mismatch', 'warning', {
        iModelId,
        expected: iModel.changesetCount,
        actual: committed.length,
        detail: 'iModel changesetCount disagrees with scanned committed ledger rows',
      });
    }

    for (const row of rows) {
      if (!isCommitted(row)) continue;
      if (!row.blobPath) {
        finding(report, 'changeset-without-blob-reference', 'warning', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'Committed changeset has no blobPath; content cannot be checked',
        });
        unverified(report, 'changeset-blob-unmapped', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'Committed changeset has no blobPath mapped by the adapter',
        });
        continue;
      }
      if (row.fileSize === null) {
        unverified(report, 'changeset-size-not-declared', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'Committed changeset declares no fileSize; storage size cannot be checked',
        });
      }
      if (!row.checksum) {
        unverified(report, 'changeset-checksum-not-declared', {
          iModelId,
          changesetId: row.id,
          changesetIndex: row.index,
          detail: 'Committed changeset declares no checksum; content bytes cannot be checked',
        });
      }
      checkBlobReference(report, blobByName, inventory, {
        blobPath: row.blobPath,
        declaredSize: row.fileSize,
        expectedSha: row.checksum,
        rowKind: 'changeset',
        iModelId,
        changesetId: row.id,
        changesetIndex: row.index,
      });
    }
  }

  // iModels with no changesets still need chains recorded.
  for (const iModel of activeIModels) {
    if (!allRowsByIModel.has(iModel.id)) {
      report.chains.push({
        iModelId: iModel.id,
        headIndex: null,
        headChangesetId: null,
        committedCount: 0,
        chainRoot: null,
        chainRootComplete: true,
        legacyChain: false,
        pendingIndexes: [],
      });
    }
  }

  const successfulBaselineCheckpoint = new Set();
  for (const checkpoint of snapshot.checkpoints ?? []) {
    if (
      normalizeState(checkpoint.state) === 'successful' &&
      checkpoint.changesetIndex === 0 &&
      isActive(checkpoint)
    ) {
      successfulBaselineCheckpoint.add(checkpoint.iModelId);
    }
  }

  // Baseline checks.
  const baselineByIModel = new Map((snapshot.baselines ?? []).map((baseline) => [baseline.iModelId, baseline]));
  const iModelIdsForBaseline = snapshot.imodels !== undefined
    ? new Set([...activeIModels.map((iModel) => iModel.id), ...baselineByIModel.keys()])
    : new Set(baselineByIModel.keys());

  for (const iModelId of iModelIdsForBaseline) {
    const baseline = baselineByIModel.get(iModelId) ?? null;
    const hasChangesets = (allRowsByIModel.get(iModelId)?.length ?? 0) > 0;
    if (!baseline) {
      if (hasChangesets && !successfulBaselineCheckpoint.has(iModelId)) {
        if (snapshot.baselinesKnown === false) {
          unverified(report, 'baseline-not-mapped', {
            iModelId,
            detail: 'Baseline inventory is partial/unknown; absence is not treated as a missing baseline',
          });
        } else {
          finding(report, 'missing-baseline', 'error', {
            iModelId,
            detail: 'iModel has changesets but no baseline object/checkpoint is mapped',
          });
        }
      }
      continue;
    }
    if (baseline.deletedAt) continue;
    if (!baseline.blobPath) {
      unverified(report, 'baseline-blob-unmapped', {
        iModelId,
        detail: 'Baseline row has no blob path mapped by the adapter',
      });
      continue;
    }
    checkBlobReference(report, blobByName, inventory, {
      blobPath: baseline.blobPath,
      declaredSize: baseline.fileSize,
      declaredSha256: baseline.sha256,
      rowKind: 'baseline',
      iModelId,
    });
  }

  // Checkpoint checks.
  const successfulCheckpointKeys = new Map();
  if (snapshot.checkpoints !== undefined) {
    for (const checkpoint of snapshot.checkpoints) {
      if (!isActive(checkpoint)) continue;
      const state = normalizeState(checkpoint.state);
      let target = checkpoint.changesetId
        ? rowsById.get(checkpoint.changesetId) ?? null
        : null;
      if (target && target.iModelId !== checkpoint.iModelId) target = null;
      const targetByIndex =
        target ??
        (checkpoint.changesetIndex !== null
          ? (allRowsByIModel.get(checkpoint.iModelId) ?? []).find(
              (row) => row.index === checkpoint.changesetIndex && isCommitted(row),
            ) ?? null
          : null);

      if (state === 'successful') {
        const key = `${checkpoint.iModelId}|${checkpoint.changesetIndex ?? 'unknown'}`;
        const count = successfulCheckpointKeys.get(key) ?? 0;
        successfulCheckpointKeys.set(key, count + 1);
        if (count > 0) {
          finding(report, 'duplicate-successful-checkpoint', 'error', {
            iModelId: checkpoint.iModelId,
            checkpointId: checkpoint.id,
            changesetIndex: checkpoint.changesetIndex,
            detail: 'More than one successful checkpoint claims the same iModel/index',
          });
        }
        if (checkpoint.changesetIndex !== null && checkpoint.changesetIndex > 0) {
          if (!targetByIndex) {
            finding(report, 'checkpoint-target-missing', 'error', {
              iModelId: checkpoint.iModelId,
              checkpointId: checkpoint.id,
              changesetId: checkpoint.changesetId,
              changesetIndex: checkpoint.changesetIndex,
              detail: 'Successful checkpoint targets a changeset that is not present',
            });
          } else if (!isCommitted(targetByIndex)) {
            finding(report, 'checkpoint-target-not-uploaded', 'error', {
              iModelId: checkpoint.iModelId,
              checkpointId: checkpoint.id,
              changesetId: checkpoint.changesetId,
              changesetIndex: checkpoint.changesetIndex,
              detail: 'Successful checkpoint targets a changeset that is not committed',
            });
          }
        }
        if (checkpoint.fileSize !== null && checkpoint.fileSize <= 0) {
          finding(report, 'invalid-checkpoint', 'error', {
            iModelId: checkpoint.iModelId,
            checkpointId: checkpoint.id,
            changesetIndex: checkpoint.changesetIndex,
            detail: 'Successful checkpoint declares a non-positive fileSize',
          });
        } else if (checkpoint.fileSize === null && (checkpoint.changesetIndex ?? 0) > 0) {
          finding(report, 'invalid-checkpoint', 'error', {
            iModelId: checkpoint.iModelId,
            checkpointId: checkpoint.id,
            changesetIndex: checkpoint.changesetIndex,
            detail: 'Successful non-baseline checkpoint declares no fileSize',
          });
        }
        if (checkpoint.changesetIndex !== null && checkpoint.changesetIndex > 0 && !checkpoint.contentSha256) {
          finding(report, 'invalid-checkpoint', 'warning', {
            iModelId: checkpoint.iModelId,
            checkpointId: checkpoint.id,
            changesetIndex: checkpoint.changesetIndex,
            detail: 'Successful non-baseline checkpoint has no contentSha256',
          });
          unverified(report, 'checkpoint-content-hash-not-declared', {
            iModelId: checkpoint.iModelId,
            checkpointId: checkpoint.id,
            changesetIndex: checkpoint.changesetIndex,
            detail: 'Successful checkpoint lacks contentSha256; content bytes cannot be verified',
          });
        }
        const blobPath = checkpoint.blobPath ?? (checkpoint.dbName?.includes('/') ? checkpoint.dbName : null);
        if (!blobPath) {
          unverified(report, 'checkpoint-blob-unmapped', {
            iModelId: checkpoint.iModelId,
            checkpointId: checkpoint.id,
            changesetIndex: checkpoint.changesetIndex,
            detail: 'Successful checkpoint has no concrete blob path (CloudSqlite block container not mapped)',
          });
        } else {
          checkBlobReference(report, blobByName, inventory, {
            blobPath,
            declaredSize: checkpoint.fileSize,
            declaredSha256: checkpoint.contentSha256,
            rowKind: 'checkpoint',
            iModelId: checkpoint.iModelId,
            changesetId: checkpoint.changesetId,
            changesetIndex: checkpoint.changesetIndex,
            checkpointId: checkpoint.id,
          });
        }
      } else if (state === 'scheduled') {
        finding(report, 'checkpoint-scheduled', 'warning', {
          iModelId: checkpoint.iModelId,
          checkpointId: checkpoint.id,
          changesetIndex: checkpoint.changesetIndex,
          detail: 'Checkpoint is scheduled and not available',
        });
      } else if (state === 'failed') {
        finding(report, 'checkpoint-failed', 'warning', {
          iModelId: checkpoint.iModelId,
          checkpointId: checkpoint.id,
          changesetIndex: checkpoint.changesetIndex,
          detail: 'Checkpoint generation failed',
        });
      } else {
        finding(report, 'checkpoint-scheduled', 'warning', {
          iModelId: checkpoint.iModelId,
          checkpointId: checkpoint.id,
          changesetIndex: checkpoint.changesetIndex,
          state: checkpoint.state,
          detail: 'Checkpoint state is not successful',
        });
      }
    }
  }

  // Named Version checks.
  if (snapshot.namedVersions !== undefined) {
    for (const version of snapshot.namedVersions) {
      if (!isActive(version)) continue;
      let target = version.changesetId
        ? rowsById.get(version.changesetId) ?? null
        : null;
      if (target && target.iModelId !== version.iModelId) target = null;
      target =
        target ??
        (version.changesetIndex !== null
          ? (allRowsByIModel.get(version.iModelId) ?? []).find(
              (row) => row.index === version.changesetIndex && isCommitted(row),
            ) ?? null
          : null);
      if (!target) {
        finding(report, 'dangling-named-version', 'error', {
          iModelId: version.iModelId,
          namedVersionId: version.id,
          namedVersionName: version.name,
          changesetId: version.changesetId,
          changesetIndex: version.changesetIndex,
          detail: 'Named Version references a changeset that is not present',
        });
        continue;
      }
      const checkpoint = (snapshot.checkpoints ?? []).find(
        (candidate) =>
          isActive(candidate) &&
          candidate.iModelId === version.iModelId &&
          normalizeState(candidate.state) === 'successful' &&
          (candidate.changesetId === target.id ||
            (candidate.changesetIndex !== null && candidate.changesetIndex === target.index)),
      );
      if (!checkpoint) {
        const nonSuccessful = (snapshot.checkpoints ?? []).find(
          (candidate) =>
            isActive(candidate) &&
            candidate.iModelId === version.iModelId &&
            (candidate.changesetId === target.id ||
              (candidate.changesetIndex !== null && candidate.changesetIndex === target.index)),
        );
        if (nonSuccessful) {
          finding(report, 'named-version-checkpoint-not-ready', 'warning', {
            iModelId: version.iModelId,
            namedVersionId: version.id,
            changesetId: target.id,
            changesetIndex: target.index,
            state: nonSuccessful.state,
            detail: 'Named Version references a checkpoint that is not successful',
          });
        } else {
          finding(report, 'named-version-checkpoint-missing', 'warning', {
            iModelId: version.iModelId,
            namedVersionId: version.id,
            changesetId: target.id,
            changesetIndex: target.index,
            detail: 'Named Version has no successful checkpoint',
          });
        }
      }
    }
  }

  // Orphan blob detection.
  const prefixes = (options.orphanPrefixes?.length
    ? options.orphanPrefixes
    : inventory.managedPrefixes ?? []
  ).filter((prefix) => typeof prefix === 'string');
  if (prefixes.length === 0) {
    unverified(report, 'orphan-scan-skipped', {
      detail: 'Orphan detection was not configured; pass one or more --orphan-prefix values (or managedPrefixes in the inventory)',
    });
  } else {
    const referenced = collectReferencedBlobPaths(snapshot);
    const inScope = inventory.blobs.filter((blob) =>
      prefixes.some((prefix) => prefix === '*' || blob.name === prefix || blob.name.startsWith(prefix)),
    );
    for (const blob of inScope) {
      if (!referenced.has(blob.name)) {
        finding(report, 'orphan-blob', 'error', {
          blobPath: blob.name,
          size: blob.size,
          detail: 'Blob is under a managed prefix but has no DB reference',
        });
      }
    }
  }

  report.summary.errors = report.findings.filter((item) => item.severity === 'error').length;
  report.summary.warnings = report.findings.filter((item) => item.severity === 'warning').length;
  report.summary.infos = report.findings.filter((item) => item.severity === 'info').length;
  report.summary.unverified = report.unverified.length;
  report.complete = report.unverified.length === 0;

  if (report.summary.errors > 0) {
    report.exitCode = EXIT_CODES.FINDINGS;
    report.result = 'FINDINGS';
  } else if (report.unverified.length > 0) {
    report.exitCode = EXIT_CODES.INCOMPLETE;
    report.result = 'INCOMPLETE';
  } else if (report.summary.warnings > 0 && options.failOnWarnings === true) {
    report.exitCode = EXIT_CODES.FINDINGS;
    report.result = 'FINDINGS';
  } else {
    report.exitCode = EXIT_CODES.OK;
    report.result = 'CLEAN';
  }

  return report;
}

function mdEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push('# Hub integrity scan');
  lines.push('');
  lines.push(`- Result: **${report.result}** (exit ${report.exitCode})`);
  lines.push(`- Generated: ${report.generatedAtUtc}`);
  lines.push(`- Tool: \`${report.tool}\``);
  lines.push('- Read-only: yes');
  lines.push(`- Mode: ${report.mode}`);
  if (report.target?.label) lines.push(`- Target: ${mdEscape(report.target.label)}`);
  if (report.target?.database) lines.push(`- Database: ${mdEscape(report.target.database)}`);
  if (report.target?.objectStore) lines.push(`- Object store: ${mdEscape(report.target.objectStore)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(report.summary)) {
    lines.push(`| ${mdEscape(key)} | ${mdEscape(value)} |`);
  }
  lines.push('');
  lines.push('## Chains');
  lines.push('');
  lines.push('| iModel | Head index | Head changeset | Committed | Root complete | Legacy chain | Chain root | Pending indexes |');
  lines.push('|---|---:|---|---:|---|---|---|---|');
  for (const chain of report.chains) {
    lines.push(
      `| ${mdEscape(chain.iModelId)} | ${mdEscape(chain.headIndex ?? '')} | ${mdEscape(
        chain.headChangesetId ?? '',
      )} | ${chain.committedCount} | ${chain.chainRootComplete ? 'yes' : 'no'} | ${
        chain.legacyChain ? 'yes' : 'no'
      } | ${mdEscape(chain.chainRoot ?? '')} | ${mdEscape(chain.pendingIndexes.join(','))} |`,
    );
  }
  if (report.chains.length === 0) lines.push('| (none) | | | | | | | |');
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No findings.');
  } else {
    lines.push('| Severity | Code | iModel | Changeset / checkpoint | Blob | Detail |');
    lines.push('|---|---|---|---|---|---|');
    for (const item of report.findings) {
      const subject =
        item.changesetId ?? item.checkpointId ?? item.namedVersionId ?? item.changesetIndex ?? '';
      lines.push(
        `| ${mdEscape(item.severity)} | ${mdEscape(item.code)} | ${mdEscape(item.iModelId ?? '')} | ${mdEscape(
          subject,
        )} | ${mdEscape(item.blobPath ?? '')} | ${mdEscape(item.detail ?? '')} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Unverified (scan incomplete)');
  lines.push('');
  if (report.unverified.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Code | iModel | Subject | Detail |');
    lines.push('|---|---|---|---|');
    for (const item of report.unverified) {
      const subject =
        item.changesetId ?? item.checkpointId ?? item.blobPath ?? item.changesetIndex ?? '';
      lines.push(
        `| ${mdEscape(item.code)} | ${mdEscape(item.iModelId ?? '')} | ${mdEscape(subject)} | ${mdEscape(
          item.detail ?? '',
        )} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Interpretations and limitations');
  lines.push('');
  lines.push('Exit codes: `0` clean, `1` integrity findings, `2` usage/config error, `3` no errors found but scan incomplete.');
  lines.push('');
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
