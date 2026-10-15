/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test user credentials for E2E testing
 * These should match the test user created in the development environment
 *
 * 常规 spec 的标准登录方式是会话注入（helpers.loginWithSession，复用 auth.setup
 * 产物，零登录请求）——新版 imodelhub 登录限流 5 次/15min（IP+email 桶），UI 实时
 * 登录仅 login.spec 保留。故此处不再提供页面级认证 fixture（authenticatedPage
 * 曾为零引用的死代码，Sync F2 已删）。
 */
export const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#',
  name: 'Test User',
};
