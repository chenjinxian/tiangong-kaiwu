/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// M3-a T6.3：视口选边 → 邻面对引用（FilletEdgeRef）拾取器 hook。
//
// 接线形态（简报备选 B，单一事实源守护）：ref 列表**不私存**在 hook 内——调用方
// （FeaturePanel）把当前表单值 edges 传入、onEdgesChange 接回 FeatureParamForm 的
// value/onChange 契约（onChange({...value, edges: next})）。`refs` 直通输入 edges，
// 保持简报形状 `{ picking, refs, start, stop, removeAt }` 的同时杜绝双事实源。
//
// 生命周期：
// - start 跑 SelectSubEntityTool（mode:'edge'，复用 features/modeling 既有工具）；
//   每选中一条边 → fs.resolveEdgeRef(elementId, subEntity.id)（SubEntityProps.id 是数字，
//   照 WS1 wire 契约直传 RPC）→ ok 则去重追加（面对序无关键），失败 toast 错误文案。
// - 退场三通道幂等：工具自行退出（单选拾得即 onComplete；右键/Esc 亦然）/ stop()（对话框
//   关闭、类型切换中途拾取 → 激活工具仍为本工具才 exitTool，不误伤他工具）/ unmount 回收。
// - deselect 经「拾取键 elementId:subEntityId → ref 键」映射反查移除；**显式 stop()/unmount
//   后**在途回包丢弃（discardRef 闸门）——单选会话自然完成不丢弃（chips 依赖迟到回包落账，
//   2026-10-10 修正：原 runningRef 兼任闸门致 ok 回包被吞、chips 恒空）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { IModelApp, type BriefcaseConnection } from '@itwin/core-frontend';
import type { FilletEdgeRef } from '@luban-cad/shared';
import { runSelectSubEntityTool, SelectSubEntityTool } from '../../modeling/SelectSubEntityTool.js';
import type { UseFeatureSystem } from './useFeatureSystem.js';

export interface UseEdgeRefPickerOptions {
  /** 当前边引用数组（表单值 edges；单一事实源在 FeatureParamForm 的 value/onChange） */
  edges: FilletEdgeRef[];
  /** 更新边引用数组（面板侧接到表单 onChange：setFormValue(prev => ({...prev, edges: next}))） */
  onEdgesChange: (next: FilletEdgeRef[]) => void;
  /** 解析失败等错误回报（toast）；缺省静默 */
  onError?: (message: string) => void;
}

export interface UseEdgeRefPicker {
  picking: boolean;
  /** 直通 options.edges（hook 不私存 ref 列表） */
  refs: FilletEdgeRef[];
  start(): void;
  stop(): void;
  removeAt(index: number): void;
}

