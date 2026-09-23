/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { Button, Dialog } from '@itwin/itwinui-react';
import type {
  Conflict,
  ConflictDetectionResult,
  ConflictResolution,
  ConflictType,
} from '@open-cloud-cad/shared';
import './ConflictPanel.css';

interface ConflictPanelProps {
  detectionResult: ConflictDetectionResult | null;
  isVisible: boolean;
  onClose: () => void;
  onResolve: (resolutions: Record<string, ConflictResolution>) => void;
}

const conflictTypeLabels: Record<ConflictType, string> = {
  'modify-modify': '双方修改',
  'delete-modify': '删除-修改',
  'modify-delete': '修改-删除',
  'add-add': '双方添加',
  'delete-delete': '双方删除',
};

const conflictTypeDescriptions: Record<ConflictType, string> = {
  'modify-modify': '您和对方都修改了此元素',
  'delete-modify': '对方删除了此元素，但您进行了修改',
  'modify-delete': '您修改了此元素，但对方将其删除',
  'add-add': '您和对方都添加了相同 ID 的元素',
  'delete-delete': '双方都已删除此元素（无冲突）',
};

// eslint-disable-next-line @typescript-eslint/naming-convention
function ConflictItem({
  conflict,
  resolution,
  onResolutionChange,
}: {
  conflict: Conflict;
  resolution?: ConflictResolution;
  onResolutionChange: (conflictId: string, resolution: ConflictResolution) => void;
}): React.ReactElement {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`conflict-item ${conflict.isResolved ? 'resolved' : ''}`}>
      <div className="conflict-header" onClick={() => setShowDetails(!showDetails)}>
        <div className="conflict-type-badge" data-type={conflict.type}>
          {conflictTypeLabels[conflict.type]}
        </div>
        <div className="conflict-info">
          <span className="conflict-code">{conflict.localVersion.code}</span>
          <span className="conflict-class">{conflict.localVersion.className}</span>
        </div>
        <div className="conflict-status">
          {conflict.isResolved ? (
            <span className="status-resolved">已解决</span>
          ) : resolution ? (
            <span className="status-pending">待确认</span>
          ) : (
            <span className="status-unresolved">未解决</span>
          )}
        </div>
        <button type="button" className="conflict-expand-btn">
          {showDetails ? '▼' : '▶'}
        </button>
      </div>

      {showDetails && (
        <div className="conflict-details">
          <p className="conflict-description">{conflictTypeDescriptions[conflict.type]}</p>

          <div className="conflict-versions">
            <div className="version-box local">
              <div className="version-header">您的版本（本地）</div>
              <div className="version-content">
                <pre>{JSON.stringify(conflict.localVersion.properties, null, 2)}</pre>
              </div>
            </div>

            <div className="version-arrow">⇄</div>

            <div className="version-box remote">
              <div className="version-header">对方版本（远程）</div>
              <div className="version-content">
                <pre>{JSON.stringify(conflict.remoteVersion.properties, null, 2)}</pre>
              </div>
            </div>
          </div>

          {conflict.baseVersion && (
            <div className="version-box base">
              <div className="version-header">基础版本</div>
              <div className="version-content">
                <pre>{JSON.stringify(conflict.baseVersion.properties, null, 2)}</pre>
              </div>
            </div>
          )}

          <div className="conflict-actions">
            <span>选择解决方案：</span>
            <div className="resolution-buttons">
              <button
                type="button"
                className={`resolution-btn ${resolution === 'local' ? 'selected' : ''}`}
                onClick={() => onResolutionChange(conflict.id, 'local')}
              >
                使用我的
              </button>
              <button
                type="button"
                className={`resolution-btn ${resolution === 'remote' ? 'selected' : ''}`}
                onClick={() => onResolutionChange(conflict.id, 'remote')}
              >
                使用对方的
              </button>
              <button
                type="button"
                className={`resolution-btn ${resolution === 'merged' ? 'selected' : ''}`}
                onClick={() => onResolutionChange(conflict.id, 'merged')}
                disabled={conflict.type !== 'modify-modify'}
              >
                合并双方
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ConflictPanel: React.FC<ConflictPanelProps> = ({
  detectionResult,
  isVisible,
  onClose,
  onResolve,
}) => {
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});

  const handleResolutionChange = useCallback((conflictId: string, resolution: ConflictResolution) => {
    setResolutions(prev => ({
      ...prev,
      [conflictId]: resolution,
    }));
  }, []);

  const handleResolve = useCallback(() => {
    onResolve(resolutions);
  }, [onResolve, resolutions]);

  const handleClose = useCallback(() => {
    setResolutions({});
    onClose();
  }, [onClose]);

  if (!isVisible || !detectionResult) return null;

  const resolvedCount = Object.keys(resolutions).length;
  const totalConflicts = detectionResult.totalConflicts;
  const allResolved = resolvedCount === totalConflicts;

  return (
    <Dialog isOpen={isVisible} onClose={handleClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title="冲突检测">
        <Dialog.TitleBar title="冲突检测" />
        <Dialog.Content>
        <div className="conflict-panel">
          <div className="conflict-summary">
            <div className="summary-item">
              <span className="summary-label">总冲突数：</span>
              <span className="summary-value">{detectionResult.totalConflicts}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">已解决：</span>
              <span className="summary-value">{resolvedCount}/{totalConflicts}</span>
            </div>
          </div>

          <div className="conflict-type-summary">
            {detectionResult.summary.modifyModify > 0 && (
              <span className="type-tag modify-modify">双方修改: {detectionResult.summary.modifyModify}</span>
            )}
            {detectionResult.summary.deleteModify > 0 && (
              <span className="type-tag delete-modify">删除-修改: {detectionResult.summary.deleteModify}</span>
            )}
            {detectionResult.summary.modifyDelete > 0 && (
              <span className="type-tag modify-delete">修改-删除: {detectionResult.summary.modifyDelete}</span>
            )}
            {detectionResult.summary.addAdd > 0 && (
              <span className="type-tag add-add">双方添加: {detectionResult.summary.addAdd}</span>
            )}
          </div>

          <div className="conflict-list">
            {detectionResult.conflicts.map(conflict => (
              <ConflictItem
                key={conflict.id}
                conflict={conflict}
                resolution={resolutions[conflict.id]}
                onResolutionChange={handleResolutionChange}
              />
            ))}
          </div>

          {!detectionResult.hasConflicts && (
            <div className="no-conflicts">
              ✅ 未检测到冲突，可以安全拉取变更
            </div>
          )}
        </div>
      </Dialog.Content>

        <div className="conflict-panel-footer">
          <Button onClick={handleClose} styleType="default">
            取消
          </Button>
          {detectionResult.hasConflicts && (
            <Button
              onClick={handleResolve}
              styleType="high-visibility"
              disabled={!allResolved}
            >
              {allResolved ? '应用解决方案' : `还需解决 ${totalConflicts - resolvedCount} 个冲突`}
            </Button>
          )}
          {!detectionResult.hasConflicts && (
            <Button onClick={handleClose} styleType="high-visibility">
              继续拉取
            </Button>
          )}
        </div>
      </Dialog.Main>
    </Dialog>
  );
};

export default ConflictPanel;
