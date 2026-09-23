/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * EditorBriefcaseStatus — Compact briefcase status for the editor topbar.
 *
 * Shows connection state, changeset index, and pending changes indicator.
 */

import { useEffect, useState } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';

interface EditorBriefcaseStatusProps {
  connection: BriefcaseConnection | null;
  isLoading: boolean;
  error: Error | null;
  isEditable: boolean;
}

export function EditorBriefcaseStatus({
  connection,
  isLoading,
  error,
  isEditable,
}: EditorBriefcaseStatusProps): JSX.Element {
  const [hasPendingTxns, setHasPendingTxns] = useState(false);

  // Poll for pending transactions when connected and editable
  useEffect(() => {
    if (!connection || !isEditable || !connection.txns) {
      setHasPendingTxns(false);
      return;
    }

    let cancelled = false;

    const checkPending = async (): Promise<void> => {
      try {
        const pending = await connection.txns.hasPendingTxns();
        if (!cancelled) setHasPendingTxns(pending);
      } catch {
        if (!cancelled) setHasPendingTxns(false);
      }
    };

    void checkPending();
    const interval = setInterval(() => void checkPending(), 2000);

    const handleCommitted = (): void => {
      void checkPending();
    };

    connection.txns.onCommitted.addListener(handleCommitted);

    return () => {
      cancelled = true;
      clearInterval(interval);
      connection.txns.onCommitted.removeListener(handleCommitted);
    };
  }, [connection, isEditable]);

  const getStatusColor = (): string => {
    if (isLoading) return '#f59e0b'; // amber
    if (error) return '#ef4444'; // red
    if (connection) return '#10b981'; // green
    return '#6b7280'; // gray
  };

  const getStatusText = (): string => {
    if (isLoading) return '加载中...';
    if (error) return '连接错误';
    if (connection) return isEditable ? '可编辑' : '已连接';
    return isEditable ? '未连接' : '只读';
  };

  const changesetIndex = connection?.changeset?.index;

  return (
    <div className="editor-briefcase-status">
      <div
        className="editor-status-badge"
        style={{
          background: isEditable
            ? 'rgba(16, 185, 129, 0.1)'
            : 'rgba(107, 114, 128, 0.1)',
          color: isEditable ? '#10b981' : '#6b7280',
        }}
      >
        <span
          className="editor-status-dot"
          style={{
            background: getStatusColor(),
            animation: connection && !error ? 'pulse-dot 2s ease-in-out infinite' : 'none',
          }}
        />
        <span className="editor-status-text">{getStatusText()}</span>
      </div>

      {connection && changesetIndex !== undefined && (
        <span className="editor-changeset-index">
          CS #{changesetIndex}
        </span>
      )}

      {hasPendingTxns && (
        <span className="editor-pending-badge">未保存</span>
      )}

      {error && (
        <span className="editor-error-text" title={error.message}>
          {error.message.length > 20 ? `${error.message.slice(0, 20)}...` : error.message}
        </span>
      )}
    </div>
  );
}
