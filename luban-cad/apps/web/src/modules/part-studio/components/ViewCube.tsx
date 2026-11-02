/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 风格 ViewCube + 视图/显示设置下拉（2026-11-02）。
 * - 大 cube：六面 + 四角 + 罗盘环；朝向由 view.getRotation() 实时同步；
 *   面/角点击设置标准或自定义方向；拖动 cube 直接旋转相机。
 * - 小 cube：打开显示/视图设置下拉（方向/适应/窗口/六显示模式/透视/AO/
 *   阴影/AA/背景/边线）；“更多”打开右停靠完整面板。
 * - 纯 core-frontend API + iTwinUI，不引入 AppUI。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  IModelApp,
  StandardViewId,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Matrix3d, Vector3d } from '@itwin/core-geometry';
import { SvgChevronDown } from '@itwin/itwinui-icons-react';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import type { DisplayModeId } from '../internal/display-actions.js';
import {
  axisScreenDirections,
  cssMatrix3dFromRotation,
  DIMETRIC_DIRECTION,
  ISO_DIRECTION,
  orbitDirection,
  projectFaceLabels,
  TRIMETRIC_DIRECTION,
  viewRotationFromDirection,
} from '../internal/view-orientation.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import './ViewCube.css';

export interface ViewCubeProps {
  viewport?: ScreenViewport | null;
  displaySettings?: UseDisplaySettingsResult;
}

type FaceId = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
/**
 * CSS 局部坐标 y 向下；cube 局部 +Z（正对屏）对应世界 +Z（Top），局部 -Y
 * 对应世界 +Y（Back）。标准 Front 视图看向 -Y 侧，故 Front 面位于视觉下方。
 */
const FACES: readonly { id: FaceId; transform: string; viewId: StandardViewId }[] = [
  { id: 'top', transform: 'translateZ(32px)', viewId: StandardViewId.Top },
  { id: 'bottom', transform: 'rotateY(180deg) translateZ(32px)', viewId: StandardViewId.Bottom },
  { id: 'right', transform: 'rotateY(90deg) translateZ(32px)', viewId: StandardViewId.Right },
  { id: 'left', transform: 'rotateY(-90deg) translateZ(32px)', viewId: StandardViewId.Left },
  { id: 'back', transform: 'rotateX(90deg) translateZ(32px)', viewId: StandardViewId.Back },
  { id: 'front', transform: 'rotateX(-90deg) translateZ(32px)', viewId: StandardViewId.Front },
];

const CORNERS: readonly { id: string; className: string; dir: [number, number, number] }[] = [
  { id: 'top-front-left', className: 'tl', dir: [-1, -1, 1] },
  { id: 'top-front-right', className: 'tr', dir: [1, -1, 1] },
  { id: 'top-back-left', className: 'bl', dir: [-1, 1, 1] },
  { id: 'top-back-right', className: 'br', dir: [1, 1, 1] },
];

const MODE_IDS: readonly DisplayModeId[] = [
  'shaded', 'shaded-no-edges', 'shaded-hidden-edges', 'hidden-removed', 'hidden-visible', 'translucent',
];
const MODE_LABEL_KEYS: Record<DisplayModeId, string> = {
  shaded: 'partStudio.displaySettingsPanel.mode.shaded',
  'shaded-no-edges': 'partStudio.displaySettingsPanel.mode.shadedNoEdges',
  'shaded-hidden-edges': 'partStudio.displaySettingsPanel.mode.shadedHiddenEdges',
  'hidden-removed': 'partStudio.displaySettingsPanel.mode.hiddenRemoved',
  'hidden-visible': 'partStudio.displaySettingsPanel.mode.hiddenVisible',
  translucent: 'partStudio.displaySettingsPanel.mode.translucent',
};

