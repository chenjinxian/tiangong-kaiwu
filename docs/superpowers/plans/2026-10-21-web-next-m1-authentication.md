# web-next M1（authentication 三页）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web-next 的登录/注册/找回密码三页达到 Onshape 采集证据（pub-01/02/04）的视觉与交互基准，并收掉终审钉给 M1 的三件事（键奇偶深比较 / retryAfterSeconds / accessToken 裁决落地）。

**Architecture:** 模块 `modules/authentication/`（组件+hooks+types 同居），页面挂在路由 `/login` `/register` `/forgot-password`；视觉骨架按 Onshape 采集的「左表单右 hero」分屏（AuthPageShell 模块内自治）；登录即走 M0 已交付的 `AuthSession.login`（端点已修正 `/auth/email/login`）。

**Tech Stack:** React 18 + iTwinUI 3.22 + react-router-dom 6 + i18next + Vitest 4 + react-query（本模块不直接用，登录走 AuthSession 直调）。

**Spec:** `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`（§0 铁律、§1 结构、§4 质感门禁、§6 测试门禁）。本计划实现其 M1 行。

**参照证据：**
- Onshape 采集（只读引用）：`.superpowers/sdd/2026-10-15-rw4-frontend-ia/onshape-audit/pub-01-login.png`（左表单+右 hero+水印）、`pub-02-register.png`（注册卖点行+分步表单）、`pub-04-login-step2.png`（顶部内嵌 toast 错误样式）
- 旧应用移植源（只读参考，勿改）：`luban-cad/apps/web/features/auth/services/auth/client.ts`（202-330 行端点/429 解析）、`luban-cad/apps/web/src/pages/Register/Register.tsx`（55-140 行密码强度规则）

## Global Constraints

- 全部沿用 M0 地基：`@app/@config/@clients/@common/@components/@modules/@routes/@styles` 别名、ESLint 分层（common/clients 禁引上层；跨 modules 只准 `index.ts` barrel）
- 命名规范：spec §1（组件 PascalCase 同名文件；纯函数 camelCase；测试进 `test/`、同名 `.test.ts(x)`）
- 样式：禁裸色值/魔法间距，只准 `--lx-*` 与 iTwinUI 变量；`@itwin/itwinui-react/styles.css` 已在 main.tsx 最先导入
- 会话：access token TTL 15min；429 限流走 `Retry-After-auth` 头；登录成功即跳 `/documents`（该路由 M2 落地前可以是占位，登录后跳转目标以 `routes.ts` 常量为准）
- 提交纪律：每任务一提交，`<type>(web-next): <中文摘要>` + `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- TDD：先写失败测试再实现；每步跑目标测试+全量+lint+tsc

---

### Task 1: M1 开工三件（终审钉子）

**Files:**
- Modify: `luban-cad/apps/web-next/src/common/i18n/test/i18n.test.ts`（守卫升级）
- Modify: `luban-cad/apps/web-next/src/clients/http/ApiClientError.ts`
- Modify: `luban-cad/apps/web-next/src/clients/auth/AuthSession.ts`（login 解析 429 头）
- Modify: `luban-cad/apps/web-next/src/clients/auth/test/AuthSession.test.ts`（补 429 用例）

**Interfaces:**
- Consumes: 现有 i18n/AuthSession
- Produces: `ApiClientError.retryAfterSeconds?: number`；i18n 键奇偶守卫深比较；`AuthSession.login` 429 时抛出携带 retryAfterSeconds 的错误

- [ ] **Step 1: 键奇偶守卫升级——递归深比较（失败测试先行）**

把 `i18n.test.ts` 的「en 词库与 zh-CN 键集一致」用例从顶层浅比较改为展平点路径深比较：

```ts
it('en 词库与 zh-CN 键集一致（展平深比较）', async () => {
  const flatten = (obj: unknown, prefix = ''): string[] =>
    Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      v !== null && typeof v === 'object' && !Array.isArray(v)
        ? flatten(v, `${prefix}${k}.`)
        : [`${prefix}${k}`]);
  const zh = (await import('../locales/zh-CN/common.json')).default;
  const en = (await import('../locales/en/common.json')).default;
  expect(flatten(en).sort()).toEqual(flatten(zh).sort());
});
```

另加一个红测试：在词库里临时给 en 加一个 zh-CN 没有的嵌套键，断言守卫能拦（然后删掉这个临时键——通过即证据）。更简单做法：直接把守卫改成深比较后跑一次全绿即收。

Run: `cd luban-cad/apps/web-next && npx vitest run src/common/i18n/test/i18n.test.ts`

- [ ] **Step 2: ApiClientError 增 retryAfterSeconds + login 解析 429（失败测试先行）**

在 `AuthSession.test.ts` 增加 429 用例：

```ts
it('登录 429：携带 Retry-After-auth 头时错误透出 retryAfterSeconds', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ message: 'Too many requests' }),
    { status: 429, headers: { 'content-type': 'application/json', 'Retry-After-auth': '720' } },
  )));
  await expect(AuthSession.login('t@e.com', 'pw')).rejects.toMatchObject({
    status: 429,
    retryAfterSeconds: 720,
  });
});
```

实现：`ApiClientError.ts` 增 `retryAfterSeconds?: number`（构造函数第三参可选）；`AuthSession.login` 非 2xx 分支里 `response.headers.get('Retry-After-auth')` 解析（Number.parseInt，`Number.isFinite` 守卫，无效值不传），抛错时带上。参照旧 `client.ts:217-223` 的语义。

Run: `npx vitest run src/clients/auth/test/AuthSession.test.ts`（3 旧 + 1 新全绿）

- [ ] **Step 3: spec §2 accessToken 裁决——落地改 spec + 注释**

裁决：**保持现状（access+refresh 都进 sessionStorage 单键）**，与旧应用姿态持平；修订 spec §2 文本把「access token 内存、refresh 持久化」改为「会话单键持久化 sessionStorage（access+refresh 同键，TTL 15min+refresh 续期）」并注明裁决日期与理由（页面刷新体验 vs XSS 面不变——同域存储下 access 单独内存化不缩小攻击面，只损体验）。同时在 `AuthSession.ts` 文件头注释里指回此裁决。

修改：
- `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md` §2 认证段：替换为裁决后的文字（保留原裁决记录格式：「裁决（2026-10-21，终审 I7）：……」）
- `AuthSession.ts` 头注释加一行指回 spec 裁决

无测试变化；跑全量确认无回归。

- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next docs/superpowers/specs
git commit -m "feat(web-next): M1 开工三件——i18n 键奇偶深比较/ApiClientError.retryAfterSeconds/spec §2 accessToken 裁决落地"
```

