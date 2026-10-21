import { useCallback, useState } from 'react';
import type { AuthFormState } from '../types.js';

export interface UseAuthFormOptions<T> {
  initialValues: T;
  validate: (values: T) => Partial<Record<keyof T, string>>;
  onSubmit: (values: T) => Promise<void>;
}

export function useAuthForm<T extends Record<string, unknown>>({ initialValues, validate, onSubmit }: UseAuthFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  /** 表单级错误（429 限流文案 / 后端 message 透传）。收进 hook（终审 M-g）：
   * setValue 时若存在 formError 即清掉——429 横幅挂起期间用户改任一字段，
   * 横幅即时消失；同值 setState 有 React 短路，无额外渲染开销。 */
  const [formError, setFormError] = useState<string | null>(null);

  // 语义钉死（brief 测试钉死）：字段变更即按新值重派生全量错误，
  // 但无条件清掉本字段错误（键入中的字段不即时报错）——其它字段错误保留。
  // 防抖在调用方，hook 内不做防抖。
  const setValue = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
    const nextValues: T = { ...values, [name]: value };
    setValues(nextValues);
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors({ ...validate(nextValues), [name]: undefined });
    setFormError(null);
  }, [values, validate]);

  const submit = useCallback(async () => {
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      // 终审 I-C touched 门控的前置：校验失败时全部字段标记 touched——
      // 路由按 error={touched.x ? errors.x : undefined} 门控渲染，未 touched
      // 不显示；提交失败后须让用户看到全量错误（含未触碰字段），否则空表
      // 单提交无任何提示。
      setTouched(Object.fromEntries(Object.keys(values).map((k) => [k, true])) as Record<keyof T, boolean>);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }, [values, validate, onSubmit]);

  const state: AuthFormState<T> = { values, errors, touched, submitting, formError };
  return { ...state, setFormError, setValue, submit };
}
