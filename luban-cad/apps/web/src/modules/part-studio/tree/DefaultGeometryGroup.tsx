/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 默认几何图元组（2026-11-02 Onshape 初始树对齐）：
 * `默认几何图元` → Origin / Top / Front / Right。合成节点只在本组件/store.datum
 * 流转，**不进入** tree.selectedNodeIds / canvas.hiddenIds（非 iModel element）。
 * 行标签固定英文（Onshape 在中文界面同样保留 Origin/Top/Front/Right）。
 *
 * 默认可见性：Session 的 useDatumVisibility 按 authored body/活动草图实时
 * 同步有效值（有体→全隐；无体→全显；草图落默认面→显示该面）；眼睛点击写
 * 用户覆盖，scope 切换时清空。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { DatumId } from '../types.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

export const DATUM_ROWS: readonly { id: DatumId; label: string; kind: 'origin' | 'plane' }[] = [
  { id: 'origin', label: 'Origin', kind: 'origin' },
  { id: 'top', label: 'Top', kind: 'plane' },
  { id: 'front', label: 'Front', kind: 'plane' },
  { id: 'right', label: 'Right', kind: 'plane' },
];

/** Onshape 特征计数把默认几何四项计入（FeatureTree count 单一真源）。 */
export const DEFAULT_DATUM_COUNT = DATUM_ROWS.length;

/** Origin 靶心 / 默认平面图标（Onshape 原 symbol）。 */
function DatumIcon({ kind }: { kind: 'origin' | 'plane' }): React.JSX.Element {
  return <OnshapeIcon name={kind === 'origin' ? 'origin-button' : 'default-plane-button'} size={16} />;
}

export function DefaultGeometryGroup(): React.JSX.Element {
  const { t } = useTranslation();
  const visibility = usePartStudioStore((s) => s.datum.visibility);
  const expanded = usePartStudioStore((s) => s.datum.expanded);
  const selectedId = usePartStudioStore((s) => s.datum.selectedId);
  const setExpanded = usePartStudioStore((s) => s.setDatumExpanded);
  const selectDatum = usePartStudioStore((s) => s.selectDatum);
  const toggleVisible = usePartStudioStore((s) => s.toggleDatumVisible);

  return (
    <li className="part-studio-tree__datum-group" data-testid="tree-datum-group">
      <div className="part-studio-tree__datum-header-row">
        <button
          type="button"
          className="part-studio-tree__datum-header"
          aria-expanded={expanded}
          data-testid="tree-datum-group-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          <OnshapeIcon name={expanded ? 'expanded' : 'collapsed'} size={10} />
          <span>{t('partStudio.tree.defaultGeometry')}</span>
        </button>
      </div>
      {expanded && (
        <ul className="part-studio-tree__datum-list" data-testid="tree-datum-list">
          {DATUM_ROWS.map((row) => {
            const visible = visibility[row.id];
            const selected = selectedId === row.id;
            return (
              <li key={row.id} className="part-studio-tree-row-wrapper part-studio-tree__datum-row-wrapper">
                <button
                  type="button"
                  className="part-studio-tree-row part-studio-tree__datum-row"
                  data-testid={`tree-row-datum-${row.id}`}
                  data-datum-id={row.id}
                  data-hidden={visible ? undefined : 'true'}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => selectDatum(selected ? null : row.id)}
                >
                  <span className="part-studio-tree-row__icon" aria-hidden="true">
                    <DatumIcon kind={row.kind} />
                  </span>
                  <span className="part-studio-tree-row__name">{row.label}</span>
                </button>
                <button
                  type="button"
                  className="part-studio-tree-row__visibility"
                  aria-label={t(visible ? 'partStudio.tree.hideDatum' : 'partStudio.tree.showDatum', { name: row.label })}
                  title={t(visible ? 'partStudio.tree.hideDatum' : 'partStudio.tree.showDatum', { name: row.label })}
                  data-testid={`tree-row-datum-visibility-${row.id}`}
                  aria-pressed={!visible}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleVisible(row.id);
                  }}
                >
                  <OnshapeIcon name={visible ? 'eye_open' : 'eye_closed'} size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
