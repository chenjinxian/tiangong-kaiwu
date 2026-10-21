// src/routes/ForgotPasswordRoute.tsx
//
// M1 Task 5：找回密码页 /forgot-password（形态对齐 Onshape pub-04 采集的单
// 字段形态）。左表单列：logo + 标题/副标题 + 邮箱 + 主提交 + 返回登录链接；
// 右 hero 同 /login 姿态（品牌文案 + 设计令牌面板，后续插真图）。
//
// 语义钉死（brief）：
// - 校验：邮箱格式 EMAIL_PATTERN、非空；错误逐字段（useAuthForm）。
// - 提交：AuthSession.forgotPassword(email) → 成功进入「已发送」态（替换
//   表单，含返回登录链接）；429 → auth.forgot.tooManyRequests（seconds 插值）；
//   其它 → message 透传。错误按形状解包（duck-type），兼容 ApiClientError
//   与测试注入的裸对象（非 Error 实例时取 message 字段，缺席回退通用文案）。

import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@itwin/itwinui-react';
import { AuthFormField, AuthPageShell, useAuthForm } from '@modules/authentication';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { env } from '@config/env.js';
import './ForgotPasswordRoute.css';

/** 邮箱格式（与 /login、/register 同规则）。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 表单值形状。用 type 而非 interface：useAuthForm 形参约束 Record<string, unknown>，
 * interface 无隐式索引签名不满足约束（同 /login）。 */
type ForgotPasswordValues = {
  email: string;
};

/** 右列占位 hero：与 /login 同姿态（品牌文案 + 设计令牌面板，后续插真图）。 */
function ForgotPasswordHero(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="forgot-hero">
      <div className="forgot-hero__panel">
        <div className="forgot-hero__brand">{t('auth.forgot.heroTitle')}</div>
        <div className="forgot-hero__tagline">{t('auth.forgot.heroSubtitle')}</div>
        <div className="forgot-hero__tokens">
          <div className="forgot-hero__token-label">{t('auth.forgot.heroTokenReady')}</div>
          <div className="forgot-hero__token">
            <span className="forgot-hero__token-key">{t('auth.forgot.heroTokenHub')}</span>
            <span className="forgot-hero__token-value">{env.hubUrl}</span>
          </div>
        </div>
        <div className="forgot-hero__note">{t('auth.forgot.heroTokenNote')}</div>
      </div>
    </div>
  );
}

export function ForgotPasswordRoute(): React.JSX.Element {
  const { t } = useTranslation();
  /** 提交期表单级错误（429 限流文案 / 后端 message 透传）。 */
  const [formError, setFormError] = useState<string | null>(null);
  /** 成功态：替换表单（brief：success state replaces the form）。 */
  const [sent, setSent] = useState(false);

  const validate = useCallback((values: ForgotPasswordValues): Partial<Record<keyof ForgotPasswordValues, string>> => {
    const errors: Partial<Record<keyof ForgotPasswordValues, string>> = {};
    if (!values.email) errors.email = t('auth.forgot.emailRequired');
    else if (!EMAIL_PATTERN.test(values.email)) errors.email = t('auth.forgot.emailInvalid');
    return errors;
  }, [t]);

  const onSubmit = useCallback(async (values: ForgotPasswordValues) => {
    setFormError(null);
    try {
      await AuthSession.forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      const { status, retryAfterSeconds } = (error ?? {}) as { status?: number; retryAfterSeconds?: number };
      if (status === 429 && typeof retryAfterSeconds === 'number') {
        setFormError(t('auth.forgot.tooManyRequests', { seconds: retryAfterSeconds }));
      } else {
        // 形状解包：ApiClientError 是 Error 走 message；测试注入裸对象取
        // message 字段；两者都缺席才回退通用文案。
        const rawMessage = (error as { message?: unknown } | null | undefined)?.message;
        setFormError(typeof rawMessage === 'string' && rawMessage ? rawMessage : t('auth.forgot.error'));
      }
    }
  }, [t]);

  const { values, errors, submitting, setValue, submit } = useAuthForm<ForgotPasswordValues>({
    initialValues: { email: '' },
    validate,
    onSubmit,
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit();
  };

  return (
    <AuthPageShell hero={<ForgotPasswordHero />}>
      <div className="forgot" data-testid="forgot-password-route">
        <div className="forgot__logo" aria-hidden="true">鲁班CAD</div>
        <h1 className="forgot__title">{t('auth.forgot.title')}</h1>
        <p className="forgot__subtitle">{t('auth.forgot.subtitle')}</p>
        {sent ? (
          <div className="forgot__success" role="status" data-testid="forgot-success">
            <div className="forgot__success-message">{t('auth.forgot.success')}</div>
            <Link className="forgot__link" to="/login">{t('auth.forgot.backToLogin')}</Link>
          </div>
        ) : (
          <form className="forgot__form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <div className="forgot__error" role="alert">{formError}</div>
            )}
            <AuthFormField
              name="email"
              type="email"
              label={t('auth.forgot.emailLabel')}
              value={values.email}
              onChange={(v) => setValue('email', v)}
              error={errors.email}
              autoComplete="email"
            />
            <Button
              className="forgot__submit"
              type="submit"
              styleType="high-visibility"
              disabled={submitting}
            >
              {submitting ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
            </Button>
            <div className="forgot__footer">
              <Link className="forgot__link" to="/login">{t('auth.forgot.backToLogin')}</Link>
            </div>
          </form>
        )}
      </div>
    </AuthPageShell>
  );
}
