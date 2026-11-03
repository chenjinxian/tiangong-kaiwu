/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 默认几何图元实时可见性（2026-11-02）：body/草图状态变化 → 纯规则 →
 * store.syncDatumVisibility（树/视口装饰件单一消费面）。用户眼睛覆盖在
 * store visibilityOverrides，scope 切换由 Session 清空。
 */
import { useEffect, useMemo } from 'react';
import type { SketchPlaneDto } from '@luban-cad/shared';
import { resolveDatumVisibility } from '../internal/datum-visibility.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

export function useDatumVisibility(
  hasBodies: boolean,
  isSketchActive: boolean,
  activeSketchPlane: SketchPlaneDto | null | undefined,
  isPlanePicking = false,
): void {
  const overrides = usePartStudioStore((s) => s.datum.visibilityOverrides);
  const effective = useMemo(
    () => resolveDatumVisibility({ hasBodies, isSketchActive, activeSketchPlane, isPlanePicking, overrides }),
    [hasBodies, isSketchActive, activeSketchPlane, isPlanePicking, overrides],
  );

  useEffect(() => {
    usePartStudioStore.getState().syncDatumVisibility(effective);
  }, [effective]);
}
