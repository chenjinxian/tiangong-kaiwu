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
      // Base env carries the test-only seam so a developer's real repo-root
      // .env is never loaded (not a secret: per-case deletion never touches it).
      { cwd: projectDir, env: { ...process.env, LUBAN_CONFIG_NO_ENV_FILE: '1', ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { status: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const SECRET_VARS = [
  'AZURITE_ACCOUNT_KEY', 'WEBHOOK_SECRET', 'IMODELHUB_API_KEY', 'BACKEND_API_KEY',
  'IMODELHUB_ADMIN_EMAIL', 'IMODELHUB_ADMIN_PASSWORD',
] as const;

const allSecrets: Record<string, string> = {
  AZURITE_ACCOUNT_KEY: 'a'.repeat(64),
  WEBHOOK_SECRET: 'b'.repeat(32),
  IMODELHUB_API_KEY: 'c'.repeat(32),
  BACKEND_API_KEY: 'e'.repeat(32),
  IMODELHUB_ADMIN_EMAIL: 'admin@test.local',
  IMODELHUB_ADMIN_PASSWORD: 'd'.repeat(16),
};

describe('webhook-agent config', () => {
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

  it('exposes dev defaults in-process after env injection', async () => {
    // config is validated once at import; inject the mandatory secrets first so
    // the import does not exit, and raise the test-only seam so neither a
    // developer's repo-root .env nor the parent shell's env can mask the dev
    // defaults asserted below.
    for (const [name, value] of Object.entries(allSecrets)) {
      process.env[name] = value;
    }
    process.env.LUBAN_CONFIG_NO_ENV_FILE = '1';
    // The literal string 'false' must parse to boolean false — this is exactly
    // the case z.coerce.boolean() got wrong (Boolean('false') === true).
    process.env.DISABLE_AUTOMATIC_RECOVERY = 'false';
    delete process.env.PORT;
    delete process.env.IMODELHUB_URL;
    delete process.env.MODELING_SERVER_URL;
    const { config } = await import('./config.js');
    delete process.env.LUBAN_CONFIG_NO_ENV_FILE; // don't leak the seam to sibling test files
    expect(config.PORT).toBe(4002);
    expect(config.IMODELHUB_URL).toBe('http://localhost:4000');
    expect(config.MODELING_SERVER_URL).toBe('http://localhost:4001');
    expect(config.DISABLE_AUTOMATIC_RECOVERY).toBe(false);
  });

  it('defaults DISABLE_AUTOMATIC_RECOVERY to false when the variable is absent', () => {
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', '-e', "import('./src/config.ts').then(m => console.log('RECOVERY_DEFAULT:' + m.config.DISABLE_AUTOMATIC_RECOVERY))"],
      // Same seam as runConfigImport: keep a real repo-root .env out of the case.
      { cwd: projectDir, env: { ...process.env, LUBAN_CONFIG_NO_ENV_FILE: '1', ...allSecrets }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    expect(output).toContain('RECOVERY_DEFAULT:false');
  });
});
