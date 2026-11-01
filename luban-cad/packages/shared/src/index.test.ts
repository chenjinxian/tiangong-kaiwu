/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for shared package exports
 */

import { describe, expect, it } from 'vitest';

// Test that all exports are available - sorted alphabetically
// eslint-disable-next-line @itwin/no-internal-barrel-imports -- 测试目的即验证包级 barrel 导出
import {
  type Briefcase,
  type BriefcaseDownloadResult,
  type Changeset,
  type CreateIModelRequest,
  type CreateITwinRequest,
  type IModel,
  type ITwin,
  type ITwinListResponse,
  lubanIpcChannel,
  type LubanIpcInterface,
  LubanRpcInterface,
  type UpdateITwinRequest,
  // Backward compatibility aliases（单独分组，故不接主列表字母序）
  // eslint-disable-next-line sort-imports -- 兼容别名分组
  type BriefcaseInfo,
  type ChangesetInfo,
  type CreateProjectRequest,
  type Project,
  type ProjectSearchResult,
  type UpdateProjectRequest,
} from './index.js';

describe('Shared package exports', () => {
  it('should export LubanRpcInterface', () => {
    expect(LubanRpcInterface).toBeDefined();
    expect(LubanRpcInterface.interfaceName).toBe('LubanRpcInterface');
  });

  it('should export all ITwin types', () => {
    // Type-only exports should be importable
    const iTwin: ITwin = {
      id: 'test',
      displayName: 'Test',
      class: 'Endeavor',
      subClass: 'Project',
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
      // eslint-disable-next-line @typescript-eslint/naming-convention -- 官方 iTwins REST JSON 字段
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

  // 该用例专门验证旧命名别名仍可用——引用 deprecated 别名即测试目的。
  /* eslint-disable @typescript-eslint/no-deprecated -- 兼容别名契约测试 */
  it('should support backward compatibility aliases', () => {
    // Project should work as alias for ITwin
    const project: Project = {
      id: 'test',
      displayName: 'Test',
      class: 'Endeavor',
      subClass: 'Project',
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
      // eslint-disable-next-line @typescript-eslint/naming-convention -- 官方 iTwins REST JSON 字段
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
  /* eslint-enable @typescript-eslint/no-deprecated */

  it('should export IPC interface types and channel constant', () => {
    const channel: string = lubanIpcChannel;
    expect(channel).toBe('luban-ipc');
    const ipcInterface: LubanIpcInterface | undefined = undefined;
    void ipcInterface;

    const result: BriefcaseDownloadResult = {
      fileName: '/path/to/file.bim',
      briefcaseId: 1,
      changeset: { id: 'abc', index: 0 },
    };
    expect(result.briefcaseId).toBe(1);
  });
});
