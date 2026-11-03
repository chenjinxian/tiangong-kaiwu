/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * BRep 拓扑叠加层生命周期（2026-11-03）：body 读面/树刷新 → 读取全部拓扑边与
 * 顶点 → 注册 BrepTopologyDecoration。显示设置变化只更新装饰件样式，
 * 不重复读后端；树提交/undo-redo/隐藏集变化才重取。
 *
 * 读面走 editor SolidModeling 命令（readBrepTopology），命令被其他编辑工具
 * 占用时静默保留上一份拓扑；8s 超时兜底避免 ipc 悬挂卡住整页。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import type { BodyInfo } from '@luban-cad/shared';
import { BrepTopologyDecoration, type BrepTopology } from '@luban-cad/viewer';
import { readBrepTopology } from '../internal/brep-topology.js';
import { withExclusiveBrepCommand } from '../internal/brep-command-coordinator.js';
import { brepOverlayOptionsFor, type DisplaySettings } from '../internal/display-actions.js';

const READ_TIMEOUT_MS = 8_000;
const FETCH_DEBOUNCE_MS = 120;
/** 新建实体提交后几何缓存可能晚于树/body 读面可读；空读面按退避重试。 */
const READ_ATTEMPTS = 5;
const READ_RETRY_MS = 1_500;

export interface UseBrepTopologyOptions {
  connection?: BriefcaseConnection;
  viewport?: ScreenViewport | null;
  /** getBodies 读面；仅 active authored body 参与。 */
  bodies: readonly BodyInfo[];
  bodiesLoaded: boolean;
  /** 树/特征刷新令牌（树数组身份即可，不参与内容计算）。 */
  revision: unknown;
  /** store.canvas.hiddenIds（隐藏 body 不画拓扑叠加）。 */
  hiddenIds: readonly string[];
  display: DisplaySettings;
  enabled?: boolean;
}

export interface UseBrepTopologyResult {
  topology?: BrepTopology;
  loading: boolean;
  /** undefined = 未出错；命令占用等静默场景保持 undefined 并保留上一份拓扑。 */
  error?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(undefined);
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

export function useBrepTopology({
  connection,
  viewport,
  bodies,
  bodiesLoaded,
  revision,
  hiddenIds,
  display,
  enabled = true,
}: UseBrepTopologyOptions): UseBrepTopologyResult {
  const decorationRef = useRef<BrepTopologyDecoration>();
  const [topology, setTopology] = useState<BrepTopology>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const hiddenKey = hiddenIds.join('|');
  const edgeOptions = useMemo(() => brepOverlayOptionsFor(display), [display]);

  // 视口生命周期：创建/销毁装饰件（样式与已有拓扑立刻回填）。
  useEffect(() => {
    if (!viewport)
      return;
    const decoration = new BrepTopologyDecoration(viewport, edgeOptions);
    decorationRef.current = decoration;
    if (topology)
      decoration.setTopology(topology);
    return () => {
      decoration.dispose();
      if (decorationRef.current === decoration)
        decorationRef.current = undefined;
    };
    // 只随视口重建；样式/拓扑由下面的 effect 更新。
  }, [viewport]);

  // 样式变更（显示设置）。
  useEffect(() => {
    decorationRef.current?.setOptions(edgeOptions);
  }, [edgeOptions]);

  // 连接切换：先清空旧库拓扑，防止新视口短暂画出上一库的边。
  useEffect(() => {
    setTopology(undefined);
    decorationRef.current?.setTopology(undefined);
  }, [connection]);

  // 拓扑刷新（body 读面/树刷新/隐藏集变化）。
  useEffect(() => {
    if (!connection || !viewport || !bodiesLoaded || !enabled) {
      setLoading(false);
      return;
    }

    const hidden = new Set(hiddenIds);
    const visibleBodies = bodies.filter((body) =>
      body.active !== false && body.authored !== false && !hidden.has(body.bodyKey));
    if (visibleBodies.length === 0) {
      const empty: BrepTopology = { edges: [], vertices: [] };
      setTopology(empty);
      decorationRef.current?.setTopology(empty);
      setLoading(false);
      setError(undefined);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const publish = (result: BrepTopology): void => {
      setTopology(result);
      setError(undefined);
      decorationRef.current?.setTopology(result);
    };
    const attempt = (n: number): void => {
      void (async () => {
        const result = await withTimeout(
          withExclusiveBrepCommand(() => readBrepTopology(connection.key, visibleBodies)),
          READ_TIMEOUT_MS,
        );
        if (cancelled) return;
        // 读面为空不一定是「无体」：刚提交的新体可能几何缓存尚未落定；
        // 退避重试，直到拿到边或预算耗尽（期间保留上一份显示）。
        const ready = result !== undefined && (result.edges.length > 0 || visibleBodies.length === 0);
        if (ready) {
          setLoading(false);
          publish(result);
          return;
        }
        if (n + 1 < READ_ATTEMPTS) {
          retryTimer = setTimeout(() => attempt(n + 1), READ_RETRY_MS * (n + 1));
          return;
        }
        setLoading(false);
        if (result !== undefined)
          publish(result);
      })();
    };
    const timer = setTimeout(() => {
      setLoading(true);
      attempt(0);
    }, FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (retryTimer !== undefined)
        clearTimeout(retryTimer);
    };
  }, [connection, viewport, bodies, bodiesLoaded, revision, hiddenKey, enabled, hiddenIds]);

  return { topology, loading, error };
}
