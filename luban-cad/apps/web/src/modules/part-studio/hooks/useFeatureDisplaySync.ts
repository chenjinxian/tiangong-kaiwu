/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * useFeatureDisplaySync（web M4 Task 5）：特征显示同步 hook——旧应用
 * `apps/web/features/editor/useFeatureDisplaySync.ts`（BRep 显示 bug 层③修复，
 * 2026-10-09 定案）**忠实移植**。消费方：PartStudioSession 内层挂载（与
 * useFeatureSystem 同层——特征写入后的几何出现链收口）。
 *
 * 背景：特征几何由 MS 服务端直写 briefcase（LubanFeatureRpcInterface，绕过前端
 * 编辑管道）。core-frontend 的 ModelChangeMonitor 在 GraphicalEditingScope 开启
 * 期间把 geometryGuid 变化无限缓冲（scope 退出才失效 tile tree），而编辑器常驻
 * 编辑 scope → 特征写入后视口永不刷新（症状：建特征/改参数后几何不显示，重开
 * 页面才可见）。
 *
 * 修复：绕过缓冲——直接订阅 txns.onModelGeometryChanged，对每个变化 model 立即
 * 执行 processBuffered 的等价三步（BriefcaseConnection.ts:172-193 的官方逻辑）：
 *   1) ModelState.geometryGuid 更新（tree 重建的 guid 依据）
 *   2) dispose 该 model 的全部 TileTreeOwner（等价 disposeTileTreesForGeometricModels）
 *   3) refreshForModifiedModels（重绘 + 重新请求 tile）
 * ModelChangeMonitor 后续在 scope 退出时对同批 guid 再跑一遍官方流程，幂等无害。
 *
 * M5-T1（D-T9-4 层2）增订：txns.onAfterUndoRedo → 全量失效。undo/redo 反转
 * 事务不发 onCommitted、亦无 geometry guid 通知载荷（后端 TxnManager 仅
 * notifyAfterUndoRedo，TxnManager.ts:1105-1109），官方 maybeProcess
 *（BriefcaseConnection.ts:113-130）在常驻 editingScope 下 early-return——
 * 结构性不覆盖，故撤销/重做路径由本 hook 并列监听补位（与 onModelGeometryChanged
 * 共享 dispose+refresh 失效体，抽公共函数形态）：
 *  - 失效面=凡 extant tile tree owner（其 id 恒带 modelId）一律 dispose +
 *    refreshForModifiedModels——无 guid 载荷下的全量口径（显示中的 model 必有
 *    extant tree，未建 tree 者无缓存可失效）；
 *  - 三步中的「guid 写回」在此路径**有意缺省**（诚实登记）：撤销后的基准 guid
 *    客户端不可知（通知无载荷；后端撤销甚至可回退至 undefined——TxnManager.test
 *   「geometryGuid undefined after undo」），臆写=污染；且树身份不含 guid
 *   （客户端 PrimaryTreeId={treeId,modelId,...}，PrimaryTileTree.ts:36-42），
 *    撤销后的基准 guid 由服务端在 tree 重建时经 requestTileTreeProps 供给
 *   （IModelTileTreeProps.geometryGuid=「tile 内容的基准 guid」）。dispose+
 *    refresh 已足以令撤销后几何重建。
 */

import { useEffect } from 'react';
import { type BriefcaseConnection, IModelApp } from '@itwin/core-frontend';

/** tile tree entry 宽化取用（id 形如 PrimaryTreeId{modelId,...}；owner 经
 * Symbol.dispose 宽化取用——本仓 tsconfig lib 未含 esnext.disposable）。 */
function treeEntryModelId(entry: { id: unknown }): string | undefined {
  return (entry.id as { modelId?: string } | undefined)?.modelId;
}

function disposeTreeOwner(entry: { owner: unknown }, disposeSym: symbol): void {
  (entry.owner as Record<symbol, (() => void) | undefined>)[disposeSym]?.();
}

