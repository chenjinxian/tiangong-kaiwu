/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL, wsUrl } from './baseUrl.js';

/**
 * VITE_API_URL is unset in the test environment (vitest loads .env.test, not
 * .env.development), so the module default is the same-origin selection: ''.
 */
describe('baseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to same-origin relative URLs when VITE_API_URL is unset', () => {
    expect(API_BASE_URL).toBe('');
  });

  it('wsUrl derives the ws scheme from the current origin when unset', () => {
    const expected = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    expect(wsUrl('/ws')).toBe(`${expected}/ws`);
    expect(wsUrl('/ws?token=abc')).toBe(`${expected}/ws?token=abc`);
  });

  it('wsUrl converts the configured http base to ws', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4001');
    expect(wsUrl('/ws?token=jwt')).toBe('ws://localhost:4001/ws?token=jwt');
  });

  it('wsUrl converts the configured https base to wss', () => {
    vi.stubEnv('VITE_API_URL', 'https://cad.example.com');
    expect(wsUrl('/ipc')).toBe('wss://cad.example.com/ipc');
  });
});
