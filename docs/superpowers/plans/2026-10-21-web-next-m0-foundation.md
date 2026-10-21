# web-next M0（地基）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 `apps/web-next` + `packages/viewer-next` 可运行地基：别名与分层边界、Onshape 皮肤令牌（实测钉值）、app/providers/i18n 骨架、会话层移植、查看器初始化移植 + 真实栈冒烟。

**Architecture:** 并行新包（旧 apps/web 不动）；viewer-next 以 link: 消费 vendored itwinjs-core 并移植 `web-viewer/WebInitializer.ts` 的已验证启动序列（LocalhostIpcApp + RPC 通道 + AccuSnap）；web-next 只做壳（providers/routes/令牌），领域逻辑后续里程碑进 modules。

**Tech Stack:** React 18 + Vite ^6.4.3 + TypeScript ~5.6.2（strict）+ @tanstack/react-query ^5 + i18next ^21/react-i18next ^12 + iTwinUI（@itwin/itwinui-react 3.22 线）+ Vitest ^4.1.10 + Playwright ^1.42；zustand 不在 M0 引入（首个 store 落地时再进，YAGNI）。

**Spec:** `docs/superpowers/specs/2026-10-21-web-next-onshape-parity-design.md`（§0 铁律 / §1 结构命名 / §2 数据层 / §4 令牌 / §5 查看器 / §8 基线清理——本计划实现其 M0 行）

## Global Constraints

- dev 端口 **:5310**（53xx 段；完成后登记 `docs/PORTS.md`）
- itwinjs-core 一律 `link:../../../itwinjs-core/...` 源码消费；禁止 npm 安装 @itwin/core-* / editor-* 运行时包
- 命名规范（spec §1，itwinjs-core 规则）：文件名=主导出物（组件/类/类型 PascalCase；纯函数 camelCase）；类型文件 `XxxTypes.ts`；数据封装 `XxxClient.ts`；目录小写 kebab；测试进 `test/` 子目录、`被测物.test.ts(x)`；`internal/` 放非公开实现
- 分层依赖方向 `app → routes → modules → clients/common/components`，禁止反向；跨 modules 引用只准 `index.ts` barrel（ESLint 强制）
- 样式：组件禁裸色值/魔法间距，只准引用 iTwinUI 变量与令牌阶梯；`@itwin/itwinui-react/styles.css` 必须最先导入
- 提交纪律：每任务一提交，消息格式 `<type>(web-next): <中文摘要>`，结尾 `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- 后端事实：MS :5401（WebSocket IPC `/ipc`、RPC 同端口）、hub :5400；环境变量 `VITE_MS_URL` / `VITE_HUB_URL`

---

### Task 1: `apps/web-next` 包骨架（可启动、可测）

**Files:**
- Create: `luban-cad/apps/web-next/package.json`
- Create: `luban-cad/apps/web-next/vite.config.ts`
- Create: `luban-cad/apps/web-next/tsconfig.json`
- Create: `luban-cad/apps/web-next/index.html`
- Create: `luban-cad/apps/web-next/.env.development`
- Create: `luban-cad/apps/web-next/src/main.tsx`
- Create: `luban-cad/apps/web-next/src/app/App.tsx`
- Test: `luban-cad/apps/web-next/src/app/test/App.test.tsx`

**Interfaces:**
- Produces: 可 `pnpm dev`（:5310）、`pnpm test`（vitest）的空应用；`App` 组件（后续任务替换其内部实现）

- [ ] **Step 1: 写失败测试**

```tsx
// src/app/test/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../App.js';

