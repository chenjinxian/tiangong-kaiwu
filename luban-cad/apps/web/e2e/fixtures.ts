/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * e2e 常量（形态对齐旧应用（已删除）的 e2e/fixtures.ts；值按 web 现场钉死）：
 * - TEST_USER：本栈种子账号（与旧应用一致，hub imodelhub-services 自带）；
 * - A 旧文档种子（未标记 iTwin）：`测试项目` / `E2E Seed`——A 只读规格与文档
 *   中心/详情页真实数据锚点；人工调试库可与它同项目共存（重置只按名下库删）。
 * - B-model 种子（P2.6a）：`E2E B 项目` / `E2E B Seed`——项目以
 *   `data.luban.modelMode='B'` 标记，编辑器按 B 解析（与 VITE_B_MODEL_ENABLED
 *   旗标无关）；默认 Part Studio 由首次编辑器打开时解析器创建，scope id 从
 *   `?model=` 派生（见 helpers.openSeedImodelEditor）。
 * - 两个种子项目/库名都必须唯一且互不包含（hasText / getByRole name 均为
 *   子串匹配；`E2E B Seed` 不得被 A 的 `E2E Seed` 匹配，反之亦然）。
 * - 中文只进本文件常量，勿在 spec 内内联中文字面量做匹配键以外的用途。
 */

export const TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!@#',
  name: 'Test User',
};

/** A 旧文档（未标记）种子——只读语义，勿用作编辑规格。 */
export const SEED_PROJECT_NAME = '测试项目';
export const E2E_IMODEL_NAME = 'E2E Seed';

/** B-model 种子项目名（创建时带 `data.luban` 标记）。 */
export const B_SEED_PROJECT_NAME = 'E2E B 项目';
/** B-model 种子 iModel 名（默认 Part Studio 由首次编辑器打开创建）。 */
export const B_SEED_IMODEL_NAME = 'E2E B Seed';

/**
 * B 项目标记（wire 形态；读取侧唯一裁决点在
 * `src/clients/itwins/types.ts#isBModelItwin`——这里只是 e2e 侧按同一契约造数，
 * 不 import 应用源码，保持黑盒客户端边界）。
 */
export const B_MODEL_MARKER = {
  luban: { modelMode: 'B', schemaVersion: 1 },
} as const;
