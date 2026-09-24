/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Undo/Redo Toolbar Component
 * Provides undo/redo buttons with history dropdown
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Tooltip } from '@itwin/itwinui-react';
import { undoManager, type UndoableOperation } from './UndoManager.js';
import './UndoRedoToolbar.css';

interface UndoRedoToolbarProps {
  /** Optional className for styling */
  className?: string;
}

/**
 * Toolbar with undo/redo buttons and history dropdown
 * Follows display-test-app's toolbar patterns
 */
export const UndoRedoToolbar: React.FC<UndoRedoToolbarProps> = ({ className = '' }) => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState('');
  const [redoLabel, setRedoLabel] = useState('');
  const [history, setHistory] = useState<readonly UndoableOperation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showHistory, setShowHistory] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);

  // Subscribe to undo manager state changes
  useEffect(() => {
    const handleStateChange = (state: { canUndo: boolean; canRedo: boolean; undoLabel: string; redoLabel: string }) => {
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
      setUndoLabel(state.undoLabel);
      setRedoLabel(state.redoLabel);
    };

    const handleHistoryChange = () => {
      setHistory(undoManager.history);
      setCurrentIndex(undoManager.currentIndex);
      setIsUndoing(undoManager.isUndoing);
      setIsRedoing(undoManager.isRedoing);
    };

    // Initial state
    handleStateChange({
      canUndo: undoManager.canUndo,
      canRedo: undoManager.canRedo,
      undoLabel: undoManager.undoLabel,
      redoLabel: undoManager.redoLabel,
    });
    handleHistoryChange();

    undoManager.onStateChanged.addListener(handleStateChange);
    undoManager.onHistoryChanged.addListener(handleHistoryChange);

    return () => {
      undoManager.onStateChanged.removeListener(handleStateChange);
      undoManager.onHistoryChanged.removeListener(handleHistoryChange);
    };
  }, []);

  const handleUndo = useCallback(async () => {
    if (!canUndo || isUndoing) return;
    setShowHistory(false);
    await undoManager.undo();
  }, [canUndo, isUndoing]);

  const handleRedo = useCallback(async () => {
    if (!canRedo || isRedoing) return;
    setShowHistory(false);
    await undoManager.redo();
  }, [canRedo, isRedoing]);

  const handleHistoryClick = useCallback((index: number) => {
    setShowHistory(false);
    void undoManager.jumpTo(index);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void handleUndo();
      }
      // Ctrl/Cmd + Shift + Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        void handleRedo();
      }
      // Ctrl/Cmd + Y = Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        void handleRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  return (
    <div className={`undo-redo-toolbar ${className}`}>
      {/* Undo Button */}
      <Tooltip content={`撤销${undoLabel ? `: ${undoLabel}` : ''} (Ctrl+Z)`} placement="bottom">
        <button
          type="button"
          className={`undo-redo-btn ${!canUndo ? 'disabled' : ''} ${isUndoing ? 'active' : ''}`}
          onClick={handleUndo}
          disabled={!canUndo || isUndoing}
        >
          <UndoIcon />
        </button>
      </Tooltip>

      {/* Redo Button */}
      <Tooltip content={`重做${redoLabel ? `: ${redoLabel}` : ''} (Ctrl+Shift+Z)`} placement="bottom">
        <button
          type="button"
          className={`undo-redo-btn ${!canRedo ? 'disabled' : ''} ${isRedoing ? 'active' : ''}`}
          onClick={handleRedo}
          disabled={!canRedo || isRedoing}
        >
          <RedoIcon />
        </button>
      </Tooltip>

      {/* History Dropdown Toggle */}
      <Tooltip content="历史记录" placement="bottom">
        <button
          type="button"
          className="undo-redo-history-toggle"
          onClick={() => setShowHistory(!showHistory)}
        >
          <ChevronIcon direction={showHistory ? 'up' : 'down'} />
        </button>
      </Tooltip>

      {/* History Dropdown */}
      {showHistory && (
        <div className="undo-redo-history-dropdown">
          <div className="undo-redo-history-header">
            <span>操作历史</span>
            <button
              type="button"
              className="undo-redo-clear-btn"
              onClick={() => {
                undoManager.clear();
                setShowHistory(false);
              }}
            >
              清除
            </button>
          </div>
          <div className="undo-redo-history-list">
            {history.length === 0 ? (
              <div className="undo-redo-history-empty">暂无历史记录</div>
            ) : (
              history.map((op, index) => (
                <button
                  key={op.id}
                  type="button"
                  className={`undo-redo-history-item ${index === currentIndex ? 'current' : ''}`}
                  onClick={() => handleHistoryClick(index)}
                >
                  <span className="undo-redo-history-dot">
                    {index === currentIndex ? '●' : index < currentIndex ? '✓' : '○'}
                  </span>
                  <span className="undo-redo-history-text">{op.description}</span>
                  <span className="undo-redo-history-time">
                    {new Date(op.timestamp).toLocaleTimeString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {showHistory && (
        <div
          className="undo-redo-backdrop"
          onClick={() => setShowHistory(false)}
          role="presentation"
        />
      )}
    </div>
  );
};

// Icon Components
const UndoIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const RedoIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </svg>
);

interface ChevronIconProps {
  direction: 'up' | 'down';
}

const ChevronIcon: React.FC<ChevronIconProps> = ({ direction }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transform: direction === 'up' ? 'rotate(180deg)' : 'none' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default UndoRedoToolbar;
