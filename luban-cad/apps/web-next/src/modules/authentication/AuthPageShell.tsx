import React from 'react';
import './AuthPageShell.css';

export interface AuthPageShellProps {
  /** 右侧视觉槽（Onshape 采集的 hero 位） */
  hero: React.ReactNode;
  children: React.ReactNode;
}

export function AuthPageShell({ hero, children }: AuthPageShellProps): React.JSX.Element {
  return (
    <div className="auth-shell">
      <div className="auth-shell__form">{children}</div>
      <div className="auth-shell__hero">{hero}</div>
    </div>
  );
}
