/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from 'react';
import type { ConflictResolution } from '@luban-cad/shared';
import type { NamedVersion } from '../../version-control/hooks/useNamedVersions.js';
import { useConflictDetection } from '../../version-control/hooks/useConflictDetection.js';
import { useChangesets } from '../../version-control/hooks/useChangesets.js';
import type { EditorSidebarTab } from '../components/EditorSidebar.js';
import type { BriefcaseConnection } from '@itwin/core-frontend';

export type { EditorSidebarTab };

export interface VersionControlState {
  showCompare: boolean;
  showConflictPanel: boolean;
  pendingPullChangesetId: string | null;
  pushDialogOpen: boolean;
  activeSidebarTab: EditorSidebarTab;
  compareVersions: { source: NamedVersion; target: NamedVersion } | null;
  changesets: ReturnType<typeof useChangesets>['changesets'];
  detectionResult: ReturnType<typeof useConflictDetection>['detectionResult'];
  hasLocalChanges: boolean;
  hasRemoteChanges: boolean;
}

export interface VersionControlActions {
  setShowCompare: (show: boolean) => void;
  setShowCompareWithReset: (show: boolean) => void;
  setPushDialogOpen: (open: boolean) => void;
  setActiveSidebarTab: (tab: EditorSidebarTab) => void;
  handleSave: () => Promise<void>;
  handlePush: (description: string) => Promise<void>;
  handlePull: (targetChangesetId?: string) => Promise<void>;
  handlePullToChangeset: (changesetId: string, index: number) => Promise<void>;
  handleResolveConflicts: (resolutions: Record<string, ConflictResolution>) => Promise<void>;
  handleCloseConflictPanel: () => void;
  handleRollbackToVersion: (changesetId: string, versionName: string) => Promise<void>;
  handleCompareVersions: (source: NamedVersion, target: NamedVersion) => void;
}

/**
 * Hook for version control operations: push, pull, conflict resolution, history, and named versions.
 */
