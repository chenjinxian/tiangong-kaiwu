/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioCanvas（M3 Task 3 壳；T5 接管右键交互）：画布区——viewport 挂载点
 * + 画布右键宿主。onContextMenu  PreventDefault 并锚定光标坐标弹
 * CanvasContextMenu（选择驱动：空白态/选中态按 store.canvas.selection 重构）；
 * Escape/外部点击收合（菜单内自治）。viewport 创建/Tiling 全链仍归 T6。
 */

import React from 'react';
import type { RefObject } from 'react';
import { CanvasContextMenu } from '../canvas/CanvasContextMenu.js';

export interface PartStudioCanvasProps {
  /** viewport 宿主 div ref（viewer-next useViewport 出口）。 */
  viewportRef: RefObject<HTMLDivElement>;
}

interface MenuAnchor {
  x: number;
  y: number;
}

export function PartStudioCanvas({ viewportRef }: PartStudioCanvasProps): React.JSX.Element {
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);

  const handleContextMenu = React.useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setAnchor({ x: event.clientX, y: event.clientY });
  }, []);

  return (
    <div className="part-studio-canvas" data-testid="part-studio-canvas" onContextMenu={handleContextMenu}>
      <div ref={viewportRef} className="part-studio-viewport" data-testid="part-studio-viewport" />
      <CanvasContextMenu anchor={anchor} onClose={() => setAnchor(null)} />
    </div>
  );
}
