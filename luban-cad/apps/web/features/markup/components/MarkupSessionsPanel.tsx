/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Markup Sessions Panel Component
 * Displays markup session history
 */

import React, { useState } from 'react';
import {
  List,
  ListItem,
  IconButton,

  Badge,
  Input,
  Tooltip,
} from '@itwin/itwinui-react';
import {
  SvgPlay,
  SvgDelete,
  SvgDownload,
  SvgEdit,
  SvgCheckmark,
  SvgClose,
} from '@itwin/itwinui-icons-react';
import { MarkupSession } from '../hooks/useMarkupManager';

interface MarkupSessionsPanelProps {
  sessions: MarkupSession[];
  activeId: string | null;
  onLoad: (session: MarkupSession) => void;
  onDelete: (id: string) => void;
  onExport: (session: MarkupSession) => void;
  onRename: (id: string, newName: string) => void;
}

export const MarkupSessionsPanel: React.FC<MarkupSessionsPanelProps> = ({
  sessions,
  activeId,
  onLoad,
  onDelete,
  onExport,
  onRename,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startEdit = (session: MarkupSession) => {
    setEditingId(session.id);
    setEditName(session.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
      setEditingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="markup-sessions-panel">
      <div className="panel-header">
        <div className="panel-header-content">
          <span style={{ fontWeight: 500 }}>标记历史</span>
          <Badge>{String(sessions.length)}</Badge>
        </div>
      </div>

      <div className="panel-body">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <span style={{ color: "var(--iui-color-text-muted)" }}>暂无标记会话</span>
            <div>
              <span style={{ color: "var(--iui-color-text-muted)", fontSize: 12 }}>
                点击标记按钮开始创建
              </span>
            </div>
          </div>
        ) : (
          <List className="markup-sessions-list">
            {sessions.map((session) => (
              <ListItem
                key={session.id}
                active={session.id === activeId}
                className={`markup-session-item ${session.isActive ? 'active-session' : ''}`}
              >
                <div className="session-content">
                  {editingId === session.id ? (
                    <div className="session-edit">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        size="small"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                      />
                      <IconButton size="small" onClick={saveEdit}>
                        <SvgCheckmark />
                      </IconButton>
                      <IconButton size="small" onClick={cancelEdit}>
                        <SvgClose />
                      </IconButton>
                    </div>
                  ) : (
                    <>
                      <div className="session-header">
                        <span style={{ fontWeight: 600 }}>{session.name}</span>
                        {session.isActive && (
                          <Badge color="positive">进行中</Badge>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: "var(--iui-color-text-muted)" }}>
                        {session.author} · {formatDate(session.createdAt)}
                      </span>
                    </>
                  )}
                </div>

                {editingId !== session.id && (
                  <div className="session-actions">
                    <Tooltip content="加载">
                      <IconButton
                        size="small"
                        onClick={() => onLoad(session)}
                        disabled={session.id === activeId}
                      >
                        <SvgPlay />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="重命名">
                      <IconButton size="small" onClick={() => startEdit(session)}>
                        <SvgEdit />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="导出">
                      <IconButton size="small" onClick={() => onExport(session)}>
                        <SvgDownload />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="删除">
                      <IconButton
                        size="small"
                        onClick={() => onDelete(session.id)}
                      >
                        <SvgDelete />
                      </IconButton>
                    </Tooltip>
                  </div>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </div>
    </div>
  );
};
