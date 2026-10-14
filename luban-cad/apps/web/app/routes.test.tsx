import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LegacyITwinRedirect, LegacyWorkspaceRedirect } from './App.js';

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
