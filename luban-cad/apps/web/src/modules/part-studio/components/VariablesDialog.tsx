/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Part Studio 变量对话框（ADR-0020 §2.6 D5–D7，S3b；live 2026-11-17）。
 *
 * 两种变体（同一个面板实现，不复制第二套视觉）：
 * - `variables`（变量命令/树行双击编辑）：标题 `#<name> = <值>`（新建
 *   `#? = 0 <单位>`）、源模式 `已分配/已测量/来自导入`（后两者诚实禁用 +
 *   真实原因 title）、类型行 `长度/角度/数字/任意`、字段 `名称/值/说明`、
 *   绿✓/红✗。
 * - `inline-create`（尺寸字段未知 `#name` + Enter）：标题 `创建变量`；
 *   `特征/配置` 两页签（配置页诚实禁用——未实现）；同样类型行/字段。
 *
 * 值字段：聚焦显示表达式原文；blur/Tab 用 `validateVariableDraft` 求值并
 * 格式化为数值（单位后缀在输入框右侧，合成 `20 mm`），提交载荷仍保留表达式
 * 原文（树行显示设计意图）。无效表达式保留原文 + 红下划线 + ✓ 禁用。
 *
 * 写模型不在本组件：✓ → `onCommit(dto, allVariables)`（宿主走
 * `FeatureOp.updateVariables` 整表覆写，可撤销）；失败保留对话框 + 就地错误。
 * 变量表事实源仍是后端 params（P0-06），本组件只持草稿态。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { VariableDto, VariableType } from '@luban-cad/shared';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import { DialogHeaderButtons } from '../dialogs/DialogHeaderButtons.js';
import {
  evaluateVariableExpression,
  formatVariableNumber,
  formatVariableValueWithUnit,
  upsertVariable,
  validateVariableDraft,
  variableUnit,
  variableWriteBlockI18nKey,
  variableWriteBlockReason,
  VARIABLE_TYPES,
  type VariableDialogVariant,
} from '../internal/variables.js';
import { expressionFailureMessage } from '../internal/expression-error-message.js';
import '../dialogs/FeatureDialog.css';
import './VariablesDialog.css';

/** 面板宽度（live 220×188）。 */
export const VARIABLES_DIALOG_WIDTH = 220;
/** 面板高度（live 220×188；内联定位钳制用）。 */
export const VARIABLES_DIALOG_HEIGHT = 188;

/** 内联创建面板位置：以尺寸对话框右侧为锚点，按视口 8px 边距钳制。 */
export function clampVariablesDialogPosition(
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  margin = 8,
): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewport.width - VARIABLES_DIALOG_WIDTH - margin);
  const maxTop = Math.max(margin, viewport.height - VARIABLES_DIALOG_HEIGHT - margin);
  return {
    left: Math.min(Math.max(anchor.x, margin), maxLeft),
    top: Math.min(Math.max(anchor.y, margin), maxTop),
  };
}

/** 源模式（live：三者常显；已测量/来自导入能力未实现 → 诚实禁用）。 */
const VARIABLE_SOURCES: readonly {
  id: 'assigned' | 'measured' | 'imported';
  available: boolean;
}[] = [
  { id: 'assigned', available: true },
  { id: 'measured', available: false },
  { id: 'imported', available: false },
];

export interface VariablesDialogCommitResult {
  ok: boolean;
  error?: string;
}

