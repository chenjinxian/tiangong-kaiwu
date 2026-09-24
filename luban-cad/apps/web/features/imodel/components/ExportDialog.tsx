/**-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  Button,
  Select,
  SelectOption,
  ProgressRadial,
  Text,
  Label,
  Alert,
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
      setError('无效的 iModel ID');
      return;
    }

    setIsExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const rpc = OpenCloudRpcInterface.getClient();
      const data = await rpc.exportIModel(iModelId, format);

      if (!data || data.length === 0) {
        throw new Error('导出失败：没有数据返回');
      }

      const baseName = iModelName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${baseName}${FORMAT_EXTENSIONS[format]}`;

      // Download the file
      downloadFile(data, fileName, getMimeType());

      setSuccess(`成功导出 ${format} 格式，文件大小: ${(data.length / 1024).toFixed(2)} KB`);

      if (onExport) {
        onExport(format, fileName);
      }

      // Close dialog after a short delay
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      console.error('[ExportDialog] Export failed:', err);
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  }, [iModelId, iModelName, format, downloadFile, handleClose, onExport]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="导出模型"
      isDismissible={!isExporting}
    >
      <div className="create-imodel-form">
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
          <Label htmlFor="export-format">导出格式</Label>
          <Select
            id="export-format"
            options={EXPORT_FORMATS}
            value={format}
            onChange={(value) => setFormat(value as ExportFormat)}
            disabled={isExporting}
          />
        </div>

        <div className="form-field">
          <Text variant="small" style={{ color: '#666' }}>
            模型: <strong>{iModelName}</strong>
          </Text>
        </div>

        <div className="form-field">
          <Text variant="small" style={{ color: '#666' }}>
            将导出为 {FORMAT_EXTENSIONS[format]} 格式文件，导出完成后会自动下载。
          </Text>
        </div>

        {isExporting && (
          <div className="form-field" style={{ textAlign: 'center', padding: '20px' }}>
            <ProgressRadial size="large" indeterminate />
            <Text variant="small" style={{ marginTop: '12px', display: 'block' }}>
              正在导出 {format} 格式...
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
          取消
        </Button>
        <Button
          styleType="high-visibility"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? '导出中...' : '导出'}
        </Button>
      </div>
    </Dialog>
  );
};

export default ExportDialog;
