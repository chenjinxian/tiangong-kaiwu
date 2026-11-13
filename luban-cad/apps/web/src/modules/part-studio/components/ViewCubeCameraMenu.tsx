/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 相机/渲染菜单（Onshape ViewCube trigger 下拉）——自研 ViewCube 与官方
 * iTwin CubeNavigationAid 共用的唯一实现。
 *
 * 2026-11-05 用户裁决：官方 ViewCube 手感更好，改为默认；把原自研模式的
 * 「相机和渲染选项」菜单接到官方 cube 上。菜单项/位置/交互/测试 id 与既有
 * Onshape 对齐基线不变；「上一个视图」历史由宿主调用 {@link useViewCubeHistory}
 * 的 rememberView 统一记录。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, type ScreenViewport } from '@itwin/core-frontend';
import { Vector3d, type Matrix3d } from '@itwin/core-geometry';
import { fitViewToModelRanges } from '@luban-cad/viewer';
import {
  SvgCheckmark,
  SvgChevronRight,
  SvgCut,
  SvgSettings,
} from '@itwin/itwinui-icons-react';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import type { DisplayModeId } from '../internal/display-actions.js';
import {
  DIMETRIC_DIRECTION,
  ISO_DIRECTION,
  TRIMETRIC_DIRECTION,
  viewRotationFromDirection,
} from '../internal/view-orientation.js';
import './ViewCube.css';

