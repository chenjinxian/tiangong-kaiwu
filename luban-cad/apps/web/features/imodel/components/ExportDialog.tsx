/**-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Dialog,
  Label,
  ProgressRadial,
  Select,
  SelectOption,
  Text,
} from '@itwin/itwinui-react';
import { OpenCloudRpcInterface } from '@luban-cad/shared';
import './CreateIModelWorkflow.css'; // Reuse dialog styles

interface ExportDialogProps {
  isOpen: boolean;
  iModelId: string;
  iModelName: string;
  onClose: () => void;
  onExport?: (format: string, fileName: string) => void;
}

type ExportFormat = 'GLTF';

const EXPORT_FORMATS: SelectOption<ExportFormat>[] = [
  { value: 'GLTF', label: 'glTF (.gltf) - GL Transmission Format' },
];

const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  GLTF: '.gltf',
};

/**
 * ExportDialog - Dialog for exporting iModel to various formats
 */
export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  iModelId,
  iModelName,
  onClose,
  onExport,
}) => {
  const { t } = useTranslation('editor');
  const [format, setFormat] = useState<ExportFormat>('GLTF');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (!isExporting) {
      setError(null);
      setSuccess(null);
      onClose();
    }
  }, [isExporting, onClose]);

  const downloadFile = useCallback((data: Uint8Array, fileName: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, []);

  const getMimeType = (): string => {
    return 'model/gltf+json';
  };

  const handleExport = useCallback(async () => {
    if (!iModelId) {
      setError(t('exportDialog.invalidIModelId'));
      return;
    }

    setIsExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const rpc = OpenCloudRpcInterface.getClient();
      const data = await rpc.exportIModel(iModelId, format);

      if (!data || data.length === 0) {
        throw new Error(t('exportDialog.noData'));
      }

      const baseName = iModelName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${baseName}${FORMAT_EXTENSIONS[format]}`;

      // Download the file
      downloadFile(data, fileName, getMimeType());

      setSuccess(t('exportDialog.success', {
        format,
        size: (data.length / 1024).toFixed(2),
      }));

      if (onExport) {
        onExport(format, fileName);
      }

      // Close dialog after a short delay
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      console.error('[ExportDialog] Export failed:', err);
      setError(err instanceof Error ? err.message : t('exportDialog.failed'));
    } finally {
      setIsExporting(false);
    }
  }, [iModelId, iModelName, format, downloadFile, handleClose, onExport, t]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      aria-label={t('exportDialog.title')}
      isDismissible={!isExporting}
    >
      <div className="create-imodel-form">
        <Text variant="headline" as="h3" className="tool-dialog-title">
          {t('exportDialog.title')}
        </Text>
        {error && (
          <Alert type="negative" className="form-alert">
            {error}
          </Alert>
        )}

        {success && (
          <Alert type="positive" className="form-alert">
            {success}
          </Alert>
        )}

        <div className="form-field">
          <Label htmlFor="export-format">{t('exportDialog.formatLabel')}</Label>
          <Select
            id="export-format"
            options={EXPORT_FORMATS}
            value={format}
            onChange={(value) => setFormat(value)}
            disabled={isExporting}
          />
        </div>

        <div className="form-field">
          <Text variant="small" style={{ color: '#666' }}>
            {t('exportDialog.model')} <strong>{iModelName}</strong>
          </Text>
        </div>

        <div className="form-field">
          <Text variant="small" style={{ color: '#666' }}>
            {t('exportDialog.formatHint', { extension: FORMAT_EXTENSIONS[format] })}
          </Text>
        </div>

        {isExporting && (
          <div className="form-field" style={{ textAlign: 'center', padding: '20px' }}>
            <ProgressRadial size="large" indeterminate />
            <Text variant="small" style={{ marginTop: '12px', display: 'block' }}>
              {t('exportDialog.exporting', { format })}
            </Text>
          </div>
        )}
      </div>

      <div className="dialog-actions">
        <Button
          styleType="default"
          onClick={handleClose}
          disabled={isExporting}
        >
          {t('exportDialog.cancel')}
        </Button>
        <Button
          styleType="high-visibility"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? t('exportDialog.exportingButton') : t('exportDialog.export')}
        </Button>
      </div>
    </Dialog>
  );
};

export default ExportDialog;
