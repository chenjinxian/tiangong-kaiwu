/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * M2 自动 429 等待（2026-11-01，ADR-0001 §15.6 唯一显式 backlog）。
 *
 * 背景：modeling-server 的全局 RPC 限流在超限时返回 429 JSON
 * `{ error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED', retryAfter: <秒> }`
 * （P2.8 起同时打 warn-once 日志）。iTwin 的 `WebAppRpcRequest` 只识别标准
 * `Retry-After` 头；头缺席时按 transient fault 退避（`transientFaultLimit=4`，
 * 总计约 5 秒）后以 "Exceeded transient fault limit" 失败。于是：
 *  - 短暂突发（retryAfter 几秒）本可自动恢复，却直接失败；
 *  - 长窗口（默认 100/15min，retryAfter 可达 900s）也不应让请求悬挂 15 分钟。
 *
 * 本模块在**应用层**子类化 `WebAppRpcRequest`，不改 itwinjs-core fork：
 *  - 解析 429 JSON body 的 `retryAfter`（兼容标准 `Retry-After` 数字头）；
 *  - 有界等待：单次 ≤ 30s、单请求累计 ≤ 60s，每次等待后重置 transient 计数，
 *    避免 4 次退避上限过早失败；
 *  - 超出预算（长窗口/累计耗尽）时不再重置 transient 计数，走 base 退避并
 *    在既有上限内快速失败——不把 15 分钟窗口变成静默悬挂。
 *
 * 安装点：`web-initializer` 在 `BentleyCloudRpcManager.initializeClient` 之后、
 * 任何 RPC 请求之前，把所有 web RPC protocol 的 `requestType` 换成
 * `RateLimitAwareRpcRequest`。IPC 通道（WebSocket）不经此路径，不受影响。
 *
 * 测试覆盖：`host/test/rate-limit-retry.test.ts`（解析/预算/决策/请求类）。
 */

import { type RpcInterfaceDefinition, RpcManager, WebAppRpcRequest } from '@itwin/core-common';

/** 单次 429 等待上限：超过即视为长窗口，快速失败而非悬挂。 */
export const MAX_SINGLE_RATE_LIMIT_WAIT_MS = 30_000;
/** 单请求累计等待上限：多次短窗口等待的总预算。 */
export const MAX_TOTAL_RATE_LIMIT_WAIT_MS = 60_000;
/** 最小等待：retryAfter=0 时避免热循环。 */
export const MIN_RATE_LIMIT_WAIT_MS = 250;

/** 429 响应体（只取限流相关字段；其余字段不参与判定）。 */
interface RateLimitResponseBody {
  code?: unknown;
  retryAfter?: unknown;
}

/**
 * 从 429 响应体解析剩余等待毫秒数。
 * 仅接受 `code === 'RATE_LIMIT_EXCEEDED'` 且 `retryAfter` 为有限非负数字的 JSON；
 * 非 JSON/其它错误码/非法值一律返回 undefined（交回 base 退避）。
 */
export function parseRateLimitRetryAfterMs(message: string): number | undefined {
  if (message.trim() === '') {
    return undefined;
  }

  let body: RateLimitResponseBody;
  try {
    body = JSON.parse(message) as RateLimitResponseBody;
  } catch {
    return undefined;
  }

  if (body.code !== 'RATE_LIMIT_EXCEEDED') {
    return undefined;
  }

  const seconds = body.retryAfter;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }

  return Math.ceil(seconds * 1000);
}

/**
 * iTwin base 的 transient 退避公式（`RpcRequest.computeRetryAfter` 同式）。
 * 在 429 长窗口/预算耗尽时使用——不调用 `super.computeRetryAfter`，因为后者
 * 会读取 `Retry-After` 头并重置 transient 计数，可能把请求重新变成长期悬挂。
 */
export function baseTransientBackoffMs(attempts: number): number {
  return (((Math.pow(2, attempts) - 1) / 2) * 500) + 500;
}

/** 单请求的 429 等待预算（单次上限 + 累计上限）。 */
export class RateLimitWaitBudget {
  private _totalWaitMs = 0;

  public constructor(
    private readonly _maxSingleWaitMs: number = MAX_SINGLE_RATE_LIMIT_WAIT_MS,
    private readonly _maxTotalWaitMs: number = MAX_TOTAL_RATE_LIMIT_WAIT_MS,
  ) {}

