/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * BRep 命令协调器（2026-11-03）：选择工具 hover 会持有 SolidModeling 命令；
 * 拓扑读面与子实体删除也需要同一命令槽。通过串行队列在执行前暂停 hover、
 * 结束后恢复，避免 commandBusy / 清缓存拆会话。
 */
export interface BrepHoverController {
  suspend(): Promise<void>;
  resume(): void;
}

let controller: BrepHoverController | undefined;
let queue: Promise<unknown> = Promise.resolve();

export function registerBrepHoverController(next: BrepHoverController): () => void {
  controller = next;
  return () => {
    if (controller === next)
      controller = undefined;
  };
}

export function withExclusiveBrepCommand<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const active = controller;
    await active?.suspend();
    try {
      return await task();
    } finally {
      active?.resume();
    }
  });

  queue = run.then(() => undefined, () => undefined);
  return run;
}
