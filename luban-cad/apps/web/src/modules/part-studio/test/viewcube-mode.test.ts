import { describe, expect, it } from 'vitest';
import {
  readViewCubeMode,
  resolveViewCubeMode,
  VIEWCUBE_MODE_STORAGE_KEY,
} from '../internal/viewcube-mode.js';

function memoryStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('resolveViewCubeMode', () => {
  it('缺省与未知值使用官方 iTwin 默认模式', () => {
    expect(resolveViewCubeMode('')).toBe('itwin');
    expect(resolveViewCubeMode('?foo=bar')).toBe('itwin');
    expect(resolveViewCubeMode('?viewcube=unknown')).toBe('itwin');
    expect(resolveViewCubeMode('?viewcube=itwin')).toBe('itwin');
  });

  it('?viewcube=onshape 回退自研模式（大小写不敏感）', () => {
    expect(resolveViewCubeMode('?viewcube=onshape')).toBe('onshape');
    expect(resolveViewCubeMode('?viewcube=ONSHAPE')).toBe('onshape');
    expect(resolveViewCubeMode('?viewcube=%20onshape%20&x=1')).toBe('onshape');
  });
});

describe('readViewCubeMode（选择跨 ?model= 重写持久化）', () => {
  it('显式回退写入 sessionStorage，后续无参数读取沿用', () => {
    const storage = memoryStorage();
    expect(readViewCubeMode('?viewcube=onshape', storage)).toBe('onshape');
    expect(storage.getItem(VIEWCUBE_MODE_STORAGE_KEY)).toBe('onshape');
    expect(readViewCubeMode('?model=ps-1', storage)).toBe('onshape');
  });

  it('显式官方覆盖并清除持久化回退', () => {
    const storage = memoryStorage({ [VIEWCUBE_MODE_STORAGE_KEY]: 'onshape' });
    expect(readViewCubeMode('?viewcube=itwin', storage)).toBe('itwin');
    expect(readViewCubeMode('?model=ps-1', storage)).toBe('itwin');
  });

  it('无参数且无持久化值 → 官方默认', () => {
    expect(readViewCubeMode('?model=ps-1', memoryStorage())).toBe('itwin');
  });
});
