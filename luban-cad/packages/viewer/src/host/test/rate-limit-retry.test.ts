/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * M2 自动 429 等待单元测试：解析后端 JSON `retryAfter`、单次/累计预算、
 * 长窗口快速失败、request class 安装。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class WebAppRpcRequestMock {
    public metadata = { status: 0, message: '' };
    public transientFaults = 0;

    public constructor(public client?: unknown, public operation?: unknown, public parameters?: unknown[]) {}

    protected computeRetryAfter(attempts: number): number {
      this.recordTransientFault();
      return 500 * (attempts + 1);
    }

    protected recordTransientFault(): void {
      ++this.transientFaults;
    }

    protected resetTransientFaultCount(): void {
      this.transientFaults = 0;
    }
  }

  const protocol = { requestType: WebAppRpcRequestMock };
  return {
    WebAppRpcRequestMock,
    protocol,
    getClientForInterface: vi.fn(() => ({ configuration: { protocol } })),
  };
});

vi.mock('@itwin/core-common', () => ({
  WebAppRpcRequest: mocks.WebAppRpcRequestMock,
  RpcManager: { getClientForInterface: mocks.getClientForInterface },
}));

import {
  baseTransientBackoffMs,
  decideRateLimitWait,
  installRateLimitAwareRequests,
  MAX_SINGLE_RATE_LIMIT_WAIT_MS,
  MAX_TOTAL_RATE_LIMIT_WAIT_MS,
  MIN_RATE_LIMIT_WAIT_MS,
  parseRateLimitRetryAfterMs,
  RateLimitAwareRpcRequest,
  RateLimitWaitBudget,
} from '../rate-limit-retry.js';

const RATE_LIMITED = (retryAfter: unknown) => JSON.stringify({ code: 'RATE_LIMIT_EXCEEDED', retryAfter });

/** 暴露 protected computeRetryAfter + mock 基类的 transient 计数。 */
class TestRequest extends RateLimitAwareRpcRequest {
  public retryFor(attempts: number): number {
    return this.computeRetryAfter(attempts);
  }

  public setResponse(status: number, message: string): void {
    this.metadata.status = status;
    this.metadata.message = message;
  }

  public get faults(): number {
    return (this as unknown as { transientFaults: number }).transientFaults;
  }
}

function createRequest(): TestRequest {
  return new TestRequest({} as never, 'op', []);
}

describe('parseRateLimitRetryAfterMs', () => {
  it('解析后端 429 JSON retryAfter（秒→毫秒）', () => {
    expect(parseRateLimitRetryAfterMs(RATE_LIMITED(12))).toBe(12_000);
    expect(parseRateLimitRetryAfterMs(RATE_LIMITED(0))).toBe(0);
  });

  it('非限流码 / 非 JSON / 非法值 → undefined', () => {
    expect(parseRateLimitRetryAfterMs('')).toBeUndefined();
    expect(parseRateLimitRetryAfterMs('not-json')).toBeUndefined();
    expect(parseRateLimitRetryAfterMs(JSON.stringify({ code: 'OTHER', retryAfter: 12 }))).toBeUndefined();
    expect(parseRateLimitRetryAfterMs(JSON.stringify({ code: 'RATE_LIMIT_EXCEEDED' }))).toBeUndefined();
    expect(parseRateLimitRetryAfterMs(RATE_LIMITED('12'))).toBeUndefined();
    expect(parseRateLimitRetryAfterMs(RATE_LIMITED(-1))).toBeUndefined();
    expect(parseRateLimitRetryAfterMs(RATE_LIMITED(Number.NaN))).toBeUndefined();
  });
});

describe('RateLimitWaitBudget', () => {
  it('单次与累计上限', () => {
    const budget = new RateLimitWaitBudget();
    expect(budget.accept(MAX_SINGLE_RATE_LIMIT_WAIT_MS)).toBe(true);
    expect(budget.accept(MAX_SINGLE_RATE_LIMIT_WAIT_MS)).toBe(true);
    expect(budget.totalWaitMs).toBe(MAX_TOTAL_RATE_LIMIT_WAIT_MS);
    expect(budget.accept(1)).toBe(false);
    expect(budget.accept(MAX_SINGLE_RATE_LIMIT_WAIT_MS + 1)).toBe(false);
    expect(budget.accept(-1)).toBe(false);
  });
});

