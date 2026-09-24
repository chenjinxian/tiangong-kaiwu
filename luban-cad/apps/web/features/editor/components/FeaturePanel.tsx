/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { Button, IconButton, Select, Text, Alert, Dialog, Input, Label } from '@itwin/itwinui-react';
import { SvgAdd, SvgDelete, SvgEdit, SvgVisibilityHalf, SvgChevronUp, SvgChevronDown } from '@itwin/itwinui-icons-react';
import { useFeatures } from '../hooks/useFeatures.js';
import type { CadFeatureRecord } from '@luban-cad/shared';
import './FeaturePanel.css';

interface FeaturePanelProps {
  connection: BriefcaseConnection | null;
  isVisible: boolean;
}

// Feature type names from API - PascalCase
/* eslint-disable @typescript-eslint/naming-convention */
const FEATURE_ICONS: Record<string, string> = {
  Extrude: '⬆',
  Revolve: '↻',
  'Boolean.Unite': '∪',
  'Boolean.Subtract': '\\',
  'Boolean.Intersect': '∩',
  Fillet: '⌒',
  Chamfer: '⌞',
  Shell: '□',
  Manual: '✏',
  /* eslint-enable @typescript-eslint/naming-convention */
};

const FEATURE_OPTIONS = [
  { value: 'Extrude', label: '拉伸 (Extrude)' },
  { value: 'Revolve', label: '旋转 (Revolve)' },
  { value: 'Boolean.Unite', label: '并集 (Unite)' },
  { value: 'Boolean.Subtract', label: '差集 (Subtract)' },
  { value: 'Boolean.Intersect', label: '交集 (Intersect)' },
  { value: 'Fillet', label: '圆角 (Fillet)' },
  { value: 'Chamfer', label: '倒角 (Chamfer)' },
  { value: 'Shell', label: '抽壳 (Shell)' },
  { value: 'Manual', label: '手动 (Manual)' },
];

