/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// RW2-T7：视口选面 → 持久拓扑 id（LubanTopologyId）拾取器 hook——useEdgeRefPicker 的镜像。
//
// 接线形态与边拾取器完全同构（简报备选 B，单一事实源守护）：ref 列表**不私存**在 hook 内——
// 调用方（FeaturePanel）把当前表单值 faces 传入、onFacesChange 接回 FeatureParamForm 的
// value/onChange 契约（onChange({...value, faces: next})）。`refs` 直通输入 faces。
//
// 与 useEdgeRefPicker 的差异：
// - 工具 mode:'face'（SelectSubEntityTool 三态之一）；
// - 解析走 fs.resolveFaceRef（op31 单跳直查，边拾取器的 op34+op33 枚举面对方案是边寻址
//   无直查 op 的不得已——面寻址有内核直查，零枚举）；
// - ref 为单面拓扑 id（非邻面对），去重/反查键 = `nodeId:entityId` 单键（边拾取器为
//   面对无序对的双键序无关形态）；
// - 生命周期（退场三通道幂等/discardRef 闸门语义/Escape 回收/removeAt）逐项镜像边拾取器
//   （2026-10-10 修正版：单选会话自然完成不丢弃在途回包——chips 依赖迟到回包落账）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { type BriefcaseConnection, IModelApp } from '@itwin/core-frontend';
import type { LubanTopologyId } from '@luban-cad/shared';
import { runSelectSubEntityTool, SelectSubEntityTool } from '../../modeling/SelectSubEntityTool.js';
import type { UseFeatureSystem } from './useFeatureSystem.js';
import i18n from '../../../shared/i18n/index.js';

export interface UseFaceRefPickerOptions {
  /** 当前面引用数组（表单值 faces；单一事实源在 FeatureParamForm 的 value/onChange） */
  faces: LubanTopologyId[];
  /** 更新面引用数组（面板侧接到表单 onChange：setFormValue(prev => ({...prev, faces: next}))） */
  onFacesChange: (next: LubanTopologyId[]) => void;
  /** 解析失败等错误回报（toast）；缺省静默 */
  onError?: (message: string) => void;
}

export interface UseFaceRefPicker {
  picking: boolean;
  /** 直通 options.faces（hook 不私存 ref 列表） */
  refs: LubanTopologyId[];
  /** 属性式函数类型（非方法签名）：面板 `const stop = picker.stop` 直取不触 unbound-method */
  start: () => void;
  stop: () => void;
  removeAt: (index: number) => void;
}

/** ref 键：单面拓扑 id（面引用无「序无关对」语义——同面重复拾取即去重目标） */
function refKey(ref: LubanTopologyId): string {
  return `${ref.nodeId}:${ref.entityId}`;
}

export function useFaceRefPicker(
  connection: BriefcaseConnection | undefined,
  fs: UseFeatureSystem,
  options: UseFaceRefPickerOptions,
): UseFaceRefPicker {
  const [picking, setPicking] = useState(false);
  /** 工具会话存活标记（回调闭包与退场通道共用的同步闸门；state 异步不可担此任） */
  const runningRef = useRef(false);
  /** 结果丢弃闸门：仅显式 stop()/unmount 丢弃在途回包（同 useEdgeRefPicker 2026-10-10 语义
   *  修正——单选会话自然完成不丢弃，迟到 ok 回包仍落账 chips）。 */
  const discardRef = useRef(false);
  /** 最新 options（工具回调在拾取全程存活，须恒读最新 faces/onFacesChange——免闭包陈旧） */
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

  // 拾取期 Escape 退场（hook 自带；全局 Escape 链在 registerAllTools 裸 Tool 处静默抛死，
  // 探针实证 2026-10-08——同 useEdgeRefPicker）。
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
      mode: 'face',
      onSubEntitySelected: (elementId, loc) => {
        const subEntityId = loc.subEntity.id;
        const pickKey = `${elementId}:${subEntityId}`;
        void fs.resolveFaceRef(elementId, subEntityId)
          .then((r) => {
            if (discardRef.current) return; // 显式 stop/unmount——丢弃在途回包
            if (r.ok && r.ref) {
              const key = refKey(r.ref);
              pickMapRef.current.set(pickKey, key);
              const cur = optsRef.current.faces;
              if (cur.some((f) => refKey(f) === key)) return; // 同一面重复拾取 → 去重
              optsRef.current.onFacesChange([...cur, r.ref]);
            } else {
              optsRef.current.onError?.(
                r.error ?? i18n.t('featurePanel.faceResolveFailed', { ns: 'editor' }),
              );
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
        optsRef.current.onFacesChange(optsRef.current.faces.filter((f) => refKey(f) !== key));
      },
      onComplete: () => {
        // 自然完成（单选会话拾得 1 个面后工具自行退出）：结束 picking 态但**不**置丢弃——
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
    const cur = optsRef.current.faces;
    const target = cur[index];
    if (target === undefined) return;
    const key = refKey(target);
    // 同步摘下拾取映射（后续 deselect 同键幂等无操作）
    for (const [pk, rk] of pickMapRef.current) {
      if (rk === key) pickMapRef.current.delete(pk);
    }
    optsRef.current.onFacesChange(cur.filter((_, i) => i !== index));
  }, []);

  return { picking, refs: options.faces, start, stop, removeAt };
}
