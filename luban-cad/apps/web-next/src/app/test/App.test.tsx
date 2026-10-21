import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App.js';

describe('App', () => {
  // 本项目 vitest globals:false → RTL 自动 cleanup 不生效，需显式挂钩，
  // 否则前序 render 残留 DOM 会令 getBy* 命中多元素。
  afterEach(cleanup);

  it('渲染应用根占位', () => {
    render(<App />);
    expect(screen.getByTestId('app-root')).toBeDefined();
  });

  it('令牌样张页渲染 iTwinUI 主按钮', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: '主按钮' })).toBeDefined();
  });

  it('默认路由是令牌样张', () => {
    render(<App />);
    expect(screen.getByTestId('dev-tokens-route')).toBeDefined();
  });
});