describe('decideRateLimitWait', () => {
  it('短窗口在预算内 → honor，返回 retryAfter（至少 250ms）', () => {
    const budget = new RateLimitWaitBudget();
    expect(decideRateLimitWait({ status: 429, message: RATE_LIMITED(5), attempts: 0, budget }))
      .toEqual({ honor: true, waitMs: 5_000 });
    expect(decideRateLimitWait({ status: 429, message: RATE_LIMITED(0), attempts: 0, budget }))
      .toEqual({ honor: true, waitMs: MIN_RATE_LIMIT_WAIT_MS });
  });

  it('长窗口/预算耗尽/非 429 → 不 honor，返回 base 退避', () => {
    const budget = new RateLimitWaitBudget();
    const longWait = MAX_SINGLE_RATE_LIMIT_WAIT_MS / 1000 + 1;
    expect(decideRateLimitWait({ status: 429, message: RATE_LIMITED(longWait), attempts: 0, budget }))
      .toEqual({ honor: false, waitMs: baseTransientBackoffMs(0) });

    // 两次 30s 用满预算，第三次不再 honor。
    expect(decideRateLimitWait({ status: 429, message: RATE_LIMITED(30), attempts: 0, budget }).honor).toBe(true);
    expect(decideRateLimitWait({ status: 429, message: RATE_LIMITED(30), attempts: 0, budget }).honor).toBe(true);
    expect(decideRateLimitWait({ status: 429, message: RATE_LIMITED(1), attempts: 0, budget }))
      .toEqual({ honor: false, waitMs: baseTransientBackoffMs(0) });

    expect(decideRateLimitWait({ status: 503, message: '', attempts: 1, budget }))
      .toEqual({ honor: false, waitMs: baseTransientBackoffMs(1) });
  });
});

describe('RateLimitAwareRpcRequest', () => {
  it('429 短窗口：等待并重置 transient 计数', () => {
    const request = createRequest();
    request.setResponse(429, RATE_LIMITED(5));
    expect(request.retryFor(0)).toBe(5_000);
    expect(request.faults).toBe(0);
  });

  it('429 长窗口：不等待、记 fault，走 base 退避快速失败', () => {
    const request = createRequest();
    request.setResponse(429, RATE_LIMITED(900));
    expect(request.retryFor(0)).toBe(baseTransientBackoffMs(0));
    expect(request.faults).toBe(1);
  });

  it('429 累计预算耗尽：后续请求回到 base 退避', () => {
    const request = createRequest();
    request.setResponse(429, RATE_LIMITED(30));
    expect(request.retryFor(0)).toBe(30_000);
    expect(request.retryFor(0)).toBe(30_000);
    expect(request.retryFor(0)).toBe(baseTransientBackoffMs(0));
    expect(request.faults).toBe(1);
  });

  it('非 429：交回 base（保留 Retry-After 头/普通 transient 语义）', () => {
    const request = createRequest();
    request.setResponse(503, '');
    expect(request.retryFor(1)).toBe(1_000);
    expect(request.faults).toBe(1);
  });
});

describe('installRateLimitAwareRequests', () => {
  beforeEach(() => {
    mocks.protocol.requestType = mocks.WebAppRpcRequestMock;
    mocks.getClientForInterface.mockClear();
  });

  it('替换默认 WebAppRpcRequest，且同一 protocol 只处理一次', () => {
    const definitions = [class {}, class {}, class {}] as never[];
    installRateLimitAwareRequests(definitions);

    expect(mocks.getClientForInterface).toHaveBeenCalledTimes(3);
    expect(mocks.protocol.requestType).toBe(RateLimitAwareRpcRequest);
  });
});
