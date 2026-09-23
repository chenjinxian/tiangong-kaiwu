/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from 'react';
import { ChamferMode, type SubEntityLocationProps } from '@itwin/editor-common';
import { solidModelingEvents } from '../../modeling/SolidModelingEvents.js';
import { useSolidModeling } from '../../modeling/hooks/useSolidModeling.js';

export interface SolidModelingDialogState {
  roundDialogOpen: boolean;
  chamferDialogOpen: boolean;
  hollowDialogOpen: boolean;
  selectedEdges: SubEntityLocationProps[];
  selectedFaces: SubEntityLocationProps[];
  selectedElementId: string | null;
  isProcessing: boolean;
}

export interface SolidModelingDialogActions {
  setRoundDialogOpen: (open: boolean) => void;
  setChamferDialogOpen: (open: boolean) => void;
  setHollowDialogOpen: (open: boolean) => void;
  handleRoundConfirm: (params: { radius: number; propagateSmooth: boolean }) => Promise<void>;
  handleChamferConfirm: (params: {
    mode: ChamferMode;
    length: number;
    distanceLeft: number;
    distanceRight: number;
    angle: number;
    propagateSmooth: boolean;
  }) => Promise<void>;
  handleHollowConfirm: (params: { shellThickness: number; faceThickness: number }) => Promise<void>;
}

/**
 * Hook for solid modeling dialog state and confirm handlers.
 * Subscribes to tool completion events and manages round/chamfer/hollow dialogs.
 */
export function useSolidModelingDialogs(
  iModelId: string,
  showToast: (msg: string, type: 'success' | 'error') => void,
  setOpStatus: (status: string) => void,
): SolidModelingDialogState & SolidModelingDialogActions {
  const [roundDialogOpen, setRoundDialogOpen] = useState(false);
  const [chamferDialogOpen, setChamferDialogOpen] = useState(false);
  const [hollowDialogOpen, setHollowDialogOpen] = useState(false);
  const [selectedEdges, setSelectedEdges] = useState<SubEntityLocationProps[]>([]);
  const [selectedFaces, setSelectedFaces] = useState<SubEntityLocationProps[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const { blendEdges, chamferEdges, hollowFaces, isProcessing } = useSolidModeling({
    iModelKey: iModelId,
  });

  const handleRoundEdgesComplete = useCallback((elementId: string, edges: SubEntityLocationProps[]) => {
    setSelectedElementId(elementId);
    setSelectedEdges(edges);
    setRoundDialogOpen(true);
  }, []);

  const handleChamferEdgesComplete = useCallback((elementId: string, edges: SubEntityLocationProps[]) => {
    setSelectedElementId(elementId);
    setSelectedEdges(edges);
    setChamferDialogOpen(true);
  }, []);

  const handleHollowFacesComplete = useCallback((elementId: string, faces: SubEntityLocationProps[]) => {
    setSelectedElementId(elementId);
    setSelectedFaces(faces);
    setHollowDialogOpen(true);
  }, []);

  // Subscribe to solid modeling tool completion events
  useEffect(() => {
    const offRound = solidModelingEvents.on('roundComplete', handleRoundEdgesComplete);
    const offChamfer = solidModelingEvents.on('chamferComplete', handleChamferEdgesComplete);
    const offHollow = solidModelingEvents.on('hollowComplete', handleHollowFacesComplete);
    return () => { offRound(); offChamfer(); offHollow(); };
  }, [handleRoundEdgesComplete, handleChamferEdgesComplete, handleHollowFacesComplete]);

  const handleRoundConfirm = useCallback(async (params: { radius: number; propagateSmooth: boolean }) => {
    if (!selectedElementId || selectedEdges.length === 0) return;

    setOpStatus('应用圆角...');
    try {
      const result = await blendEdges(selectedElementId, {
        radius: params.radius,
        edges: selectedEdges,
        propagateSmooth: params.propagateSmooth,
      });

      if (result) {
        showToast(`圆角应用成功: ${selectedEdges.length} 条边`, 'success');
      } else {
        showToast('圆角应用失败', 'error');
      }
    } catch (e) {
      const msg = `圆角失败: ${e instanceof Error ? e.message : String(e)}`;
      showToast(msg, 'error');
    }
    setOpStatus('');
    setRoundDialogOpen(false);
    setSelectedEdges([]);
    setSelectedElementId(null);
  }, [selectedElementId, selectedEdges, blendEdges, showToast, setOpStatus]);

  const handleChamferConfirm = useCallback(async (params: {
    mode: ChamferMode;
    length: number;
    distanceLeft: number;
    distanceRight: number;
    angle: number;
    propagateSmooth: boolean;
  }) => {
    if (!selectedElementId || selectedEdges.length === 0) return;

    setOpStatus('应用倒角...');
    try {
      const result = await chamferEdges(selectedElementId, {
        edges: selectedEdges,
        mode: params.mode,
        length: params.length,
        distanceLeft: params.distanceLeft,
        distanceRight: params.distanceRight,
        angle: params.angle,
        propagateSmooth: params.propagateSmooth,
      });

      if (result) {
        showToast(`倒角应用成功: ${selectedEdges.length} 条边`, 'success');
      } else {
        showToast('倒角应用失败', 'error');
      }
    } catch (e) {
      const msg = `倒角失败: ${e instanceof Error ? e.message : String(e)}`;
      showToast(msg, 'error');
    }
    setOpStatus('');
    setChamferDialogOpen(false);
    setSelectedEdges([]);
    setSelectedElementId(null);
  }, [selectedElementId, selectedEdges, chamferEdges, showToast, setOpStatus]);

  const handleHollowConfirm = useCallback(async (params: { shellThickness: number; faceThickness: number }) => {
    if (!selectedElementId || selectedFaces.length === 0) return;

    setOpStatus('应用抽壳...');
    try {
      const result = await hollowFaces(selectedElementId, {
        faces: selectedFaces,
        shellThickness: params.shellThickness,
        faceThickness: params.faceThickness,
      });

      if (result) {
        showToast(`抽壳应用成功: ${selectedFaces.length} 个面`, 'success');
      } else {
        showToast('抽壳应用失败', 'error');
      }
    } catch (e) {
      const msg = `抽壳失败: ${e instanceof Error ? e.message : String(e)}`;
      showToast(msg, 'error');
    }
    setOpStatus('');
    setHollowDialogOpen(false);
    setSelectedFaces([]);
    setSelectedElementId(null);
  }, [selectedElementId, selectedFaces, hollowFaces, showToast, setOpStatus]);

  return {
    roundDialogOpen,
    chamferDialogOpen,
    hollowDialogOpen,
    selectedEdges,
    selectedFaces,
    selectedElementId,
    isProcessing,
    setRoundDialogOpen,
    setChamferDialogOpen,
    setHollowDialogOpen,
    handleRoundConfirm,
    handleChamferConfirm,
    handleHollowConfirm,
  };
}
