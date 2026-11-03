/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * Onshape 选择工具的跨组件运行时引用（右键“选中所属实体”、零件列表、
 * 命令协调器共用）。
 */
import { IModelApp } from '@itwin/core-frontend';
import { OnshapeSelectTool } from '../tools/modeling/OnshapeSelectTool.js';

export function activeOnshapeSelect(): OnshapeSelectTool | undefined {
  const tool = IModelApp.toolAdmin?.activeTool;
  return tool instanceof OnshapeSelectTool ? tool : undefined;
}

export function clearActiveOnshapeSelection(): void {
  void activeOnshapeSelect()?.clearSelection();
}

/** 只清子实体高亮、不动 store/树（零件列表选中 part 时使用）。 */
export function clearActiveOnshapeHighlight(): void {
  activeOnshapeSelect()?.clearSelectionGraphics();
}
