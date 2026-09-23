import React, { useState } from 'react';
import {
  Button,
  Dialog,
  InputGroup,
  Label,
  Input,
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateIModelMutation();

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = '请输入模型名称';
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
      <Dialog.Main styleType="default" title="创建 iModel" className="create-dialog">
        <Dialog.TitleBar title="创建 iModel" />
        <Dialog.Content>
          <InputGroup>
            <Label required>模型名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入模型名称"
              disabled={createMutation.isPending}
              status={errors.name ? 'negative' : undefined}
              autoFocus
            />
            {errors.name && (
              <span className="field-error">{errors.name}</span>
            )}
          </InputGroup>

          <InputGroup>
            <Label>描述</Label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder="输入模型描述（可选）"
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
            取消
          </Button>
          <Button
            styleType="high-visibility"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            loading={createMutation.isPending}
          >
            创建
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
};
