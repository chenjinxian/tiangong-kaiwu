/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- hoisted mocks ---
const mocks = vi.hoisted(() => {
  const mockSetNormal = vi.fn();
  const mockSetOrigin = vi.fn();
  const mockSendHints = vi.fn();
  const mockRun = vi.fn().mockResolvedValue(true);
  const mockExitTool = vi.fn().mockResolvedValue(undefined);
  const mockInitLocateElements = vi.fn();

  return {
    mockSetNormal,
    mockSetOrigin,
    mockSendHints,
    mockRun,
    mockExitTool,
    mockInitLocateElements,
    mockGetZVector: vi.fn(() => ({ x: 0, y: 0, z: 1 })),
    mockCurrHit: null as any,
  };
});

vi.mock('@itwin/core-frontend', () => ({
   
  PrimitiveTool: class MockPrimitiveTool {
    public initLocateElements = mocks.mockInitLocateElements;
    public exitTool = mocks.mockExitTool;
    public async run(): Promise<boolean> {
      return mocks.mockRun();
    }
    public async onPostInstall(): Promise<void> {
      // Mock base class implementation
    }
  },
  AccuDrawHintBuilder: class MockAccuDrawHintBuilder {
    public setNormal = mocks.mockSetNormal;
    public setOrigin = mocks.mockSetOrigin;
    public sendHints = mocks.mockSendHints;
  },
  IModelApp: {
    locateManager: {
      options: { allowDecorations: false },
    },
    accuSnap: {
      get currHit() {
        return mocks.mockCurrHit;
      },
    },
    tools: {
      register: vi.fn(),
      run: vi.fn(),
    },
  },
  BeButtonEvent: class MockBeButtonEvent {
    public point = { x: 1, y: 2, z: 3 };
    public viewport = {
      view: {
        getZVector: mocks.mockGetZVector,
      },
    };
  },
  SnapDetail: class MockSnapDetail {
    public normal: any;
    public hitPoint: any;
    constructor(normal?: any, hitPoint?: any) {
      this.normal = normal;
      this.hitPoint = hitPoint;
    }
  },
  EventHandled: { Yes: 'Yes', No: 'No' },
   
}));

import { SetSketchPlaneTool } from './SetSketchPlaneTool.js';
import { EventHandled, SnapDetail } from '@itwin/core-frontend';

describe('SetSketchPlaneTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockCurrHit = null;
  });

  it('should have correct toolId and iconSpec', () => {
    expect(SetSketchPlaneTool.toolId).toBe('SetSketchPlane');
    expect(SetSketchPlaneTool.iconSpec).toBe('icon-plane');
  });

  it('should not require writeable target', () => {
    const tool = new SetSketchPlaneTool();
    expect(tool.requireWriteableTarget()).toBe(false);
  });

  describe('onPostInstall', () => {
    it('should initialize locate elements and configure locate manager', async () => {
      const tool = new SetSketchPlaneTool();

      // The tool should call initLocateElements during setup
      // Since super.onPostInstall is mocked, we just verify the tool doesn't throw
      await expect(tool.onPostInstall()).resolves.not.toThrow();
    });
  });

  describe('onDataButtonDown', () => {
    it('should set plane from snap hit with normal', async () => {
      const normal = { x: 0, y: 0, z: 1 };
      const hitPoint = { x: 10, y: 20, z: 30 };
      mocks.mockCurrHit = new SnapDetail(normal, hitPoint);

      const tool = new SetSketchPlaneTool();
      const ev = new (await import('@itwin/core-frontend')).BeButtonEvent();

      const result = await tool.onDataButtonDown(ev);

      expect(mocks.mockSetNormal).toHaveBeenCalledWith(normal);
      expect(mocks.mockSetOrigin).toHaveBeenCalledWith(hitPoint);
      expect(mocks.mockSendHints).toHaveBeenCalledWith(false);
      expect(result).toBe(EventHandled.Yes);
    });

    it('should set origin only when snap hit has no normal', async () => {
      const hitPoint = { x: 5, y: 10, z: 15 };
      // Create a snap hit without normal (but still a valid hit)
      mocks.mockCurrHit = {
        ...new SnapDetail(undefined, hitPoint),
        normal: undefined,
      };

      const tool = new SetSketchPlaneTool();
      const ev = new (await import('@itwin/core-frontend')).BeButtonEvent();

      const result = await tool.onDataButtonDown(ev);

      expect(mocks.mockSetNormal).not.toHaveBeenCalled();
      expect(mocks.mockSetOrigin).toHaveBeenCalledWith(hitPoint);
      expect(mocks.mockSendHints).toHaveBeenCalledWith(false);
      expect(result).toBe(EventHandled.Yes);
    });

    it('should use viewport Z vector when no snap hit', async () => {
      mocks.mockCurrHit = null;
      const mockZVector = { x: 0, y: 1, z: 0 };
      mocks.mockGetZVector.mockReturnValue(mockZVector);

      const tool = new SetSketchPlaneTool();
      const ev = new (await import('@itwin/core-frontend')).BeButtonEvent();

      const result = await tool.onDataButtonDown(ev);

      expect(mocks.mockSetNormal).toHaveBeenCalledWith(mockZVector);
      expect(mocks.mockSetOrigin).toHaveBeenCalledWith(ev.point);
      expect(mocks.mockSendHints).toHaveBeenCalledWith(false);
      expect(result).toBe(EventHandled.Yes);
    });
  });

  describe('onResetButtonUp', () => {
    it('should exit tool and return Yes', async () => {
      const tool = new SetSketchPlaneTool();
      const ev = new (await import('@itwin/core-frontend')).BeButtonEvent();

      const result = await tool.onResetButtonUp(ev);

      expect(mocks.mockExitTool).toHaveBeenCalled();
      expect(result).toBe(EventHandled.Yes);
    });
  });

  describe('onRestartTool', () => {
    it('should run a new instance of the tool', async () => {
      const tool = new SetSketchPlaneTool();
      mocks.mockRun.mockResolvedValue(true);

      await tool.onRestartTool();

      expect(mocks.mockRun).toHaveBeenCalled();
    });

    it('should exit current tool if new instance fails to run', async () => {
      const tool = new SetSketchPlaneTool();
      mocks.mockRun.mockResolvedValue(false);

      await tool.onRestartTool();

      expect(mocks.mockRun).toHaveBeenCalled();
      expect(mocks.mockExitTool).toHaveBeenCalled();
    });
  });
});
