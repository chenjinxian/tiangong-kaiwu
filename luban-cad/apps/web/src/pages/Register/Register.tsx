/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 注册页（RW4-P1-T3 Onshape IA 重做）：Surface 分屏 + AuthBrandSide（六特性行）+ itwin-ui 表单件。
 * 行为保留：500ms 防抖字段校验/密码强度条/字段绿勾/条款勾选必选/注册成功过渡态。
 * 文案全走 auth 命名空间 i18n；/terms /privacy 死链移除——同意句改次要文本。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../../app/contexts/UserContext.js';
import { AuthPageSkeleton } from '../../../shared/components/skeletons/AuthPageSkeleton.js';
import { AuthBrandSide } from '../../../shared/components/auth/AuthBrandSide.js';
import { CheckIcon, EyeIcon, EyeOffIcon } from '../../../shared/components/icons/EyeIcons.js';
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
import './Register.css';

interface ValidationErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
}

interface FieldValidity {
  name: boolean;
  email: boolean;
  password: boolean;
  confirmPassword: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Register: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const { register, isAuthenticated, isLoading, error, clearError } = useUser();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [fieldValidity, setFieldValidity] = useState<FieldValidity>({
    name: false,
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);

  // Password strength calculation
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordFeedback, setPasswordFeedback] = useState('');

  useEffect(() => {
    if (isAuthenticated) navigate('/documents');
  }, [isAuthenticated, navigate]);