/** ref 序无关键（面对无序：{A,B} 与 {B,A} 是同一边——去重/反查共用） */
function refKey(ref: FilletEdgeRef): string {
  const a = `${ref.faceA.nodeId}:${ref.faceA.entityId}`;
  const b = `${ref.faceB.nodeId}:${ref.faceB.entityId}`;
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

export function useEdgeRefPicker(
  connection: BriefcaseConnection | undefined,
  fs: UseFeatureSystem,
  options: UseEdgeRefPickerOptions,
): UseEdgeRefPicker {
  const [picking, setPicking] = useState(false);
  /** 工具会话存活标记（回调闭包与退场通道共用的同步闸门；state 异步不可担此任） */
  const runningRef = useRef(false);
  /** 结果丢弃闸门（2026-10-10 语义修正）：仅显式 stop()/unmount 丢弃在途回包。
   * 原 runningRef 兼任此职——但单选会话的自然完成（拾取 1 条边后工具自行退出→onComplete）
   * 也置 runningRef=false，迟到的 resolve 结果被误丢，chips 恒空（实测：ok:true 回包被闸门
   * 吞掉）。自然完成后回包仍应落账（对话框已复开，chips 即时可见）。 */
  const discardRef = useRef(false);
  /** 最新 options（工具回调在拾取全程存活，须恒读最新 edges/onEdgesChange——免闭包陈旧） */
  const optsRef = useRef(options);
  optsRef.current = options;
  /** 拾取键（elementId:subEntityId）→ ref 键：deselect 反查用 */
  const pickMapRef = useRef(new Map<string, string>());

  const exitActivePickerTool = useCallback(() => {
    const active = IModelApp.toolAdmin.activeTool;
    if (active && active.toolId === SelectSubEntityTool.toolId)
      void active.exitTool(); // → onCleanup → onComplete（幂等归零）
  }, []);

  const stop = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    discardRef.current = true;
    setPicking(false);
    exitActivePickerTool();
  }, [exitActivePickerTool]);

  // unmount 回收：面板/对话框卸载中途拾取时不留孤儿工具会话
  useEffect(() => {
    return () => {
      if (runningRef.current) {
        runningRef.current = false;
        discardRef.current = true;
        exitActivePickerTool();
      }
    };
  }, [exitActivePickerTool]);

  // 拾取期 Escape 退场（hook 自带，不依赖全局 KeyboardManager——registerAllTools 在
  // SelectAllTool 裸 Tool 无 namespace 处静默抛死，registerDefaultShortcuts 从未执行，
  // 全局 Escape→startDefaultTool 链是死的；探针实证 2026-10-08）。
  // stop() 置 picking=false 后本 effect 自清，右键退场走工具 onResetButtonUp→onComplete 通道。
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picking, stop]);

  const start = useCallback(() => {
    if (!connection || runningRef.current) return;
    runningRef.current = true;
    discardRef.current = false;
    setPicking(true);
    pickMapRef.current.clear();
    void runSelectSubEntityTool({
      mode: 'edge',
      onSubEntitySelected: (elementId, loc) => {
        const subEntityId = loc.subEntity.id;
        const pickKey = `${elementId}:${subEntityId}`;
        void fs.resolveEdgeRef(elementId, subEntityId)
          .then((r) => {
            if (discardRef.current) return; // 显式 stop/unmount——丢弃在途回包
            if (r.ok && r.ref) {
              const key = refKey(r.ref);
              pickMapRef.current.set(pickKey, key);
              const cur = optsRef.current.edges;
              if (cur.some((e) => refKey(e) === key)) return; // 同一边重复拾取（含序颠倒）→ 去重
              optsRef.current.onEdgesChange([...cur, r.ref]);
            } else {
              optsRef.current.onError?.(r.error ?? '边引用解析失败');
            }
          })
          .catch((err: unknown) => {
            if (!discardRef.current)
              optsRef.current.onError?.(err instanceof Error ? err.message : String(err));
          });
      },
      onSubEntityDeselected: (elementId, loc) => {
        const pickKey = `${elementId}:${loc.subEntity.id}`;
        const key = pickMapRef.current.get(pickKey);
        if (key === undefined) return; // 未解析完成的拾取/外来 deselect——无可移除
        pickMapRef.current.delete(pickKey);
        optsRef.current.onEdgesChange(optsRef.current.edges.filter((e) => refKey(e) !== key));
      },
      onComplete: () => {
        // 自然完成（单选会话拾得 1 条边后工具自行退出）：结束 picking 态但**不**置丢弃——
        // 在途回包仍落账（对话框复开即见 chips）；stop() 路径已在 stop 内置丢弃闸门。
        runningRef.current = false;
        setPicking(false);
      },
    }).catch(() => {
      runningRef.current = false;
      setPicking(false);
    });
  }, [connection, fs]);

  const removeAt = useCallback((index: number) => {
    const cur = optsRef.current.edges;
    const target = cur[index];
    if (target === undefined) return;
    const key = refKey(target);
    // 同步摘下拾取映射（后续 deselect 同键幂等无操作）
    for (const [pk, rk] of pickMapRef.current) {
      if (rk === key) pickMapRef.current.delete(pk);
    }
    optsRef.current.onEdgesChange(cur.filter((_, i) => i !== index));
  }, []);

  return { picking, refs: options.edges, start, stop, removeAt };
}
