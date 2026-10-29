// src/routes/SignUpRoute.tsx
//
// M1 Task 4：注册页 /register（形态对齐 Onshape pub-02 采集）。
// 左表单列：logo + 标题/副标题 + 名/姓两行 + 邮箱 + 密码（强度条+眼睛切换）
// + 确认密码 + 同意条款 + 主提交 + 登录链接；右 hero：占位令牌面板（同 /login）。
//
// 语义钉死（brief）：
// - 校验：名/姓/邮箱/密码/确认密码必填、邮箱格式 EMAIL_PATTERN、
//   两次密码一致、条款必选；错误逐字段（useAuthForm）。
// - 强度条：旧 Register.tsx 0–4 规则移植——长度≥8、大小写混合、数字、
//   特殊字符各 +1，clamp 0..4；颜色走 iTwinUI 语义 token
//   （≤1 负向 / =2 警告 / ≥3 正向），data-testid="password-strength"。
// - 提交：AuthSession.register(email, password, firstName, lastName)
//   → 成功由 useAuthForm 的 navigateAfterSuccess 回跳（location.state.from
//   ?? '/documents'，终审 I5）；429 → auth.signUp.tooManyRequests
//   （seconds 插值）；其它 → message 透传（错误按形状解包，兼容裸对象）。

import React, { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox } from '@itwin/itwinui-react';
import { AuthFormField, AuthPageShell, useAuthForm } from '@modules/authentication';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { env } from '@config/env.js';
import './SignUpRoute.css';

/** 邮箱格式（与 /login 同规则）。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 表单值形状。用 type 而非 interface：useAuthForm 形参约束
 * Record<string, unknown>，interface 无隐式索引签名不满足约束（同 /login）。 */
type SignUpValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  terms: boolean;
};

/** 旧 Register.tsx 强度规则移植：长度≥8 / 大小写混合 / 数字 / 特殊字符
 * 各 +1，clamp 0..4（空串恒 0）。 */
function computeStrength(password: string): number {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  return Math.min(4, strength);
}

/** 强度语义色（iTwinUI 语义 token：负向/警告/正向，随主题切换）。 */
function strengthColor(strength: number): string {
  if (strength <= 1) return 'var(--iui-color-text-negative)';
  if (strength === 2) return 'var(--iui-color-text-warning)';
  return 'var(--iui-color-text-positive)';
}

const STRENGTH_LEVELS = [1, 2, 3, 4] as const;

/** 右列占位 hero：与 /login 同姿态（品牌文案 + 设计令牌面板，后续插真图）。 */
function SignUpHero(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="signup-hero">
      <div className="signup-hero__panel">
        <div className="signup-hero__brand">{t('auth.signUp.heroTitle')}</div>
        <div className="signup-hero__tagline">{t('auth.signUp.heroSubtitle')}</div>
        <div className="signup-hero__tokens">
          <div className="signup-hero__token-label">{t('auth.signUp.heroTokenReady')}</div>
          <div className="signup-hero__token">
            <span className="signup-hero__token-key">{t('auth.signUp.heroTokenHub')}</span>
            <span className="signup-hero__token-value">{env.hubUrl}</span>
          </div>
        </div>
        <div className="signup-hero__note">{t('auth.signUp.heroTokenNote')}</div>
      </div>
    </div>
  );
}

