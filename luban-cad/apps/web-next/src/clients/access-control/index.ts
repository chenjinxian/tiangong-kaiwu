/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * access-control（权限判定）数据层公共入口（M5 Task 3）：客户端类与权限
 * 词表类型的唯一汇聚面——消费方（modules/*）经此导入，客户端内部测试/页级
 * mock 仍走直连模块路径（代码库既有口径，vi.mock 命中同一解析目标）。
 */

export { AccessControlClient } from './AccessControlClient.js';
export type { PermissionMode } from './AccessControlClient.js';
