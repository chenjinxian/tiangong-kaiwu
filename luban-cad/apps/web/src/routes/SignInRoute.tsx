// src/routes/SignInRoute.tsx
//
// M1 Task 3：登录页 /login（形态对齐 Onshape pub-01 采集）。
// 左表单列：logo + 标题/副标题 + 邮箱 + 密码（可见切换）+ 记住我 +
// 忘记密码链接 + 主提交 + 注册链接；右 hero：占位令牌面板（后续插真图）。
//
// 语义钉死（brief）：
// - 校验：邮箱格式 EMAIL_PATTERN、密码非空；错误逐字段（useAuthForm）。
// - 提交：AuthSession.login(email, password) → 成功由 useAuthForm 的
//   navigateAfterSuccess 回跳（location.state.from ?? '/documents'，终审 I5）；
//   429 → 错误区 auth.signIn.tooManyRequests（seconds 插值）；
//   其它 → message 透传。错误按形状解包（duck-type），兼容 ApiClientError
//   与测试注入的裸对象。

import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox } from '@itwin/itwinui-react';
import { AuthFormField, AuthPageShell, useAuthForm } from '@modules/authentication';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { env } from '@config/env.js';
import './SignInRoute.css';

/** 邮箱格式（brief 钉死）。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 表单值形状。用 type 而非 interface：useAuthForm 形参约束 Record<string, unknown>，
 * interface 无隐式索引签名不满足约束（tsc 实测）。 */
type SignInValues = {
  email: string;
  password: string;
  rememberMe: boolean;
};

/** 右列占位 hero：品牌文案 + 设计令牌面板（hub 端点等运行时令牌展示位）。 */
function SignInHero(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="signin-hero">
      <div className="signin-hero__panel">
        <div className="signin-hero__brand">{t('auth.signIn.heroTitle')}</div>
        <div className="signin-hero__tagline">{t('auth.signIn.heroSubtitle')}</div>
        <div className="signin-hero__tokens">
          <div className="signin-hero__token-label">{t('auth.signIn.heroTokenReady')}</div>
          <div className="signin-hero__token">
            <span className="signin-hero__token-key">{t('auth.signIn.heroTokenHub')}</span>
            <span className="signin-hero__token-value">{env.hubUrl}</span>
          </div>
        </div>
        <div className="signin-hero__note">{t('auth.signIn.heroTokenNote')}</div>
      </div>
    </div>
  );
}

export function SignInRoute(): React.JSX.Element {
  const { t } = useTranslation();

  const validate = useCallback((values: SignInValues): Partial<Record<keyof SignInValues, string>> => {
    const errors: Partial<Record<keyof SignInValues, string>> = {};
    if (!values.email) errors.email = t('auth.signIn.emailRequired');
    else if (!EMAIL_PATTERN.test(values.email)) errors.email = t('auth.signIn.emailInvalid');
    if (!values.password) errors.password = t('auth.signIn.passwordRequired');
    return errors;
  }, [t]);

  const onSubmit = useCallback(async (values: SignInValues) => {
    setFormError(null);
    try {
      await AuthSession.login(values.email, values.password);
    } catch (error) {
      const { status, retryAfterSeconds } = (error ?? {}) as { status?: number; retryAfterSeconds?: number };
      if (status === 429 && typeof retryAfterSeconds === 'number') {
        setFormError(t('auth.signIn.tooManyRequests', { seconds: retryAfterSeconds }));
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

  const { values, errors, touched, submitting, formError, setFormError, setValue, submit } = useAuthForm<SignInValues>({
    initialValues: { email: '', password: '', rememberMe: false },
    validate,
    onSubmit,
    navigateAfterSuccess: true,
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  return (
    <AuthPageShell hero={<SignInHero />}>
      <div className="signin" data-testid="signin-route">
        <div className="signin__logo" aria-hidden="true">{t('common.app.name')}</div>
        <h1 className="signin__title">{t('auth.signIn.title')}</h1>
        <p className="signin__subtitle">{t('auth.signIn.subtitle')}</p>
        <form className="signin__form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="signin__error" role="alert">{formError}</div>
          )}
          <AuthFormField
            name="email"
            type="email"
            label={t('auth.signIn.emailLabel')}
            value={values.email}
            onChange={(v) => setValue('email', v)}
            error={touched.email ? errors.email : undefined}
            autoComplete="email"
          />
          <AuthFormField
            name="password"
            label={t('auth.signIn.passwordLabel')}
            value={values.password}
            onChange={(v) => setValue('password', v)}
            error={touched.password ? errors.password : undefined}
            showPasswordToggle
            autoComplete="current-password"
          />
          <div className="signin__row">
            <Checkbox
              label={t('auth.signIn.rememberMe')}
              checked={values.rememberMe}
              onChange={(e) => setValue('rememberMe', e.target.checked)}
            />
            <Link className="signin__link" to="/forgot-password">{t('auth.signIn.forgotPassword')}</Link>
          </div>
          <Button
            className="signin__submit"
            type="submit"
            styleType="high-visibility"
            disabled={submitting}
          >
            {submitting ? t('auth.signIn.submitting') : t('auth.signIn.submit')}
          </Button>
          <div className="signin__footer">
            {t('auth.signIn.noAccount')}
            <Link className="signin__link" to="/register">{t('auth.signIn.register')}</Link>
          </div>
        </form>
      </div>
    </AuthPageShell>
  );
}
