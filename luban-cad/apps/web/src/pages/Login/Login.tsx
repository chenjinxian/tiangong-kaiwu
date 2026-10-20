/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 登录页（RW4-P1-T2 Onshape IA 重做）：Surface 分屏 + AuthBrandSide 品牌栏 + itwin-ui 表单件。
 * 行为保留：记住我（luban-cad-remember）/500ms 邮箱防抖校验/300ms 页面载入。
 * 文案全走 auth 命名空间 i18n；e2e 契约锚点 = heading 欢迎回来/getByLabel 电子邮箱/密码/
 * button 登录/link 立即注册/.login-error-alert。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../../app/contexts/UserContext.js';
import { AuthPageSkeleton } from '../../../shared/components/skeletons/AuthPageSkeleton.js';
import { AuthBrandSide } from '../../../shared/components/auth/AuthBrandSide.js';
import { EyeIcon, EyeOffIcon } from '../../../shared/components/icons/EyeIcons.js';
import {
  Alert,
  Button,
  Checkbox,
  IconButton,
  LabeledInput,
  ProgressRadial,
  Surface,
  Text,
} from '@itwin/itwinui-react';
import './Login.css';

const REMEMBER_ME_KEY = 'luban-cad-remember';

interface RememberMeData {
  email: string;
  timestamp: number;
}

/** Google OAuth 客户端 ID 探测（构建期经 VITE_GOOGLE_CLIENT_ID 注入；空 = 不渲染 SSO 入口）。
 * 组件体内读取（每次渲染取现值）——模块级常量会在测试 vi.stubEnv 前固化，env 探测失真。 */
const googleClientId = (): string => import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** 官方 Google "G" 四色标（品牌 SVG 资产，内联避免运行时拉取与额外依赖） */
// eslint-disable-next-line @typescript-eslint/naming-convention
const GoogleGIcon: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 18 18" width="18" height="18" focusable="false">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
    />
  </svg>
);

// eslint-disable-next-line @typescript-eslint/naming-convention
const Login: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
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
      navigate('/documents', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Clear errors when input changes
  // 注意：依赖数组不可包含 error 本身 —— 否则错误一设置本 effect 立即触发 clearError()，
  // 登录失败告警条闪现一帧即消失（用户/测试均不可见）。仅由输入变化驱动清除。
  useEffect(() => {
    if (email || password) {
      clearError();
    }
    if (emailError && !email) setEmailError('');
  }, [email, password, clearError, emailError]);

  // Email validation
  const validateEmail = useCallback(
    (value: string): boolean => {
      if (!value) {
        setEmailError('');
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        setEmailError(t('login.emailInvalid'));
        return false;
      }
      setEmailError('');
      return true;
    },
    [t],
  );

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

  const handleGoogleSso = useCallback(() => {
    // TODO(RW4 后续波): OIDC 授权码回调流——跳 Google consent → 后端 /auth/google 交换 JWT
    // （后端 GOOGLE_CLIENT_ID/SECRET 已配置；前端待接 oauth 客户端后启用此入口）。
  }, []);

  // Show skeleton while loading
  if (isPageLoading) {
    return <AuthPageSkeleton />;
  }

  const isFormValid = email.trim() && password && !emailError;

  return (
    <div className="auth-page">
      {/* Left: Brand（三页共享品牌侧栏） */}
      <AuthBrandSide />

      {/* Right: Form（Surface 分屏骨架） */}
      <Surface className="auth-form-side">
        <div className="auth-form-container">
          <div className="auth-form-header">
            <Text variant="title" as="h2" className="auth-form-title">{t('login.title')}</Text>
            <Text className="auth-form-subtitle">{t('login.subtitle')}</Text>
          </div>

          {error && (
            <Alert type="negative" className="login-error-alert auth-error-alert">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <LabeledInput
              id="email"
              label={t('login.email')}
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

            <div className="auth-password-wrapper">
              <LabeledInput
                id="password"
                label={t('login.password')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                disabled={isAuthLoading}
                autoComplete="current-password"
                required
                className="login-input"
              />
              <IconButton
                size="small"
                styleType="borderless"
                onClick={() => setShowPassword(!showPassword)}
                label={showPassword ? t('fields.hidePassword') : t('fields.showPassword')}
                className="auth-toggle-password"
                tabIndex={-1}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </IconButton>
            </div>

            <div className="auth-options-row">
              <Checkbox
                label={t('login.rememberMe')}
                checked={rememberMe}
                onChange={(e) => handleRememberMeChange(e.target.checked)}
                disabled={isAuthLoading}
              />
              <Link to="/forgot-password" className="auth-forgot-link">
                {t('login.forgotPassword')}
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
                  <span>{t('login.submitting')}</span>
                </>
              ) : (
                t('login.submit')
              )}
            </Button>

            {/* Google SSO 按钮位：VITE_GOOGLE_CLIENT_ID 非空才渲染（env 探测式入口） */}
            {googleClientId() && (
              <>
                <div className="auth-sso-divider" role="separator" aria-label={t('sso.or')}>
                  <span className="auth-sso-divider-line" aria-hidden="true" />
                  <Text variant="small" className="auth-sso-divider-text">{t('sso.or')}</Text>
                  <span className="auth-sso-divider-line" aria-hidden="true" />
                </div>
                <Button
                  styleType="default"
                  type="button"
                  className="auth-google-btn"
                  onClick={handleGoogleSso}
                  startIcon={<GoogleGIcon />}
                >
                  {t('sso.googleContinue')}
                </Button>
              </>
            )}
          </form>

          <div className="auth-footer">
            <Text>{t('login.noAccount')} <Link to="/register">{t('login.register')}</Link></Text>
          </div>
        </div>
      </Surface>

      {/* Loading overlay for auth operations */}
      {isAuthLoading && (
        <div className="auth-loading-overlay" role="status" aria-label={t('login.loadingAria')}>
          <div className="auth-loading-spinner">
            <ProgressRadial size="large" indeterminate />
            <Text>{t('login.loading')}</Text>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
