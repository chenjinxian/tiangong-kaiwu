import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App.js';

describe('App', () => {
  it('渲染应用根占位', () => {
    render(<App />);
    expect(screen.getByTestId('app-root')).toBeDefined();
  });
});
