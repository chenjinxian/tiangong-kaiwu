/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 风格 ViewCube（2026-11-02 重做；live Onshape 采集基线 150×150）。
 * - 150×150 stage；~84px 白面圆角 cube；罗盘弧线 + 四向箭头；无圆环/角点；
 *   八个不可见角点命中区（hover 才出现淡点），面点击=标准视图，拖拽=旋转。
 * - 底部右侧无边框 mini-cube 触发器（18px 立方 + 4px 箭头），打开与 Onshape
 *   一致的紧凑相机/渲染菜单（等轴测/正二等轴测/正三轴测、图形首选项、
 *   缩放、透视、带边着色子菜单、消除隐藏边子菜单、高质量视图）。
 * - 菜单未实现项（命名视图/上一视图/法向草图开关/相切边/边界边/剖视）
 *   按用户裁决隐藏；完整渲染参数仍在右停靠 DisplaySettingsPanel。
 * - 纯 core-frontend + iTwinUI 图标，不引入 AppUI。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  IModelApp,
  StandardViewId,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Angle, Matrix3d, Vector3d } from '@itwin/core-geometry';
import { fitViewToModelRanges } from '@luban-cad/viewer';
import {
  SvgCheckmark,
  SvgChevronRight,
  SvgSettings,
} from '@itwin/itwinui-icons-react';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import type { DisplayModeId } from '../internal/display-actions.js';
import {
  axisScreenDirections,
  cssMatrix3dFromRotation,
  DIMETRIC_DIRECTION,
  ISO_DIRECTION,
  orbitDirection,
  projectCubeCorners,
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
type SubmenuId = 'shaded' | 'hidden' | null;

/** Onshape cube 面标签固定英文大写（中文界面亦如此，live 采集）。 */
const FACE_LABEL_TEXT: Record<FaceId, string> = {
  front: 'FRONT',
  back: 'BACK',
  right: 'RIGHT',
  left: 'LEFT',
  top: 'TOP',
  bottom: 'BOTTOM',
};

/**
 * CSS 局部坐标 y 向下；cube 局部 +Z（正对屏）对应世界 +Z（Top），局部 -Y
 * 对应世界 +Y（Back）。标准 Front 视图看向 -Y 侧，故 Front 面位于视觉下方。
 */
const FACES: readonly { id: FaceId; transform: string; viewId: StandardViewId }[] = [
  { id: 'top', transform: 'translateZ(42px)', viewId: StandardViewId.Top },
  { id: 'bottom', transform: 'rotateY(180deg) translateZ(42px)', viewId: StandardViewId.Bottom },
  { id: 'right', transform: 'rotateY(90deg) translateZ(42px)', viewId: StandardViewId.Right },
  { id: 'left', transform: 'rotateY(-90deg) translateZ(42px)', viewId: StandardViewId.Left },
  { id: 'back', transform: 'rotateX(90deg) translateZ(42px)', viewId: StandardViewId.Back },
  { id: 'front', transform: 'rotateX(-90deg) translateZ(42px)', viewId: StandardViewId.Front },
];

const MODE_IDS = ['shaded', 'shaded-no-edges', 'hidden-removed', 'translucent'] as const;
const MODE_LABEL_KEYS: Record<typeof MODE_IDS[number], string> = {
  shaded: 'partStudio.viewCube.submenu.shadedWithEdges',
  'shaded-no-edges': 'partStudio.viewCube.submenu.shadedWithoutEdges',
  'hidden-removed': 'partStudio.viewCube.submenu.unshaded',
  translucent: 'partStudio.viewCube.submenu.translucent',
};

interface ViewCubeMenuItemProps {
  testId: string;
  label: string;
  onClick: () => void;
  checkable?: boolean;
  checked?: boolean;
  radio?: boolean;
  icon?: React.ReactNode;
  submenu?: boolean;
  submenuOpen?: boolean;
  onMouseEnter?: () => void;
}

function ViewCubeMenuItem({
  testId,
  label,
  onClick,
  checkable = false,
  checked = false,
  radio = false,
  icon,
  submenu = false,
  submenuOpen = false,
  onMouseEnter,
}: ViewCubeMenuItemProps): React.JSX.Element {
  const role = checkable ? (radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem';
  const className = [
    'part-studio-viewcube__item',
    checkable ? 'part-studio-viewcube__item--checkable' : '',
    icon ? 'part-studio-viewcube__item--icon' : '',
    submenu ? 'part-studio-viewcube__item--submenu' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role={role}
      aria-checked={checkable ? checked : undefined}
      aria-haspopup={submenu ? 'menu' : undefined}
      aria-expanded={submenu ? submenuOpen : undefined}
      className={className}
      data-testid={testId}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {checkable && (
        <span className="part-studio-viewcube__check" aria-hidden="true">
          {checked ? <SvgCheckmark /> : null}
        </span>
      )}
      {icon && <span className="part-studio-viewcube__item-icon" aria-hidden="true">{icon}</span>}
      <span className="part-studio-viewcube__item-label">{label}</span>
      {submenu && <SvgChevronRight className="part-studio-viewcube__item-arrow" aria-hidden="true" />}
    </button>
  );
}

export function ViewCube({ viewport, displaySettings }: ViewCubeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [rotation, setRotation] = React.useState(() => Matrix3d.createIdentity());
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [submenu, setSubmenu] = React.useState<SubmenuId>(null);
  const dragRef = React.useRef<{
    x: number;
    y: number;
    dir: [number, number, number];
    right: [number, number, number];
  } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
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

  const closeMenu = React.useCallback((restoreFocus = false): void => {
    setMenuOpen(false);
    setSubmenu(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // 菜单外点/Escape 关闭（Onshape 菜单行为；Escape 焦点回触发器）。
  React.useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const applyRotation = React.useCallback((dir: { x: number; y: number; z: number }) => {
    if (!viewport) return;
    const nextRotation = viewRotationFromDirection(Vector3d.create(dir.x, dir.y, dir.z));
    if (!nextRotation) return;
    viewport.view.setRotation(nextRotation);
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
    // 与页签条「适应视图」/特征后自动取景同源：按模型联合范围 + 留白取景。
    // 不用 view.computeFitRange——该范围来源于保存视图/项目范围，实测会裁切。
    const models = viewport.view.isSpatialView()
      ? [...viewport.view.modelSelector.models]
      : [];
    void fitViewToModelRanges(viewport, models.length > 0 ? models : undefined);
  }, [viewport]);

  /** 罗盘箭头：yaw 绕世界 Z / pitch 绕屏幕右轴，15° 步进（Onshape 左键步进）。 */
  const rotateBy = React.useCallback((yawDeg: number, pitchDeg: number) => {
    if (!viewport) return;
    const rotationNow = viewport.view.getRotation();
    const direction = rotationNow.rowZ();
    const right = rotationNow.rowX();
    const next = orbitDirection(
      direction,
      right,
      Angle.createDegrees(yawDeg).radians,
      Angle.createDegrees(pitchDeg).radians,
    );
    if (!next) return;
    applyRotation({ x: next.x, y: next.y, z: next.z });
  }, [viewport, applyRotation]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!viewport) return;
    // 面/角/箭头按钮上的按下是点击，不是拖动（按钮事件冒泡到 stage）。
    if ((event.target as HTMLElement).closest('button')) return;
    const rotationNow = viewport.view.getRotation();
    const z = rotationNow.rowZ();
    const x = rotationNow.rowX();
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
  const corners = React.useMemo(() => projectCubeCorners(rotation), [rotation]);
  const axes = React.useMemo(() => axisScreenDirections(rotation), [rotation]);
  const triadOrigin = { x: 42, y: 128 };
  const axisLen = 52;
  const axisLine = (dir: [number, number]): { x2: number; y2: number } => ({
    x2: triadOrigin.x + dir[0] * axisLen,
    y2: triadOrigin.y + dir[1] * axisLen,
  });
  const xLine = axisLine(axes.x);
  const yLine = axisLine(axes.y);
  const zLine = axisLine(axes.z);

  const mode = settings?.mode;
  const highQuality = (settings?.antialiasSamples ?? 1) > 1;
  const shadedFamily = mode === 'shaded' || mode === 'shaded-no-edges'
    || mode === 'shaded-hidden-edges' || mode === 'translucent';
  const hiddenFamily = mode === 'hidden-removed' || mode === 'hidden-visible';
  const chooseMode = (next: DisplayModeId): void => { update?.({ mode: next }); };
  const openDisplayPreferences = (): void => {
    setDockTab('display');
    openDock();
    closeMenu();
  };

  return (
    <div
      ref={rootRef}
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
        {/* 罗盘（纯装饰）：顶部两段弧形双箭头 + 四向三角，Onshape #e2e9ef。 */}
        <svg className="part-studio-viewcube__compass" viewBox="0 0 150 150" aria-hidden="true">
          <path d="M 13 34 Q 20 17 46 10" fill="none" stroke="#e3e9ee" strokeWidth="7" strokeLinecap="round" />
          <path d="M 137 34 Q 130 17 104 10" fill="none" stroke="#e3e9ee" strokeWidth="7" strokeLinecap="round" />
          <path d="M 12 33 l 9 -9 l 5 3 l -5 1 l -1 5 z" fill="#e3e9ee" />
          <path d="M 47 9 l -2 11 l 4 1 l 0 -5 l 4 -1 z" fill="#e3e9ee" />
          <path d="M 138 33 l -9 -9 l -5 3 l 5 1 l 1 5 z" fill="#e3e9ee" />
          <path d="M 103 9 l 2 11 l -4 1 l 0 -5 l -4 -1 z" fill="#e3e9ee" />
          <polygon points="75,1 67,12 83,12" fill="#e3e9ee" />
          <polygon points="149,75 138,67 138,83" fill="#e3e9ee" />
          <polygon points="75,149 67,138 83,138" fill="#e3e9ee" />
          <polygon points="1,75 12,67 12,83" fill="#e3e9ee" />
        </svg>

        {/* Home（Onshape live：cube 左侧弯曲回退箭头，回到等轴测）。 */}
        <button
          type="button"
          className="part-studio-viewcube__home"
          aria-label={t('partStudio.viewCube.homeView')}
          title={t('partStudio.viewCube.homeView')}
          data-testid="viewcube-home"
          onClick={() => applyRotation(ISO_DIRECTION)}
        >
          <OnshapeIcon name="undo-button" size={20} />
        </button>

        {/* 四向旋转热区（视觉由罗盘箭头承担；左键 15° 步进）。 */}
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--n" aria-label={t('partStudio.viewCube.rotateUp')} onClick={() => rotateBy(0, -15)} />
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--s" aria-label={t('partStudio.viewCube.rotateDown')} onClick={() => rotateBy(0, 15)} />
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--w" aria-label={t('partStudio.viewCube.rotateLeft')} onClick={() => rotateBy(-15, 0)} />
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--e" aria-label={t('partStudio.viewCube.rotateRight')} onClick={() => rotateBy(15, 0)} />

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
              {FACE_LABEL_TEXT[label.id]}
            </span>
          ))}
        </div>

        {/* 不可见角点命中区：点击 = 该角的 trimetric 方向；hover 才出现淡点。 */}
        {corners.map((corner) => (
          <button
            key={corner.id}
            type="button"
            className="part-studio-viewcube__corner-hit"
            style={{
              left: `calc(50% + ${corner.x}px)`,
              top: `calc(50% + ${corner.y}px)`,
            }}
            aria-label={t('partStudio.viewCube.cornerView')}
            data-testid={`viewcube-corner-${corner.id}`}
            onClick={() => applyRotation({
              x: corner.direction[0], y: corner.direction[1], z: corner.direction[2],
            })}
          />
        ))}

        <div className="part-studio-viewcube__axes" aria-hidden="true">
          <svg viewBox="0 0 150 150">
            <line x1={triadOrigin.x} y1={triadOrigin.y} x2={xLine.x2} y2={xLine.y2} stroke="#d94b4b" strokeWidth="1.6" strokeLinecap="round" />
            <line x1={triadOrigin.x} y1={triadOrigin.y} x2={yLine.x2} y2={yLine.y2} stroke="#3e9e50" strokeWidth="1.6" strokeLinecap="round" />
            <line x1={triadOrigin.x} y1={triadOrigin.y} x2={zLine.x2} y2={zLine.y2} stroke="#4a4ae0" strokeWidth="1.6" strokeLinecap="round" />
            <text x={xLine.x2 + 3} y={xLine.y2 + 3} fill="#d94b4b" fontSize="10" fontWeight="600">X</text>
            <text x={yLine.x2 + 3} y={yLine.y2 + 3} fill="#3e9e50" fontSize="10" fontWeight="600">Y</text>
            <text x={zLine.x2 + 3} y={zLine.y2 + 3} fill="#4a4ae0" fontSize="10" fontWeight="600">Z</text>
          </svg>
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="part-studio-viewcube__trigger"
          data-testid="viewcube-menu-trigger"
          aria-label={t('partStudio.viewCube.cameraOptions')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((v) => !v);
            setSubmenu(null);
          }}
        >
          <OnshapeIcon name="view-cube-button" size={20} className="part-studio-viewcube__mini-cube" />
          <OnshapeIcon name="expanded" size={8} className="part-studio-viewcube__trigger-chevron" />
        </button>
      </div>

      {menuOpen && (
        <div
          className="part-studio-viewcube__menu"
          data-testid="viewcube-menu"
          role="menu"
          aria-label={t('partStudio.viewCube.cameraOptions')}
        >
          <ViewCubeMenuItem
            testId="viewcube-menu-iso"
            label={t('partStudio.viewCube.iso')}
            onClick={() => { applyRotation(ISO_DIRECTION); closeMenu(true); }}
          />
          <ViewCubeMenuItem
            testId="viewcube-menu-dimetric"
            label={t('partStudio.viewCube.dimetric')}
            onClick={() => { applyRotation(DIMETRIC_DIRECTION); closeMenu(true); }}
          />
          <ViewCubeMenuItem
            testId="viewcube-menu-trimetric"
            label={t('partStudio.viewCube.trimetric')}
            onClick={() => { applyRotation(TRIMETRIC_DIRECTION); closeMenu(true); }}
          />
          <div className="part-studio-viewcube__separator" role="separator" />

          <ViewCubeMenuItem
            testId="viewcube-menu-graphics"
            label={t('partStudio.viewCube.graphicsPreferences')}
            icon={<SvgSettings />}
            onClick={openDisplayPreferences}
          />
          <div className="part-studio-viewcube__separator" role="separator" />

          <ViewCubeMenuItem
            testId="viewcube-menu-zoom-fit"
            label={t('partStudio.viewCube.zoomFit')}
            onClick={() => { fitAll(); closeMenu(true); }}
          />
          <ViewCubeMenuItem
            testId="viewcube-menu-zoom-window"
            label={t('partStudio.viewCube.zoomWindow')}
            onClick={() => { void IModelApp.tools.run('View.WindowArea'); closeMenu(true); }}
          />
          {settings && update && (
            <ViewCubeMenuItem
              testId="viewcube-menu-perspective"
              label={t('partStudio.viewCube.perspective')}
              checkable
              checked={settings.perspective}
              onClick={() => update({ perspective: !settings.perspective })}
            />
          )}
          <div className="part-studio-viewcube__separator" role="separator" />

          {settings && update && (
            <React.Fragment>
              <div
                className="part-studio-viewcube__submenu-wrap"
                onMouseEnter={() => setSubmenu('shaded')}
                onMouseLeave={() => setSubmenu(null)}
              >
                <ViewCubeMenuItem
                  testId="viewcube-menu-shaded"
                  label={t('partStudio.viewCube.shadedWithEdges')}
                  checkable
                  checked={shadedFamily}
                  submenu
                  submenuOpen={submenu === 'shaded'}
                  onMouseEnter={() => setSubmenu('shaded')}
                  onClick={() => setSubmenu('shaded')}
                />
                {submenu === 'shaded' && (
                  <div className="part-studio-viewcube__submenu" role="menu" data-testid="viewcube-submenu-shaded">
                    {MODE_IDS.map((id) => (
                      <ViewCubeMenuItem
                        key={id}
                        testId={`viewcube-mode-${id}`}
                        label={t(MODE_LABEL_KEYS[id])}
                        radio
                        checkable
                        checked={mode === id}
                        onClick={() => chooseMode(id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div
                className="part-studio-viewcube__submenu-wrap"
                onMouseEnter={() => setSubmenu('hidden')}
                onMouseLeave={() => setSubmenu(null)}
              >
                <ViewCubeMenuItem
                  testId="viewcube-menu-hidden"
                  label={t('partStudio.viewCube.hiddenEdgesRemoved')}
                  checkable
                  checked={hiddenFamily}
                  submenu
                  submenuOpen={submenu === 'hidden'}
                  onMouseEnter={() => setSubmenu('hidden')}
                  onClick={() => setSubmenu('hidden')}
                />
                {submenu === 'hidden' && (
                  <div className="part-studio-viewcube__submenu" role="menu" data-testid="viewcube-submenu-hidden">
                    <ViewCubeMenuItem
                      testId="viewcube-mode-hidden-visible"
                      label={t('partStudio.viewCube.submenu.hiddenVisible')}
                      radio
                      checkable
                      checked={mode === 'hidden-visible'}
                      onClick={() => chooseMode('hidden-visible')}
                    />
                    <ViewCubeMenuItem
                      testId="viewcube-mode-hidden-removed"
                      label={t('partStudio.viewCube.submenu.hiddenRemoved')}
                      radio
                      checkable
                      checked={mode === 'hidden-removed'}
                      onClick={() => chooseMode('hidden-removed')}
                    />
                  </div>
                )}
              </div>
              <div className="part-studio-viewcube__separator" role="separator" />

              <ViewCubeMenuItem
                testId="viewcube-menu-high-quality"
                label={t('partStudio.viewCube.highQuality')}
                checkable
                checked={highQuality}
                onClick={() => update({ antialiasSamples: highQuality ? 1 : 4 })}
              />
            </React.Fragment>
          )}
        </div>
      )}
    </div>
  );
}
