/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from 'react';
import type { ConflictResolution } from '@luban-cad/shared';
import i18n from '../../../shared/i18n/index.js';
import type { NamedVersion } from '../../version-control/hooks/useNamedVersions.js';
import { useConflictDetection } from '../../version-control/hooks/useConflictDetection.js';
import { useChangesets } from '../../version-control/hooks/useChangesets.js';
import type { BriefcaseConnection } from '@itwin/core-frontend';

/**
 * 侧栏 tab 字面联合（M3-b T8：原定义于已删除的 EditorSidebar 死容器——Editor.tsx
 * 现行正主为 FeatureTreePanel/TreeTab，本 hook 仍保留 history/versions 两态驱动）。
 */
export type EditorSidebarTab = 'features' | 'assemblies' | 'history' | 'versions';

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
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
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
    setOpStatus(i18n.t('versionOps.saving', { ns: 'editor' }));
    try {
      await saveChanges(i18n.t('versionOps.manualSave', { ns: 'editor' }));
      setHasLocalChanges(true);
      setOpStatus('');
      showToast(i18n.t('versionOps.saved', { ns: 'editor' }), 'success');
    } catch (e) {
      const msg = i18n.t('versionOps.saveFailed', {
        ns: 'editor',
        message: e instanceof Error ? e.message : String(e),
      });
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [saveChanges, showToast, setOpStatus]);

  const handlePush = useCallback(async (description: string) => {
    setOpStatus(i18n.t('versionOps.pushing', { ns: 'editor' }));
    try {
      await pushChanges(description);
      setHasLocalChanges(false);
      setOpStatus('');
      showToast(i18n.t('versionOps.pushSuccess', { ns: 'editor' }), 'success');
    } catch (e) {
      const msg = i18n.t('versionOps.pushFailed', {
        ns: 'editor',
        message: e instanceof Error ? e.message : String(e),
      });
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [pushChanges, showToast, setOpStatus]);

  const handlePull = useCallback(async (targetChangesetId?: string) => {
    setOpStatus(i18n.t('versionOps.checkingConflicts', { ns: 'editor' }));
    try {
      const conflictResult = await detectConflicts(targetChangesetId ?? 'latest');

      if (conflictResult?.hasConflicts) {
        setPendingPullChangesetId(targetChangesetId ?? 'latest');
        setShowConflictPanel(true);
        setOpStatus(i18n.t('versionOps.conflictsFound', { ns: 'editor' }));
        return;
      }

      if (conflictResult?.featureAvailable === false) {
        showToast(i18n.t('versionOps.conflictCheckUnavailable', { ns: 'editor' }), 'info');
      }

      setOpStatus(i18n.t('versionOps.pulling', { ns: 'editor' }));
      await pullChanges();
      setHasRemoteChanges(false);
      setOpStatus('');
      showToast(i18n.t('versionOps.pullSuccess', { ns: 'editor' }), 'success');
    } catch (e) {
      const msg = i18n.t('versionOps.pullFailed', {
        ns: 'editor',
        message: e instanceof Error ? e.message : String(e),
      });
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [pullChanges, showToast, detectConflicts, setOpStatus]);

  const handlePullToChangeset = useCallback(async (changesetId: string, _index: number) => {
    await handlePull(changesetId);
  }, [handlePull]);

  const handleResolveConflicts = useCallback(async (resolutions: Record<string, ConflictResolution>) => {
    setOpStatus(i18n.t('versionOps.resolving', { ns: 'editor' }));
    try {
      const result = await resolveConflicts(resolutions);
      if (result?.success) {
        showToast(
          i18n.t('versionOps.resolved', { ns: 'editor', count: result.resolvedCount }),
          'success',
        );
        setShowConflictPanel(false);
        clearDetection();

        if (pendingPullChangesetId) {
          setTimeout(() => {
            void handlePull(pendingPullChangesetId);
          }, 100);
        }
        setPendingPullChangesetId(null);
      } else {
        showToast(result?.error ?? i18n.t('versionOps.resolveFailed', { ns: 'editor' }), 'error');
      }
    } catch (e) {
      const msg = i18n.t('versionOps.resolveFailedWithMessage', {
        ns: 'editor',
        message: e instanceof Error ? e.message : String(e),
      });
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
    setOpStatus(i18n.t('versionOps.rollingBack', { ns: 'editor', versionName }));
    try {
      const targetChangeset = changesets.find(cs => cs.id === changesetId);
      if (!targetChangeset) {
        throw new Error(i18n.t('versionOps.changesetNotFound', { ns: 'editor' }));
      }

      await handlePullToChangeset(changesetId, targetChangeset.index);
      showToast(i18n.t('versionOps.rollbackSuccess', { ns: 'editor', versionName }), 'success');
    } catch (e) {
      const msg = i18n.t('versionOps.rollbackFailed', {
        ns: 'editor',
        message: e instanceof Error ? e.message : String(e),
      });
      setOpStatus(msg);
      showToast(msg, 'error');
    }
  }, [changesets, handlePullToChangeset, showToast, setOpStatus]);

  const handleCompareVersions = useCallback((source: NamedVersion, target: NamedVersion) => {
    if (!source.changesetId || !target.changesetId) {
      showToast(i18n.t('versionOps.invalidChangeset', { ns: 'editor' }), 'error');
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
