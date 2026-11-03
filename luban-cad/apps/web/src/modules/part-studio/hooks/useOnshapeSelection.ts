/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 式选择工具的默认工具生命周期（2026-11-03）：
 * - 注册为 ToolAdmin 默认工具（工具退出/视图工具结束自动回到它）；
 * - dialog/草图打开时 pause({clearSelection:true})，关闭后 resume；
 * - 卸载/连接失效恢复 core Select 并清空选择；
 * - 注册 BRep 命令协调器的 hover 控制器（Task 6 接线）。
 */
import { useCallback, useEffect, useRef } from 'react';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BriefcaseConnection, ScreenViewport } from '@itwin/core-frontend';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';
import type { OnshapeSelectOptions } from '../tools/modeling/OnshapeSelectTool.js';
import { activeOnshapeSelect } from '../internal/onshape-selection-runtime.js';
import { registerBrepHoverController } from '../internal/brep-command-coordinator.js';

function toast(message: string): void {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(OutputMessagePriority.Error, message),
  );
}

export function useOnshapeSelection(
  connection: BriefcaseConnection | undefined,
  viewport: ScreenViewport | null | undefined,
  paused: boolean,
): void {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  /**
   * 每次 connection/viewport effect 运行/清理时递增。异步启动在 resolve 时若代数
   * 已变化（卸载/连接切换/连接失效），说明该启动已过期——退出装上的选择工具，
   * 防止其继续用旧连接写选择。
   */
  const effectGeneration = useRef(0);

  /**
   * 默认工具启动失败时回退 core Select，避免“看似有工具、实际无工具”。
   * 启动是异步的（activeTool 在 run 完成前仍为空），同一挂载内 connection/viewport
   * effect 与 paused effect 都可能请求启动——用 in-flight 守卫保证只发一次请求。
   */
  const startRequested = useRef(false);
  const requestStart = useCallback((admin: typeof IModelApp.toolAdmin): Promise<void> => {
    if (startRequested.current)
      return Promise.resolve();

    const generation = effectGeneration.current;
    startRequested.current = true;
    return admin.startDefaultTool()
      .catch((err: unknown) => {
        // 回退 core Select：换默认工具 + 清旧参数，并真正启动它（否则用户无工具可用）。
        admin.defaultToolId = 'Select';
        admin.defaultToolArgs = undefined;
        toast(err instanceof Error ? err.message : String(err));
        return admin.startDefaultTool().catch(() => undefined);
      })
      .finally(() => {
        startRequested.current = false;
        if (generation !== effectGeneration.current) {
          const tool = admin.activeTool;
          if (tool instanceof OnshapeSelectTool)
            void tool.exitTool();
        }
      });
  }, []);

  useEffect(() => {
    const generation = ++effectGeneration.current;
    const admin = IModelApp.toolAdmin;

    // 连接/视口失效（切换中/关闭文档）：恢复 core Select 默认并清参数，
    // 防止旧连接的 Onshape 工具配置残留。
    if (!connection || !viewport) {
      if (admin.defaultToolId === OnshapeSelectTool.toolId) {
        admin.defaultToolId = 'Select';
        admin.defaultToolArgs = undefined;
      }
      return;
    }

    let disposed = false;
    IModelApp.tools.register(OnshapeSelectTool);

    const options: OnshapeSelectOptions = {
      connectionKey: connection.key,
      onSelectionChanged: (selection) => {
        // 已清理/过期（卸载或连接切换）的旧工具不得再把选择写回 store。
        if (disposed || generation !== effectGeneration.current)
          return;
        usePartStudioStore.getState().setCanvasSelection(selection);
      },
      onError: toast,
    };

    admin.defaultToolId = OnshapeSelectTool.toolId;
    admin.defaultToolArgs = [options];

    if (!pausedRef.current)
      void requestStart(admin);

    const removeToolListener = admin.activeToolChanged.addListener((tool) => {
      if (!pausedRef.current)
        return;

      // 与 paused effect 同口径：dialog/草图期间任何工具激活都清空 body SelectionSet，
      // 防止新装工具重新写入旧 body 选择。
      connection.selectionSet.emptyAll();
      if (tool instanceof OnshapeSelectTool)
        void tool.pause(true);
    });

    const removeHoverController = registerBrepHoverController({
      suspend: async () => { await activeOnshapeSelect()?.suspendForCommand(); },
      resume: () => { activeOnshapeSelect()?.resumeAfterCommand(); },
    });

    return () => {
      disposed = true;
      effectGeneration.current += 1;
      removeToolListener();
      removeHoverController();
    };
  }, [connection, viewport, requestStart]);

  useEffect(() => {
    const admin = IModelApp.toolAdmin;
    if (admin.defaultToolId !== OnshapeSelectTool.toolId)
      return;

    const tool = admin.activeTool;
    if (paused) {
      if (tool instanceof OnshapeSelectTool)
        void tool.pause(true);
      // 用户确认“打开对话框/草图即清空选择”：body SelectionSet 一并清，防止 store 空
      // 但 SelectionSet 仍残留旧 body 被后续工具误用。
      connection?.selectionSet?.emptyAll();
      return;
    }

    if (tool instanceof OnshapeSelectTool)
      tool.resume();
    else
      void requestStart(admin);
  }, [paused, connection, viewport, requestStart]);

  useEffect(() => () => {
    effectGeneration.current += 1;
    const admin = IModelApp.toolAdmin;
    if (admin.defaultToolId === OnshapeSelectTool.toolId) {
      admin.defaultToolId = 'Select';
      admin.defaultToolArgs = undefined;
      if (admin.activeTool instanceof OnshapeSelectTool)
        void admin.startDefaultTool();
    }
    usePartStudioStore.getState().setCanvasSelection([]);
  }, []);
}
