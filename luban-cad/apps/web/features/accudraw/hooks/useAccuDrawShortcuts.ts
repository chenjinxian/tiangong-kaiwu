/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * AccuDraw Shortcuts Hook
 * Provides keyboard shortcuts for precise drawing
 */

import { useCallback, useEffect, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';

export interface AccuDrawShortcut {
  key: string;
  toolId: string;
  description: string;
  category: 'origin' | 'axis' | 'rotation' | 'mode';
}

export const accuDrawShortcuts: AccuDrawShortcut[] = [
  // Origin
  { key: 'O', toolId: 'AccuDraw.SetOrigin', description: '设置原点', category: 'origin' },

  // Axis locking
  { key: 'X', toolId: 'AccuDraw.LockX', description: '锁定 X 轴', category: 'axis' },
  { key: 'Y', toolId: 'AccuDraw.LockY', description: '锁定 Y 轴', category: 'axis' },
  { key: 'Z', toolId: 'AccuDraw.LockZ', description: '锁定 Z 轴', category: 'axis' },
  { key: 'D', toolId: 'AccuDraw.LockDistance', description: '锁定距离', category: 'axis' },
  { key: 'A', toolId: 'AccuDraw.LockAngle', description: '锁定角度', category: 'axis' },

  // Rotation
  { key: 'Q', toolId: 'AccuDraw.RotateCycle', description: '循环旋转', category: 'rotation' },
  { key: 'T', toolId: 'AccuDraw.RotateTop', description: '顶视图', category: 'rotation' },
  { key: 'F', toolId: 'AccuDraw.RotateFront', description: '前视图', category: 'rotation' },
  { key: 'S', toolId: 'AccuDraw.RotateSide', description: '侧视图', category: 'rotation' },
  { key: 'V', toolId: 'AccuDraw.RotateView', description: '视图方向', category: 'rotation' },

  // Mode
  { key: 'M', toolId: 'AccuDraw.ChangeMode', description: '极坐标/直角', category: 'mode' },
  { key: ' ', toolId: 'AccuDraw.LockSmart', description: '智能锁定', category: 'mode' },
];

export function useAccuDrawShortcuts() {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if user is typing in an input
    if (event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const key = event.key.toUpperCase();
    const shortcut = accuDrawShortcuts.find(s => s.key === key || (s.key === ' ' && event.key === ' '));

    if (shortcut) {
      event.preventDefault();
      IModelApp.tools.run(shortcut.toolId);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function useAccuDrawStatus() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      const accuDraw = IModelApp.accuDraw;
      if (accuDraw) {
        setIsEnabled(accuDraw.isEnabled);
        setIsSuspended(false); // AccuDraw.isSuspended may not exist
      }
    };

    const interval = setInterval(checkStatus, 100);
    return () => clearInterval(interval);
  }, []);

  return { isEnabled, isSuspended };
}
