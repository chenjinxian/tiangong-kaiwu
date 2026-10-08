/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Dialog, IconButton, Label, Select, Text } from '@itwin/itwinui-react';
import { SvgAdd, SvgChevronDown, SvgChevronUp, SvgDelete, SvgEdit, SvgVisibilityHalf } from '@itwin/itwinui-icons-react';
import type { FeatureFormField, FeatureParams, FeatureTreeEntry, FilletEdgeRef, LubanFeatureType } from '@luban-cad/shared';
import { FeatureParamForm } from './FeatureParamForm.js';
import type { UseFeatureSystem } from '../hooks/useFeatureSystem.js';
import './FeaturePanel.css';

export interface FeaturePanelProps {
  /** 特征系统中枢（M3-a T6.6 hook 产物，由父级注入） */
  fs: UseFeatureSystem;
  /** 编辑点击通知（可选；T6.2 起编辑对话框内建于本面板，参数表单 + 应用自理） */
  onEditFeature?: (entry: FeatureTreeEntry) => void;
  /** 可选 toast 回调（删除守卫等错误除行内 Alert 外同步上抛；创建/编辑成功亦回报） */
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

/** 后端 FeatureTreeEntry.params 为 unknown（早期为 JSON 字符串；现 getTree 已 parse）——
 *  编辑预填宽容归一：字符串先 parse，非对象兜底 {}，边引用数组消毒。 */
function parseStoredParams(raw: unknown): Record<string, unknown> {
  let obj: unknown = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return {};
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
  return obj as Record<string, unknown>;
}

function isEdgeRef(v: unknown): v is FilletEdgeRef {
  if (typeof v !== 'object' || v === null) return false;
  const { faceA, faceB } = v as { faceA?: unknown; faceB?: unknown };
  const isTopo = (t: unknown): t is { nodeId: number; entityId: number } =>
    typeof t === 'object' && t !== null &&
    typeof (t as { nodeId?: unknown }).nodeId === 'number' &&
    typeof (t as { entityId?: unknown }).entityId === 'number';
  return isTopo(faceA) && isTopo(faceB);
}

function parseStoredEdges(raw: unknown): FilletEdgeRef[] {
  let obj: unknown = raw;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return [];
    }
  }
  return Array.isArray(obj) ? obj.filter(isEdgeRef) : [];
}

/** 按表单模型字段集从存储 params 归一出表单初值（缺省补字段类型零值，冗余项丢弃）。
 *  只读文本字段（sketchId 等）存储缺失时整体省略——否则外发 params 携带 sketchId:"" 会被后端
 *  「内联特征不支持挂接草图」对称守卫误拒；存储存在时原样回传（草图驱动特征守卫要求 op 携带相同 sketchId）。 */
function buildInitialValue(fields: FeatureFormField[], params: Record<string, unknown>): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'edgeRefs') {
      value[f.name] = parseStoredEdges(params[f.name]);
    } else if (f.name in params) {
      value[f.name] = params[f.name];
    } else if (f.kind === 'number') {
      value[f.name] = 0;
    } else if (f.kind === 'boolean') {
      value[f.name] = false;
    } else if (f.kind === 'json') {
      value[f.name] = f.name === 'profile' ? [] : null;
    } else if (f.kind === 'readonlyText') {
      // 存储缺失 → 省略键（见上）；表单渲染端 undefined 回显为空串
    } else {
      value[f.name] = '';
    }
  }
  return value;
}

