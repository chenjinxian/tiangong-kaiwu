// src/routes/ConfirmEmailRoute.tsx
//
// G1 B1.1 邮箱确认落地页：Hub 注册/换邮箱邮件链接到
// `/confirm-email?hash=<jwt>`（换邮箱为 `/confirm-new-email`）。此前路由缺失，
// 新用户点邮件链接会落到 React Router 404，账号永远 inactive。
//
// - hash 只从 query 读取，不写日志/本地存储；确认成功后 replaceState 清掉
//   ？hash=...，避免地址栏与后续导航继续携带确认令牌。
// - 成功 = Hub 204；422 过期/非法、404 用户不存在统一显示可重试文案，
//   不透出后端细节。
// - 无 hash 直接提示重新打开邮件链接，不发起请求。

import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthPageShell } from '@modules/authentication';
import { AuthSession } from '@clients/auth/AuthSession.js';
import './ConfirmEmailRoute.css';

type ConfirmState = 'loading' | 'success' | 'error';

export interface ConfirmEmailRouteProps {
  /** true = `/confirm-new-email`（换邮箱确认）。 */
  newEmail?: boolean;
}

function ConfirmHero(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="confirm-hero">
      <div className="confirm-hero__panel">
        <div className="confirm-hero__brand">{t('common.app.name')}</div>
        <div className="confirm-hero__tagline">{t('auth.confirm.heroSubtitle')}</div>
      </div>
    </div>
  );
}

export function ConfirmEmailRoute({ newEmail = false }: ConfirmEmailRouteProps): React.JSX.Element {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const hash = searchParams.get('hash');
  const [state, setState] = useState<ConfirmState>(hash ? 'loading' : 'error');

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    void (async () => {
      try {
        await AuthSession.confirmEmail(hash, { newEmail });
        if (cancelled) return;
        // 确认令牌只用于本次请求；成功后从地址栏移除。
        try {
          window.history.replaceState(window.history.state, '', window.location.pathname);
        } catch {
          // jsdom/受限环境不支持 replaceState 时不影响确认结果。
        }
        setState('success');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [hash, newEmail]);

  const successText = newEmail ? t('auth.confirm.newEmailSuccess') : t('auth.confirm.success');
  return (
    <AuthPageShell hero={<ConfirmHero />}>
      <div className="confirm" data-testid={newEmail ? 'confirm-new-email-route' : 'confirm-email-route'}>
        <div className="confirm__logo" aria-hidden="true">{t('common.app.name')}</div>
        <h1 className="confirm__title">{t('auth.confirm.title')}</h1>
        <p className="confirm__subtitle">{t('auth.confirm.subtitle')}</p>
        {state === 'loading' && (
          <div className="confirm__status" role="status" data-testid="confirm-loading">
            {t('auth.confirm.loading')}
          </div>
        )}
        {state === 'success' && (
          <div className="confirm__success" role="status" data-testid="confirm-success">
            <div className="confirm__success-message">{successText}</div>
            <Link className="confirm__link" to="/login">{t('auth.confirm.backToLogin')}</Link>
          </div>
        )}
        {state === 'error' && (
          <div className="confirm__error" role="alert" data-testid="confirm-error">
            <div>{hash ? t('auth.confirm.error') : t('auth.confirm.missing')}</div>
            <Link className="confirm__link" to="/login">{t('auth.confirm.backToLogin')}</Link>
          </div>
        )}
      </div>
    </AuthPageShell>
  );
}
