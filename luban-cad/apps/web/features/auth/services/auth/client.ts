/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Authentication Client
 * Uses REST API token storage (compatible with imodelhub-services)
 */

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'professional' | 'enterprise';
  avatar?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'AuthError';
  }
}

// Backend user response format
interface BackendUser {
  id: string | number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  photo?: { path: string } | null;
}

// ============================================================================
// Constants
// ============================================================================

const AUTH_STORAGE_KEY = 'luban_cad_auth';
const USER_STORAGE_KEY = 'luban_cad_user';
const REMEMBER_ME_KEY = 'luban_cad_remember_me';
const API_BASE_URL = import.meta.env.VITE_IMODELHUB_URL || '';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse full name into first and last name
 */
function parseName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Convert backend user format to frontend user format
 */
function convertUser(backendUser: BackendUser): User {
  const firstName = backendUser.firstName || '';
  const lastName = backendUser.lastName || '';
  const name = firstName || lastName
    ? `${firstName} ${lastName}`.trim()
    : (backendUser.email || 'Unknown');

  return {
    id: String(backendUser.id),
    email: backendUser.email || '',
    name,
    plan: 'free',
    avatar: backendUser.photo?.path,
  };
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Get stored auth from sessionStorage only.
 * Tokens are never stored in localStorage to prevent XSS token theft.
 */
export function getStoredAuth(): { user: User | null; tokens: AuthTokens | null } {
  try {
    const tokensJson = sessionStorage.getItem(AUTH_STORAGE_KEY);
    const userJson = sessionStorage.getItem(USER_STORAGE_KEY);

    if (!tokensJson || !userJson) {
      return { user: null, tokens: null };
    }

    const tokens = JSON.parse(tokensJson) as AuthTokens;
    const user = JSON.parse(userJson) as User;

    // Check if tokens are expired
    if (tokens.expiresAt < Date.now()) {
      clearStoredAuth();
      return { user: null, tokens: null };
    }

    return { user, tokens };
  } catch {
    return { user: null, tokens: null };
  }
}

/**
 * Store auth in sessionStorage only.
 * Tokens are never persisted to localStorage — sessionStorage is cleared
 * when the browser tab closes, limiting the window for XSS token theft.
 */
export function storeAuth(
  user: User,
  tokens: AuthTokens,
  _rememberMe: boolean
): void {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
  sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));

  // Clear any legacy tokens from localStorage
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
}

/**
 * Clear stored auth from both storages
 */
export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(REMEMBER_ME_KEY);
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Login with email and password
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/email/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Login failed' }));
    throw new AuthError(error.message || 'Login failed', response.status);
  }

  const data = await response.json() as {
    token: string;
    refreshToken: string;
    tokenExpires?: number;
    user: BackendUser;
  };

  const tokens: AuthTokens = {
    accessToken: data.token,
    refreshToken: data.refreshToken,
    expiresIn: data.tokenExpires ? Math.floor((data.tokenExpires - Date.now()) / 1000) : 900,
    expiresAt: data.tokenExpires || Date.now() + 900 * 1000,
  };

  const user = convertUser(data.user);

  storeAuth(user, tokens, credentials.rememberMe ?? false);

  return { user, tokens };
}

/**
 * Register new account
 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  const { firstName, lastName } = parseName(data.name);

  // First register
  const regResponse = await fetch(`${API_BASE_URL}/auth/email/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: data.email,
      password: data.password,
      firstName,
      lastName,
    }),
  });

  if (!regResponse.ok) {
    const error = await regResponse.json().catch(() => ({ message: 'Registration failed' }));
    throw new Error(error.message || 'Registration failed');
  }

  // Then login
  return login({ email: data.email, password: data.password });
}

/**
 * Logout
 */
export async function logout(accessToken: string | null, refreshToken?: string | null): Promise<void> {
  if (accessToken) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ accessToken, refreshToken }),
      });
    } catch {
      // Ignore errors during logout
    }
  }
  clearStoredAuth();
}

