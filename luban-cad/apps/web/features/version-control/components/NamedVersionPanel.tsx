/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Dialog, Input } from '@itwin/itwinui-react';
import { SvgStatusError } from '@itwin/itwinui-icons-react';
import {
  type NamedVersion,
  useNamedVersionMutations,
  useNamedVersions,
} from '../hooks/useNamedVersions.js';
import './NamedVersionPanel.css';

interface NamedVersionPanelProps {
  iModelId: string | null;
  currentChangesetId: string | null;
  isVisible: boolean;
  onClose: () => void;
  /** Called when user requests to rollback to a specific named version */
  onRollback?: (changesetId: string, versionName: string) => Promise<void>;
  /** Called when user wants to compare two named versions */
  onCompareVersions?: (sourceVersion: NamedVersion, targetVersion: NamedVersion) => void;
}


function formatDate(isoString: string, language: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const CreateNamedVersionDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
  isLoading: boolean;
  defaultChangesetId: string | null;
}> = React.memo(({ isOpen, onClose, onCreate, isLoading, defaultChangesetId }) => {
  const { t } = useTranslation('editor');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError(t('namedVersions.createDialog.nameRequired'));
      return;
    }
    if (!defaultChangesetId) {
      setError(t('namedVersions.createDialog.noChangeset'));
      return;
    }

    setError(null);
    try {
      await onCreate(name.trim(), description.trim());
      setName('');
      setDescription('');
      onClose();
    } catch {
      setError(t('namedVersions.createDialog.createFailed'));
    }
  }, [name, description, defaultChangesetId, onCreate, onClose, t]);

  const handleClose = useCallback(() => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={t('namedVersions.createDialog.title')}>
        <Dialog.TitleBar titleText={t('namedVersions.createDialog.title')} />
        <Dialog.Content>
          <div className='nv-dialog-content'>
            <div className='nv-field'>
              <label htmlFor='nv-name'>{t('namedVersions.createDialog.nameLabel')}</label>
              <Input
                id='nv-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namedVersions.createDialog.namePlaceholder')}
                disabled={isLoading}
              />
            </div>

            <div className='nv-field'>
              <label htmlFor='nv-description'>{t('namedVersions.createDialog.descriptionLabel')}</label>
              <textarea
                id='nv-description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('namedVersions.createDialog.descriptionPlaceholder')}
                disabled={isLoading}
                rows={3}
              />
            </div>

            {defaultChangesetId && (
              <div className='nv-info'>
                <span>
                  {t('namedVersions.createDialog.basedOnChangeset', {
                    changesetId: defaultChangesetId.slice(0, 8),
                  })}
                </span>
              </div>
            )}

            {error && <div className='nv-error'>{error}</div>}
          </div>
        </Dialog.Content>

        <Dialog.ButtonBar>
          <Button onClick={handleClose} styleType='default' disabled={isLoading}>
            {t('namedVersions.createDialog.cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            styleType='high-visibility'
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? t('namedVersions.createDialog.creating') : t('namedVersions.createDialog.create')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
});

// Display name for debugging
CreateNamedVersionDialog.displayName = 'CreateNamedVersionDialog';

// eslint-disable-next-line @typescript-eslint/naming-convention
const RollbackConfirmDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
  versionName: string;
  changesetIndex: number;
}> = React.memo(({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  versionName,
  changesetIndex,
}) => {
  const { t } = useTranslation('editor');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('namedVersions.rollbackDialog.rollbackFailed'));
    }
  }, [onConfirm, onClose, t]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={t('namedVersions.rollbackDialog.title')}>
        <Dialog.TitleBar titleText={t('namedVersions.rollbackDialog.title')} />
        <Dialog.Content>
          <div className='nv-dialog-content'>
            <div className='nv-warning-box'>
              <SvgStatusError className="nv-warning-icon" />
              <p>{t('namedVersions.rollbackDialog.question')}</p>
            </div>

            <div className='nv-rollback-info'>
              <div className='nv-rollback-field'>
                <span className='nv-rollback-label'>{t('namedVersions.rollbackDialog.versionName')}</span>
                <span className='nv-rollback-value'>{versionName}</span>
              </div>
              <div className='nv-rollback-field'>
                <span className='nv-rollback-label'>{t('namedVersions.rollbackDialog.changesetIndex')}</span>
                <span className='nv-rollback-value'>#{changesetIndex}</span>
              </div>
            </div>

            <div className='nv-warning-text'>
              <p>{t('namedVersions.rollbackDialog.warning1')}</p>
              <p>{t('namedVersions.rollbackDialog.warning2')}</p>
            </div>

            {error && <div className='nv-error'>{error}</div>}
          </div>
        </Dialog.Content>

        <Dialog.ButtonBar>
          <Button onClick={onClose} styleType='default' disabled={isLoading}>
            {t('namedVersions.rollbackDialog.cancel')}
          </Button>
          <Button onClick={handleConfirm} styleType='high-visibility' disabled={isLoading}>
            {isLoading ? t('namedVersions.rollbackDialog.rollingBack') : t('namedVersions.rollbackDialog.confirm')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
});

