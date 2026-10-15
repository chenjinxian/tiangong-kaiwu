/**
 * BFF configuration — env-driven, fail-fast (mirrors MS config discipline).
 */

export interface BffConfig {
  /** modeling-server upstream origin, e.g. http://host.docker.internal:4001 */
  msUpstream: string;
  /** imodelhub-services upstream origin (HUB nine prefixes), e.g. http://host.docker.internal:4000 */
  hubUpstream: string;
  /** hub token-validation endpoint (full URL, e.g. ${hubUpstream}/auth/me) */
  authUrl: string;
  /** CORS whitelist for cross-origin browser requests (same-origin requests carry no Origin) */
  allowedOrigins: string[];
  /** token bucket capacity per IP (window) */
  rateLimitMax: number;
  /** token bucket refill window in ms (default 15 min) */
  rateLimitWindowMs: number;
  /** validated-token cache TTL in ms (default 60 s, mirrors MS wsAuth) */
  authCacheTtlMs: number;
}

const DEFAULTS = {
  port: 4003,
  msUpstream: 'http://host.docker.internal:4001',
  hubUpstream: 'http://host.docker.internal:4000',
  allowedOrigins: 'http://localhost:3000,http://localhost',
  rateLimitMax: 100,
  rateLimitWindowMs: 900_000, // 15 min
  authCacheTtlMs: 60_000, // 1 min
  authTimeoutMs: 5_000,
} as const;

function readPositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" (expected positive integer)`);
  }
  return n;
}

/** Normalize an upstream origin: http(s)://host[:port], no path, no trailing slash. */
export function normalizeUpstream(raw: string, name: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid ${name}: "${raw}" (expected http(s)://host[:port])`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid ${name}: "${raw}" (http/https only)`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Invalid ${name}: "${raw}" (origin only — no path/query/hash)`);
  }
  return url.origin;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BffConfig & { port: number } {
  const msUpstream = normalizeUpstream(env.MS_UPSTREAM ?? DEFAULTS.msUpstream, 'MS_UPSTREAM');
  const hubUpstream = normalizeUpstream(env.HUB_UPSTREAM ?? DEFAULTS.hubUpstream, 'HUB_UPSTREAM');
  return {
    port: readPositiveInt(env.PORT, DEFAULTS.port, 'PORT'),
    msUpstream,
    hubUpstream,
    authUrl: env.AUTH_URL ?? `${hubUpstream}/auth/me`,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? DEFAULTS.allowedOrigins)
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    rateLimitMax: readPositiveInt(env.RATE_LIMIT_MAX, DEFAULTS.rateLimitMax, 'RATE_LIMIT_MAX'),
    rateLimitWindowMs: readPositiveInt(
      env.RATE_LIMIT_WINDOW_MS,
      DEFAULTS.rateLimitWindowMs,
      'RATE_LIMIT_WINDOW_MS',
    ),
    authCacheTtlMs: readPositiveInt(env.AUTH_CACHE_TTL_MS, DEFAULTS.authCacheTtlMs, 'AUTH_CACHE_TTL_MS'),
  };
}

/** @internal exposed for tests */
export const configDefaults = DEFAULTS;
