/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Webhooks Client — 官方 iTwin Platform Webhooks API v2 路由（Sync S3 重写）。
 *
 * 后端控制器根为 `/webhooks`（旧实现误挂 `/itwins/:id/webhooks`，对现 hub 必 404）。
 * 契约取证：imodelhub-services/src/webhooks/webhooks.controller.ts + dto/
 * {create,update,find-all}-webhook-subscription.dto.ts + webhook-subscription-response.dto.ts。
 * 事件名形如 `iModels.iModelCreated.v1`（@luban-cad/shared webhooks types）。
 */

import { getValidAccessToken } from '../../../features/auth/services/auth/client.js';
import { fetchWithAuth } from '../../api/httpClient.js';

/** 订阅作用域（后端 WebhookScope 枚举：'Account' | 'iTwin'） */
export type WebhookScope = 'Account' | 'iTwin';

/** 单条 webhook 订阅（官方响应字段口径） */
export interface WebhookSubscription {
  id: string;
  callbackUrl: string;
  eventTypes: string[];
  scope: WebhookScope;
  scopeId: string;
  active: boolean;
  created?: string;
  modified?: string;
}

export interface CreateWebhookRequest {
  callbackUrl: string;
  eventTypes: string[];
  scope: WebhookScope;
  /** scope='iTwin' 时必填（后端 ValidateIf）；'Account' 可省 */
  scopeId?: string;
}

export type UpdateWebhookRequest = Partial<
  Pick<WebhookSubscription, 'callbackUrl' | 'eventTypes' | 'active'>
>;

interface WebhookListEnvelope {
  webhooks?: WebhookSubscription[];
}

/** 列出当前调用者的订阅；scope/scopeId 为可选过滤参数（GET /webhooks?scope=&scopeId=） */
export async function listWebhooks(scope?: WebhookScope, scopeId?: string): Promise<WebhookSubscription[]> {
  const params = new URLSearchParams();
  if (scope) {
    params.set('scope', scope);
  }
  if (scopeId) {
    params.set('scopeId', scopeId);
  }
  const query = params.toString();
  const response = await fetchWithAuth(`/webhooks${query ? `?${query}` : ''}`);
  const data = (await response.json()) as WebhookListEnvelope;
  return data.webhooks ?? [];
}

/**
 * 创建订阅（POST /webhooks → 201）。
 * 创建后默认 inactive，需 updateWebhook(id, {active:true}) 启用。
 * 后端仅在创建响应回传一次性 secret（@Expose({groups:['create']})，HMAC 验签用）——务必保存。
 */
export async function createWebhook(
  request: CreateWebhookRequest,
): Promise<WebhookSubscription & { secret?: string }> {
  const response = await fetchWithAuth('/webhooks', {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return response.json() as Promise<WebhookSubscription & { secret?: string }>;
}

/** 读取单条订阅（GET /webhooks/:webhookId） */
export async function getWebhook(webhookId: string): Promise<WebhookSubscription> {
  const response = await fetchWithAuth(`/webhooks/${webhookId}`);
  return response.json() as Promise<WebhookSubscription>;
}

/** 局部更新（PATCH /webhooks/:webhookId：callbackUrl/eventTypes/active） */
export async function updateWebhook(
  webhookId: string,
  patch: UpdateWebhookRequest,
): Promise<WebhookSubscription> {
  const response = await fetchWithAuth(`/webhooks/${webhookId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return response.json() as Promise<WebhookSubscription>;
}

/** 删除订阅（DELETE /webhooks/:webhookId → 204） */
export async function deleteWebhook(webhookId: string): Promise<void> {
  await fetchWithAuth(`/webhooks/${webhookId}`, { method: 'DELETE' });
}

/**
 * Get access token for webhooks operations（SDK 回调出口，barrel 消费为
 * getWebhooksAuthorization；沿用既有裸 token 口径）
 */
export async function getAuthorization(): Promise<string> {
  return getValidAccessToken();
}
