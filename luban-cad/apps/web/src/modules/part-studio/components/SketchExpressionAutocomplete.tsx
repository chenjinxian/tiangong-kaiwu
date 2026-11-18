/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图数值字段 `#` 变量补全（ADR-0020 §2.6 D4，S2 首切片）。
 *
 * - 行 = `(fx) #name <校验后的值>`；值由 shared `evaluateVariableTable` 计算，
 *   变量表损坏/该变量不可求值时只显示 `#name`（不伪造值）。
 * - 只展示**既有变量**；无变量/无匹配默认不渲染。S3b：调用方传入 `onCreate`
 *   时追加 `新建变量…` 行（只有宿主真正接线内联创建才出现，不造假控件）。
 * - 组件不读写模型：仅回传变量名/新建请求；键盘（↑/↓/Enter/Escape）由外壳
 *   在输入框 keydown 中消费，本组件负责展示/鼠标点选。
 * - `role="listbox"` + `role="option"`（可访问性/单测观测面）。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { VariableDto } from '@luban-cad/shared';
import { formatSketchDimensionValue } from '../internal/sketch-annotations.js';
import { evaluatedVariableValues } from '../internal/variables.js';
import './SketchDimensionEditor.css';

// S3b：求值 helper 下沉 internal/variables（树行/对话框共用同一实现；
// 本文件保留导出面，既有测试/消费方导入路径不变）。
export { evaluatedVariableValues } from '../internal/variables.js';

/** 变量名前缀匹配（大小写敏感；query 为空 = 全部既有变量）。 */
export function matchesVariableSuggestions(
  variables: readonly VariableDto[],
  query: string,
): VariableDto[] {
  return variables.filter((variable) => variable.name.startsWith(query));
}

export interface SketchExpressionAutocompleteProps {
  /** 既有变量表（调用方已按 query 过滤/未过滤均可——本组件按 query 再过滤）。 */
  variables: readonly VariableDto[];
  /** `#` 后的名称前缀（空串 = 刚输入 `#`）。 */
  query: string;
  /** 当前高亮行（键盘 ↑/↓ 由外壳维护；`matches.length` = 新建行）。 */
  highlightedIndex?: number;
  /** 鼠标悬停/点击前的高亮同步（可选）。 */
  onHighlight?: (index: number) => void;
  onSelect: (name: string) => void;
  /**
   * S3b：内联创建入口（传 query 名称，可为空串）。仅当宿主接线时渲染
   * `新建变量…` 行；缺省不渲染（S2 口径，不造假控件）。
   */
  onCreate?: (name: string) => void;
  /** 相对输入框的定位（缺省由 CSS 内联渲染在字段下方，无锚点时使用）。 */
  anchor?: { left: number; top: number };
}

/** 补全菜单可选项总数（既有变量行 + 可选新建行；外壳键盘导航共用）。 */
export function autocompleteOptionCount(
  variables: readonly VariableDto[],
  query: string,
  hasCreate: boolean,
): number {
  return matchesVariableSuggestions(variables, query).length + (hasCreate ? 1 : 0);
}

export function SketchExpressionAutocomplete({
  variables,
  query,
  highlightedIndex = 0,
  onHighlight,
  onSelect,
  onCreate,
  anchor,
}: SketchExpressionAutocompleteProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const matches = React.useMemo(
    () => matchesVariableSuggestions(variables, query),
    [variables, query],
  );
  const values = React.useMemo(() => evaluatedVariableValues(variables), [variables]);

  // 无既有变量/无匹配且未接线新建：不渲染（不显示空菜单或假「新建变量…」行）。
  if (matches.length === 0 && !onCreate)
    return null;

  return (
    <div
      className="part-studio-sketch-expression-autocomplete"
      data-testid="sketch-expression-autocomplete"
      role="listbox"
      aria-label={t('partStudio.sketch.expression.autocompleteLabel')}
      // ADR-0020 S4c：anchor 是**视口坐标**（ExpressionNumberField 已按 input
      // rect + 菜单尺寸夹紧），故用 fixed 定位；S2 草图尺寸字段不传 anchor，
      // 保持原 absolute 行为不变。
      style={anchor ? { position: 'fixed', left: anchor.left, top: anchor.top } : undefined}
      // 菜单打开期间输入框保持焦点（键盘导航由外壳消费）。
      onMouseDown={(event) => event.preventDefault()}
    >
      {matches.map((variable, index) => {
        const value = values?.get(variable.name);
        return (
          <div
            key={variable.id}
            role="option"
            aria-selected={index === highlightedIndex}
            className="part-studio-sketch-expression-autocomplete__option"
            data-testid="sketch-expression-autocomplete-option"
            data-variable-name={variable.name}
            data-highlighted={index === highlightedIndex ? 'true' : 'false'}
            onMouseEnter={() => onHighlight?.(index)}
            onMouseDown={(event) => {
              // 不让输入框失焦；选择后由外壳写回文本并关闭。
              event.preventDefault();
              onSelect(variable.name);
            }}
          >
            <span className="part-studio-sketch-expression-autocomplete__fx" aria-hidden="true">
              (fx)
            </span>
            <span className="part-studio-sketch-expression-autocomplete__name">{`#${variable.name}`}</span>
            {value !== undefined && Number.isFinite(value) && (
              <span className="part-studio-sketch-expression-autocomplete__value">
                {formatSketchDimensionValue(value, 6)}
              </span>
            )}
          </div>
        );
      })}
      {onCreate && (
        <div
          role="option"
          aria-selected={matches.length === highlightedIndex}
          className="part-studio-sketch-expression-autocomplete__option part-studio-sketch-expression-autocomplete__option--create"
          data-testid="sketch-expression-autocomplete-create"
          data-highlighted={matches.length === highlightedIndex ? 'true' : 'false'}
          onMouseEnter={() => onHighlight?.(matches.length)}
          onMouseDown={(event) => {
            // 不让输入框失焦；由外壳打开内联创建面板（query 名称预填）。
            event.preventDefault();
            onCreate(query);
          }}
        >
          <span className="part-studio-sketch-expression-autocomplete__fx" aria-hidden="true">
            (fx)
          </span>
          <span className="part-studio-sketch-expression-autocomplete__name">
            {t('partStudio.variables.autocomplete.create')}
          </span>
        </div>
      )}
    </div>
  );
}
