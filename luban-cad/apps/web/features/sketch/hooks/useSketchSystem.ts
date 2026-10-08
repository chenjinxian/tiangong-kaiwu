/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import {
  LubanFeatureRpcInterface,
  type FeatureOpResult,
  type SketchConstraintDto,
  type SketchDto,
  type SketchEntityDto,
  type SketchSummaryDto,
} from '@luban-cad/shared';
import type { UseFeatureSystem } from '../../editor/hooks/useFeatureSystem.js';

export interface UseSketchSystem {
  /** iModel 内全部草图摘要（listSketches 读面） */
  sketches: SketchSummaryDto[];
  /** 当前打开草图（getSketch 读面，含现场解算状态；未打开为 undefined） */
  activeSketch?: SketchDto;
  loading: boolean;
  error?: string;
  openSketch(id: string): Promise<void>;
  closeSketch(): void;
  /**
   * 提交 updateSketch op（乐观提交，后端拒收零变更——Design Note 7/E-7：
   * 拒收文本含 dof/冲突 id，即工具的反馈通道，不抛异常）。
   * 成功 → 重取 activeSketch（后端重解算后的新坐标+解算状态）。
   */
  applyUpdate(entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult>;
  /**
   * 提交 insertSketch op；成功后以返回的 featureId（=新草图 id，Task 2 语义）
   * 打开新草图并刷新摘要表。
   */
  createSketch(entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult>;
  /** 重取摘要表 + 活动草图现场解算 */
  refresh(): Promise<void>;
}

/**
 * 草图系统数据 hook（M3-b）：草图摘要/活动草图读面 + insertSketch/updateSketch 提交管道。
 *
 * - 读面：listSketches 载摘要表；openSketch 载实体+约束+现场解算状态（getSketch，
 *   后端现场求解——结构化解的唯一下发通道，无 previewUpdate，见 Design Note 7 裁决）。
 * - 写面：复用 useFeatureSystem.applyOp（写租约 + 特征树刷新由它负责），op 为
 *   insertSketch/updateSketch；后端拒收（ok:false）→ error 状态透出 + 原样返回结果，
 *   不抛异常——工具直接读 FeatureOpResult。
 * - connection.txns.onCommitted → refresh（外部编辑通道如 updateSketchConstraint
 *   可改写草图，重取现场解算）。
 */
export function useSketchSystem(
  connection: BriefcaseConnection | undefined,
  fs: UseFeatureSystem | undefined,
): UseSketchSystem {
  const connectionKey = connection?.key;

  const [sketches, setSketches] = useState<SketchSummaryDto[]>([]);
  const [activeSketch, setActiveSketch] = useState<SketchDto | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // 活动草图 id 走 ref：refresh 回调身份只随 connectionKey 变化，
  // 避免「setActiveSketch(新对象) → refresh 重建 → 挂载 effect 重跑」的取数环。
  const activeIdRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!connectionKey) {
      setSketches([]);
      setActiveSketch(undefined);
      activeIdRef.current = undefined;
      return;
    }
    setLoading(true);
    try {
      const client = LubanFeatureRpcInterface.getClient();
      const activeId = activeIdRef.current;
      const [list, sketch] = await Promise.all([
        client.listSketches(connectionKey),
        activeId ? client.getSketch(connectionKey, activeId) : Promise.resolve(undefined),
      ]);
      setSketches(list);
      setActiveSketch(activeId ? sketch : undefined);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionKey]);

  // 初始/换连接加载摘要表（换连接同时清活动草图，防跨 iModel 错配 id）
  useEffect(() => {
    activeIdRef.current = undefined;
    setActiveSketch(undefined);
    void refresh();
  }, [refresh]);

  // 外部提交（其他编辑通道/外部 changeset）→ 刷新读面
  useEffect(() => {
    if (!connection) return;
    const listener = () => {
      void refresh();
    };
    connection.txns.onCommitted.addListener(listener);
    return () => {
      connection.txns.onCommitted.removeListener(listener);
    };
  }, [connection, refresh]);

  const openSketch = useCallback(
    async (id: string) => {
      if (!connectionKey) {
        setError('未连接 iModel');
        return;
      }
      setLoading(true);
      try {
        const sketch = await LubanFeatureRpcInterface.getClient().getSketch(connectionKey, id);
        activeIdRef.current = id;
        setActiveSketch(sketch);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [connectionKey],
  );

  const closeSketch = useCallback(() => {
    activeIdRef.current = undefined;
    setActiveSketch(undefined);
  }, []);

  const applyUpdate = useCallback(
    async (entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult> => {
      if (!fs) return { ok: false, error: '特征系统未就绪' };
      const activeId = activeIdRef.current;
      if (!activeId) return { ok: false, error: '未打开草图' };
      let result: FeatureOpResult;
      try {
        result = await fs.applyOp({ kind: 'updateSketch', sketchId: activeId, entities, constraints });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { ok: false, error: message };
      }
      if (!result.ok) {
        setError(result.error);
        return result;
      }
      await refresh();
      return result;
    },
    [fs, refresh],
  );

  const createSketch = useCallback(
    async (entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult> => {
      if (!fs) return { ok: false, error: '特征系统未就绪' };
      let result: FeatureOpResult;
      try {
        result = await fs.applyOp({ kind: 'insertSketch', entities, constraints });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        return { ok: false, error: message };
      }
      if (!result.ok) {
        setError(result.error);
        return result;
      }
      // Task 2 语义：featureId 即新草图 id → 打开加载；refresh 补摘要表。
      if (result.featureId) await openSketch(result.featureId);
      await refresh();
      return result;
    },
    [fs, openSketch, refresh],
  );

  return {
    sketches,
    activeSketch,
    loading,
    error,
    openSketch,
    closeSketch,
    applyUpdate,
    createSketch,
    refresh,
  };
}
