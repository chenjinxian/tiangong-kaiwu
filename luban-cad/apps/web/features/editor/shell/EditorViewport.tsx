/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StandardViewId } from '@itwin/core-frontend';
import { IconButton } from '@itwin/itwinui-react';
import { SvgFitToView, SvgMove, SvgRedo, SvgRotateRight, SvgUndo, SvgZoomIn } from '@itwin/itwinui-icons-react';
import { ViewCube } from '@luban-cad/viewer-core';
import './EditorViewport.css';

export interface EditorViewportProps {
  /** 视口挂载点 ref（useViewport 的 viewportRef，生命周期仍归 Editor 壳持有） */
  viewportRef: React.RefObject<HTMLDivElement>;
  /** 视口右键菜单：适应视图 */
  onFitView: () => void;
  /** 视口右键菜单：标准视图 */
  onStandardView: (view: StandardViewId) => void;
  /** 视口右键菜单：显示设置（右侧停靠） */
  onOpenDisplaySettings: () => void;
  /** Onshape 式视口浮动视图工具条 */
  onRotateView: () => void;
  onPanView: () => void;
  onZoomView: () => void;
  onViewUndo: () => void;
  onViewRedo: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
}

/**
 * 3D 视口容器（RW4-P4-T4-1 从 Editor.tsx 710-765 切出）：viewer 挂载点 + ViewCube。
 *
 * RW4-P4-T4-2：原 viewer-overlay 浮层栈（左/右/左下绝对定位面板）退役，
 * 展示面板统一迁入右侧 EditorDockPanel；视口内仅保留 ViewCube。
 * UI 1:1 波次（2026-10-21）：补 Onshape 签名式视口右键菜单（适应/标准视图/显示设置）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorViewport: React.FC<EditorViewportProps> = ({
  viewportRef,
  onFitView,
  onStandardView,
  onOpenDisplaySettings,
  onRotateView,
  onPanView,
  onZoomView,
  onViewUndo,
  onViewRedo,
}) => {
  const { t, i18n } = useTranslation('editor');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu, closeMenu]);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, []);

  const runAndClose = useCallback((action: () => void) => {
    action();
    setContextMenu(null);
  }, []);

  return (
    <div className="viewer-wrap" onContextMenu={handleContextMenu}>
      <div ref={viewportRef} style={{ width: '100%', height: '100%' }} />

      <div className="viewer-overlay">
        {/* Top Left: Onshape 式视图工具条（视图导航与建模工具条分离） */}
        <div className="overlay-top-left viewport-view-toolbar" role="toolbar" aria-label={t('toolbar.viewTools')}>
          <IconButton styleType="borderless" size="small" label={t('toolbar.rotate')} onClick={onRotateView}>
            <SvgRotateRight />
          </IconButton>
          <IconButton styleType="borderless" size="small" label={t('toolbar.pan')} onClick={onPanView}>
            <SvgMove />
          </IconButton>
          <IconButton styleType="borderless" size="small" label={t('toolbar.zoom')} onClick={onZoomView}>
            <SvgZoomIn />
          </IconButton>
          <IconButton styleType="borderless" size="small" label={t('toolbar.fit')} onClick={onFitView}>
            <SvgFitToView />
          </IconButton>
          <IconButton styleType="borderless" size="small" label={t('toolbar.viewUndo')} onClick={onViewUndo}>
            <SvgUndo />
          </IconButton>
          <IconButton styleType="borderless" size="small" label={t('toolbar.viewRedo')} onClick={onViewRedo}>
            <SvgRedo />
          </IconButton>
        </div>

        {/* Top Right: ViewCube（viewer-core 无 i18next 依赖，语言经 prop 注入） */}
        <div className="overlay-top-right">
          <ViewCube language={i18n.language.startsWith('en') ? 'en' : 'zh-CN'} />
        </div>
      </div>

      {contextMenu && (
        <div
          className="viewport-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => runAndClose(onFitView)}>
            {t('viewportMenu.fit')}
          </button>
          <div className="viewport-context-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(() => onStandardView(StandardViewId.Top))}
          >
            {t('viewportMenu.top')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(() => onStandardView(StandardViewId.Front))}
          >
            {t('viewportMenu.front')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(() => onStandardView(StandardViewId.Right))}
          >
            {t('viewportMenu.right')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(() => onStandardView(StandardViewId.Iso))}
          >
            {t('viewportMenu.iso')}
          </button>
          <div className="viewport-context-separator" role="separator" />
          <button type="button" role="menuitem" onClick={() => runAndClose(onOpenDisplaySettings)}>
            {t('viewportMenu.displaySettings')}
          </button>
        </div>
      )}
    </div>
  );
};

EditorViewport.displayName = 'EditorViewport';

export default EditorViewport;
