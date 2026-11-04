/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// 鲁班自研建模工具桶（2026-10-22 editor 模块收编 luban-cad 时设立）：
// web M4-T3 自旧应用 apps/web/features/modeling/ 移植的工具 + 基类/事件/
// 词表，随 editor 模块收编迁入本包。经包入口 editor-frontend.ts 对外导出，
// 消费方（viewer register-edit-tools 等）从 '@itwin/editor-frontend' 导入。
// 2026-11-04 X-01：CreateHoleTool/DraftFacesTool 调用后端不存在的
// createHole/draftFaces 命令（死代码），随旧编辑通道退役删除；能力表
// hole 翻 gated，拔模保持 gated。
export * from "./MirrorElementsTool";
export * from "./PatternTools";
export * from "./SolidModelingEvents";
export * from "./SolidModelingToolBase";
export * from "./messages";
