/**
 * Onshape 式编辑器默认渲染值（单一事实源，2026-11-12）。
 *
 * 证据：私有 live 取证 `editor-flow-parity-20261112`（Onshape Part Studio 首帧）：
 * - 背景纯白 #ffffff；
 * - 默认零件渲染色约 #536674（蓝灰，含光照后的观感）；
 * - 高亮约 #95b8d1（仅选择/预览，不在此处）；
 * - 首帧 69 帧无全黑帧。
 *
 * 这些值同时被 web（viewer/display settings）、私有 webhook-agent（baseline
 * DisplayStyle3d/类别外观）消费。只放纯数据，不依赖 iTwin 运行时，避免 shared
 * 反向依赖渲染库。
 */

export type RenderTheme = 'light' | 'dark';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface RenderLightDefaults {
  portrait: number;
  solar: number;
  ambient: number;
  hemisphere: number;
  specularIntensity: number;
  /** 太阳光方向（世界系，指向光源的反向；沿用 2026-10-26 Onshape 视觉基线）。 */
  solarDirection: readonly [number, number, number];
}

export interface RenderDefaults {
  /** 视口背景（Onshape 亮色纯白；暗色沿用既有 #262626 约定）。 */
  background: Record<RenderTheme, RgbColor>;
  /** 新建 Part Studio 的默认实体类别外观（SubCategoryAppearance）。 */
  body: RgbColor;
  /** BRep 可见边。 */
  edge: RgbColor;
  edgeWidthPx: number;
  antialiasSamples: 1 | 2 | 4 | 8;
  ambientOcclusion: boolean;
  aoIntensityPct: number;
  shadows: boolean;
  fovDegrees: number;
  glossinessPct: number;
  /** 灯光强度（占位/环境光/太阳/半球/高光）。 */
  lights: RenderLightDefaults;
  /** baseline DisplayStyle3d / SpatialViewDefinition 的默认名称。 */
  defaultViewName: string;
  /** 空 Part Studio 的默认取景半边长（mm）；用于避免 projectExtents 全场景取景。 */
  emptyViewRangeMm: number;
}

export const RENDER_DEFAULTS = {
  background: {
    light: { r: 255, g: 255, b: 255 },
    dark: { r: 38, g: 38, b: 38 },
  },
  // 2026-11-12 live: Onshape default part rendered blue-grey #536674.
  body: { r: 83, g: 102, b: 116 },
  edge: { r: 31, g: 31, b: 31 },
  edgeWidthPx: 2,
  antialiasSamples: 4,
  ambientOcclusion: true,
  aoIntensityPct: 20,
  shadows: false,
  fovDegrees: 45,
  glossinessPct: 3,
  lights: {
    portrait: 0.3,
    solar: 1,
    ambient: 0.2,
    hemisphere: 0,
    specularIntensity: 0.03,
    solarDirection: [0.1, 0.15, -0.98],
  },
  defaultViewName: 'default',
  emptyViewRangeMm: 150,
} as const satisfies RenderDefaults;

/** RGB → `#rrggbb`（UI 输入/日志用）。 */
export function rgbToHex(color: RgbColor): string {
  const hex = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

/**
 * RGB → iTwin `ColorDef.tbgr`（0xTTBBGGRR；透明字节 0=不透明，红在低字节）。
 * 不 import ColorDef，供 web/webhook-agent 在各自运行时转成 ColorDef。
 */
export function rgbToTbgr(color: RgbColor): number {
  const r = Math.max(0, Math.min(255, Math.round(color.r)));
  const g = Math.max(0, Math.min(255, Math.round(color.g)));
  const b = Math.max(0, Math.min(255, Math.round(color.b)));
  return ((b << 16) | (g << 8) | r) >>> 0;
}
