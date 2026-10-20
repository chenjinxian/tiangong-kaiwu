/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { ViewCube } from '@luban-cad/viewer-core';

export interface EditorViewportProps {
  /** 视口挂载点 ref（useViewport 的 viewportRef，生命周期仍归 Editor 壳持有） */
  viewportRef: React.RefObject<HTMLDivElement>;
}

/**
 * 3D 视口容器（RW4-P4-T4-1 从 Editor.tsx 710-765 切出）：viewer 挂载点 + ViewCube。
 *
 * RW4-P4-T4-2：原 viewer-overlay 浮层栈（左/右/左下绝对定位面板）退役，
 * 展示面板统一迁入右侧 EditorDockPanel；视口内仅保留 ViewCube。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const EditorViewport: React.FC<EditorViewportProps> = ({ viewportRef }) => {
  return (
    <div className="viewer-wrap">
      <div ref={viewportRef} style={{ width: '100%', height: '100%' }} />

      <div className="viewer-overlay">
        {/* Top Right: ViewCube */}
        <div className="overlay-top-right">
          <ViewCube />
        </div>
      </div>
    </div>
  );
};

EditorViewport.displayName = 'EditorViewport';

export default EditorViewport;
