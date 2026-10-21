import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuthForm } from '../hooks/useAuthForm.js';

describe('useAuthForm', () => {
  it('提交前触发 validate，通过才 onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: '' },
        validate: (v) => (v.email ? {} : { email: '必填' }),
        onSubmit,
      }));
    act(() => result.current.setValue('email', ''));
    await act(async () => { await result.current.submit(); });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.email).toBe('必填');
  });

  it('校验通过后 onSubmit 被调用，submitting 生命周期翻转', async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveSubmit = r; }));
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: '' },
        validate: () => ({}),
        onSubmit,
      }));
    act(() => result.current.setValue('email', 'a@b.c'));
    let submitPromise!: Promise<void>;
    act(() => { submitPromise = result.current.submit(); });
    expect(result.current.submitting).toBe(true);
    await act(async () => { resolveSubmit(); await submitPromise; });
    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.c' });
    expect(result.current.submitting).toBe(false);
  });

  it('字段变更清掉该字段错误，其它字段错误保留', () => {
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: '', password: '' },
        validate: (v) => ({
          ...(v.email ? {} : { email: '必填' }),
          ...(v.password ? {} : { password: '必填' }),
        }),
        onSubmit: async () => {},
      }));
    act(() => result.current.setValue('email', 'a@b.c'));
    expect(result.current.errors.email).toBeUndefined();
    expect(result.current.errors.password).toBe('必填');
  });
});
