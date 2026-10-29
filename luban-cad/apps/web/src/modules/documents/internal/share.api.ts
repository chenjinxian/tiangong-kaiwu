/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ShareDocumentDialog 数据出口（Task 5）：移植自旧应用
 * apps/web shared/services/accessControl/client.ts（S3 access-control
 * 客户端，端点契约取证于 imodelhub-services access-control.controller.ts）。
 *
 * - 成员面 users-scoped：`/accesscontrol/itwins/:id/members/users`
 *   （CreateUserMemberDto = {email, userId?, roleIds?}——角色字段是复数
 *   roleIds 数组；PATCH 回 roleIds 异形原始 member，渲染勿混用 ITwinMember）；
 * - 角色面：`/accesscontrol/itwins/:id/roles` → {roles[].id/displayName}；
 * - token 经 AuthSession.getValidAccessToken（单飞刷新，过期自愈）。
 *
 * 模块私有（不经 barrel 透出）——M2 内仅 ShareDocumentDialog 消费；
 * T6 详情页复用共享对话框，不直引本文件。
 */

import { env } from '@config/env.js';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ApiClientError, parseRetryAfterSeconds } from '@clients/http/ApiClientError.js';

export interface ITwinMemberRole {
  id: string;
  displayName: string;
}

export interface ITwinMember {
  id: string;
  email: string;
  roles: ITwinMemberRole[];
}

/** POST members/users 请求体（后端 CreateUserMemberDto：email 必填，roleIds 可选）。 */
export interface AddUserMemberRequest {
  email: string;
  roleIds: string[];
}

/** PATCH members/users/:memberId 请求体（后端 UpdateUserMemberDto）。 */
export interface UpdateUserMemberRequest {
  roleIds?: string[];
}

/** PATCH 响应的 member 原始形态（roleIds 数组形态，与 ITwinMember 不同形）。 */
export interface UserMemberPatchResult {
  id: string;
  iTwinId: string;
  userId: string;
  email?: string;
  roleIds: string[];
  createdAt?: string;
  modifiedAt?: string;
}

export interface ITwinRole {
  id: string;
  displayName: string;
}

/** 带 Bearer 的认证 fetch（token 单飞刷新在 AuthSession 内部）。
 * 非 2xx 统一抛 ApiClientError（M3-T1，终审 I2 收口）——共享面的 401
 * 由此进 QueryErrorBridge 刷新重放管道，裸 Error 会失明。
 * M4-T8 T1-①：429/Retry-After 分支透出 retryAfterSeconds（与 documents.api
 * 同一解析出口）。 */
async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
  const accessToken = await AuthSession.getValidAccessToken();
  const response = await fetch(`${env.hubUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; code?: string };
    throw new ApiClientError({
      status: response.status,
      code: body.code,
      message: body.message ?? `access-control request failed (status ${response.status})`,
      retryAfterSeconds: parseRetryAfterSeconds(response),
    });
  }
  return response;
}

const membersRoot = (iTwinId: string): string => `/accesscontrol/itwins/${iTwinId}/members/users`;

/** 列出 iTwin 的用户成员（GET members/users → {members}）。 */
export async function listUserMembers(iTwinId: string): Promise<ITwinMember[]> {
  const response = await hubFetch(membersRoot(iTwinId));
  const data = (await response.json()) as { members?: ITwinMember[] };
  return data.members ?? [];
}

/** 添加用户成员（POST members/users，响应 {members:[member]} 单元素包络）。 */
export async function addUserMember(iTwinId: string, request: AddUserMemberRequest): Promise<ITwinMember> {
  const response = await hubFetch(membersRoot(iTwinId), {
    method: 'POST',
    body: JSON.stringify(request),
  });
  const data = (await response.json()) as { members?: ITwinMember[] };
  const member = data.members?.[0];
  if (!member) {
    throw new Error('Add member succeeded but the response carried no member');
  }
  return member;
}

/** 更新用户成员角色（PATCH members/users/:memberId，回 roleIds 异形原始 member）。 */
export async function updateUserMember(
  iTwinId: string,
  memberId: string,
  patch: UpdateUserMemberRequest,
): Promise<UserMemberPatchResult> {
  const response = await hubFetch(`${membersRoot(iTwinId)}/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const data = (await response.json()) as { member?: UserMemberPatchResult };
  if (!data.member) {
    throw new Error('Update member succeeded but the response carried no member');
  }
  return data.member;
}

/** 移除用户成员（DELETE members/users/:memberId）。 */
export async function removeUserMember(iTwinId: string, memberId: string): Promise<void> {
  await hubFetch(`${membersRoot(iTwinId)}/${memberId}`, { method: 'DELETE' });
}

/** 列出 iTwin 角色（GET itwins/:id/roles → {roles[].id/displayName}）。 */
export async function listRoles(iTwinId: string): Promise<ITwinRole[]> {
  const response = await hubFetch(`/accesscontrol/itwins/${iTwinId}/roles`);
  const data = (await response.json()) as { roles?: ITwinRole[] };
  return data.roles ?? [];
}