  /** 已接受的累计等待毫秒数（测试/诊断用）。 */
  public get totalWaitMs(): number {
    return this._totalWaitMs;
  }

  /** 接受等待则记账并返回 true；超单次/累计上限返回 false（不记账）。 */
  public accept(waitMs: number): boolean {
    if (!Number.isFinite(waitMs) || waitMs < 0) {
      return false;
    }
    if (waitMs > this._maxSingleWaitMs) {
      return false;
    }
    if (this._totalWaitMs + waitMs > this._maxTotalWaitMs) {
      return false;
    }

    this._totalWaitMs += waitMs;
    return true;
  }
}

/** 一次 429 等待决策：honor=true 时 waitMs 为实际等待；否则走 base 退避。 */
export interface RateLimitWaitDecision {
  honor: boolean;
  waitMs: number;
}

/**
 * 决策单次 429 是否值得等待。
 * - 非 429：honor=false，返回 base 退避（调用方仍交 base 处理）；
 * - 429 且 body/头给出有限 retryAfter 且在预算内：honor=true；
 * - 429 但无可用 retryAfter、超单次上限或累计预算耗尽：honor=false，返回 base 退避。
 */
export function decideRateLimitWait(args: {
  status: number;
  message: string;
  attempts: number;
  budget: RateLimitWaitBudget;
}): RateLimitWaitDecision {
  const backoffMs = baseTransientBackoffMs(args.attempts);
  if (args.status !== 429) {
    return { honor: false, waitMs: backoffMs };
  }

  const bodyWaitMs = parseRateLimitRetryAfterMs(args.message);
  if (bodyWaitMs === undefined) {
    return { honor: false, waitMs: backoffMs };
  }

  const waitMs = Math.max(MIN_RATE_LIMIT_WAIT_MS, bodyWaitMs);
  if (!args.budget.accept(waitMs)) {
    return { honor: false, waitMs: backoffMs };
  }

  return { honor: true, waitMs };
}

/**
 * 429 感知的 RPC 请求。
 *
 * 只覆盖 `computeRetryAfter`：iTwin 在 `handleTransientError` 中调用它取得
 * 等待值，并在超过 `transientFaultLimit` 时 reject。honor 分支调用
 * `resetTransientFaultCount()`，让有界等待不被 4 次上限提前截断；拒绝分支
 * 主动 `recordTransientFault()`，让长窗口在既有上限内快速失败。
 */
export class RateLimitAwareRpcRequest extends WebAppRpcRequest {
  private readonly _rateLimitBudget = new RateLimitWaitBudget();

  protected override computeRetryAfter(attempts: number): number {
    if (this.metadata.status === 429) {
      const decision = decideRateLimitWait({
        status: 429,
        message: this.metadata.message,
        attempts,
        budget: this._rateLimitBudget,
      });

      if (decision.honor) {
        this.resetTransientFaultCount();
        return decision.waitMs;
      }

      this.recordTransientFault();
      return decision.waitMs;
    }

    return super.computeRetryAfter(attempts);
  }
}

/**
 * 把 web 端所有 RPC protocol 的 requestType 换成 `RateLimitAwareRpcRequest`。
 * 仅替换仍为 iTwin 默认 `WebAppRpcRequest` 的 protocol（幂等；非 web protocol
 * 不动）。重复调用安全——已替换的 protocol 不再命中。
 */
export function installRateLimitAwareRequests(definitions: ReadonlyArray<RpcInterfaceDefinition>): void {
  const visited = new Set<unknown>();

  for (const definition of definitions) {
    const client = RpcManager.getClientForInterface(definition);
    const protocol = client.configuration.protocol;
    if (visited.has(protocol)) {
      continue;
    }
    visited.add(protocol);

    if (protocol.requestType !== WebAppRpcRequest) {
      continue;
    }

    // `requestType` 在类型上 readonly，但 RpcInterface.forward 运行时按属性读取；
    // 这是应用层唯一无需 fork 的替换点（BentleyCloudRpcManager 未提供自定义
    // request class 的公开参数）。
    (protocol as unknown as { requestType: typeof WebAppRpcRequest }).requestType = RateLimitAwareRpcRequest;
  }
}
