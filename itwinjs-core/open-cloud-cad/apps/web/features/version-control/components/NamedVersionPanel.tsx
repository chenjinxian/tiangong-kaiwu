/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
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

 
function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setError('请输入版本名称');
      return;
    }
    if (!defaultChangesetId) {
      setError('当前没有可标记的变更版本');
      return;
    }

    setError(null);
    try {
      await onCreate(name.trim(), description.trim());
      setName('');
      setDescription('');
      onClose();
    } catch {
      setError('创建失败，请重试');
    }
  }, [name, description, defaultChangesetId, onCreate, onClose]);

  const handleClose = useCallback(() => {
    setName('');
    setDescription('');
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title='创建命名版本'>
        <Dialog.TitleBar title='创建命名版本' />
        <Dialog.Content>
          <div className='nv-dialog-content'>
            <div className='nv-field'>
              <label htmlFor='nv-name'>版本名称 *</label>
              <Input
                id='nv-name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='例如：设计评审 V1'
                disabled={isLoading}
              />
            </div>

            <div className='nv-field'>
              <label htmlFor='nv-description'>描述</label>
              <textarea
                id='nv-description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='描述此版本的内容或变更...'
                disabled={isLoading}
                rows={3}
              />
            </div>

            {defaultChangesetId && (
              <div className='nv-info'>
                <span>将基于当前变更集创建: {defaultChangesetId.slice(0, 8)}...</span>
              </div>
            )}

            {error && <div className='nv-error'>{error}</div>}
          </div>
        </Dialog.Content>

        <Dialog.ButtonBar>
          <Button onClick={handleClose} styleType='default' disabled={isLoading}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            styleType='high-visibility'
            disabled={isLoading || !name.trim()}
          >
            {isLoading ? '创建中...' : '创建'}
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
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '回滚失败');
    }
  }, [onConfirm, onClose]);

  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title='确认回滚'>
        <Dialog.TitleBar title='确认回滚' />
        <Dialog.Content>
          <div className='nv-dialog-content'>
            <div className='nv-warning-box'>
              <SvgStatusError className="nv-warning-icon" />
              <p>确定要回滚到以下版本吗？</p>
            </div>

            <div className='nv-rollback-info'>
              <div className='nv-rollback-field'>
                <span className='nv-rollback-label'>版本名称：</span>
                <span className='nv-rollback-value'>{versionName}</span>
              </div>
              <div className='nv-rollback-field'>
                <span className='nv-rollback-label'>变更集索引：</span>
                <span className='nv-rollback-value'>#{changesetIndex}</span>
              </div>
            </div>

            <div className='nv-warning-text'>
              <p>警告：回滚操作会丢弃当前变更集之后的所有本地变更。</p>
              <p>建议先创建当前版本的命名版本作为备份。</p>
            </div>

            {error && <div className='nv-error'>{error}</div>}
          </div>
        </Dialog.Content>

        <Dialog.ButtonBar>
          <Button onClick={onClose} styleType='default' disabled={isLoading}>
            取消
          </Button>
          <Button onClick={handleConfirm} styleType='high-visibility' disabled={isLoading}>
            {isLoading ? '回滚中...' : '确认回滚'}
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
  return (
    <div className={`nv-item${isCurrent ? ' nv-item--current' : ''}`}>
      <div className='nv-item-header'>
        <span className='nv-item-name' title={version.name}>
          {version.name}
        </span>
        {isCurrent && <span className='nv-item-badge'>当前</span>}
      </div>

      {version.description && (
        <div className='nv-item-description' title={version.description}>
          {version.description}
        </div>
      )}

      <div className='nv-item-meta'>
        <span className='nv-item-changeset'>变更集 #{version.changesetIndex}</span>
        <span className='nv-item-date'>{formatDate(version.createdDateTime)}</span>
      </div>

      {version.createdBy && (
        <div className='nv-item-author'>由 {version.createdBy} 创建</div>
      )}

      <div className='nv-item-actions'>
        {onCompare && (
          <button
            type='button'
            className='nv-action-btn nv-compare-btn'
            onClick={onCompare}
            title='对比此版本'
          >
            ⚖️ 对比
          </button>
        )}
        {canRollback && onRollback && (
          <button
            type='button'
            className='nv-action-btn nv-rollback-btn'
            onClick={onRollback}
            title='回滚到此版本'
          >
            ↩ 回滚
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
      const name = selectedVersion.name ?? '未命名版本';
      if (!changesetId) {
        throw new Error('无效的变更集ID');
      }
      await onRollback(changesetId, name);
      setShowRollbackDialog(false);
      setSelectedVersion(null);
    } catch {
      // Error handled by parent
    } finally {
      setIsRollingBack(false);
    }
  }, [selectedVersion, onRollback]);

  const handleCompareClick = useCallback((version: NamedVersion) => {
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
          {compareMode ? '选择对比目标版本' : '命名版本'}
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
              取消对比
            </button>
          )}
          {!compareMode && (
            <>
              <button
                type='button'
                className='nv-compare-toggle-btn'
                title='对比版本'
                onClick={() => setCompareMode(true)}
              >
                ⚖️
              </button>
              <button
                type='button'
                className='nv-create-btn'
                title='创建命名版本'
                onClick={() => setShowCreateDialog(true)}
              >
                + 新建
              </button>
            </>
          )}
          <button
            type='button'
            className='nv-refresh-btn'
            title='刷新'
            onClick={() => void refetch()}
          >
            ↻
          </button>
          <button type='button' className='nv-close-btn' title='关闭' onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {compareMode && compareSource && (
        <div className='nv-compare-hint'>
          <span>源版本: <strong>{compareSource.name}</strong>，点击另一个版本进行对比</span>
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
      {isLoading && <div className='nv-loading'>加载中...</div>}

      <div className='nv-list'>
        {!isLoading && sortedVersions.length === 0 && (
          <div className='nv-empty'>
            <p>暂无命名版本</p>
            <p className='nv-empty-hint'>为重要里程碑创建命名版本以便追踪</p>
          </div>
        )}

        {sortedVersions.map((version) => (
          <NamedVersionItem
            key={version.id}
            version={version}
            isCurrent={version.changesetId === currentChangesetId}
            canRollback={version.changesetId !== currentChangesetId && !!onRollback}
            onRollback={() => handleRollbackClick(version)}
            onCompare={() => handleCompareClick(version)}
          />
        ))}
      </div>
    </div>
  );
});

// Display name for debugging
NamedVersionPanel.displayName = 'NamedVersionPanel';

export default NamedVersionPanel;
