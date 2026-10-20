/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 忘记密码页（RW4-P1-T3 Onshape IA 重做）：Surface 分屏 + AuthBrandSide + itwin-ui 表单件。
 * 行为保留：500ms 邮箱防抖校验/提交中禁用/成功态（sentTo 插值）。
 * 文案全走 auth 命名空间 i18n。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../../app/contexts/UserContext.js';
import { AuthPageSkeleton } from '../../../shared/components/skeletons/AuthPageSkeleton.js';
import { AuthBrandSide } from '../../../shared/components/auth/AuthBrandSide.js';
import { Alert, Button, LabeledInput, ProgressRadial, Surface, Text } from '@itwin/itwinui-react';
import { forgotPassword } from '../../../features/auth/services/auth/client.js';
import './ForgotPassword.css';

// eslint-disable-next-line @typescript-eslint/naming-convention
const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
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
      navigate('/documents', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Page load animation
  useEffect(() => {
    const timer = setTimeout(() => setIsPageLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Email validation
  const validateEmail = useCallback(
    (value: string): boolean => {
      if (!value) {
        setEmailError(t('forgotPassword.emailRequired'));
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        setEmailError(t('forgotPassword.emailInvalid'));
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
      const fallback = err instanceof Error && err.message ? err.message : t('forgotPassword.failed');
      setSubmitError(fallback);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isPageLoading || isAuthLoading) {
    return <AuthPageSkeleton />;
  }

  return (
    <div className="auth-page">
      {/* Left: Brand（三页共享品牌侧栏） */}
      <AuthBrandSide />

      {/* Right: Form（Surface 分屏骨架） */}
      <Surface className="auth-form-side">
        <div className="auth-form-container">
          <div className="auth-form-header">
            <Text variant="title" as="h2" className="auth-form-title">
              {isSuccess ? t('forgotPassword.titleSent') : t('forgotPassword.title')}
            </Text>
            <Text className="auth-form-subtitle">
              {isSuccess ? t('forgotPassword.subtitleSent') : t('forgotPassword.subtitle')}
            </Text>
          </div>

          {submitError && (
            <Alert type="negative" className="forgot-password-error-alert auth-error-alert">
              {submitError}
            </Alert>
          )}

          {isSuccess ? (
            <div className="success-state">
              <div className="success-icon">✉</div>
              <Text className="success-message">
                {t('forgotPassword.success.sentTo', { email })}
              </Text>
              <Text variant="small" className="success-hint">
                {t('forgotPassword.success.hint')}
              </Text>
              <div className="success-actions">
                <Button
                  styleType="default"
                  onClick={() => {
                    setIsSuccess(false);
                    setEmail('');
                  }}
                >
                  {t('forgotPassword.success.useAnother')}
                </Button>
                <Link to="/login" className="back-to-login">
                  {t('forgotPassword.success.backToLogin')}
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <LabeledInput
                id="email"
                label={t('forgotPassword.email')}
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
                    <span>{t('forgotPassword.submitting')}</span>
                  </>
                ) : (
                  t('forgotPassword.submit')
                )}
              </Button>

              <div className="auth-footer">
                <Text>
                  {t('forgotPassword.remembered')}
                  <Link to="/login">{t('forgotPassword.login')}</Link>
                </Text>
              </div>
            </form>
          )}
        </div>
      </Surface>
    </div>
  );
};

export default ForgotPassword;
