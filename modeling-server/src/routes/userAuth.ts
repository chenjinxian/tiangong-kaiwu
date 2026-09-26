/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * User auth routes that forward to imodelhub-services (HUB).
 *
 * HUB contract (src/auth/auth.controller.ts of imodelhub-services):
 *   GET   /auth/me              — token validation, returns current user
 *   PATCH /auth/me              — profile update; with {oldPassword, password}
 *                                 verifies the old password and changes it
 *   POST  /auth/forgot/password — body {email}
 *   POST  /auth/reset/password  — body {hash, password}
 *
 * Hard rule: these routes never fake success. HUB failures are surfaced
 * (502 for reachability, mapped 4xx for contract errors). The only
 * deliberate exception is forgot-password's anti-enumeration response.
 */

import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
// Note: the mounting app is expected to apply express.json() globally (main.ts does).

export interface UserAuthRouterOptions {
  /** Base URL of imodelhub-services; defaults to config.IMODELHUB_URL */
  hubBaseUrl?: string;
}

interface HubUser {
  id: string | number;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface HubErrorBody {
  errors?: Record<string, string>;
}

/** Validate the caller's JWT against the HUB; returns false when the response was written. */
async function validateToken(hubBase: string, req: Request, res: Response): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function tokenIsValid(hubBase: string, authHeader: string): Promise<boolean> {
  const response = await fetch(`${hubBase}/auth/me`, {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    headers: { Authorization: authHeader },
  });
  return response.ok;
}

function toPublicUser(user: HubUser) {
  return {
    id: String(user.id),
    email: user.email,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
  };
}

export function createUserAuthRouter(options: UserAuthRouterOptions = {}): Router {
  const hubBase = options.hubBaseUrl ?? config.IMODELHUB_URL;
  const router = Router();

  const requireValidToken = async (req: Request, res: Response): Promise<boolean> => {
    if (!(await validateToken(hubBase, req, res))) return false;
    try {
      if (!(await tokenIsValid(hubBase, req.headers.authorization!))) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return false;
      }
    } catch {
      res.status(502).json({ error: 'Auth service unavailable' });
      return false;
    }
    return true;
  };

  /**
   * PUT /api/users/profile — update display name via HUB PATCH /auth/me
   */
  router.put('/api/users/profile', async (req: Request, res: Response) => {
    if (!(await requireValidToken(req, res))) return;

    const { name } = req.body as { name?: string };
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const trimmed = name.trim();
    const parts = trimmed.split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    try {
      const response = await fetch(`${hubBase}/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Authorization: req.headers.authorization!,
        },
        body: JSON.stringify({ firstName, lastName }),
      });

      if (!response.ok) {
        const status = response.status === 422 ? 422 : 502;
        res.status(status).json({
          error: status === 422 ? 'Invalid profile data' : 'Failed to update profile',
        });
        return;
      }

      const updatedUser = (await response.json()) as HubUser;
      res.json({ success: true, user: toPublicUser(updatedUser) });
    } catch {
      res.status(502).json({ error: 'Failed to update profile' });
    }
  });

  /**
   * PUT /api/users/password — change password via HUB PATCH /auth/me {oldPassword, password}
   */
  router.put('/api/users/password', async (req: Request, res: Response) => {
    if (!(await requireValidToken(req, res))) return;

    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    try {
      const response = await fetch(`${hubBase}/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Authorization: req.headers.authorization!,
        },
        body: JSON.stringify({ oldPassword: currentPassword, password: newPassword }),
      });

      if (response.ok) {
        res.json({ success: true, message: 'Password changed successfully' });
        return;
      }

      if (response.status === 422) {
        const body = (await response.json().catch(() => ({}))) as HubErrorBody;
        if (body.errors?.oldPassword === 'incorrectOldPassword') {
          res.status(401).json({ error: 'Current password is incorrect' });
          return;
        }
      }

      res.status(502).json({ error: 'Failed to change password' });
    } catch {
      res.status(502).json({ error: 'Failed to change password' });
    }
  });

  /**
   * POST /api/auth/forgot-password — forward to HUB POST /auth/forgot/password
   */
  router.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    try {
      const response = await fetch(`${hubBase}/auth/forgot/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        res.json({ success: true, message: 'Password reset email sent' });
        return;
      }

      // Anti-enumeration: unknown email must look identical to success.
      if (response.status === 422) {
        const body = (await response.json().catch(() => ({}))) as HubErrorBody;
        if (body.errors?.email === 'emailNotExists') {
          res.json({ success: true, message: 'Password reset email sent' });
          return;
        }
      }

      res.status(502).json({ error: 'Failed to request password reset' });
    } catch {
      res.status(502).json({ error: 'Failed to request password reset' });
    }
  });

  /**
   * POST /api/auth/reset-password — forward to HUB POST /auth/reset/password
   * Frontend contract {token, newPassword} maps to HUB {hash, password}.
   */
  router.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }

    try {
      const response = await fetch(`${hubBase}/auth/reset/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: token, password: newPassword }),
      });

      if (response.ok) {
        res.json({ success: true, message: 'Password reset successfully' });
        return;
      }

      if (response.status === 422) {
        const body = (await response.json().catch(() => ({}))) as HubErrorBody;
        if (body.errors?.hash === 'invalidHash') {
          res.status(401).json({ error: 'Invalid or expired token' });
          return;
        }
      }

      res.status(502).json({ error: 'Failed to reset password' });
    } catch {
      res.status(502).json({ error: 'Failed to reset password' });
    }
  });

  return router;
}


/** Standard 404 for unmatched routes — replaces the old catch-all that answered 200. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}
