/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Inbound webhook-agent routes REQUIRE the API key — no optional mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';

process.env.BACKEND_API_KEY = 'k'.repeat(32);
process.env.CSRF_SECRET = 'c'.repeat(32);
process.env.IMODELHUB_ADMIN_EMAIL = 'admin@test.local';
process.env.IMODELHUB_ADMIN_PASSWORD = 'p'.repeat(16);
process.env.WEBAGENT_API_KEY = 'g'.repeat(32);

const realFetch = global.fetch;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  // main.ts cannot be imported wholesale (starts IModelHost); register the
  // guarded routes via the same helper extracted in Step 3.
  const { createWebhookEventRoutes } = await import('./webhookEvents.js');
  const app = express();
  app.use(express.json());
  app.use(createWebhookEventRoutes());
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('webhook-agent inbound auth', () => {
  it('rejects /api/webhook/events without a key with 401', async () => {
    const res = await fetch(`${baseUrl}/api/webhook/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('rejects /api/webhook/events with a wrong key with 401', async () => {
    const res = await fetch(`${baseUrl}/api/webhook/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'wrong' }, body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('accepts /api/webhook/events with the configured key', async () => {
    const res = await fetch(`${baseUrl}/api/webhook/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'k'.repeat(32) },
      body: JSON.stringify({ eventType: 'iModels.iModelCreated.v1', iModelId: 'x', id: 'e1' }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects progress POST without a key with 401', async () => {
    const res = await fetch(`${baseUrl}/api/imodels/x/progress`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"step":"s"}',
    });
    expect(res.status).toBe(401);
  });
});

void realFetch;
