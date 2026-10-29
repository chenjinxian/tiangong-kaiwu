import React, { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@itwin/itwinui-react';
import { AuthSession, type AuthUser } from '@clients/auth/AuthSession.js';
import { env } from '@config/env.js';
import { acquireViewer, releaseViewer } from '@luban-cad/viewer';

/**
 * Dev 专用查看器冒烟页（M0 真实栈验证载体，非产品页）：
 * - email/password 登录钮 → `AuthSession.login` 落会话（M0 尚无认证 UI，brief Step 4 钉死的便捷入口）；
 * - 「启动查看器」→ `acquireViewer({ backendUrl: window.location.origin, hubUrl: env.hubUrl, accessToken })`
 *   （M3-T1：MS CORS 钉死 :5300，直连姿态不做 dev 特例——backendUrl 传同源，
 *   viewer 拼出 ws://<origin>/ipc 走 vite 代理转发 MS :5401；env.msUrl 仅作展示）
 *   → 轮询 `IModelApp.toolAdmin`（50ms×30s，对齐旧 `apps/web useEditorInitialization`）；
 * - 「停止查看器」→ `releaseViewer()`（M4-T1 引用计数：与 acquireViewer 成对持有——
 *   单点直调 release 会因计数归 0 前的守卫变 no-op，须与启动同配对）；
 * - `data-testid="viewer-status"` 显示 `IpcApp: valid/invalid · toolAdmin: ready/not-ready`。
 */

/** toolAdmin 就绪轮询参数（T2.3：无界 → 30s 封顶；与旧 useEditorInitialization 同值）。 */
const TOOL_ADMIN_POLL_MS = 50;
const TOOL_ADMIN_TIMEOUT_MS = 30_000;

interface ViewerSnapshot {
  ipcValid: boolean;
  toolAdminReady: boolean;
}

type ViewerPhase = 'idle' | 'starting' | 'ready' | 'timeout' | 'error';

interface ViewerState {
  phase: ViewerPhase;
  ipcValid: boolean | null;
  message: string | null;
}

const IDLE_VIEWER_STATE: ViewerState = { phase: 'idle', ipcValid: null, message: null };

/**
 * 读 IpcApp/IModelApp 就绪态：全局优先（测试经 `vi.stubGlobal` 注入补形，短路后
 * core-frontend 不被加载）；浏览器无此全局（iTwin.js 不导出 window 全局，仅
 * `iModelAppForDebugger`），回退动态 import 直读模块静态——动态 import 使
 * core-frontend 只在本页按下启动后按需加载，不进其它页面的模块图。
 */
async function readViewerState(): Promise<ViewerSnapshot> {
  const globals = globalThis as {
    IpcApp?: { isValid?: boolean };
    IModelApp?: { toolAdmin?: unknown };
  };
  if (globals.IModelApp !== undefined || globals.IpcApp !== undefined) {
    return {
      ipcValid: globals.IpcApp?.isValid === true,
      toolAdminReady: globals.IModelApp?.toolAdmin != null,
    };
  }
  try {
    const core = await import('@itwin/core-frontend');
    return { ipcValid: core.IpcApp.isValid, toolAdminReady: core.IModelApp.toolAdmin != null };
  } catch {
    return { ipcValid: false, toolAdminReady: false };
  }
}

function formatIpcValid(ipcValid: boolean | null): string {
  return ipcValid === null ? '?' : ipcValid ? 'valid' : 'invalid';
}

function viewerStatusText(state: ViewerState): string {
  switch (state.phase) {
    case 'idle':
      return '未启动';
    case 'starting':
      return `IpcApp: ${formatIpcValid(state.ipcValid)} · toolAdmin: not-ready（轮询中）`;
    case 'ready':
      return `IpcApp: ${formatIpcValid(state.ipcValid)} · toolAdmin: ready`;
    case 'timeout':
      return `IpcApp: ${formatIpcValid(state.ipcValid)} · toolAdmin: not-ready（${state.message ?? '超时'}）`;
    case 'error':
      return `启动失败：${state.message ?? '未知错误'}`;
  }
}

export function DevViewerRoute(): React.JSX.Element {
  // ---- 会话（dev 便捷登录） ----
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginUser, setLoginUser] = useState<AuthUser | null>(() => AuthSession.getStoredAuth()?.user ?? null);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ---- 查看器 ----
  const [viewerState, setViewerState] = useState<ViewerState>(IDLE_VIEWER_STATE);
  // 挂载哨兵：StrictMode 下 effect 走 挂载→清理→再挂载，二次挂载须把哨兵拨回 true，
  // 否则首挂载的清理把 ref 留在 false、后续所有 setState 守卫全被吞（真实栈冒烟实证）。
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleLogin = async (): Promise<void> => {
    setLoginError(null);
    try {
      const user = await AuthSession.login(email, password);
      if (mountedRef.current) setLoginUser(user);
    } catch (error) {
      if (mountedRef.current) setLoginError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleStart = (): void => {
    setViewerState({ phase: 'starting', ipcValid: null, message: null });
    void (async () => {
      try {
        await acquireViewer({
          backendUrl: window.location.origin,
          hubUrl: env.hubUrl,
          accessToken: AuthSession.getStoredAuth()?.accessToken,
        });
      } catch (error) {
        if (mountedRef.current) {
          setViewerState({
            phase: 'error',
            ipcValid: null,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      // acquireViewer 已返回（LocalhostIpcApp.startup 完成）；toolAdmin 在 startup 后异步
      // 创建，轮询就绪（语义同旧 useEditorInitialization：50ms 间隔、30s 预算）。
      const deadline = Date.now() + TOOL_ADMIN_TIMEOUT_MS;
      const tick = async (): Promise<void> => {
        if (!mountedRef.current) return;
        const snapshot = await readViewerState();
        if (snapshot.toolAdminReady) {
          setViewerState({ phase: 'ready', ipcValid: snapshot.ipcValid, message: null });
          return;
        }
        if (Date.now() > deadline) {
          setViewerState({
            phase: 'timeout',
            ipcValid: snapshot.ipcValid,
            message: `IModelApp.toolAdmin 未在 ${TOOL_ADMIN_TIMEOUT_MS / 1000}s 内就绪（后端未起或 /ipc WebSocket 失联）`,
          });
          return;
        }
        // 轮询期实时透出 IpcApp 就绪（一旦 observed 为 valid 保持不回退）
        setViewerState((prev) => ({
          phase: 'starting',
          ipcValid: prev.ipcValid || snapshot.ipcValid,
          message: null,
        }));
        window.setTimeout(() => { void tick(); }, TOOL_ADMIN_POLL_MS);
      };
      void tick();
    })();
  };

  const handleStop = (): void => {
    void releaseViewer().then(() => {
      if (mountedRef.current) setViewerState(IDLE_VIEWER_STATE);
    });
  };

  return (
    <div data-testid="dev-viewer-route" style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 720 }}>
      <h2 style={{ margin: 0 }}>查看器冒烟（dev）</h2>

      {/* ---- dev 便捷登录（M0 无认证 UI；brief Step 4 钉死入口） ---- */}
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0 }}>登录（imodelhub）</h3>
        <Input
          data-testid="dev-login-email"
          placeholder="email"
          type="email"
          value={email}
          onChange={(event) => { setEmail(event.target.value); }}
        />
        <Input
          data-testid="dev-login-password"
          placeholder="password"
          type="password"
          value={password}
          onChange={(event) => { setPassword(event.target.value); }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button data-testid="dev-login-submit" onClick={() => { void handleLogin(); }}>登录</Button>
          <span data-testid="dev-login-state">
            {loginUser
              ? `已登录：${loginUser.name}（${loginUser.email}）· token ${AuthSession.getStoredAuth()?.accessToken.slice(0, 12) ?? ''}…`
              : '未登录'}
          </span>
        </div>
        {loginError && <span style={{ color: 'var(--iui-color-text-negative)' }}>登录失败：{loginError}</span>}
      </section>

      {/* ---- 查看器启动冒烟 ---- */}
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0 }}>查看器（modeling-server IPC）</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            styleType="high-visibility"
            data-testid="viewer-start"
            onClick={handleStart}
          >
            启动查看器
          </Button>
          <Button data-testid="viewer-stop" onClick={handleStop}>停止查看器</Button>
          <span data-testid="viewer-status" style={{ fontFamily: 'monospace' }}>
            {viewerStatusText(viewerState)}
          </span>
        </div>
        <span style={{ color: 'var(--iui-color-text-muted)' }}>
          MS: {env.msUrl} · HUB: {env.hubUrl}
        </span>
      </section>
    </div>
  );
}
