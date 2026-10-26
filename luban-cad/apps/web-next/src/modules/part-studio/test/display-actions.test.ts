// @vitest-environment jsdom
/**
 * display-actions 单测（渲染对齐阶段 2）：五态 viewFlags 映射、AO 开关联动、
 * 透视/FOV 相机路径、边线宽/色、no-op 安全（selectedView 缺席）。
 * core-frontend mock（IModelApp.viewManager.selectedView 注入替身——本模块
 * 唯一外部触点）；core-common/core-geometry 真模块（纯数据对象）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderMode, ViewFlags } from '@itwin/core-common';
import { DisplayStyle3dState } from '@itwin/core-frontend';

const selectedViewMock = vi.fn();

vi.mock('@itwin/core-frontend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@itwin/core-frontend')>();
  return {
    ...actual,
    IModelApp: { viewManager: { get selectedView() { return selectedViewMock(); } } },
  };
});

import {
  aoIntensityFromPct,
  applyDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  type DisplayModeId,
} from '../internal/display-actions.js';

/** 3D 样式层替身（记录 setter 写入；真 HiddenLine/AO 数据对象）。 */
function fakeViewport() {
  const writes: Record<string, unknown> = {};
  const vp = {
    __viewFlags: ViewFlags.fromJSON({ renderMode: RenderMode.SmoothShade, visEdges: true }),
    get viewFlags() { return vp.__viewFlags; },
    set viewFlags(v: ViewFlags) { vp.__viewFlags = v; writes.viewFlags = v; },
    turnCameraOn: vi.fn(),
    turnCameraOff: vi.fn(),
    synchWithView: vi.fn(),
    view: {
      displayStyle: Object.create(DisplayStyle3dState.prototype, {
        settings: {
          value: {
            set ambientOcclusionSettings(v: unknown) { writes.ao = v; },
            get ambientOcclusionSettings() { return writes.__aoCur ?? { toJSON: () => ({ intensity: 2.0 }) }; },
            set hiddenLineSettings(v: unknown) { writes.hline = v; },
            get hiddenLineSettings() { return writes.__hlineCur ?? { toJSON: () => ({}), visible: undefined }; },
          },
        },
      }),
    },
  };
  return { vp, writes };
}

beforeEach(() => { selectedViewMock.mockReset(); });

describe('display-actions：Onshape View settings 映射', () => {
  // 着色三态断边组；HiddenLine/Wireframe 边显示由 renderMode 自带语义
  // （visEdges 随基线透传），只断 renderMode。
  const shadedCases: [DisplayModeId, number, boolean, boolean][] = [
    ['shaded', RenderMode.SmoothShade, true, false],
    ['shaded-no-edges', RenderMode.SmoothShade, false, false],
    ['shaded-hidden-edges', RenderMode.SmoothShade, true, true],
  ];
  for (const [mode, renderMode, vis, hid] of shadedCases) {
    it(`模式 ${mode} → renderMode=${renderMode} visEdges=${vis} hidEdges=${hid}`, () => {
      const { vp, writes } = fakeViewport();
      selectedViewMock.mockReturnValue(vp);
      const ok = applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, mode });
      expect(ok).toBe(true);
      const vf = writes.viewFlags as ViewFlags;
      expect(vf.renderMode).toBe(renderMode);
      expect(vf.visibleEdges).toBe(vis);
      expect(vf.hiddenEdges).toBe(hid);
    });
  }

  it('模式 hidden-removed → renderMode=HiddenLine', () => {
    const { vp, writes } = fakeViewport();
    selectedViewMock.mockReturnValue(vp);
    applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, mode: 'hidden-removed' });
    expect((writes.viewFlags as ViewFlags).renderMode).toBe(RenderMode.HiddenLine);
  });

  it('模式 hidden-visible → renderMode=Wireframe', () => {
    const { vp, writes } = fakeViewport();
    selectedViewMock.mockReturnValue(vp);
    applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, mode: 'hidden-visible' });
    expect((writes.viewFlags as ViewFlags).renderMode).toBe(RenderMode.Wireframe);
  });

  it('AO 开关联动 viewFlags.ambientOcclusion + 强度写入 settings', () => {
    const { vp, writes } = fakeViewport();
    selectedViewMock.mockReturnValue(vp);
    applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, ambientOcclusion: true, aoIntensityPct: 75 });
    expect((writes.viewFlags as ViewFlags).ambientOcclusion).toBe(true);
    expect(writes.ao).toBeDefined();
  });

  it('透视开→turnCameraOn(FOV)；关→turnCameraOff', () => {
    const { vp } = fakeViewport();
    selectedViewMock.mockReturnValue(vp);
    applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, perspective: true, fovDegrees: 60 });
    expect(vp.turnCameraOn).toHaveBeenCalledOnce();
    applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, perspective: false });
    expect(vp.turnCameraOff).toHaveBeenCalledOnce();
  });

  it('边线宽/色写入 hiddenLineSettings.visible（ovrColor 语义）', () => {
    const { vp, writes } = fakeViewport();
    selectedViewMock.mockReturnValue(vp);
    applyDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, edgeWidthPx: 2, edgeColor: '#112233' });
    const hline = writes.hline as { toJSON(): { visible?: { ovrColor?: boolean; color?: number; width?: number } } };
    const visible = hline.toJSON().visible ?? {};
    expect(visible).toMatchObject({ ovrColor: true, width: 2 });
  });

  it('selectedView 缺席 → no-op 返回 false（壳期安全）', () => {
    selectedViewMock.mockReturnValue(undefined);
    expect(applyDisplaySettings(DEFAULT_DISPLAY_SETTINGS)).toBe(false);
  });

  it('AO 百分比→幂指数换算锚点：37.5%↔2.0、0%→下夹、100%→上夹', () => {
    expect(aoIntensityFromPct(37.5)).toBeCloseTo(2.0);
    expect(aoIntensityFromPct(0)).toBe(0.25);
    expect(aoIntensityFromPct(100)).toBeLessThanOrEqual(8);
  });
});