  // Page loading simulation
  useEffect(() => {
    const timer = setTimeout(() => setIsPageLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Clear context errors when inputs change（error 有意不进依赖——见 Login 同名守卫注释）
  useEffect(() => {
    if (error) clearError();
  }, [name, email, password, confirmPassword, clearError]);

  // Password strength calculation
  useEffect(() => {
    let strength = 0;
    const feedbackKeys: string[] = [];

    if (password.length >= 8) {
      strength++;
    } else if (password.length > 0) {
      feedbackKeys.push('length');
    }

    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
      strength++;
    } else if (password.length > 0) {
      feedbackKeys.push('mixedCase');
    }

    if (/\d/.test(password)) {
      strength++;
    } else if (password.length > 0) {
      feedbackKeys.push('digit');
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      strength++;
    } else if (password.length > 0 && strength >= 2) {
      feedbackKeys.push('special');
    }

    setPasswordStrength(strength);
    setPasswordFeedback(feedbackKeys[0] ? t(`register.strengthHint.${feedbackKeys[0]}`) : '');

    setFieldValidity(prev => ({
      ...prev,
      password: strength >= 2 && password.length >= 8,
    }));
  }, [password, t]);

  // Validate name
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!name) {
        setValidationErrors(prev => ({ ...prev, name: undefined }));
        setFieldValidity(prev => ({ ...prev, name: false }));
        return;
      }
      if (name.trim().length < 2) {
        setValidationErrors(prev => ({ ...prev, name: t('register.validation.nameTooShort') }));
        setFieldValidity(prev => ({ ...prev, name: false }));
      } else {
        setValidationErrors(prev => ({ ...prev, name: undefined }));
        setFieldValidity(prev => ({ ...prev, name: true }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [name, t]);

  // Validate email
  const validateEmail = useCallback((value: string): boolean => {
    if (!value) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!email) {
        setValidationErrors(prev => ({ ...prev, email: undefined }));
        setFieldValidity(prev => ({ ...prev, email: false }));
        return;
      }
      if (!validateEmail(email)) {
        setValidationErrors(prev => ({ ...prev, email: t('register.validation.emailInvalid') }));
        setFieldValidity(prev => ({ ...prev, email: false }));
      } else {
        setValidationErrors(prev => ({ ...prev, email: undefined }));
        setFieldValidity(prev => ({ ...prev, email: true }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [email, validateEmail, t]);

  // Validate confirm password
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!confirmPassword) {
        setValidationErrors(prev => ({ ...prev, confirmPassword: undefined }));
        setFieldValidity(prev => ({ ...prev, confirmPassword: false }));
        return;
      }
      if (confirmPassword !== password) {
        setValidationErrors(prev => ({ ...prev, confirmPassword: t('register.validation.mismatch') }));
        setFieldValidity(prev => ({ ...prev, confirmPassword: false }));
      } else {
        setValidationErrors(prev => ({ ...prev, confirmPassword: undefined }));
        setFieldValidity(prev => ({ ...prev, confirmPassword: true }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [confirmPassword, password, t]);

  // 强度条语义色——状态语义 token（负向/警告/正向），随主题自动切换
  const getStrengthColor = (): string => {
    if (passwordStrength <= 1) return 'var(--iui-color-text-negative)';
    if (passwordStrength === 2) return 'var(--iui-color-text-warning)';
    return 'var(--iui-color-text-positive)';
  };

  const getStrengthText = (): string => {
    if (passwordStrength === 0) return t('register.strength.tooShort');
    if (passwordStrength === 1) return t('register.strength.weak');
    if (passwordStrength === 2) return t('register.strength.medium');
    if (passwordStrength === 3) return t('register.strength.strong');
    return t('register.strength.veryStrong');
  };

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!name.trim()) {
      errors.name = t('register.validation.nameRequired');
    } else if (name.trim().length < 2) {
      errors.name = t('register.validation.nameTooShort');
    }

    if (!email.trim()) {
      errors.email = t('register.validation.emailRequired');
    } else if (!validateEmail(email)) {
      errors.email = t('register.validation.emailInvalid');
    }

    if (!password) {
      errors.password = t('register.validation.passwordRequired');
    } else if (password.length < 8) {
      errors.password = t('register.validation.passwordTooShort');
    } else if (passwordStrength < 2) {
      errors.password = t('register.validation.passwordWeak');
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = t('register.validation.mismatch');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreeToTerms) {
      setValidationErrors(prev => ({
        ...prev,
        terms: t('register.termsRequired'),
      }));
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      await register({ name, email, password });
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/documents');
      }, 2000);
    } catch {
      // Error handled by context
    }
  };

  // Show skeleton while loading
  if (isPageLoading) {
    return <AuthPageSkeleton />;
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="auth-page">
        <AuthBrandSide features={[]} />
        <Surface className="auth-form-side">
          <div className="auth-form-container">
            <div className="success-state">
              <div className="success-icon">
                <CheckIcon size={48} />
              </div>
              <Text variant="title" as="h2" className="success-title">{t('register.success.title')}</Text>
              <Text className="success-message">{t('register.success.message')}</Text>
              <Text className="success-redirect">{t('register.success.redirect')}</Text>
            </div>
          </div>
        </Surface>
      </div>
    );
  }

  const isFormValid =
    fieldValidity.name &&
    fieldValidity.email &&
    fieldValidity.password &&
    fieldValidity.confirmPassword &&
    agreeToTerms;

  return (
    <div className="auth-page">
      {/* Left: Brand（Register 六特性行） */}
      <AuthBrandSide
        features={[
          { icon: '✓', label: t('brand.features.free') },
          { icon: '⊕', label: t('brand.features.collab') },
          { icon: '◈', label: t('brand.features.rendering') },
          { icon: '⚙', label: t('brand.features.cad') },
          { icon: '⊞', label: t('brand.features.formats') },
          { icon: '🔒', label: t('brand.features.security') },
        ]}
      />

      {/* Right: Form（Surface 分屏骨架） */}
      <Surface className="auth-form-side">
        <div className="auth-form-container">
          <div className="auth-form-header">
            <Text variant="title" as="h2" className="auth-form-title">{t('register.title')}</Text>
            <Text className="auth-form-subtitle">{t('register.subtitle')}</Text>
          </div>

          {error && (
            <Alert type="negative" className="register-error-alert auth-error-alert">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-with-indicator">
              <LabeledInput
                id="name"
                label={t('register.name')}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('register.namePlaceholder')}
                disabled={isLoading}
                autoComplete="name"
                status={validationErrors.name ? 'negative' : undefined}
                message={validationErrors.name || undefined}
                className="register-input"
              />
              {fieldValidity.name && !validationErrors.name && (
                <span className="valid-indicator">
                  <CheckIcon size={16} />
                </span>
              )}
            </div>

            <div className="input-with-indicator">
              <LabeledInput
                id="email"
                label={t('register.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={isLoading}
                autoComplete="email"
                status={validationErrors.email ? 'negative' : undefined}
                message={validationErrors.email || undefined}
                className="register-input"
              />
              {fieldValidity.email && !validationErrors.email && (
                <span className="valid-indicator">
                  <CheckIcon size={16} />
                </span>
              )}
            </div>

            <div className="input-with-indicator">
              <div className="auth-password-wrapper">
                <LabeledInput
                  id="password"
                  label={t('register.password')}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('register.passwordPlaceholder')}
                  disabled={isLoading}
                  autoComplete="new-password"
                  status={validationErrors.password ? 'negative' : undefined}
                  message={validationErrors.password || undefined}
                  className="register-input"
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
              {password && (
                <div className="password-strength">
                  <div className="strength-bar">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className="strength-segment"
                        style={{ backgroundColor: passwordStrength >= level ? getStrengthColor() : undefined }}
                      />
                    ))}
                  </div>
                  <span className="strength-text" style={{ color: getStrengthColor() }}>
                    {getStrengthText()}
                  </span>
                </div>
              )}
              {passwordFeedback && password && !validationErrors.password && (
                <Text variant="small" className="field-help">
                  {t('register.strengthHintPrefix', { hint: passwordFeedback })}
                </Text>
              )}
              {fieldValidity.password && !validationErrors.password && (
                <span className="valid-indicator valid-indicator-password">
                  <CheckIcon size={16} />
                </span>
              )}
            </div>

            <div className="input-with-indicator">
              <LabeledInput
                id="confirmPassword"
                label={t('register.confirmPassword')}
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('register.confirmPasswordPlaceholder')}
                disabled={isLoading}
                autoComplete="new-password"
                status={validationErrors.confirmPassword ? 'negative' : undefined}
                message={validationErrors.confirmPassword || undefined}
                className="register-input"
              />
              {fieldValidity.confirmPassword && !validationErrors.confirmPassword && (
                <span className="valid-indicator">
                  <CheckIcon size={16} />
                </span>
              )}
            </div>

            <div className={`register-terms ${validationErrors.terms ? 'has-error' : ''}`}>
              <Checkbox
                label={t('register.termsConsent')}
                checked={agreeToTerms}
                onChange={(e) => {
                  setAgreeToTerms(e.target.checked);
                  if (e.target.checked) {
                    setValidationErrors(prev => ({ ...prev, terms: undefined }));
                  }
                }}
                disabled={isLoading}
              />
              {validationErrors.terms && (
                <Text variant="small" className="field-error">{validationErrors.terms}</Text>
              )}
            </div>

            <Button
              styleType="high-visibility"
              type="submit"
              disabled={isLoading || !isFormValid}
              className="register-submit-btn"
            >
              {isLoading ? (
                <>
                  <ProgressRadial size="small" indeterminate />
                  <span>{t('register.submitting')}</span>
                </>
              ) : (
                t('register.submit')
              )}
            </Button>
          </form>

          <div className="auth-footer">
            <Text>{t('register.haveAccount')} <Link to="/login">{t('register.login')}</Link></Text>
          </div>
        </div>
      </Surface>

      {/* Loading overlay */}
      {isLoading && (
        <div className="auth-loading-overlay" role="status" aria-label={t('register.loadingAria')}>
          <div className="auth-loading-spinner">
            <ProgressRadial size="large" indeterminate />
            <Text>{t('register.loading')}</Text>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;
