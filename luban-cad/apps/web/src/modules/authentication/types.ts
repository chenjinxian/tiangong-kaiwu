export interface AuthFormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  submitting: boolean;
  /** 表单级错误（429 限流文案 / 后端 message 透传），由 hook 持有并经
   * setValue 自动清除（终审 M-g）。 */
  formError: string | null;
}
