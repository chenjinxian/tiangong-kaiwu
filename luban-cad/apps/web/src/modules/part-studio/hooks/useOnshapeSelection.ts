/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 式选择工具的默认工具生命周期（2026-11-03）：
 * - 注册为 ToolAdmin 默认工具（工具退出/视图工具结束自动回到它）；
 * - dialog/草图打开时 pause({clearSelection:true})，关闭后 resume；
 * - 卸载恢复 core Select 并清空选择；
 * - 注册 BRep 命令协调器的 hover 控制器（Task 6 接线）。
 */
import { useEffect, useRef } from 'react';
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

/** 默认工具启动失败时回退 core Select，避免“看似有工具、实际无工具”。 */
function startDefaultOrFallback(admin: typeof IModelApp.toolAdmin): void {
  void admin.startDefaultTool().catch((err: unknown) => {
    admin.defaultToolId = 'Select';
    toast(err instanceof Error ? err.message : String(err));
  });
}

export function useOnshapeSelection(
  connection: BriefcaseConnection | undefined,
  viewport: ScreenViewport | null | undefined,
  paused: boolean,
): void {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!connection || !viewport)
      return;

    IModelApp.tools.register(OnshapeSelectTool);

    const options: OnshapeSelectOptions = {
      connectionKey: connection.key,
      onSelectionChanged: (selection) => usePartStudioStore.getState().setCanvasSelection(selection),
      onError: toast,
    };

    const admin = IModelApp.toolAdmin;
    admin.defaultToolId = OnshapeSelectTool.toolId;
    admin.defaultToolArgs = [options];

    if (!pausedRef.current)
      startDefaultOrFallback(admin);

    const removeToolListener = admin.activeToolChanged.addListener((tool) => {
      if (pausedRef.current && tool instanceof OnshapeSelectTool)
        void tool.pause(true);
    });

    const removeHoverController = registerBrepHoverController({
      suspend: async () => { await activeOnshapeSelect()?.suspendForCommand(); },
      resume: () => { activeOnshapeSelect()?.resumeAfterCommand(); },
    });

    return () => {
      removeToolListener();
      removeHoverController();
    };
  }, [connection, viewport]);

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
      startDefaultOrFallback(admin);
  }, [paused, connection, viewport]);

  useEffect(() => () => {
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
