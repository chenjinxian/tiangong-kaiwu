/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { ViewCube } from '@luban-cad/viewer-core';

export interface EditorViewportProps {
  /** 视口挂载点 ref（useViewport 的 viewportRef，生命周期仍归 Editor 壳持有） */
  viewportRef: React.RefObject<HTMLDivElement>;
  /** 视口上层浮件（T4-1 为浮动面板栈；T4-2 停靠化后由 EditorDockPanel 承接） */
  children?: React.ReactNode;
}

/**
 * 3D 视口容器（RW4-P4-T4-1 从 Editor.tsx 710-765 切出）：viewer 挂载点 + ViewCube。
 * ViewCube 浮于视口右上；`.viewer-wrap` / `.viewer-overlay` 选择器契约不变。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorViewport: React.FC<EditorViewportProps> = ({ viewportRef, children }) => {
  return (
    <div className="viewer-wrap">
      <div ref={viewportRef} style={{ width: '100%', height: '100%' }} />

      <div className="viewer-overlay">
        {/* Top Right: ViewCube */}
        <div className="overlay-top-right">
          <ViewCube />
        </div>
        {children}
      </div>
    </div>
  );
};

EditorViewport.displayName = 'EditorViewport';

export default EditorViewport;
