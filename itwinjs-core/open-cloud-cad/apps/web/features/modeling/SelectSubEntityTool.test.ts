/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SelectSubEntityTool, runSelectSubEntityTool } from './SelectSubEntityTool.js';
import { SubEntityType } from '@itwin/editor-common';
import { IModelApp, BeButtonEvent } from '@itwin/core-frontend';

// Track calls to parent class methods
const mockExitTool = vi.fn();
const mockOnCleanup = vi.fn();
const mockOnDataButtonDown = vi.fn();

// Mock @itwin/editor-frontend
vi.mock('@itwin/editor-frontend', () => ({
  LocateSubEntityTool: class MockLocateSubEntityTool {
    static toolId = 'MockLocateSubEntity';
    static iconSpec = 'icon-mock';
    static namespace = 'Mock';

    agenda = { isEmpty: true, elements: [] };
    _acceptedSubEntities: unknown[] = [];

    async run(): Promise<boolean> {
      return true;
    }

    async exitTool(): Promise<void> {
      mockExitTool();
    }

    async onCleanup(): Promise<void> {
      mockOnCleanup();
    }

    async onDataButtonDown(): Promise<void> {
      mockOnDataButtonDown();
    }

    protected async addSubEntity(): Promise<void> {
      // noop
    }

    protected async removeSubEntity(): Promise<void> {
      // noop
    }

    protected wantSubEntityType(): boolean {
      return true;
    }

    protected getSubEntityFilter(): undefined {
      return undefined;
    }
  },
}));

// Mock @itwin/core-frontend
vi.mock('@itwin/core-frontend', () => ({
  IModelApp: {
    tools: {
      register: vi.fn(),
      run: vi.fn(),
    },
    notifications: {
      outputPrompt: vi.fn(),
    },
    accuSnap: {
      currHit: null,
    },
    viewManager: {
      invalidateDecorationsAllViews: vi.fn(),
    },
  },
  EventHandled: {
    Yes: 'yes',
    No: 'no',
  },
  BeButtonEvent: class MockBeButtonEvent {},
}));

