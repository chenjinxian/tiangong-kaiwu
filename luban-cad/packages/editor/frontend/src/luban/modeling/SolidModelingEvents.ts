/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// 同源移植自 apps/web/features/modeling/SolidModelingEvents.ts（web M4-T3；
// 类名/事件名不改——Agent 复用规约）。2026-11-04 X-01 删除 DraftFacesTool 后
// 暂无工具消费；保留为实体建模工具（需面/边选择事件）的公共事件面。

import type { SubEntityLocationProps } from '@itwin/editor-common';

export interface ChamferCompleteParams {
  elementId: string;
  edges: SubEntityLocationProps[];
}

export interface HollowCompleteParams {
  elementId: string;
  faces: SubEntityLocationProps[];
}

export interface SolidModelingEventMap {
  roundComplete: (elementId: string, edges: SubEntityLocationProps[]) => void;
  chamferComplete: (elementId: string, edges: SubEntityLocationProps[]) => void;
  hollowComplete: (elementId: string, faces: SubEntityLocationProps[]) => void;
  draftComplete: (elementId: string, faces: SubEntityLocationProps[]) => void;
  offsetComplete: (elementId: string, faces: SubEntityLocationProps[]) => void;
}

class SolidModelingEvents {
  private _listeners = new Map<keyof SolidModelingEventMap, Set<(...args: any[]) => void>>();

  public on<K extends keyof SolidModelingEventMap>(event: K, fn: SolidModelingEventMap[K]): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
    return () => { set.delete(fn); };
  }

  public off<K extends keyof SolidModelingEventMap>(event: K, fn: SolidModelingEventMap[K]): void {
    this._listeners.get(event)?.delete(fn);
  }

  public emit<K extends keyof SolidModelingEventMap>(event: K, ...args: Parameters<SolidModelingEventMap[K]>): void {
    this._listeners.get(event)?.forEach((fn) => {
      (fn as (...a: Parameters<SolidModelingEventMap[K]>) => void)(...args);
    });
  }
}

export const solidModelingEvents = new SolidModelingEvents();
