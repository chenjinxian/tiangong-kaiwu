/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useSketchSystem（web M6-a T5）：草图系统数据 hook——退役仓
 * apps/web/features/sketch/hooks/useSketchSystem.ts（M3-b）的**精简移植**。
 *
 * 与 M3-b 的差异（诚实登记）：
 * - 活动身份源换位：M3-b 的 openSketch/closeSketch 本地身份（activeIdRef）
 *   收编为 **store 草图切片**（sketch.activeSketchId——SketchDialog 确认链
 *   enterSketch 真 id / 退出草图 exitSketch 归零，M3 Task 6/M6-a T4 既成事实），
 *   hook 不再持身份只随它加载；openSketch/closeSketch/createSketch API 不随迁
 *   （新建走 SketchDialog 的 insertSketch 直通，编辑入口归 T7 树行路由）。
 * - 读面精简：只留 getSketch（活动草图现场解算）；listSketches 摘要表不随迁
 *   （消费面=草图面板，归 F4/后续里程碑挂载时再补）。
 * - 写面不变：applyUpdate → fs.applyOp({kind:'updateSketch', sketchId, entities,
 *   constraints})（复用 useFeatureSystem.applyOp——写租约/刷新/只读门禁由它
 *   负责）；成功 → 重取活动草图（后端重解算后的新坐标+解算状态）；拒收
 *   （ok:false）→ error 状态透出 + 原样返回，不抛异常——工具直接读
 *   FeatureOpResult（拒收文本含 dof/冲突 id，即工具的反馈通道）。
 *   M6-b T5 增 applyConstraintValue：updateSketchConstraint op（尺寸内联
 *   编辑通道，改值重解算），语义与 applyUpdate 同门禁/同透出口径。
 * - 代际防竞态保留（activeEpochRef）：活动身份切换/换连接时 +1，迟到的
 *   getSketch 解析发现代数过期即丢弃（stale-clobber 防覆写）。
 * - txns.onCommitted → refresh 保留（外部编辑通道如 updateSketchConstraint
 *   可改写草图）。
 * - i18n：web 词桶默认 ns（partStudio.sketch.system.*），i18next 单例
 *   直取（同 useFeatureSystem 口径）。
 *
 * **模块级 accessor**（registerSketchSystemAccessor/getSketchSystem）：
 * 解 M3-b 已知坑——`IModelApp.tools.run(toolId)` 无参启动，工具实例无选项
 * 注入通道（M3-b 的 setOptions 只对 runSketchCreateTool 面板入口有效，AI/
 * 键盘/ribbon 路径全部落空）。accessor 由宿主（PartStudioSession）挂载本
 * hook 时注册、卸载注销，工具运行期 getSketchSystem() 取当前实例——
 * 标准化通道，勿再发明第三套。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import i18next from 'i18next';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import {
  type FeatureOpResult,
  LubanFeatureRpcInterface,
  type SketchConstraintDto,
  type SketchDto,
  type SketchEntityDto,
} from '@luban-cad/shared';
import type { UseFeatureSystem } from './useFeatureSystem.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

