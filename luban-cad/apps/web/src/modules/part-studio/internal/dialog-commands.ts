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
 */

import React from 'react';

/** 对话框命令（确认/取消）。 */
export type DialogCommand = 'confirm' | 'cancel';

export interface DialogCommandHandlers {
  onConfirm(): void;
  onCancel(): void;
}

let activeHandlers: DialogCommandHandlers | undefined;

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
  React.useEffect(() => {
    if (!enabled)
      return;
    const registered: DialogCommandHandlers = {
      onConfirm: () => ref.current.onConfirm(),
      onCancel: () => ref.current.onCancel(),
    };
    activeHandlers = registered;
    return () => {
      // 只清自己登记的槽位（StrictMode 双挂载/对话框切换顺序防御）。
      if (activeHandlers === registered)
        activeHandlers = undefined;
    };
  }, [enabled]);
}
