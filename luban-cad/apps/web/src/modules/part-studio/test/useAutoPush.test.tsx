/**
 * ADR-0017 Stage F：useAutoPush 自动保存/静默同步（防抖、single-flight、失败可见、重试）。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { useAutoPush } from '../hooks/useAutoPush.js';

interface FakeConnection {
  txns: { hasPendingTxns: ReturnType<typeof vi.fn> };
  pushChanges: ReturnType<typeof vi.fn>;
}

function makeConnection(options?: {
  pending?: boolean | (() => boolean);
  push?: () => Promise<unknown>;
}): FakeConnection {
  const pending = options?.pending ?? true;
  return {
    txns: {
      hasPendingTxns: vi.fn(async () => (typeof pending === 'function' ? pending() : pending)),
    },
    pushChanges: vi.fn(options?.push ?? (async () => ({ index: 1, id: 'cs-1' }))),
  };
}

function asConnection(fake: FakeConnection): BriefcaseConnection {
  return fake as unknown as BriefcaseConnection;
}

describe('useAutoPush', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enabled=false → 永不推送（回滚开关）', async () => {
    const fake = makeConnection();
    const { result } = renderHook(() =>
      useAutoPush(asConnection(fake), true, { enabled: false, debounceMs: 10 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fake.pushChanges).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('pending → 防抖后推送一次，成功后 idle + onPushed', async () => {
    let pending = true;
    const fake = makeConnection({
      pending: () => pending,
      push: async () => {
        pending = false;
        return { index: 1, id: 'cs-1' };
      },
    });
    const onPushed = vi.fn();
    const { result } = renderHook(() =>
      useAutoPush(asConnection(fake), true, { debounceMs: 500, onPushed }),
    );
    expect(result.current.state).toBe('pending');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(fake.pushChanges).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(fake.pushChanges).toHaveBeenCalledTimes(1);
    expect(fake.pushChanges).toHaveBeenCalledWith('自动保存');
    expect(onPushed).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('idle');
  });

  it('无 pending → 不推送', async () => {
    const fake = makeConnection({ pending: false });
    renderHook(() => useAutoPush(asConnection(fake), false, { debounceMs: 10 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fake.pushChanges).not.toHaveBeenCalled();
  });

  it('推送中又有新提交 → 完成后补推一次（single-flight）', async () => {
    let pending = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = makeConnection({
      pending: () => pending,
      push: async () => {
        await gate;
        return { index: 1, id: 'cs-1' };
      },
    });
    const { rerender } = renderHook(
      ({ hasPending }) => useAutoPush(asConnection(fake), hasPending, { debounceMs: 100 }),
      { initialProps: { hasPending: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(101);
    });
    expect(fake.pushChanges).toHaveBeenCalledTimes(1);
    // 推送在途时再次提交（hasPending 由 false→true 的真实节奏无法在此模拟——
    // 直接重渲染保持 true），完成后 hasPendingTxns 仍真 → 补排一次。
    rerender({ hasPending: true });
    release();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(fake.pushChanges).toHaveBeenCalledTimes(2);
    pending = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it('推送失败 → 可见 error + onError + retryMs 后重试（成功则清错）', async () => {
    let pending = true;
    let shouldFail = true;
    const fake = makeConnection({
      pending: () => pending,
      push: async () => {
        if (shouldFail) throw new Error('hub 503');
        pending = false;
        return { index: 2, id: 'cs-2' };
      },
    });
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useAutoPush(asConnection(fake), true, { debounceMs: 100, retryMs: 1_000, onError }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(101);
    });
    expect(onError).toHaveBeenCalledWith('hub 503');
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('hub 503');
    shouldFail = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });
    expect(fake.pushChanges).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeUndefined();
  });

  it('flush() 立即推送（创建版本前落库）', async () => {
    const fake = makeConnection();
    const { result } = renderHook(() =>
      useAutoPush(asConnection(fake), true, { debounceMs: 60_000 }),
    );
    let flushed = false;
    await act(async () => {
      flushed = await result.current.flush();
    });
    expect(flushed).toBe(true);
    expect(fake.pushChanges).toHaveBeenCalledTimes(1);
  });
});
