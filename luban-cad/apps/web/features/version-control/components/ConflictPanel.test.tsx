/*-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConflictPanel } from './ConflictPanel.js';
import type { ConflictDetectionResult, ConflictResolution } from '@luban-cad/shared';

const mockConflictResult: ConflictDetectionResult = {
  hasConflicts: true,
  totalConflicts: 2,
  conflicts: [
    {
      id: 'conflict-1',
      elementId: '0x1',
      type: 'modify-modify',
      localVersion: {
        elementId: '0x1',
        className: 'Generic:PhysicalObject',
        code: 'WALL-001',
        properties: { height: 3000 },
        lastModifiedBy: 'user@local',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      },
      remoteVersion: {
        elementId: '0x1',
        className: 'Generic:PhysicalObject',
        code: 'WALL-001',
        properties: { height: 3500 },
        lastModifiedBy: 'user@remote',
        lastModifiedAt: '2024-01-02T00:00:00Z',
      },
      baseVersion: {
        elementId: '0x1',
        className: 'Generic:PhysicalObject',
        code: 'WALL-001',
        properties: { height: 2800 },
      },
      isResolved: false,
    },
    {
      id: 'conflict-2',
      elementId: '0x2',
      type: 'delete-modify',
      localVersion: {
        elementId: '0x2',
        className: 'Generic:PhysicalObject',
        code: 'BEAM-001',
        properties: { length: 5000 },
        lastModifiedBy: 'user@local',
        lastModifiedAt: '2024-01-01T00:00:00Z',
      },
      remoteVersion: {
        elementId: '0x2',
        className: 'Generic:PhysicalObject',
        code: 'BEAM-001',
        properties: {},
        lastModifiedBy: 'user@remote',
        lastModifiedAt: '2024-01-02T00:00:00Z',
      },
      isResolved: false,
    },
  ],
  summary: {
    modifyModify: 1,
    deleteModify: 1,
    modifyDelete: 0,
    addAdd: 0,
  },
  targetChangesetId: 'change-2',
  currentChangesetId: 'change-1',
};

const mockNoConflictResult: ConflictDetectionResult = {
  hasConflicts: false,
  totalConflicts: 0,
  conflicts: [],
  summary: {
    modifyModify: 0,
    deleteModify: 0,
    modifyDelete: 0,
    addAdd: 0,
  },
  targetChangesetId: 'change-2',
  currentChangesetId: 'change-1',
};

describe('ConflictPanel', () => {
  const defaultProps = {
    detectionResult: mockConflictResult,
    isVisible: true,
    onClose: vi.fn(),
    onResolve: vi.fn(),
  };

  it('renders conflict summary correctly', () => {
    render(<ConflictPanel {...defaultProps} />);

    // Dialog title is rendered as title attribute in iTwinUI
    expect(document.querySelector('[title="冲突检测"]')).toBeTruthy();
    expect(screen.queryByText('总冲突数：')).toBeTruthy();
    expect(screen.queryByText('2')).toBeTruthy();
  });

  it('renders conflict type summary tags', () => {
    render(<ConflictPanel {...defaultProps} />);

    expect(screen.queryByText(/双方修改: 1/)).toBeTruthy();
    expect(screen.queryByText(/删除-修改: 1/)).toBeTruthy();
  });

  it('renders conflict items with expandable details', () => {
    render(<ConflictPanel {...defaultProps} />);

    expect(screen.queryByText('WALL-001')).toBeTruthy();
    expect(screen.queryByText('BEAM-001')).toBeTruthy();
  });

  it('expands conflict details when clicked', () => {
    render(<ConflictPanel {...defaultProps} />);

    const conflictHeader = screen.getByText('WALL-001');
    fireEvent.click(conflictHeader.closest('.conflict-header')!);

    expect(screen.queryByText('双方修改')).toBeTruthy();
    expect(screen.queryByText('您的版本（本地）')).toBeTruthy();
    expect(screen.queryByText('对方版本（远程）')).toBeTruthy();
  });

  it('allows selecting resolution strategy', () => {
    render(<ConflictPanel {...defaultProps} />);

    const conflictHeader = screen.getByText('WALL-001');
    fireEvent.click(conflictHeader.closest('.conflict-header')!);

    const useLocalButton = screen.getByText('使用我的');
    fireEvent.click(useLocalButton);

    expect(useLocalButton.classList.contains('selected')).toBe(true);
  });

  it('shows no conflicts message when no conflicts detected', () => {
    render(<ConflictPanel {...defaultProps} detectionResult={mockNoConflictResult} />);

    expect(screen.queryByText(/未检测到冲突/)).toBeTruthy();
    expect(screen.queryByText('继续拉取')).toBeTruthy();
  });

  it('disables resolve button when not all conflicts resolved', () => {
    render(<ConflictPanel {...defaultProps} />);

    // Button shows remaining conflicts count and is disabled
    const resolveButton = screen.getByText(/还需解决 2 个冲突/);
    expect(resolveButton).toBeTruthy();
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn();
    render(<ConflictPanel {...defaultProps} onClose={onClose} />);

    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onResolve when all conflicts resolved and button clicked', () => {
    const onResolve = vi.fn();
    render(<ConflictPanel {...defaultProps} onResolve={onResolve} />);

    // Expand first conflict and resolve it
    const firstConflict = screen.getByText('WALL-001').closest('.conflict-header')!;
    fireEvent.click(firstConflict);
    fireEvent.click(screen.getByText('使用我的'));

    // Expand second conflict and resolve it
    const secondConflict = screen.getByText('BEAM-001').closest('.conflict-header')!;
    fireEvent.click(secondConflict);
    fireEvent.click(screen.getAllByText('使用我的')[1]);

    // Now click the resolve button
    const resolveButton = screen.getByText('应用解决方案');
    expect(resolveButton).toBeTruthy();
    fireEvent.click(resolveButton);

    expect(onResolve).toHaveBeenCalledWith({
      'conflict-1': 'local',
      'conflict-2': 'local',
    });
  });

  it('does not render when not visible', () => {
    render(<ConflictPanel {...defaultProps} isVisible={false} />);

    expect(document.querySelector('[title="冲突检测"]')).toBeFalsy();
  });

  it('does not render when detectionResult is null', () => {
    render(<ConflictPanel {...defaultProps} detectionResult={null} />);

    expect(document.querySelector('[title="冲突检测"]')).toBeFalsy();
  });
});