// Display name for debugging
RollbackConfirmDialog.displayName = 'RollbackConfirmDialog';

// eslint-disable-next-line @typescript-eslint/naming-convention
const NamedVersionItem: React.FC<{
  version: NamedVersion;
  isCurrent: boolean;
  canRollback: boolean;
  onRollback?: () => void;
  onCompare?: () => void;
}> = React.memo(({ version, isCurrent, canRollback, onRollback, onCompare }) => {
  const { t, i18n } = useTranslation('editor');

  return (
    <div className={`nv-item${isCurrent ? ' nv-item--current' : ''}`}>
      <div className='nv-item-header'>
        <span className='nv-item-name' title={version.name}>
          {version.name}
        </span>
        {isCurrent && <span className='nv-item-badge'>{t('namedVersions.current')}</span>}
      </div>

      {version.description && (
        <div className='nv-item-description' title={version.description}>
          {version.description}
        </div>
      )}

      <div className='nv-item-meta'>
        <span className='nv-item-changeset'>
          {t('namedVersions.changesetIndex', { index: version.changesetIndex })}
        </span>
        <span className='nv-item-date'>{formatDate(version.createdDateTime, i18n.language)}</span>
      </div>

      {version.createdBy && (
        <div className='nv-item-author'>{t('namedVersions.createdBy', { author: version.createdBy })}</div>
      )}

      <div className='nv-item-actions'>
        {onCompare && (
          <button
            type='button'
            className='nv-action-btn nv-compare-btn'
            onClick={onCompare}
            title={t('namedVersions.compareActionTitle')}
          >
            {t('namedVersions.compareAction')}
          </button>
        )}
        {canRollback && onRollback && (
          <button
            type='button'
            className='nv-action-btn nv-rollback-btn'
            onClick={onRollback}
            title={t('namedVersions.rollbackActionTitle')}
          >
            {t('namedVersions.rollbackAction')}
          </button>
        )}
      </div>
    </div>
  );
});

