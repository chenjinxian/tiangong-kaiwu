/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * B6 M-A5.2 T3：面/边子实体选择模式生命周期。
 *
 * 职责：store.canvas.selectionMode 与 SubEntitySelectTool 会话的单点同步。
 * - face/edge 模式启动工具（直构+run，无注册表）；
 * - onPicked 去重追加到 store.canvas.selection；
 * - onEnded / 切回 body / 连接切换 / 卸载 / 对话框打开 → 回 body 并清空选择；
 * - 启动失败/换算错误 → toast + 回 body。
 *
 * 与 useCanvasBodySelection 的分工：body 模式由 SelectionSet 桥接管；本 hook
 * 只在 face/edge 模式持有工具，**不写 SelectionSet**（T1 已把桥按模式退订）。
 * 双挂载=双工具会话，勿在下游再挂。
 */
import { useEffect, useRef } from 'react';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import { startSubEntitySelect } from '../tools/modeling/SubEntitySelectTool.js';
import type { SubEntitySelectOptions } from '../tools/modeling/SubEntitySelectTool.js';

/** 模块级稳定默认 toast——不得在渲染体内新建函数（会重触发 effect）。 */
function notifyError(message: string): void {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(OutputMessagePriority.Error, message),
  );
}

export interface SubEntitySelectionDeps {
  /** 测试注入点（缺省 startSubEntitySelect）。 */
  startTool?: (options: SubEntitySelectOptions) => Promise<{ exitTool: () => void } | undefined>;
  /** 测试注入点（缺省 IModelApp.notifications）。 */
  toast?: (message: string) => void;
}

export function useSubEntitySelection(
  connection: BriefcaseConnection | undefined,
  deps: SubEntitySelectionDeps = {},
): void {
  const mode = usePartStudioStore((s) => s.canvas.selectionMode);
  const dialogActive = usePartStudioStore((s) => s.dialog.active !== null);
  const startTool = deps.startTool ?? startSubEntitySelect;
  const toast = deps.toast ?? notifyError;

  // 防御：对话框打开时不允许停留子实体模式（模式按钮同时禁用）。
  useEffect(() => {
    if (dialogActive && mode !== 'body') {
      usePartStudioStore.getState().setSelectionMode('body');
    }
  }, [dialogActive, mode]);

  // 连接切换：停止当前工具并回 body（选择清空；不自动重启）。本 effect 必须
  // 声明在主启动 effect 之前，保证同一 commit 内先把模式归零；主 effect 还持有
  // store 现态守卫，避免用旧闭包 mode 启动工具。
  const connectionKey = connection?.key;
  const previousConnectionKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    const store = usePartStudioStore.getState();
    if (previousConnectionKey.current !== undefined
      && previousConnectionKey.current !== connectionKey
      && store.canvas.selectionMode !== 'body') {
      store.setSelectionMode('body');
    }
    previousConnectionKey.current = connectionKey;
    return () => {
      if (connectionKey === undefined) return;
      const current = usePartStudioStore.getState();
      if (current.canvas.selectionMode !== 'body') current.setSelectionMode('body');
    };
  }, [connectionKey]);

  // 工具切换串行化：face→edge 快速切换时，旧工具 exitTool 与新工具 run() 在
  // 同一 commit 内交错，新工具会在旧工具尚未退出时安装失败（真栈实测：edge
  // tool 启动即 onCleanup → onEnded 把 mode 重置 body）。用 ref 串起「旧工具
  // 退出完成 → 新工具启动」链，保证同一时刻只有一个子实体工具在安装。
  const toolExitChain = useRef<Promise<void>>(Promise.resolve());

  // 主启动 effect：face/edge 模式持有工具；清理时尽力退出（卸载/连接切换/模式
  // 切回 body/对话框打开皆汇合于此）。
  useEffect(() => {
    if (mode === 'body' || !connection || dialogActive) return;
    const currentMode = usePartStudioStore.getState().canvas.selectionMode;
    if (currentMode !== mode) return;

    let disposed = false;
    const activeKind = currentMode;
    const startPromise = (async (): Promise<{ exitTool: () => void } | undefined> => {
      await toolExitChain.current;
      if (disposed) return undefined;
      return startTool({
        kind: activeKind,
        connectionKey: connection.key,
        onPicked: (selection) => {
          const store = usePartStudioStore.getState();
          if (store.canvas.selectionMode !== activeKind) return;
          if (store.canvas.selection.some((entry) => entry.id === selection.id)) return;
          store.setCanvasSelection([...store.canvas.selection, selection]);
        },
        onError: toast,
        onEnded: () => {
          if (disposed) return;
          const store = usePartStudioStore.getState();
          if (store.canvas.selectionMode === activeKind) store.setSelectionMode('body');
        },
      });
    })();

    const installedPromise = startPromise
      .then((tool) => {
        if (disposed) {
          // 启动完成时已切走：立即退出，避免遗留工具。
          void tool?.exitTool();
          return undefined;
        }
        return tool;
      })
      .catch((err: unknown) => {
        if (disposed) return undefined;
        toast(err instanceof Error ? err.message : String(err));
        const store = usePartStudioStore.getState();
        if (store.canvas.selectionMode === activeKind) store.setSelectionMode('body');
        return undefined;
      });

    return () => {
      disposed = true;
      toolExitChain.current = installedPromise
        .then((tool) => tool?.exitTool())
        .catch(() => undefined);
    };
  }, [connection, mode, dialogActive, startTool, toast]);
}
