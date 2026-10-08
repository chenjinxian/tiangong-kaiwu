/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Dialog, IconButton, Label, Select, Text } from '@itwin/itwinui-react';
import { SvgAdd, SvgChevronDown, SvgChevronUp, SvgDelete, SvgEdit, SvgVisibilityHalf } from '@itwin/itwinui-icons-react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import type { FeatureFormField, FeatureParams, FeatureTreeEntry, FilletEdgeRef, LubanFeatureType } from '@luban-cad/shared';
import { FeatureParamForm } from './FeatureParamForm.js';
import type { UseFeatureSystem } from '../hooks/useFeatureSystem.js';
import { useEdgeRefPicker } from '../hooks/useEdgeRefPicker.js';
import './FeaturePanel.css';

export interface FeaturePanelProps {
  /** 特征系统中枢（M3-a T6.6 hook 产物，由父级注入） */
  fs: UseFeatureSystem;
  /** T6.3：视口选边拾取器需要的连接（缺省/ null → 拾取按钮禁用） */
  connection?: BriefcaseConnection | null;
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

/** T6.4 试算预览 debounce 窗口（草稿停笔 400ms 后才发 previewOp，折叠连续击键） */
const PREVIEW_DEBOUNCE_MS = 400;

/** 编辑对话框试算徽标态：ok + 受影响特征数 / 失败文案（previewOp 不可用 = null，无徽标不挡应用） */
interface PreviewBadgeState {
  ok: boolean;
  error?: string;
  affectedCount: number;
}

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
export const FeaturePanel: React.FC<FeaturePanelProps> = React.memo(({ fs, connection, onEditFeature, onToast, isVisible = true }) => {
  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FeatureTreeEntry | null>(null);
  const [formValue, setFormValue] = useState<Record<string, unknown>>({});
  /** 对话框内应用失败（守卫/校验文案）——M2-UX 债 #4：错误必须在表单顶部 Alert 可见 */
  const [dialogError, setDialogError] = useState<string | null>(null);
  /** 应用进行中（防重复提交；op 为同步+短事务，失败不 stuck） */
  const [applying, setApplying] = useState(false);
  /** T6.4 试算徽标态（仅编辑对话框；null = 无徽标：未试算 / RPC 不可用 / 草稿回退存储值） */
  const [preview, setPreview] = useState<PreviewBadgeState | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 试算序号：每次草稿变更 +1，决议时比对——乱序返回的旧结果不得覆盖新徽标（last-call-wins） */
  const previewSeqRef = useRef(0);
  /** 编辑打开时的存储参数快照（JSON 串）：草稿与之相等 = 无实际变更 → 不试算、清徽标 */
  const editBaselineJsonRef = useRef<string | null>(null);

  // MS 返回已按 orderKey 排序；防御性再排一次（UI 不假设后端序）
  const sortedTree = useMemo(
    () => [...fs.tree].sort((a, b) => a.orderKey - b.orderKey),
    [fs.tree],
  );

  const readOnly = !fs.leaseOk;

  /** 当前活动对话框的字段集（新建/编辑对话框互斥；皆无 → 空） */
  const activeDialogFields = editing
    ? (fs.formModel?.[editing.featureType]?.fields ?? [])
    : newType
      ? (fs.formModel?.[newType]?.fields ?? [])
      : [];
  /** edgeRefs kind 字段名（fillet=edges；无该 kind 的类型无拾取器） */
  const edgeFieldName = activeDialogFields.find((f) => f.kind === 'edgeRefs')?.name;
  const pickerEdges =
    edgeFieldName !== undefined && Array.isArray(formValue[edgeFieldName])
      ? (formValue[edgeFieldName] as FilletEdgeRef[])
      : [];
  /** T6.3 选边拾取器：ref 单一事实源=formValue[edgeFieldName]（onEdgesChange 回写表单态） */
  const picker = useEdgeRefPicker(connection ?? undefined, fs, {
    edges: pickerEdges,
    onEdgesChange: (next) => {
      if (edgeFieldName === undefined) return;
      setFormValue((prev) => ({ ...prev, [edgeFieldName]: next }));
    },
    onError: (message) => onToast?.(message, 'error'),
  });
  const stopPicking = picker.stop;

  /**
   * T6.4 试算预览管道（仅编辑对话框）：草稿变更 → 400ms debounce → previewOp(updateParams) → 徽标。
   * - 打开/草稿回退存储值（与基线快照 JSON 相等）→ 不试算并清徽标（无打开即预览的垃圾请求）；
   * - last-call-wins：每次变更递增序号，决议时旧序号直接丢弃（防抖只会压缩请求，防的是
   *   RPC 往返乱序——慢请求后至覆盖新结果）；
   * - previewOp 不可用（undefined）/ 抛错 → 无徽标、应用不挡（优雅降级，反馈级口径）。
   */
  useEffect(() => {
    if (!editing) return;
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    const seq = ++previewSeqRef.current; // 先占位序号：草稿回退基线时，在途的中间草稿试算结果一并作废
    if (JSON.stringify(formValue) === editBaselineJsonRef.current) {
      setPreview(null);
      return;
    }
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      void (async () => {
        let result: { ok: boolean; error?: string; affected: Array<{ featureId: string; status: number }> } | undefined;
        try {
          result = await fs.previewOp({
            kind: 'updateParams',
            featureId: editing.id,
            params: formValue as unknown as FeatureParams,
          });
        } catch {
          result = undefined; // RPC 层异常等同不可用 → 不挡应用
        }
        if (seq !== previewSeqRef.current) return; // 乱序守卫：仅最后一次草稿的试算生效
        setPreview(
          result === undefined
            ? null
            : { ok: result.ok, error: result.error, affectedCount: result.affected.length },
        );
      })();
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [editing, formValue, fs]);

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
      setPreview(null);
      const fields = fs.formModel?.[entry.featureType]?.fields ?? [];
      const initial = buildInitialValue(fields, parseStoredParams(entry.params));
      editBaselineJsonRef.current = JSON.stringify(initial);
      setFormValue(initial);
    },
    [fs.formModel, onEditFeature],
  );

  const closeEdit = useCallback(() => {
    stopPicking(); // 对话框关闭中途拾取 → 退场回收（三通道纪律）
    setEditing(null);
    setDialogError(null);
    setPreview(null); // 试算徽标随对话框退场清零（取消不留状态）
  }, [stopPicking]);

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
          setPreview(null); // 试算徽标随对话框关闭清零
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

  /** T6.4 预览失败时的强制应用（「仍要应用」）：防引用失效等误操作锁死用户——守卫文案已由徽标呈现，确认权交还用户 */
  const handleForceApplyEdit = useCallback(() => {
    if (!editing || preview?.ok !== false) return;
    void applyFromDialog(
      { kind: 'updateParams', featureId: editing.id, params: formValue as unknown as FeatureParams },
      '特征参数已更新',
    );
  }, [applyFromDialog, editing, preview, formValue]);

  const handleCreate = useCallback(() => {
    if (!newType) return;
    void applyFromDialog(
      { kind: 'insertFeature', featureType: newType as LubanFeatureType, params: formValue as unknown as FeatureParams },
      '特征已创建',
    );
  }, [applyFromDialog, newType, formValue]);

  const handleNewTypeChange = useCallback(
    (type: string) => {
      stopPicking(); // 类型切换中途拾取 → 退场回收
      setNewType(type);
      setDialogError(null);
      const fields = fs.formModel?.[type]?.fields ?? [];
      // 初值不预填既有参数（新建场景无存储值）：仅补零值，草图 id 等留空由用户/后续流程填
      setFormValue(buildInitialValue(fields, {}));
    },
    [fs.formModel, stopPicking],
  );

  const closeNew = useCallback(() => {
    stopPicking(); // 对话框关闭中途拾取 → 退场回收
    setShowNew(false);
    setNewType(undefined);
    setDialogError(null);
  }, [stopPicking]);

  if (!isVisible) return null;

  const newFeatureOptions = Object.keys(fs.formModel ?? {}).map((type) => ({
    value: type,
    label: FEATURE_TYPE_LABELS[type] ?? type,
  }));

  const editingFields = editing ? (fs.formModel?.[editing.featureType]?.fields ?? []) : [];
  const editingLabel = editing ? (FEATURE_TYPE_LABELS[editing.featureType] ?? editing.featureType) : '';
  /** T6.4：试算失败 → 主「应用」禁用 + 呈现「仍要应用」强制出口 */
  const previewFailed = preview !== null && !preview.ok;
  const newFields = newType ? (fs.formModel?.[newType]?.fields ?? []) : [];

  /** edgeRefs kind 字段的拾取器插槽（T6.3）：仅含该 kind 的表单（fillet）注入「从视图选边」 */
  const renderEdgePickerSlot = (fields: FeatureFormField[]): React.ReactNode => {
    if (!fields.some((f) => f.kind === 'edgeRefs')) return undefined;
    return (
      <div className="feature-edge-picker" data-testid="feature-edge-picker">
        <Button
          size="small"
          styleType="borderless"
          onClick={() => (picker.picking ? picker.stop() : picker.start())}
          disabled={readOnly || applying || !connection}
        >
          {picker.picking ? '停止选边' : '从视图选边'}
        </Button>
      </div>
    );
  };

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

      {/* 选边拾取中浮条（T6.3）：模态对话框的 backdrop 会吞掉视口点击——拾取期间对话框暂隐
         （表单态在面板层，remount 不丢；fillet 表单无 json 字段，无失焦草稿风险），
         拾取结束（右键/Esc/停止）后对话框自动复开，chips 已更新 */}
      {picker.picking && (
        <div className="feature-edge-picker-banner" data-testid="edge-picker-banner">
          <Text variant="small">正在选边：在视口点击边加入引用；右键/Esc 结束</Text>
          <Button size="small" styleType="borderless" onClick={() => picker.stop()}>
            停止选边
          </Button>
        </div>
      )}

      {/* 新建特征对话框：类型 Select + 表单模型参数表单 → insertFeature（守卫错误 Alert 呈现） */}
      <Dialog
        isOpen={showNew && !picker.picking}
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
                    edgePicker={renderEdgePickerSlot(newFields)}
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
        isOpen={editing !== null && !picker.picking}
        onClose={closeEdit}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main styleType="default">
          <Dialog.TitleBar titleText={`编辑特征：${editingLabel}`} />
          <Dialog.Content>
            {editing && (
              <>
                {/* T6.4 试算反馈徽标：草稿试算结果（positive=通过 / negative=失败）；预览不可用时无徽标 */}
                {preview && (
                  <div className="preview-badge" data-testid="preview-badge">
                    <Badge backgroundColor={preview.ok ? 'positive' : 'negative'}>
                      {preview.ok
                        ? `✓ 试算通过（${preview.affectedCount} 个特征受影响）`
                        : `⚠ 试算失败：${preview.error ?? '未知错误'}`}
                    </Badge>
                  </div>
                )}
                <FeatureParamForm
                  key={`edit-${editing.id}`}
                  fields={editingFields}
                  value={formValue}
                  onChange={setFormValue}
                  disabled={readOnly || applying}
                  edgePicker={renderEdgePickerSlot(editingFields)}
                />
              </>
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
            {previewFailed && (
              <Button
                styleType="default"
                onClick={handleForceApplyEdit}
                disabled={readOnly || applying}
              >
                仍要应用
              </Button>
            )}
            <Button
              styleType="high-visibility"
              onClick={handleApplyEdit}
              disabled={!editing || readOnly || applying || previewFailed}
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
