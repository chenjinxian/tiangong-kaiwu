/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for shared package exports
 */

import { describe, expect, it } from 'vitest';

// Test that all exports are available - sorted alphabetically
import {
  type Briefcase,
  type BriefcaseDownloadResult,
  type Changeset,
  type CreateIModelRequest,
  type CreateITwinRequest,
  type IModel,
  openCloudIpcChannel,
  type OpenCloudIpcInterface,
  OpenCloudRpcInterface,
  type ITwin,
  type ITwinListResponse,
  type UpdateITwinRequest,
  // Backward compatibility aliases
  type BriefcaseInfo,
  type ChangesetInfo,
  type CreateProjectRequest,
  type Project,
  type ProjectSearchResult,
  type UpdateProjectRequest,
} from './index.js';

describe('Shared package exports', () => {
  it('should export OpenCloudRpcInterface', () => {
    expect(OpenCloudRpcInterface).toBeDefined();
    expect(OpenCloudRpcInterface.interfaceName).toBe('OpenCloudRpcInterface');
  });

  it('should export all ITwin types', () => {
    // Type-only exports should be importable
    const iTwin: ITwin = {
      id: 'test',
      displayName: 'Test',
      class: 'Project',
      subClass: 'ConstructionProject',
      status: 'Active',
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
      createdBy: 'user-1',
      lastModifiedBy: 'user-1',
    };
    expect(iTwin.id).toBe('test');

    // Verify other iTwin types are importable
    const _createRequest: CreateITwinRequest = { displayName: 'Test' };
    const _updateRequest: UpdateITwinRequest = { displayName: 'Updated' };
    const _listResponse: ITwinListResponse = {
      iTwins: [],
      _links: { self: { href: 'http://api/itwins' } },
    };
    void _createRequest;
    void _updateRequest;
    void _listResponse;
  });

  it('should export all iModel types', () => {
    // Type-only exports should be importable
    const iModel: IModel = {
      id: 'test',
      name: 'Test',
      iTwinId: 'itwin-1',
      state: 'initialized',
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
    };
    expect(iModel.id).toBe('test');

    // Verify other iModel types are importable
    const _createRequest: CreateIModelRequest = {
      name: 'Test',
      iTwinId: 'itwin-1',
    };
    void _createRequest;
  });

  it('should export briefcase types', () => {
    // Type-only exports should be importable
    const briefcase: Briefcase = {
      briefcaseId: 1,
      iModelId: 'test',
      userId: 'user-1',
      acquiredDateTime: new Date().toISOString(),
    };
    expect(briefcase.briefcaseId).toBe(1);
  });

  it('should export changeset types', () => {
    // Type-only exports should be importable
    const changeset: Changeset = {
      id: 'test',
      index: 1,
    };
    expect(changeset.id).toBe('test');
  });

  it('should support backward compatibility aliases', () => {
    // Project should work as alias for ITwin
    const project: Project = {
      id: 'test',
      displayName: 'Test',
      class: 'Project',
      subClass: 'Building',
      status: 'Active',
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
      createdBy: 'user-1',
      lastModifiedBy: 'user-1',
    };
    expect(project.id).toBe('test');

    // Old request types should work
    const _createRequest: CreateProjectRequest = { displayName: 'Test' };
    const _updateRequest: UpdateProjectRequest = { displayName: 'Updated' };
    const _searchResult: ProjectSearchResult = {
      iTwins: [],
      _links: { self: { href: 'http://api/itwins' } },
    };
    void _createRequest;
    void _updateRequest;
    void _searchResult;

    // Old briefcase/changeset types should work
    const _briefcase: BriefcaseInfo = {
      briefcaseId: 1,
      iModelId: 'test',
      userId: 'user-1',
      acquiredDateTime: new Date().toISOString(),
    };
    const _changeset: ChangesetInfo = {
      id: 'test',
      index: 1,
      briefcaseId: 1,
    };
    void _briefcase;
    void _changeset;
  });

  it('should export IPC interface types and channel constant', () => {
    const channel: string = openCloudIpcChannel;
    expect(channel).toBe('open-cloud-ipc');

    const result: BriefcaseDownloadResult = {
      fileName: '/path/to/file.bim',
      briefcaseId: 1,
      changeset: { id: 'abc', index: 0 },
    };
    expect(result.briefcaseId).toBe(1);
  });
});
