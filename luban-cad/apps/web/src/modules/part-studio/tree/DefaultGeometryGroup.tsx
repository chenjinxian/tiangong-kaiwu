/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 默认几何图元组（2026-11-02 Onshape 初始树对齐）：
 * `默认几何图元` → Origin / Top / Front / Right。合成节点只在本组件/store.datum
 * 流转，**不进入** tree.selectedNodeIds / canvas.hiddenIds（非 iModel element）。
 * 行标签固定英文（Onshape 在中文界面同样保留 Origin/Top/Front/Right）。
 *
 * 默认可见性：初始三平面 + Origin 可见；首个产体特征后由 Session 调
 * hideDatumPlanesOnce 自动隐藏三平面（用户可用眼睛重新打开）。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@itwin/itwinui-react';
import {
  SvgChevronDown,
  SvgChevronRight,
  SvgVisibilityHide,
  SvgVisibilityShow,
} from '@itwin/itwinui-icons-react';
import type { DatumId } from '../types.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';

const DATUM_ROWS: readonly { id: DatumId; label: string; kind: 'origin' | 'plane' }[] = [
  { id: 'origin', label: 'Origin', kind: 'origin' },
  { id: 'top', label: 'Top', kind: 'plane' },
  { id: 'front', label: 'Front', kind: 'plane' },
  { id: 'right', label: 'Right', kind: 'plane' },
];

/** Origin 靶心 / 平面小方框（24×24 描边，跟随 currentColor）。 */
function OriginIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="5.2" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" strokeLinecap="round" />
    </svg>
  );
}

function PlaneIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z" />
      <path d="M4 8.5V16l8 4.5 8-4.5V8.5" opacity=".55" />
    </svg>
  );
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
          {expanded ? <SvgChevronDown /> : <SvgChevronRight />}
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
                    {row.kind === 'origin' ? <OriginIcon /> : <PlaneIcon />}
                  </span>
                  <span className="part-studio-tree-row__name">{row.label}</span>
                </button>
                <IconButton
                  size="small"
                  styleType="borderless"
                  className="part-studio-tree-row__visibility"
                  label={t(visible ? 'partStudio.tree.hideDatum' : 'partStudio.tree.showDatum', { name: row.label })}
                  data-testid={`tree-row-datum-visibility-${row.id}`}
                  aria-pressed={!visible}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleVisible(row.id);
                  }}
                >
                  {visible ? <SvgVisibilityShow /> : <SvgVisibilityHide />}
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
