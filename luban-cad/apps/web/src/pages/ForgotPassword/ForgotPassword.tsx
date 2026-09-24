/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../../../app/contexts/UserContext.js';
import { AuthPageSkeleton } from '../../../shared/components/skeletons/AuthPageSkeleton.js';
import {
  Button,
  LabeledInput,
  Alert,
  Text,
  ProgressRadial,
} from '@itwin/itwinui-react';
import { forgotPassword } from '../../../features/auth/services/auth/client.js';
import './ForgotPassword.css';

// eslint-disable-next-line @typescript-eslint/naming-convention
const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useUser();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isPageLoading, setIsPageLoading] = useState(true);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/itwins', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Page load animation
  useEffect(() => {
    const timer = setTimeout(() => setIsPageLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Email validation
  const validateEmail = useCallback((value: string): boolean => {
    if (!value) {
      setEmailError('请输入邮箱地址');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await forgotPassword({ email: email.trim() });
      setIsSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送失败，请重试';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPageLoading || isAuthLoading) {
    return <AuthPageSkeleton />;
  }

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
            <Text variant="title" as="h2" className="form-title">
              {isSuccess ? '邮件已发送' : '忘记密码'}
            </Text>
            <Text className="form-subtitle">
              {isSuccess
                ? '请查看您的邮箱，点击链接重置密码'
                : '输入您的邮箱地址，我们将发送重置密码的链接'}
            </Text>
          </div>

          {submitError && (
            <Alert type="negative" className="forgot-password-error-alert">
              {submitError}
            </Alert>
          )}

          {isSuccess ? (
            <div className="success-state">
              <div className="success-icon">✉</div>
              <Text className="success-message">
                重置密码链接已发送至 <strong>{email}</strong>
              </Text>
              <Text variant="small" className="success-hint">
                如果没有收到邮件，请检查垃圾邮件文件夹，或 5 分钟后重试
              </Text>
              <div className="success-actions">
                <Button
                  styleType="default"
                  onClick={() => {
                    setIsSuccess(false);
                    setEmail('');
                  }}
                >
                  使用其他邮箱
                </Button>
                <Link to="/login" className="back-to-login">
                  返回登录
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <LabeledInput
                id="email"
                label="电子邮箱"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={isSubmitting}
                autoComplete="email"
                required
                status={emailError ? 'negative' : undefined}
                message={emailError || undefined}
                className="forgot-password-input"
              />

              <Button
                styleType="high-visibility"
                type="submit"
                disabled={isSubmitting || !email.trim() || !!emailError}
                className="forgot-password-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <ProgressRadial size="small" indeterminate />
                    <span>发送中...</span>
                  </>
                ) : (
                  '发送重置链接'
                )}
              </Button>

              <div className="form-footer">
                <Text>
                  想起密码了？<Link to="/login">立即登录</Link>
                </Text>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