export interface UseSketchSystem {
  /** 当前活动草图（getSketch 读面，含现场解算状态；未进草图模式为 undefined）。 */
  activeSketch?: SketchDto;
  loading: boolean;
  error?: string;
  /**
   * 提交 updateSketch op（乐观整体覆写；后端拒收零变更——拒收文本含 dof/
   * 冲突 id，即工具的反馈通道，不抛异常）。成功 → 重取 activeSketch。
   */
  applyUpdate(entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult>;
  /**
   * 改尺寸约束值（M6-b T5：SketchPanel 尺寸内联编辑通道）——
   * updateSketchConstraint op（仅 distance/radius 类约束；后端改值重解算并
   * 重写草图 params+几何流，EDE 传播由 op 自带）。就绪门禁/拒收透出语义与
   * applyUpdate 同；成功 → 重取 activeSketch（后端重解算后的新坐标+解算
   * 状态，代际防竞态由 refresh 自带）。
   */
  applyConstraintValue(constraintId: number, value: number): Promise<FeatureOpResult>;
  /** 重取活动草图现场解算。 */
  refresh(): Promise<void>;
}

export function useSketchSystem(
  connection: BriefcaseConnection | undefined,
  fs: UseFeatureSystem | undefined,
): UseSketchSystem {
  const connectionKey = connection?.key;
  // 活动身份源=store 草图切片（SketchDialog enterSketch 真 id / exitSketch 归零）。
  const activeSketchId = usePartStudioStore((s) => s.sketch.activeSketchId);

  const [activeSketch, setActiveSketch] = useState<SketchDto | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // 活动身份代际：身份切换/换连接时 +1——迟到的 getSketch 解析发现自己代数
  // 过期即丢弃，防止覆写更新后的身份（stale-clobber 竞态，M3-b 同款）。
  const activeEpochRef = useRef(0);
  // refresh 回调身份只随 connectionKey 变化；活动身份经 getState 现场取
  //（避免「setActiveSketch → refresh 重建 → effect 重跑」取数环，M3-b 注记口径）。
  const readActiveId = useCallback(() => usePartStudioStore.getState().sketch.activeSketchId, []);

  const refresh = useCallback(async () => {
    const epoch = ++activeEpochRef.current;
    const activeId = readActiveId();
    if (!connectionKey || !activeId) {
      setActiveSketch(undefined);
      setError(undefined);
      return;
    }
    setLoading(true);
    try {
      const sketch = await LubanFeatureRpcInterface.getClient().getSketch(connectionKey, activeId);
      // 迟写丢弃：await 期间身份已切换/退出草图/换连接 → 不得覆写新态。
      if (activeEpochRef.current !== epoch) return;
      setActiveSketch(sketch);
      setError(undefined);
    } catch (err) {
      if (activeEpochRef.current === epoch) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeEpochRef.current === epoch) setLoading(false);
    }
  }, [connectionKey, readActiveId]);

  // 身份/连接切换加载（身份归零=退出草图 → 清活动草图；代际推进防迟写覆写）
  useEffect(() => {
    void refresh();
  }, [refresh, activeSketchId]);

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

  const applyUpdate = useCallback(
    async (entities: SketchEntityDto[], constraints: SketchConstraintDto[]): Promise<FeatureOpResult> => {
      if (!fs) return { ok: false, error: i18next.t('partStudio.sketch.system.featureSystemNotReady') };
      const activeId = readActiveId();
      if (!activeId) return { ok: false, error: i18next.t('partStudio.sketch.system.notOpen') };
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
    [fs, refresh, readActiveId],
  );

  const applyConstraintValue = useCallback(
    async (constraintId: number, value: number): Promise<FeatureOpResult> => {
      if (!fs) return { ok: false, error: i18next.t('partStudio.sketch.system.featureSystemNotReady') };
      const activeId = readActiveId();
      if (!activeId) return { ok: false, error: i18next.t('partStudio.sketch.system.notOpen') };
      let result: FeatureOpResult;
      try {
        result = await fs.applyOp({ kind: 'updateSketchConstraint', sketchId: activeId, constraintId, value });
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
    [fs, refresh, readActiveId],
  );

  return {
    activeSketch,
    loading,
    error,
    applyUpdate,
    applyConstraintValue,
    refresh,
  };
}

// ---------------------------------------------------------------------------
// 模块级 accessor（tools.run 无参启动的依赖注入通道——见文件头注记）
// ---------------------------------------------------------------------------

let currentSketchSystem: UseSketchSystem | undefined;

/** 宿主挂载时注册（PartStudioSession effect）；卸载传 undefined 注销。 */
export function registerSketchSystemAccessor(instance: UseSketchSystem | undefined): void {
  currentSketchSystem = instance;
}

/** 工具运行期取当前草图系统实例；未注册（宿主未挂载/已卸载）返回 undefined。 */
export function getSketchSystem(): UseSketchSystem | undefined {
  return currentSketchSystem;
}
