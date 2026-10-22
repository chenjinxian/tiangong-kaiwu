/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useCanvasSelection（M3 Task 5）：画布选择集的 React 出口——spec §5 选择
 * 驱动 UI 的 store 侧锚点，双向都是单向流：
 * - 画布 → store：viewport pick 经 `select()` 回流 store.canvas.selection
 *   （T6 pick 通道接线后由查看器侧调用；T5 组件/测试经同口写入）；
 * - 树 → 画布：`store.tree.selectedNodeIds` 变化 → effect 经
 *   `EmphasizeElements`（core-frontend 内建 FeatureOverrideProvider）高亮
 *   对应元素——树↔画布联动的树侧半流，无 viewport（壳期/测试态）静默跳过。
 *   M4-T6 收 M3 终审 T5-①：emphasize key 改 JSON.stringify 稳定序列化
 *  （join('') 拼串碰撞）+ 卸载清空 emphasize（ScreenViewport 生效后的残留
 *   高亮是可见缺陷）。
 */

import React from 'react';
import { EmphasizeElements, IModelApp } from '@itwin/core-frontend';
import { usePartStudioStore } from '../stores/part-studio.store.js';
import type { CanvasSelection } from '../types.js';

/** useCanvasSelection 出口。 */
export interface CanvasSelectionApi {
  /** 画布选择集（store.canvas.selection 只读镜像）。 */
  selection: readonly CanvasSelection[];
  /** 主选择（菜单按 kind 重构的依据；选择集最后一项）。 */
  primary: CanvasSelection | null;
  /** 画布拾取回流：整集替换写 store（T6 viewport pick 的接线口）。 */
  select: (selection: readonly CanvasSelection[]) => void;
  /** 清空画布选择集。 */
  clear: () => void;
  /** 树选中集（树→画布 emphasize 的数据源；FeatureTree 行点击写入）。 */
  emphasizedNodeIds: readonly string[];
}

export function useCanvasSelection(): CanvasSelectionApi {
  const selection = usePartStudioStore((s) => s.canvas.selection);
  const setCanvasSelection = usePartStudioStore((s) => s.setCanvasSelection);
  const emphasizedNodeIds = usePartStudioStore((s) => s.tree.selectedNodeIds);

  // 树 → 画布单向流：树选中变化 → viewport emphasize（FeatureOverrideProvider）。
  // M4-T6 收 M3 终审 T5-①：key 用 JSON.stringify 稳定序列化（join('') 有拼串
  // 碰撞——['a','bc'] 与 ['ab','c'] 同 key 不重跑）；卸载清空 emphasize（真实
  // 视口接线后残留高亮成为可见缺陷）。清理走 EmphasizeElements.get（非
  // getOrCreate——卸载路径不得反向创建实例）。
  const emphasizedKey = JSON.stringify(emphasizedNodeIds);
  React.useEffect(() => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (!viewport) return;
    const apply = (): void => {
      const emphasize = EmphasizeElements.getOrCreate(viewport);
      emphasize.clearEmphasizedElements(viewport);
      if (emphasizedNodeIds.length > 0) {
        emphasize.emphasizeElements([...emphasizedNodeIds], viewport, undefined, true);
      }
    };
    try {
      apply();
    } catch (err) {
      console.warn('[part-studio] 树选中 emphasize 应用失败（无真实视口？）', err);
    }
    return () => {
      try {
        EmphasizeElements.get(viewport)?.clearEmphasizedElements(viewport);
      } catch {
        // 连接/视口已释放（卸载竞态）——清理失败无需可见面。
      }
    };
    // emphasizedKey 是 emphasizedNodeIds 的稳定序列化代理（避免数组引用抖动重跑）；
    // 集合内容经 key 参与依赖，本体故意不入依赖（引用抖动豁免，原实现同口径）。
  }, [emphasizedKey]);

  const select = React.useCallback(
    (next: readonly CanvasSelection[]) => setCanvasSelection(next),
    [setCanvasSelection],
  );
  const clear = React.useCallback(() => setCanvasSelection([]), [setCanvasSelection]);

  return {
    selection,
    primary: selection.length > 0 ? selection[selection.length - 1]! : null,
    select,
    clear,
    emphasizedNodeIds,
  };
}