export interface VariablesDialogProps {
  variant: VariableDialogVariant;
  /** 既有变量表（编辑预填/唯一性/求值上下文）。 */
  variables: readonly VariableDto[];
  /** 编辑态变量 id（variables 变体；缺省=新建）。 */
  variableId?: string;
  /** 内联创建预填（名称 token / 值文本）。 */
  initialName?: string;
  initialValueText?: string;
  /** 内联创建初始类型（缺省 length；P2-4：不随尺寸量纲自动切换）。 */
  initialType?: VariableType;
  /** 内联创建锚点（client 坐标；缺省钉画布左上）。 */
  anchor?: { x: number; y: number };
  /** 变量表读取中（读面未落位时不因「id 不在表内」误关编辑面板）。 */
  variablesLoading?: boolean;
  /** 当前 scope 的变量表已成功落位且无错误（P2-1 写门；缺省 true=单测/壳期）。 */
  variablesReady?: boolean;
  /** 是否有可读的 scope（false=未连接/PS 未就绪；缺省 true）。 */
  variablesScopeActive?: boolean;
  /** 读取失败消息（区分写门原因，缺省无错误）。 */
  variablesError?: string;
  canEdit?: boolean;
  /**
   * 提交（宿主走 `applyOp({kind:'updateVariables', variables: all})`）。
   * ok:false 时保留对话框并显示就地错误。
   */
  onCommit: (dto: VariableDto, allVariables: VariableDto[]) => Promise<VariablesDialogCommitResult>;
  /** 取消/成功关闭（不写模型）。 */
  onClose: () => void;
}

/** 本地规则错误的 message 是 i18n key；求值错误走结构化 failure（S5）。 */
function validationMessage(
  t: (key: string) => string,
  message: string,
): string {
  return message.startsWith('partStudio.') ? t(message) : message;
}