export function SignUpRoute(): React.JSX.Element {
  const { t } = useTranslation();

  const validate = useCallback((values: SignUpValues): Partial<Record<keyof SignUpValues, string>> => {
    const errors: Partial<Record<keyof SignUpValues, string>> = {};
    if (!values.firstName.trim()) errors.firstName = t('auth.signUp.firstNameRequired');
    if (!values.lastName.trim()) errors.lastName = t('auth.signUp.lastNameRequired');
    if (!values.email) errors.email = t('auth.signUp.emailRequired');
    else if (!EMAIL_PATTERN.test(values.email)) errors.email = t('auth.signUp.emailInvalid');
    if (!values.password) errors.password = t('auth.signUp.passwordRequired');
    if (!values.confirmPassword) errors.confirmPassword = t('auth.signUp.confirmPasswordRequired');
    else if (values.confirmPassword !== values.password) errors.confirmPassword = t('auth.signUp.mismatch');
    if (!values.terms) errors.terms = t('auth.signUp.termsRequired');
    return errors;
  }, [t]);

  const onSubmit = useCallback(async (values: SignUpValues) => {
    setFormError(null);
    try {
      await AuthSession.register(values.email, values.password, values.firstName, values.lastName);
    } catch (error) {
      const { status, retryAfterSeconds } = (error ?? {}) as { status?: number; retryAfterSeconds?: number };
      if (status === 429 && typeof retryAfterSeconds === 'number') {
        setFormError(t('auth.signUp.tooManyRequests', { seconds: retryAfterSeconds }));
      } else {
        setFormError(error instanceof Error ? error.message : String(error));
      }
      // 失败须让 hook 的成功回跳判定成立：横幅落盘后原样上抛，
      // useAuthForm.submit 内统一吞掉（防 unhandled rejection）。
      throw error;
    }
    // deps 不含 setFormError：它由下方 useAuthForm 返回，是 React 保证稳定的
    // useState setter（此处若在 deps 引用会命中 TDZ——声明在后）。
  }, [t]);

  const { values, errors, touched, submitting, formError, setFormError, setValue, submit } = useAuthForm<SignUpValues>({
    initialValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', terms: false },
    validate,
    onSubmit,
    navigateAfterSuccess: true,
  });

  const strength = useMemo(() => computeStrength(values.password), [values.password]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  return (
    <AuthPageShell hero={<SignUpHero />}>
      <div className="signup" data-testid="signup-route">
        <div className="signup__logo" aria-hidden="true">{t('common.app.name')}</div>
        <h1 className="signup__title">{t('auth.signUp.title')}</h1>
        <p className="signup__subtitle">{t('auth.signUp.subtitle')}</p>
        <form className="signup__form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="signup__error" role="alert">{formError}</div>
          )}
          <AuthFormField
            name="firstName"
            label={t('auth.signUp.firstNameLabel')}
            value={values.firstName}
            onChange={(v) => setValue('firstName', v)}
            error={touched.firstName ? errors.firstName : undefined}
            autoComplete="given-name"
          />
          <AuthFormField
            name="lastName"
            label={t('auth.signUp.lastNameLabel')}
            value={values.lastName}
            onChange={(v) => setValue('lastName', v)}
            error={touched.lastName ? errors.lastName : undefined}
            autoComplete="family-name"
          />
          <AuthFormField
            name="email"
            type="email"
            label={t('auth.signUp.emailLabel')}
            value={values.email}
            onChange={(v) => setValue('email', v)}
            error={touched.email ? errors.email : undefined}
            autoComplete="email"
          />
          <AuthFormField
            name="password"
            label={t('auth.signUp.passwordLabel')}
            value={values.password}
            onChange={(v) => setValue('password', v)}
            error={touched.password ? errors.password : undefined}
            showPasswordToggle
            autoComplete="new-password"
          />
          {values.password && (
            <div className="signup__strength" data-testid="password-strength">
              <div className="signup__strength-bar">
                {STRENGTH_LEVELS.map((level) => (
                  <span
                    key={level}
                    className="signup__strength-segment"
                    style={{ backgroundColor: strength >= level ? strengthColor(strength) : undefined }}
                  />
                ))}
              </div>
              <span className="signup__strength-text" style={{ color: strengthColor(strength) }}>
                {t(`auth.signUp.strength.${(['tooShort', 'weak', 'medium', 'strong', 'veryStrong'] as const)[strength]}`)}
              </span>
            </div>
          )}
          <AuthFormField
            name="confirmPassword"
            label={t('auth.signUp.confirmPasswordLabel')}
            value={values.confirmPassword}
            onChange={(v) => setValue('confirmPassword', v)}
            error={touched.confirmPassword ? errors.confirmPassword : undefined}
            showPasswordToggle
            autoComplete="new-password"
          />
          <div className="signup__terms">
            <Checkbox
              label={t('auth.signUp.termsLabel')}
              checked={values.terms}
              onChange={(e) => setValue('terms', e.target.checked)}
            />
            {touched.terms && errors.terms && (
              <div className="signup__terms-error">{errors.terms}</div>
            )}
          </div>
          <Button
            className="signup__submit"
            type="submit"
            styleType="high-visibility"
            disabled={submitting}
          >
            {submitting ? t('auth.signUp.submitting') : t('auth.signUp.submit')}
          </Button>
          <div className="signup__footer">
            {t('auth.signUp.haveAccount')}
            <Link className="signup__link" to="/login">{t('auth.signUp.signIn')}</Link>
          </div>
        </form>
      </div>
    </AuthPageShell>
  );
}
