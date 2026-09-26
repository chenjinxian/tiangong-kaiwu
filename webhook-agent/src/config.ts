/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Single source of configuration. Loads the repo-root .env (via Node's
 * native process.loadEnvFile; real environment variables take precedence),
 * validates everything with zod, and exits naming every invalid/missing
 * variable on failure. Secrets have NO defaults — deliberate.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

function loadRootEnvFile(): void {
  // Test-only seam: config tests set LUBAN_CONFIG_NO_ENV_FILE=1 so a real
  // repo-root .env (developer machine) cannot leak into the cases under test.
  if (process.env.LUBAN_CONFIG_NO_ENV_FILE === '1') return;
  // Walk up from this file until a directory containing .env is found
  // (works from both src/ during dev and dist/ after build).
  let dir = import.meta.dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      try { process.loadEnvFile(candidate); } catch { /* malformed file: schema will report */ }
      return;
    }
    dir = path.dirname(dir);
  }
}
loadRootEnvFile();

const url = (defaultValue: string) => z.string().url().default(defaultValue);

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4002),
  IMODELHUB_URL: url('http://localhost:4000'),
  MODELING_SERVER_URL: url('http://localhost:4001'),   // replaces BACKEND_URL
  AZURITE_ACCOUNT_NAME: z.string().min(1).default('devstoreaccount1'),
  AZURITE_HOST: z.string().min(1).default('127.0.0.1:10000'),

  // --- secrets: mandatory ---
  AZURITE_ACCOUNT_KEY: z.string().min(16),             // replaces BLOB_ACCOUNT_KEY + hardcoded well-known key
  WEBHOOK_SECRET: z.string().min(32),
  IMODELHUB_API_KEY: z.string().min(32),               // WA → imodelhub-services (HUB) outbound
  BACKEND_API_KEY: z.string().min(32),                 // WA → modeling-server outbound (value MS validates inbound)
  IMODELHUB_ADMIN_EMAIL: z.string().email(),
  IMODELHUB_ADMIN_PASSWORD: z.string().min(12),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  RECOVERY_CHECK_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  RECOVERY_MAX_PER_CHECK: z.coerce.number().int().positive().default(10),
  // Boolean env strings parsed explicitly: z.coerce.boolean() would treat the
  // literal string 'false' as true (Boolean('false') === true). The default
  // sits on the enum (input side) — on a transformed pipe zod's .default() is
  // output-typed and would bypass the transform.
  DISABLE_AUTOMATIC_RECOVERY: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('webhook-agent: invalid configuration —');
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('Provide the missing values in the repo-root .env (see .env.example).');
    console.error('First run: powershell -File scripts/generate-env.ps1');
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

export const config = load();
