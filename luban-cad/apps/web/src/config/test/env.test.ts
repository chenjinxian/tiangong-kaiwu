// src/config/test/env.test.ts
//
// M3 收口 C1（终审 B1 定夺书）：hubUrl 同源化钉死——缺省=window.location.
// origin（经 vite 代理/生产 nginx 反代到 hub），杜绝绝对地址直连 :5400 绕过
// 代理触发 hub CORS 拒 `x-itwin-query-scope` 头（/documents 列表全挂的根因）。
// 测试态（jsdom，mode=test 无 .env.development 注入）走缺省分支，正好钉缺省值。

import { describe, expect, it } from 'vitest';
import { env } from '../env.js';

describe('env（构建期环境缺省）', () => {
  it('hubUrl 缺省同源（window.location.origin，走代理不直连 hub）', () => {
    expect(env.hubUrl).toBe(window.location.origin);
  });
});
