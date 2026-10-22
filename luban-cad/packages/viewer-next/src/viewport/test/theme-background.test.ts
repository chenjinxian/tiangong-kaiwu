// theme-background（web-next M4 Task 2）：Onshape 式视口底色纯函数验收——
//  亮色 (242,244,247) / 暗色 (38,38,38)（旧 Editor.tsx:243-260 实测值），
//  色值按 ColorDef 的 0xTTBBGGRR 编码钉死（防实现与断言同式互证）。
//  data-theme 的 MutationObserver 接线在消费侧（apps/web-next），不在本模块。

import { describe, expect, it, vi } from 'vitest';
import { applyViewportBackground, type ViewportTheme } from '../theme-background.js';
import type { ScreenViewport } from '@itwin/core-frontend';

/** 构造假 viewport：只暴露 view.displayStyle.backgroundColor 写入位 + invalidateScene。 */
function makeFakeViewport(): {
  view: { displayStyle: { backgroundColor: unknown } };
  invalidateScene: ReturnType<typeof vi.fn>;
} {
  return {
    view: { displayStyle: { backgroundColor: undefined } },
    invalidateScene: vi.fn(),
  };
}

/** ColorDef.from(r,g,b) 的期望 tbgr（t=0）：0x00BBGGRR。 */
const EXPECTED = {
  light: 0x00f7f4f2, // (242, 244, 247)
  dark: 0x00262626, // (38, 38, 38)
} as const;

describe.each([
  ['light', EXPECTED.light],
  ['dark', EXPECTED.dark],
] as ReadonlyArray<[ViewportTheme, number]>)('applyViewportBackground（%s）', (theme, expectedTbgr) => {
  it(`底色写 (tbgr=0x${expectedTbgr.toString(16)}) 并 invalidateScene`, () => {
    const viewport = makeFakeViewport();
    applyViewportBackground(viewport as unknown as ScreenViewport, theme);
    expect((viewport.view.displayStyle.backgroundColor as { tbgr: number }).tbgr).toBe(expectedTbgr);
    expect(viewport.invalidateScene).toHaveBeenCalledTimes(1);
  });
});
