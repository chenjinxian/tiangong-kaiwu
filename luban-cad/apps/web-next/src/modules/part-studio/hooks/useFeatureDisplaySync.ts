/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * useFeatureDisplaySync（web-next M4 Task 5）：特征显示同步 hook——旧应用
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
 */

import { useEffect } from 'react';
import { type BriefcaseConnection, IModelApp } from '@itwin/core-frontend';

export function useFeatureDisplaySync(connection: BriefcaseConnection | undefined): void {
  useEffect(() => {
    if (!connection) return undefined;

    const remove = connection.txns.onModelGeometryChanged.addListener((changes) => {
      const modelIds: string[] = [];
      let disposed = 0;
      // Symbol.dispose（ES explicitly-resource-management）——运行时存在于现代
      // 浏览器/node，本仓 tsconfig lib 未含 esnext.disposable，经宽化取用
      const disposeSym = (Symbol as unknown as { dispose?: symbol }).dispose;
      if (disposeSym === undefined) return;
      const needsLateLoad: string[] = [];
      for (const change of changes) {
        modelIds.push(change.id);
        // 1) guid 更新（通知自带新 guid，无需回查）
        const model = connection.models.getLoaded(change.id);
        if (model?.asGeometricModel) {
          model.asGeometricModel.geometryGuid = change.guid;
          // 2) dispose 该 model 的 tile tree owners（Tiles 可迭代；id 形如 PrimaryTreeId{modelId,...}）
          for (const entry of connection.tiles) {
            if ((entry.id as { modelId?: string } | undefined)?.modelId === change.id) {
              const owner = entry.owner as unknown as Record<symbol, (() => void) | undefined>;
              owner[disposeSym]?.();
              disposed++;
            }
          }
        } else {
          // ModelState 未加载（viewport 重建/连接重开时序交叉）——补载后建 refs（决定性保障）
          needsLateLoad.push(change.id);
        }
      }
      // 诊断日志沿旧源（web-next eslint 未启 no-console，无需 disable 指令）。
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

    return remove;
  }, [connection]);
}
