import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTE_DOCUMENTS } from '@config/routes.constants.js';
import type { AuthFormState } from '../types.js';

export interface UseAuthFormOptions<T> {
  initialValues: T;
  validate: (values: T) => Partial<Record<keyof T, string>>;
  onSubmit: (values: T) => Promise<void>;
  /** M3-T1（终审 I5）：onSubmit 成功后的回跳开关。true 时提交成功即
   * navigate(location.state?.from?.pathname ?? ROUTE_DOCUMENTS)——RequireAuth
   * 守卫把被拦地址落在 location.state.from，登录成功回跳原目的地；
   * onSubmit 拒绝则不跳（失败呈现收敛在调用方）。缺省 false：
   * forgot-password 成功走本页 success 态，不跳路由。 */
  navigateAfterSuccess?: boolean;
}

export function useAuthForm<T extends Record<string, unknown>>({ initialValues, validate, onSubmit, navigateAfterSuccess = false }: UseAuthFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  /** 表单级错误（429 限流文案 / 后端 message 透传）。收进 hook（终审 M-g）：
   * setValue 时若存在 formError 即清掉——429 横幅挂起期间用户改任一字段，
   * 横幅即时消失；同值 setState 有 React 短路，无额外渲染开销。 */
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

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
      if (navigateAfterSuccess) {
        // location.state.from 由 RequireAuth 守卫落（被拦地址）；缺席回退文档页。
        navigate(location.state?.from?.pathname ?? ROUTE_DOCUMENTS);
      }
    } catch {
      // 失败呈现收敛在调用方 onSubmit 内（setFormError 横幅）；此处吞掉防
      // 路由层 `void submit()` 变成 unhandled rejection。
    } finally {
      setSubmitting(false);
    }
  }, [values, validate, onSubmit, navigateAfterSuccess, navigate, location.state]);

  const state: AuthFormState<T> = { values, errors, touched, submitting, formError };
  return { ...state, setFormError, setValue, submit };
}
