import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listNamedVersions: vi.fn() }));

vi.mock('@clients/imodels/ImodelsClient.js', () => ({
  ImodelsClient: class {
    listNamedVersions = mocks.listNamedVersions;
  },
}));

import { useNamedVersions } from '../hooks/useNamedVersions.js';

const VERSIONS = [{ id: 'nv-1', name: 'V1', changesetId: 'cs-2' }];

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useNamedVersions', () => {
  it('queryKey 契约 + 成功出口', async () => {
    mocks.listNamedVersions.mockResolvedValue(VERSIONS);
    const { client, wrapper } = createWrapper();
    const { result } = renderHook(() => useNamedVersions('im-1'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.namedVersions).toEqual(VERSIONS);
    expect(mocks.listNamedVersions).toHaveBeenCalledWith('im-1');
    expect(
      client.getQueryCache().find({ queryKey: ['part-studio', 'named-versions', 'im-1'] }),
    ).toBeDefined();
  });

  it('iModelId=null 门控不查询', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNamedVersions(null), { wrapper });
    expect(mocks.listNamedVersions).not.toHaveBeenCalled();
    expect(result.current.namedVersions).toEqual([]);
  });
});
