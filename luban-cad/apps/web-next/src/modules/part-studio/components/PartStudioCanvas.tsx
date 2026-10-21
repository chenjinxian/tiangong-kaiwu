/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioCanvas（M3 Task 3）：画布区——viewport 挂载点。viewer-next
 * `useViewport` 返回的宿主 ref 由本组件承接（T5/T6 在其上创建 ScreenViewport
 * 并接管 tile/拾取全链；壳期渲染空宿主 div + 占位底）。
 */

import React from 'react';
import type { RefObject } from 'react';

export interface PartStudioCanvasProps {
  /** viewport 宿主 div ref（viewer-next useViewport 出口）。 */
  viewportRef: RefObject<HTMLDivElement>;
}

export function PartStudioCanvas({ viewportRef }: PartStudioCanvasProps): React.JSX.Element {
  return (
    <div className="part-studio-canvas" data-testid="part-studio-canvas">
      <div ref={viewportRef} className="part-studio-viewport" data-testid="part-studio-viewport" />
    </div>
  );
}
