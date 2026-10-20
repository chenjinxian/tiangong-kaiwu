import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
// 初始化 i18n 单例（App 内 useTranslation 依赖；不导入则 t() 回落键名）
import '../shared/i18n/index.js';
import { LegacyITwinRedirect, LegacyWorkspaceRedirect, NotFoundPage } from './App.js';

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="probe">{loc.pathname}</div>;
};

describe('旧路由重定向', () => {
  it('/itwins/:id → /documents/:id', () => {
    render(
      <MemoryRouter initialEntries={['/itwins/abc-123']}>
        <Routes>
          <Route path="/itwins/:iTwinId" element={<LegacyITwinRedirect />} />
          <Route path="/documents/:iTwinId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('/documents/abc-123');
  });

  it('/workspace/:a/:b → /documents/:a/:b', () => {
    render(
      <MemoryRouter initialEntries={['/workspace/itwin-1/imodel-9']}>
        <Routes>
          <Route path="/workspace/:iTwinId/:iModelId" element={<LegacyWorkspaceRedirect />} />
          <Route path="/documents/:iTwinId/:iModelId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('/documents/itwin-1/imodel-9');
  });
});

describe('404 页（RW4-P1-T4）', () => {
  it('「回到文档」走 client-side Link（点击后 history 变更，非全页 <a href> 跳转）', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
          <Route path="/documents" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('404', { exact: true })).toBeTruthy();
    // react-router Link 渲染为无 target 的锚点；点击走 history API
    //（本文件未 stub navigator，i18n 可能解析为 en——双语文案匹配）
    const link = screen.getByText(/回到文档|Go to Documents/i).closest('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('target')).toBeNull();
    fireEvent.click(link!);
    expect(screen.getByTestId('probe').textContent).toBe('/documents');
  });
});
