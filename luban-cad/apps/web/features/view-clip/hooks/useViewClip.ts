/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * View Clip Hook
 * Manages view clipping for section analysis
 */

import { useCallback, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';

export type ClipType = 'plane' | 'shape' | 'range' | 'element' | 'clear';

export interface ViewClipState {
  isClipped: boolean;
  clipType: ClipType | null;
}

export function useViewClip() {
  const [state, setState] = useState<ViewClipState>({
    isClipped: false,
    clipType: null,
  });

  const applyClip = useCallback(async (type: ClipType) => {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return;

    if (type === 'clear') {
      await IModelApp.tools.run('ViewClip.Clear');
      setState({ isClipped: false, clipType: null });
      return;
    }

    const toolMap: Record<Exclude<ClipType, 'clear'>, string> = {
      plane: 'ViewClip.ByPlane',
      shape: 'ViewClip.ByShape',
      range: 'ViewClip.ByRange',
      element: 'ViewClip.ByElement',
    };

    const success = await IModelApp.tools.run(toolMap[type]);

    if (success) {
      setState({
        isClipped: true,
        clipType: type,
      });
    }
  }, []);

  const toggleClip = useCallback(() => {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return;

    const viewClip = viewport.view.getViewClip();

    if (viewClip) {
      applyClip('clear');
    } else {
      applyClip('plane');
    }
  }, [applyClip]);

  return {
    ...state,
    applyClip,
    toggleClip,
  };
}
