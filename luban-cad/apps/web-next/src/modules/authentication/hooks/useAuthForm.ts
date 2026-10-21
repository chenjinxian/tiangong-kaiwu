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

  // 语义钉死（brief 测试钉死）：字段变更即按新值重派生全量错误，
  // 但无条件清掉本字段错误（键入中的字段不即时报错）——其它字段错误保留。
  // 防抖在调用方，hook 内不做防抖。
  const setValue = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
    const nextValues: T = { ...values, [name]: value };
    setValues(nextValues);
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors({ ...validate(nextValues), [name]: undefined });
  }, [values, validate]);

  const submit = useCallback(async () => {
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }, [values, validate, onSubmit]);

  const state: AuthFormState<T> = { values, errors, touched, submitting };
  return { ...state, setValue, submit };
}
