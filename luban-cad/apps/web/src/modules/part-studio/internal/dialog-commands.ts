/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 对话框命令槽（2026-11-13 Onshape 右键菜单状态对齐）：画布右键菜单在特征
 * 对话框打开时前置「确认 <特征> / 取消」两项（live 证据
 * `ui-evidence/context-menus-20261113/feature-tool-extrude.png`）。菜单不直接
 * 认识各对话框的内部提交态——由当前挂载的对话框登记命令处理器，菜单只发
 * 命令：
 *
 * - 单槽位：同一时刻只有当前对话框登记（宿主每次只渲染一个对话框）；
 * - 处理器经 ref 间接调用，避免对话框重渲染后菜单持有旧闭包；
 * - 未登记（无对话框）时 `runDialogCommand` 返回 false，菜单项不产生假提交。
 *
 * 纪律：这是 UI 命令转发，不是第二套事务通道——确认仍走对话框自身的
 * applyOp/FeatureOp 管道（P0-05/P0-10 不变）。
 *
 * R1（2026-11-16）：登记可携带 `confirmLabel`（对话框显示名，例如「特征镜像 1」）。
 * 画布右键「确认 <特征>」优先使用它，避免菜单按 ribbon 类型标签派生的旧名
 *（镜像/布尔运算）与对话框标题（特征镜像/布尔/并集/差集 N）不一致；未登记
 * 显示名时菜单保留旧派生回退。
 */

import React from 'react';

/** 对话框命令（确认/取消）。 */
export type DialogCommand = 'confirm' | 'cancel';

export interface DialogCommandHandlers {
  onConfirm(): void;
  onCancel(): void;
  /** R1：画布菜单「确认 <名称>」显示名（缺省 undefined=菜单回退旧派生）。 */
  confirmLabel?: string;
}

let activeHandlers: DialogCommandHandlers | undefined;
const labelListeners = new Set<() => void>();

function notifyLabelListeners(): void {
  for (const listener of labelListeners)
    listener();
}

/** 当前活动对话框的确认显示名（无登记=undefined）。 */
export function dialogCommandConfirmLabel(): string | undefined {
  return activeHandlers?.confirmLabel;
}

const subscribeConfirmLabel = (onStoreChange: () => void): (() => void) => {
  labelListeners.add(onStoreChange);
  return () => {
    labelListeners.delete(onStoreChange);
  };
};

/**
 * 订阅活动对话框确认显示名（CanvasContextMenu 消费）：对话框切换/镜像作用域
 * 改标题时菜单标签即时跟随；无对话框=undefined（菜单回退旧派生）。
 */
export function useDialogCommandConfirmLabel(): string | undefined {
  return React.useSyncExternalStore(
    subscribeConfirmLabel,
    dialogCommandConfirmLabel,
    dialogCommandConfirmLabel,
  );
}

/**
 * 发命令给当前对话框。返回是否送达（无对话框=false）。
 * 处理器内部自带提交守卫（submitting/只读/参数不合法时不提交）。
 */
export function runDialogCommand(command: DialogCommand): boolean {
  const handler = activeHandlers;
  if (!handler)
    return false;
  if (command === 'confirm')
    handler.onConfirm();
  else
    handler.onCancel();
  return true;
}

/** 当前是否有对话框登记了命令处理器（测试/诊断）。 */
export function hasDialogCommandHandler(): boolean {
  return activeHandlers !== undefined;
}

/**
 * 对话框登记命令处理器（React hook）。enabled=false 时注销（提交中/只读
 * 语义由对话框自管优先级更高时使用）。
 */
export function useDialogCommandHandler(handlers: DialogCommandHandlers, enabled = true): void {
  const ref = React.useRef(handlers);
  ref.current = handlers;
  const confirmLabel = handlers.confirmLabel;
  React.useEffect(() => {
    if (!enabled)
      return;
    const registered: DialogCommandHandlers = {
      onConfirm: () => ref.current.onConfirm(),
      onCancel: () => ref.current.onCancel(),
      confirmLabel,
    };
    activeHandlers = registered;
    notifyLabelListeners();
    return () => {
      // 只清自己登记的槽位（StrictMode 双挂载/对话框切换顺序防御）。
      if (activeHandlers === registered) {
        activeHandlers = undefined;
        notifyLabelListeners();
      }
    };
  }, [enabled, confirmLabel]);
}
