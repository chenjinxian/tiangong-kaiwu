/**
 * G1 B3.1a BFF coverage manifest test (classification only).
 *
 * Pins the BFF face reality: `/api/*` terminates JWT and proxies verbatim, so
 * the MS progress/retry gaps pass through; HUB prefixes are a verbatim
 * passthrough owned by Hub guards. No runtime authorization is asserted here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUB_PREFIXES } from '../src/app.js';
import {
  BFF_PEP_COVERAGE,
  BFF_PEP_COVERAGE_VERSION,
  BFF_PEP_STATUSES,
  validateBffPepCoverage,
} from '../src/pepCoverage.js';

const appSource = readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');

function entry(name: string) {
  const found = BFF_PEP_COVERAGE.find((candidate) => candidate.entry === name);
  if (!found) throw new Error(`missing BFF coverage entry: ${name}`);
  return found;
}

describe('B3.1a/B3.1f-a BFF PEP coverage manifest', () => {
  it('is version 2, validated and uses the closed status set', () => {
    expect(BFF_PEP_COVERAGE_VERSION).toBe(2);
    expect(validateBffPepCoverage()).toEqual([]);
    for (const coverage of BFF_PEP_COVERAGE) {
      expect(BFF_PEP_STATUSES).toContain(coverage.status);
    }
    const names = BFF_PEP_COVERAGE.map((coverage) => coverage.entry);
    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
  });

  it('registers the /api progress and retry pass-through explicitly', () => {
    for (const name of ['bff.api', 'bff.api.progress', 'bff.api.retry']) {
      const coverage = entry(name);
      expect(coverage.status).toBe('registered-exception');
      expect(coverage.exception?.id).toMatch(/^X-\d{2}$/);
      expect(coverage.exception?.owner.trim().length).toBeGreaterThan(0);
      expect(coverage.exception?.expires).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(entry('bff.api.progress').face).toBe('/api/imodels/:id/progress');
    expect(entry('bff.api.progress').methods).toEqual(['GET']);
    expect(entry('bff.api.retry').face).toBe('/api/imodels/:id/retry');
    expect(entry('bff.api.retry').methods).toEqual(['POST']);
  });

  it('keeps /api as a generic JWT-terminated proxy (no per-route branch)', () => {
    const apiMiddleware = appSource.match(/app\.use\('\/api'/g) ?? [];
    expect(apiMiddleware.length).toBe(2); // JWT termination + proxy handler
    expect(appSource).not.toContain('/api/imodels');
    expect(appSource).not.toContain('progress');
    expect(appSource).not.toContain('retry');
  });

  it('records the HUB nine-prefix passthrough as not covered by BFF PEP', () => {
    expect(HUB_PREFIXES).toHaveLength(9);
    const passthrough = entry('bff.hub-passthrough');
    expect(passthrough.status).toBe('p0-not-covered');
    for (const prefix of HUB_PREFIXES) {
      expect(passthrough.face).toContain(prefix);
    }
    expect(appSource).toContain("app.use(prefix, hubProxy)");
  });

  it('lists the public health face with a reason', () => {
    const health = entry('bff.health');
    expect(health.face).toBe('/health');
    expect(health.status).toBe('registered-exception');
    expect(health.note).toContain('public');
    expect(appSource).toContain("app.get('/health'");
  });
});
