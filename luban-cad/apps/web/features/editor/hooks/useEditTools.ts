/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type BriefcaseConnection } from '@itwin/core-frontend';
import { CompressedId64Set } from '@itwin/core-bentley';
import { Transform, Matrix3d, Vector3d, Angle, Point3d } from '@itwin/core-geometry';
import { OpenCloudRpcInterface } from '@luban-cad/shared';
import { undoManager } from '../../../src/core/undo/UndoManager.js';

export interface UseEditToolsOptions {
  connection: BriefcaseConnection | null;
}

export interface UseEditToolsResult {
  selectionCount: number;
  moveMode: boolean;
  setMoveMode: (v: boolean) => void;
  deleteSelected: () => Promise<void>;
  applyTranslation: (dx: number, dy: number, dz: number) => Promise<void>;
  applyRotation: (axis: 'x' | 'y' | 'z', angleRadians: number) => Promise<void>;
  applyScale: (sx: number, sy: number, sz: number) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export function useEditTools({ connection }: UseEditToolsOptions): UseEditToolsResult {
  const [selectionCount, setSelectionCount] = useState(0);
  const [moveMode, setMoveMode] = useState(false);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const isRunning = useRef(false);

  useEffect(() => {
    if (!connection) {
      setSelectionCount(0);
      return;
    }
    const onChanged = (): void => {
      setSelectionCount(connection.selectionSet.elements.size);
    };
    setSelectionCount(connection.selectionSet.elements.size);
    const removeListener = connection.selectionSet.onChanged.addListener(onChanged);
    return () => {
      removeListener();
    };
  }, [connection]);

  const deleteSelected = useCallback(async (): Promise<void> => {
    const conn = connectionRef.current;
    if (!conn) return;
    if (isRunning.current) return;
    const ids = Array.from(conn.selectionSet.elements);
    if (ids.length === 0) return;
    const compressedIds = CompressedId64Set.compressIds(ids);
    const rpc = OpenCloudRpcInterface.getClient();
    isRunning.current = true;
    let editSucceeded = false;
    try {
      await rpc.startEditCommand('basicManipulation', conn.key);
      await rpc.callEditMethod('deleteElements', compressedIds);
      editSucceeded = true;
    } finally {
      await rpc.finishEditCommand();
      isRunning.current = false;
    }
    if (editSucceeded) {
      await conn.saveChanges('删除元素');
      undoManager.recordOperation({ description: `删除 ${ids.length} 个元素` });
      conn.selectionSet.emptyAll();
    }
  }, []);

  const applyTranslation = useCallback(async (dx: number, dy: number, dz: number): Promise<void> => {
    const conn = connectionRef.current;
    if (!conn) return;
    if (isRunning.current) return;
    const ids = Array.from(conn.selectionSet.elements);
    if (ids.length === 0) return;
    const compressedIds = CompressedId64Set.compressIds(ids);
    const transformProps = Transform.createTranslationXYZ(dx, dy, dz).toJSON();
    const rpc = OpenCloudRpcInterface.getClient();
    isRunning.current = true;
    let editSucceeded = false;
    try {
      await rpc.startEditCommand('basicManipulation', conn.key);
      await rpc.callEditMethod('transformPlacement', compressedIds, transformProps);
      editSucceeded = true;
    } finally {
      await rpc.finishEditCommand();
      isRunning.current = false;
    }
    if (editSucceeded) {
      await conn.saveChanges('移动元素');
      undoManager.recordOperation({ description: `移动 ${ids.length} 个元素` });
      // Do NOT clear selection after translation
    }
  }, []);

  const applyRotation = useCallback(async (axis: 'x' | 'y' | 'z', angleRadians: number): Promise<void> => {
    const conn = connectionRef.current;
    if (!conn) return;
    if (isRunning.current) return;
    const ids = Array.from(conn.selectionSet.elements);
    if (ids.length === 0) return;
    const compressedIds = CompressedId64Set.compressIds(ids);

    const axisVec = axis === 'x' ? Vector3d.unitX() : axis === 'y' ? Vector3d.unitY() : Vector3d.unitZ();
    const matrix = Matrix3d.createRotationAroundVector(axisVec, Angle.createRadians(angleRadians));
    if (!matrix) return;

    const transformProps = Transform.createOriginAndMatrix(Point3d.create(0, 0, 0), matrix).toJSON();
    const rpc = OpenCloudRpcInterface.getClient();
    isRunning.current = true;
    let editSucceeded = false;
    try {
      await rpc.startEditCommand('basicManipulation', conn.key);
      await rpc.callEditMethod('transformPlacement', compressedIds, transformProps);
      editSucceeded = true;
    } finally {
      await rpc.finishEditCommand();
      isRunning.current = false;
    }
    if (editSucceeded) {
      await conn.saveChanges('旋转元素');
      undoManager.recordOperation({ description: `旋转 ${ids.length} 个元素` });
    }
  }, []);

  const applyScale = useCallback(async (sx: number, sy: number, sz: number): Promise<void> => {
    const conn = connectionRef.current;
    if (!conn) return;
    if (isRunning.current) return;
    const ids = Array.from(conn.selectionSet.elements);
    if (ids.length === 0) return;
    const compressedIds = CompressedId64Set.compressIds(ids);

    const matrix = Matrix3d.createScale(sx, sy, sz);
    const transformProps = Transform.createOriginAndMatrix(Point3d.create(0, 0, 0), matrix).toJSON();
    const rpc = OpenCloudRpcInterface.getClient();
    isRunning.current = true;
    let editSucceeded = false;
    try {
      await rpc.startEditCommand('basicManipulation', conn.key);
      await rpc.callEditMethod('transformPlacement', compressedIds, transformProps);
      editSucceeded = true;
    } finally {
      await rpc.finishEditCommand();
      isRunning.current = false;
    }
    if (editSucceeded) {
      await conn.saveChanges('缩放元素');
      undoManager.recordOperation({ description: `缩放 ${ids.length} 个元素` });
    }
  }, []);

  const undo = useCallback(async (): Promise<void> => {
    await undoManager.undo();
  }, []);

  const redo = useCallback(async (): Promise<void> => {
    await undoManager.redo();
  }, []);

  return { selectionCount, moveMode, setMoveMode, deleteSelected, applyTranslation, applyRotation, applyScale, undo, redo };
}
