/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import type { ChangedElement, ChangesetComparisonResult, PropertyDifference } from '@luban-cad/shared';
import { OpenCloudRpcInterface } from '@luban-cad/shared';
import type { Changeset } from '@itwin/imodels-client-management';
import { SvgClose } from '@itwin/itwinui-icons-react';
import './ChangesetCompare.css';

interface ChangesetCompareProps {
  iModelId: string;
  changesets: Changeset[];
  currentChangesetId: string | null;
  isVisible: boolean;
  onClose: () => void;
  /** Pre-selected versions to compare (from NamedVersionPanel) */
  preselectedVersions?: { sourceChangesetId: string | null; targetChangesetId: string | null } | null;
}

type DiffMode = 'full' | 'source' | 'target';

// eslint-disable-next-line @typescript-eslint/naming-convention
const ElementChangeRow: React.FC<{
  element: ChangedElement;
  isExpanded: boolean;
  onToggle: () => void;
  mode?: DiffMode;
}> = React.memo(({ element, isExpanded, onToggle, mode = 'full' }) => {
  const changeTypeIcons: Record<string, string> = {
    added: '+',
    modified: '~',
    deleted: '−',
  };

  const changeTypeLabels: Record<string, string> = {
    added: '新增',
    modified: '修改',
    deleted: '删除',
  };

  const changeTypeClasses: Record<string, string> = {
    added: 'compare-element--added',
    modified: 'compare-element--modified',
    deleted: 'compare-element--deleted',
  };

  const hasProperties = element.propertyDifferences && element.propertyDifferences.length > 0;

  return (
    <div className={`compare-element ${changeTypeClasses[element.changeType] || ''}`}>
      <div className="compare-element-header" onClick={onToggle}>
        <span className="compare-element-icon">{changeTypeIcons[element.changeType] || '•'}</span>
        <span className="compare-element-type">{changeTypeLabels[element.changeType]}</span>
        <span className="compare-element-class">{element.className}</span>
        <span className="compare-element-code" title={element.code}>
          {element.code}
        </span>
        <span className="compare-element-id">{element.elementId.slice(0, 8)}...</span>
        {hasProperties && (
          <span className="compare-expand-icon">{isExpanded ? '▼' : '▶'}</span>
        )}
      </div>
      {isExpanded && hasProperties && (
        <div className="compare-properties">
          {element.propertyDifferences!.map((prop: PropertyDifference, idx: number) => (
            <div key={idx} className="compare-property">
              {mode === 'full' && (
                <>
                  <span className="compare-property-name">{prop.propertyName}:</span>
                  <span className="compare-property-old">{String(prop.oldValue)}</span>
                  <span className="compare-property-arrow">→</span>
                  <span className="compare-property-new">{String(prop.newValue)}</span>
                </>
              )}
              {mode === 'source' && (
                <>
                  <span className="compare-property-name">{prop.propertyName}:</span>
                  <span className="compare-property-old">{String(prop.oldValue)}</span>
                </>
              )}
              {mode === 'target' && (
                <>
                  <span className="compare-property-name">{prop.propertyName}:</span>
                  <span className="compare-property-new">{String(prop.newValue)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// Display name for debugging
ElementChangeRow.displayName = 'ElementChangeRow';

// Export for testing
export { ElementChangeRow };

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ChangesetCompare: React.FC<ChangesetCompareProps> = React.memo(({
  iModelId: _iModelId,
  changesets,
  currentChangesetId,
  isVisible,
  onClose,
  preselectedVersions,
}) => {
  const [sourceChangeset, setSourceChangeset] = useState<string>('');
  const [targetChangeset, setTargetChangeset] = useState<string>('');

  // Apply preselected versions when they change
  React.useEffect(() => {
    if (preselectedVersions?.sourceChangesetId) {
      setSourceChangeset(preselectedVersions.sourceChangesetId);
    }
    if (preselectedVersions?.targetChangesetId) {
      setTargetChangeset(preselectedVersions.targetChangesetId);
    }
  }, [preselectedVersions]);
  const [comparisonResult, setComparisonResult] = useState<ChangesetComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedElements, setExpandedElements] = useState<Set<string>>(new Set());

  const handleCompare = useCallback(async () => {
    if (!sourceChangeset || !targetChangeset) {
      setError('请选择源版本和目标版本');
      return;
    }

    if (sourceChangeset === targetChangeset) {
      setError('源版本和目标版本不能相同');
      return;
    }

    setIsLoading(true);
    setError(null);
    setComparisonResult(null);

    try {
      // Call RPC method to compare changesets
      const result = await OpenCloudRpcInterface.getClient().compareChangesets(
        _iModelId,
        sourceChangeset,
        targetChangeset
      );

      setComparisonResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '对比失败');
    } finally {
      setIsLoading(false);
    }
  }, [_iModelId, sourceChangeset, targetChangeset]);

  const toggleElement = useCallback((elementId: string) => {
    setExpandedElements((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(elementId)) {
        newSet.delete(elementId);
      } else {
        newSet.add(elementId);
      }
      return newSet;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setExpandedElements((prev) => {
      const newSet = new Set(prev);
      const allExpanded = ids.every((id) => newSet.has(id));
      if (allExpanded) {
        ids.forEach((id) => newSet.delete(id));
      } else {
        ids.forEach((id) => newSet.add(id));
      }
      return newSet;
    });
  }, []);

  const setCompareToCurrent = useCallback(() => {
    if (currentChangesetId) {
      setTargetChangeset(currentChangesetId);
    }
  }, [currentChangesetId]);

  const setCompareFromPrevious = useCallback(() => {
    if (!currentChangesetId || changesets.length < 2) return;

    const sorted = [...changesets].sort((a, b) => a.index - b.index);
    const currentIndex = sorted.findIndex((cs) => cs.id === currentChangesetId);

    if (currentIndex > 0) {
      setSourceChangeset(sorted[currentIndex - 1].id);
      setTargetChangeset(currentChangesetId);
    }
  }, [currentChangesetId, changesets]);

  if (!isVisible) return null;

  // Sort changesets by index (ascending)
  const sortedChangesets = [...changesets].sort((a, b) => a.index - b.index);

  const sourceCs = sortedChangesets.find((cs) => cs.id === sourceChangeset);
  const targetCs = sortedChangesets.find((cs) => cs.id === targetChangeset);

  const addedElements = comparisonResult?.changedElements.filter((e) => e.changeType === 'added') ?? [];
  const modifiedElements = comparisonResult?.changedElements.filter((e) => e.changeType === 'modified') ?? [];
  const deletedElements = comparisonResult?.changedElements.filter((e) => e.changeType === 'deleted') ?? [];

  const addedIds = addedElements.map((e) => e.elementId);
  const deletedIds = deletedElements.map((e) => e.elementId);

  return (
    <div className="cs-compare-panel">
      <div className="cs-compare-header">
        <span className="cs-compare-title">版本对比</span>
        <button type="button" className="cs-compare-close" onClick={onClose} aria-label="关闭">
          <SvgClose />
        </button>
      </div>

      <div className="cs-compare-controls">
        <div className="cs-compare-selects">
          <div className="cs-compare-field">
            <label>源版本</label>
            <select
              value={sourceChangeset}
              onChange={(e) => setSourceChangeset(e.target.value)}
              className="cs-compare-select"
            >
              <option value="">选择版本...</option>
              {sortedChangesets.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  #{cs.index} {cs.description || cs.displayName || '(无描述)'}
                  {cs.id === currentChangesetId ? ' [当前]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="cs-compare-arrow">→</div>

          <div className="cs-compare-field">
            <label>目标版本</label>
            <select
              value={targetChangeset}
              onChange={(e) => setTargetChangeset(e.target.value)}
              className="cs-compare-select"
            >
              <option value="">选择版本...</option>
              {sortedChangesets.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  #{cs.index} {cs.description || cs.displayName || '(无描述)'}
                  {cs.id === currentChangesetId ? ' [当前]' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="cs-compare-quick-actions">
          <button type="button" className="cs-compare-quick-btn" onClick={setCompareFromPrevious}>
            对比上一版本
          </button>
          <button type="button" className="cs-compare-quick-btn" onClick={setCompareToCurrent}>
            目标设为当前
          </button>
        </div>

        <button
          type="button"
          className="cs-compare-btn"
          onClick={handleCompare}
          disabled={isLoading || !sourceChangeset || !targetChangeset}
        >
          {isLoading ? '对比中...' : '开始对比'}
        </button>
      </div>

      {error && <div className="cs-compare-error">{error}</div>}

      {comparisonResult?.featureAvailable === false && (
        <div className="cs-compare-error" data-testid="compare-unavailable">
          变更对比功能暂不可用（后端未实现，规划中）
        </div>
      )}

      {comparisonResult && comparisonResult.featureAvailable !== false && (
        <div className="cs-compare-result">
          <div className="cs-compare-summary">
            <div className="cs-compare-diffbar">
              {comparisonResult.addedCount > 0 && (
                <div
                  className="cs-diffbar-segment cs-diffbar-segment--added"
                  style={{
                    flex: comparisonResult.addedCount,
                  }}
                  title={`新增 ${comparisonResult.addedCount}`}
                />
              )}
              {comparisonResult.modifiedCount > 0 && (
                <div
                  className="cs-diffbar-segment cs-diffbar-segment--modified"
                  style={{
                    flex: comparisonResult.modifiedCount,
                  }}
                  title={`修改 ${comparisonResult.modifiedCount}`}
                />
              )}
              {comparisonResult.deletedCount > 0 && (
                <div
                  className="cs-diffbar-segment cs-diffbar-segment--deleted"
                  style={{
                    flex: comparisonResult.deletedCount,
                  }}
                  title={`删除 ${comparisonResult.deletedCount}`}
                />
              )}
            </div>
            <div className="cs-compare-stats">
              <div className="cs-compare-stat cs-compare-stat--added">
                <span className="cs-compare-stat-number">{comparisonResult.addedCount}</span>
                <span className="cs-compare-stat-label">新增</span>
              </div>
              <div className="cs-compare-stat cs-compare-stat--modified">
                <span className="cs-compare-stat-number">{comparisonResult.modifiedCount}</span>
                <span className="cs-compare-stat-label">修改</span>
              </div>
              <div className="cs-compare-stat cs-compare-stat--deleted">
                <span className="cs-compare-stat-number">{comparisonResult.deletedCount}</span>
                <span className="cs-compare-stat-label">删除</span>
              </div>
              {comparisonResult.totalBytesChanged !== undefined && (
                <div className="cs-compare-stat">
                  <span className="cs-compare-stat-number">
                    {(comparisonResult.totalBytesChanged / 1024).toFixed(1)}KB
                  </span>
                  <span className="cs-compare-stat-label">变更大小</span>
                </div>
              )}
            </div>
          </div>

          <div className="cs-compare-split">
            {/* Source pane */}
            <div className="cs-compare-pane">
              <div className="cs-compare-pane-header">
                <span className="cs-compare-pane-title">源版本</span>
                {sourceCs && (
                  <span className="cs-compare-pane-subtitle">
                    #{sourceCs.index} {sourceCs.description || sourceCs.displayName || ''}
                  </span>
                )}
                {deletedIds.length > 0 && (
                  <button
                    type="button"
                    className="cs-compare-pane-action"
                    onClick={() => toggleAll(deletedIds)}
                  >
                    展开/收起
                  </button>
                )}
              </div>
              <div className="cs-compare-pane-body">
                {deletedElements.length === 0 && modifiedElements.length === 0 && (
                  <div className="cs-compare-pane-empty">无变更</div>
                )}
                {deletedElements.map((el) => (
                  <ElementChangeRow
                    key={`src-${el.elementId}`}
                    element={el}
                    isExpanded={expandedElements.has(el.elementId)}
                    onToggle={() => toggleElement(el.elementId)}
                    mode="source"
                  />
                ))}
                {modifiedElements.map((el) => (
                  <ElementChangeRow
                    key={`src-${el.elementId}`}
                    element={el}
                    isExpanded={expandedElements.has(el.elementId)}
                    onToggle={() => toggleElement(el.elementId)}
                    mode="source"
                  />
                ))}
              </div>
            </div>

            {/* Target pane */}
            <div className="cs-compare-pane">
              <div className="cs-compare-pane-header">
                <span className="cs-compare-pane-title">目标版本</span>
                {targetCs && (
                  <span className="cs-compare-pane-subtitle">
                    #{targetCs.index} {targetCs.description || targetCs.displayName || ''}
                  </span>
                )}
                {addedIds.length > 0 && (
                  <button
                    type="button"
                    className="cs-compare-pane-action"
                    onClick={() => toggleAll(addedIds)}
                  >
                    展开/收起
                  </button>
                )}
              </div>
              <div className="cs-compare-pane-body">
                {addedElements.length === 0 && modifiedElements.length === 0 && (
                  <div className="cs-compare-pane-empty">无变更</div>
                )}
                {modifiedElements.map((el) => (
                  <ElementChangeRow
                    key={`tgt-${el.elementId}`}
                    element={el}
                    isExpanded={expandedElements.has(el.elementId)}
                    onToggle={() => toggleElement(el.elementId)}
                    mode="target"
                  />
                ))}
                {addedElements.map((el) => (
                  <ElementChangeRow
                    key={`tgt-${el.elementId}`}
                    element={el}
                    isExpanded={expandedElements.has(el.elementId)}
                    onToggle={() => toggleElement(el.elementId)}
                    mode="target"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Display name for debugging
ChangesetCompare.displayName = 'ChangesetCompare';

export default ChangesetCompare;