/**
 * 特征历史面板（M3-a T6.1）——数据源由旧 IPC CadFeatureRecord 切换为 M1 特征 RPC
 * （useFeatureSystem 注入）。树行 = 图标 + 类型标签 + 失败红点/抑制灰徽标 + 序位号；
 * 行内动作 = 抑制 toggle / 删除（链尾守卫错误 → toast + Alert）/ 上移下移（reorderFeature）/
 * 编辑（T6.2 起对话框内 FeatureParamForm 参数面板，updateParams 应用 + 守卫错误 Alert 呈现）。
 * 写租约未持有（leaseOk=false）时整体降级只读。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const FeaturePanel: React.FC<FeaturePanelProps> = React.memo(({ fs, onEditFeature, onToast, isVisible = true }) => {
  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FeatureTreeEntry | null>(null);
  const [formValue, setFormValue] = useState<Record<string, unknown>>({});
  /** 对话框内应用失败（守卫/校验文案）——M2-UX 债 #4：错误必须在表单顶部 Alert 可见 */
  const [dialogError, setDialogError] = useState<string | null>(null);
  /** 应用进行中（防重复提交；op 为同步+短事务，失败不 stuck） */
  const [applying, setApplying] = useState(false);

  // MS 返回已按 orderKey 排序；防御性再排一次（UI 不假设后端序）
  const sortedTree = useMemo(
    () => [...fs.tree].sort((a, b) => a.orderKey - b.orderKey),
    [fs.tree],
  );

  const readOnly = !fs.leaseOk;

  /** 树区行内写操作统一出口：租约缺失直接拒（aria-disabled 按钮仍可派发 click，双保险）；成功清错误、失败 Alert + 可选 toast */
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

  /** 编辑入口：打开参数对话框 + 预填（formModel 字段驱动；entry.params 宽容归一） */
  const handleEdit = useCallback(
    (entry: FeatureTreeEntry) => {
      onEditFeature?.(entry); // 兼容通知（外部观察/埋点）；面板自身接管编辑流
      setEditing(entry);
      setDialogError(null);
      const fields = fs.formModel?.[entry.featureType]?.fields ?? [];
      setFormValue(buildInitialValue(fields, parseStoredParams(entry.params)));
    },
    [fs.formModel, onEditFeature],
  );

  const closeEdit = useCallback(() => {
    setEditing(null);
    setDialogError(null);
  }, []);

  /** 对话框应用统一出口：成功关闭 + toast；失败 Alert 呈现后端守卫/校验文案（M2-UX #4）；
   *  RPC 层抛错（后端失联等）同样落入 Alert —— 绝不留「点了没反应」的哑对话框 */
  const applyFromDialog = useCallback(
    async (op: Parameters<UseFeatureSystem['applyOp']>[0], successMessage: string) => {
      if (!fs.leaseOk) {
        setDialogError('未持有写租约');
        return;
      }
      setApplying(true);
      try {
        const result = await fs.applyOp(op);
        if (result.ok) {
          setDialogError(null);
          setEditing(null);
          setShowNew(false);
          setNewType(undefined);
          onToast?.(successMessage, 'success');
        } else {
          setDialogError(result.error);
        }
      } catch (err) {
        setDialogError(err instanceof Error ? err.message : String(err));
      } finally {
        setApplying(false);
      }
    },
    [fs, onToast],
  );

  const handleApplyEdit = useCallback(() => {
    if (!editing) return;
    void applyFromDialog(
      { kind: 'updateParams', featureId: editing.id, params: formValue as unknown as FeatureParams },
      '特征参数已更新',
    );
  }, [applyFromDialog, editing, formValue]);

  const handleCreate = useCallback(() => {
    if (!newType) return;
    void applyFromDialog(
      { kind: 'insertFeature', featureType: newType as LubanFeatureType, params: formValue as unknown as FeatureParams },
      '特征已创建',
    );
  }, [applyFromDialog, newType, formValue]);

  const handleNewTypeChange = useCallback(
    (type: string) => {
      setNewType(type);
      setDialogError(null);
      const fields = fs.formModel?.[type]?.fields ?? [];
      // 初值不预填既有参数（新建场景无存储值）：仅补零值，草图 id 等留空由用户/后续流程填
      setFormValue(buildInitialValue(fields, {}));
    },
    [fs.formModel],
  );

  const closeNew = useCallback(() => {
    setShowNew(false);
    setNewType(undefined);
    setDialogError(null);
  }, []);

  if (!isVisible) return null;

  const newFeatureOptions = Object.keys(fs.formModel ?? {}).map((type) => ({
    value: type,
    label: FEATURE_TYPE_LABELS[type] ?? type,
  }));

  const editingFields = editing ? (fs.formModel?.[editing.featureType]?.fields ?? []) : [];
  const editingLabel = editing ? (FEATURE_TYPE_LABELS[editing.featureType] ?? editing.featureType) : '';
  const newFields = newType ? (fs.formModel?.[newType]?.fields ?? []) : [];

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
                  onClick={() => handleEdit(entry)}
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

      {/* 底部「新建特征」入口：type 选项 = formModel 键集；选定类型后渲染参数表单（T6.2） */}
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

      {/* 新建特征对话框：类型 Select + 表单模型参数表单 → insertFeature（守卫错误 Alert 呈现） */}
      <Dialog
        isOpen={showNew}
        onClose={closeNew}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main styleType="default">
          <Dialog.TitleBar titleText="新建特征" />
          <Dialog.Content>
            {fs.formModel ? (
              <>
                <div className="form-group">
                  <Label htmlFor="feature-new-type">特征类型</Label>
                  <Select
                    native
                    id="feature-new-type"
                    value={newType ?? ''}
                    placeholder="选择特征类型"
                    options={newFeatureOptions}
                    onChange={handleNewTypeChange}
                    size="small"
                  />
                </div>
                {newType && (
                  <FeatureParamForm
                    key={`new-${newType}`}
                    fields={newFields}
                    value={formValue}
                    onChange={setFormValue}
                    disabled={readOnly || applying}
                  />
                )}
              </>
            ) : (
              <Text className="feature-formmodel-loading">表单模型加载中...</Text>
            )}
            {dialogError && (
              <Alert type="negative" className="feature-dialog-error">{dialogError}</Alert>
            )}
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={closeNew}
            >
              取消
            </Button>
            <Button
              styleType="high-visibility"
              onClick={handleCreate}
              disabled={!newType || readOnly || applying}
            >
              创建
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* 编辑特征对话框：表单模型参数表单预填 entry.params → updateParams */}
      <Dialog
        isOpen={editing !== null}
        onClose={closeEdit}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main styleType="default">
          <Dialog.TitleBar titleText={`编辑特征：${editingLabel}`} />
          <Dialog.Content>
            {editing && (
              <FeatureParamForm
                key={`edit-${editing.id}`}
                fields={editingFields}
                value={formValue}
                onChange={setFormValue}
                disabled={readOnly || applying}
              />
            )}
            {dialogError && (
              <Alert type="negative" className="feature-dialog-error">{dialogError}</Alert>
            )}
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={closeEdit}
            >
              取消
            </Button>
            <Button
              styleType="high-visibility"
              onClick={handleApplyEdit}
              disabled={!editing || readOnly || applying}
            >
              应用
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
