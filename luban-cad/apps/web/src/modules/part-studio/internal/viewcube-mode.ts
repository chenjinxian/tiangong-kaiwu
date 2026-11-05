/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ViewCube 渲染模式选择（2026-11-05）：
 * - 缺省/`?viewcube=itwin`：官方 `CubeNavigationAid`（AppUI 同源，默认；
 *   用户裁决交互手感更好）；
 * - `?viewcube=onshape`：自研 Onshape 模式（回退/Onshape 演示用）。
 * 大小写不敏感；未知值回落官方默认。
 *
 * 路由的 `usePartStudioScope` 会把 URL 重写为仅 `?model=`，显式选择因此在
 * 首次读取时写入 sessionStorage；同一标签页后续导航/刷新保持选择，直到显式
 * 参数覆盖或关闭标签页。v2 key 避免继承评估阶段的旧 opt-in。
 */
export type ViewCubeMode = 'onshape' | 'itwin';

export const VIEWCUBE_MODE_STORAGE_KEY = 'luban.viewcubeMode.v2';

type ModeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function resolveViewCubeMode(search: string): ViewCubeMode {
  const value = new URLSearchParams(search).get('viewcube')?.trim().toLowerCase();
  return value === 'onshape' ? 'onshape' : 'itwin';
}

/** 含显式参数时以 URL 为准并持久化；无参数时默认官方，沿用本标签页显式回退。 */
export function readViewCubeMode(
  search: string,
  storage: ModeStorage | null = null,
): ViewCubeMode {
  const hasExplicitParam = new URLSearchParams(search).has('viewcube');
  if (hasExplicitParam) {
    const mode = resolveViewCubeMode(search);
    try {
      storage?.setItem(VIEWCUBE_MODE_STORAGE_KEY, mode);
    } catch {
      // 隐私模式/禁用存储：忽略持久化，URL 本次仍生效。
    }
    return mode;
  }
  try {
    return storage?.getItem(VIEWCUBE_MODE_STORAGE_KEY) === 'onshape' ? 'onshape' : 'itwin';
  } catch {
    return 'itwin';
  }
}
