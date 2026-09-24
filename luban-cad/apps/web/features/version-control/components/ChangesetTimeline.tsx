/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useMemo } from 'react';
import { type Changeset, useChangesets } from '../hooks/useChangesets.js';
import { SvgRefresh, SvgCompare } from '@itwin/itwinui-icons-react';
import './ChangesetTimeline.css';

interface ChangesetTimelineProps {
  iModelId: string | null;
  currentChangesetId: string | null;
  isVisible: boolean;
  onPullToChangeset?: (changesetId: string, index: number) => Promise<void>;
  onCompare?: () => void;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDateGroupLabel(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(d, now)) return '今天';
  if (isSameDay(d, yesterday)) return '昨天';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface GroupedChangesets {
  label: string;
  items: Changeset[];
}

function groupChangesetsByDate(changesets: Changeset[]): GroupedChangesets[] {
  const groups: GroupedChangesets[] = [];
  for (const cs of changesets) {
    const label = getDateGroupLabel(cs.pushDateTime);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(cs);
    } else {
      groups.push({ label, items: [cs] });
    }
  }
  return groups;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function ChangesetItem({
  cs,
  isCurrent,
  onPull,
}: {
  cs: Changeset;
  isCurrent: boolean;
  onPull?: (id: string, index: number) => void;
}): React.ReactElement {
  return (
    <div className={`cs-item${isCurrent ? ' cs-item--current' : ''}`}>
      <div className="cs-dot" />
      <div className="cs-body">
        <div className="cs-meta">
          <span className="cs-index">#{cs.index}</span>
          <span className="cs-time">{formatTime(cs.pushDateTime)}</span>
          {isCurrent && <span className="cs-badge">当前</span>}
        </div>
        <div className="cs-desc" title={cs.description || cs.displayName}>
          {cs.description || cs.displayName || '(无描述)'}
        </div>
        {!isCurrent && onPull && (
          <button
            type="button"
            className="cs-pull-btn"
            onClick={() => onPull(cs.id, cs.index)}
            title="拉取到此版本"
          >
            拉取至此
          </button>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ChangesetTimeline: React.FC<ChangesetTimelineProps> = ({
  iModelId,
  currentChangesetId,
  isVisible,
  onPullToChangeset,
  onCompare,
}) => {
  const { changesets, isLoading, error, refetch } = useChangesets({
    iModelId: iModelId ?? '',
    enabled: isVisible && !!iModelId,
  });

  const handlePull = useCallback(
    (id: string, index: number) => {
      void onPullToChangeset?.(id, index);
    },
    [onPullToChangeset],
  );

  const grouped = useMemo(() => {
    const sorted = [...changesets].reverse();
    return groupChangesetsByDate(sorted);
  }, [changesets]);

  if (!isVisible || !iModelId) return null;

  return (
    <div className="cs-panel">
      <div className="cs-panel-header">
        <span className="cs-panel-title">变更历史</span>
        <div className="cs-panel-actions">
          {onCompare && (
            <button
              type="button"
              className="cs-icon-btn"
              title="版本对比"
              onClick={onCompare}
            >
              <SvgCompare />
            </button>
          )}
          <button
            type="button"
            className="cs-icon-btn"
            title="刷新"
            onClick={() => void refetch()}
          >
            <SvgRefresh />
          </button>
        </div>
      </div>

      {error && <div className="cs-error">{error.message}</div>}
      {isLoading && <div className="cs-loading">加载中...</div>}

      <div className="cs-list">
        {!isLoading && grouped.length === 0 && (
          <div className="cs-empty">暂无变更记录</div>
        )}

        {/* Continuous timeline line */}
        <div className="cs-timeline-line" />

        {grouped.map((group) => (
          <div key={group.label} className="cs-group">
            <div className="cs-date-header">
              <span className="cs-date-label">{group.label}</span>
              <span className="cs-date-dot" />
            </div>
            {group.items.map((cs) => (
              <ChangesetItem
                key={cs.id}
                cs={cs}
                isCurrent={cs.id === currentChangesetId}
                onPull={onPullToChangeset ? handlePull : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChangesetTimeline;
