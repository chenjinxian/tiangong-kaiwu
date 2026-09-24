/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../../../app/contexts/UserContext.js';
import { AuthPageSkeleton } from '../../../shared/components/skeletons/AuthPageSkeleton.js';
import { EyeIcon, EyeOffIcon } from '../../../shared/components/icons/EyeIcons.js';
import { Button, IconButton, LabeledInput, Checkbox, Alert, Text, ProgressRadial } from '@itwin/itwinui-react';
import './Login.css';

const REMEMBER_ME_KEY = 'luban-cad-remember';

interface RememberMeData {
  email: string;
  timestamp: number;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading: isAuthLoading, error, clearError } = useUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [emailError, setEmailError] = useState('');
  const [isPageLoading, setIsPageLoading] = useState(true);

  // Check for saved credentials on mount
  useEffect(() => {
    const init = async () => {
      const savedRemember = localStorage.getItem(REMEMBER_ME_KEY);
      if (savedRemember) {
        try {
          const data: RememberMeData = JSON.parse(savedRemember);
          if (data.timestamp && Date.now() - data.timestamp < 30 * 24 * 60 * 60 * 1000) {
            setEmail(typeof data.email === 'string' ? data.email : '');
            setRememberMe(true);
          } else {
            localStorage.removeItem(REMEMBER_ME_KEY);
          }
        } catch {
          localStorage.removeItem(REMEMBER_ME_KEY);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      setIsPageLoading(false);
    };

    void init();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/itwins', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Clear errors when input changes
  useEffect(() => {
    if (error) clearError();
    if (emailError && !email) setEmailError('');
  }, [email, password, error, clearError, emailError]);

  // Email validation
  const validateEmail = useCallback((value: string): boolean => {
    if (!value) {
      setEmailError('');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError('请输入有效的邮箱地址');
      return false;
    }
    setEmailError('');
    return true;
  }, []);

  // Debounced email validation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (email) validateEmail(email);
    }, 500);
    return () => clearTimeout(timer);
  }, [email, validateEmail]);

  // Handle remember me
  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    if (checked && email) {
      localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({
        email,
        timestamp: Date.now(),
      }));
    } else if (!checked) {
      localStorage.removeItem(REMEMBER_ME_KEY);
    }
  };

  // Update remembered email when email changes
  useEffect(() => {
    if (rememberMe && email) {
      localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({
        email,
        timestamp: Date.now(),
      }));
    }
  }, [email, rememberMe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password) return;

    if (!validateEmail(email)) {
      return;
    }

    await login({ email, password, rememberMe });
  };

  // Show skeleton while loading
  if (isPageLoading) {
    return <AuthPageSkeleton />;
  }

  const isFormValid = email.trim() && password && !emailError;

  return (
    <div className="auth-page">
      {/* Left: Brand */}
      <div className="brand-side">
        <div className="brand-logo">CC</div>
        <Text variant="title" as="h1" className="brand-title">LubanCAD</Text>
        <Text className="brand-subtitle">基于 iTwin.js 的开源云端 CAD 平台</Text>
        <div className="brand-features">
          <div className="brand-feature">
            <span className="brand-feature-icon">✓</span>
            <Text>完全免费，开源透明</Text>
          </div>
          <div className="brand-feature">
            <span className="brand-feature-icon">⊕</span>
            <Text>云端实时协作</Text>
          </div>
          <div className="brand-feature">
            <span className="brand-feature-icon">◈</span>
            <Text>工业级 3D 渲染引擎</Text>
          </div>
          <div className="brand-feature">
            <span className="brand-feature-icon">⚙</span>
            <Text>专业 CAD 功能</Text>
          </div>
        </div>
      </div>

      {/* Right: Form */}
      <div className="form-side">
        <div className="form-container">
          <div className="form-header">
            <Text variant="title" as="h2" className="form-title">欢迎回来</Text>
            <Text className="form-subtitle">登录您的 LubanCAD 账户</Text>
          </div>

          {error && (
            <Alert type="negative" className="login-error-alert">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <LabeledInput
              id="email"
              label="电子邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              disabled={isAuthLoading}
              autoComplete="email"
              required
              status={emailError ? 'negative' : undefined}
              message={emailError || undefined}
              className="login-input"
            />

            <div className="password-wrapper">
              <LabeledInput
                id="password"
                label="密码"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入您的密码"
                disabled={isAuthLoading}
                autoComplete="current-password"
                required
                className="login-input"
              />
              <IconButton
                size="small"
                styleType="borderless"
                onClick={() => setShowPassword(!showPassword)}
                label={showPassword ? '隐藏密码' : '显示密码'}
                className="toggle-password"
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </IconButton>
            </div>

            <div className="form-options">
              <Checkbox
                label="记住我"
                checked={rememberMe}
                onChange={(e) => handleRememberMeChange(e.target.checked)}
                disabled={isAuthLoading}
              />
              <Link to="/forgot-password" className="form-forgot">
                忘记密码？
              </Link>
            </div>

            <Button
              styleType="high-visibility"
              type="submit"
              disabled={isAuthLoading || !isFormValid}
              className="login-submit-btn"
            >
              {isAuthLoading ? (
                <>
                  <ProgressRadial size="small" indeterminate />
                  <span>登录中...</span>
                </>
              ) : (
                '登录'
              )}
            </Button>
          </form>

          <div className="form-footer">
            <Text>还没有账户？ <Link to="/register">立即注册</Link></Text>
          </div>
        </div>
      </div>

      {/* Loading overlay for auth operations */}
      {isAuthLoading && (
        <div className="auth-loading-overlay" role="status" aria-label="登录中">
          <div className="auth-loading-spinner">
            <ProgressRadial size="large" indeterminate />
            <Text>正在登录...</Text>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
