/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * e2e 常量（形态对齐 apps/web/e2e/fixtures.ts；值按 web-next 现场钉死）：
 * - TEST_USER：本栈种子账号（与旧应用一致，hub imodelhub-services 自带）；
 * - SEED_PROJECT_NAME / E2E_IMODEL_NAME：种子数据按名引用（E2E Seed 为 e2e
 *   名下自管库——auth.setup 确保在场且 initialized；中文只进本文件常量，
 *   勿在 spec 内内联中文字面量做匹配键以外的用途）。
 */

export const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#',
  name: 'Test User',
};

export const SEED_PROJECT_NAME = '测试项目';

export const E2E_IMODEL_NAME = 'E2E Seed';
