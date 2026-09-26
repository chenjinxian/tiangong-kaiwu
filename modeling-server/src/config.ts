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
  // Walk up from this file until a directory containing .env is found
  // (works from both src/ during dev and dist/ after build).
  let dir = __dirname;
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
  PORT: z.coerce.number().int().positive().default(4001),
  IMODELHUB_URL: url('http://localhost:4000'),
  WEBAGENT_URL: url('http://localhost:4002'),
  FRONTEND_URL: url('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().optional(),
  AZURITE_ACCOUNT_NAME: z.string().min(1).default('devstoreaccount1'),
  AZURITE_HOST: z.string().min(1).default('127.0.0.1:10000'),
  BRIEFCASE_CACHE_LOCATION: z.string().min(1).default('./briefcase-cache'),

  // --- secrets: mandatory, no defaults ---
  IMODELHUB_ADMIN_EMAIL: z.string().email(),
  IMODELHUB_ADMIN_PASSWORD: z.string().min(12),
  BACKEND_API_KEY: z.string().min(32),
  WEBAGENT_API_KEY: z.string().min(32),
  CSRF_SECRET: z.string().min(32),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('modeling-server: invalid configuration —');
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
