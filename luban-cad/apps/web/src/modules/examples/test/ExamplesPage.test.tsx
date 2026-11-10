import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamplesPage } from '../ExamplesPage.js';
import { useExampleTargets } from '../hooks/useExampleTargets.js';
import type { ExampleTarget } from '../hooks/useExampleTargets.js';

vi.mock('../hooks/useExampleTargets.js', () => ({
  useExampleTargets: vi.fn(),
}));

const mockedUseTargets = vi.mocked(useExampleTargets);

function renderPage(): void {
  render(
    <MemoryRouter>
      <ExamplesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedUseTargets.mockReturnValue({
    isAuthenticated: false,
    targets: new Map(),
    isLoading: false,
    isError: false,
  });
});

describe('ExamplesPage 全部示例目录', () => {
  it('公开渲染 21 张卡片和统计', () => {
    renderPage();
    expect(screen.getAllByTestId('example-card')).toHaveLength(21);
    expect(screen.getByRole('heading', { name: '全部示例' })).toBeDefined();
    expect(screen.getAllByText('21', { selector: '.examples-hero__facts strong' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/个严格示例/)).toBeDefined();
    expect(screen.getAllByText('登录后打开')).toHaveLength(21);
    expect(screen.getAllByRole('img', { name: /真实栈截图/ })).toHaveLength(21);
  });

  it('owner 过滤和搜索联动，且可清除', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Onshape Training Repo/ }));
    expect(screen.getAllByTestId('example-card')).toHaveLength(13);

    fireEvent.change(screen.getByTestId('example-search'), { target: { value: 'Bumper' } });
    expect(screen.queryAllByTestId('example-card')).toHaveLength(0);
    fireEvent.change(screen.getByTestId('example-search'), { target: { value: '' } });
    expect(screen.getAllByTestId('example-card')).toHaveLength(13);

    fireEvent.click(screen.getByRole('button', { name: /全部/ }));
    expect(screen.getAllByTestId('example-card')).toHaveLength(21);
  });

  it('搜索命中单个示例并显示 Bumper strict oracle 状态', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('example-search'), { target: { value: 'Bumper' } });
    expect(screen.getAllByTestId('example-card')).toHaveLength(1);
    expect(screen.getByText('Dumper Trailer / Bumper Block')).toBeDefined();
    expect(screen.getByText('strict · oracle 16/16')).toBeDefined();
  });

  it('已登录且唯一解析到 iModel：主动作直达 Part Studio', () => {
    const target: ExampleTarget = {
      itwinId: 'itwin-1',
      imodelId: 'imodel-1',
      projectName: 'Onshape 示例复刻',
      imodelName: 'Onshape example: Bumper Block (S10 faceExtrude + rb=3 oracle)',
    };
    mockedUseTargets.mockReturnValue({
      isAuthenticated: true,
      targets: new Map([['bumper-block', target]]),
      isLoading: false,
      isError: false,
    });
    renderPage();
    fireEvent.change(screen.getByTestId('example-search'), { target: { value: 'Bumper' } });
    const open = screen.getByRole('link', { name: '打开示例' });
    expect(open.getAttribute('href')).toBe('/documents/itwin-1/imodel-1');
    expect(screen.getByText('已定位 iModel')).toBeDefined();
  });

  it('已登录但未解析到 iModel：回退文档中心，不伪造直达链接', () => {
    mockedUseTargets.mockReturnValue({
      isAuthenticated: true,
      targets: new Map(),
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(screen.getAllByText('在文档中心查找')).toHaveLength(21);
    expect(screen.queryByText('打开示例')).toBeNull();
  });

  it('无匹配时显示空态并可清除筛选', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('example-search'), { target: { value: 'not-a-real-example' } });
    expect(screen.getByText('没有匹配的示例。')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getAllByTestId('example-card')).toHaveLength(21);
  });
});
