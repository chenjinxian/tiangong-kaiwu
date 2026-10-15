/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Access Control Client — 官方 iTwin Platform access-control 成员路由（Sync S3 重写）。
 *
 * 成员面为 users-scoped：`/accesscontrol/itwins/:id/members/users`（旧实现误挂
 * `/itwins/:id/members`，对现 hub 必 404）。
 * 契约取证：imodelhub-services/src/access-control/access-control.controller.ts +
 * dto/create/create-member.dto.ts（**CreateUserMemberDto = {email, userId?, roleIds?}**
 * ——角色字段是复数 roleIds 数组，非单数 roleId）+ dto/update/update-member.dto.ts
 * （UpdateUserMemberDto = {roleIds?}）+ dto/response/{member,role}-response.dto.ts。
 */

import { getValidAccessToken } from '../../../features/auth/services/auth/client.js';
import { fetchWithAuth } from '../../api/httpClient.js';

export interface ITwinMemberRole {
  id: string;
  displayName: string;
}

export interface ITwinMember {
  id: string;
  email: string;
  roles: ITwinMemberRole[];
}

/** POST members/users 请求体（后端 CreateUserMemberDto：email 必填，roleIds 数组可选） */
export interface AddUserMemberRequest {
  email: string;
  roleIds: string[];
}

/** PATCH members/users/:memberId 请求体（后端 UpdateUserMemberDto） */
export interface UpdateUserMemberRequest {
  roleIds?: string[];
}

/**
 * PATCH 响应的 member 原始形态——该路由回 roleIds 数组（非列表/添加路由的 roles
 * 对象数组），与 ITwinMember 不同形，勿混用；需要角色名时拿 roleIds 去 listRoles 对表。
 */
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

interface UserMembersEnvelope {
  members?: ITwinMember[];
}

interface RolesEnvelope {
  roles?: ITwinRole[];
}

const membersRoot = (iTwinId: string) => `/accesscontrol/itwins/${iTwinId}/members/users`;

/** 列出 iTwin 的用户成员（GET members/users → {members}） */
export async function listUserMembers(iTwinId: string): Promise<ITwinMember[]> {
  const response = await fetchWithAuth(membersRoot(iTwinId));
  const data = (await response.json()) as UserMembersEnvelope;
  return data.members ?? [];
}

/**
 * 添加用户成员（POST members/users，响应为 {members:[member]} 单元素数组包络）。
 * 后端按 email 邀请/挂角色；permission: ITWINS_MODIFY。
 */
export async function addUserMember(iTwinId: string, request: AddUserMemberRequest): Promise<ITwinMember> {
  const response = await fetchWithAuth(membersRoot(iTwinId), {
    method: 'POST',
    body: JSON.stringify(request),
  });
  const data = (await response.json()) as UserMembersEnvelope;
  const member = data.members?.[0];
  if (!member) {
    throw new Error('Add member succeeded but the response carried no member');
  }
  return member;
}

/**
 * 更新用户成员角色（PATCH members/users/:memberId）。
 * 注意返回的是 roleIds 形态的原始 member（见 UserMemberPatchResult）。
 */
export async function updateUserMember(
  iTwinId: string,
  memberId: string,
  patch: UpdateUserMemberRequest,
): Promise<UserMemberPatchResult> {
  const response = await fetchWithAuth(`${membersRoot(iTwinId)}/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  const data = (await response.json()) as { member?: UserMemberPatchResult };
  if (!data.member) {
    throw new Error('Update member succeeded but the response carried no member');
  }
  return data.member;
}

/** 移除用户成员（DELETE members/users/:memberId） */
export async function removeUserMember(iTwinId: string, memberId: string): Promise<void> {
  await fetchWithAuth(`${membersRoot(iTwinId)}/${memberId}`, { method: 'DELETE' });
}

/** 列出 iTwin 角色（GET itwins/:id/roles → {roles[].id/displayName}）；permission: ITWINS_WEBVIEW */
export async function listRoles(iTwinId: string): Promise<ITwinRole[]> {
  const response = await fetchWithAuth(`/accesscontrol/itwins/${iTwinId}/roles`);
  const data = (await response.json()) as RolesEnvelope;
  return data.roles ?? [];
}

/**
 * Get access token for access control operations（SDK 回调出口，barrel 消费为
 * getAccessControlAuthorization；沿用既有裸 token 口径）
 */
export async function getAuthorization(): Promise<string> {
  return getValidAccessToken();
}