export function useFeatureDisplaySync(connection: BriefcaseConnection | undefined): void {
  useEffect(() => {
    if (!connection) return undefined;

    // Symbol.dispose（ES explicitly-resource-management）——运行时存在于现代
    // 浏览器/node，本仓 tsconfig lib 未含 esnext.disposable，经宽化取用
    const disposeSym = (Symbol as unknown as { dispose?: symbol }).dispose;

    /**
     * dispose 单个 model 的全部 extant tile tree owners（官方
     * disposeTileTreesForGeometricModels 的单 model 形；Tiles 可迭代）。
     * 返回 dispose 的 owner 数（诊断日志用）。
     */
    const disposeTileTreesForModel = (modelId: string): number => {
      if (disposeSym === undefined) return 0;
      let disposed = 0;
      for (const entry of connection.tiles) {
        if (treeEntryModelId(entry) === modelId) {
          disposeTreeOwner(entry, disposeSym);
          disposed++;
        }
      }
      return disposed;
    };

    const removeGeometryListener = connection.txns.onModelGeometryChanged.addListener((changes) => {
      const modelIds: string[] = [];
      let disposed = 0;
      const needsLateLoad: string[] = [];
      for (const change of changes) {
        modelIds.push(change.id);
        // 1) guid 更新（通知自带新 guid，无需回查）
        const model = connection.models.getLoaded(change.id);
        if (model?.asGeometricModel) {
          model.asGeometricModel.geometryGuid = change.guid;
          // 2) dispose 该 model 的 tile tree owners
          disposed += disposeTileTreesForModel(change.id);
        } else {
          // ModelState 未加载（viewport 重建/连接重开时序交叉）——补载后建 refs（决定性保障）
          needsLateLoad.push(change.id);
        }
      }
      // 诊断日志沿旧源（web eslint 未启 no-console，无需 disable 指令）。
      console.log('[FeatureDisplaySync] guid changed:', modelIds.join(','), 'disposed:', disposed, 'lateLoad:', needsLateLoad.length);
      if (needsLateLoad.length > 0) {
        void (async () => {
          try {
            await connection.models.load(needsLateLoad);
            const vp = IModelApp.viewManager.selectedView;
            const spatialView = vp?.view as unknown as {
              isSpatialView?: () => boolean;
              modelSelector?: { has: (id: string) => boolean; dropModels: (ids: string[]) => void; addModels: (ids: string[]) => void };
            } | undefined;
            if (spatialView?.isSpatialView?.() && spatialView.modelSelector) {
              for (const id of needsLateLoad) {
                if (spatialView.modelSelector.has(id)) {
                  spatialView.modelSelector.dropModels([id]);
                  spatialView.modelSelector.addModels([id]);
                }
              }
            }
            IModelApp.viewManager.refreshForModifiedModels(needsLateLoad);
          } catch {
            // 补载失败（连接关闭等）——下次 guid 变化会重试
          }
        })();
      }
      // 3) 刷新渲染（重新建 tree → 请求 tile）
      if (modelIds.length > 0)
        IModelApp.viewManager.refreshForModifiedModels(modelIds);
    });

    // M5-T1（D-T9-4 层2）：undo/redo 全量失效（无 guid 载荷；与官方 maybeProcess
    // 的 disposeTileTrees+processBuffered 等位，但在常驻 editingScope 下由本
    // 监听补位——头注详注）。Set 去重：同一 model 可持多个 tree owner。
    const removeUndoRedoListener = connection.txns.onAfterUndoRedo.addListener(() => {
      if (disposeSym === undefined) return;
      const modelIds = new Set<string>();
      let disposed = 0;
      for (const entry of connection.tiles) {
        const modelId = treeEntryModelId(entry);
        if (modelId === undefined) continue;
        disposeTreeOwner(entry, disposeSym);
        disposed++;
        modelIds.add(modelId);
      }
      console.log('[FeatureDisplaySync] undo/redo invalidation:', [...modelIds].join(','), 'disposed:', disposed);
      if (modelIds.size > 0)
        IModelApp.viewManager.refreshForModifiedModels([...modelIds]);
    });

    return () => {
      removeGeometryListener();
      removeUndoRedoListener();
    };
  }, [connection]);
}