export function VariablesDialog({
  variant,
  variables,
  variableId,
  initialName,
  initialValueText,
  initialType,
  anchor,
  variablesLoading = false,
  variablesReady = true,
  variablesScopeActive = true,
  variablesError,
  canEdit = true,
  onCommit,
  onClose,
}: VariablesDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const editing = variant === 'variables' && variableId !== undefined
    ? variables.find((variable) => variable.id === variableId)
    : undefined;
  const [name, setName] = React.useState(editing?.name ?? initialName ?? '');
  const [valueText, setValueText] = React.useState(editing?.expression ?? initialValueText ?? '');
  const [type, setType] = React.useState<VariableType>(editing?.type ?? initialType ?? 'length');
  const [description, setDescription] = React.useState(editing?.description ?? '');
  /** 值字段聚焦态：聚焦显示表达式原文，失焦显示求值数值。 */
  const [valueFocused, setValueFocused] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [commitError, setCommitError] = React.useState<string | undefined>(undefined);

  const validation = React.useMemo(
    () => validateVariableDraft(
      { id: editing?.id, name, valueText, type, description },
      variables,
    ),
    [description, editing?.id, name, type, valueText, variables],
  );
  const evaluatedValue = React.useMemo(
    () => (valueText.trim() === ''
      ? undefined
      : evaluateVariableExpression(valueText, variables)),
    [valueText, variables],
  );
  const unit = variableUnit(type);
  /** 失焦且可求值 → 显示求值数值（单位在输入框右侧后缀）；否则保留原文。 */
  const valueDisplay = valueFocused || evaluatedValue === undefined
    ? valueText
    : formatVariableNumber(evaluatedValue, type);

  /**
   * 标题右侧值：可求值 → 求值结果 + 单位（`20 mm`）；无效 → 原文；空 → 0 单位。
   * 新建变量标题 `#? = 0 <单位>`（live；类型单位随类型行变化）。
   */
  const titleValue = validation.ok && evaluatedValue !== undefined
    ? formatVariableValueWithUnit(evaluatedValue, type)
    : valueText.trim() !== ''
      ? valueText.trim()
      : `0${unit === '' ? '' : ` ${unit}`}`;
  const expressionTitle = `#${name.trim() === '' ? '?' : name.trim()} = ${titleValue}`;
  const headerTitle = variant === 'inline-create'
    ? t('partStudio.variables.inline.title')
    : expressionTitle;

  // 写门错误优先于字段校验错误；**loading 先于不可用**（P2-1：正常刷新不得
  // 报「读取失败」）。未连接/PS 未就绪与读取失败分开提示。
  const writeBlock = variableWriteBlockReason({
    loading: variablesLoading,
    ready: variablesReady,
    scopeActive: variablesScopeActive,
    error: variablesError,
  });
  const validationErrorText = validation.ok
    ? undefined
    : validation.failure !== undefined
      ? expressionFailureMessage(validation.failure, t)
      : validation.message !== undefined
        ? validationMessage(t, validation.message)
        : undefined;
  const errorMessage = commitError
    ?? (writeBlock !== undefined ? t(variableWriteBlockI18nKey(writeBlock)) : undefined)
    ?? validationErrorText;
  const canCommit = canEdit && validation.ok && !busy && writeBlock === undefined;
  const readOnly = !canEdit || busy;

  const close = React.useCallback((): void => {
    if (busy)
      return;
    onClose();
  }, [busy, onClose]);

  // 打开后变量被别处删除（或 scope 切换后表已不含该 id）→ 关闭，不再按
  // 「新建」语义重建一个同 id/新 id 的变量（P3 边界）。读面未落位（loading）
  // 时先不判，避免瞬时空表误关。
  React.useEffect(() => {
    if (variant !== 'variables' || variableId === undefined || variablesLoading)
      return;
    if (!variables.some((variable) => variable.id === variableId))
      onClose();
  }, [onClose, variableId, variables, variablesLoading, variant]);

  // Escape 关闭（焦点在面板内时；捕获段不吞其它控件语义）。
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || busy)
        return;
      const active = event.target;
      if (!(active instanceof HTMLElement))
        return;
      const root = document.querySelector('[data-testid="variables-dialog"]');
      if (!root || !root.contains(active))
        return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [busy, onClose]);

  const commit = React.useCallback(async (): Promise<void> => {
    if (!canCommit || !validation.ok)
      return;
    setBusy(true);
    setCommitError(undefined);
    try {
      const allVariables = upsertVariable(variables, validation.dto);
      const result = await onCommit(validation.dto, allVariables);
      if (!result.ok) {
        setCommitError(result.error ?? t('partStudio.variables.errors.commitFailed'));
        return;
      }
      onClose();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [canCommit, onClose, onCommit, t, validation, variables]);

  // 内联变体锚定在尺寸对话框右侧（client 坐标 → fixed）；普通变体钉画布左上
  // （与 FeatureDialog 同一内联语言）。窗口尺寸在渲染期读取（壳期测试兜底）。
  const anchoredPosition = React.useMemo(() => {
    if (variant !== 'inline-create' || !anchor)
      return undefined;
    const viewport = typeof window === 'undefined'
      ? { width: VARIABLES_DIALOG_WIDTH + 16, height: VARIABLES_DIALOG_HEIGHT + 16 }
      : { width: window.innerWidth, height: window.innerHeight };
    return clampVariablesDialogPosition(anchor, viewport);
  }, [anchor, variant]);

  return (
    <div
      role="dialog"
      aria-label={headerTitle}
      className={`part-studio-variables-dialog${anchoredPosition ? ' part-studio-variables-dialog--anchored' : ''}`}
      data-testid="variables-dialog"
      data-variant={variant}
      style={anchoredPosition}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="part-studio-variables-dialog__header">
        <span className="part-studio-variables-dialog__fx" aria-hidden="true">
          <OnshapeIcon name="variable-table-button" size={16} />
        </span>
        <h2 className="part-studio-variables-dialog__title" data-testid="variables-dialog-title">
          {headerTitle}
        </h2>
        <DialogHeaderButtons
          disabled={!canCommit}
          onConfirm={() => { void commit(); }}
          onCancel={close}
          confirmTestId="variables-confirm"
          cancelTestId="variables-cancel"
        />
      </div>

      {variant === 'variables' ? (
        <div
          className="part-studio-variables-dialog__row"
          role="group"
          aria-label={t('partStudio.variables.sources.label')}
        >
          {VARIABLE_SOURCES.map((source) => (
            <button
              key={source.id}
              type="button"
              className="part-studio-variables-dialog__choice"
              data-testid={`variables-source-${source.id}`}
              aria-pressed={source.id === 'assigned'}
              disabled={!source.available || !canEdit}
              title={source.available
                ? undefined
                : t(`partStudio.variables.sources.${source.id}Unavailable`)}
            >
              {t(`partStudio.variables.sources.${source.id}`)}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="part-studio-variables-dialog__row part-studio-variables-dialog__tabs"
          role="tablist"
          aria-label={t('partStudio.variables.inline.tabsLabel')}
        >
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="part-studio-variables-dialog__choice"
            data-testid="variables-tab-feature"
          >
            {t('partStudio.variables.inline.tabFeature')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="part-studio-variables-dialog__choice"
            data-testid="variables-tab-configuration"
            disabled
            title={t('partStudio.variables.inline.configurationUnavailable')}
          >
            {t('partStudio.variables.inline.tabConfiguration')}
          </button>
        </div>
      )}

      <div
        className="part-studio-variables-dialog__row"
        role="group"
        aria-label={t('partStudio.variables.types.label')}
      >
        {VARIABLE_TYPES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className="part-studio-variables-dialog__choice"
            data-testid={`variables-type-${candidate}`}
            aria-pressed={candidate === type}
            disabled={!canEdit}
            onClick={() => {
              setType(candidate);
              setCommitError(undefined);
            }}
          >
            {t(`partStudio.variables.types.${candidate}`)}
          </button>
        ))}
      </div>

      <label className="part-studio-variables-dialog__field">
        <span className="part-studio-variables-dialog__label">
          {t('partStudio.variables.fields.name')}
        </span>
        <input
          type="text"
          autoFocus
          className="part-studio-variables-dialog__input"
          data-testid="variables-name-input"
          data-error={!validation.ok && validation.field === 'name' ? 'true' : undefined}
          aria-invalid={!validation.ok && validation.field === 'name'}
          value={name}
          readOnly={readOnly}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setCommitError(undefined);
          }}
        />
      </label>

      <label className="part-studio-variables-dialog__field">
        <span className="part-studio-variables-dialog__label">
          {t('partStudio.variables.fields.value')}
        </span>
        <span className="part-studio-variables-dialog__value">
          <input
            type="text"
            className="part-studio-variables-dialog__input"
            data-testid="variables-value-input"
            data-error={!validation.ok && validation.field === 'value' ? 'true' : undefined}
            aria-invalid={!validation.ok && validation.field === 'value'}
            value={valueDisplay}
            readOnly={readOnly}
            onFocus={() => setValueFocused(true)}
            onBlur={() => setValueFocused(false)}
            onChange={(event) => {
              // 聚焦态写原文（格式化只在失焦时投影显示）。
              setValueText(event.currentTarget.value);
              setCommitError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                setValueFocused(false);
                void commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
          />
          <span
            className="part-studio-variables-dialog__unit"
            data-testid="variables-value-unit"
            aria-hidden="true"
          >
            {unit}
          </span>
        </span>
      </label>

      <label className="part-studio-variables-dialog__field">
        <span className="part-studio-variables-dialog__label">
          {t('partStudio.variables.fields.description')}
        </span>
        <input
          type="text"
          className="part-studio-variables-dialog__input"
          data-testid="variables-description-input"
          data-error={!validation.ok && validation.field === 'description' ? 'true' : undefined}
          value={description}
          readOnly={readOnly}
          onChange={(event) => {
            setDescription(event.currentTarget.value);
            setCommitError(undefined);
          }}
        />
      </label>

      {errorMessage !== undefined && (
        <div
          className="part-studio-variables-dialog__error"
          role="alert"
          data-testid="variables-error"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}
