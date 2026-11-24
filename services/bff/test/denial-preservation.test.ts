/**
 * G1 B3.1f-a BFF denial preservation for the dangerous /api surfaces.
 *
 * MS `AUTH_B3_SURFACES_MODE=enforce` denies progress/retry with 403
 * `AuthorizationDenied` (and keeps 401 for missing/invalid auth). The BFF is a
 * generic JWT-terminating proxy: it must forward the upstream status and body
 * verbatim, must not retry, and must not substitute a success response. This is
 * the BFF half of the B3.1f-a contract; the BFF never computes the decision.
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
  body: string;
}

interface MsResponse {
  status: number;
  body: unknown;
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
let app: ReturnType<typeof createApp>;
let msResponses: Record<string, MsResponse>;
let authMeCalls: number;

beforeAll(async () => {
  msResponses = {
    '/api/imodels/im-1/progress': {
      status: 403,
      body: {
        code: 'AuthorizationDenied',
        reason: 'progress_surface_unbound',
        error: 'Authorization denied: progress requires a server-session authorization context',
      },
    },
    '/api/imodels/im-1/retry': {
      status: 403,
      body: {
        code: 'AuthorizationDenied',
        reason: 'retry_surface_unbound',
        error: 'Authorization denied: retry requires a server-session authorization context',
      },
    },
    '/api/imodels/expired/retry': {
      status: 401,
      body: { error: 'Invalid or expired token' },
    },
  };

  msMock = await startMock((req, res) => {
    const key = (req.url ?? '').split('?')[0] ?? '';
    const configured = msResponses[key] ?? { status: 200, body: { service: 'ms' } };
    res.writeHead(configured.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(configured.body));
  });

  authMeCalls = 0;
  hubMock = await startMock((req, res) => {
    if (req.url === '/auth/me') {
      authMeCalls += 1;
      const token = req.headers.authorization?.slice(7) ?? '';
      if (token.startsWith('valid')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'user-1' }));
        return;
      }
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'unauthorized' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'not found' }));
  });

  const config: BffConfig = {
    msUpstream: msMock.url,
    hubUpstream: hubMock.url,
    authUrl: `${hubMock.url}/auth/me`,
    allowedOrigins: ['http://localhost:5300'],
    rateLimitMax: 100,
    rateLimitWindowMs: 900_000,
    authCacheTtlMs: 0,
    sessionTokenViaQuery: 'deny',
  };
  app = createApp(config);
});

afterAll(async () => {
  await Promise.all([
    new Promise<void>((r) => msMock.server.close(() => r())),
    new Promise<void>((r) => hubMock.server.close(() => r())),
  ]);
});

describe('BFF forwards MS dangerous-surface denials', () => {
  it('GET progress: forwards MS 403 code/reason/body verbatim, once, with no success substitution', async () => {
    const msBefore = msMock.recorded.length;
    const authBefore = authMeCalls;

    const res = await request(app)
      .get('/api/imodels/im-1/progress')
      .set('Authorization', 'Bearer valid-b31f-progress');

    expect(res.status).toBe(403);
    expect(res.body).toEqual(msResponses['/api/imodels/im-1/progress']?.body);
    // Exactly one MS call and one BFF JWT termination: no retry, no fallback.
    expect(msMock.recorded.length).toBe(msBefore + 1);
    expect(authMeCalls).toBe(authBefore + 1);
    const proxied = msMock.recorded.at(-1);
    expect(proxied?.method).toBe('GET');
    expect(proxied?.url).toBe('/api/imodels/im-1/progress');
    expect(proxied?.authorization).toBe('Bearer valid-b31f-progress');
    expect(res.body).not.toEqual({ service: 'ms' });
  });

  it('POST retry: forwards MS 403 verbatim, once, and never retries the HUB-triggering call', async () => {
    const msBefore = msMock.recorded.length;
    const authBefore = authMeCalls;

    const res = await request(app)
      .post('/api/imodels/im-1/retry')
      .set('Authorization', 'Bearer valid-b31f-retry')
      .set('Content-Type', 'application/json')
      .send({ iTwinId: 'itwin-1' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(msResponses['/api/imodels/im-1/retry']?.body);
    expect(msMock.recorded.length).toBe(msBefore + 1);
    expect(authMeCalls).toBe(authBefore + 1);
    const proxied = msMock.recorded.at(-1);
    expect(proxied?.method).toBe('POST');
    expect(proxied?.url).toBe('/api/imodels/im-1/retry');
    expect(proxied?.body).toBe(JSON.stringify({ iTwinId: 'itwin-1' }));
  });

  it('preserves an upstream 401 after BFF token validation, without rewriting it', async () => {
    const msBefore = msMock.recorded.length;

    const res = await request(app)
      .post('/api/imodels/expired/retry')
      .set('Authorization', 'Bearer valid-b31f-upstream-401')
      .set('Content-Type', 'application/json')
      .send({ iTwinId: 'itwin-1' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual(msResponses['/api/imodels/expired/retry']?.body);
    expect(msMock.recorded.length).toBe(msBefore + 1);
  });

  it('still rejects an invalid BFF token before reaching MS (BFF authn unchanged)', async () => {
    const msBefore = msMock.recorded.length;

    const res = await request(app)
      .get('/api/imodels/im-1/progress')
      .set('Authorization', 'Bearer invalid-b31f');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('Unauthorized');
    expect(msMock.recorded.length).toBe(msBefore);
  });
});
