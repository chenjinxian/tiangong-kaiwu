/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * GraphicsPreferencesDialog（2026-11-05 Onshape live 重做）：ViewCube 菜单
 * 「图形首选项…」打开的左侧非模态面板，对齐 live 证据
 * `onshape-parity-data/ui-evidence/ui-polish-20261105/09-graphics-preferences.png`
 * 与 `12-graphics-sketch-tab.png`：标题 + 绿✓/红✗、常规/草图 tab、可折叠分组、
 * 滑杆/数值/颜色字段、info 圆点、重置为默认值。
 *
 * 已支持并生效：环境光遮蔽、视野、线宽、光泽度（→ iTwin specularIntensity）。
 * 当前渲染器未暴露的项（镜面反射颜色/剖面干涉颜色/影线边/网格/草图颜色等）
 * 保持 Onshape 分组与控件外观，但禁用并标注「当前渲染器暂不支持」，不静默假生效。
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SvgCheckmark, SvgClose, SvgChevronDown, SvgInfoCircularHollow } from '@itwin/itwinui-icons-react';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import './GraphicsPreferencesDialog.css';

export interface GraphicsPreferencesDialogProps {
  displaySettings: UseDisplaySettingsResult;
  onClose: () => void;
}

type TabId = 'general' | 'sketch';

function InfoDot({ label }: { label: string }): React.JSX.Element {
  return (
    <span className="part-studio-gfx__info" title={label} aria-label={label}>
      <SvgInfoCircularHollow />
    </span>
  );
}

function Section({
  id, title, open, onToggle, children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="part-studio-gfx__section" data-testid={`gfx-section-${id}`}>
      <button
        type="button"
        className="part-studio-gfx__section-header"
        aria-expanded={open}
        onClick={onToggle}
      >
        <SvgChevronDown
          className={open ? 'part-studio-gfx__chevron' : 'part-studio-gfx__chevron part-studio-gfx__chevron--closed'}
          aria-hidden="true"
        />
        <span>{title}</span>
      </button>
      {open && <div className="part-studio-gfx__section-body">{children}</div>}
    </section>
  );
}

function SliderRow({
  id, label, valueText, min, max, step, value, onChange, disabled = false, info,
}: {
  id: string;
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  info: string;
}): React.JSX.Element {
  return (
    <div className={`part-studio-gfx__row${disabled ? ' part-studio-gfx__row--disabled' : ''}`} data-testid={`gfx-row-${id}`}>
      <div className="part-studio-gfx__row-head">
        <span className="part-studio-gfx__label">{label}</span>
        <span className="part-studio-gfx__value">{valueText}</span>
        <InfoDot label={info} />
      </div>
      <input
        type="range"
        className="part-studio-gfx__range"
        aria-label={label}
        data-testid={`gfx-${id}`}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(Number(event.target.value))}
      />
    </div>
  );
}

function ColorRow({
  id, label, color, disabled = false, info, onChange,
}: {
  id: string;
  label: string;
  color: string;
  disabled?: boolean;
  info: string;
  onChange?: (color: string) => void;
}): React.JSX.Element {
  return (
    <div className={`part-studio-gfx__row part-studio-gfx__row--color${disabled ? ' part-studio-gfx__row--disabled' : ''}`} data-testid={`gfx-row-${id}`}>
      <span className="part-studio-gfx__label">{label}</span>
      <input
        type="color"
        className="part-studio-gfx__color"
        aria-label={label}
        data-testid={`gfx-${id}`}
        value={color}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
      <InfoDot label={info} />
    </div>
  );
}

function NumberRow({
  id, label, value, unit, disabled = false, info,
}: {
  id: string;
  label: string;
  value: string;
  unit: string;
  disabled?: boolean;
  info: string;
}): React.JSX.Element {
  return (
    <div className={`part-studio-gfx__row${disabled ? ' part-studio-gfx__row--disabled' : ''}`} data-testid={`gfx-row-${id}`}>
      <div className="part-studio-gfx__row-head">
        <span className="part-studio-gfx__label">{label}</span>
        <span className="part-studio-gfx__value">{value} {unit}</span>
        <InfoDot label={info} />
      </div>
    </div>
  );
}

