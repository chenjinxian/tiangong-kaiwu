/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useITwinPermissions（ADR-0001 P0 终审修复 I3；P2.4 上提共享）：
 * 实现已移至 `@common/permissions/use-itwin-permissions.js`——编辑器与详情页
 * 共用同一 iTwin RBAC 查询（分享管理门源）。本文件保留原导入路径，避免
 * document-details 内部/测试的调用面漂移。
 */

export {
  useITwinPermissions,
  type UseITwinPermissionsResult,
} from '@common/permissions/use-itwin-permissions.js';