---

### Task 2: authentication 模块骨架 + 表单原语

**Files:**
- Create: `luban-cad/apps/web-next/src/modules/authentication/types.ts`
- Create: `luban-cad/apps/web-next/src/modules/authentication/AuthPageShell.tsx`
- Create: `luban-cad/apps/web-next/src/modules/authentication/AuthPageShell.css`
- Create: `luban-cad/apps/web-next/src/modules/authentication/AuthFormField.tsx`
- Create: `luban-cad/apps/web-next/src/modules/authentication/hooks/useAuthForm.ts`
- Create: `luban-cad/apps/web-next/src/modules/authentication/index.ts`
- Test: `luban-cad/apps/web-next/src/modules/authentication/test/useAuthForm.test.ts`
- Test: `luban-cad/apps/web-next/src/modules/authentication/test/AuthPageShell.test.tsx`

**Interfaces:**
- Produces（后续任务与 M2 消费）:
  - `AuthPageShell({ hero, children })` — 左表单右 hero 分屏壳（Onshape pub-01 形态）
  - `AuthFormField({ label, name, type, autoComplete, error, showPasswordToggle? })` — 带标签/错误/密码可见切换的输入行
  - `useAuthForm<T>({ initialValues, validate, onSubmit })` — 通用表单状态（values/errors/touched/submitting）+ 防抖校验
  - 模块 barrel `index.ts` 导出以上三件 + `types.ts` 的 `AuthFormState`

- [ ] **Step 1: 写失败测试**

`test/useAuthForm.test.ts`:

```ts
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
```

`test/AuthPageShell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthPageShell } from '../AuthPageShell.js';

describe('AuthPageShell', () => {
  it('渲染分屏：hero 槽位 + 表单槽位', () => {
    render(<AuthPageShell hero={<div data-testid="hero-x" />}><form data-testid="form-x" /></AuthPageShell>);
    expect(screen.getByTestId('hero-x')).toBeDefined();
    expect(screen.getByTestId('form-x')).toBeDefined();
  });
});
```

Run → Expected: FAIL（模块不存在）

- [ ] **Step 2: 实现三件套**

`types.ts`:

```ts
export interface AuthFormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  submitting: boolean;
}
```

