import React, { useState } from 'react';
import { IconButton, Input, Text } from '@itwin/itwinui-react';
import { SvgVisibilityShow, SvgVisibilityHide } from '@itwin/itwinui-icons-react';

export interface AuthFormFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'onChange' | 'size'> {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** 密码型开启可见切换 */
  showPasswordToggle?: boolean;
}

export function AuthFormField({ label, name, value, onChange, error, showPasswordToggle = false, type = 'text', ...rest }: AuthFormFieldProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const effectiveType = showPasswordToggle ? (visible ? 'text' : 'password') : type;
  return (
    <div className="auth-form-field">
      <Text as="label" htmlFor={name} variant="small" style={{ marginBottom: 'var(--lx-size-2xs)' }}>{label}</Text>
      <div className="auth-form-field__control">
        <Input
          id={name}
          name={name}
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          status={error ? 'negative' : undefined}
          aria-invalid={!!error}
          {...rest}
        />
        {showPasswordToggle && (
          <IconButton
            styleType="borderless"
            size="small"
            onClick={() => setVisible((v) => !v)}
            label={visible ? '隐藏密码' : '显示密码'}
          >
            {visible ? <SvgVisibilityHide /> : <SvgVisibilityShow />}
          </IconButton>
        )}
      </div>
      {error && <Text variant="small" style={{ color: 'var(--iui-color-text-negative)' }}>{error}</Text>}
    </div>
  );
}
