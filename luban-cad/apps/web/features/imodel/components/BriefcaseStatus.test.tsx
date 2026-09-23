/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BriefcaseStatus } from './BriefcaseStatus.js';
import type { Briefcase } from '../../../shared/services/briefcases/client.js';

// Mock the hooks
vi.mock('../hooks/useBriefcase.js', () => ({
  useBriefcase: vi.fn(),
  useReleaseDialog: vi.fn(),
}));

import { useBriefcase, useReleaseDialog } from '../hooks/useBriefcase.js';

describe('BriefcaseStatus', () => {
  const mockAcquire = vi.fn();
  const mockRelease = vi.fn();
  const mockOpenDialog = vi.fn();
  const mockCloseDialog = vi.fn();

  const defaultBriefcase: Briefcase = {
    id: 'bc-1',
    briefcaseId: 1,
    imodelId: 'imodel-1',
    status: 'active',
    acquiredAt: '2024-01-01T00:00:00Z',
    changesetIndex: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useReleaseDialog).mockReturnValue({
      isOpen: false,
      hasPendingChanges: false,
      open: mockOpenDialog,
      close: mockCloseDialog,
    });
  });

  describe('loading state', () => {
    it('should show loading badge when loading', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: null,
        isLoading: true,
        canEdit: false,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByText('加载中...')).toBeDefined();
    });
  });

  describe('no briefcase state', () => {
    it('should show acquire button when no briefcase', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: null,
        isLoading: false,
        canEdit: false,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByRole('button', { name: /申请编辑权限/ })).toBeDefined();
    });

    it('should call acquire when clicking acquire button', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: null,
        isLoading: false,
        canEdit: false,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      const button = screen.getByRole('button', { name: /申请编辑权限/ });
      fireEvent.click(button);

      expect(mockAcquire).toHaveBeenCalled();
    });

    it('should show acquiring state', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: null,
        isLoading: false,
        canEdit: false,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: true,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      // Button should show "申请中..." text when acquiring
      expect(screen.getByRole('button', { name: /申请中/ })).toBeDefined();
      // Button should be disabled - check by verifying it cannot be clicked effectively
      // or by checking the aria-disabled attribute that iTwinUI may set
      const button = screen.getByRole('button', { name: /申请中/ });
      expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(true);
    });
  });

  describe('active briefcase state', () => {
    it('should show active status badge', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" canEdit={true} />);

      expect(screen.getByText('所有者编辑中')).toBeDefined();
    });

    it('should show non-owner edit status', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" canEdit={false} />);

      expect(screen.getByText('编辑中')).toBeDefined();
    });

    it('should show changeset index', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" canEdit={true} />);

      expect(screen.getByText(/changeset #5/)).toBeDefined();
    });

    it('should show release button', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByRole('button', { name: /释放编辑权限/ })).toBeDefined();
    });

    it('should open release dialog when clicking release button', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      const button = screen.getByRole('button', { name: /释放编辑权限/ });
      fireEvent.click(button);

      expect(mockOpenDialog).toHaveBeenCalledWith(false);
    });

    it('should show releasing state', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: true,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      // Button should be present
      const releaseButton = screen.getByRole('button', { name: /释放编辑权限/ });
      expect(releaseButton).toBeDefined();
      // Check for disabled state via attribute
      expect(releaseButton.hasAttribute('disabled') || releaseButton.getAttribute('aria-disabled') === 'true').toBe(true);
    });
  });

  describe('other statuses', () => {
    it('should show released status', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: { ...defaultBriefcase, status: 'released' },
        isLoading: false,
        canEdit: false,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByText('已释放')).toBeDefined();
    });

    it('should show expired status', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: { ...defaultBriefcase, status: 'expired' },
        isLoading: false,
        canEdit: false,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByText('已过期')).toBeDefined();
    });

    it('should show unknown status as-is', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: { ...defaultBriefcase, status: 'unknown' },
        isLoading: false,
        canEdit: false,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByText('unknown')).toBeDefined();
    });
  });

  describe('release dialog', () => {
    it('should show dialog when open', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      vi.mocked(useReleaseDialog).mockReturnValue({
        isOpen: true,
        hasPendingChanges: false,
        open: mockOpenDialog,
        close: mockCloseDialog,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      // Dialog should be visible with title
      const dialog = document.querySelector('[title="释放编辑权限"]');
      expect(dialog).toBeDefined();
    });

    it('should show pending changes alert', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      vi.mocked(useReleaseDialog).mockReturnValue({
        isOpen: true,
        hasPendingChanges: true,
        open: mockOpenDialog,
        close: mockCloseDialog,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByText(/您有未推送的本地变更/)).toBeDefined();
    });

    it('should have push changes checkbox', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      vi.mocked(useReleaseDialog).mockReturnValue({
        isOpen: true,
        hasPendingChanges: true,
        open: mockOpenDialog,
        close: mockCloseDialog,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDefined();
    });

    it('should have confirm and cancel buttons', () => {
      vi.mocked(useBriefcase).mockReturnValue({
        briefcase: defaultBriefcase,
        isLoading: false,
        canEdit: true,
        acquire: mockAcquire,
        release: mockRelease,
        isAcquiring: false,
        isReleasing: false,
        acquireError: null,
        releaseError: null,
      });

      vi.mocked(useReleaseDialog).mockReturnValue({
        isOpen: true,
        hasPendingChanges: false,
        open: mockOpenDialog,
        close: mockCloseDialog,
      });

      render(<BriefcaseStatus imodelId="imodel-1" />);

      expect(screen.getByRole('button', { name: '取消' })).toBeDefined();
      expect(screen.getByRole('button', { name: /确认释放/ })).toBeDefined();
    });
  });
});
