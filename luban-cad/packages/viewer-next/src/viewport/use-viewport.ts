/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useViewport（web-next M3 Task 3；M4 Task 1 换引用计数接线）：React 侧 viewport 宿主 hook——
 * - 返回 `viewportRef`（div ref）：ScreenViewport 的挂载点；本 hook 只接线
 *   运行时（acquireViewer/releaseViewer）并暴露相位，viewport 创建/连接/Tiling
 *   全链在 M4 Task 2 接管（届时在此 ref 上 create viewport，hook 出口相应扩
 *   viewport 实例/选择回调等）；
 * - 相位出口：`idle → starting → ready | error`——`ready` 表示
 *   LocalhostIpcApp.startup 已完成（IpcApp.isValid，RPC 客户端已配），
 *   供宿主页状态栏等做连接态呈现；
 * - 生命周期：挂载即 acquireViewer（幂等 startViewer + 模块级引用计数——
 *   StrictMode 双挂载/多页签切换均安全），卸载 releaseViewer（计数 1→0 才
 *   真正 shutdown——M3 终审 T3-③「卸载无条件 stopViewer」收口：先卸载方
 *   不再杀掉后挂载方的 host）。backendUrl 同源姿态由消费方决定（web-next
 *   经 vite 代理直连 modeling-server 会被 CORS 拦，传 window.location.origin，
 *   见 apps/web-next vite.config.ts 注记）。
 */

import { type RefObject, useEffect, useRef, useState } from 'react';
import { acquireViewer, releaseViewer } from '../host/web-initializer.js';

/** 运行时相位：idle（未起）→ starting → ready（IPC 就绪）| error。 */
export type ViewportPhase = 'idle' | 'starting' | 'ready' | 'error';

export interface UseViewportOptions {
  /** Backend RPC URL（modeling-server；web-next 传同源代理地址） */
  backendUrl: string;
  /** iModelHub URL（imodelhub-services） */
  hubUrl: string;
  /** Access token for WebSocket authentication */
  accessToken?: string;
}

export interface UseViewportResult {
  /** viewport 挂载点（宿主 div ref；T5/T6 在其上创建 ScreenViewport）。 */
  viewportRef: RefObject<HTMLDivElement>;
  /** 运行时相位（连接态呈现的数据源）。 */
  phase: ViewportPhase;
  /** phase=error 时的可读消息（其余相位为 null）。 */
  error: string | null;
}

export function useViewport(options: UseViewportOptions): UseViewportResult {
  const { backendUrl, hubUrl, accessToken } = options;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<ViewportPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setPhase('starting');
    acquireViewer({ backendUrl, hubUrl, accessToken })
      .then(() => {
        if (mounted) setPhase('ready');
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setPhase('error');
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
      void releaseViewer();
    };
  }, [backendUrl, hubUrl, accessToken]);

  return { viewportRef, phase, error };
}