describe('SelectSubEntityTool', () => {
  let tool: SelectSubEntityTool;

  beforeEach(() => {
    tool = new SelectSubEntityTool();
    vi.clearAllMocks();
  });

  it('should have correct toolId', () => {
    expect(SelectSubEntityTool.toolId).toBe('SelectSubEntity');
  });

  it('should have correct iconSpec', () => {
    expect(SelectSubEntityTool.iconSpec).toBe('icon-select-subentity');
  });

  it('should have correct namespace', () => {
    expect(SelectSubEntityTool.namespace).toBe('OpenCloudCad');
  });

  it('should not require writeable target', () => {
    expect(tool.requireWriteableTarget()).toBe(false);
  });

  describe('setOptions', () => {
    it('should set options correctly', () => {
      const onSubEntitySelected = vi.fn();
      const onComplete = vi.fn();

      tool.setOptions({
        mode: 'edge',
        onSubEntitySelected,
        onComplete,
      });

      expect(tool).toBeDefined();
    });
  });

  describe('wantSubEntityType', () => {
    it('should accept Face type when mode is face', () => {
      tool.setOptions({ mode: 'face' });
      expect(tool['wantSubEntityType'](SubEntityType.Face)).toBe(true);
      expect(tool['wantSubEntityType'](SubEntityType.Edge)).toBe(false);
      expect(tool['wantSubEntityType'](SubEntityType.Vertex)).toBe(false);
    });

    it('should accept Edge type when mode is edge', () => {
      tool.setOptions({ mode: 'edge' });
      expect(tool['wantSubEntityType'](SubEntityType.Edge)).toBe(true);
      expect(tool['wantSubEntityType'](SubEntityType.Face)).toBe(false);
      expect(tool['wantSubEntityType'](SubEntityType.Vertex)).toBe(false);
    });

    it('should accept Vertex type when mode is vertex', () => {
      tool.setOptions({ mode: 'vertex' });
      expect(tool['wantSubEntityType'](SubEntityType.Vertex)).toBe(true);
      expect(tool['wantSubEntityType'](SubEntityType.Face)).toBe(false);
      expect(tool['wantSubEntityType'](SubEntityType.Edge)).toBe(false);
    });

    it('should return false for unknown mode', () => {
      tool.setOptions({ mode: 'unknown' as 'face' });
      expect(tool['wantSubEntityType'](SubEntityType.Face)).toBe(false);
      expect(tool['wantSubEntityType'](SubEntityType.Edge)).toBe(false);
      expect(tool['wantSubEntityType'](SubEntityType.Vertex)).toBe(false);
    });
  });

  describe('onDataButtonDown', () => {
    it('should return EventHandled.No', async () => {
      const ev = new BeButtonEvent();
      const result = await tool.onDataButtonDown(ev);
      expect(result).toBe('no');
    });
  });

  describe('onResetButtonUp', () => {
    it('should exit tool', async () => {
      const ev = new BeButtonEvent();
      const result = await tool.onResetButtonUp(ev);

      expect(result).toBe('yes');
      expect(mockExitTool).toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should call onComplete callback', async () => {
      const onComplete = vi.fn();
      tool.setOptions({ mode: 'face', onComplete });

      await tool.onCleanup();

      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('onRestartTool', () => {
    it('should create new tool instance with same options', async () => {
      tool.setOptions({
        mode: 'edge',
      });

      await tool.onRestartTool();
      // Should not throw
    });
  });

  describe('setupAndPromptForNextAction', () => {
    it('should show prompt for face mode', () => {
      tool.setOptions({ mode: 'face' });
      tool['setupAndPromptForNextAction']();

      expect(IModelApp.notifications.outputPrompt).toHaveBeenCalledWith(
        expect.stringContaining('面 (Face)')
      );
    });

    it('should show prompt for edge mode', () => {
      tool.setOptions({ mode: 'edge' });
      tool['setupAndPromptForNextAction']();

      expect(IModelApp.notifications.outputPrompt).toHaveBeenCalledWith(
        expect.stringContaining('边 (Edge)')
      );
    });

    it('should show prompt for vertex mode', () => {
      tool.setOptions({ mode: 'vertex' });
      tool['setupAndPromptForNextAction']();

      expect(IModelApp.notifications.outputPrompt).toHaveBeenCalledWith(
        expect.stringContaining('顶点 (Vertex)')
      );
    });
  });

  describe('addSubEntity', () => {
    it('should call onSubEntitySelected callback', async () => {
      const onSubEntitySelected = vi.fn();
      tool.setOptions({ mode: 'face', onSubEntitySelected });

      const props = { subEntity: { index: 1, type: SubEntityType.Face } };
      await tool['addSubEntity']('test-element', props);

      expect(onSubEntitySelected).toHaveBeenCalledWith('test-element', props);
    });
  });

  describe('removeSubEntity', () => {
    it('should call onSubEntityDeselected callback', async () => {
      const onSubEntityDeselected = vi.fn();
      tool.setOptions({ mode: 'face', onSubEntityDeselected });

      const props = { subEntity: { index: 1, type: SubEntityType.Face } };
      await tool['removeSubEntity']('test-element', props);

      expect(onSubEntityDeselected).toHaveBeenCalledWith('test-element', props);
    });

    it('should not call callback when props is undefined', async () => {
      const onSubEntityDeselected = vi.fn();
      tool.setOptions({ mode: 'face', onSubEntityDeselected });

      await tool['removeSubEntity']('test-element', undefined);

      expect(onSubEntityDeselected).not.toHaveBeenCalled();
    });
  });
});

describe('runSelectSubEntityTool', () => {
  it('should create and run tool with options', async () => {
    const options = {
      mode: 'face' as const,
    };

    await expect(runSelectSubEntityTool(options)).resolves.not.toThrow();
  });
});