/**
 * Refresh access token
 */
export async function refreshToken(refreshTokenValue: string): Promise<AuthTokens> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refreshTokenValue }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const data = await response.json() as {
    token: string;
    refreshToken: string;
    tokenExpires?: number;
  };

  return {
    accessToken: data.token,
    refreshToken: data.refreshToken,
    expiresIn: data.tokenExpires ? Math.floor((data.tokenExpires - Date.now()) / 1000) : 900,
    expiresAt: data.tokenExpires || Date.now() + 900 * 1000,
  };
}

/**
 * Get current user
 */
export async function getCurrentUser(accessToken: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get current user');
  }

  const user = await response.json() as BackendUser;
  return convertUser(user);
}

// ============================================================================
// Token Management
// ============================================================================

let isRefreshing = false;
let refreshPromise: Promise<AuthTokens> | null = null;

/**
 * Get current access token from REST API auth storage
 * Returns empty string if not authenticated
 */
export async function getAccessToken(): Promise<string> {
  const { tokens } = getStoredAuth();
  return tokens?.accessToken || '';
}

/**
 * Check if token is expired or about to expire
 * Returns true if token expires within 5 minutes
 */
function isTokenExpiringSoon(tokens: AuthTokens | null): boolean {
  if (!tokens) return true;
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
  return tokens.expiresAt < Date.now() + bufferMs;
}

/**
 * Refresh access token using refresh token
 * Deduplicates concurrent refresh requests
 */
export async function refreshAccessToken(): Promise<AuthTokens | null> {
  const { tokens } = getStoredAuth();

  if (!tokens?.refreshToken) {
    return null;
  }

  // If already refreshing, return the existing promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = refreshToken(tokens.refreshToken)
    .then((newTokens) => {
      // Get current user to preserve it
      const { user } = getStoredAuth();
      if (user) {
        storeAuth(user, newTokens, false);
      }
      return newTokens;
    })
    .catch((error: Error) => {
      // Refresh failed - clear auth and redirect to login
      clearStoredAuth();
      throw error;
    })
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Get valid access token, refreshing if necessary
 * This is the main function to use for API calls
 */
export async function getValidAccessToken(): Promise<string> {
  const { tokens } = getStoredAuth();

  // No tokens stored - user is not logged in
  if (!tokens) {
    return '';
  }

  // If token is expired or about to expire, refresh it
  if (isTokenExpiringSoon(tokens)) {
    try {
      const newTokens = await refreshAccessToken();
      return newTokens?.accessToken || '';
    } catch {
      // Refresh failed, redirect to login
      clearStoredAuth();
      window.location.href = '/login';
      return '';
    }
  }

  return tokens.accessToken;
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessToken();
  return token.length > 0;
}

/**
 * Sign in - use login() instead
 * @deprecated Use login() instead
 */
export async function signIn(): Promise<void> {
  throw new Error('Use login() instead of signIn()');
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  clearStoredAuth();
  window.location.href = '/login';
}

/**
 * Handle authorization callback - not needed for REST API auth
 * @deprecated Only used for OIDC flow
 */
export async function handleSigninCallback(): Promise<void> {
  // No-op for REST API auth
}

// ============================================================================
// Password Reset
// ============================================================================

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

/**
 * Request password reset email
 */
export async function forgotPassword(data: ForgotPasswordRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to send reset email' }));
    throw new AuthError(error.message || 'Failed to send reset email', response.status);
  }
}

/**
 * Reset password with token
 */
export async function resetPassword(data: ResetPasswordRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to reset password' }));
    throw new AuthError(error.message || 'Failed to reset password', response.status);
  }
}

/**
 * @deprecated Use storeAuth instead
 */
export function LubanCadAuthClient(_getToken: () => string | null) {
  return {
    getAccessToken: async () => {
      const token = _getToken();
      if (!token) throw new Error('Not authenticated');
      return token;
    },
    signIn: async () => { /* no-op */ },
    signOut: async () => { /* no-op */ },
  };
}
