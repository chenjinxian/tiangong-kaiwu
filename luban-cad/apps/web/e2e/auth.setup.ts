/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * e2e 认证前置（setup project）：**API 取 token，零表单零限流**（M3-T8/M4-T9
 * 手法；hub 登录限流 5 次/15min IP+email 桶、注册 3 次/时——imodelhub-services
 * auth.controller @Throttle 取证，表单实时登录仅 login.spec 保留一轮）。取token
 * 三级递降，常态运行零登录请求：
 * 1. 产物缓存仍有效（GET /auth/me 200）→ 直接复用；
 * 2. 缓存过期 → POST /auth/refresh 续命（端点无限流，jwt-refresh Bearer 契约）；
 * 3. 双失（首次运行/refreshToken 轮换失效）→ 才走 POST /auth/email/login。
 *
 * 另负责种子数据自治（P2.6a 双种子）：A 旧文档（`测试项目` / `E2E Seed`，未标记，
 * 只读规格）与 B-model（`E2E B 项目` 带 data.luban.modelMode='B' / `E2E B Seed`）
 * 两个种子项目缺失则建、自管库**按名删旧建新每轮重置**（旧应用 2026-10-11 同纪律）
 * ——编辑器用例的干净事务态/特征计数依赖每轮重置；重置后轮询 baseline
 * initialized（webhook 正常 ~35s/库，最坏走 recovery checker 数分钟，预算
 * 1_300_000ms：2×550s 轮询 + 余量；P2.8 起 WA 确认前回读，无 settle）。
 * B 种子的默认 Part Studio 不预建：首开编辑器由解析器创建（scope 随 URL 派生）。
 * 其余 hub 数据零接触；需要新数据的用例自建自清（API）。
 *
 * 产物：playwright/.auth/session.json（`{ 'luban-next-auth': JSON.stringify
 * (StoredAuth) }`）——消费方经 helpers.loginWithSession addInitScript 注入。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test as setup } from '@playwright/test';
import {
  apiLogin,
  apiMeOk,
  apiRefresh,
  readSessionFile,
  SESSION_FILE,
  type StoredAuth,
} from './helpers';
import { resetE2eSeeds } from './seed';

setup('authenticate', async ({ request }) => {
  // 轮询预算放大：baseline 正常 ~35s/库，最坏走 webhook-agent recovery checker
  // （实测 2026-10-23 一轮 >4.6min——栈负载高时排队）。P2.6a 起 A+B 双种子
  // 串行重置：每个种子轮询上限 110×5s=550s，两库最坏 1100s；预算 1_300_000ms
  // 覆盖最坏链并留 auth/网络余量（L5）。P2.8 起无 settle 等待。
  setup.setTimeout(1_300_000);

  // 1) 取会话：有 refreshToken 一律先 refresh（轮换出新的成对 token）→ 真实登录
  //    （仅末级耗限流额度）。不能再“accessToken 仍有效就整体复用”：refreshToken
  //    是旋转制，若它已被别的进程/手工登录轮换，复用留下的是一条无续命能力的
  //    会话——套件跑到 token 过期才 401 团灭（2026-11-06 冷开复跑实测：setup
  //    时 access token 只剩 0.4 min，apiMeOk 通过，第二个 iModel 即刷新 401）。
  //    refresh 端点无限流，提前换新成对 token 不消耗登录额度。
  let auth: StoredAuth;
  const cached = readSessionFile();
  if (cached?.refreshToken) {
    try {
      auth = await apiRefresh(request, cached);
    } catch {
      auth = await apiLogin(request);
    }
  } else if (cached?.accessToken && (await apiMeOk(request, cached.accessToken))) {
    auth = cached;
  } else {
    auth = await apiLogin(request);
  }
  expect(auth.accessToken, 'setup 应持有可用 access token').toBeTruthy();

  // 2) A + B 双种子重置（数据态自治；人工调试库零接触）：
  //    - A 旧文档：`测试项目` / `E2E Seed`（未标记，只读规格）；
  //    - B-model：`E2E B 项目`（data.luban.modelMode='B'）/ `E2E B Seed`。
  //    逻辑在 seed.ts，供同文件多个建模用例在各自 beforeEach 复用。
  await resetE2eSeeds(request, auth.accessToken);

  // 3) 产物落盘（setup ↔ 消费方唯一交接面）
  mkdirSync('playwright/.auth', { recursive: true });
  writeFileSync(
    SESSION_FILE,
    JSON.stringify({ 'luban-next-auth': JSON.stringify(auth) }),
    'utf-8',
  );
});
