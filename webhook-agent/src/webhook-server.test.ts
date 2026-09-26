/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Key-check contract for the agent-owned /baseline/retry route: the shared
 * WEBAGENT_API_KEY (modeling-server's outbound key, validated inbound here)
 * must match exactly; wrong, missing, or repeated headers are rejected.
 *
 * Config seam: the key is read from the frozen `config` singleton at check
 * time (webhook-server.ts imports it as appConfig), so the module is mocked
 * wholesale instead of poking process.env — the real config validates at
 * import time and would race the repo-root .env.
 */
import { describe, expect, it, vi } from 'vitest';
import { isValidAgentApiKey } from './webhook-server.js';

vi.mock('./config.js', () => ({
  config: { WEBAGENT_API_KEY: 'w'.repeat(32), LOG_LEVEL: 'error' },
}));

describe('isValidAgentApiKey', () => {
  it('accepts the configured agent key', () => {
    expect(isValidAgentApiKey('w'.repeat(32))).toBe(true);
  });

  it('rejects wrong, missing, and repeated keys', () => {
    expect(isValidAgentApiKey('wrong')).toBe(false);
    expect(isValidAgentApiKey(undefined)).toBe(false);
    // A repeated header arrives as string[] — never treated as a match
    expect(isValidAgentApiKey(['w'.repeat(32)])).toBe(false);
  });
});
