/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * TreeFilter（M3 Task 5）：双段树语法筛选框（对齐 os-20 文本）——
 * 输入框（placeholder「按名称或类型筛选」）+ 语法帮助钮（展开六条谓词说明，
 * 文案逐条对齐 os-20 采集）。解析/匹配为同文件导出纯函数：
 * - 谓词：:errors/:warnings/:hidden/:suppressed/:type <名>/:variable <名>
 *   （os-20 全集 :part/:name/:folder/:shown 的 T5 子集，后续波次补）；
 * - :variable 区分大小写（os-20 钉死），:type 不区分；
 * - 多谓词与自由文本 AND 组合；自由文本=名称子串（不区分大小写）；
 * - 引号值（":type \"my feature\""）去引号整体作为值；未知 :keyword 忽略
 *   其谓词位、余词并入文本条件（诚实降级，不炸）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SvgFilter, SvgCloseSmall } from '@itwin/itwinui-icons-react';
import type { FeatureNode, PartNode } from '../types.js';

/** 筛选查询（parseTreeFilter 产物；空条件=全量）。 */
export interface TreeFilterQuery {
  /** 自由文本（名称子串，不区分大小写）。 */
  text: string;
  errorsOnly: boolean;
  warningsOnly: boolean;
  hiddenOnly: boolean;
  suppressedOnly: boolean;
  /** :type 值列表（不区分大小写等值）。 */
  types: readonly string[];
  /** :variable 值列表（区分大小写等值）。 */
  variables: readonly string[];
}

const EMPTY_QUERY: TreeFilterQuery = {
  text: '',
  errorsOnly: false,
  warningsOnly: false,
  hiddenOnly: false,
  suppressedOnly: false,
  types: [],
  variables: [],
};

/** 无值谓词表（:flag 形）。 */
const FLAG_PREDICATES = new Set([':errors', ':warnings', ':hidden', ':suppressed']);
/** 带值谓词表（:key value 形）。 */
const VALUE_PREDICATES = new Set([':type', ':variable']);

/** 筛选语法解析（纯函数）。空串返回全量空条件。 */
export function parseTreeFilter(input: string): TreeFilterQuery {
  const query: TreeFilterQuery = { ...EMPTY_QUERY, types: [], variables: [] };
  const textTokens: string[] = [];
  const tokens = input.match(/"[^"]*"|\S+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (FLAG_PREDICATES.has(token)) {
      if (token === ':errors') query.errorsOnly = true;
      else if (token === ':warnings') query.warningsOnly = true;
      else if (token === ':hidden') query.hiddenOnly = true;
      else query.suppressedOnly = true;
      continue;
    }
    if (VALUE_PREDICATES.has(token)) {
      // 取值：下一 token（引号整体），缺失则忽略该谓词。
      const raw = tokens[i + 1];
      if (raw === undefined) continue;
      i += 1;
      const value = stripQuotes(raw);
      if (token === ':type') (query.types as string[]).push(value);
      else (query.variables as string[]).push(value);
      continue;
    }
    if (token.startsWith(':')) {
      // 未知 :keyword：忽略谓词位（余词自然并入文本）。
      continue;
    }
    textTokens.push(stripQuotes(token));
  }
  query.text = textTokens.join(' ').trim();
  return query;
}

function stripQuotes(token: string): string {
  return token.length >= 2 && token.startsWith('"') && token.endsWith('"')
    ? token.slice(1, -1)
    : token;
}

/** 特征行匹配（多条件 AND）。 */
export function matchFeature(node: FeatureNode, query: TreeFilterQuery): boolean {
  if (query.errorsOnly && !node.hasError) return false;
  if (query.warningsOnly && !node.hasWarning) return false;
  if (query.hiddenOnly && !node.isHidden) return false;
  if (query.suppressedOnly && !node.isSuppressed) return false;
  for (const type of query.types) {
    if (node.type.toLowerCase() !== type.toLowerCase()) return false;
  }
  for (const variable of query.variables) {
    if (!(node.variables ?? []).includes(variable)) return false; // 区分大小写（os-20）
  }
  if (query.text && !node.name.toLowerCase().includes(query.text.toLowerCase())) return false;
  return true;
}

/** 零件行匹配（:type/:variable 不适用——特征专属谓词不约束零件行）。 */
export function matchPart(node: PartNode, query: TreeFilterQuery): boolean {
  if (query.errorsOnly && !node.hasError) return false;
  if (query.warningsOnly) return false;
  if (query.hiddenOnly && !node.isHidden) return false;
  // suppressedOnly：零件无抑制语义，谓词激活时零件段空集（诚实口径）。
  if (query.suppressedOnly) return false;
  if (query.text && !node.name.toLowerCase().includes(query.text.toLowerCase())) return false;
  return true;
}

/** 帮助面板谓词条目（键=treeFilter.syntax.* i18n 后缀，渲染前缀 ':'）。 */
const SYNTAX_KEYS = ['errors', 'warnings', 'hidden', 'suppressed', 'type', 'variable'] as const;

export interface TreeFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/** 树筛选框：输入 + 清除钮 + 语法帮助飞出面。 */
export function TreeFilter({ value, onChange }: TreeFilterProps): React.JSX.Element {
  const { t } = useTranslation();
  const [helpOpen, setHelpOpen] = React.useState(false);

  return (
    <div className="part-studio-tree-filter" data-testid="part-studio-tree-filter">
      <div className="part-studio-tree-filter__field">
        <input
          type="text"
          className="part-studio-tree-filter__input"
          placeholder={t('partStudio.treeFilter.placeholder')}
          aria-label={t('partStudio.treeFilter.placeholder')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {value !== '' && (
          <button
            type="button"
            className="part-studio-tree-filter__clear"
            aria-label={t('partStudio.treeFilter.clear')}
            onClick={() => onChange('')}
          >
            <SvgCloseSmall />
          </button>
        )}
      </div>
      <button
        type="button"
        className="part-studio-tree-filter__help-trigger"
        aria-label={t('partStudio.treeFilter.helpLabel')}
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen((open) => !open)}
      >
        <SvgFilter />
      </button>
      {helpOpen && (
        <ul className="part-studio-tree-filter__syntax" role="list">
          {SYNTAX_KEYS.map((key) => (
            <li key={key} className="part-studio-tree-filter__syntax-item">
              <code>:{key}</code>
              <span>– {t(`partStudio.treeFilter.syntax.${key}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