`hooks/useAuthForm.ts`（语义钉死：setValue 清本字段错误；submit 先 validate，通过才 onSubmit；submitting 生命周期用 finally 复位；防抖在调用方——hook 内不做防抖）:

```ts
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

  const setValue = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }, []);

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
```

`AuthPageShell.tsx`（分屏壳；hero 槽位即 Onshape 右栏——M1 用令牌面板占位，后续插真图）:

```tsx
import React from 'react';
import './AuthPageShell.css';

export interface AuthPageShellProps {
  /** 右侧视觉槽（Onshape 采集的 hero 位） */
  hero: React.ReactNode;
  children: React.ReactNode;
}

export function AuthPageShell({ hero, children }: AuthPageShellProps): React.JSX.Element {
  return (
    <div className="auth-shell">
      <div className="auth-shell__form">{children}</div>
      <div className="auth-shell__hero">{hero}</div>
    </div>
  );
}
```

`AuthPageShell.css`（布局与密度走 --lx-*，禁裸色值；右栏在窄屏隐藏）:

```css
.auth-shell {
  display: flex;
  min-height: 100vh;
  background: var(--lx-backdrop);
}
.auth-shell__form {
  flex: 0 0 min(560px, 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: var(--lx-surface);
  border-right: 1px solid var(--lx-border);
}
.auth-shell__hero {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lx-backdrop);
}
@media (max-width: 960px) {
  .auth-shell__hero { display: none; }
  .auth-shell__form { flex: 1; }
}
```

`AuthFormField.tsx`（标签/输入/错误/密码眼睛）:

```tsx
import React, { useState } from 'react';
import { IconButton, Input, Text } from '@itwin/itwinui-react';
import { SvgVisibilityShow, SvgVisibilityHide } from '@itwin/itwinui-icons-react';

export interface AuthFormFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name' | 'value' | 'onChange'> {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** 密码型开启可见切换 */
  showPasswordToggle?: boolean;
}

export function AuthFormField({ label, name, value, onChange, error, showPasswordToggle = false, type = 'text', ...rest }: AuthFormFieldProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const effectiveType = showPasswordToggle ? (visible ? 'text' : 'password') : type;
  return (
    <div className="auth-form-field">
      <Text as="label" htmlFor={name} variant="small" style={{ marginBottom: 'var(--lx-size-2xs)' }}>{label}</Text>
      <div className="auth-form-field__control">
        <Input
          id={name}
          name={name}
          type={effectiveType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          status={error ? 'negative' : undefined}
          aria-invalid={!!error}
          {...rest}
        />
        {showPasswordToggle && (
          <IconButton
            styleType="borderless"
            size="small"
            onClick={() => setVisible((v) => !v)}
            label={visible ? '隐藏密码' : '显示密码'}
          >
            {visible ? <SvgVisibilityHide /> : <SvgVisibilityShow />}
          </IconButton>
        )}
      </div>
      {error && <Text variant="small" style={{ color: 'var(--iui-color-text-negative)' }}>{error}</Text>}
    </div>
  );
}
```

（IconButton 名字核对：若 `@itwin/itwinui-icons-react` 无 `SvgVisibilityShow/Hide`，用 `SvgShow/SvgHide`——以已安装版本的实际导出为准，偏差记录进报告。）

`index.ts`（barrel）:

```ts
export { AuthPageShell } from './AuthPageShell.js';
export { AuthFormField } from './AuthFormField.js';
export { useAuthForm } from './hooks/useAuthForm.js';
export type { AuthFormState } from './types.js';
```

- [ ] **Step 3: 跑测试确认通过**

Run: `cd luban-cad/apps/web-next && npx vitest run src/modules/authentication`
Expected: PASS（5 测试）

- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next/src/modules
git commit -m "feat(web-next): authentication 模块骨架——分屏壳+表单原语+useAuthForm"
```

---

### Task 3: 登录页（/login）+ 路由接线

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/SignInRoute.tsx`
- Create: `luban-cad/apps/web-next/src/routes/SignInRoute.css`
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`（加 `/login`）
- Test: `luban-cad/apps/web-next/src/routes/test/SignInRoute.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 `AuthPageShell`/`AuthFormField`/`useAuthForm`；M0 的 `AuthSession.login`；`env.hubUrl`
- Produces: `/login` 完整页（对齐 pub-01 形态）；登录成功跳 `/documents`；429 错误走内嵌提示+秒数文案