describe('App', () => {
  it('渲染应用根占位', () => {
    render(<App />);
    expect(screen.getByTestId('app-root')).toBeDefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd luban-cad/apps/web-next && npx vitest run src/app/test/App.test.tsx`
Expected: FAIL（App 不存在）

- [ ] **Step 3: 实现包骨架**

`package.json`（版本与 apps/web 对齐，source of truth = `luban-cad/apps/web/package.json`）:

```json
{
  "name": "@luban-cad/web-next",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "lint": "eslint \"src/**/*.ts*\" 1>&2"
  },
  "dependencies": {
    "@itwin/itwinui-react": "^3.22.0",
    "@itwin/itwinui-icons-react": "^2.9.0",
    "@luban-cad/shared": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "i18next": "^21.9.1",
    "i18next-browser-languagedetector": "^6.1.2",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-i18next": "^12.3.1",
    "react-router-dom": "^6.20.0"
  },
  "devDependencies": {
    "@itwin/eslint-plugin": "^6.0.0",
    "@testing-library/dom": "^10.0.0",
    "@testing-library/react": "^16.2.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.3.0",
    "eslint": "^9.31.0",
    "jsdom": "^26.0.0",
    "typescript": "~5.6.2",
    "vite": "^6.4.3",
    "vitest": "^4.1.10"
  }
}
```

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
// defineConfig 取自 vitest/config：内联 test 配置需要，纯 vite 导出在 tsc --noEmit 下报 TS2769
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5310,
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/itwins': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/imodels': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/accesscontrol': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/users': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
      '/files': { target: 'http://localhost:5400', changeOrigin: true, secure: false },
    },
  },
  resolve: {
    alias: {
      '@app': '/src/app',
      '@config': '/src/config',
      '@clients': '/src/clients',
      '@common': '/src/common',
      '@components': '/src/components',
      '@modules': '/src/modules',
      '@routes': '/src/routes',
      '@styles': '/src/styles',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@app/*": ["src/app/*"],
      "@config/*": ["src/config/*"],
      "@clients/*": ["src/clients/*"],
      "@common/*": ["src/common/*"],
      "@components/*": ["src/components/*"],
      "@modules/*": ["src/modules/*"],
      "@routes/*": ["src/routes/*"],
      "@styles/*": ["src/styles/*"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LubanCAD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.env.development`:

```
VITE_MS_URL=http://localhost:5401
VITE_HUB_URL=http://localhost:5400
```

`src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@itwin/itwinui-react/styles.css';
import { App } from './app/App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/app/App.tsx`:

```tsx
import React from 'react';

export function App(): React.JSX.Element {
  return <div data-testid="app-root" />;
}
```

- [ ] **Step 4: 跑测试与 dev server 确认通过**

Run: `cd luban-cad && pnpm install && cd apps/web-next && npx vitest run src/app/test/App.test.tsx`
Expected: PASS（1 passed）

Run: `cd luban-cad/apps/web-next && npx vite --port 5310 &`（后台）→ `curl -s -o /dev/null -w "%{http_code}" http://localhost:5310`
Expected: `200`；验证后停掉 dev server

- [ ] **Step 5: Commit**

```bash
git add luban-cad/apps/web-next
git commit -m "feat(web-next): 包骨架——vite6+react18+vitest，dev :5310，路径别名与代理"
```

---

### Task 2: ESLint 分层边界（跨 module 深引用即红）

**Files:**
- Create: `luban-cad/apps/web-next/eslint.config.js`

**Interfaces:**
- Consumes: Task 1 的包结构
- Produces: `npm run lint` 强制 spec §1 规则（modules 深引用禁令）

- [ ] **Step 1: 配置 lint（红——先写一个故意违规文件验证规则生效）**

`eslint.config.js`（真实配置，两条边界块分开限定 files）:

```js
import itwinPlugin from '@itwin/eslint-plugin';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@itwin': itwinPlugin },
  },
  {
    // spec §1 规则 4：跨 module 只准走 index.ts barrel
    files: ['src/modules/**/*.ts', 'src/modules/**/*.tsx'],
    ignores: ['src/modules/*/index.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@modules/*/*', '@modules/*/*/**'],
          message: '跨模块只准 import 模块入口 @modules/<name>（index.ts barrel）',
        }],
      }],
    },
  },
  {
    // 分层方向：下层禁引上层
    files: ['src/clients/**/*.ts', 'src/common/**/*.ts', 'src/components/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@app/**', '@routes/**', '@modules/**'],
          message: 'clients/common/components 不得依赖上层（app/routes/modules）',
        }],
      }],
    },
  },
];
```

- [ ] **Step 2: 验证规则生效（红）**

临时创建 `src/common/probe.ts` 内容 `export const x = 1;` 与 `src/common/probe-imports-app.ts` 内容：

```ts
// 故意违规：common 引用 app——lint 必须红
import { App } from '@app/App.js';
export const y = App;
```

Run: `cd luban-cad/apps/web-next && npm run lint`
Expected: FAIL（报 no-restricted-imports）

- [ ] **Step 3: 删除探针文件（绿）**

删除 `probe.ts` / `probe-imports-app.ts`，再跑 `npm run lint`
Expected: PASS（0 error）

- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next/eslint.config.js
git commit -m "feat(web-next): ESLint 分层边界——跨 module 只准 barrel、common 禁引上层"
```

---

### Task 3: Onshape 皮肤令牌层（实测钉值）

**Files:**
- Create: `luban-cad/apps/web-next/src/styles/tokens/onshape-skin.css`
- Create: `luban-cad/apps/web-next/src/styles/global.css`
- Modify: `luban-cad/apps/web-next/src/main.tsx`（样式导入顺序）
- Test: `luban-cad/apps/web-next/src/styles/test/onshape-skin.test.ts`

**Interfaces:**
- Produces: CSS 变量 `--lx-accent-hsl`、`--lx-backdrop`、`--lx-surface`、`--lx-border`、`--lx-control-height`、`--lx-font-size-body`、`--lx-radius` 及暗色 `[data-theme='dark']` 覆写；后续所有组件只准引用这些与 iTwinUI 原生变量

- [ ] **Step 1: 从采集截图取色（钉值）**

Run（PowerShell，对 `ui-audit/os-01-documents.png` 的创建按钮中心 ≈(107,115) 与页面底 ≈(700,600) 取样）:

```powershell
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('D:\Github\tiangong-kaiwu\.superpowers\sdd\2026-10-15-rw4-frontend-ia\onshape-audit\os-01-documents.png')
$accent = $src.GetPixel(107, 115); $backdrop = $src.GetPixel(700, 600)
"accent R={0} G={1} B={2}" -f $accent.R, $accent.G, $accent.B
"backdrop R={0} G={1} B={2}" -f $backdrop.R, $backdrop.G, $backdrop.B
$src.Dispose()
```

Expected: 输出两组 RGB（accent 预期蓝色系；backdrop 预期 `~(245,246,247)`）。把 RGB 转成 `H S L` 写进下一步的变量。

- [ ] **Step 2: 写令牌测试（先失败）**

```ts
// src/styles/test/onshape-skin.test.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../tokens/onshape-skin.css'), 'utf8');

describe('onshape-skin 令牌', () => {
  it('定义 accent/backdrop/密度/字阶/圆角核心变量', () => {
    for (const name of ['--lx-accent-hsl', '--lx-backdrop', '--lx-surface', '--lx-border',
      '--lx-control-height', '--lx-font-size-body', '--lx-radius']) {
      expect(css).toContain(name);
    }
  });
  it('accent 钉 Onshape 实测蓝（os-01 取色）', () => {
    expect(css).toMatch(/--lx-accent-hsl:\s*\d+ \d+% \d+%/);
  });
  it('提供暗色主题覆写', () => {
    expect(css).toContain("[data-theme='dark']");
  });
  it('backdrop 钉实测中性灰', () => {
    expect(css).toMatch(/--lx-backdrop:\s*#f[0-9a-f]{5}/i);
  });
});
```

Run: `npx vitest run src/styles/test/onshape-skin.test.ts` → Expected: FAIL（文件不存在）

- [ ] **Step 3: 实现令牌文件**

```css
/* onshape-skin.css — Onshape 实测令牌（来源 onshape-audit/os-01 取色）
 * 规则：本文件只做 iTwinUI 变量覆写与 --lx-* 语义令牌；组件禁写裸色值。 */
:root {
  /* accent：os-01 创建按钮取色（Task3 Step1 输出，转 HSL 填入） */
  --lx-accent-hsl: 216 72% 47%;
  --lx-accent: hsl(var(--lx-accent-hsl));
  /* 中性面 */
  --lx-backdrop: #f5f6f7;
  --lx-surface: #ffffff;
  --lx-border: #e3e5e8;
  /* 密度（Onshape 32px 控件带 / 13px 字阶 / 近直角） */
  --lx-control-height: 32px;
  --lx-font-size-body: 13px;
  --lx-radius: 2px;
  /* 覆写 iTwinUI 语义 */
  --iui-color-background-backdrop: var(--lx-backdrop);
  --iui-color-border: var(--lx-border);
  --iui-border-radius-1: var(--lx-radius);
}

[data-theme='dark'] {
  --lx-backdrop: #1f2124;
  --lx-surface: #26282b;
  --lx-border: #3a3d40;
}
```

（`--lx-accent-hsl` 数值以 Step 1 实测为准覆写；`#f5f6f7` 若与取样有差以实测为准。）

`src/styles/global.css`:

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-size: var(--lx-font-size-body);
  background: var(--lx-backdrop);
  -webkit-font-smoothing: antialiased;
}
```

`src/main.tsx` 样式导入顺序（必须在 App 之前）:

```tsx
import '@itwin/itwinui-react/styles.css';
import './styles/tokens/onshape-skin.css';
import './styles/global.css';
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/styles/test/onshape-skin.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: Commit**

```bash
git add luban-cad/apps/web-next/src/styles luban-cad/apps/web-next/src/main.tsx
git commit -m "feat(web-next): Onshape 皮肤令牌层——os-01 取色钉值+暗色映射+守卫测试"
```

---

### Task 4: app 壳（providers / env / 路由 / 错误边界 / 令牌样张页）

**Files:**
- Create: `luban-cad/apps/web-next/src/config/env.ts`
- Create: `luban-cad/apps/web-next/src/config/routes.ts`
- Create: `luban-cad/apps/web-next/src/app/providers/AppProviders.tsx`
- Create: `luban-cad/apps/web-next/src/app/providers/ThemeContext.tsx`
- Create: `luban-cad/apps/web-next/src/app/error-boundaries/GlobalErrorBoundary.tsx`
- Create: `luban-cad/apps/web-next/src/routes/routes.ts`
- Create: `luban-cad/apps/web-next/src/routes/DevTokensRoute.tsx`
- Modify: `luban-cad/apps/web-next/src/app/App.tsx`
- Test: `luban-cad/apps/web-next/src/app/test/App.test.tsx`（扩展）

**Interfaces:**
- Produces: `AppProviders`（QueryClient+Theme+i18n 编排）、`useTheme()`（`{theme, toggleTheme}`，写 `documentElement[data-theme]` + localStorage `luban-next-theme`）、`env`（`{msUrl, hubUrl}`）、路由表（M0 仅 `/` 令牌样张）

- [ ] **Step 1: 扩展失败测试**

在 `src/app/test/App.test.tsx` 追加：

```tsx
it('令牌样张页渲染 iTwinUI 主按钮', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: '主按钮' })).toBeDefined();
});

it('默认路由是令牌样张', () => {
  render(<App />);
  expect(screen.getByTestId('dev-tokens-route')).toBeDefined();
});
```

Run → Expected: FAIL

- [ ] **Step 2: 实现 app 壳**

`src/config/env.ts`:

```ts
/** 构建期环境（Vite 静态注入；缺省值供本地栈直跑）。 */
export const env = {
  msUrl: import.meta.env.VITE_MS_URL ?? 'http://localhost:5401',
  hubUrl: import.meta.env.VITE_HUB_URL ?? 'http://localhost:5400',
} as const;
```

`src/app/providers/ThemeContext.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'luban-next-theme';

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: 'light',
  toggleTheme: () => {},
});

function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* 隐私模式等——走默认 */ }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* 忽略 */ }
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  return useContext(ThemeContext);
}
```

`src/app/providers/AppProviders.tsx`:

```tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ThemeContext.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
```

`src/app/error-boundaries/GlobalErrorBoundary.tsx`（类组件边界，白屏兜底）:

```tsx
import React from 'react';

interface State { error: Error | null; }

export class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  public override state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public override render(): React.ReactNode {
    if (this.state.error) {
      return <div role="alert" style={{ padding: 24 }}>应用出错：{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}
```

`src/config/routes.ts`:

```ts
import type { RouteObject } from 'react-router-dom';
import { DevTokensRoute } from '@routes/DevTokensRoute.js';

/** 路由表（M0：仅令牌样张；后续里程碑按页追加）。 */
export const routes: RouteObject[] = [
  { path: '/', element: <DevTokensRoute /> },
];
```

`src/routes/DevTokensRoute.tsx`（令牌验收载体——主按钮五态样张）:

```tsx
import React from 'react';
import { Button, Input, Table } from '@itwin/itwinui-react';

export function DevTokensRoute(): React.JSX.Element {
  return (
    <div data-testid="dev-tokens-route" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Button styleType="high-visibility">主按钮</Button>
      <Button>次按钮</Button>
      <Button disabled>禁用</Button>
      <Input placeholder="输入框样张" />
      <Table
        columns={[{ id: 'name', Header: '名称', accessor: 'name' }]}
        data={[{ name: '样例行' }]}
        emptyTableContent="空态样张"
      />
    </div>
  );
}
```

`src/app/App.tsx`（替换为路由编排）:

```tsx
import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppProviders } from './providers/AppProviders.js';
import { GlobalErrorBoundary } from './error-boundaries/GlobalErrorBoundary.js';
import { routes } from '@config/routes.js';

const router = createBrowserRouter(routes);

export function App(): React.JSX.Element {
  return (
    <GlobalErrorBoundary>
      <AppProviders>
        <div data-testid="app-root">
          <RouterProvider router={router} />
        </div>
      </AppProviders>
    </GlobalErrorBoundary>
  );
}
```

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run src/app/test/App.test.tsx`
Expected: PASS（3 passed；i18n 在 Task 5 接入前 Provider 暂不含 I18n）

- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next/src
git commit -m "feat(web-next): app 壳——providers/env/路由/错误边界+令牌样张页"
```

---

### Task 5: i18n 骨架（zh-CN 默认 / en，localStorage 记忆）

**Files:**
- Create: `luban-cad/apps/web-next/src/common/i18n/index.ts`
- Create: `luban-cad/apps/web-next/src/common/i18n/locales/zh-CN/common.json`
- Create: `luban-cad/apps/web-next/src/common/i18n/locales/en/common.json`
- Modify: `luban-cad/apps/web-next/src/app/providers/AppProviders.tsx`
- Test: `luban-cad/apps/web-next/src/common/i18n/test/i18n.test.ts`

**Interfaces:**
- Produces: `initI18n()`（返回 I18n 实例；语言探测顺序 localStorage `luban-next-lang` → navigator → zh-CN）；`changeAppLanguage(lang)`

- [ ] **Step 1: 写失败测试**

```ts
// src/common/i18n/test/i18n.test.ts
import { describe, expect, it } from 'vitest';
import { changeAppLanguage, initI18n } from '../index.js';

describe('i18n 骨架', () => {
  it('默认 zh-CN，键命中', async () => {
    const i18n = await initI18n();
    expect(i18n.language).toBe('zh-CN');
    expect(i18n.t('common.app.name')).toBe('鲁班CAD');
  });
  it('切换 en 并持久化', async () => {
    const i18n = await initI18n();
    await changeAppLanguage('en');
    expect(i18n.t('common.app.name')).toBe('LubanCAD');
    expect(localStorage.getItem('luban-next-lang')).toBe('en');
  });
  it('en 词库与 zh-CN 键集一致（键奇偶守卫）', async () => {
    const zh = (await import('../locales/zh-CN/common.json')).default;
    const en = (await import('../locales/en/common.json')).default;
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });
});
```

Run → Expected: FAIL

- [ ] **Step 2: 实现**

`src/common/i18n/index.ts`:

```ts
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en/common.json';

const LANG_KEY = 'luban-next-lang';

export type AppLanguage = 'zh-CN' | 'en';

function detectLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch { /* 忽略 */ }
  return navigator.language.startsWith('en') ? 'en' : 'zh-CN';
}

let instance: I18n | null = null;

export async function initI18n(): Promise<I18n> {
  if (instance) return instance;
  await i18next.use(initReactI18next).init({
    resources: {
      'zh-CN': { common: zhCommon },
      en: { common: enCommon },
    },
    lng: detectLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  });
  instance = i18next;
  return instance;
}

export async function changeAppLanguage(lang: AppLanguage): Promise<void> {
  await initI18n();
  await i18next.changeLanguage(lang);
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* 忽略 */ }
}
```

`locales/zh-CN/common.json`:

```json
{ "app": { "name": "鲁班CAD" } }
```

`locales/en/common.json`:

```json
{ "app": { "name": "LubanCAD" } }
```

`AppProviders.tsx`：包一层 i18n 就绪门（`useEffect` 调 `initI18n()` 后 setReady 渲染 children）。

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run src/common/i18n/test/i18n.test.ts src/app/test/App.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next/src
git commit -m "feat(web-next): i18n 骨架——zh-CN 默认/en，localStorage 记忆+键奇偶守卫"
```

---

### Task 6: 会话层移植（clients/auth）

**Files:**
- Create: `luban-cad/apps/web-next/src/clients/http/ApiClientError.ts`
- Create: `luban-cad/apps/web-next/src/clients/auth/AuthSession.ts`
- Create: `luban-cad/apps/web-next/src/clients/auth/LubanAuthorizationClient.ts`
- Test: `luban-cad/apps/web-next/src/clients/auth/test/AuthSession.test.ts`

**Interfaces:**
- Consumes: hub `/auth/login` `/auth/refresh`（POST，refresh 走 `Authorization: Bearer <refreshToken>` 头——与旧应用一致）
- Produces:
  - `AuthSession.getStoredAuth(): StoredAuth | null`（sessionStorage `luban-next-auth`）
  - `AuthSession.storeAuth(auth: StoredAuth): void`、`AuthSession.clearAuth(): void`
  - `AuthSession.login(email, password): Promise<AuthUser>`（成功即 store）
  - `AuthSession.getValidAccessToken(): Promise<string>`（过期→单飞刷新→重试一次）
  - `class LubanAuthorizationClient implements core-common AuthorizationClient`（`getAccessToken()` 委托 `getValidAccessToken`）

- [ ] **Step 1: 写失败测试**（mock `fetch`；用 `vi.useFakeTimers` 控制过期）

```ts
// src/clients/auth/test/AuthSession.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../AuthSession.js';

const HUB = 'http://localhost:5400';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function tokenPayload(expOffsetSec: number): string {
  const payload = { exp: Math.floor(Date.now() / 1000) + expOffsetSec };
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

describe('AuthSession', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('login 成功存会话并返回用户', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      token: tokenPayload(900), refreshToken: 'r1', tokenExpires: Date.now() + 900_000,
      user: { id: '3', email: 't@e.com', name: 'Test User' },
    })));
    const user = await AuthSession.login('t@e.com', 'pw');
    expect(user.name).toBe('Test User');
    expect(AuthSession.getStoredAuth()?.refreshToken).toBe('r1');
  });

  it('过期时单飞刷新：并发 3 请求只发 1 次 /auth/refresh', async () => {
    AuthSession.storeAuth({
      accessToken: tokenPayload(-10), refreshToken: 'r-old',
      expiresAt: Date.now() - 10_000, user: { id: '3', email: 't@e.com', name: 'T' },
    });
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse({
          token: tokenPayload(900), refreshToken: 'r-new', tokenExpires: Date.now() + 900_000,
        }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([AuthSession.getValidAccessToken(), AuthSession.getValidAccessToken(), AuthSession.getValidAccessToken()]);
    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(AuthSession.getStoredAuth()?.refreshToken).toBe('r-new');
  });

  it('刷新失败清场并抛 ApiClientError(401)', async () => {
    AuthSession.storeAuth({
      accessToken: tokenPayload(-10), refreshToken: 'r-dead',
      expiresAt: Date.now() - 10_000, user: { id: '3', email: 't@e.com', name: 'T' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ statusCode: 401 }, 401)));
    await expect(AuthSession.getValidAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(AuthSession.getStoredAuth()).toBeNull();
  });
});
```

Run → Expected: FAIL

- [ ] **Step 2: 实现**（移植旧 `features/auth/services/auth/client.ts` 的 login/refresh/单飞逻辑，端口/键名换 `luban-next-auth`；`ApiClientError`：`{ status, code?, i18nKey }`；`LubanAuthorizationClient.getAccessToken()` 委托 `getValidAccessToken()`）

实现要点（完整代码由实施者对照旧 client.ts 移植，以下为契约钉死项）：
- `SESSION_KEY = 'luban-next-auth'`；`StoredAuth = { accessToken, refreshToken, expiresAt, user }`
- login：`POST ${hubUrl}/auth/login` `{email,password}` → 读 `data.token/refreshToken/tokenExpires/user`
- refresh：`POST ${hubUrl}/auth/refresh`，头 `Authorization: Bearer <refreshToken>`，体 `{refreshToken}`
- 单飞：模块级 `refreshPromise: Promise<string> | null`；并发共享；失败 `clearAuth()` 后抛 `ApiClientError(401)`
- `hubUrl` 从 `@config/env.js` 读

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run src/clients/auth/test/AuthSession.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 4: Commit**

```bash
git add luban-cad/apps/web-next/src/clients
git commit -m "feat(web-next): 会话层移植——AuthSession 单飞刷新+LubanAuthorizationClient"
```

---

### Task 7: `packages/viewer-next`（初始化移植 + 单测）

**Files:**
- Create: `luban-cad/packages/viewer-next/package.json`
- Create: `luban-cad/packages/viewer-next/tsconfig.json`
- Create: `luban-cad/packages/viewer-next/src/host/web-initializer.ts`（移植自 `web-viewer/src/WebInitializer.ts`）
- Create: `luban-cad/packages/viewer-next/src/tools/ensure-accusnap.ts`
- Create: `luban-cad/packages/viewer-next/src/index.ts`
- Test: `luban-cad/packages/viewer-next/src/test/web-initializer.test.ts`

**Interfaces:**
- Consumes: `@luban-cad/shared` 的 `OpenCloudRpcInterface`/`LubanFeatureRpcInterface`；`@itwin/imodels-access-frontend`/`@itwin/imodels-client-management`（npm，版本 ^6.0.2 对齐旧应用）
- Produces:
  - `startViewer(options: { backendUrl: string; hubUrl: string; accessToken?: string }): Promise<void>`（幂等：`IpcApp.isValid` 时跳过 startup 仍重配 RPC）
  - `stopViewer(): Promise<void>`
  - `ensureAccuSnap(timeoutMs?): Promise<boolean>`

- [ ] **Step 1: 写失败测试**（vi.mock core-frontend，断言调用形状）

`tsconfig.json`（镜像 `packages/viewer-core/tsconfig.json`）：`{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "declaration": true, "outDir": "dist", "strict": true, "skipLibCheck": true, "types": ["vitest/globals"] }, "include": ["src"] }`

```ts
// src/test/web-initializer.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startupMock = vi.fn().mockResolvedValue(undefined);
const initializeClientMock = vi.fn();

