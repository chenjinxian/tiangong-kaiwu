import { describe, expect, it } from 'vitest';
import { RENDER_DEFAULTS, rgbToHex, rgbToTbgr } from './render-defaults.js';

describe('render defaults (Onshape editor parity 2026-11-12)', () => {
  it('pins the live Onshape background and default part color', () => {
    expect(RENDER_DEFAULTS.background.light).toEqual({ r: 255, g: 255, b: 255 });
    expect(RENDER_DEFAULTS.background.dark).toEqual({ r: 38, g: 38, b: 38 });
    expect(RENDER_DEFAULTS.body).toEqual({ r: 83, g: 102, b: 116 });
    expect(RENDER_DEFAULTS.edge).toEqual({ r: 31, g: 31, b: 31 });
    expect(RENDER_DEFAULTS.edgeWidthPx).toBe(2);
    expect(RENDER_DEFAULTS.antialiasSamples).toBe(4);
    expect(RENDER_DEFAULTS.ambientOcclusion).toBe(true);
    expect(RENDER_DEFAULTS.aoIntensityPct).toBe(20);
    expect(RENDER_DEFAULTS.defaultViewName).toBe('default');
  });

  it('converts rgb to css hex and iTwin tbgr', () => {
    expect(rgbToHex({ r: 83, g: 102, b: 116 })).toBe('#536674');
    // 0xTTBBGGRR with transparency 0 (opaque): 0x00746653.
    expect(rgbToTbgr({ r: 83, g: 102, b: 116 })).toBe(0x00746653);
  });
});
