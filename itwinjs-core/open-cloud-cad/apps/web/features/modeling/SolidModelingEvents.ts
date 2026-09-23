/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

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
  private listeners = new Map<keyof SolidModelingEventMap, Set<Function>>();

  on<K extends keyof SolidModelingEventMap>(event: K, fn: SolidModelingEventMap[K]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  off<K extends keyof SolidModelingEventMap>(event: K, fn: SolidModelingEventMap[K]): void {
    this.listeners.get(event)?.delete(fn);
  }

  emit<K extends keyof SolidModelingEventMap>(event: K, ...args: Parameters<SolidModelingEventMap[K]>): void {
    this.listeners.get(event)?.forEach((fn) => {
      (fn as (...a: Parameters<SolidModelingEventMap[K]>) => void)(...args);
    });
  }
}

export const solidModelingEvents = new SolidModelingEvents();