- [ ] **Step 1: 写失败测试**（mock AuthSession；jsdom 下验证表单行为）

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loginMock = vi.fn();
vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { login: (...a: unknown[]) => loginMock(...a) } }));

import { SignInRoute } from '../SignInRoute.js';

describe('SignInRoute', () => {
  beforeEach(() => loginMock.mockReset());

  it('渲染邮箱/密码/记住我/登录按钮', () => {
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getByLabelText(/密码|Password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /登录|Sign in/i })).toBeDefined();
  });

  it('校验失败不提交（空表单）', async () => {
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /登录|Sign in/i }));
    expect(loginMock).not.toHaveBeenCalled();
    expect(screen.getByText(/请输入邮箱|required/i)).toBeDefined();
  });

  it('提交成功走 AuthSession.login 并跳转', async () => {
    loginMock.mockResolvedValue({ id: '3', name: 'T' });
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.type(screen.getByLabelText(/密码|Password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /登录|Sign in/i }));
    expect(loginMock).toHaveBeenCalledWith('t@e.com', 'pw');
  });

  it('429 错误显示 retryAfterSeconds 文案', async () => {
    loginMock.mockRejectedValue({ status: 429, retryAfterSeconds: 720 });
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.type(screen.getByLabelText(/密码|Password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /登录|Sign in/i }));
    expect(await screen.findByText(/720/)).toBeDefined();
  });
});
```

Run → FAIL

- [ ] **Step 2: 实现**（形态对齐 pub-01：左表单=logo+Welcome back+副标题+邮箱+密码（眼睛切换）+记住我+忘记密码链接+主按钮+注册链接；右 hero=占位视觉（令牌面板+文案），后续插真图）

语义钉死：
- 校验：邮箱格式 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`、密码非空；错误逐字段
- 提交：`AuthSession.login(email, password)` → 成功 `navigate('/documents')`；429 → 错误区显示「请求过于频繁，请在 X 秒后重试」（i18n key `auth.signIn.tooManyRequests` 带 `seconds` 插值）；其它 → 透传 message
- 密码眼睛切换 = AuthFormField 自带（图标名 Task 2 实施时以已安装 `@itwin/itwinui-icons-react` 实际导出为准，并在报告记录）
- i18n 键进 `common/auth` 命名空间（见 Task 7 词表；Task 3 实现时该命名空间尚未注册——本任务内先把 `src/common/i18n/index.ts` 的 resources 扩 `auth` 命名空间，词表内容 Task 7 补全；本任务先用最小键集让页面跑通：`auth.signIn.*` 所需键）

- [ ] **Step 3: 测试绿 + 全量 + lint + tsc**

Run: `npx vitest run src/routes/test/SignInRoute.test.tsx && npx vitest run && npm run lint && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next/src/routes luban-cad/apps/web-next/src/config luban-cad/apps/web-next/src/common/i18n
git commit -m "feat(web-next): 登录页 /login——分屏壳+邮箱密码+记住我+429 重试文案"
```

---

### Task 4: 注册页（/register）

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/SignUpRoute.tsx`
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`
- Modify: `luban-cad/apps/web-next/src/clients/auth/AuthSession.ts`（register 方法——M0 未带，参照旧 client.ts register：POST `/auth/email/register` `{email,password,firstName,lastName}`）
- Test: `luban-cad/apps/web-next/src/routes/test/SignUpRoute.test.tsx`

**Interfaces:**
- Produces: `/register`（对齐 pub-02 形态：姓名两行+邮箱+密码（强度条+眼睛）+确认密码+同意条款+提交）；`AuthSession.register(email,password,firstName,lastName)`

- [ ] **Step 1: 失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerMock = vi.fn();
vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { register: (...a: unknown[]) => registerMock(...a) } }));

import { SignUpRoute } from '../SignUpRoute.js';

