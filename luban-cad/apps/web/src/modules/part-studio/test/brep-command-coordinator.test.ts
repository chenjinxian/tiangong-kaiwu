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

  it('suspend 失败：任务不执行、不 resume，队列继续处理下一任务', async () => {
    const events: string[] = [];
    const unregisterFailing = registerBrepHoverController({
      suspend: async () => {
        events.push('suspend-fail');
        throw new Error('suspend-failed');
      },
      resume: () => { events.push('resume-fail'); },
    });

    await expect(withExclusiveBrepCommand(async () => { events.push('task-1'); }))
      .rejects.toThrow('suspend-failed');
    // fail-fast：任务未执行，且没有对未成功暂停的 hover 调用 resume。
    expect(events).toEqual(['suspend-fail']);
    unregisterFailing();

    // 失败只终止当前任务：队列不悬挂，下一任务照常 suspend → 执行 → resume。
    const unregister = registerBrepHoverController({
      suspend: async () => { events.push('suspend'); },
      resume: () => { events.push('resume'); },
    });
    await expect(withExclusiveBrepCommand(async () => { events.push('task-2'); return 2; }))
      .resolves.toBe(2);
    expect(events).toEqual(['suspend-fail', 'suspend', 'task-2', 'resume']);
    unregister();
  });
});
