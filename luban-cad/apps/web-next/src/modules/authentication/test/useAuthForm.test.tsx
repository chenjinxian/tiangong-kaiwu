import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuthForm } from '../hooks/useAuthForm.js';

// M3-T1（终审 I5）：hook 内消费 useLocation/useNavigate（成功回跳）——
// 全部既有用例须挂 Router 上下文。
function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

/** 回跳探针：随 Router 上下文重渲染，暴露当前路径供断言。 */
let currentPath = '';
function LocationProbe(): null {
  currentPath = useLocation().pathname;
  return null;
}

/** 带初始 entry（可带 location.state）的 Wrapper 工厂（M3-T1 from 回跳用例）。 */
function makeWrapper(entry: { pathname: string; state?: unknown }) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        {children}
      </MemoryRouter>
    );
  };
}

describe('useAuthForm', () => {
  it('提交前触发 validate，通过才 onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: '' },
        validate: (v) => (v.email ? {} : { email: '必填' }),
        onSubmit,
      }), { wrapper });
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
      }), { wrapper });
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
      }), { wrapper });
    act(() => result.current.setValue('email', 'a@b.c'));
    expect(result.current.errors.email).toBeUndefined();
    expect(result.current.errors.password).toBe('必填');
  });

  // 终审 M-g：429 横幅（formError）挂起期间，任一字段变更即清除横幅。
  it('setValue 时若存在 formError 则清掉', () => {
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: '' },
        validate: () => ({}),
        onSubmit: async () => {},
      }), { wrapper });
    act(() => result.current.setFormError('请求过于频繁'));
    expect(result.current.formError).toBe('请求过于频繁');
    act(() => result.current.setValue('email', 'a@b.c'));
    expect(result.current.formError).toBeNull();
  });

  // 终审 I-C touched 门控的前置：提交校验失败时全部字段标记 touched，
  // 路由 error={touched.x ? errors.x : undefined} 门控下错误仍全部可见。
  it('提交校验失败时全部字段标记 touched', async () => {
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: '', password: '' },
        validate: (v) => ({
          ...(v.email ? {} : { email: '必填' }),
          ...(v.password ? {} : { password: '必填' }),
        }),
        onSubmit: async () => {},
      }), { wrapper });
    await act(async () => { await result.current.submit(); });
    expect(result.current.touched.email).toBe(true);
    expect(result.current.touched.password).toBe(true);
    expect(result.current.errors.email).toBe('必填');
  });

  // ---- M3-T1（终审 I5）：navigateAfterSuccess 成功回跳 ----

  it('navigateAfterSuccess：无 from state 时成功提交回跳 /documents', async () => {
    currentPath = '';
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: 'a@b.c' },
        validate: () => ({}),
        onSubmit,
        navigateAfterSuccess: true,
      }), { wrapper: makeWrapper({ pathname: '/login' }) });

    expect(currentPath).toBe('/login');
    await act(async () => { await result.current.submit(); });
    await waitFor(() => { expect(currentPath).toBe('/documents'); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('navigateAfterSuccess：有 from state 时成功提交回跳 from.pathname', async () => {
    currentPath = '';
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: 'a@b.c' },
        validate: () => ({}),
        onSubmit,
        navigateAfterSuccess: true,
      }), {
        wrapper: makeWrapper({ pathname: '/login', state: { from: { pathname: '/settings/profile' } } }),
      });

    await act(async () => { await result.current.submit(); });
    await waitFor(() => { expect(currentPath).toBe('/settings/profile'); });
  });

  it('navigateAfterSuccess：onSubmit 拒绝时不回跳（错误呈现归调用方）', async () => {
    currentPath = '';
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useAuthForm({
        initialValues: { email: 'a@b.c' },
        validate: () => ({}),
        onSubmit,
        navigateAfterSuccess: true,
      }), { wrapper: makeWrapper({ pathname: '/login' }) });

    await act(async () => { await result.current.submit(); });
    // 等一个微任务周期，确认未被导航走
    await act(async () => { await Promise.resolve(); });
    expect(currentPath).toBe('/login');
  });
});
