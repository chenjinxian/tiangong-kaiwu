import { describe, expect, it } from 'vitest';
import { parseWorkspaceRef, workspaceRefPath } from '../workspace-ref.js';

describe('WorkspaceRef', () => {
  it('缺 iTwinId/iModelId 返回 null', () => {
    expect(parseWorkspaceRef({ iModelId: 'im-1' })).toBeNull();
    expect(parseWorkspaceRef({ iTwinId: 'twin-1' })).toBeNull();
  });

  it('解析 iTwinId/iModelId/model，model 可选', () => {
    expect(parseWorkspaceRef({ iTwinId: 'twin-1', iModelId: 'im-1' })).toEqual({
      iTwinId: 'twin-1',
      iModelId: 'im-1',
    });
    expect(
      parseWorkspaceRef({ iTwinId: 'twin-1', iModelId: 'im-1', model: 'model-1' }),
    ).toEqual({ iTwinId: 'twin-1', iModelId: 'im-1', modelId: 'model-1' });
  });

  it('路径：无 model 为 /documents/<twin>/<imodel>；有 model 加 ?model=', () => {
    expect(workspaceRefPath({ iTwinId: 'twin-1', iModelId: 'im-1' })).toBe(
      '/documents/twin-1/im-1',
    );
    expect(
      workspaceRefPath({ iTwinId: 'twin-1', iModelId: 'im-1', modelId: 'model-1' }),
    ).toBe('/documents/twin-1/im-1?model=model-1');
  });
});
