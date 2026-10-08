/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { Input, Label, Text, Textarea, ToggleSwitch } from '@itwin/itwinui-react';
import type { FeatureFormField, FilletEdgeRef } from '@luban-cad/shared';

export interface FeatureParamFormProps {
  /** 表单模型字段（fs.formModel[featureType].fields；五 kind：number/json/boolean/edgeRefs/readonlyText） */
  fields: FeatureFormField[];
  /** 当前参数值（key = 字段名；编辑流预填存储 params，新建流为零值） */
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  /** edgeRefs 字段的拾取器插槽（T6.3「从视图选边」注入按钮）；无插槽时仅渲染 chips */
  edgePicker?: React.ReactNode;
}

/** json 字段无值时的零值（profile 内联轮廓按 [] 起步，契合后端「sketchId 存在时 profile 须为空数组」语义） */
function defaultJsonFor(field: FeatureFormField): unknown {
  return field.name === 'profile' ? [] : null;
}

function formatJsonDraft(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  try {
    return JSON.stringify(raw);
  } catch {
    return '';
  }
}

function formatEdgeChip(ref: FilletEdgeRef): string {
  const { faceA, faceB } = ref;
  return `#${faceA.nodeId}/${faceA.entityId} ~ #${faceB.nodeId}/${faceB.entityId}`;
}

/** number 输入容错归一：空串/非法输入 → undefined（不向上发射，等同「未修改」守卫） */
function parseNumberInput(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 表单模型驱动的特征参数表单（M3-a T6.2）。
 *
 * - number → Input[type=number]，合法数字才 onChange；
 * - json → Textarea，失焦 parse：合法 → onChange(parsed)；非法 → 行内错误文案（status=negative），
 *   且绝不把非法值向上发射（外发 params 恒为可解析 JSON）；
 * - boolean → ToggleSwitch；
 * - edgeRefs → chips 区（FilletEdgeRef 两邻面拓扑 id 对）+ edgePicker 插槽（T6.3 注入拾取按钮）；
 * - readonlyText → 只读 Input（草图 id 等展示字段，改值入口在草图约束 op）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const FeatureParamForm: React.FC<FeatureParamFormProps> = React.memo(
  ({ fields, value, onChange, disabled = false, edgePicker }) => {
    const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>(() => {
      const init: Record<string, string> = {};
      for (const f of fields) {
        if (f.kind === 'json') init[f.name] = formatJsonDraft(value[f.name] ?? defaultJsonFor(f));
      }
      return init;
    });
    const [jsonErrors, setJsonErrors] = useState<Record<string, string | undefined>>({});

    const emit = (name: string, next: unknown) => {
      onChange({ ...value, [name]: next });
    };

    const handleJsonBlur = (field: FeatureFormField) => {
      const raw = jsonDrafts[field.name] ?? '';
      if (raw.trim() === '') {
        // 清空 = 归零值（profile → []，其余 → null）；清除行内错误
        setJsonErrors((prev) => ({ ...prev, [field.name]: undefined }));
        emit(field.name, defaultJsonFor(field));
        return;
      }
      try {
        emit(field.name, JSON.parse(raw));
        setJsonErrors((prev) => ({ ...prev, [field.name]: undefined }));
      } catch {
        // 非法 JSON：行内报错，不外传（外发 params 永不为非法 JSON）
        setJsonErrors((prev) => ({ ...prev, [field.name]: 'JSON 格式非法，未保存该字段' }));
      }
    };

    return (
      <div className="feature-param-form">
        {fields.map((field) => {
          const fieldId = `feature-field-${field.name}`;
          switch (field.kind) {
            case 'number':
              return (
                <div className="form-group" key={field.name}>
                  <Label htmlFor={fieldId}>{field.label}</Label>
                  <Input
                    id={fieldId}
                    type="number"
                    size="small"
                    value={value[field.name] === undefined || value[field.name] === null ? '' : String(value[field.name])}
                    onChange={(e) => {
                      const n = parseNumberInput(e.target.value);
                      if (n !== undefined) emit(field.name, n);
                    }}
                    disabled={disabled || field.readOnly}
                  />
                </div>
              );
            case 'json':
              return (
                <div className="form-group" key={field.name}>
                  <Label htmlFor={fieldId}>{field.label}</Label>
                  <Textarea
                    id={fieldId}
                    value={jsonDrafts[field.name] ?? ''}
                    onChange={(e) => {
                      const next = e.target.value;
                      setJsonDrafts((prev) => ({ ...prev, [field.name]: next }));
                      // 输入中即清错误（与 blur 校验配对）；不触发 onChange
                      if (jsonErrors[field.name]) {
                        setJsonErrors((prev) => ({ ...prev, [field.name]: undefined }));
                      }
                    }}
                    onBlur={() => handleJsonBlur(field)}
                    status={jsonErrors[field.name] ? 'negative' : undefined}
                    disabled={disabled || field.readOnly}
                    rows={4}
                  />
                  {jsonErrors[field.name] && (
                    <Text variant="small" className="feature-field-error">{jsonErrors[field.name]}</Text>
                  )}
                </div>
              );
            case 'boolean':
              return (
                <div className="form-group" key={field.name}>
                  <ToggleSwitch
                    label={field.label}
                    checked={Boolean(value[field.name])}
                    onChange={(e) => emit(field.name, e.target.checked)}
                    disabled={disabled || field.readOnly}
                  />
                </div>
              );
            case 'edgeRefs': {
              const refs = Array.isArray(value[field.name]) ? (value[field.name] as FilletEdgeRef[]) : [];
              return (
                <div className="form-group" key={field.name}>
                  <Label>{field.label}</Label>
                  <div className="feature-edge-chips" data-testid={`feature-edge-chips-${field.name}`}>
                    {refs.length === 0 ? (
                      <Text variant="small" className="feature-edge-empty">未选择边</Text>
                    ) : (
                      refs.map((ref, i) => (
                        <span className="feature-edge-chip" key={`${formatEdgeChip(ref)}-${i}`}>
                          {formatEdgeChip(ref)}
                        </span>
                      ))
                    )}
                  </div>
                  {edgePicker}
                </div>
              );
            }
            case 'readonlyText':
            default:
              return (
                <div className="form-group" key={field.name}>
                  <Label htmlFor={fieldId}>{field.label}</Label>
                  <Input
                    id={fieldId}
                    value={value[field.name] === undefined || value[field.name] === null ? '' : String(value[field.name])}
                    disabled
                    readOnly
                    size="small"
                  />
                </div>
              );
          }
        })}
      </div>
    );
  },
);

FeatureParamForm.displayName = 'FeatureParamForm';

export default FeatureParamForm;
