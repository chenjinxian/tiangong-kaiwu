/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Pinning test for repo-root scripts/generate-env.ps1 (RW2-T1): the $envMap
 * template must own BFF_UPSTREAM with the same default as the nginx service in
 * root docker-compose.yml (BFF v1 缺省直达宿主 MS). Text-level assertions —
 * this repo has no PowerShell test infrastructure.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const envScript = readFileSync(join(repoRoot, 'scripts', 'generate-env.ps1'), 'utf8');
const compose = readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8');
const envExample = readFileSync(join(repoRoot, '.env.example'), 'utf8');

describe('generate-env.ps1 $envMap', () => {
  it('owns BFF_UPSTREAM defaulting to the host MS (compose parity)', () => {
    expect(envScript).toMatch(/'BFF_UPSTREAM'\s*=\s*'host\.docker\.internal:5401'/);
    expect(compose).toContain('BFF_UPSTREAM:-host.docker.internal:5401');
  });

  it('documents BFF_UPSTREAM in .env.example next to MS_UPSTREAM', () => {
    expect(envExample).toMatch(/^# BFF_UPSTREAM=/m);
    // 注释须与 MS_UPSTREAM 注释相邻（同一「根 docker-compose.yml 专属」段）
    const msLine = envExample.indexOf('# MS_UPSTREAM=');
    const bffLine = envExample.indexOf('# BFF_UPSTREAM=');
    expect(msLine).toBeGreaterThan(-1);
    expect(bffLine).toBeGreaterThan(msLine);
    expect(bffLine - msLine).toBeLessThan(300);
  });
});
