import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthPageShell } from '../AuthPageShell.js';

describe('AuthPageShell', () => {
  // 本项目 vitest globals:false → RTL 自动 cleanup 不生效，需显式挂钩。
  afterEach(cleanup);

  it('渲染分屏：hero 槽位 + 表单槽位', () => {
    render(<AuthPageShell hero={<div data-testid="hero-x" />}><form data-testid="form-x" /></AuthPageShell>);
    expect(screen.getByTestId('hero-x')).toBeDefined();
    expect(screen.getByTestId('form-x')).toBeDefined();
  });
});
