/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Dialog, IconButton, Label, Select, Text } from '@itwin/itwinui-react';
import { SvgAdd, SvgChevronDown, SvgChevronUp, SvgDelete, SvgEdit, SvgVisibilityHalf } from '@itwin/itwinui-icons-react';
import type { FeatureTreeEntry } from '@luban-cad/shared';
import type { UseFeatureSystem } from '../hooks/useFeatureSystem.js';
import './FeaturePanel.css';

export interface FeaturePanelProps {
  /** 特征系统中枢（M3-a T6.6 hook 产物，由父级注入） */
  fs: UseFeatureSystem;
  /** 编辑入口：点击行内「编辑特征」回调（T6.2 参数面板接管） */
  onEditFeature: (entry: FeatureTreeEntry) => void;
  /** 可选 toast 回调（删除守卫等错误除行内 Alert 外同步上抛） */
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  isVisible?: boolean;
}

/** 特征类型 → 图标（M1：拉伸 + 布尔；M3-a 增 fillet） */
const FEATURE_ICONS: Record<string, string> = {
  extrude: '⬆',
  booleanAdd: '⊕',
  booleanSubtract: '⊖',
  fillet: '⌒',
};

/** 特征类型 → 展示标签（formModel 键集驱动的新建入口共用同一套键） */
const FEATURE_TYPE_LABELS: Record<string, string> = {
  extrude: '拉伸 (extrude)',
  booleanAdd: '布尔加 (booleanAdd)',
  booleanSubtract: '布尔减 (booleanSubtract)',
  fillet: '圆角 (fillet)',
};

