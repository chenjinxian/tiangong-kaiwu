/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * AppearancesPanel（2026-11-05 Onshape live 重做）：右缘「外观」按钮打开的面板。
 * 与 ViewCube 的「图形首选项」是**两个不同页面**（live 证据
 * ui-evidence/ui-polish-20261105/11-appearances-panel.png、
 * 13-appearances-with-part.png）：
 * - 标题「外观」+ tab 零件和曲面 / 草图和曲线；
 * - 零件行：名称 + 全宽颜色字段（逐 body color override）；
 * - 空态：线稿插画 + 「本文档中没有零件或曲面」；
 * - 底部 ? 帮助。
 */
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { BodyInfo } from '@luban-cad/shared';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import './AppearancesPanel.css';

export interface AppearanceSketchItem {
  id: string;
  label: string;
}

export interface AppearancesPanelProps {
  bodies: readonly BodyInfo[];
  sketches: readonly AppearanceSketchItem[];
  bodyColors: Readonly<Record<string, string>>;
  onBodyColorChange?: (bodyKey: string, color: string) => void;
}

type AppearanceTab = 'parts' | 'sketches';

const DEFAULT_BODY_COLOR = '#8c8c8c';

function EmptyIllustration(): React.JSX.Element {
  return (
    <svg className="part-studio-appearances__empty-art" viewBox="0 0 220 150" aria-hidden="true">
      <g fill="none" stroke="#e3e6e9" strokeWidth="3" strokeLinejoin="round">
        <path d="M40 58 l28 -15 l28 15 l-28 15 z" />
        <path d="M40 58 v30 l28 15 v-30 z" />
        <path d="M96 58 v30 l-28 15" />
        <path d="M63 73 v30" />
        <path d="M107 47 l13 -7 l13 7 l-13 7 z" />
        <path d="M107 47 v13 l13 7 v-13" />
        <path d="M133 88 l18 -10 l18 10 l-18 10 z" />
        <path d="M133 88 v22 l18 10 v-22 z" />
        <path d="M169 88 v22 l-18 10" />
        <rect x="112" y="112" width="70" height="24" rx="5" />
        <circle cx="124" cy="124" r="4" />
        <path d="M139 112 v24 M157 112 v24" />
      </g>
    </svg>
  );
}

export function AppearancesPanel({
  bodies, sketches, bodyColors, onBodyColorChange,
}: AppearancesPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = React.useState<AppearanceTab>('parts');
  const activeBodies = bodies.filter((body) => body.active && body.authored !== false);

  return (
    <div className="part-studio-appearances" data-testid="part-studio-appearances">
      <header className="part-studio-appearances__header">
        <span className="part-studio-appearances__title">{t('partStudio.appearances.title')}</span>
        <span className="part-studio-appearances__header-icon" aria-hidden="true">
          <OnshapeIcon name="appearances-button" size={16} />
        </span>
      </header>

      <div className="part-studio-appearances__tabs" role="tablist" aria-label={t('partStudio.appearances.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'parts'}
          className={tab === 'parts' ? 'part-studio-appearances__tab part-studio-appearances__tab--active' : 'part-studio-appearances__tab'}
          data-testid="appearances-tab-parts"
          onClick={() => setTab('parts')}
        >
          {t('partStudio.appearances.tabs.parts')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sketches'}
          className={tab === 'sketches' ? 'part-studio-appearances__tab part-studio-appearances__tab--active' : 'part-studio-appearances__tab'}
          data-testid="appearances-tab-sketches"
          onClick={() => setTab('sketches')}
        >
          {t('partStudio.appearances.tabs.sketches')}
        </button>
      </div>

      <div className="part-studio-appearances__content" role="tabpanel">
        {tab === 'parts' && (
          activeBodies.length === 0 ? (
            <div className="part-studio-appearances__empty" data-testid="appearances-empty-parts">
              <EmptyIllustration />
              <p>{t('partStudio.appearances.emptyParts')}</p>
            </div>
          ) : (
            <ul className="part-studio-appearances__list" aria-label={t('partStudio.appearances.tabs.parts')}>
              {activeBodies.map((body) => {
                const color = bodyColors[body.bodyKey] ?? DEFAULT_BODY_COLOR;
                return (
                  <li key={body.bodyKey} className="part-studio-appearances__row" data-testid="appearances-body-row">
                    <span className="part-studio-appearances__name" title={body.name ?? body.bodyKey}>
                      {body.name ?? body.bodyKey}
                    </span>
                    <input
                      type="color"
                      className="part-studio-appearances__color"
                      aria-label={t('partStudio.appearances.colorFor', { name: body.name ?? body.bodyKey })}
                      data-testid={`appearances-color-${body.bodyKey}`}
                      value={color}
                      disabled={onBodyColorChange === undefined}
                      onChange={(event) => onBodyColorChange?.(body.bodyKey, event.target.value)}
                    />
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === 'sketches' && (
          sketches.length === 0 ? (
            <div className="part-studio-appearances__empty" data-testid="appearances-empty-sketches">
              <EmptyIllustration />
              <p>{t('partStudio.appearances.emptySketches')}</p>
            </div>
          ) : (
            <ul className="part-studio-appearances__list" aria-label={t('partStudio.appearances.tabs.sketches')}>
              {sketches.map((sketch) => (
                <li key={sketch.id} className="part-studio-appearances__row" data-testid="appearances-sketch-row">
                  <span className="part-studio-appearances__name" title={sketch.label}>{sketch.label}</span>
                  <input
                    type="color"
                    className="part-studio-appearances__color"
                    aria-label={t('partStudio.appearances.colorFor', { name: sketch.label })}
                    value={DEFAULT_BODY_COLOR}
                    disabled
                    title={t('partStudio.appearances.sketchColorUnsupported')}
                  />
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <footer className="part-studio-appearances__footer">
        <span className="part-studio-appearances__help" title={t('partStudio.appearances.help')} aria-label={t('partStudio.appearances.help')}>?</span>
      </footer>
    </div>
  );
}
