/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * 认证页品牌侧栏（RW4-P1-T1）：Login/Register/ForgotPassword 三份 brand 侧栏拷贝合一。
 * 布局 = 分屏左栏（HeaderLogo 品牌区 + 标语 + 特性行）；文案走 auth 命名空间 i18n，
 * 特性行 props 化（Register 传六行、成功态传 [] 隐藏）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HeaderLogo, Text } from '@itwin/itwinui-react';
import './AuthBrandSide.css';

/** 单条特性行（icon = 字形/图标节点，label = i18n 解析后的文案） */
export interface AuthBrandFeature {
  icon: React.ReactNode;
  label: React.ReactNode;
}

export interface AuthBrandSideProps {
  /** 特性行列表；缺省 = 四条核心特性行（文案经 i18n auth.brand.features.*） */
  features?: AuthBrandFeature[];
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const AuthBrandSide: React.FC<AuthBrandSideProps> = ({ features }) => {
  const { t } = useTranslation('auth');

  const defaultFeatures: AuthBrandFeature[] = [
    { icon: '✓', label: t('brand.features.free') },
    { icon: '⊕', label: t('brand.features.collab') },
    { icon: '◈', label: t('brand.features.rendering') },
    { icon: '⚙', label: t('brand.features.cad') },
  ];
  const rows = features ?? defaultFeatures;

  return (
    <div className="auth-brand-side">
      <HeaderLogo logo={<span className="auth-brand-mark">鲁</span>} className="auth-brand-logo">
        {t('brand.name')}
      </HeaderLogo>
      <Text className="auth-brand-tagline">{t('brand.tagline')}</Text>
      {rows.length > 0 && (
        <ul className="auth-brand-features">
          {rows.map((feature, index) => (
            <li key={index} className="auth-brand-feature">
              <span className="auth-brand-feature-icon" aria-hidden="true">
                {feature.icon}
              </span>
              <Text>{feature.label}</Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AuthBrandSide;
