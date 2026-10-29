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
 * - 特征编辑态体高亮（M6-c T5，采集规格 §视口交互的最小通道）：可选
 *   `extraEmphasizedIds`（特征对话框在场时的体元素集）→ effect 经
 *   `EmphasizeElements.overrideElements` 打 Onshape 橙 color-only 覆盖
 *  （FEATURE_EDIT_HIGHLIGHT_COLOR，取色 12-dialog-extrude-1.png 采样
 *   RGB(243,173,62)）；清场走 clearOverriddenElements（换集/卸载两路）。
 *   🟠 诚实范围：高亮做，「后续特征半透明灰显」不做——per-feature 灰显需
 *   特征→元素归属映射（当前单 BodySolid 架构下不可分），挂账 T6+ 单裁。
 */

import React from 'react';
import { ColorDef, FeatureOverrideType } from '@itwin/core-common';
import { EmphasizeElements, IModelApp } from '@itwin/core-frontend';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import type { CanvasSelection } from '../types.js';

/**
 * 特征编辑态体高亮色（M6-c T5）：Onshape 橙——采集截图 12-dialog-extrude-1.png
 * 高亮区域最饱和像素采样 RGB(243,173,62)（无 DOM 规格值，截图取色近似）。
 */
export const FEATURE_EDIT_HIGHLIGHT_COLOR = ColorDef.from(0xf3, 0xad, 0x3e);

/** 模块级空集常量（extraEmphasizedIds 缺省——防渲染体间引用抖动）。 */
const EMPTY_EXTRA: readonly string[] = [];

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

/**
 * @param extraEmphasizedIds 额外体高亮集（M6-c T5 特征编辑态：宿主在特征
 * 对话框在场时传体元素 id，effect 打 Onshape 橙覆盖；缺省空集=无编辑态高亮）。
 */
export function useCanvasSelection(
  extraEmphasizedIds: readonly string[] = EMPTY_EXTRA,
): CanvasSelectionApi {
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

  // 特征编辑态体高亮（M6-c T5）：extraEmphasizedIds 非空 → Onshape 橙
  // color-only 覆盖（overrideElements replace=true 整集替换）；空集/换集/卸载
  // → clearOverriddenElements 清场（与树 emphasize 通道互不覆盖——一个动
  // alwaysDrawn+defaultAppearance，一个动 _overrideAppearance 键值对）。
  const extraKey = JSON.stringify(extraEmphasizedIds);
  React.useEffect(() => {
    const viewport = IModelApp.viewManager?.selectedView;
    if (!viewport) return;
    const ids = JSON.parse(extraKey) as string[];
    const apply = (): void => {
      const emphasize = EmphasizeElements.getOrCreate(viewport);
      emphasize.clearOverriddenElements(viewport);
      if (ids.length > 0) {
        emphasize.overrideElements(ids, viewport, FEATURE_EDIT_HIGHLIGHT_COLOR, FeatureOverrideType.ColorOnly, true);
      }
    };
    try {
      apply();
    } catch (err) {
      console.warn('[part-studio] 特征编辑态体高亮应用失败（无真实视口？）', err);
    }
    return () => {
      try {
        EmphasizeElements.get(viewport)?.clearOverriddenElements(viewport);
      } catch {
        // 连接/视口已释放（卸载竞态）——清理失败无需可见面。
      }
    };
    // extraKey 同 emphasizedKey 的稳定序列化代理口径（本体故意不入依赖）。
  }, [extraKey]);

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
