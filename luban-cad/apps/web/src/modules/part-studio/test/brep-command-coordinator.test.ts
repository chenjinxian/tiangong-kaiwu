/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Task 6：BRep 命令协调器——拓扑读面/子实体删除与选择工具 hover 共用命令槽，
 * 队列串行执行，每次任务前 suspend、结束后 resume（异常也 resume）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  registerBrepHoverController,
  withExclusiveBrepCommand,
} from '../internal/brep-command-coordinator.js';

describe('BrepCommandCoordinator', () => {
  it('串行执行：每次任务前后 suspend/resume，任务不交错', async () => {
    const events: string[] = [];
    const unregister = registerBrepHoverController({
      suspend: async () => { events.push('suspend'); },
      resume: () => { events.push('resume'); },
    });

    const first = withExclusiveBrepCommand(async () => {
      events.push('task-1-start');
      await Promise.resolve();
      events.push('task-1-end');
      return 1;
    });
    const second = withExclusiveBrepCommand(async () => {
      events.push('task-2');
      return 2;
    });

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual([
      'suspend', 'task-1-start', 'task-1-end', 'resume',
      'suspend', 'task-2', 'resume',
    ]);
    unregister();
  });

  it('任务抛错仍 resume，队列继续', async () => {
    const events: string[] = [];
    registerBrepHoverController({
      suspend: async () => { events.push('suspend'); },
      resume: () => { events.push('resume'); },
    });

    await expect(withExclusiveBrepCommand(async () => {
      events.push('boom');
      throw new Error('boom');
    })).rejects.toThrow('boom');

    await withExclusiveBrepCommand(async () => { events.push('next'); });
    expect(events).toEqual(['suspend', 'boom', 'resume', 'suspend', 'next', 'resume']);
  });
});