export function useVersionControl(
  iModelId: string | undefined,
  connection: BriefcaseConnection | undefined,
  saveChanges: (description: string) => Promise<void>,
  pushChanges: (description: string) => Promise<void>,
  pullChanges: () => Promise<void>,
  showToast: (msg: string, type: 'success' | 'error') => void,
  setOpStatus: (status: string) => void,
): VersionControlState & VersionControlActions {
  const [showCompare, setShowCompare] = useState(false);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [pendingPullChangesetId, setPendingPullChangesetId] = useState<string | null>(null);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<EditorSidebarTab>('features');
  const [compareVersions, setCompareVersions] = useState<{ source: NamedVersion; target: NamedVersion } | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [hasRemoteChanges, setHasRemoteChanges] = useState(false);

  // Listen for commit events from BriefcaseConnection to update hasLocalChanges
  useEffect(() => {
    if (!connection?.txns) return;

    const handleCommitted = (hasPending: boolean) => {
      setHasLocalChanges(hasPending);
    };

    connection.txns.onCommitted.addListener(handleCommitted);
    return () => {
      connection.txns.onCommitted.removeListener(handleCommitted);
    };
  }, [connection]);

  const {
    detectionResult,
    detectConflicts,
    resolveConflicts,
    clearDetection,
  } = useConflictDetection({
    iModelId: iModelId ?? '',
    briefcaseId: 0,
  });

  const { changesets } = useChangesets({
    iModelId: iModelId ?? '',
    enabled: !!iModelId && (activeSidebarTab === 'history' || showCompare),
  });

  const handleSave = useCallback(async () => {
    setOpStatus('保存中...');
    try {
      await saveChanges('手动保存');
      setHasLocalChanges(true);
      setOpStatus('');
      showToast('已保存', 'success');
    } catch (e) {
      const msg = `保存失败: ${e instanceof Error ? e.message : String(e)}`;
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [saveChanges, showToast, setOpStatus]);

  const handlePush = useCallback(async (description: string) => {
    setOpStatus('推送中...');
    try {
      await pushChanges(description);
      setHasLocalChanges(false);
      setOpStatus('');
      showToast('推送成功', 'success');
    } catch (e) {
      const msg = `推送失败: ${e instanceof Error ? e.message : String(e)}`;
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [pushChanges, showToast, setOpStatus]);

  const handlePull = useCallback(async (targetChangesetId?: string) => {
    setOpStatus('检查冲突...');
    try {
      const conflictResult = await detectConflicts(targetChangesetId ?? 'latest');

      if (conflictResult?.hasConflicts) {
        setPendingPullChangesetId(targetChangesetId ?? 'latest');
        setShowConflictPanel(true);
        setOpStatus('检测到冲突，请解决后重试');
        return;
      }

      setOpStatus('拉取中...');
      await pullChanges();
      setHasRemoteChanges(false);
      setOpStatus('');
      showToast('拉取成功', 'success');
    } catch (e) {
      const msg = `拉取失败: ${e instanceof Error ? e.message : String(e)}`;
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [pullChanges, showToast, detectConflicts, setOpStatus]);

  const handlePullToChangeset = useCallback(async (changesetId: string, _index: number) => {
    await handlePull(changesetId);
  }, [handlePull]);

  const handleResolveConflicts = useCallback(async (resolutions: Record<string, ConflictResolution>) => {
    setOpStatus('解决冲突...');
    try {
      const result = await resolveConflicts(resolutions);
      if (result?.success) {
        showToast(`已解决 ${result.resolvedCount} 个冲突`, 'success');
        setShowConflictPanel(false);
        clearDetection();

        if (pendingPullChangesetId) {
          setTimeout(() => {
            void handlePull(pendingPullChangesetId);
          }, 100);
        }
        setPendingPullChangesetId(null);
      } else {
        showToast(result?.error ?? '解决冲突失败', 'error');
      }
    } catch (e) {
      const msg = `解决冲突失败: ${e instanceof Error ? e.message : String(e)}`;
      showToast(msg, 'error');
    }
    setOpStatus('');
  }, [resolveConflicts, showToast, clearDetection, pendingPullChangesetId, handlePull, setOpStatus]);

  const handleCloseConflictPanel = useCallback(() => {
    setShowConflictPanel(false);
    setPendingPullChangesetId(null);
    clearDetection();
  }, [clearDetection]);

  const handleRollbackToVersion = useCallback(async (changesetId: string, versionName: string) => {
    setOpStatus(`正在回滚到版本 "${versionName}"...`);
    try {
      const targetChangeset = changesets.find(cs => cs.id === changesetId);
      if (!targetChangeset) {
        throw new Error('未找到对应的变更集');
      }

      await handlePullToChangeset(changesetId, targetChangeset.index);
      showToast(`已回滚到版本 "${versionName}"`, 'success');
    } catch (e) {
      const msg = `回滚失败: ${e instanceof Error ? e.message : String(e)}`;
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [changesets, handlePullToChangeset, showToast, setOpStatus]);

  const handleCompareVersions = useCallback((source: NamedVersion, target: NamedVersion) => {
    if (!source.changesetId || !target.changesetId) {
      showToast('无效的变更集ID', 'error');
      return;
    }
    setCompareVersions({ source, target });
    setShowCompare(true);
    setActiveSidebarTab('history');
  }, [showToast]);

  const setShowCompareWithReset = useCallback((show: boolean) => {
    setShowCompare(show);
    if (!show) {
      setCompareVersions(null);
    }
  }, []);

  return {
    showCompare,
    showConflictPanel,
    pendingPullChangesetId,
    pushDialogOpen,
    activeSidebarTab,
    compareVersions,
    changesets,
    detectionResult,
    hasLocalChanges,
    hasRemoteChanges,
    setShowCompare,
    setShowCompareWithReset,
    setPushDialogOpen,
    setActiveSidebarTab,
    handleSave,
    handlePush,
    handlePull,
    handlePullToChangeset,
    handleResolveConflicts,
    handleCloseConflictPanel,
    handleRollbackToVersion,
    handleCompareVersions,
  };
}
