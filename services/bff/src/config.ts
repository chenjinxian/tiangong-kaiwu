/**
 * BFF configuration — env-driven, fail-fast (mirrors MS config discipline).
 */

export interface BffConfig {
  /** modeling-server upstream origin, e.g. http://host.docker.internal:5401 */
  msUpstream: string;
  /** imodelhub-services upstream origin (HUB nine prefixes), e.g. http://imodelhub:4000 (compose network) */
  hubUpstream: string;
  /** hub token-validation endpoint (full URL, e.g. ${hubUpstream}/auth/me) */
  authUrl: string;
  /** CORS whitelist for cross-origin browser requests (same-origin requests carry no Origin) */
  allowedOrigins: string[];
  /** token bucket capacity per IP (window) */
  rateLimitMax: number;
  /** token bucket refill window in ms (default 15 min) */
  rateLimitWindowMs: number;
  /**
   * Positive validated-token cache TTL in ms. G1 B1.2c default is 0 (disabled):
   * every `/api` request re-validates against the Hub so logout/revocation is
   * effective on the next request. A deployment may opt in with
   * `AUTH_TOKEN_CACHE_TTL_MS > 0` as a performance tradeoff (it reopens a
   * revocation window up to that TTL). Negative and unavailable results are
   * never cached.
   */
  authCacheTtlMs: number;
  /**
   * G1 B5a token transport gate. `deny` (default) rejects any non-empty
   * `?token=`; `allow` is an explicit, logged rollback window registered as
   * EXCEPTIONS X-18. Bearer/cookie transports are unaffected.
   */
  sessionTokenViaQuery: 'deny' | 'allow';
}

const DEFAULTS = {
  port: 5403,
  msUpstream: 'http://host.docker.internal:5401',
  // W1-I6: hub now always runs as the compose container and publishes only on
  // loopback; reach it over the compose network, not the Docker Desktop gateway.
  hubUpstream: 'http://imodelhub:4000',
  allowedOrigins: 'http://localhost:5300,http://localhost:5301',
  rateLimitMax: 100,
  rateLimitWindowMs: 900_000, // 15 min
  // G1 B1.2c: no positive cache by default. Opt in explicitly via
  // AUTH_TOKEN_CACHE_TTL_MS; only valid results are ever cached.
  authCacheTtlMs: 0,
  authTimeoutMs: 5_000,
  sessionTokenViaQuery: 'deny',
} as const;

/** Parse the B5a query-token gate; invalid values fail fast (no silent fallback). */
export function readQueryTokenPolicy(raw: string | undefined): 'deny' | 'allow' {
  if (raw === undefined || raw === '') return 'deny';
  if (raw === 'deny' || raw === 'allow') return raw;
  throw new Error(`Invalid SESSION_TOKEN_VIA_QUERY: "${raw}" (expected deny|allow)`);
}

function readPositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" (expected positive integer)`);
  }
  return n;
}

/** Non-negative integer (0 is meaningful: disables the positive token cache). */
function readNonNegativeInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid ${name}: "${raw}" (expected non-negative integer)`);
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
    // G1 B1.2c: the old AUTH_CACHE_TTL_MS name is intentionally NOT read — it
    // used to default to 60s and would silently reopen the revocation window.
    authCacheTtlMs: readNonNegativeInt(
      env.AUTH_TOKEN_CACHE_TTL_MS,
      DEFAULTS.authCacheTtlMs,
      'AUTH_TOKEN_CACHE_TTL_MS',
    ),
    sessionTokenViaQuery: readQueryTokenPolicy(env.SESSION_TOKEN_VIA_QUERY),
  };
}

/** @internal exposed for tests */
export const configDefaults = DEFAULTS;