// Display name for debugging
NamedVersionItem.displayName = 'NamedVersionItem';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const NamedVersionPanel: React.FC<NamedVersionPanelProps> = React.memo(({
  iModelId,
  currentChangesetId,
  isVisible,
  onClose,
  onRollback,
  onCompareVersions,
}) => {
  const { t } = useTranslation('editor');
  const { namedVersions, isLoading, error, refetch } = useNamedVersions({
    iModelId: iModelId ?? '',
    enabled: isVisible && !!iModelId,
  });

  const { createNamedVersion, isLoading: isCreating } = useNamedVersionMutations();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<NamedVersion | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSource, setCompareSource] = useState<NamedVersion | null>(null);

  const handleCreate = useCallback(
    async (name: string, description: string) => {
      if (!iModelId || !currentChangesetId) return;

      await createNamedVersion({
        iModelId,
        name,
        description,
        changesetId: currentChangesetId,
      });

      // Refresh list
      await refetch();
    },
    [iModelId, currentChangesetId, createNamedVersion, refetch]
  );

  const handleRollbackClick = useCallback((version: NamedVersion) => {
    setSelectedVersion(version);
    setShowRollbackDialog(true);
  }, []);

  const handleRollbackConfirm = useCallback(async () => {
    if (!selectedVersion || !onRollback) return;
    setIsRollingBack(true);
    try {
      const changesetId = selectedVersion.changesetId;
      const name = selectedVersion.name ?? t('namedVersions.unnamedVersion');
      if (!changesetId) {
        throw new Error(t('namedVersions.invalidChangeset'));
      }
      await onRollback(changesetId, name);
      setShowRollbackDialog(false);
      setSelectedVersion(null);
    } catch {
      // Error handled by parent
    } finally {
      setIsRollingBack(false);
    }
  }, [selectedVersion, onRollback, t]);

  const handleCompareClick = useCallback((version: NamedVersion) => {
    // 无对比渲染器时不得进入 compare mode（终审复检 Important#1：行内入口残留）
    if (!onCompareVersions) return;
    if (!compareMode) {
      // Enter compare mode with this as source
      setCompareMode(true);
      setCompareSource(version);
    } else if (compareSource?.id === version.id) {
      // Cancel compare if clicking same version
      setCompareMode(false);
      setCompareSource(null);
    } else if (onCompareVersions && compareSource) {
      // Compare with target
      onCompareVersions(compareSource, version);
      setCompareMode(false);
      setCompareSource(null);
    }
  }, [compareMode, compareSource, onCompareVersions]);

  if (!isVisible || !iModelId) return null;

  // Sort by created date (newest first)
  const sortedVersions = [...namedVersions].sort(
    (a, b) => new Date(b.createdDateTime).getTime() - new Date(a.createdDateTime).getTime()
  );

  return (
    <div className='nv-panel'>
      <div className='nv-panel-header'>
        <span className='nv-panel-title'>
          {compareMode ? t('namedVersions.selectCompareTarget') : t('namedVersions.title')}
        </span>
        <div className='nv-panel-actions'>
          {compareMode && (
            <button
              type='button'
              className='nv-cancel-compare-btn'
              onClick={() => {
                setCompareMode(false);
                setCompareSource(null);
              }}
            >
              {t('namedVersions.cancelCompare')}
            </button>
          )}
          {!compareMode && (
            <>
              {/* 对比需要调用方提供 onCompareVersions（后台 compareChangesets 未接时
                  不渲染入口，避免假按钮——终审复检 Important#1） */}
              {onCompareVersions && (
                <button
                  type='button'
                  className='nv-compare-toggle-btn'
                  title={t('namedVersions.compareTitle')}
                  onClick={() => setCompareMode(true)}
                >
                  ⚖️
                </button>
              )}
              <button
                type='button'
                className='nv-create-btn'
                title={t('namedVersions.createAction')}
                onClick={() => setShowCreateDialog(true)}
              >
                {t('namedVersions.newAction')}
              </button>
            </>
          )}
          <button
            type='button'
            className='nv-refresh-btn'
            title={t('namedVersions.refresh')}
            onClick={() => void refetch()}
          >
            ↻
          </button>
          <button type='button' className='nv-close-btn' title={t('namedVersions.close')} onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {compareMode && compareSource && (
        <div className='nv-compare-hint'>
          <span>
            <Trans
              t={t}
              i18nKey="namedVersions.sourceVersionHint"
              values={{ name: compareSource.name }}
              components={{ strong: <strong /> }}
            />
          </span>
        </div>
      )}

      <CreateNamedVersionDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreate}
        isLoading={isCreating}
        defaultChangesetId={currentChangesetId}
      />

      <RollbackConfirmDialog
        isOpen={showRollbackDialog}
        onClose={() => {
          setShowRollbackDialog(false);
          setSelectedVersion(null);
        }}
        onConfirm={handleRollbackConfirm}
        isLoading={isRollingBack}
        versionName={selectedVersion?.name ?? ''}
        changesetIndex={selectedVersion?.changesetIndex ?? 0}
      />

      {error && <div className='nv-error'>{error.message}</div>}
      {isLoading && <div className='nv-loading'>{t('namedVersions.loading')}</div>}

      <div className='nv-list'>
        {!isLoading && sortedVersions.length === 0 && (
          <div className='nv-empty'>
            <p>{t('namedVersions.empty')}</p>
            <p className='nv-empty-hint'>{t('namedVersions.emptyHint')}</p>
          </div>
        )}

        {sortedVersions.map((version) => (
          <NamedVersionItem
            key={version.id}
            version={version}
            isCurrent={version.changesetId === currentChangesetId}
            canRollback={version.changesetId !== currentChangesetId && !!onRollback}
            onRollback={() => handleRollbackClick(version)}
            onCompare={onCompareVersions ? () => handleCompareClick(version) : undefined}
          />
        ))}
      </div>
    </div>
  );
});

// Display name for debugging
NamedVersionPanel.displayName = 'NamedVersionPanel';

export default NamedVersionPanel;
