/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  type User,
  type LoginCredentials,
  type AuthResponse,
  type RegisterData,
  type AuthTokens,
  AuthError,
  getStoredAuth,
  login as loginApi,
  register as registerApi,
  logout as logoutApi,
} from '../../features/auth/services/auth/client.js';
import { getQueryClient } from '../providers/QueryProvider.js';

// User context only handles authentication state
// Favorites and recents moved to React Query hooks

/**
 * User context state interface
 * Note: Favorites and recents are managed by React Query hooks
 */
interface UserContextState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * User context actions interface
 * Note: Favorites and recents are managed by React Query hooks
 */
interface UserContextActions {
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  register: (data: RegisterData) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  clearError: () => void;
  hasPermission: (permission: string) => boolean;
  isPaidUser: () => boolean;
  // Token access for API client
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  // User profile management
  updateUser: (updates: Partial<User>) => void;
}

type UserContextType = UserContextState & UserContextActions;

// eslint-disable-next-line @typescript-eslint/naming-convention
const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * User provider props
 */
interface UserProviderProps {
  children: React.ReactNode;
}

/**
 * User context provider
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const initializedRef = useRef(false);
  const tokensRef = useRef(tokens);

  // Keep tokensRef in sync
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  // Initialize auth state from storage on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const { user: storedUser, tokens: storedTokens } = getStoredAuth();
    if (storedUser && storedTokens) {
      setUser(storedUser);
      setTokens(storedTokens);
    }
    setIsLoading(false);
  }, []);

  /**
   * Get access token
   */
  const getAccessToken = useCallback(() => {
    return tokens?.accessToken || null;
  }, [tokens]);

  /**
   * Get refresh token
   */
  const getRefreshToken = useCallback(() => {
    return tokens?.refreshToken || null;
  }, [tokens]);

  /**
   * Login handler
   */
  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await loginApi(credentials);
      setUser(response.user);
      setTokens(response.tokens);

      // Clear all queries on login to ensure fresh data for the new user
      // This prevents showing previous user's cached data
      const queryClient = getQueryClient();
      void queryClient.clear();

      return response;
    } catch (err) {
      // Map HTTP status codes and network errors to user-friendly messages
      let message: string;
      if (err instanceof AuthError) {
        switch (err.status) {
          case 401:
            message = '邮箱或密码错误';
            break;
          case 403:
            message = '账户已被禁用';
            break;
          case 404:
            message = '该邮箱未注册，请先注册账户';
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            message = '服务器暂时不可用，请稍后重试';
            break;
          default:
            message = '登录失败，请稍后重试';
        }
      } else if (err instanceof Error && err.message.includes('Network Error')) {
        message = '网络连接失败，请检查网络设置';
      } else {
        message = err instanceof Error ? err.message : '登录失败';
      }

      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Register handler
   */
  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await registerApi(data);
      setUser(response.user);
      setTokens(response.tokens);
      return response;
    } catch (err) {
      // Map technical error messages to user-friendly messages
      let message = err instanceof Error ? err.message : '注册失败';

      // Handle specific error patterns
      if (message.includes('emailAlreadyExists') || message.includes('email: 该邮箱已被注册')) {
        message = '该邮箱已被注册，请使用其他邮箱或直接登录';
      } else if (message.includes('email:')) {
        // Extract field-specific error
        const match = message.match(/email:\s*(.+)/);
        if (match) message = match[1];
      } else if (message === 'An error occurred') {
        message = '注册失败，请检查输入信息是否正确';
      } else if (message.includes('Network Error')) {
        message = '网络连接失败，请检查网络设置';
      }

      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Logout handler
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await logoutApi(tokensRef.current?.accessToken || null, tokensRef.current?.refreshToken || null);
      setUser(null);
      setTokens(null);

      // Clear all queries on logout to prevent data leakage between users
      const queryClient = getQueryClient();
      void queryClient.clear();
    } catch (err) {
      const message = err instanceof Error ? err.message : '退出失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Check if user has specific permission
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;

    const permissions: Record<string, string[]> = {
      free: ['view', 'create_document', 'edit', 'export_basic'],
      professional: ['view', 'create_document', 'edit', 'export_basic', 'export_advanced', 'private_document', 'version_control'],
      enterprise: ['view', 'create_document', 'edit', 'export_basic', 'export_advanced', 'private_document', 'version_control', 'admin', 'analytics'],
    };

    return permissions[user.plan]?.includes(permission) ?? false;
  }, [user]);

  /**
   * Check if user is on paid plan
   */
  const isPaidUser = useCallback((): boolean => {
    return user?.plan === 'professional' || user?.plan === 'enterprise';
  }, [user]);

  /**
   * Update user profile information
   */
  const updateUser = useCallback((updates: Partial<User>): void => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      // Also update in sessionStorage to persist across refreshes
      const USER_STORAGE_KEY = 'luban_cad_user';
      sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const value: UserContextType = {
    user,
    isAuthenticated: !!user && !!tokens,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError,
    hasPermission,
    isPaidUser,
    getAccessToken,
    getRefreshToken,
    updateUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
};

/**
 * Hook to use user context
 */
export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
