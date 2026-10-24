/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 跨端共享常量（M6-c 后置）：单一真源——后端 init 事务描述与前端撤销守卫
 * 消费同一字面量，防两端字面量漂移使守卫失效。
 */

/** FeatureService.ensureInitialized 建库事务的描述（EditTxn 构造参数）。
 * 前端撤销守卫据此识别「初始化事务」：撤销它会删除 BodySolid/schema 定义
 * 元素=库损坏向量，故 undo 可用性与执行入口都排除此事务。 */
export const LUBAN_INIT_TXN_DESCRIPTION = "partstudio init";
