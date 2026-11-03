/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * BRep 命令协调器（最小实现，Task 6 替换为串行版本）：
 * 拓扑读面/子实体删除等需要独占命令槽的任务，执行前后暂停/恢复选择工具 hover。
 */

export interface BrepHoverController {
  suspend(): Promise<void>;
  resume(): void;
}

export function registerBrepHoverController(controller: BrepHoverController): () => void {
  return () => undefined;
}

export async function withExclusiveBrepCommand<T>(task: () => Promise<T>): Promise<T> {
  return task();
}
