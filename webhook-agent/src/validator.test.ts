/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Characterization tests for the webhook signature validator.
 *
 * WEBHOOK_SECRET reaches the validator as a function parameter (injected from
 * main.ts via WebhookConfig), never as a module-level read — so these cases
 * pass the secret explicitly and need no env/config mocking.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateRequest } from './validator.js';

const SECRET = 's'.repeat(32);

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

describe('validateRequest', () => {
  const body = JSON.stringify({ eventType: 'iModels.iModelCreated.v1', iTwinId: 't1' });

  it('accepts a correctly signed body', () => {
    expect(validateRequest(SECRET, { signature: sign(body) }, body).valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(validateRequest(SECRET, { signature: sign(body) }, body + 'x').valid).toBe(false);
  });

  it('rejects a signature from a different secret', () => {
    const other = `sha256=${createHmac('sha256', 'k'.repeat(32)).update(body).digest('hex')}`;
    expect(validateRequest(SECRET, { signature: other }, body).valid).toBe(false);
  });

  it('rejects a malformed signature header without throwing', () => {
    expect(() => validateRequest(SECRET, { signature: 'not-a-signature' }, body)).not.toThrow();
    // Expected-format failures are distinguished explicitly, not collapsed
    // into a generic "Invalid signature format".
    expect(validateRequest(SECRET, { signature: 'not-a-signature' }, body).error).toBe(
      'Invalid signature header format'
    );
  });
});
