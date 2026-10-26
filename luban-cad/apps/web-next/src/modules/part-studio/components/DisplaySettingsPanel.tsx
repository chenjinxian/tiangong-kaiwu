/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 显示设置面板（渲染对齐阶段 2，2026-10-26）：右停靠「显示设置」页签的
 * 真面板——壳期占位（T8+ 接管注记）到此兑现。口径对齐 Onshape View
 * settings / Graphics preferences（映射分析见 display-actions.ts 头注）：
 * - 显示模式五态（Onshape 六态减 Translucent——全局半透明无 iTwin 旋钮，
 *   诚实差距：面板注记「暂不支持」不硬造）；
 * - 透视开关 + FOV 20-120° 滑杆（仅透视时可用）；
 * - AO 开关 + 强度 0-100%（默认 37.5%，Onshape 同默认）；
 * - 可见边线宽 1-3px + 边线色。
 *
 * 会话级：改动即时热应用到当前视口（applyDisplaySettings no-op 安全），
 * 不落库（Onshape 为账号偏好持久——持久层后续任务再议，头注登记）。
 * 视口未就绪（壳期/编辑器未开）时控件禁用 + 提示，不静默假装生效。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyDisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  type DisplayModeId,
  type DisplaySettings,
} from '../internal/display-actions.js';
import './DisplaySettingsPanel.css';

const MODE_OPTIONS: readonly { id: DisplayModeId; labelKey: string }[] = [
  { id: 'shaded', labelKey: 'partStudio.displaySettingsPanel.mode.shaded' },
  { id: 'shaded-no-edges', labelKey: 'partStudio.displaySettingsPanel.mode.shadedNoEdges' },
  { id: 'shaded-hidden-edges', labelKey: 'partStudio.displaySettingsPanel.mode.shadedHiddenEdges' },
  { id: 'hidden-removed', labelKey: 'partStudio.displaySettingsPanel.mode.hiddenRemoved' },
  { id: 'hidden-visible', labelKey: 'partStudio.displaySettingsPanel.mode.hiddenVisible' },
];

export function DisplaySettingsPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [settings, setSettings] = React.useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  // 视口在场性：首次应用探针 + 每次改动后回读（无编辑器场景禁用控件并提示）
  const [viewportReady, setViewportReady] = React.useState(() => applyDisplaySettings(DEFAULT_DISPLAY_SETTINGS));

  const update = React.useCallback((patch: Partial<DisplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setViewportReady(applyDisplaySettings(next));
      return next;
    });
  }, []);

  return (
    <div className="part-studio-display-settings" data-testid="part-studio-display-settings">
      <label className="part-studio-display-settings__field">
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.modeLabel')}</span>
        <select
          className="part-studio-display-settings__select"
          aria-label={t('partStudio.displaySettingsPanel.modeLabel')}
          data-testid="part-studio-display-settings-mode"
          value={settings.mode}
          disabled={!viewportReady}
          onChange={(e) => update({ mode: e.target.value as DisplayModeId })}
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
          disabled={!viewportReady}
          onChange={(e) => update({ perspective: e.target.checked })}
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
          disabled={!viewportReady || !settings.perspective}
          onChange={(e) => update({ fovDegrees: Number(e.target.value) })}
        />
      </label>

      <label className="part-studio-display-settings__field part-studio-display-settings__field--row">
        <input
          type="checkbox"
          aria-label={t('partStudio.displaySettingsPanel.ao')}
          data-testid="part-studio-display-settings-ao"
          checked={settings.ambientOcclusion}
          disabled={!viewportReady}
          onChange={(e) => update({ ambientOcclusion: e.target.checked })}
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
          disabled={!viewportReady || !settings.ambientOcclusion}
          onChange={(e) => update({ aoIntensityPct: Number(e.target.value) })}
        />
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
          disabled={!viewportReady}
          onChange={(e) => update({ edgeWidthPx: Number(e.target.value) })}
        />
      </label>

      <label className="part-studio-display-settings__field part-studio-display-settings__field--row">
        <input
          type="color"
          aria-label={t('partStudio.displaySettingsPanel.edgeColor')}
          data-testid="part-studio-display-settings-edge-color"
          value={settings.edgeColor}
          disabled={!viewportReady}
          onChange={(e) => update({ edgeColor: e.target.value })}
        />
        <span className="part-studio-display-settings__label">{t('partStudio.displaySettingsPanel.edgeColor')}</span>
      </label>

      {!viewportReady && (
        <p className="part-studio-display-settings__hint" role="note" data-testid="part-studio-display-settings-no-viewport">
          {t('partStudio.displaySettingsPanel.noViewport')}
        </p>
      )}
    </div>
  );
}
