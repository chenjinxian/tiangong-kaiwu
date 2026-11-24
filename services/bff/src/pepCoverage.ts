/**
 * G1 B3.1a BFF PEP coverage manifest (coverage only; no behavior change).
 *
 * The BFF terminates JWT for `/api/*` and proxies the request verbatim to
 * modeling-server. It has no per-route authorization and therefore passes MS
 * gaps (notably `GET /api/imodels/:id/progress` and
 * `POST /api/imodels/:id/retry`) through unchanged. The HUB nine-prefix
 * passthrough performs no termination at all: Hub owns those route guards.
 *
 * This manifest is a static classification used by `test/pepCoverage.test.ts`.
 * `registered-exception` entries reference X-27 in
 * `docs/architecture/EXCEPTIONS.md`.
 */

export const BFF_PEP_COVERAGE_VERSION = 1;

export const BFF_PEP_STATUSES = [
  'covered-shadow',
  'covered-enforce',
  'fail-closed',
  'registered-exception',
  'p0-not-covered',
] as const;

export type BffPepStatus = (typeof BFF_PEP_STATUSES)[number];

export interface BffPepException {
  /** EXCEPTIONS.md id. */
  readonly id: string;
  readonly owner: string;
  /** ISO date (YYYY-MM-DD). */
  readonly expires: string;
}

export interface BffPepEntry {
  /** Stable manifest id; unique across the manifest. */
  readonly entry: string;
  /** BFF face, or the upstream route for a documented pass-through. */
  readonly face: string;
  /** HTTP methods served/forwarded. `ALL` means the generic prefix proxy. */
  readonly methods: readonly string[];
  readonly status: BffPepStatus;
  readonly exception?: BffPepException;
  readonly note: string;
}

const X27: BffPepException = {
  id: 'X-27',
  owner: '平台/安全',
  expires: '2027-03-31',
};

export const BFF_PEP_COVERAGE: readonly BffPepEntry[] = [
  {
    entry: 'bff.api',
    face: '/api/*',
    methods: ['ALL'],
    status: 'registered-exception',
    exception: X27,
    note: 'JWT termination only, then verbatim proxy to MS; no per-route PEP',
  },
  {
    entry: 'bff.api.progress',
    face: '/api/imodels/:id/progress',
    methods: ['GET'],
    status: 'registered-exception',
    exception: X27,
    note: 'pass-through of the MS progress route; MS authenticates but does not authorize',
  },
  {
    entry: 'bff.api.retry',
    face: '/api/imodels/:id/retry',
    methods: ['POST'],
    status: 'registered-exception',
    exception: X27,
    note: 'pass-through of the MS retry route; MS forwards with service credentials',
  },
  {
    entry: 'bff.health',
    face: '/health',
    methods: ['GET'],
    status: 'registered-exception',
    exception: X27,
    note: 'intentionally public liveness/readiness; returns no document data',
  },
  {
    entry: 'bff.hub-passthrough',
    face: '/itwins,/imodels,/auth,/accesscontrol,/webhooks,/users,/files,/oauth,/.well-known',
    methods: ['ALL'],
    status: 'p0-not-covered',
    note: 'verbatim Hub proxy without termination; Hub route metadata/guards own authorization',
  },
];

function isIsoDate(value: unknown): value is string {
  return (
    'string' === typeof value
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value))
  );
}

/** Pure validation: unique ids, closed statuses, complete exception metadata. */
export function validateBffPepCoverage(
  manifest: readonly BffPepEntry[] = BFF_PEP_COVERAGE,
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  manifest.forEach((entry, index) => {
    const label = entry.entry?.trim() || `#${index}`;
    if (!entry.entry?.trim()) issues.push(`entry ${index}: missing entry name`);
    else if (seen.has(entry.entry)) issues.push(`duplicate entry name: ${entry.entry}`);
    else seen.add(entry.entry);

    if (!BFF_PEP_STATUSES.includes(entry.status)) {
      issues.push(`${label}: unknown status ${String(entry.status)}`);
    }
    if (!entry.face?.trim()) issues.push(`${label}: face is required`);
    if (!Array.isArray(entry.methods) || entry.methods.length === 0) {
      issues.push(`${label}: at least one method is required`);
    }
    if (!entry.note?.trim()) issues.push(`${label}: note is required`);

    if ('registered-exception' === entry.status) {
      if (!entry.exception) {
        issues.push(`${label}: registered-exception requires id/owner/expiry`);
      } else {
        if (!entry.exception.id?.trim()) issues.push(`${label}: exception id is required`);
        if (!entry.exception.owner?.trim()) issues.push(`${label}: exception owner is required`);
        if (!isIsoDate(entry.exception.expires)) {
          issues.push(`${label}: exception expiry must be an ISO date (YYYY-MM-DD)`);
        }
      }
    } else if (entry.exception) {
      issues.push(`${label}: exception metadata is only allowed for registered-exception`);
    }
  });

  return issues;
}
