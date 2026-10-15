/**
 * BFF v1 integration tests (Phase A — brief-required five behaviors).
 *
 * Upstream services (modeling-server / imodelhub) are REAL local http mocks,
 * not fetch stubs — the assertions below verify actual proxying behavior
 * (path preservation, header forwarding, body streaming).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { BffConfig } from '../src/config.js';

interface RecordedRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  cookie: string | undefined;
  contentType: string | undefined;
  body: string;
}

async function startMock(
  handler: (req: IncomingMessage, res: ServerResponse, rec: RecordedRequest) => void,
): Promise<{ server: Server; url: string; recorded: RecordedRequest[] }> {
  const recorded: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    const rec: RecordedRequest = {
      method: req.method ?? '',
      url: req.url ?? '',
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
      contentType: req.headers['content-type'] as string | undefined,
      body: '',
    };
    req.on('data', (chunk: Buffer) => (rec.body += chunk.toString()));
    req.on('end', () => {
      recorded.push(rec);
      handler(req, res, rec);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, recorded };
}

let msMock: { server: Server; url: string; recorded: RecordedRequest[] };
let hubMock: { server: Server; url: string; recorded: RecordedRequest[] };
let authMeCalls: number;
let app: ReturnType<typeof createApp>;
let config: BffConfig;

beforeAll(async () => {
  // MS mock: echo service
  msMock = await startMock((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-ms-echo': 'yes' });
    res.end(JSON.stringify({ service: 'ms' }));
  });

  // HUB mock: /auth/me (token validation; any "valid*" token accepted so each
  // test can mint a cache-unique token) + echo for the rest
  authMeCalls = 0;
  hubMock = await startMock((req, res) => {
    if (req.url === '/auth/me') {
      authMeCalls += 1;
      const token = req.headers.authorization?.slice(7) ?? '';
      if (token.startsWith('valid')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'user-1', email: 'u@example.com' }));
      } else {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'unauthorized' }));
      }
      return;
    }
    res.writeHead(201, { 'content-type': 'application/json', 'x-hub-echo': 'yes' });
    res.end(JSON.stringify({ service: 'hub' }));
  });

  config = {
    msUpstream: msMock.url,
    hubUpstream: hubMock.url,
    authUrl: `${hubMock.url}/auth/me`,
    allowedOrigins: ['http://localhost:3000'],
    rateLimitMax: 100,
    rateLimitWindowMs: 900_000,
    authCacheTtlMs: 60_000,
  };
  app = createApp(config);
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((r) => msMock.server.close(() => r())),
    new Promise<void>((r) => hubMock.server.close(() => r())),
  ]);
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('/api JWT termination', () => {
  it('rejects requests without a token: 401, upstream not hit', async () => {
    const msBefore = msMock.recorded.length;
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('Unauthorized');
    expect(msMock.recorded.length).toBe(msBefore);
  });

  it('proxies valid Bearer token to MS, preserving path/query/headers/response', async () => {
    const res = await request(app)
      .get('/api/users/me?expand=1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'ms' });
    expect(res.headers['x-ms-echo']).toBe('yes');

    const upstream = msMock.recorded.at(-1);
    expect(upstream?.method).toBe('GET');
    expect(upstream?.url).toBe('/api/users/me?expand=1');
    expect(upstream?.authorization).toBe('Bearer valid-token');
  });
});

describe('HUB prefix passthrough (no termination)', () => {
  it('proxies /itwins to HUB without auth and without path rewrite', async () => {
    const authBefore = authMeCalls;
    const res = await request(app).get('/itwins/abc123');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ service: 'hub' });
    expect(res.headers['x-hub-echo']).toBe('yes');
    const upstream = hubMock.recorded.at(-1);
    expect(upstream?.url).toBe('/itwins/abc123');
    // /auth/me must NOT be consulted for passthrough prefixes
    expect(authMeCalls).toBe(authBefore);
  });
});

describe('global rate limit (token bucket 100/15min/IP)', () => {
  it('returns 429 once the bucket is drained; /health stays exempt', async () => {
    const limited = createApp({ ...config, rateLimitMax: 1, rateLimitWindowMs: 600_000 });
    const first = await request(limited).get('/api/users/me');
    expect(first.status).toBe(401); // consumed the single token, then auth-rejected
    const second = await request(limited).get('/api/users/me');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('RateLimitExceeded');
    const health = await request(limited).get('/health');
    expect(health.status).toBe(200);
  });
});

describe('/api token validation edge cases', () => {
  it('rejects an invalid token: 401, upstream not hit', async () => {
    const msBefore = msMock.recorded.length;
    const res = await request(app).get('/api/users/me').set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('Unauthorized');
    expect(msMock.recorded.length).toBe(msBefore);
  });

  it('fails closed with 503 when the auth service is unreachable', async () => {
    // Reserve-then-close a port so the connection is guaranteed to refuse.
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const deadPort = (probe.address() as AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));

    const deadAuthApp = createApp({ ...config, authUrl: `http://127.0.0.1:${deadPort}/auth/me` });
    const res = await request(deadAuthApp)
      .get('/api/users/me')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AuthServiceUnavailable');
  });

  it('accepts the luban_cad_auth cookie (URI-encoded JSON payload)', async () => {
    const cookieValue = encodeURIComponent(JSON.stringify({ accessToken: 'valid-token' }));
    const res = await request(app)
      .get('/api/users/me')
      .set('Cookie', `luban_cad_auth=${cookieValue}`);
    expect(res.status).toBe(200);
    const upstream = msMock.recorded.at(-1);
    expect(upstream?.url).toBe('/api/users/me');
  });

  it('accepts the nested tokens.accessToken cookie shape', async () => {
    const cookieValue = encodeURIComponent(
      JSON.stringify({ tokens: { accessToken: 'valid-token' } }),
    );
    const res = await request(app)
      .get('/api/users/me')
      .set('Cookie', `luban_cad_auth=${cookieValue}`);
    expect(res.status).toBe(200);
  });

  it('accepts the ?token= query fallback', async () => {
    const res = await request(app).get('/api/users/me?token=valid-token');
    expect(res.status).toBe(200);
  });

  it('caches validation: /auth/me consulted once for repeated same-token calls', async () => {
    const callsBefore = authMeCalls;
    await request(app).get('/api/a').set('Authorization', 'Bearer valid-cache-token');
    await request(app).get('/api/b').set('Authorization', 'Bearer valid-cache-token');
    await request(app).get('/api/c').set('Authorization', 'Bearer valid-cache-token');
    expect(authMeCalls - callsBefore).toBe(1);
  });

  it('proxies POST bodies verbatim to MS', async () => {
    const res = await request(app)
      .post('/api/briefcases')
      .set('Authorization', 'Bearer valid-token')
      .set('Content-Type', 'application/json')
      .send({ imodelId: 'im-1', name: 'bc' });
    expect(res.status).toBe(200);
    const upstream = msMock.recorded.at(-1);
    expect(upstream?.method).toBe('POST');
    expect(upstream?.url).toBe('/api/briefcases');
    expect(upstream?.body).toBe(JSON.stringify({ imodelId: 'im-1', name: 'bc' }));
    expect(upstream?.contentType).toBe('application/json');
  });

  it('returns 502 when the modeling-server upstream is down', async () => {
    const probe = createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const deadPort = (probe.address() as AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));

    const deadMsApp = createApp({ ...config, msUpstream: `http://127.0.0.1:${deadPort}` });
    const res = await request(deadMsApp)
      .get('/api/users/me')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('BadGateway');
  });
});

describe('CORS single point', () => {
  it('allows whitelisted dev origins with credentials', async () => {
    const res = await request(app)
      .get('/itwins/x')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('omits CORS headers for non-whitelisted origins', async () => {
    const res = await request(app).get('/itwins/x').set('Origin', 'http://evil.example.com');
    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers OPTIONS preflight for whitelisted origins', async () => {
    const res = await request(app)
      .options('/api/users/me')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });
});

describe('route isolation', () => {
  it('returns 404 for faces the BFF does not own', async () => {
    const res = await request(app).get('/ws');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NotFound');
  });
});
