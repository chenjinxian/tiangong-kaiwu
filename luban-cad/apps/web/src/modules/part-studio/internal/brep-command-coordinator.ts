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

/**
 * fail-fast 取得命令槽：suspend 失败直接抛出——任务不执行、也不 resume
 * （hover 未被成功暂停，强行恢复会与调用方命令抢命令槽）。异常只影响本任务：
 * withExclusiveBrepCommand 的 queue 链已接住拒绝，后续任务照常排队执行。
 */
async function suspendHover(): Promise<BrepHoverController | undefined> {
  const active = controller;
  await active?.suspend();
  return active;
}

export function withExclusiveBrepCommand<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const active = await suspendHover();
    try {
      return await task();
    } finally {
      active?.resume();
    }
  });

  queue = run.then(() => undefined, () => undefined);
  return run;
}
