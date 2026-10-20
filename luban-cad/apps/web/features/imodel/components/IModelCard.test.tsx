/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import i18n from '../../../shared/i18n/index.js';

// 缩略图 hook 单测已覆盖加载/回退逻辑；卡片测试只关心「有图渲染 img，无图渲染占位」
const useIModelImageMock = vi.fn(() => null as string | null);
vi.mock('../../../shared/hooks/useIModelImage.js', () => ({
  useIModelImage: () => useIModelImageMock(),
}));

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

function renderCard(props: Parameters<typeof IModelCard>[0]): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IModelCard {...props} />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN');
});

beforeEach(() => {
  useIModelImageMock.mockReturnValue(null);
});

describe('IModelCard', () => {
  it('should render iModel information', () => {
    const mockIModel = createMockIModel();

    renderCard({ iModel: mockIModel });

    expect(screen.getByText('Test iModel')).toBeDefined();
    expect(screen.getByText('Test description')).toBeDefined();
    expect(screen.getByText('已初始化')).toBeDefined();
  });

  it('should render without description', () => {
    const mockIModel = createMockIModel({ description: undefined });

    renderCard({ iModel: mockIModel });

    expect(screen.getByText('Test iModel')).toBeDefined();
    expect(screen.queryByText('Test description')).toBeNull();
  });

  it('should format creation date', () => {
    const mockIModel = createIModelWithDate('2024-03-15T08:00:00Z');

    renderCard({ iModel: mockIModel });

    // Date format depends on locale, but should contain year and day
    const dateText = screen.getByText(/创建于/);
    expect(dateText).toBeDefined();
  });

  it('should show dash when no creation date', () => {
    const mockIModel = createMockIModel({ createdDateTime: undefined });

    renderCard({ iModel: mockIModel });

    expect(screen.getByText('无日期')).toBeDefined();
  });

  it('should call onOpen when button clicked for initialized iModel', () => {
    const mockIModel = createMockIModel({ state: 'initialized' });
    const mockOnOpen = vi.fn();

    renderCard({ iModel: mockIModel, onOpen: mockOnOpen });

    const button = screen.getByText('打开工作空间');
    fireEvent.click(button);

    expect(mockOnOpen).toHaveBeenCalledWith(mockIModel);
  });

  it('should disable button when iModel is not initialized', () => {
    const mockIModel = createMockIModel({ state: 'notInitialized' });

    renderCard({ iModel: mockIModel });

    const button = screen.getByRole('button');
    // Button should be disabled for uninitialized iModels
    expect(button.getAttribute('disabled') || button.getAttribute('aria-disabled')).toBeTruthy();
  });

  it('should show uninitialized state', () => {
    const mockIModel = createMockIModel({ state: 'notInitialized' });

    renderCard({ iModel: mockIModel });

    // Badge should show "未初始化"
    expect(screen.getAllByText('未初始化').length).toBeGreaterThan(0);
    // Button should show "初始化"
    expect(screen.getByRole('button', { name: '初始化' })).toBeDefined();
  });

  it('should show overlay for uninitialized iModel', () => {
    const mockIModel = createMockIModel({ state: 'notInitialized' });

    const { container } = renderCard({ iModel: mockIModel });

    const overlay = container.querySelector('.imodel-card__overlay');
    expect(overlay).not.toBeNull();
  });

  it('should not show overlay for initialized iModel', () => {
    const mockIModel = createMockIModel({ state: 'initialized' });

    const { container } = renderCard({ iModel: mockIModel });

    const overlay = container.querySelector('.imodel-card__overlay');
    expect(overlay).toBeNull();
  });

  it('renders the authenticated thumbnail image when the hook returns an object URL', () => {
    useIModelImageMock.mockReturnValue('blob:imodel-thumb');
    const mockIModel = createMockIModel();

    const { container } = renderCard({ iModel: mockIModel });

    const image = container.querySelector('.imodel-card__image');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('blob:imodel-thumb');
    expect(container.querySelector('.imodel-card__icon')).toBeNull();
  });

  it('falls back to the item icon when no thumbnail is available', () => {
    useIModelImageMock.mockReturnValue(null);

    const { container } = renderCard({ iModel: createMockIModel() });

    expect(container.querySelector('.imodel-card__image')).toBeNull();
    expect(container.querySelector('.imodel-card__icon')).not.toBeNull();
  });

  it('should work without onOpen handler', () => {
    const mockIModel = createMockIModel({ state: 'initialized' });

    renderCard({ iModel: mockIModel });

    const button = screen.getByText('打开工作空间');
    // Should not throw
    fireEvent.click(button);
  });

  it('should fallback to name when displayName is empty', () => {
    const mockIModel = createMockIModel({ displayName: undefined, name: 'Fallback Name' });

    renderCard({ iModel: mockIModel });

    expect(screen.getByText('Fallback Name')).toBeDefined();
  });

  it('should show default text when both displayName and name are empty', () => {
    const mockIModel = createMockIModel({ displayName: undefined, name: '' });

    renderCard({ iModel: mockIModel });

    expect(screen.getByText('未命名 iModel')).toBeDefined();
  });
});

/** 只有 createdDateTime 的卡片（update = create，不渲染「更新于」） */
function createIModelWithDate(date: string): IModel {
  return createMockIModel({ createdDateTime: date });
}