describe('SignUpRoute', () => {
  beforeEach(() => registerMock.mockReset());

  it('渲染姓名/邮箱/密码/确认密码/条款/注册按钮', () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/名|First name/i)).toBeDefined();
    expect(screen.getByLabelText(/姓|Last name/i)).toBeDefined();
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getAllByLabelText(/密码|Password/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /注册|Create account/i })).toBeDefined();
  });

  it('空表单不提交', async () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /注册|Create account/i }));
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('两次密码不一致时报错且不提交', async () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    const passwords = screen.getAllByLabelText(/密码|Password/i);
    await userEvent.type(passwords[0], 'Abcd1234');
    await userEvent.type(passwords[1], 'Xyzw9999');
    await userEvent.click(screen.getByRole('button', { name: /注册|Create account/i }));
    expect(registerMock).not.toHaveBeenCalled();
    expect(screen.getByText(/不一致|match/i)).toBeDefined();
  });

  it('密码强度条随输入出现', async () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    const passwords = screen.getAllByLabelText(/密码|Password/i);
    await userEvent.type(passwords[0], 'Abcd1234!');
    expect(screen.getByTestId('password-strength')).toBeDefined();
  });

  it('提交成功走 AuthSession.register', async () => {
    registerMock.mockResolvedValue({ id: '3' });
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/名|First name/i), 'T');
    await userEvent.type(screen.getByLabelText(/姓|Last name/i), 'U');
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    const passwords = screen.getAllByLabelText(/密码|Password/i);
    await userEvent.type(passwords[0], 'Abcd1234!');
    await userEvent.type(passwords[1], 'Abcd1234!');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /注册|Create account/i }));
    expect(registerMock).toHaveBeenCalledWith('t@e.com', 'Abcd1234!', 'T', 'U');
  });
});
```

Run → FAIL

- [ ] **Step 2: 实现**
- `AuthSession.register`：POST `${env.hubUrl}/auth/email/register` `{email,password,firstName,lastName}`；错误同 login 的 ApiClientError 语义（含 429 retryAfterSeconds）
- 强度条：旧 Register.tsx 的 0–4 规则移植（长度≥8、大小写混合、数字、特殊字符各 +1）；颜色走语义 token（负向/警告/正向）
- 条款勾选非空才能提交

- [ ] **Step 3: 全绿 + Commit**

```bash
git add luban-cad/apps/web-next
git commit -m "feat(web-next): 注册页 /register——姓名/邮箱/密码强度/确认/条款"
```

---

### Task 5: 找回密码页（/forgot-password）

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/ForgotPasswordRoute.tsx`
- Modify: `luban-cad/apps/web-next/src/config/routes.tsx`
- Modify: `luban-cad/apps/web-next/src/clients/auth/AuthSession.ts`（forgotPassword 方法——POST `/auth/forgot/password` `{email}`）
- Test: `luban-cad/apps/web-next/src/routes/test/ForgotPasswordRoute.test.tsx`

**Interfaces:**
- Produces: `/forgot-password`（对齐 pub-04 的单字段形态：邮箱+提交+成功态/错误态）；`AuthSession.forgotPassword(email)`

- [ ] **Step 1: 失败测试**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const forgotMock = vi.fn();
vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { forgotPassword: (...a: unknown[]) => forgotMock(...a) } }));

import { ForgotPasswordRoute } from '../ForgotPasswordRoute.js';

describe('ForgotPasswordRoute', () => {
  beforeEach(() => forgotMock.mockReset());

  it('渲染邮箱输入与提交按钮', () => {
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /发送|Send/i })).toBeDefined();
  });

  it('空邮箱不提交', async () => {
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: /发送|Send/i }));
    expect(forgotMock).not.toHaveBeenCalled();
  });

  it('提交成功显示已发送提示', async () => {
    forgotMock.mockResolvedValue(undefined);
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.click(screen.getByRole('button', { name: /发送|Send/i }));
    expect(forgotMock).toHaveBeenCalledWith('t@e.com');
    expect(await screen.findByText(/已发送|sent/i)).toBeDefined();
  });

  it('提交失败显示错误', async () => {
    forgotMock.mockRejectedValue({ status: 500, message: 'server error' });
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/邮箱|Email/i), 't@e.com');
    await userEvent.click(screen.getByRole('button', { name: /发送|Send/i }));
    expect(await screen.findByText(/失败|error/i)).toBeDefined();
  });
});
```

Run → FAIL

- [ ] **Step 2: 实现**（成功/失败双态；成功后显示提示文案+返回登录链接）

- [ ] **Step 3: 全绿 + Commit**

```bash
git add luban-cad/apps/web-next
git commit -m "feat(web-next): 找回密码页 /forgot-password——邮箱提交+成功/错误双态"
```

---

### Task 6: 结构断言 + 视觉对照验收（pub-01/02/04 并排）

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/test/auth-structure.test.tsx`
- 证据产物（git-ignored）：`.superpowers/sdd/2026-10-21-web-next-m1-authentication/` 下三页截图（与 onshape-audit 的 pub-01/02/04 并排比对）

**Interfaces:**
- Produces: 三页结构断言（每页关键区域存在性）+ 视觉对照证据（并排截图）

