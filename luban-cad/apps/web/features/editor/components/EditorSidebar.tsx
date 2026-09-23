/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * EditorSidebar — Consolidated right-side sidebar with organized tabs:
 * - Design: Features, Assemblies (modeling related)
 * - Version: History, Versions (version control related)
 */

import React from 'react';
import { Tabs } from '@itwin/itwinui-react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { Changeset } from '@itwin/imodels-client-management';
import type { NamedVersion } from '../../version-control/hooks/useNamedVersions.js';
import { FeaturePanel } from './FeaturePanel.js';
import { AssemblyPanel } from './AssemblyPanel.js';
import { ChangesetTimeline } from '../../version-control/components/ChangesetTimeline.js';
import { ChangesetCompare } from '../../version-control/components/ChangesetCompare.js';
import { NamedVersionPanel } from '../../version-control/components/NamedVersionPanel.js';

export type EditorSidebarTab = 'features' | 'assemblies' | 'history' | 'versions';

interface EditorSidebarProps {
  activeTab: EditorSidebarTab;
  onTabChange: (tab: EditorSidebarTab) => void;
  connection: BriefcaseConnection | null;
  iModelId: string | null;
  currentChangesetId: string | null;
  changesets: Changeset[];
  showCompare: boolean;
  onCloseCompare: () => void;
  compareVersions: { source: NamedVersion; target: NamedVersion } | null;
  onPullToChangeset: (changesetId: string, index: number) => Promise<void>;
  onShowCompare: () => void;
  onRollbackToVersion?: (changesetId: string, versionName: string) => Promise<void>;
  onCompareVersions?: (sourceVersion: NamedVersion, targetVersion: NamedVersion) => void;
}

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  activeTab,
  onTabChange,
  connection,
  iModelId,
  currentChangesetId,
  changesets,
  showCompare,
  onCloseCompare,
  compareVersions,
  onPullToChangeset,
  onShowCompare,
  onRollbackToVersion,
  onCompareVersions,
}) => {
  return (
    <div className={`editor-sidebar${showCompare ? ' editor-sidebar--wide' : ''}`}>
      <Tabs.Wrapper value={activeTab} onValueChange={(v) => onTabChange(v as EditorSidebarTab)}>
        <Tabs.TabList>
          <Tabs.Tab value="features" label="特征" />
          <Tabs.Tab value="assemblies" label="装配" />
          <Tabs.Tab value="history" label="历史" />
          <Tabs.Tab value="versions" label="版本" />
        </Tabs.TabList>

        <Tabs.Panel value="features" className="editor-sidebar-panel">
          <FeaturePanel connection={connection} isVisible />
        </Tabs.Panel>

        <Tabs.Panel value="assemblies" className="editor-sidebar-panel">
          <AssemblyPanel connection={connection} isVisible />
        </Tabs.Panel>

        <Tabs.Panel value="history" className="editor-sidebar-panel">
          {showCompare ? (
            <ChangesetCompare
              iModelId={iModelId ?? ''}
              changesets={changesets}
              currentChangesetId={currentChangesetId}
              isVisible
              onClose={onCloseCompare}
              preselectedVersions={
                compareVersions
                  ? {
                      sourceChangesetId: compareVersions.source.changesetId,
                      targetChangesetId: compareVersions.target.changesetId,
                    }
                  : null
              }
            />
          ) : (
            <ChangesetTimeline
              iModelId={iModelId}
              currentChangesetId={currentChangesetId}
              isVisible
              onPullToChangeset={onPullToChangeset}
              onCompare={onShowCompare}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel value="versions" className="editor-sidebar-panel">
          <NamedVersionPanel
            iModelId={iModelId}
            currentChangesetId={currentChangesetId}
            isVisible
            onClose={() => { /* no-op in sidebar context */ }}
            onRollback={onRollbackToVersion}
            onCompareVersions={onCompareVersions}
          />
        </Tabs.Panel>
      </Tabs.Wrapper>
    </div>
  );
};
