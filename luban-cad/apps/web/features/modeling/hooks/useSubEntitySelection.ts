/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useRef, useState } from 'react';
import { IModelConnection } from '@itwin/core-frontend';
import {
  runSelectSubEntityTool,
  type SubEntitySelectionMode,
} from '../SelectSubEntityTool.js';

export interface SubEntitySelection {
  faceId?: string;
  edgeId?: string;
  vertexId?: string;
}

export interface UseSubEntitySelectionOptions {
  maxFaceSelection?: number;
  maxEdgeSelection?: number;
  maxVertexSelection?: number;
}

export interface UseSubEntitySelectionResult {
  selectedFaces: string[];
  selectedEdges: string[];
  selectedVertices: string[];
  selectionCount: number;
  selectionMode: SubEntitySelectionMode;
  isSelecting: boolean;
  startSelection: (mode: SubEntitySelectionMode) => void;
  stopSelection: () => void;
  selectFace: (faceId: string, opts?: { multiSelect?: boolean }) => void;
  selectEdge: (edgeId: string, opts?: { multiSelect?: boolean }) => void;
  selectVertex: (vertexId: string, opts?: { multiSelect?: boolean }) => void;
  deselectFace: (faceId: string) => void;
  deselectEdge: (edgeId: string) => void;
  deselectVertex: (vertexId: string) => void;
  clearSelection: () => void;
}

export function useSubEntitySelection(
  _iModel: IModelConnection | undefined,
  options: UseSubEntitySelectionOptions = {}
): UseSubEntitySelectionResult {
  const { maxFaceSelection = 100, maxEdgeSelection = 100, maxVertexSelection = 100 } = options;

  const [selectedFaces, setSelectedFaces] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [selectedVertices, setSelectedVertices] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<SubEntitySelectionMode>('face');
  const [isSelecting, setIsSelecting] = useState(false);

  // Use ref to track if tool is running to avoid race conditions
  const isRunningRef = useRef(false);

  const startSelection = useCallback(async (mode: SubEntitySelectionMode) => {
    if (isRunningRef.current) {
      // Tool already running, just update mode
      setSelectionMode(mode);
      return;
    }

    setSelectionMode(mode);
    setIsSelecting(true);
    isRunningRef.current = true;

    try {
      await runSelectSubEntityTool({
        mode,
        onSubEntitySelected: (_elementId, subEntity) => {
          const id = `${subEntity.subEntity.type}_${subEntity.subEntity.id}`;
          switch (mode) {
            case 'face':
              setSelectedFaces(prev => {
                if (prev.includes(id)) return prev;
                if (prev.length >= maxFaceSelection) return prev;
                return [...prev, id];
              });
              break;
            case 'edge':
              setSelectedEdges(prev => {
                if (prev.includes(id)) return prev;
                if (prev.length >= maxEdgeSelection) return prev;
                return [...prev, id];
              });
              break;
            case 'vertex':
              setSelectedVertices(prev => {
                if (prev.includes(id)) return prev;
                if (prev.length >= maxVertexSelection) return prev;
                return [...prev, id];
              });
              break;
          }
        },
        onSubEntityDeselected: (_elementId, subEntity) => {
          const id = `${subEntity.subEntity.type}_${subEntity.subEntity.id}`;
          switch (mode) {
            case 'face':
              setSelectedFaces(prev => prev.filter(fId => fId !== id));
              break;
            case 'edge':
              setSelectedEdges(prev => prev.filter(eId => eId !== id));
              break;
            case 'vertex':
              setSelectedVertices(prev => prev.filter(vId => vId !== id));
              break;
          }
        },
        onComplete: () => {
          setIsSelecting(false);
          isRunningRef.current = false;
        },
      });
    } catch (err) {
      console.error('Sub-entity selection tool error:', err);
      setIsSelecting(false);
      isRunningRef.current = false;
    }
  }, [maxFaceSelection, maxEdgeSelection, maxVertexSelection]);

  const stopSelection = useCallback(() => {
    setIsSelecting(false);
    isRunningRef.current = false;
  }, []);

  const selectFace = useCallback((faceId: string, opts?: { multiSelect?: boolean }) => {
    setSelectedFaces(prev => {
      if (prev.includes(faceId)) return prev;
      if (!opts?.multiSelect) return [faceId];
      if (prev.length >= maxFaceSelection) return prev;
      return [...prev, faceId];
    });
  }, [maxFaceSelection]);

  const selectEdge = useCallback((edgeId: string, opts?: { multiSelect?: boolean }) => {
    setSelectedEdges(prev => {
      if (prev.includes(edgeId)) return prev;
      if (!opts?.multiSelect) return [edgeId];
      if (prev.length >= maxEdgeSelection) return prev;
      return [...prev, edgeId];
    });
  }, [maxEdgeSelection]);

  const selectVertex = useCallback((vertexId: string, opts?: { multiSelect?: boolean }) => {
    setSelectedVertices(prev => {
      if (prev.includes(vertexId)) return prev;
      if (!opts?.multiSelect) return [vertexId];
      if (prev.length >= maxVertexSelection) return prev;
      return [...prev, vertexId];
    });
  }, [maxVertexSelection]);

  const deselectFace = useCallback((faceId: string) => {
    setSelectedFaces(prev => prev.filter(id => id !== faceId));
  }, []);

  const deselectEdge = useCallback((edgeId: string) => {
    setSelectedEdges(prev => prev.filter(id => id !== edgeId));
  }, []);

  const deselectVertex = useCallback((vertexId: string) => {
    setSelectedVertices(prev => prev.filter(id => id !== vertexId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFaces([]);
    setSelectedEdges([]);
    setSelectedVertices([]);
  }, []);

  const selectionCount = selectedFaces.length + selectedEdges.length + selectedVertices.length;

  return {
    selectedFaces,
    selectedEdges,
    selectedVertices,
    selectionCount,
    selectionMode,
    isSelecting,
    startSelection,
    stopSelection,
    selectFace,
    selectEdge,
    selectVertex,
    deselectFace,
    deselectEdge,
    deselectVertex,
    clearSelection,
  };
}