- [ ] **Step 1: 结构断言测试**（三页各自的区域完备性——分屏两栏、表单字段数、主按钮、辅助链接、错误区锚点）

```tsx
// auth-structure.test.tsx —— 三页共用一套结构检查器（参数化）
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clients/auth/AuthSession.js', () => ({ AuthSession: { login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn() } }));

import { SignInRoute } from '../SignInRoute.js';
import { SignUpRoute } from '../SignUpRoute.js';
import { ForgotPasswordRoute } from '../ForgotPasswordRoute.js';

describe('认证三页结构完备性', () => {
  it('登录页：分屏 hero 槽位 + 表单 + 主按钮 + 辅助链接', () => {
    render(<MemoryRouter><SignInRoute /></MemoryRouter>);
    expect(screen.getByTestId('auth-hero')).toBeDefined();
    expect(screen.getByRole('button', { name: /登录|Sign in/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /注册|Sign up/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /忘记密码|Forgot/i })).toBeDefined();
  });
  it('注册页：姓名两行+邮箱+密码+确认+条款+提交', () => {
    render(<MemoryRouter><SignUpRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/名|First name/i)).toBeDefined();
    expect(screen.getByLabelText(/姓|Last name/i)).toBeDefined();
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getAllByLabelText(/密码|Password/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /注册|Create account/i })).toBeDefined();
  });
  it('找回页：邮箱+提交+返回登录链接', () => {
    render(<MemoryRouter><ForgotPasswordRoute /></MemoryRouter>);
    expect(screen.getByLabelText(/邮箱|Email/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /发送|Send/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /返回登录|Sign in|Back/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: 视觉对照证据**（dev 起 `pnpm dev`，Playwright 从 apps/web 借驱动截三页到 `.superpowers/sdd/2026-10-21-web-next-m1-authentication/`：login-next.png / register-next.png / forgot-next.png；与 `onshape-audit/pub-01/02/04` 并排读图比对，差异逐项登记——本任务执行者在报告里写明差异清单）

- [ ] **Step 3: Commit**

```bash
git add luban-cad/apps/web-next
git commit -m "test(web-next): 认证三页结构断言+视觉对照证据"
```

---

### Task 7: auth 词表（common/auth 命名空间）

**Files:**
- Create: `luban-cad/apps/web-next/src/common/i18n/locales/zh-CN/auth.json`
- Create: `luban-cad/apps/web-next/src/common/i18n/locales/en/auth.json`
- Modify: `luban-cad/apps/web-next/src/common/i18n/index.ts`（注册 auth 命名空间）
- Test: `luban-cad/apps/web-next/src/common/i18n/test/i18n.test.ts`（键奇偶守卫自然扩到 auth）

**Interfaces:**
- Produces: auth 域键集（登录/注册/找回全部文案+错误文案+强度文案）；键结构 `auth.signIn.*` / `auth.signUp.*` / `auth.forgot.*`

- [ ] **Step 1: 失败测试**（auth 键存在性 + 奇偶）

```ts
it('auth 命名空间：zh/en 键奇偶且关键键存在', async () => {
  // 复用 Task 1 的 flatten
  // 断言 auth.signIn.tooManyRequests / auth.signUp.passwordStrength.weak 等键存在且 zh/en 同构
});
```

Run → FAIL

- [ ] **Step 2: 写词表**（zh-CN + en 两份，键结构按路由页面域分组；词表文案对齐 pub-01/02/04 采集的 Onshape 文案语气——简体中文短句、en 首字母大写）

- [ ] **Step 3: 全绿 + Commit**

```bash
git add luban-cad/apps/web-next/src/common/i18n
git commit -m "feat(web-next): auth 词表——登录/注册/找回文案+强度+错误（zh/en 奇偶）"
```

---

## M1 完成定义（DoD）

1. 三页可访问（/login、/register、/forgot-password），登录成功落 session 并跳 `/documents`（该路由 M2 落地前可 404——跳转动作本身是验收点）
2. 登录 429 显示 retryAfterSeconds 文案（旧应用口头语义已复现）
3. 键奇偶守卫升级为深比较且拦住过漏键；ApiClientError 带 retryAfterSeconds；spec §2 裁决文本已修订
4. 全量 vitest + lint + tsc 绿；结构断言 + 视觉对照证据落档
5. 视觉过审：登录页与 pub-01、注册页与 pub-02、找回页与 pub-04 并排对照，差异项全部登记（允许差异=hero 占位 vs 真图）