type SubmenuId = 'shaded' | 'hidden' | null;

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
  onClick?: () => void;
  checkable?: boolean;
  checked?: boolean;
  radio?: boolean;
  icon?: React.ReactNode;
  submenu?: boolean;
  submenuOpen?: boolean;
  disabled?: boolean;
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
  disabled = false,
  onMouseEnter,
}: ViewCubeMenuItemProps): React.JSX.Element {
  const role = checkable ? (radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem';
  const className = [
    'part-studio-viewcube__item',
    checkable ? 'part-studio-viewcube__item--checkable' : '',
    icon ? 'part-studio-viewcube__item--icon' : '',
    submenu ? 'part-studio-viewcube__item--submenu' : '',
    disabled ? 'part-studio-viewcube__item--disabled' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role={role}
      aria-checked={checkable ? checked : undefined}
      aria-haspopup={submenu ? 'menu' : undefined}
      aria-expanded={submenu ? submenuOpen : undefined}
      aria-disabled={disabled ? 'true' : undefined}
      disabled={disabled}
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

export interface ViewCubeHistory {
  canGoBack: boolean;
  /** 任何改变相机朝向的动作（cube 面/角/罗盘或菜单）前调用。 */
  rememberView(): void;
  /** 单步回退；commit 由宿主提供（自研 180ms+400ms 跟踪 / 官方事件桥）。 */
  restorePrevious(commit: () => void): void;
}

/**
 * 「上一个视图」历史。自研 ViewCube 的面/罗盘点击与官方 cube 的菜单动作
 * 共用同一条历史记录；只在宿主视角实现里维护。
 */
export function useViewCubeHistory(viewport?: ScreenViewport | null): ViewCubeHistory {
  const [canGoBack, setCanGoBack] = React.useState(false);
  const previousRotationRef = React.useRef<Matrix3d | null>(null);

  React.useEffect(() => {
    previousRotationRef.current = null;
    setCanGoBack(false);
  }, [viewport]);

  const rememberView = React.useCallback((): void => {
    if (!viewport || typeof viewport.view.getRotation !== 'function') return;
    previousRotationRef.current = viewport.view.getRotation().clone();
    setCanGoBack(true);
  }, [viewport]);

  const restorePrevious = React.useCallback((commit: () => void): void => {
    if (!viewport || typeof viewport.view.getRotation !== 'function') return;
    const previous = previousRotationRef.current;
    if (!previous) return;
    previousRotationRef.current = viewport.view.getRotation().clone();
    // 绕 target 旋转：裸 setRotation 会绕 eye 改朝向，正交视图的 target 会
    // 被甩到模型外（2026-11-05 实测菜单 ISO 后模型消失）。单测 mock 可能
    // 只实现 setRotation，保留回退。
    const view = viewport.view;
    if (typeof view.setRotationAboutPoint === 'function') view.setRotationAboutPoint(previous.clone());
    else view.setRotation(previous.clone());
    if (view.is3d()) view.turnCameraOff();
    commit();
  }, [viewport]);

  return React.useMemo(
    () => ({ canGoBack, rememberView, restorePrevious }),
    [canGoBack, rememberView, restorePrevious],
  );
}

export interface ViewCubeCameraMenuProps {
  viewport?: ScreenViewport | null;
  displaySettings?: UseDisplaySettingsResult;
  onOpenGraphicsPreferences?: () => void;
  history: ViewCubeHistory;
  /** 宿主相机提交方式；缺省 180ms animateFrustumChange。 */
  commitView?: () => void;
  /**
   * 2026-11-13：Onshape 语义「缩放到合适大小」宿主出口——可见内容（模型 ∪
   * 活动草图）+ 基准面空场景兜底。缺省回退模型范围取景（壳期/测试）。
   */
  onFitVisibleContent?: () => void;
  className?: string;
}

export function ViewCubeCameraMenu({
  viewport,
  displaySettings,
  onOpenGraphicsPreferences,
  history,
  commitView,
  onFitVisibleContent,
  className,
}: ViewCubeCameraMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [submenu, setSubmenu] = React.useState<SubmenuId>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

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

  const commitCamera = React.useCallback((): void => {
    if (commitView) {
      commitView();
      return;
    }
    if (!viewport) return;
    if (typeof viewport.animateFrustumChange === 'function') {
      viewport.animateFrustumChange({ animationTime: 180 });
    } else {
      viewport.synchWithView({});
    }
  }, [commitView, viewport]);

  const applyRotation = React.useCallback((dir: { x: number; y: number; z: number }): void => {
    if (!viewport) return;
    const nextRotation = viewRotationFromDirection(Vector3d.create(dir.x, dir.y, dir.z));
    if (!nextRotation) return;
    history.rememberView();
    const view = viewport.view;
    if (typeof view.setRotationAboutPoint === 'function') view.setRotationAboutPoint(nextRotation);
    else view.setRotation(nextRotation);
    if (view.is3d()) view.turnCameraOff();
    commitCamera();
  }, [viewport, commitCamera, history]);

  const restorePrevious = React.useCallback((): void => {
    history.restorePrevious(commitCamera);
  }, [history, commitCamera]);

  const fitAll = React.useCallback((): void => {
    if (!viewport) return;
    // 2026-11-13：宿主统一「可见内容取景」（模型 ∪ 活动草图；空场景基准面）；
    // 缺省回退模型范围（壳期/测试）。
    if (onFitVisibleContent) {
      onFitVisibleContent();
      return;
    }
    const models = viewport.view.isSpatialView()
      ? [...viewport.view.modelSelector.models]
      : [];
    void fitViewToModelRanges(viewport, models.length > 0 ? models : undefined);
  }, [viewport, onFitVisibleContent]);

  const settings = displaySettings?.settings;
  const update = displaySettings?.update;
  const mode = settings?.mode;
  const highQuality = (settings?.antialiasSamples ?? 1) > 1;
  const shadedFamily = mode === 'shaded' || mode === 'shaded-no-edges'
    || mode === 'shaded-hidden-edges' || mode === 'translucent';
  const hiddenFamily = mode === 'hidden-removed' || mode === 'hidden-visible';
  const chooseMode = (next: DisplayModeId): void => { update?.({ mode: next }); };
  const openDisplayPreferences = (): void => {
    closeMenu();
    onOpenGraphicsPreferences?.();
  };

  return (
    <div
      ref={rootRef}
      className={`part-studio-viewcube__camera-menu${className ? ` ${className}` : ''}`}
    >
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
        <span className="part-studio-viewcube__trigger-tooltip" role="tooltip">
          {t('partStudio.viewCube.cameraOptions')}
        </span>
        <OnshapeIcon name="view-cube-button" size={20} className="part-studio-viewcube__mini-cube" />
        <span className="part-studio-viewcube__trigger-triangle" aria-hidden="true" />
      </button>

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
          <ViewCubeMenuItem
            testId="viewcube-menu-named-views"
            label={t('partStudio.viewCube.namedViews')}
            disabled
          />
          <ViewCubeMenuItem
            testId="viewcube-menu-previous-view"
            label={t('partStudio.viewCube.previousView')}
            disabled={!history.canGoBack}
            onClick={restorePrevious}
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
          <ViewCubeMenuItem
            testId="viewcube-menu-normal-to-sketch"
            label={t('partStudio.viewCube.normalToSketchOnEdit')}
            checkable
            checked={false}
            disabled
          />
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
              <ViewCubeMenuItem
                testId="viewcube-menu-tangent-edges"
                label={t('partStudio.viewCube.tangentEdgesVisible')}
                submenu
                submenuOpen={false}
                disabled
              />
              <ViewCubeMenuItem
                testId="viewcube-menu-high-quality"
                label={t('partStudio.viewCube.highQuality')}
                checkable
                checked={highQuality}
                onClick={() => update({ antialiasSamples: highQuality ? 1 : 4 })}
              />
              <ViewCubeMenuItem
                testId="viewcube-menu-highlight-boundary"
                label={t('partStudio.viewCube.highlightBoundaryEdges')}
                disabled
              />
            </React.Fragment>
          )}
          <div className="part-studio-viewcube__separator" role="separator" />
          <ViewCubeMenuItem
            testId="viewcube-menu-section"
            label={t('partStudio.viewCube.sectionView')}
            icon={<SvgCut />}
            disabled
          />
        </div>
      )}
    </div>
  );
}
