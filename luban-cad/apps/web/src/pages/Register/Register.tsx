/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../../../app/contexts/UserContext.js';
import { AuthPageSkeleton } from '../../../shared/components/skeletons/AuthPageSkeleton.js';
import { CheckIcon, EyeIcon, EyeOffIcon } from '../../../shared/components/icons/EyeIcons.js';
import { Button, IconButton, LabeledInput, Checkbox, Alert, Text, ProgressRadial } from '@itwin/itwinui-react';
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
    if (isAuthenticated) navigate('/itwins');
  }, [isAuthenticated, navigate]);

  // Page loading simulation
  useEffect(() => {
    const timer = setTimeout(() => setIsPageLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Clear context errors when inputs change
  useEffect(() => {
    if (error) clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email, password, confirmPassword, clearError]);

  // Password strength calculation
  useEffect(() => {
    let strength = 0;
    const feedback: string[] = [];

    if (password.length >= 8) {
      strength++;
    } else if (password.length > 0) {
      feedback.push('至少8个字符');
    }

    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
      strength++;
    } else if (password.length > 0) {
      feedback.push('需包含大小写字母');
    }

    if (/\d/.test(password)) {
      strength++;
    } else if (password.length > 0) {
      feedback.push('需包含数字');
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      strength++;
    } else if (password.length > 0 && strength >= 2) {
      feedback.push('可添加特殊字符增强安全性');
    }

    setPasswordStrength(strength);
    setPasswordFeedback(feedback[0] || '');

    setFieldValidity(prev => ({
      ...prev,
      password: strength >= 2 && password.length >= 8,
    }));
  }, [password]);

  // Validate name
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!name) {
        setValidationErrors(prev => ({ ...prev, name: undefined }));
        setFieldValidity(prev => ({ ...prev, name: false }));
        return;
      }
      if (name.trim().length < 2) {
        setValidationErrors(prev => ({ ...prev, name: '姓名至少2个字符' }));
        setFieldValidity(prev => ({ ...prev, name: false }));
      } else {
        setValidationErrors(prev => ({ ...prev, name: undefined }));
        setFieldValidity(prev => ({ ...prev, name: true }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [name]);

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
        setValidationErrors(prev => ({ ...prev, email: '请输入有效的邮箱地址' }));
        setFieldValidity(prev => ({ ...prev, email: false }));
      } else {
        setValidationErrors(prev => ({ ...prev, email: undefined }));
        setFieldValidity(prev => ({ ...prev, email: true }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [email, validateEmail]);

  // Validate confirm password
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!confirmPassword) {
        setValidationErrors(prev => ({ ...prev, confirmPassword: undefined }));
        setFieldValidity(prev => ({ ...prev, confirmPassword: false }));
        return;
      }
      if (confirmPassword !== password) {
        setValidationErrors(prev => ({ ...prev, confirmPassword: '两次输入的密码不一致' }));
        setFieldValidity(prev => ({ ...prev, confirmPassword: false }));
      } else {
        setValidationErrors(prev => ({ ...prev, confirmPassword: undefined }));
        setFieldValidity(prev => ({ ...prev, confirmPassword: true }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [confirmPassword, password]);

  const getStrengthColor = () => {
    if (passwordStrength <= 1) return 'var(--color-error)';
    if (passwordStrength === 2) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  const getStrengthText = () => {
    if (passwordStrength === 0) return '太短';
    if (passwordStrength === 1) return '弱';
    if (passwordStrength === 2) return '中等';
    if (passwordStrength === 3) return '强';
    return '非常强';
  };

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    if (!name.trim()) {
      errors.name = '请输入姓名';
    } else if (name.trim().length < 2) {
      errors.name = '姓名至少2个字符';
    }

    if (!email.trim()) {
      errors.email = '请输入邮箱地址';
    } else if (!validateEmail(email)) {
      errors.email = '请输入有效的邮箱地址';
    }

    if (!password) {
      errors.password = '请输入密码';
    } else if (password.length < 8) {
      errors.password = '密码长度至少为8位';
    } else if (passwordStrength < 2) {
      errors.password = '密码强度不足';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = '两次输入的密码不一致';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreeToTerms) {
      setValidationErrors(prev => ({
        ...prev,
        terms: '请同意服务条款和隐私政策',
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
        navigate('/itwins');
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
        <div className="brand-side">
          <div className="brand-logo">CC</div>
          <Text variant="title" as="h1" className="brand-title">Open Cloud CAD</Text>
          <Text className="brand-subtitle">基于 iTwin.js 的开源云端 CAD 平台</Text>
        </div>
        <div className="form-side">
          <div className="form-container">
            <div className="success-state">
              <div className="success-icon">
                <CheckIcon size={48} />
              </div>
              <Text variant="title" as="h2" className="success-title">注册成功！</Text>
              <Text className="success-message">欢迎加入 Open Cloud CAD</Text>
              <Text className="success-redirect">正在跳转到项目列表...</Text>
            </div>
          </div>
        </div>
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
      {/* Left: Brand */}
      <div className="brand-side">
        <div className="brand-logo">CC</div>
        <Text variant="title" as="h1" className="brand-title">Open Cloud CAD</Text>
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
          <div className="brand-feature">
            <span className="brand-feature-icon">⊞</span>
            <Text>多格式 CAD 支持</Text>
          </div>
          <div className="brand-feature">
            <span className="brand-feature-icon">🔒</span>
            <Text>企业级数据安全</Text>
          </div>
        </div>
      </div>

      {/* Right: Form */}
      <div className="form-side">
        <div className="form-container">
          <div className="form-header">
            <Text variant="title" as="h2" className="form-title">创建账户</Text>
            <Text className="form-subtitle">开始您的云端 CAD 之旅</Text>
          </div>

          {error && (
            <Alert type="negative" className="register-error-alert">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-with-indicator">
              <LabeledInput
                id="name"
                label="姓名"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入您的姓名"
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
                label="电子邮箱"
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
              <div className="password-wrapper">
                <LabeledInput
                  id="password"
                  label="密码"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少8位，含大小写字母和数字"
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
                  label={showPassword ? '隐藏密码' : '显示密码'}
                  className="toggle-password"
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
                  提示: {passwordFeedback}
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
                label="确认密码"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
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
                label={
                  <span>
                    我同意{' '}
                    <Link to="/terms" target="_blank" rel="noopener noreferrer">
                      服务条款
                    </Link>
                    {' '}和{' '}
                    <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                      隐私政策
                    </Link>
                  </span>
                }
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
                  <span>创建账户中...</span>
                </>
              ) : (
                '创建账户'
              )}
            </Button>
          </form>

          <div className="form-footer">
            <Text>已有账户？ <Link to="/login">立即登录</Link></Text>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="auth-loading-overlay" role="status" aria-label="创建账户中">
          <div className="auth-loading-spinner">
            <ProgressRadial size="large" indeterminate />
            <Text>正在创建账户...</Text>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;
