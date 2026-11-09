// src/modules/part-studio/test/useBodyMassProperties.test.tsx
//
// W1.5b：逐 body 质量属性读面（零件段体积数据源）——
//  1) scope 透传 + bodyKey 索引；
//  2) 无连接不发请求；
//  3) RPC 失败不阻塞树（error 可诊断、体积不回填）。
import { renderHook, waitFor } from '@testing-library/react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { LubanFeatureRpcInterface, type MassPropertiesDto } from '@luban-cad/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBodyMassProperties } from '../hooks/useBodyMassProperties.js';

const CONNECTION = { key: 'conn-1' } as unknown as BriefcaseConnection;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBodyMassProperties', () => {
  it('读取逐 body 质量属性并按 bodyKey 建索引（scope 透传）', async () => {
    const getMassProperties = vi.fn(async (_key: string, _ps?: string): Promise<MassPropertiesDto[]> => [
      { bodyKey: 'b1', volume: 4000, centroid: { x: 1, y: 2, z: 3 }, surfaceArea: 10 },
      { bodyKey: 'b2', volume: 500, centroid: { x: 0, y: 0, z: 0 }, surfaceArea: 5 },
    ]);
    vi.spyOn(LubanFeatureRpcInterface, 'getClient').mockReturnValue({
      getMassProperties,
    } as unknown as LubanFeatureRpcInterface);

    const { result } = renderHook(() => useBodyMassProperties(CONNECTION, 'ps-1', 'k1'));
    await waitFor(() => expect(result.current.byBodyKey.size).toBe(2));
    expect(result.current.byBodyKey.get('b1')?.volume).toBe(4000);
    expect(result.current.byBodyKey.get('b2')?.volume).toBe(500);
    expect(result.current.loading).toBe(false);
    expect(getMassProperties).toHaveBeenCalledWith('conn-1', 'ps-1');
  });

  it('无连接：不发请求、空索引', () => {
    const getClient = vi.spyOn(LubanFeatureRpcInterface, 'getClient');
    const { result } = renderHook(() => useBodyMassProperties(undefined, 'ps-1', 'k1'));
    expect(result.current.byBodyKey.size).toBe(0);
    expect(result.current.loading).toBe(false);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('RPC 失败：error 可诊断、不回填体积（不阻塞树）', async () => {
    vi.spyOn(LubanFeatureRpcInterface, 'getClient').mockReturnValue({
      getMassProperties: vi.fn(async () => {
        throw new Error('mass boom');
      }),
    } as unknown as LubanFeatureRpcInterface);
    const { result } = renderHook(() => useBodyMassProperties(CONNECTION, 'ps-1', 'k1'));
    await waitFor(() => expect(result.current.error).toBe('mass boom'));
    expect(result.current.byBodyKey.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });
});
