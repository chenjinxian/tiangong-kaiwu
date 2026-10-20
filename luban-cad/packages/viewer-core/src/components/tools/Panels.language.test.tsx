/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * RW4-P5：右侧停靠面板语言化（viewer-core 无 i18next，语言经 prop 注入）。
 * 默认 zh-CN 保持既有文案；language="en" 时不得残留中文。
 */

/* eslint-disable @typescript-eslint/naming-convention -- vi.mock 工厂键沿用 iTwin API 原名 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Viewport } from '@itwin/core-frontend';
import type { ViewerLanguage } from './panelLanguage.js';
import { ViewSettingsPanel } from './ViewSettingsPanel.js';
import { SavedViewsPanel } from './SavedViewsPanel.js';
import { SectionToolsPanel } from './SectionToolsPanel.js';
import { ModelPicker } from './ModelPicker.js';
import { CategoryPicker } from './CategoryPicker.js';
import { ViewSwitcher } from './ViewSwitcher.js';

const HAN = /[一-鿿]/;

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { viewManager: { selectedView: undefined } },
  // ModelPicker 用 instanceof SpatialViewState 判定 3D 视图
  SpatialViewState: class SpatialViewState {},
}));

// 无活动视口：各面板渲染各自的空态文案（同一入口覆盖六个面板的默认/英文文案）
const NO_VIEWPORT_CASES = [
  {
    name: 'ViewSettingsPanel',
    renderPanel: (language?: ViewerLanguage) => <ViewSettingsPanel language={language} />,
    zh: '视图设置需要活动视图',
    en: 'View settings require an active view',
  },
  {
    name: 'SavedViewsPanel',
    renderPanel: (language?: ViewerLanguage) => <SavedViewsPanel language={language} />,
    zh: '保存视图需要活动视图',
    en: 'Saved views require an active view',
  },
  {
    name: 'SectionToolsPanel',
    renderPanel: (language?: ViewerLanguage) => <SectionToolsPanel language={language} />,
    zh: '剖切工具仅在3D视图中可用',
    en: 'Section tools are only available in 3D views',
  },
  {
    name: 'ModelPicker',
    renderPanel: (language?: ViewerLanguage) => <ModelPicker language={language} />,
    zh: '模型选择器仅在3D视图中可用',
    en: 'Model picker is only available in 3D views',
  },
  {
    name: 'CategoryPicker',
    renderPanel: (language?: ViewerLanguage) => <CategoryPicker language={language} />,
    zh: '类别选择器需要活动视图',
    en: 'Category picker requires an active view',
  },
  {
    name: 'ViewSwitcher',
    renderPanel: (language?: ViewerLanguage) => <ViewSwitcher language={language} />,
    zh: '视图切换需要活动视图',
    en: 'View switcher requires an active view',
  },
];

describe('右侧停靠面板语言化', () => {
  it.each(NO_VIEWPORT_CASES)('$name：默认中文空态保持不变', ({ renderPanel, zh }) => {
    render(renderPanel());
    expect(screen.getByText(zh)).toBeDefined();
  });

  it.each(NO_VIEWPORT_CASES)('$name：language=en 空态为英文且无中文残留', ({ renderPanel, en }) => {
    const { container } = render(<div>{renderPanel('en')}</div>);
    expect(screen.getByText(en)).toBeDefined();
    expect(container.textContent).not.toMatch(HAN);
  });

  it('SavedViewsPanel：en 标题/占位符/空态/按钮全英文（默认 zh 不变）', () => {
    const viewport = {
      iModel: { key: 'imodel-test' },
      view: {},
    } as unknown as Viewport;

    const { container, unmount } = render(<SavedViewsPanel language="en" viewport={viewport} />);
    expect(screen.getByText('Saved Views')).toBeDefined();
    expect(screen.getByPlaceholderText('Enter a view name...')).toBeDefined();
    expect(screen.getByText('No saved views yet')).toBeDefined();
    expect(screen.getByText('Adjust the view, then click Save')).toBeDefined();
    expect(screen.getByText('Save')).toBeDefined();
    expect(container.textContent).not.toMatch(HAN);
    unmount();

    render(<SavedViewsPanel viewport={viewport} />);
    expect(screen.getByText('保存视图 (Saved Views)')).toBeDefined();
    expect(screen.getByPlaceholderText('输入视图名称...')).toBeDefined();
    expect(screen.getByText('还没有保存的视图')).toBeDefined();
  });

  it('ViewSwitcher：en 标题与空态全英文', async () => {
    const viewport = {
      iModel: { views: { getViewList: vi.fn(async () => []) } },
      view: { id: 'view-1' },
    } as unknown as Viewport;

    const { container } = render(<ViewSwitcher language="en" viewport={viewport} />);
    expect(await screen.findByText('No views available')).toBeDefined();
    expect(screen.getByText('Views')).toBeDefined();
    expect(container.textContent).not.toMatch(HAN);
  });

  it('CategoryPicker：en 标题与空态全英文', async () => {
    const viewport = {
      view: { categorySelector: { categories: new Set<string>() } },
    } as unknown as Viewport;

    const { container } = render(<CategoryPicker language="en" viewport={viewport} />);
    expect(await screen.findByText('No categories available')).toBeDefined();
    expect(screen.getByText('Categories')).toBeDefined();
    expect(screen.getByText('Show All')).toBeDefined();
    expect(container.textContent).not.toMatch(HAN);
  });

  it('SectionToolsPanel：en 6 面分区标签全英文', () => {
    const viewport = {
      view: { is3d: () => true, setViewClip: vi.fn() },
      iModel: { projectExtents: { center: {} } },
      invalidateScene: vi.fn(),
    } as unknown as Viewport;

    const { container } = render(<SectionToolsPanel language="en" viewport={viewport} />);
    expect(screen.getByText('Section Tools')).toBeDefined();
    expect(screen.getByText('Enable All')).toBeDefined();
    expect(screen.getByText('Clear All')).toBeDefined();
    expect(screen.getByText('X+ (Right)')).toBeDefined();
    expect(screen.getByText('Y- (Back)')).toBeDefined();
    expect(screen.getByText('Z+ (Top)')).toBeDefined();
    expect(container.textContent).not.toMatch(HAN);
  });

  it('ViewSettingsPanel：en 标题/分组/渲染模式/显示选项全英文', async () => {
    const viewport = {
      view: {
        viewFlags: { renderMode: 0 },
        displayStyle: { id: 'style-1', backgroundColor: { toHexString: () => '#000000' } },
        details: { gridSpacing: { x: 1 }, gridsPerRef: 10, gridOrientation: 0 },
        is3d: () => true,
      },
      iModel: { elements: { queryProps: vi.fn(async () => []) } },
      invalidateScene: vi.fn(),
    } as unknown as Viewport;

    const { container } = render(
      <ViewSettingsPanel language="en" viewport={viewport} />
    );
    expect(screen.getByText('View Settings')).toBeDefined();
    expect(await screen.findByText('Display Style')).toBeDefined();
    expect(screen.getByText('Render Mode')).toBeDefined();
    expect(screen.getByText('Wireframe')).toBeDefined();
    expect(screen.getByText('Smooth Shade')).toBeDefined();
    expect(screen.getByText('Display Options')).toBeDefined();
    expect(screen.getByText('Visible Edges')).toBeDefined();
    expect(container.textContent).not.toMatch(HAN);
  });
});