const UNSUPPORTED = '当前渲染器暂不支持该项（不静默假生效）';

export function GraphicsPreferencesDialog({
  displaySettings, onClose,
}: GraphicsPreferencesDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { settings, update } = displaySettings;
  const initial = React.useRef(settings);
  const [tab, setTab] = React.useState<TabId>('general');
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggle = (id: string): void => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  const isOpen = (id: string): boolean => !collapsed[id];

  const cancel = (): void => {
    update(initial.current);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label={t('partStudio.graphicsDialog.title')}
      className="part-studio-gfx"
      data-testid="part-studio-graphics-dialog"
    >
      <header className="part-studio-gfx__header">
        <h2 className="part-studio-gfx__title">{t('partStudio.graphicsDialog.title')}</h2>
        <div className="part-studio-gfx__header-actions">
          <button
            type="button"
            className="part-studio-gfx__confirm"
            aria-label={t('partStudio.featureDialog.confirm')}
            data-testid="gfx-confirm"
            onClick={onClose}
          >
            <SvgCheckmark />
          </button>
          <button
            type="button"
            className="part-studio-gfx__cancel"
            aria-label={t('partStudio.featureDialog.cancel')}
            data-testid="gfx-cancel"
            onClick={cancel}
          >
            <SvgClose />
          </button>
        </div>
      </header>

      <div className="part-studio-gfx__tabs" role="tablist" aria-label={t('partStudio.graphicsDialog.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'general'}
          className={tab === 'general' ? 'part-studio-gfx__tab part-studio-gfx__tab--active' : 'part-studio-gfx__tab'}
          data-testid="gfx-tab-general"
          onClick={() => setTab('general')}
        >
          {t('partStudio.graphicsDialog.tabs.general')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sketch'}
          className={tab === 'sketch' ? 'part-studio-gfx__tab part-studio-gfx__tab--active' : 'part-studio-gfx__tab'}
          data-testid="gfx-tab-sketch"
          onClick={() => setTab('sketch')}
        >
          {t('partStudio.graphicsDialog.tabs.sketch')}
        </button>
      </div>

      <div className="part-studio-gfx__content">
        {tab === 'general' ? (
          <>
            <Section id="viewport" title={t('partStudio.graphicsDialog.viewport')} open={isOpen('viewport')} onToggle={() => toggle('viewport')}>
              <SliderRow
                id="ao" label={t('partStudio.graphicsDialog.ao')}
                valueText={`${settings.ambientOcclusion ? settings.aoIntensityPct : 0} %`}
                min={0} max={100} step={2.5} value={settings.ambientOcclusion ? settings.aoIntensityPct : 0}
                info={t('partStudio.graphicsDialog.aoInfo')}
                onChange={(value) => update({ ambientOcclusion: value > 0, aoIntensityPct: value })}
              />
              <SliderRow
                id="fov" label={t('partStudio.graphicsDialog.fov')}
                valueText={`${settings.fovDegrees} deg`}
                min={20} max={120} step={1} value={settings.fovDegrees}
                info={t('partStudio.graphicsDialog.fovInfo')}
                onChange={(value) => update({ fovDegrees: value })}
              />
            </Section>

            <Section id="shadow" title={t('partStudio.graphicsDialog.shadow')} open={isOpen('shadow')} onToggle={() => toggle('shadow')}>
              <SliderRow
                id="edge-width" label={t('partStudio.graphicsDialog.lineWidth')}
                valueText={`${settings.edgeWidthPx} px`}
                min={1} max={5} step={1} value={settings.edgeWidthPx}
                info={t('partStudio.graphicsDialog.lineWidthInfo')}
                onChange={(value) => update({ edgeWidthPx: value })}
              />
              <SliderRow
                id="glossiness" label={t('partStudio.graphicsDialog.glossiness')}
                valueText={`${settings.glossinessPct} %`}
                min={0} max={100} step={1} value={settings.glossinessPct}
                info={t('partStudio.graphicsDialog.glossinessInfo')}
                onChange={(value) => update({ glossinessPct: value })}
              />
              <ColorRow id="specular-color" label={t('partStudio.graphicsDialog.specularColor')} color="#b0b0b0" disabled info={UNSUPPORTED} />
              <ColorRow id="section-color" label={t('partStudio.graphicsDialog.sectionColor')} color="#c00000" disabled info={UNSUPPORTED} />
            </Section>

            <Section id="hatch" title={t('partStudio.graphicsDialog.hatchEdges')} open={isOpen('hatch')} onToggle={() => toggle('hatch')}>
              <NumberRow id="hatch-width" label={t('partStudio.graphicsDialog.hatchWidth')} value="0.5" unit="px" disabled info={UNSUPPORTED} />
              <ColorRow id="hatch-color" label={t('partStudio.graphicsDialog.hatchColor')} color="#000000" disabled info={UNSUPPORTED} />
            </Section>

            <Section id="grid" title={t('partStudio.graphicsDialog.grid')} open={isOpen('grid')} onToggle={() => toggle('grid')}>
              <NumberRow id="grid-width" label={t('partStudio.graphicsDialog.gridWidth')} value="0.3" unit="px" disabled info={UNSUPPORTED} />
            </Section>
          </>
        ) : (
          <>
            <Section id="active-sketch" title={t('partStudio.graphicsDialog.activeSketch')} open={isOpen('active-sketch')} onToggle={() => toggle('active-sketch')}>
              <NumberRow id="active-sketch-width" label={t('partStudio.graphicsDialog.sketchLineWidth')} value="2" unit="px" disabled info={UNSUPPORTED} />
              <ColorRow id="constraint-color" label={t('partStudio.graphicsDialog.constraintColor')} color="#000000" disabled info={UNSUPPORTED} />
              <ColorRow id="underconstrained-color" label={t('partStudio.graphicsDialog.underconstrainedColor')} color="#0000ff" disabled info={UNSUPPORTED} />
              <ColorRow id="underconstrained-occluded-color" label={t('partStudio.graphicsDialog.underconstrainedOccludedColor')} color="#0000ff" disabled info={UNSUPPORTED} />
            </Section>

            <Section id="inactive-sketch" title={t('partStudio.graphicsDialog.inactiveSketch')} open={isOpen('inactive-sketch')} onToggle={() => toggle('inactive-sketch')}>
              <NumberRow id="inactive-sketch-width" label={t('partStudio.graphicsDialog.sketchLineWidth')} value="1" unit="px" disabled info={UNSUPPORTED} />
              <ColorRow id="inactive-sketch-color" label={t('partStudio.graphicsDialog.sketchColor')} color="#969da4" disabled info={UNSUPPORTED} />
            </Section>

            <Section id="construction" title={t('partStudio.graphicsDialog.construction')} open={isOpen('construction')} onToggle={() => toggle('construction')}>
              <NumberRow id="construction-dash-1" label={t('partStudio.graphicsDialog.dash1')} value="4" unit="px" disabled info={UNSUPPORTED} />
              <NumberRow id="construction-gap-1" label={t('partStudio.graphicsDialog.gap1')} value="6" unit="px" disabled info={UNSUPPORTED} />
              <NumberRow id="construction-dash-2" label={t('partStudio.graphicsDialog.dash2')} value="30" unit="px" disabled info={UNSUPPORTED} />
              <NumberRow id="construction-gap-2" label={t('partStudio.graphicsDialog.gap2')} value="6" unit="px" disabled info={UNSUPPORTED} />
            </Section>
          </>
        )}
      </div>

      <footer className="part-studio-gfx__footer">
        <button
          type="button"
          className="part-studio-gfx__reset"
          data-testid="gfx-reset"
          onClick={() => displaySettings.reset()}
        >
          {t('partStudio.graphicsDialog.reset')}
        </button>
        <span className="part-studio-gfx__help" title={t('partStudio.graphicsDialog.help')} aria-label={t('partStudio.graphicsDialog.help')}>?</span>
      </footer>
    </div>
  );
}
