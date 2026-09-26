/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Service-account JWT client for imodelhub-services. Official routes
 * (POST/GET /imodels/:id/baselinefile) are JWT-guarded; the agent
 * authenticates like any other API client using the service account
 * from config. Token is cached with a refresh buffer.
 */

import { config } from './config.js';

interface LoginResponse {
  token: string;
  tokenExpires: number;
}

const REFRESH_BUFFER_MS = 60_000;

class HubAuthClient {
  private _token: string | null = null;
  private _expiresAt = 0;

  /** Returns "Bearer <jwt>", logging in when cached token is missing or stale. */
  public async getAccessToken(): Promise<string> {
    if (this._token && Date.now() < this._expiresAt - REFRESH_BUFFER_MS) {
      return this._token;
    }

    const response = await fetch(`${config.IMODELHUB_URL}/auth/email/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.IMODELHUB_ADMIN_EMAIL,
        password: config.IMODELHUB_ADMIN_PASSWORD,
      }),
    });

    if (!response.ok) {
      throw new Error(`Service account login failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as LoginResponse;
    this._token = `Bearer ${data.token}`;
    this._expiresAt = data.tokenExpires ?? Date.now() + 60_000;
    return this._token;
  }
}

export const hubAuth = new HubAuthClient();