/**
 * 特征历史面板（M3-a T6.1）——数据源由旧 IPC CadFeatureRecord 切换为 M1 特征 RPC
 * （useFeatureSystem 注入）。树行 = 图标 + 类型标签 + 失败红点/抑制灰徽标 + 序位号；
 * 行内动作 = 抑制 toggle / 删除（链尾守卫错误 → toast + Alert）/ 上移下移（reorderFeature）。
 * 写租约未持有（leaseOk=false）时整体降级只读。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const FeaturePanel: React.FC<FeaturePanelProps> = React.memo(({ fs, onEditFeature, onToast, isVisible = true }) => {
  const [showNew, setShowNew] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // MS 返回已按 orderKey 排序；防御性再排一次（UI 不假设后端序）
  const sortedTree = useMemo(
    () => [...fs.tree].sort((a, b) => a.orderKey - b.orderKey),
    [fs.tree],
  );

  const readOnly = !fs.leaseOk;

  /** 行内写操作统一出口：租约缺失直接拒（aria-disabled 按钮仍可派发 click，双保险）；成功清错误、失败 Alert + 可选 toast */
  const runOp = useCallback(
    async (op: Parameters<UseFeatureSystem['applyOp']>[0]) => {
      if (!fs.leaseOk) return { ok: false as const, error: '未持有写租约' };
      const result = await fs.applyOp(op);
      if (!result.ok) {
        setActionError(result.error);
        onToast?.(result.error, 'error');
      } else {
        setActionError(null);
      }
      return result;
    },
    [fs, onToast],
  );

  const handleToggleSuppress = useCallback(
    (entry: FeatureTreeEntry) => {
      void runOp({ kind: 'setFeatureSuppressed', featureId: entry.id, suppressed: !entry.suppressed });
    },
    [runOp],
  );

  const handleDelete = useCallback(
    (entry: FeatureTreeEntry) => {
      void runOp({ kind: 'deleteFeature', featureId: entry.id });
    },
    [runOp],
  );

  const handleMove = useCallback(
    (entry: FeatureTreeEntry, delta: -1 | 1) => {
      void runOp({ kind: 'reorderFeature', featureId: entry.id, to: entry.orderKey + delta });
    },
    [runOp],
  );

  if (!isVisible) return null;

  const newFeatureOptions = Object.keys(fs.formModel ?? {}).map((type) => ({
    value: type,
    label: FEATURE_TYPE_LABELS[type] ?? type,
  }));

  return (
    <div className="feature-panel">
      <div className="feature-panel-header">
        <Text variant="title" className="feature-panel-title">特征历史</Text>
        {readOnly && (
          <Text variant="small" className="feature-readonly-hint">只读（未持有写租约）</Text>
        )}
      </div>

      {fs.error && <Alert type="negative">{fs.error}</Alert>}
      {actionError && <Alert type="negative">{actionError}</Alert>}

      {fs.loading && <Text className="feature-panel-loading">加载中...</Text>}

      <div className="feature-list">
        {sortedTree.length === 0 && !fs.loading && (
          <Text className="feature-empty">暂无特征</Text>
        )}
        {sortedTree.map((entry, idx) => {
          const failed = entry.status !== 0;
          const rowClasses = [
            'feature-row',
            entry.suppressed ? 'feature-row--suppressed' : '',
            failed ? 'feature-row--failed' : '',
          ].filter(Boolean).join(' ');
          return (
            <div
              key={entry.id}
              className={rowClasses}
              data-feature-id={entry.id}
            >
              <div className="feature-order-section">
                <Text variant="small" className="feature-order">{entry.orderKey}</Text>
                <div className="feature-reorder-btns">
                  <IconButton
                    size="small"
                    styleType="borderless"
                    label="上移"
                    onClick={() => handleMove(entry, -1)}
                    disabled={readOnly || idx === 0}
                  >
                    <SvgChevronUp />
                  </IconButton>
                  <IconButton
                    size="small"
                    styleType="borderless"
                    label="下移"
                    onClick={() => handleMove(entry, 1)}
                    disabled={readOnly || idx === sortedTree.length - 1}
                  >
                    <SvgChevronDown />
                  </IconButton>
                </div>
              </div>

              <span className="feature-icon">
                {FEATURE_ICONS[entry.featureType] ?? '◆'}
              </span>

              <div className="feature-info">
                <Text className="feature-type">
                  {FEATURE_TYPE_LABELS[entry.featureType] ?? entry.featureType}
                </Text>
                <div className="feature-badges">
                  {entry.suppressed && (
                    <Text variant="small" className="feature-badge feature-badge--suppressed">已抑制</Text>
                  )}
                  {failed && (
                    <span
                      className="feature-badge feature-badge--failed"
                      title="求值失败"
                      aria-label="求值失败"
                    >
                      ●
                    </span>
                  )}
                </div>
              </div>

              <div className="feature-actions">
                <IconButton
                  size="small"
                  styleType="borderless"
                  label={entry.suppressed ? '取消抑制' : '抑制特征'}
                  onClick={() => handleToggleSuppress(entry)}
                  disabled={readOnly}
                >
                  <SvgVisibilityHalf />
                </IconButton>

                <IconButton
                  size="small"
                  styleType="borderless"
                  label="编辑特征"
                  onClick={() => onEditFeature(entry)}
                  disabled={readOnly}
                >
                  <SvgEdit />
                </IconButton>

                <IconButton
                  size="small"
                  styleType="borderless"
                  label="删除特征"
                  onClick={() => handleDelete(entry)}
                  disabled={readOnly}
                  className="feature-delete-btn"
                >
                  <SvgDelete />
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部「新建特征」入口：type 选项 = formModel 键集（参数表单 T6.2 接入） */}
      <div className="feature-panel-footer">
        <Button
          styleType="high-visibility"
          size="small"
          startIcon={<SvgAdd />}
          onClick={() => setShowNew(true)}
          disabled={readOnly}
        >
          新建特征
        </Button>
      </div>

      <Dialog
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main styleType="default">
          <Dialog.TitleBar titleText="新建特征" />
          <Dialog.Content>
            {fs.formModel ? (
              <div className="form-group">
                <Label htmlFor="feature-new-type">特征类型</Label>
                <Select
                  native
                  id="feature-new-type"
                  value=""
                  placeholder="选择特征类型"
                  options={newFeatureOptions}
                  onChange={() => {
                    // 参数表单 + 创建动作随 T6.2（参数面板）接入；当前版本仅提供类型预览
                  }}
                  size="small"
                />
              </div>
            ) : (
              <Text className="feature-formmodel-loading">表单模型加载中...</Text>
            )}
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setShowNew(false)}
            >
              取消
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
