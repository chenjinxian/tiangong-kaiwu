/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for backend ProjectService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectService } from './service.js';

// Mock the iTwins client module with hoisted mocks
const { mockCreateiTwin, mockGetAsync, mockQueryAsync, mockUpdateiTwin, mockDeleteiTwin, ITwinSubClass } = vi.hoisted(() => {
  const mockCreateiTwin = vi.fn();
  const mockGetAsync = vi.fn();
  const mockQueryAsync = vi.fn();
  const mockUpdateiTwin = vi.fn();
  const mockDeleteiTwin = vi.fn();

  return {
    mockCreateiTwin,
    mockGetAsync,
    mockQueryAsync,
    mockUpdateiTwin,
    mockDeleteiTwin,
    ITwinSubClass: { Project: 'Project' },
  };
});

vi.mock('@itwin/itwins-client', () => {
  return {
    ITwinsAccessClient: vi.fn().mockImplementation(() => ({
      createiTwin: mockCreateiTwin,
      getAsync: mockGetAsync,
      queryAsync: mockQueryAsync,
      updateiTwin: mockUpdateiTwin,
      deleteiTwin: mockDeleteiTwin,
    })),
    ITwinSubClass,
  };
});

describe('ProjectService', () => {
  const mockAccessToken = 'Bearer test-token';
  const mockUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a project successfully', async () => {
      const mockITwin = {
        id: 'project-1',
        displayName: 'Test Project',
        number: 'PROJ-001',
        createdBy: 'user-123',
        createdDateTime: '2024-01-01T00:00:00Z',
      };

      mockCreateiTwin.mockResolvedValueOnce({
        data: mockITwin,
        error: null,
      });

      const result = await ProjectService.create(
        mockUserId,
        { name: 'Test Project' },
        mockAccessToken
      );

      expect(result).toEqual({
        id: 'project-1',
        name: 'Test Project',
        description: '',
        createdBy: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memberCount: 1,
        imodelCount: 0,
      });

      expect(mockCreateiTwin).toHaveBeenCalledWith(mockAccessToken, {
        displayName: 'Test Project',
        subClass: ITwinSubClass.Project,
      });
    });

    it('should throw error when access token is missing', async () => {
      await expect(
        ProjectService.create(mockUserId, { name: 'Test' }, undefined)
      ).rejects.toThrow('Access token required');
    });

    it('should throw error when API returns error', async () => {
      mockCreateiTwin.mockResolvedValueOnce({
        data: null,
        error: { message: 'Project name already exists' },
      });

      await expect(
        ProjectService.create(mockUserId, { name: 'Test' }, mockAccessToken)
      ).rejects.toThrow('Project name already exists');
    });

    it('should throw error when API returns no data', async () => {
      mockCreateiTwin.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        ProjectService.create(mockUserId, { name: 'Test' }, mockAccessToken)
      ).rejects.toThrow('Failed to create project');
    });

    it('should use number as name fallback when displayName is empty', async () => {
      const mockITwin = {
        id: 'project-1',
        displayName: '',
        number: 'PROJ-001',
        createdBy: 'user-123',
        createdDateTime: '2024-01-01T00:00:00Z',
      };

      mockCreateiTwin.mockResolvedValueOnce({
        data: mockITwin,
        error: null,
      });

      const result = await ProjectService.create(
        mockUserId,
        { name: '' },
        mockAccessToken
      );

      expect(result.name).toBe('PROJ-001');
    });

    it('should use default name when both displayName and number are empty', async () => {
      const mockITwin = {
        id: 'project-1',
        displayName: '',
        number: '',
        createdBy: 'user-123',
        createdDateTime: '2024-01-01T00:00:00Z',
      };

      mockCreateiTwin.mockResolvedValueOnce({
        data: mockITwin,
        error: null,
      });

      const result = await ProjectService.create(
        mockUserId,
        { name: '' },
        mockAccessToken
      );

      expect(result.name).toBe('Unnamed Project');
    });
  });

  describe('getById', () => {
    it('should get project by ID successfully', async () => {
      const mockITwin = {
        id: 'project-1',
        displayName: 'Test Project',
        createdBy: 'user-123',
        createdDateTime: '2024-01-01T00:00:00Z',
      };

      mockGetAsync.mockResolvedValueOnce({
        data: mockITwin,
        error: null,
      });

      const result = await ProjectService.getById('project-1', mockUserId, mockAccessToken);

      expect(result).toEqual({
        id: 'project-1',
        name: 'Test Project',
        description: '',
        createdBy: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memberCount: 1,
        imodelCount: 0,
      });

      expect(mockGetAsync).toHaveBeenCalledWith(mockAccessToken, 'project-1');
    });

    it('should return null when access token is missing', async () => {
      const result = await ProjectService.getById('project-1', mockUserId, undefined);
      expect(result).toBeNull();
      expect(mockGetAsync).not.toHaveBeenCalled();
    });

    it('should return null when API returns error', async () => {
      mockGetAsync.mockResolvedValueOnce({
        data: null,
        error: { message: 'Project not found' },
      });

      const result = await ProjectService.getById('project-1', mockUserId, mockAccessToken);
      expect(result).toBeNull();
    });

    it('should return null when API returns no data', async () => {
      mockGetAsync.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await ProjectService.getById('project-1', mockUserId, mockAccessToken);
      expect(result).toBeNull();
    });

    it('should return null when API throws exception', async () => {
      mockGetAsync.mockRejectedValueOnce(new Error('Network error'));

      const result = await ProjectService.getById('project-1', mockUserId, mockAccessToken);
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should list projects with default pagination', async () => {
      const mockITwins = [
        { id: '1', displayName: 'Project 1', createdBy: 'user-1', createdDateTime: '2024-01-01T00:00:00Z' },
        { id: '2', displayName: 'Project 2', createdBy: 'user-2', createdDateTime: '2024-01-02T00:00:00Z' },
      ];

      mockQueryAsync.mockResolvedValueOnce({
        data: mockITwins,
        error: null,
      });

      const result = await ProjectService.list(mockUserId, 1, 20, mockAccessToken);

      expect(result.projects).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);

      expect(mockQueryAsync).toHaveBeenCalledWith(
        mockAccessToken,
        undefined,
        expect.objectContaining({
          subClass: ITwinSubClass.Project,
          skip: 0,
          top: 20,
        })
      );
    });

    it('should list projects with custom pagination', async () => {
      const mockITwins = [{ id: '3', displayName: 'Project 3', createdBy: 'user-3', createdDateTime: '2024-01-03T00:00:00Z' }];

      mockQueryAsync.mockResolvedValueOnce({
        data: mockITwins,
        error: null,
      });

      const result = await ProjectService.list(mockUserId, 3, 10, mockAccessToken);

      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(mockQueryAsync).toHaveBeenCalledWith(
        mockAccessToken,
        undefined,
        expect.objectContaining({
          skip: 20,
          top: 10,
        })
      );
    });

    it('should return empty list when access token is missing', async () => {
      const result = await ProjectService.list(mockUserId, 1, 20, undefined);

      expect(result.projects).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockQueryAsync).not.toHaveBeenCalled();
    });

    it('should return empty list when API returns error', async () => {
      mockQueryAsync.mockResolvedValueOnce({
        data: null,
        error: { message: 'Access denied' },
      });

      const result = await ProjectService.list(mockUserId, 1, 20, mockAccessToken);

      expect(result.projects).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty list when API throws exception', async () => {
      mockQueryAsync.mockRejectedValueOnce(new Error('Network error'));

      const result = await ProjectService.list(mockUserId, 1, 20, mockAccessToken);

      expect(result.projects).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle empty data array', async () => {
      mockQueryAsync.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await ProjectService.list(mockUserId, 1, 20, mockAccessToken);

      expect(result.projects).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('update', () => {
    it('should update project successfully', async () => {
      const existingITwin = {
        id: 'project-1',
        displayName: 'Old Name',
        createdBy: 'user-123',
        createdDateTime: '2024-01-01T00:00:00Z',
      };

      const updatedITwin = {
        id: 'project-1',
        displayName: 'New Name',
        createdBy: 'user-123',
        createdDateTime: '2024-01-01T00:00:00Z',
      };

      mockGetAsync.mockResolvedValueOnce({
        data: existingITwin,
        error: null,
      });

      mockUpdateiTwin.mockResolvedValueOnce({
        data: updatedITwin,
        error: null,
      });

      const result = await ProjectService.update(
        'project-1',
        mockUserId,
        { name: 'New Name' },
        mockAccessToken
      );

      expect(result).toEqual({
        id: 'project-1',
        name: 'New Name',
        description: '',
        createdBy: 'user-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        memberCount: 1,
        imodelCount: 0,
      });

      expect(mockUpdateiTwin).toHaveBeenCalledWith(
        mockAccessToken,
        'project-1',
        {
          displayName: 'New Name',
          subClass: ITwinSubClass.Project,
        }
      );
    });

    it('should return null when access token is missing', async () => {
      const result = await ProjectService.update(
        'project-1',
        mockUserId,
        { name: 'New Name' },
        undefined
      );

      expect(result).toBeNull();
    });

    it('should return null when project does not exist', async () => {
      mockGetAsync.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await ProjectService.update(
        'project-1',
        mockUserId,
        { name: 'New Name' },
        mockAccessToken
      );

      expect(result).toBeNull();
      expect(mockUpdateiTwin).not.toHaveBeenCalled();
    });

    it('should return null when update API returns error', async () => {
      const existingITwin = {
        id: 'project-1',
        displayName: 'Old Name',
        createdBy: 'user-123',
        createdDateTime: '2024-01-01T00:00:00Z',
      };

      mockGetAsync.mockResolvedValueOnce({
        data: existingITwin,
        error: null,
      });

      mockUpdateiTwin.mockResolvedValueOnce({
        data: null,
        error: { message: 'Update failed' },
      });

      const result = await ProjectService.update(
        'project-1',
        mockUserId,
        { name: 'New Name' },
        mockAccessToken
      );

      expect(result).toBeNull();
    });

    it('should handle update exception', async () => {
      mockGetAsync.mockRejectedValueOnce(new Error('Network error'));

      const result = await ProjectService.update(
        'project-1',
        mockUserId,
        { name: 'New Name' },
        mockAccessToken
      );

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete project successfully', async () => {
      mockDeleteiTwin.mockResolvedValueOnce({
        error: null,
      });

      const result = await ProjectService.delete('project-1', mockUserId, mockAccessToken);

      expect(result).toBe(true);
      expect(mockDeleteiTwin).toHaveBeenCalledWith(mockAccessToken, 'project-1');
    });

    it('should return false when access token is missing', async () => {
      const result = await ProjectService.delete('project-1', mockUserId, undefined);

      expect(result).toBe(false);
      expect(mockDeleteiTwin).not.toHaveBeenCalled();
    });

    it('should return false when API returns error', async () => {
      mockDeleteiTwin.mockResolvedValueOnce({
        error: { message: 'Cannot delete project with iModels' },
      });

      const result = await ProjectService.delete('project-1', mockUserId, mockAccessToken);

      expect(result).toBe(false);
    });

    it('should return false when API throws exception', async () => {
      mockDeleteiTwin.mockRejectedValueOnce(new Error('Network error'));

      const result = await ProjectService.delete('project-1', mockUserId, mockAccessToken);

      expect(result).toBe(false);
    });
  });

  describe('search', () => {
    it('should search projects successfully', async () => {
      const mockITwins = [
        { id: '1', displayName: 'Alpha Project', createdBy: 'user-1', createdDateTime: '2024-01-01T00:00:00Z' },
        { id: '2', displayName: 'Beta Project', createdBy: 'user-2', createdDateTime: '2024-01-02T00:00:00Z' },
      ];

      mockQueryAsync.mockResolvedValueOnce({
        data: mockITwins,
        error: null,
      });

      const result = await ProjectService.search(mockUserId, 'project', mockAccessToken);

      expect(result).toHaveLength(2);
      expect(mockQueryAsync).toHaveBeenCalledWith(
        mockAccessToken,
        undefined,
        expect.objectContaining({
          subClass: ITwinSubClass.Project,
          search: 'project',
          top: 50,
        })
      );
    });

    it('should return empty array when access token is missing', async () => {
      const result = await ProjectService.search(mockUserId, 'project', undefined);

      expect(result).toEqual([]);
      expect(mockQueryAsync).not.toHaveBeenCalled();
    });

    it('should return empty array when API returns error', async () => {
      mockQueryAsync.mockResolvedValueOnce({
        data: null,
        error: { message: 'Search failed' },
      });

      const result = await ProjectService.search(mockUserId, 'project', mockAccessToken);

      expect(result).toEqual([]);
    });

    it('should return empty array when API throws exception', async () => {
      mockQueryAsync.mockRejectedValueOnce(new Error('Network error'));

      const result = await ProjectService.search(mockUserId, 'project', mockAccessToken);

      expect(result).toEqual([]);
    });

    it('should handle empty search results', async () => {
      mockQueryAsync.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await ProjectService.search(mockUserId, 'nonexistent', mockAccessToken);

      expect(result).toEqual([]);
    });
  });
});
