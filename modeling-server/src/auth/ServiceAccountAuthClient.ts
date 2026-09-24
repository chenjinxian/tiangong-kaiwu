// modeling-server/src/auth/ServiceAccountAuthClient.ts
import { AuthorizationClient } from '@itwin/core-common';

export interface ServiceAccountAuthClientOptions {
  loginUrl: string;
  email: string;
  password: string;
  refreshBufferMs?: number;
}

interface LoginResponse {
  token: string;
  tokenExpires: number;
  refreshToken?: string;
}

export class ServiceAccountAuthClient implements AuthorizationClient {
  private _token: string | null = null;
  private _expiresAt = 0;
  private readonly _refreshBufferMs: number;

  constructor(private readonly _options: ServiceAccountAuthClientOptions) {
    this._refreshBufferMs = _options.refreshBufferMs ?? 60000; // 60s default
  }

  public async getAccessToken(): Promise<string> {
    if (!this._token || Date.now() > this._expiresAt - this._refreshBufferMs) {
      await this._login();
    }
    return this._token!;
  }

  private async _login(): Promise<void> {
    const res = await fetch(this._options.loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: this._options.email,
        password: this._options.password,
      }),
    });

    if (!res.ok) {
      throw new Error(`Service account login failed: ${res.status}`);
    }

    const data = (await res.json()) as LoginResponse;
    this._token = `Bearer ${data.token}`;
    this._expiresAt = data.tokenExpires;
  }
}