vi.mock('@itwin/core-frontend', () => ({
  IModelApp: { initialized: false, accuSnap: { enableSnap: vi.fn(), enableLocate: vi.fn() } },
  IpcApp: { isValid: false },
  LocalhostIpcApp: { startup: startupMock, buildUrlForSocket: (u: URL) => u },
}));
vi.mock('@itwin/core-common', () => ({
  BentleyCloudRpcManager: { initializeClient: initializeClientMock },
  IModelReadRpcInterface: class {},
  IModelTileRpcInterface: class {},
}));
vi.mock('@luban-cad/shared', () => ({
  OpenCloudRpcInterface: class {},
  LubanFeatureRpcInterface: class {},
}));
vi.mock('@itwin/editor-frontend', () => ({ EditTools: { initialize: vi.fn() } }));
vi.mock('@itwin/imodels-access-frontend', () => ({ FrontendIModelsAccess: class { constructor(public c: unknown) {} } }));
vi.mock('@itwin/imodels-client-management', () => ({ IModelsClient: class { constructor(public o: unknown) {} } }));

import { startViewer } from '../host/web-initializer.js';

describe('startViewer（移植自 WebInitializer）', () => {
  beforeEach(() => { startupMock.mockClear(); initializeClientMock.mockClear(); });

  it('组装 socketUrl 并注入 token', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400', accessToken: 'jwt-x' });
    expect(startupMock).toHaveBeenCalledTimes(1);
    const arg = startupMock.mock.calls[0][0];
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('localhost:5401');
    expect(String(arg.localhostIpcApp.socketUrl)).toContain('token=jwt-x');
    expect(arg.iModelApp.publicPath).toBe('/');
    expect(arg.iModelApp.authorizationClient).toBeDefined();
  });

  it('rpcInterfaces 含 4 通道（OpenCloud/Feature/Read/Tile）', async () => {
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    const arg = startupMock.mock.calls[0][0];
    expect(arg.iModelApp.rpcInterfaces).toHaveLength(4);
  });

  it('幂等：二次调用不再 startup 但仍重配 RPC', async () => {
    const { IpcApp } = await import('@itwin/core-frontend');
    (IpcApp as unknown as { isValid: boolean }).isValid = true;
    await startViewer({ backendUrl: 'http://localhost:5401', hubUrl: 'http://localhost:5400' });
    expect(startupMock).toHaveBeenCalledTimes(0);
    expect(initializeClientMock).toHaveBeenCalledTimes(1);
  });
});
```

Run → Expected: FAIL

- [ ] **Step 2: 移植实现**（逐行对照 `web-viewer/src/WebInitializer.ts:37-161`：`LocalhostIpcApp.startup` 全参数——socketUrl+token query、`rpcInterfaces = [OpenCloudRpcInterface, LubanFeatureRpcInterface, IModelReadRpcInterface, IModelTileRpcInterface]`、`IModelsClient({api:{baseUrl: `${hubUrl}/imodels`}})` + `FrontendIModelsAccess` + `as never` 跨拷贝 cast、`publicPath:'/'`、authorizationClient 注入、AccuSnap 轮询补启（500ms×60）、`BentleyCloudRpcManager.initializeClient` 幂等重配；保留两处注释（tile flags 定案、publicPath 404 定案）随代码迁移）

`package.json` 依赖（link: 对齐 viewer-core 写法）：

```json
{
  "name": "@luban-cad/viewer-next",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsc", "test": "vitest run", "lint": "eslint \"src/**/*.ts\" 1>&2" },
  "dependencies": {
    "@itwin/core-bentley": "link:../../../itwinjs-core/core/bentley",
    "@itwin/core-common": "link:../../../itwinjs-core/core/common",
    "@itwin/core-frontend": "link:../../../itwinjs-core/core/frontend",
    "@itwin/editor-frontend": "link:../../../itwinjs-core/editor/frontend",
    "@itwin/imodels-access-frontend": "^6.0.2",
    "@itwin/imodels-client-management": "^6.0.2",
    "@luban-cad/shared": "workspace:*"
  },
  "devDependencies": {
    "@itwin/eslint-plugin": "^6.0.0",
    "eslint": "^9.31.0",
    "typescript": "~5.6.2",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 3: 跑测试确认通过 + tsc 构建**

`src/index.ts`（公共入口，Task 8 依赖此导出面）:

```ts
export { startViewer, stopViewer } from './host/web-initializer.js';
export { ensureAccuSnap } from './tools/ensure-accusnap.js';
```

Run: `cd luban-cad && pnpm install && cd packages/viewer-next && npx vitest run && pnpm build`
Expected: 测试 PASS；`dist/` 产出

- [ ] **Step 4: Commit**

```bash
git add luban-cad/packages/viewer-next
git commit -m "feat(web-next): viewer-next 包——WebInitializer 启动序列移植+幂等/AccuSnap 单测"
```

---

### Task 8: 冒烟接线 + 端口登记

**Files:**
- Create: `luban-cad/apps/web-next/src/routes/DevViewerRoute.tsx`
- Modify: `luban-cad/apps/web-next/src/config/routes.ts`（追加 `/dev-viewer`）
- Modify: `luban-cad/apps/web-next/package.json`（增 `@luban-cad/viewer-next": "workspace:*"`）
- Modify: `luban-cad/apps/web-next/vite.config.ts`（增 `optimizeDeps.exclude: ['@luban-cad/viewer-next', '@luban-cad/shared']`——link: 包不做预打包）
- Modify: `docs/PORTS.md`
- Test: `luban-cad/apps/web-next/src/routes/test/DevViewerRoute.test.tsx`

**Interfaces:**
- Consumes: Task 6 `AuthSession.getStoredAuth()`、Task 7 `startViewer/stopViewer`、`env.msUrl`
- Produces: `/dev-viewer` 页——点击「启动查看器」→ 显示 `IpcApp.isValid` 与 `toolAdmin` 就绪状态（真实栈冒烟载体）

- [ ] **Step 1: 写失败测试**（mock viewer-next）

```tsx
// src/routes/test/DevViewerRoute.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const startViewerMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@luban-cad/viewer-next', () => ({
  startViewer: (...a: unknown[]) => startViewerMock(...a),
}));

import { DevViewerRoute } from '../DevViewerRoute.js';

describe('DevViewerRoute', () => {
  it('点击启动后调用 startViewer 并显示 toolAdmin 状态', async () => {
    vi.stubGlobal('IModelApp', { toolAdmin: {} });
    render(<DevViewerRoute />);
    await userEvent.click(screen.getByRole('button', { name: '启动查看器' }));
    await waitFor(() => expect(screen.getByTestId('viewer-status')).toHaveTextContent(/toolAdmin: ready/));
    expect(startViewerMock).toHaveBeenCalledTimes(1);
  });
});
```

Run → Expected: FAIL

- [ ] **Step 2: 实现路由页**（`DevViewerRoute.tsx`：`startViewer({ backendUrl: env.msUrl, hubUrl: env.hubUrl, accessToken: AuthSession.getStoredAuth()?.accessToken })` → 轮询 `IModelApp.toolAdmin`（50ms×30s，对齐旧 useEditorInitialization）→ `data-testid="viewer-status"` 显示 `IpcApp: valid/invalid · toolAdmin: ready/not-ready`）

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run src/routes/test/DevViewerRoute.test.tsx`
Expected: PASS

- [ ] **Step 4: 真实栈冒烟（手动步骤，写入 PR/提交说明）**

前置：本地栈健康（`scripts/verify-stack.ps1` 通过）。登录拿 token：`AuthSession` 需先有会话——M0 用 dev 便捷入口（`DevViewerRoute` 上补一个 email/password 登录钮，调 `AuthSession.login`）。
Run: `cd luban-cad/apps/web-next && pnpm dev` → 浏览器 `http://localhost:5310/dev-viewer` → 登录 → 点「启动查看器」
Expected: 状态显示 `IpcApp: valid · toolAdmin: ready`；MS 日志（`%TEMP%\luban-cad-modeling-server.log`）出现 WebSocket 连接

- [ ] **Step 5: 登记 PORTS.md 并 Commit**

`docs/PORTS.md` 追加：`| web-next dev | 5310 | luban-cad/apps/web-next（Vite dev，并行重写壳） |`

```bash
git add luban-cad/apps/web-next docs/PORTS.md
git commit -m "feat(web-next): 查看器冒烟路由+真实栈验证+端口登记"
```

---

## M0 完成定义（DoD）

1. `pnpm install` 后 `apps/web-next` 可 `dev`（:5310）/`test`/`lint` 全绿
2. 令牌样张页视觉过审（对照 os-01：accent 蓝、灰阶、密度）
3. viewer-next 单测全绿 + `startViewer` 对真实 MS 冒烟：`IpcApp: valid · toolAdmin: ready`
4. PORTS.md 已登记；`apps/web` 全程未受影响（:5300 照跑）
