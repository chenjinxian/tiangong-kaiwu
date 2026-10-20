/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '@itwin/itwinui-react';
import type {
  Conflict,
  ConflictDetectionResult,
  ConflictResolution,
  ConflictType,
} from '@luban-cad/shared';
import './ConflictPanel.css';

interface ConflictPanelProps {
  detectionResult: ConflictDetectionResult | null;
  isVisible: boolean;
  onClose: () => void;
  onResolve: (resolutions: Record<string, ConflictResolution>) => void;
}

const conflictTypeKeys: Record<ConflictType, string> = {
  'modify-modify': 'conflictPanel.types.modifyModify',
  'delete-modify': 'conflictPanel.types.deleteModify',
  'modify-delete': 'conflictPanel.types.modifyDelete',
  'add-add': 'conflictPanel.types.addAdd',
  'delete-delete': 'conflictPanel.types.deleteDelete',
};

const conflictDescriptionKeys: Record<ConflictType, string> = {
  'modify-modify': 'conflictPanel.descriptions.modifyModify',
  'delete-modify': 'conflictPanel.descriptions.deleteModify',
  'modify-delete': 'conflictPanel.descriptions.modifyDelete',
  'add-add': 'conflictPanel.descriptions.addAdd',
  'delete-delete': 'conflictPanel.descriptions.deleteDelete',
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
  const { t } = useTranslation('editor');
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`conflict-item ${conflict.isResolved ? 'resolved' : ''}`}>
      <div className="conflict-header" onClick={() => setShowDetails(!showDetails)}>
        <div className="conflict-type-badge" data-type={conflict.type}>
          {t(conflictTypeKeys[conflict.type])}
        </div>
        <div className="conflict-info">
          <span className="conflict-code">{conflict.localVersion.code}</span>
          <span className="conflict-class">{conflict.localVersion.className}</span>
        </div>
        <div className="conflict-status">
          {conflict.isResolved ? (
            <span className="status-resolved">{t('conflictPanel.status.resolved')}</span>
          ) : resolution ? (
            <span className="status-pending">{t('conflictPanel.status.pending')}</span>
          ) : (
            <span className="status-unresolved">{t('conflictPanel.status.unresolved')}</span>
          )}
        </div>
        <button type="button" className="conflict-expand-btn">
          {showDetails ? '▼' : '▶'}
        </button>
      </div>

      {showDetails && (
        <div className="conflict-details">
          <p className="conflict-description">{t(conflictDescriptionKeys[conflict.type])}</p>

          <div className="conflict-versions">
            <div className="version-box local">
              <div className="version-header">{t('conflictPanel.localVersion')}</div>
              <div className="version-content">
                <pre>{JSON.stringify(conflict.localVersion.properties, null, 2)}</pre>
              </div>
            </div>

            <div className="version-arrow">⇄</div>

            <div className="version-box remote">
              <div className="version-header">{t('conflictPanel.remoteVersion')}</div>
              <div className="version-content">
                <pre>{JSON.stringify(conflict.remoteVersion.properties, null, 2)}</pre>
              </div>
            </div>
          </div>

          {conflict.baseVersion && (
            <div className="version-box base">
              <div className="version-header">{t('conflictPanel.baseVersion')}</div>
              <div className="version-content">
                <pre>{JSON.stringify(conflict.baseVersion.properties, null, 2)}</pre>
              </div>
            </div>
          )}

          <div className="conflict-actions">
            <span>{t('conflictPanel.chooseResolution')}</span>
            <div className="resolution-buttons">
              <button
                type="button"
                className={`resolution-btn ${resolution === 'local' ? 'selected' : ''}`}
                onClick={() => onResolutionChange(conflict.id, 'local')}
              >
                {t('conflictPanel.useMine')}
              </button>
              <button
                type="button"
                className={`resolution-btn ${resolution === 'remote' ? 'selected' : ''}`}
                onClick={() => onResolutionChange(conflict.id, 'remote')}
              >
                {t('conflictPanel.useTheirs')}
              </button>
              <button
                type="button"
                className={`resolution-btn ${resolution === 'merged' ? 'selected' : ''}`}
                onClick={() => onResolutionChange(conflict.id, 'merged')}
                disabled={conflict.type !== 'modify-modify'}
              >
                {t('conflictPanel.mergeBoth')}
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
  const { t } = useTranslation('editor');
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

  if (detectionResult.featureAvailable === false) {
    return (
      <Dialog isOpen={isVisible} onClose={handleClose} portal>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <h3>{t('conflictPanel.unavailable.title')}</h3>
          <p style={{ color: 'var(--text-secondary, #888)' }}>
            {t('conflictPanel.unavailable.description')}
          </p>
          <button type="button" onClick={handleClose}>
            {t('conflictPanel.unavailable.acknowledge')}
          </button>
        </div>
      </Dialog>
    );
  }

  const resolvedCount = Object.keys(resolutions).length;
  const totalConflicts = detectionResult.totalConflicts;
  const allResolved = resolvedCount === totalConflicts;

  return (
    <Dialog isOpen={isVisible} onClose={handleClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={t('conflictPanel.title')}>
        <Dialog.TitleBar titleText={t('conflictPanel.title')} />
        <Dialog.Content>
        <div className="conflict-panel">
          <div className="conflict-summary">
            <div className="summary-item">
              <span className="summary-label">{t('conflictPanel.summary.total')}</span>
              <span className="summary-value">{detectionResult.totalConflicts}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{t('conflictPanel.summary.resolved')}</span>
              <span className="summary-value">{resolvedCount}/{totalConflicts}</span>
            </div>
          </div>

          <div className="conflict-type-summary">
            {detectionResult.summary.modifyModify > 0 && (
              <span className="type-tag modify-modify">
                {t('conflictPanel.typeSummary.modifyModify', { count: detectionResult.summary.modifyModify })}
              </span>
            )}
            {detectionResult.summary.deleteModify > 0 && (
              <span className="type-tag delete-modify">
                {t('conflictPanel.typeSummary.deleteModify', { count: detectionResult.summary.deleteModify })}
              </span>
            )}
            {detectionResult.summary.modifyDelete > 0 && (
              <span className="type-tag modify-delete">
                {t('conflictPanel.typeSummary.modifyDelete', { count: detectionResult.summary.modifyDelete })}
              </span>
            )}
            {detectionResult.summary.addAdd > 0 && (
              <span className="type-tag add-add">
                {t('conflictPanel.typeSummary.addAdd', { count: detectionResult.summary.addAdd })}
              </span>
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
              {t('conflictPanel.noConflicts')}
            </div>
          )}
        </div>
      </Dialog.Content>

        <div className="conflict-panel-footer">
          <Button onClick={handleClose} styleType="default">
            {t('conflictPanel.cancel')}
          </Button>
          {detectionResult.hasConflicts && (
            <Button
              onClick={handleResolve}
              styleType="high-visibility"
              disabled={!allResolved}
            >
              {allResolved
                ? t('conflictPanel.applyResolutions')
                : t('conflictPanel.remaining', { count: totalConflicts - resolvedCount })}
            </Button>
          )}
          {!detectionResult.hasConflicts && (
            <Button onClick={handleClose} styleType="high-visibility">
              {t('conflictPanel.continuePull')}
            </Button>
          )}
        </div>
      </Dialog.Main>
    </Dialog>
  );
};

export default ConflictPanel;
