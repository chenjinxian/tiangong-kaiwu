/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Config module: secrets are mandatory (missing => exit 1 naming the var),
 * non-secrets carry dev defaults.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const projectDir = path.resolve(__dirname, '..');

function runConfigImport(env: Record<string, string>): { status: number; output: string } {
  try {
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', '-e', "import('./src/config.ts').then(() => console.log('CONFIG_OK'))"],
      { cwd: projectDir, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { status: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const SECRET_VARS = [
  'BACKEND_API_KEY', 'WEBAGENT_API_KEY', 'CSRF_SECRET',
  'IMODELHUB_ADMIN_EMAIL', 'IMODELHUB_ADMIN_PASSWORD',
] as const;

const allSecrets: Record<string, string> = {
  BACKEND_API_KEY: 'a'.repeat(32),
  WEBAGENT_API_KEY: 'b'.repeat(32),
  CSRF_SECRET: 'c'.repeat(32),
  IMODELHUB_ADMIN_EMAIL: 'admin@test.local',
  IMODELHUB_ADMIN_PASSWORD: 'd'.repeat(16),
};

describe('modeling-server config', () => {
  it.each(SECRET_VARS)('exits 1 naming %s when it is missing', (varName) => {
    const env = { ...allSecrets };
    delete env[varName];
    const result = runConfigImport(env);
    expect(result.status).toBe(1);
    expect(result.output).toContain(varName);
  });

  it('exports typed config with dev defaults when all secrets are present', () => {
    const result = runConfigImport(allSecrets);
    expect(result.status).toBe(0);
    expect(result.output).toContain('CONFIG_OK');
  });
});
