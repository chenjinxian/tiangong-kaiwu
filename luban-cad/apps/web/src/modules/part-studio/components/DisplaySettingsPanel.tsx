/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 显示/渲染设置面板（2026-11-02 恢复并扩展 2caeeafadf 的 Onshape 对齐面板）：
 * 右停靠 display 页签的完整表单。状态由 useDisplaySettings 共享给 ViewCube
 * 下拉，两处不漂移。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import type { DisplayModeId } from '../internal/display-actions.js';
import './DisplaySettingsPanel.css';

const MODE_OPTIONS: readonly { id: DisplayModeId; labelKey: string }[] = [
  { id: 'shaded', labelKey: 'partStudio.displaySettingsPanel.mode.shaded' },
  { id: 'shaded-no-edges', labelKey: 'partStudio.displaySettingsPanel.mode.shadedNoEdges' },
  { id: 'shaded-hidden-edges', labelKey: 'partStudio.displaySettingsPanel.mode.shadedHiddenEdges' },
  { id: 'hidden-removed', labelKey: 'partStudio.displaySettingsPanel.mode.hiddenRemoved' },
  { id: 'hidden-visible', labelKey: 'partStudio.displaySettingsPanel.mode.hiddenVisible' },
  { id: 'translucent', labelKey: 'partStudio.displaySettingsPanel.mode.translucent' },
];

export function DisplaySettingsPanel({
  settings,
  update,
  reset,
  viewportReady,
}: UseDisplaySettingsResult): React.JSX.Element {
  const { t } = useTranslation();
  const disabled = !viewportReady;
  const set = update;

  return (
    <div className="part-studio-display-settings" data-testid="part-studio-display-settings">
      <label className="part-studio-display-settings__field">
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.modeLabel')}</span>
        <select
          className="part-studio-display-settings__select"
          aria-label={t('partStudio.displaySettingsPanel.modeLabel')}
          data-testid="part-studio-display-settings-mode"
          value={settings.mode}
          disabled={disabled}
          onChange={(e) => set({ mode: e.target.value as DisplayModeId })}
        >
          {MODE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{t(o.labelKey)}</option>
          ))}
        </select>
        <span className="part-studio-display-settings__hint">
          {t('partStudio.displaySettingsPanel.translucentGap')}
        </span>
      </label>

      <label className="part-studio-display-settings__field part-studio-display-settings__field--row">
        <input
          type="checkbox"
          aria-label={t('partStudio.displaySettingsPanel.perspective')}
          data-testid="part-studio-display-settings-perspective"
          checked={settings.perspective}
          disabled={disabled}
          onChange={(e) => set({ perspective: e.target.checked })}
        />
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.perspective')}</span>
      </label>

      <label className="part-studio-display-settings__field">
        <span className="part-studio-display-settings__label">
          {t('partStudio.displaySettingsPanel.fov')}（{settings.fovDegrees}°）
        </span>
        <input
          type="range"
          min={20}
          max={120}
          step={1}
          aria-label={t('partStudio.displaySettingsPanel.fov')}
          data-testid="part-studio-display-settings-fov"
          value={settings.fovDegrees}
          disabled={disabled || !settings.perspective}
          onChange={(e) => set({ fovDegrees: Number(e.target.value) })}
        />
      </label>

      <label className="part-studio-display-settings__field part-studio-display-settings__field--row">
        <input
          type="checkbox"
          aria-label={t('partStudio.displaySettingsPanel.shadows')}
          data-testid="part-studio-display-settings-shadows"
          checked={settings.shadows}
          disabled={disabled}
          onChange={(e) => set({ shadows: e.target.checked })}
        />
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.shadows')}</span>
      </label>

      <label className="part-studio-display-settings__field part-studio-display-settings__field--row">
        <input
          type="checkbox"
          aria-label={t('partStudio.displaySettingsPanel.ao')}
          data-testid="part-studio-display-settings-ao"
          checked={settings.ambientOcclusion}
          disabled={disabled}
          onChange={(e) => set({ ambientOcclusion: e.target.checked })}
        />
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.ao')}</span>
      </label>

      <label className="part-studio-display-settings__field">
        <span className="part-studio-display-settings__label">
          {t('partStudio.displaySettingsPanel.aoIntensity')}（{settings.aoIntensityPct}%）
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={2.5}
          aria-label={t('partStudio.displaySettingsPanel.aoIntensity')}
          data-testid="part-studio-display-settings-ao-intensity"
          value={settings.aoIntensityPct}
          disabled={disabled || !settings.ambientOcclusion}
          onChange={(e) => set({ aoIntensityPct: Number(e.target.value) })}
        />
      </label>

      <label className="part-studio-display-settings__field">
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.antialias')}</span>
        <select
          className="part-studio-display-settings__select"
          aria-label={t('partStudio.displaySettingsPanel.antialias')}
          data-testid="part-studio-display-settings-antialias"
          value={settings.antialiasSamples}
          disabled={disabled}
          onChange={(e) => set({ antialiasSamples: Number(e.target.value) as 1 | 2 | 4 | 8 })}
        >
          {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}×</option>)}
        </select>
      </label>

      <label className="part-studio-display-settings__field">
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.background')}</span>
        <select
          className="part-studio-display-settings__select"
          aria-label={t('partStudio.displaySettingsPanel.background')}
          data-testid="part-studio-display-settings-background"
          value={settings.background}
          disabled={disabled}
          onChange={(e) => set({ background: e.target.value as 'theme' | 'light' | 'dark' })}
        >
          <option value="theme">{t('partStudio.displaySettingsPanel.backgroundTheme')}</option>
          <option value="light">{t('partStudio.displaySettingsPanel.backgroundLight')}</option>
          <option value="dark">{t('partStudio.displaySettingsPanel.backgroundDark')}</option>
        </select>
      </label>

      <label className="part-studio-display-settings__field">
        <span className="part-studio-display-settings__label">
          {t('partStudio.displaySettingsPanel.edgeWidth')}（{settings.edgeWidthPx}px）
        </span>
        <input
          type="range"
          min={1}
          max={3}
          step={1}
          aria-label={t('partStudio.displaySettingsPanel.edgeWidth')}
          data-testid="part-studio-display-settings-edge-width"
          value={settings.edgeWidthPx}
          disabled={disabled}
          onChange={(e) => set({ edgeWidthPx: Number(e.target.value) })}
        />
      </label>

      <label className="part-studio-display-settings__field part-studio-display-settings__field--row">
        <input
          type="color"
          aria-label={t('partStudio.displaySettingsPanel.edgeColor')}
          data-testid="part-studio-display-settings-edge-color"
          value={settings.edgeColor}
          disabled={disabled}
          onChange={(e) => set({ edgeColor: e.target.value })}
        />
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.edgeColor')}</span>
      </label>

      <button
        type="button"
        className="part-studio-display-settings__reset"
        data-testid="part-studio-display-settings-reset"
        disabled={disabled}
        onClick={reset}
      >
        {t('partStudio.displaySettingsPanel.reset')}
      </button>

      {disabled && (
        <p className="part-studio-display-settings__hint" role="note" data-testid="part-studio-display-settings-no-viewport">
          {t('partStudio.displaySettingsPanel.noViewport')}
        </p>
      )}
    </div>
  );
}
