/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * User entity
 */
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  plan: 'free' | 'professional' | 'enterprise';
  role: 'user' | 'admin';
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

/**
 * JWT payload
 */
export interface JwtPayload {
  sub: string;  // user id
  email: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Register data
 */
export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

/**
 * Auth response
 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Refresh token request
 */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * Password reset request
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Change password request
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/**
 * Login response (from imodelhub-services)
 * Matches the actual backend response format
 */
export interface LoginResponse {
  token: string;
  refreshToken: string;
  tokenExpires: number;
  user: {
    id: string | number;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    photo?: { path: string } | null;
  };
}

/**
 * Refresh token response
 */
export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
  tokenExpires?: number;
}
