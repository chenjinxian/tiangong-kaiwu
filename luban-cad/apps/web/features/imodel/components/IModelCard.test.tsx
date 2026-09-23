/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IModelCard } from './IModelCard.js';
import type { IModel } from '../../../shared/services/imodels/client.js';

const createMockIModel = (overrides: Partial<IModel> = {}): IModel => ({
  id: 'imodel-1',
  name: 'Test iModel',
  displayName: 'Test iModel',
  description: 'Test description',
  state: 'initialized',
  createdDateTime: '2024-01-15T10:30:00Z',
  ...overrides,
});

describe('IModelCard', () => {
  it('should render iModel information', () => {
    const mockIModel = createMockIModel();

    render(<IModelCard iModel={mockIModel} />);

    expect(screen.getByText('Test iModel')).toBeDefined();
    expect(screen.getByText('Test description')).toBeDefined();
    expect(screen.getByText('已初始化')).toBeDefined();
  });

  it('should render without description', () => {
    const mockIModel = createMockIModel({ description: undefined });

    render(<IModelCard iModel={mockIModel} />);

    expect(screen.getByText('Test iModel')).toBeDefined();
    expect(screen.queryByText('Test description')).toBeNull();
  });

  it('should format creation date', () => {
    const mockIModel = createMockIModel({
      createdDateTime: '2024-03-15T08:00:00Z',
    });

    render(<IModelCard iModel={mockIModel} />);

    // Date format depends on locale, but should contain year and day
    const dateText = screen.getByText(/创建于/);
    expect(dateText).toBeDefined();
  });

  it('should show dash when no creation date', () => {
    const mockIModel = createMockIModel({ createdDateTime: undefined });

    render(<IModelCard iModel={mockIModel} />);

    expect(screen.getByText('无日期')).toBeDefined();
  });

  it('should call onOpen when button clicked for initialized iModel', () => {
    const mockIModel = createMockIModel({ state: 'initialized' });
    const mockOnOpen = vi.fn();

    render(<IModelCard iModel={mockIModel} onOpen={mockOnOpen} />);

    const button = screen.getByText('打开工作空间');
    fireEvent.click(button);

    expect(mockOnOpen).toHaveBeenCalledWith(mockIModel);
  });

  it('should disable button when iModel is not initialized', () => {
    const mockIModel = createMockIModel({ state: 'notInitialized' });

    render(<IModelCard iModel={mockIModel} />);

    const button = screen.getByRole('button');
    // Button should be disabled for uninitialized iModels
    expect(button.getAttribute('disabled') || button.getAttribute('aria-disabled')).toBeTruthy();
  });

  it('should show uninitialized state', () => {
    const mockIModel = createMockIModel({ state: 'notInitialized' });

    render(<IModelCard iModel={mockIModel} />);

    // Badge should show "未初始化"
    expect(screen.getAllByText('未初始化').length).toBeGreaterThan(0);
    // Button should show "初始化"
    expect(screen.getByRole('button', { name: '初始化' })).toBeDefined();
  });

  it('should show overlay for uninitialized iModel', () => {
    const mockIModel = createMockIModel({ state: 'notInitialized' });

    const { container } = render(<IModelCard iModel={mockIModel} />);

    const overlay = container.querySelector('.imodel-card__overlay');
    expect(overlay).not.toBeNull();
  });

  it('should not show overlay for initialized iModel', () => {
    const mockIModel = createMockIModel({ state: 'initialized' });

    const { container } = render(<IModelCard iModel={mockIModel} />);

    const overlay = container.querySelector('.imodel-card__overlay');
    expect(overlay).toBeNull();
  });

  it('should work without onOpen handler', () => {
    const mockIModel = createMockIModel({ state: 'initialized' });

    render(<IModelCard iModel={mockIModel} />);

    const button = screen.getByText('打开工作空间');
    // Should not throw
    fireEvent.click(button);
  });

  it('should fallback to name when displayName is empty', () => {
    const mockIModel = createMockIModel({ displayName: undefined, name: 'Fallback Name' });

    render(<IModelCard iModel={mockIModel} />);

    expect(screen.getByText('Fallback Name')).toBeDefined();
  });

  it('should show default text when both displayName and name are empty', () => {
    const mockIModel = createMockIModel({ displayName: undefined, name: '' });

    render(<IModelCard iModel={mockIModel} />);

    expect(screen.getByText('未命名 iModel')).toBeDefined();
  });
});