export function ViewCube({ viewport, displaySettings }: ViewCubeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [rotation, setRotation] = React.useState(() => Matrix3d.createIdentity());
  const [menuOpen, setMenuOpen] = React.useState(false);
  const dragRef = React.useRef<{ x: number; y: number; dir: [number, number, number]; right: [number, number, number] } | null>(null);
  const setDockTab = usePartStudioStore((s) => s.setDockTab);
  const openDock = usePartStudioStore((s) => s.openDock);

  React.useEffect(() => {
    if (!viewport || typeof viewport.view.getRotation !== 'function') return;
    const update = (): void => {
      // clone：iTwin 的 view.setRotation 可能原地改写同一 Matrix3d 实例，
      // 直接存引用会让 React/Object.is 判等跳过渲染（实测 cube 停在旧朝向）。
      setRotation(viewport.view.getRotation().clone());
    };
    update();
    const event = viewport.onViewChanged;
    if (!event || typeof event.addListener !== 'function') return;
    event.addListener(update);
    return () => { event.removeListener(update); };
  }, [viewport]);

  // core-frontend 的 setStandardRotation/synchWithView 不保证 raise onViewChanged
  //（实测：程序化换视图后 cube 会停在旧朝向）——动作后显式回读一次。
  const syncRotation = React.useCallback((): void => {
    if (viewport && typeof viewport.view.getRotation === 'function')
      setRotation(viewport.view.getRotation().clone());
  }, [viewport]);

  const applyRotation = React.useCallback((dir: { x: number; y: number; z: number }) => {
    if (!viewport) return;
    const rotation = viewRotationFromDirection(Vector3d.create(dir.x, dir.y, dir.z));
    if (!rotation) return;
    viewport.view.setRotation(rotation);
    if (viewport.view.is3d()) viewport.view.turnCameraOff();
    viewport.synchWithView({});
    syncRotation();
  }, [viewport, syncRotation]);

  const setStandard = React.useCallback((id: StandardViewId) => {
    if (!viewport) return;
    viewport.setStandardRotation(id);
    if (viewport.view.is3d()) viewport.view.turnCameraOff();
    viewport.synchWithView({});
    syncRotation();
  }, [viewport, syncRotation]);

  const fitAll = React.useCallback(() => {
    if (!viewport) return;
    // computeFitRange 是世界坐标，必须走 lookAtVolume（view-aligned 投影）。
    viewport.view.lookAtVolume(viewport.view.computeFitRange(), viewport.viewRect.aspect);
    viewport.synchWithView({});
  }, [viewport]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!viewport) return;
    // 面/角按钮上的按下是点击，不是拖动（按钮事件冒泡到 stage）。
    if ((event.target as HTMLElement).closest('button')) return;
    const rotation = viewport.view.getRotation();
    const z = rotation.rowZ();
    const x = rotation.rowX();
    dragRef.current = { x: event.clientX, y: event.clientY, dir: [z.x, z.y, z.z], right: [x.x, x.y, x.z] };
    if (typeof event.currentTarget.setPointerCapture === 'function')
      event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || !viewport) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const next = orbitDirection(
      Vector3d.create(drag.dir[0], drag.dir[1], drag.dir[2]),
      Vector3d.create(drag.right[0], drag.right[1], drag.right[2]),
      -dx * 0.008,
      dy * 0.008,
    );
    if (next) applyRotation(next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = null;
    if (typeof event.currentTarget.hasPointerCapture === 'function'
      && event.currentTarget.hasPointerCapture(event.pointerId)
      && typeof event.currentTarget.releasePointerCapture === 'function')
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const settings = displaySettings?.settings;
  const update = displaySettings?.update;
  const transform = React.useMemo(() => cssMatrix3dFromRotation(rotation), [rotation]);
  const faceLabels = React.useMemo(() => projectFaceLabels(rotation), [rotation]);
  const axes = React.useMemo(() => axisScreenDirections(rotation), [rotation]);
  const triadOrigin = { x: 21, y: 39 };
  const axisLen = 12;
  const axisLine = (dir: [number, number]): { x2: number; y2: number } => ({
    x2: triadOrigin.x + dir[0] * axisLen,
    y2: triadOrigin.y + dir[1] * axisLen,
  });
  const xLine = axisLine(axes.x);
  const yLine = axisLine(axes.y);
  const zLine = axisLine(axes.z);

  return (
    <div
      className="part-studio-viewcube"
      data-testid="part-studio-viewcube"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        className="part-studio-viewcube__stage"
        title={t('partStudio.viewCube.title')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="part-studio-viewcube__ring" aria-hidden="true" />
        <span className="part-studio-viewcube__arrow part-studio-viewcube__arrow--n" aria-hidden="true" />
        <span className="part-studio-viewcube__arrow part-studio-viewcube__arrow--e" aria-hidden="true" />
        <span className="part-studio-viewcube__arrow part-studio-viewcube__arrow--s" aria-hidden="true" />
        <span className="part-studio-viewcube__arrow part-studio-viewcube__arrow--w" aria-hidden="true" />
        <div className="part-studio-viewcube__cube" style={{ transform }}>
          {FACES.map((face) => (
            <button
              key={face.id}
              type="button"
              className="part-studio-viewcube__face"
              style={{ transform: face.transform }}
              aria-label={t(`partStudio.viewCube.faces.${face.id}`)}
              data-testid={`viewcube-face-${face.id}`}
              onClick={() => setStandard(face.viewId)}
            />
          ))}
        </div>
        <div className="part-studio-viewcube__face-labels" aria-hidden="true">
          {faceLabels.map((label) => (
            <span
              key={label.id}
              className="part-studio-viewcube__face-label"
              style={{ transform: `translate(calc(-50% + ${label.x}px), calc(-50% + ${label.y}px))` }}
            >
              {t(`partStudio.viewCube.faces.${label.id}`)}
            </span>
          ))}
        </div>
        {CORNERS.map((corner) => (
          <button
            key={corner.id}
            type="button"
            className={`part-studio-viewcube__corner ${corner.className}`}
            data-testid={`viewcube-corner-${corner.id}`}
            title={t('partStudio.viewCube.iso')}
            onClick={() => applyRotation({ x: corner.dir[0], y: corner.dir[1], z: corner.dir[2] })}
          />
        ))}
        <div className="part-studio-viewcube__axes" aria-hidden="true">
          <svg viewBox="0 0 56 56">
            <line x1={triadOrigin.x} y1={triadOrigin.y} x2={xLine.x2} y2={xLine.y2} stroke="#c94a4a" strokeWidth="1.3" strokeLinecap="round" />
            <line x1={triadOrigin.x} y1={triadOrigin.y} x2={yLine.x2} y2={yLine.y2} stroke="#3f8f4f" strokeWidth="1.3" strokeLinecap="round" />
            <line x1={triadOrigin.x} y1={triadOrigin.y} x2={zLine.x2} y2={zLine.y2} stroke="#3a6fb0" strokeWidth="1.3" strokeLinecap="round" />
            <text x={xLine.x2 + 2} y={xLine.y2 + 2} fill="#c94a4a" fontSize="8" fontWeight="700">X</text>
            <text x={yLine.x2 + 2} y={yLine.y2 + 2} fill="#3f8f4f" fontSize="8" fontWeight="700">Y</text>
            <text x={zLine.x2 + 2} y={zLine.y2 + 2} fill="#3a6fb0" fontSize="8" fontWeight="700">Z</text>
          </svg>
        </div>
      </div>

      {displaySettings && (
        <button
          type="button"
          className="part-studio-viewcube__menu-trigger"
          data-testid="viewcube-menu-trigger"
          aria-label={t('partStudio.viewCube.settings')}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="part-studio-viewcube__mini-cube" aria-hidden="true" />
          <SvgChevronDown />
        </button>
      )}

      {menuOpen && displaySettings && settings && update && (
        <div
          className="part-studio-viewcube__menu"
          data-testid="viewcube-menu"
          role="menu"
          aria-label={t('partStudio.viewCube.settings')}
        >
          <section className="part-studio-viewcube__section">
            <div className="part-studio-viewcube__section-title">{t('partStudio.viewCube.orientation')}</div>
            <div className="part-studio-viewcube__button-grid">
              {(['top', 'bottom', 'front', 'back', 'left', 'right'] as const).map((face) => (
                <button key={face} type="button" onClick={() => {
                  setStandard(FACES.find((f) => f.id === face)!.viewId);
                  setMenuOpen(false);
                }}>
                  {t(`partStudio.viewCube.faces.${face}`)}
                </button>
              ))}
            </div>
            <div className="part-studio-viewcube__button-row">
              <button type="button" onClick={() => { applyRotation(ISO_DIRECTION); setMenuOpen(false); }}>
                {t('partStudio.viewCube.iso')}
              </button>
              <button type="button" onClick={() => { applyRotation(DIMETRIC_DIRECTION); setMenuOpen(false); }}>
                {t('partStudio.viewCube.dimetric')}
              </button>
              <button type="button" onClick={() => { applyRotation(TRIMETRIC_DIRECTION); setMenuOpen(false); }}>
                {t('partStudio.viewCube.trimetric')}
              </button>
            </div>
          </section>

          <section className="part-studio-viewcube__section part-studio-viewcube__button-row">
            <button type="button" onClick={() => { fitAll(); setMenuOpen(false); }}>{t('partStudio.viewCube.fit')}</button>
            <button type="button" onClick={() => { void IModelApp.tools.run('View.WindowArea'); setMenuOpen(false); }}>
              {t('partStudio.viewCube.window')}
            </button>
            <button type="button" onClick={() => { applyRotation(ISO_DIRECTION); setMenuOpen(false); }}>
              {t('partStudio.viewCube.reset')}
            </button>
          </section>

          <section className="part-studio-viewcube__section">
            <label className="part-studio-viewcube__field">
              <span>{t('partStudio.displaySettingsPanel.modeLabel')}</span>
              <select
                data-testid="viewcube-mode"
                value={settings.mode}
                onChange={(e) => update({ mode: e.target.value as DisplayModeId })}
              >
                {MODE_IDS.map((id) => <option key={id} value={id}>{t(MODE_LABEL_KEYS[id])}</option>)}
              </select>
            </label>

            <label className="part-studio-viewcube__check">
              <input
                type="checkbox"
                data-testid="viewcube-perspective"
                checked={settings.perspective}
                onChange={(e) => update({ perspective: e.target.checked })}
              />
              {t('partStudio.displaySettingsPanel.perspective')}
            </label>
            <label className="part-studio-viewcube__field">
              <span>{t('partStudio.displaySettingsPanel.fov')}（{settings.fovDegrees}°）</span>
              <input
                type="range" min={20} max={120} step={1}
                value={settings.fovDegrees}
                disabled={!settings.perspective}
                onChange={(e) => update({ fovDegrees: Number(e.target.value) })}
              />
            </label>

            <label className="part-studio-viewcube__check">
              <input
                type="checkbox"
                data-testid="viewcube-shadows"
                checked={settings.shadows}
                onChange={(e) => update({ shadows: e.target.checked })}
              />
              {t('partStudio.displaySettingsPanel.shadows')}
            </label>
            <label className="part-studio-viewcube__check">
              <input
                type="checkbox"
                data-testid="viewcube-ao"
                checked={settings.ambientOcclusion}
                onChange={(e) => update({ ambientOcclusion: e.target.checked })}
              />
              {t('partStudio.displaySettingsPanel.ao')}
            </label>
            <label className="part-studio-viewcube__field">
              <span>{t('partStudio.displaySettingsPanel.aoIntensity')}（{settings.aoIntensityPct}%）</span>
              <input
                type="range" min={0} max={100} step={2.5}
                value={settings.aoIntensityPct}
                disabled={!settings.ambientOcclusion}
                onChange={(e) => update({ aoIntensityPct: Number(e.target.value) })}
              />
            </label>

            <label className="part-studio-viewcube__field">
              <span>{t('partStudio.displaySettingsPanel.antialias')}</span>
              <select
                data-testid="viewcube-antialias"
                value={settings.antialiasSamples}
                onChange={(e) => update({ antialiasSamples: Number(e.target.value) as 1 | 2 | 4 | 8 })}
              >
                {[1, 2, 4, 8].map((n) => <option key={n} value={n}>{n}×</option>)}
              </select>
            </label>

            <label className="part-studio-viewcube__field">
              <span>{t('partStudio.displaySettingsPanel.background')}</span>
              <select
                data-testid="viewcube-background"
                value={settings.background}
                onChange={(e) => update({ background: e.target.value as 'theme' | 'light' | 'dark' })}
              >
                <option value="theme">{t('partStudio.displaySettingsPanel.backgroundTheme')}</option>
                <option value="light">{t('partStudio.displaySettingsPanel.backgroundLight')}</option>
                <option value="dark">{t('partStudio.displaySettingsPanel.backgroundDark')}</option>
              </select>
            </label>

            <label className="part-studio-viewcube__field">
              <span>{t('partStudio.displaySettingsPanel.edgeWidth')}（{settings.edgeWidthPx}px）</span>
              <input
                type="range" min={1} max={3} step={1}
                value={settings.edgeWidthPx}
                onChange={(e) => update({ edgeWidthPx: Number(e.target.value) })}
              />
            </label>
            <label className="part-studio-viewcube__field part-studio-viewcube__field--row">
              <input
                type="color"
                data-testid="viewcube-edge-color"
                value={settings.edgeColor}
                onChange={(e) => update({ edgeColor: e.target.value })}
              />
              <span>{t('partStudio.displaySettingsPanel.edgeColor')}</span>
            </label>
          </section>

          <button
            type="button"
            className="part-studio-viewcube__more"
            data-testid="viewcube-more"
            onClick={() => {
              setDockTab('display');
              openDock();
              setMenuOpen(false);
            }}
          >
            {t('partStudio.viewCube.more')}
          </button>
        </div>
      )}
    </div>
  );
}
