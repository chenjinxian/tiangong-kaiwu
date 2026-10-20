/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, IconButton, Text } from '@itwin/itwinui-react';
import {
  SvgChevronDown,
  SvgChevronUp,
  SvgDownload,
  SvgHistory,
  SvgLabel,
  SvgUploadToCloud,
} from '@itwin/itwinui-icons-react';
import type { Changeset } from '@itwin/imodels-client-management';
import './VersionTimeline.css';

interface VersionTimelineProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
  changesets: Changeset[];
  currentChangesetId: string | null;
  hasLocalChanges: boolean;
  onPush: () => void;
  onPull: () => void;
  onShowHistory: () => void;
  onShowVersions: () => void;
}

export const VersionTimeline: React.FC<VersionTimelineProps> = ({
  isExpanded,
  onToggleExpand,
  changesets,
  currentChangesetId,
  hasLocalChanges,
  onPush,
  onPull,
  onShowHistory,
  onShowVersions,
}) => {
  const { t, i18n } = useTranslation('editor');

  const formatDate = (date: string | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
    });
  };

  // Get last 3 changesets for preview
  const recentChangesets = changesets.slice(0, 3);

  return (
    <div className={`version-timeline ${isExpanded ? 'version-timeline--expanded' : ''}`}>
      {/* Collapsed bar - always visible */}
      <div className="version-timeline-bar">
        <div className="version-timeline-left">
          <IconButton
            styleType="borderless"
            size="small"
            label={isExpanded ? t('versionTimeline.collapse') : t('versionTimeline.expand')}
            onClick={onToggleExpand}
          >
            {isExpanded ? <SvgChevronDown /> : <SvgChevronUp />}
          </IconButton>

          <div className="version-timeline-summary">
            <Text variant="small" className="version-count">
              {t('versionTimeline.changesetCount', { count: changesets.length })}
            </Text>
            {hasLocalChanges && (
              <Badge backgroundColor="warning" className="local-changes-badge">
                {t('versionTimeline.unpushedChanges')}
              </Badge>
            )}
          </div>

          {/* Mini timeline */}
          {!isExpanded && recentChangesets.length > 0 && (
            <div className="mini-timeline">
              {recentChangesets.map((cs, idx) => (
                <div
                  key={cs.id}
                  className={`mini-timeline-dot ${cs.id === currentChangesetId ? 'current' : ''}`}
                  title={`${cs.description || cs.displayName || ''} - ${formatDate(cs.pushDateTime)}`}
                >
                  {idx < recentChangesets.length - 1 && <div className="mini-timeline-line" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="version-timeline-actions">
          <Button
            styleType="borderless"
            size="small"
            startIcon={<SvgUploadToCloud />}
            onClick={onPush}
            disabled={!hasLocalChanges}
          >
            {t('versionTimeline.push')}
          </Button>
          <Button
            styleType="borderless"
            size="small"
            startIcon={<SvgDownload />}
            onClick={onPull}
          >
            {t('versionTimeline.pull')}
          </Button>
          <Button
            styleType="borderless"
            size="small"
            startIcon={<SvgHistory />}
            onClick={onShowHistory}
          >
            {t('versionTimeline.history')}
          </Button>
          <Button
            styleType="borderless"
            size="small"
            startIcon={<SvgLabel />}
            onClick={onShowVersions}
          >
            {t('versionTimeline.versions')}
          </Button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="version-timeline-content">
          <div className="timeline-list">
            {changesets.length === 0 ? (
              <Text className="timeline-empty">{t('versionTimeline.empty')}</Text>
            ) : (
              changesets.map((cs, idx) => (
                <div
                  key={cs.id}
                  className={`timeline-item ${cs.id === currentChangesetId ? 'current' : ''}`}
                >
                  <div className="timeline-index">{changesets.length - idx}</div>
                  <div className="timeline-connector">
                    <div className="timeline-dot" />
                    {idx < changesets.length - 1 && <div className="timeline-line" />}
                  </div>
                  <div className="timeline-info">
                    <Text className="timeline-description">
                      {cs.description || cs.displayName || t('versionTimeline.noDescription')}
                    </Text>
                    <Text variant="small" className="timeline-meta">
                      {formatDate(cs.pushDateTime)}
                    </Text>
                  </div>
                  {cs.id === currentChangesetId && (
                    <Badge backgroundColor="positive" className="current-badge">
                      {t('versionTimeline.current')}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
