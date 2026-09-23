import { useState } from 'react';
import { useBriefcase, useReleaseDialog } from '../hooks/useBriefcase';
import { Alert, Badge, Button, Dialog } from '@itwin/itwinui-react';

interface BriefcaseStatusProps {
  imodelId: string;
  /** Whether current user has edit permission (e.g., owner or editor role) */
  canEdit?: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function BriefcaseStatus({ imodelId, canEdit: userCanEdit }: BriefcaseStatusProps) {
  const { briefcase, canEdit: _hasBriefcase, isLoading, acquire, release, isAcquiring, isReleasing } =
    useBriefcase(imodelId, { autoAcquire: userCanEdit });
  const releaseDialog = useReleaseDialog();
  const [changeDescription, setChangeDescription] = useState('');
  const [pushChanges, setPushChanges] = useState(true);

  if (isLoading) {
    return <Badge>加载中...</Badge>;
  }

  // No briefcase - show acquire button
  if (!briefcase) {
    return (
      <Button
        onClick={() => acquire()}
        disabled={isAcquiring}
        styleType='high-visibility'
      >
        {isAcquiring ? '申请中...' : '申请编辑权限'}
      </Button>
    );
  }

  // Active briefcase - show status and release button
  if (briefcase.status === 'active') {
    return (
      <div className='briefcase-status' style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Badge backgroundColor='#2d8a2d'>{userCanEdit ? '所有者编辑中' : '编辑中'}</Badge>
        <span style={{ fontSize: '12px', color: '#666' }}>
          已同步到 changeset #{briefcase.changesetIndex}
        </span>
        <Button
          onClick={() => releaseDialog.open(false)}
          disabled={isReleasing}
          styleType='default'
          size='small'
        >
          释放编辑权限
        </Button>

        <ReleaseDialog
          isOpen={releaseDialog.isOpen}
          onClose={releaseDialog.close}
          onConfirm={() =>
            release(pushChanges ? { pushChanges: true, changeDescription } : {})
          }
          hasPendingChanges={releaseDialog.hasPendingChanges}
          changeDescription={changeDescription}
          onChangeDescriptionChange={setChangeDescription}
          pushChanges={pushChanges}
          onPushChangesChange={setPushChanges}
          isReleasing={isReleasing}
        />
      </div>
    );
  }

  // Other statuses
  return <Badge>{getStatusText(briefcase.status)}</Badge>;
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    active: '编辑中',
    released: '已释放',
    expired: '已过期',
  };
  return statusMap[status] || status;
}

interface ReleaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  hasPendingChanges: boolean;
  changeDescription: string;
  onChangeDescriptionChange: (value: string) => void;
  pushChanges: boolean;
  onPushChangesChange: (value: boolean) => void;
  isReleasing: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
function ReleaseDialog({
  isOpen,
  onClose,
  onConfirm,
  hasPendingChanges,
  changeDescription,
  onChangeDescriptionChange,
  pushChanges,
  onPushChangesChange,
  isReleasing,
}: ReleaseDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title='释放编辑权限'>
        <Dialog.TitleBar title='释放编辑权限' />
        <Dialog.Content>
        {hasPendingChanges && (
          <Alert type='informational' style={{ marginBottom: '16px' }}>
            您有未推送的本地变更。
            <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
              <input
                type='checkbox'
                checked={pushChanges}
                onChange={(e) => onPushChangesChange(e.target.checked)}
              />
              <span style={{ marginLeft: '8px' }}>推送变更到服务器</span>
            </label>
            {pushChanges && (
              <textarea
                value={changeDescription}
                onChange={(e) => onChangeDescriptionChange(e.target.value)}
                placeholder='描述您做的修改...'
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                }}
                rows={3}
              />
            )}
          </Alert>
        )}

        <p>释放后其他用户可以申请编辑此 iModel。</p>
      </Dialog.Content>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button onClick={onClose} styleType='default'>
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isReleasing || (pushChanges && !changeDescription.trim())}
            styleType='high-visibility'
          >
            {isReleasing ? '释放中...' : '确认释放'}
          </Button>
        </div>
      </Dialog.Main>
    </Dialog>
  );
}

export default BriefcaseStatus;
