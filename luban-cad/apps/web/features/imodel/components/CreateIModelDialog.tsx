import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  Input,
  InputGroup,
  Label,
} from '@itwin/itwinui-react';
import { useCreateIModelMutation } from '../hooks/useIModelsQuery.js';
import '../../itwin/components/Dialog.css';

interface CreateIModelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  iTwinId: string;
}

/**
 * 创建 iModel 对话框
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CreateIModelDialog: React.FC<CreateIModelDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
  iTwinId,
}) => {
  const { t } = useTranslation('documents');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateIModelMutation();

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = t('imodelDialog.create.nameRequired');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    createMutation.mutate(
      {
        iTwinId,
        name: name.trim(),
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          onCreated?.();
          handleClose();
        },
      }
    );
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setErrors({});
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      portal
      isDismissible
    >
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" title={t('imodelDialog.create.title')} className="create-dialog">
        <Dialog.TitleBar titleText={t('imodelDialog.create.title')} />
        <Dialog.Content>
          <InputGroup>
            <Label required>{t('imodelDialog.create.nameLabel')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('imodelDialog.create.namePlaceholder')}
              disabled={createMutation.isPending}
              status={errors.name ? 'negative' : undefined}
              autoFocus
            />
            {errors.name && (
              <span className="field-error">{errors.name}</span>
            )}
          </InputGroup>

          <InputGroup>
            <Label>{t('imodelDialog.create.descriptionLabel')}</Label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder={t('imodelDialog.create.descriptionPlaceholder')}
              disabled={createMutation.isPending}
              rows={3}
            />
          </InputGroup>
        </Dialog.Content>

        <Dialog.ButtonBar>
          <Button
            styleType="default"
            onClick={handleClose}
            disabled={createMutation.isPending}
          >
            {t('imodelDialog.cancel')}
          </Button>
          <Button
            styleType="high-visibility"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            loading={createMutation.isPending}
          >
            {t('imodelDialog.create.submit')}
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
};
