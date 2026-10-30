import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useWorkspaceRef } from '../use-workspace-ref.js';

function renderAt(path: string) {
  let captured: ReturnType<typeof useWorkspaceRef> = null;
  function Probe(): null {
    captured = useWorkspaceRef();
    return null;
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/documents/:iTwinId/:iModelId" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return captured;
}

describe('useWorkspaceRef', () => {
  it('读取 iTwinId/iModelId 与可选 model', () => {
    expect(renderAt('/documents/twin-1/im-1')).toEqual({
      iTwinId: 'twin-1',
      iModelId: 'im-1',
    });
    expect(renderAt('/documents/twin-1/im-1?model=model-1')).toEqual({
      iTwinId: 'twin-1',
      iModelId: 'im-1',
      modelId: 'model-1',
    });
  });
});