/**
 * Feature history panel — shows the ordered list of CAD operations on the iModel.
 * Displayed as a right-side panel in edit mode.
 * Optimized with React.memo and useCallback for performance.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const FeaturePanel: React.FC<FeaturePanelProps> = React.memo(({ connection, isVisible }) => {
  const { features, isLoading, error, createFeature, deleteFeature, updateFeature, suppressFeature, reorderFeature, ensureSchema } =
    useFeatures(connection);
  const [newFeatureType, setNewFeatureType] = useState('Manual');
  const [showAdd, setShowAdd] = useState(false);

  // Edit dialog state
  const [editingFeature, setEditingFeature] = useState<CadFeatureRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editParams, setEditParams] = useState('');

  const handleAddFeature = useCallback(async (): Promise<void> => {
    await ensureSchema();
    await createFeature(newFeatureType);
    setShowAdd(false);
  }, [ensureSchema, createFeature, newFeatureType]);

  const handleStartEdit = useCallback((feature: CadFeatureRecord) => {
    setEditingFeature(feature);
    setEditName(feature.featureType);
    setEditParams(feature.params);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingFeature) return;
    await updateFeature(editingFeature.id, {
      featureType: editName,
      params: editParams ? JSON.parse(editParams) : {},
    });
    setEditingFeature(null);
  }, [editingFeature, editName, editParams, updateFeature]);

  const handleToggleSuppress = useCallback(async (feature: CadFeatureRecord) => {
    await suppressFeature(feature.id, !feature.suppressed);
  }, [suppressFeature]);

  const handleMoveUp = useCallback(async (feature: CadFeatureRecord, index: number) => {
    if (index <= 0) return;
    await reorderFeature(feature.id, index - 1);
  }, [reorderFeature]);

  const handleMoveDown = useCallback(async (feature: CadFeatureRecord, index: number) => {
    if (index >= features.length - 1) return;
    await reorderFeature(feature.id, index + 1);
  }, [reorderFeature, features.length]);

  if (!isVisible || !connection) return null;

  return (
    <div className="feature-panel">
      <div className="feature-panel-header">
        <Text variant="title" className="feature-panel-title">特征历史</Text>
        <IconButton
          size="small"
          styleType="borderless"
          label="记录当前操作为特征"
          onClick={() => setShowAdd((v) => !v)}
        >
          <SvgAdd />
        </IconButton>
      </div>

      {showAdd && (
        <div className="feature-panel-add-row">
          <Select
            value={newFeatureType}
            options={FEATURE_OPTIONS}
            onChange={setNewFeatureType}
            size="small"
          />
          <Button
            styleType="high-visibility"
            size="small"
            onClick={() => void handleAddFeature()}
          >
            记录
          </Button>
        </div>
      )}

      {error && <Alert type="negative">{error}</Alert>}

      {isLoading && <Text className="feature-panel-loading">加载中...</Text>}

      <div className="feature-list">
        {features.length === 0 && !isLoading && (
          <Text className="feature-empty">暂无特征记录</Text>
        )}
        {features.map((feature, idx) => (
          <div
            key={feature.id}
            className={`feature-item ${feature.suppressed ? 'suppressed' : ''}`}
          >
            <div className="feature-order-section">
              <Text variant="small" className="feature-order">{idx + 1}</Text>
              <div className="feature-reorder-btns">
                <IconButton
                  size="small"
                  styleType="borderless"
                  label="上移"
                  onClick={() => void handleMoveUp(feature, idx)}
                  disabled={idx === 0}
                >
                  <SvgChevronUp />
                </IconButton>
                <IconButton
                  size="small"
                  styleType="borderless"
                  label="下移"
                  onClick={() => void handleMoveDown(feature, idx)}
                  disabled={idx === features.length - 1}
                >
                  <SvgChevronDown />
                </IconButton>
              </div>
            </div>

            <span className="feature-icon">
              {FEATURE_ICONS[feature.featureType] ?? '◆'}
            </span>

            <div className="feature-info">
              <Text className="feature-type">{feature.featureType}</Text>
              {feature.suppressed && (
                <Text variant="small" className="feature-suppressed-label">已抑制</Text>
              )}
            </div>

            <div className="feature-actions">
              <IconButton
                size="small"
                styleType="borderless"
                label={feature.suppressed ? '取消抑制' : '抑制特征'}
                onClick={() => void handleToggleSuppress(feature)}
              >
                <SvgVisibilityHalf />
              </IconButton>

              <IconButton
                size="small"
                styleType="borderless"
                label="编辑特征"
                onClick={() => handleStartEdit(feature)}
              >
                <SvgEdit />
              </IconButton>

              <IconButton
                size="small"
                styleType="borderless"
                label="删除特征"
                onClick={() => void deleteFeature(feature.id)}
                className="feature-delete-btn"
              >
                <SvgDelete />
              </IconButton>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog
        isOpen={!!editingFeature}
        onClose={() => setEditingFeature(null)}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main styleType="default" title="编辑特征">
          <Dialog.TitleBar title="编辑特征" />
          <Dialog.Content>
            <div className="form-group">
              <Label htmlFor="feature-type">特征类型</Label>
              <Select
                id="feature-type"
                value={editName}
                options={FEATURE_OPTIONS}
                onChange={setEditName}
              />
            </div>
            <div className="form-group">
              <Label htmlFor="feature-params">参数 (JSON)</Label>
              <Input
                id="feature-params"
                value={editParams}
                onChange={(e) => setEditParams(e.target.value)}
                placeholder='{"depth": 10, "direction": "up"}'
              />
            </div>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setEditingFeature(null)}
            >
              取消
            </Button>
            <Button
              styleType="high-visibility"
              onClick={() => void handleSaveEdit()}
            >
              保存
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </div>
  );
});

// Display name for debugging
FeaturePanel.displayName = 'FeaturePanel';

export default FeaturePanel;
