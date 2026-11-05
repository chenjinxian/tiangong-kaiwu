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

  it('根路由是产品介绍页（完整宣传片）', () => {
    render(<App />);
    expect(screen.getByTestId('showcase-route')).toBeDefined();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('BRep');
    expect(document.querySelector('video')).not.toBeNull();
  });

});
