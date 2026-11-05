/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 显示/渲染设置共享状态（2026-11-02）：ViewCube 下拉与右停靠 DisplaySettingsPanel
 * 共用同一实例（单一真源）。localStorage 持久化；viewport 就绪/设置变化即时应用；
 * background='theme' 跟随 data-theme observer，自定义背景优先。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScreenViewport } from '@itwin/core-frontend';
import { applyViewportBackground } from '@luban-cad/viewer';
import {
  applyDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  type BackgroundMode,
  type DisplaySettings,
} from '../internal/display-actions.js';

const STORAGE_KEY = 'luban.partStudio.displaySettings.v3';
/** v2 旧默认（AO 37.5% / 线宽 1px）→ v3（20% / 2px）一次性迁移源。 */
const LEGACY_V2_STORAGE_KEY = 'luban.partStudio.displaySettings.v2';

function mergeWithDefaults(parsed: Partial<DisplaySettings>): DisplaySettings {
  return { ...DEFAULT_DISPLAY_SETTINGS, ...parsed };
}

function loadSettings(): DisplaySettings {
  if (typeof localStorage === 'undefined') return DEFAULT_DISPLAY_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return mergeWithDefaults(JSON.parse(raw) as Partial<DisplaySettings>);
    const legacy = localStorage.getItem(LEGACY_V2_STORAGE_KEY);
    if (!legacy) return DEFAULT_DISPLAY_SETTINGS;
    // 只把仍等于 v2 默认的项迁到新默认；用户自定义的其他值保留。
    const migrated = JSON.parse(legacy) as Partial<DisplaySettings>;
    if (migrated.aoIntensityPct === 37.5)
      migrated.aoIntensityPct = DEFAULT_DISPLAY_SETTINGS.aoIntensityPct;
    if (migrated.edgeWidthPx === 1)
      migrated.edgeWidthPx = DEFAULT_DISPLAY_SETTINGS.edgeWidthPx;
    return mergeWithDefaults(migrated);
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

function saveSettings(settings: DisplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — session-only */
  }
}

function currentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export interface UseDisplaySettingsResult {
  settings: DisplaySettings;
  update: (patch: Partial<DisplaySettings>) => void;
  reset: () => void;
  viewportReady: boolean;
}

export function useDisplaySettings(viewport: ScreenViewport | null | undefined): UseDisplaySettingsResult {
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings);
  const viewportReady = Boolean(viewport);

  const applyBackground = useCallback((target: ScreenViewport | null | undefined, mode: BackgroundMode) => {
    if (!target) return;
    applyViewportBackground(target, mode === 'theme' ? currentTheme() : mode);
  }, []);

  const update = useCallback((patch: Partial<DisplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    saveSettings(DEFAULT_DISPLAY_SETTINGS);
    setSettings(DEFAULT_DISPLAY_SETTINGS);
  }, []);

  // 设置/视口变化 → 应用（含背景初值）。
  useEffect(() => {
    if (!viewport) return;
    applyDisplaySettings(viewport, settings);
    applyBackground(viewport, settings.background);
  }, [viewport, settings, applyBackground]);

  // 主题切换：theme 模式跟主题；自定义背景保持。
  useEffect(() => {
    if (!viewport) return;
    const onThemeChange = (): void => applyBackground(viewport, settings.background);
    const observer = new MutationObserver(onThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-iui-theme'],
    });
    return () => observer.disconnect();
  }, [viewport, settings.background, applyBackground]);

  return useMemo(() => ({ settings, update, reset, viewportReady }),
    [settings, update, reset, viewportReady]);
}
