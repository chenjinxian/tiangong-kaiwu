import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBriefcase, useReleaseDialog } from '../hooks/useBriefcase';
import { Alert, Badge, Button, Dialog } from '@itwin/itwinui-react';

interface BriefcaseStatusProps {
  imodelId: string;
  /** Whether current user has edit permission (e.g., owner or editor role) */
  canEdit?: boolean;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function BriefcaseStatus({ imodelId, canEdit: userCanEdit }: BriefcaseStatusProps) {
  const { t } = useTranslation('editor');
  const { briefcase, canEdit: _hasBriefcase, isLoading, acquire, release, isAcquiring, isReleasing } =
    useBriefcase(imodelId, { autoAcquire: userCanEdit });
  const releaseDialog = useReleaseDialog();
  const [changeDescription, setChangeDescription] = useState('');
  const [pushChanges, setPushChanges] = useState(true);

  if (isLoading) {
    return <Badge>{t('briefcase.loading')}</Badge>;
  }

  // No briefcase - show acquire button
  if (!briefcase) {
    return (
      <Button
        onClick={() => acquire()}
        disabled={isAcquiring}
        styleType='high-visibility'
      >
        {isAcquiring ? t('briefcase.acquiring') : t('briefcase.acquire')}
      </Button>
    );
  }

  // Active briefcase - show status and release button
  if (briefcase.status === 'active') {
    return (
      <div className='briefcase-status' style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Badge backgroundColor='#2d8a2d'>
          {userCanEdit ? t('briefcase.ownerEditing') : t('briefcase.editing')}
        </Badge>
        <span style={{ fontSize: '12px', color: '#666' }}>
          {t('briefcase.syncedToChangeset', { index: briefcase.changesetIndex })}
        </span>
        <Button
          onClick={() => releaseDialog.open(false)}
          disabled={isReleasing}
          styleType='default'
          size='small'
        >
          {t('briefcase.release')}
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
  const statusKey = BRIEFCASE_STATUS_KEYS[briefcase.status];
  return <Badge>{statusKey ? t(statusKey) : briefcase.status}</Badge>;
}

const BRIEFCASE_STATUS_KEYS: Record<string, string> = {
  active: 'briefcase.status.active',
  released: 'briefcase.status.released',
  expired: 'briefcase.status.expired',
};

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
  const { t } = useTranslation('editor');
  return (
    <Dialog isOpen={isOpen} onClose={onClose} portal>
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={t('briefcase.releaseDialog.title')}>
        <Dialog.TitleBar titleText={t('briefcase.releaseDialog.title')} />
        <Dialog.Content>
        {hasPendingChanges && (
          <Alert type='informational' style={{ marginBottom: '16px' }}>
            {t('briefcase.releaseDialog.pendingChanges')}
            <label style={{ display: 'flex', alignItems: 'center', marginTop: '8px' }}>
              <input
                type='checkbox'
                checked={pushChanges}
                onChange={(e) => onPushChangesChange(e.target.checked)}
              />
              <span style={{ marginLeft: '8px' }}>{t('briefcase.releaseDialog.pushChanges')}</span>
            </label>
            {pushChanges && (
              <textarea
                value={changeDescription}
                onChange={(e) => onChangeDescriptionChange(e.target.value)}
                placeholder={t('briefcase.releaseDialog.descriptionPlaceholder')}
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

        <p>{t('briefcase.releaseDialog.hint')}</p>
      </Dialog.Content>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button onClick={onClose} styleType='default'>
            {t('briefcase.releaseDialog.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isReleasing || (pushChanges && !changeDescription.trim())}
            styleType='high-visibility'
          >
            {isReleasing ? t('briefcase.releaseDialog.releasing') : t('briefcase.releaseDialog.confirm')}
          </Button>
        </div>
      </Dialog.Main>
    </Dialog>
  );
}

export default BriefcaseStatus;
