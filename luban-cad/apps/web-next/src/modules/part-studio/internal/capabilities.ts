/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 能力注册表（M3 Task 2）——完整 UI 面的落地机制（spec §5）：
 * 每工具/菜单项登记 `full | gated`；gated 项照常渲染可点，点击开能力引导
 * 对话框（不灰化不删减）。翻转 gated→full = 本文件数据变更 + 后端工作，
 * UI 零改动。初始 gated 集合钉死 spec §5：拔模/抽壳/外部螺纹/钣金系/
 * 框架系/曲面/曲线/渲染/工程图/材料/外观/通知/打印/装配体编辑。
 */

/** 能力档位：full=可用；gated=UI 全量呈现、点击走能力引导。 */
export type Capability = 'full' | 'gated';

/** 能力引导文案 i18n 键（文案本体由 locale 词表供给，引导对话框 T5+ 消费）。 */
export interface CapabilityGuidance {
  titleKey: string;
  messageKey: string;
}

/**
 * 工具/菜单项 → 能力档位。未登记默认 full（完整 UI 面：只有显式 gated
 * 才走能力引导）。full 锚点先钉现有建模工具面（ribbon T4 扩 27 工具时
 * 全量入册）。
 */
export const TOOL_CAPABILITIES: Record<string, Capability> = {
  // —— full 锚点（已有真实工具面）——
  sketch: 'full',
  extrude: 'full',
  fillet: 'full',
  chamfer: 'full',

  // —— 初始 gated 集合（spec §5；材料/外观、曲面/曲线各拆两条）——
  draft: 'gated', // 拔模
  shell: 'gated', // 抽壳
  thread: 'gated', // 外部螺纹
  sheetMetal: 'gated', // 钣金系
  frames: 'gated', // 框架系
  surfaces: 'gated', // 曲面系
  curves: 'gated', // 曲线系
  render: 'gated', // 渲染
  drawing: 'gated', // 工程图
  material: 'gated', // 材料
  appearance: 'gated', // 外观
  notifications: 'gated', // 通知
  print: 'gated', // 打印
  assemblyEdit: 'gated', // 装配体编辑
};

/** 查询工具能力档位（缺省 full）。 */
export function capabilityOf(toolId: string): Capability {
  return TOOL_CAPABILITIES[toolId] ?? 'full';
}

/** gated 判定：UI 点击路由——true 开能力引导对话框，false 正常激活工具。 */
export function isGated(toolId: string): boolean {
  return capabilityOf(toolId) === 'gated';
}

function guidanceFor(toolId: string): CapabilityGuidance {
  return {
    titleKey: `partStudio.capabilities.${toolId}.title`,
    messageKey: `partStudio.capabilities.${toolId}.message`,
  };
}

/**
 * 能力引导文案键表：键集与 gated 集合严格同步（caps.test.ts 钉死不变式），
 * 翻转 gated→full 时同步删/改本表条目。
 */
export const CAPABILITY_GUIDANCE: Record<string, CapabilityGuidance> = {
  draft: guidanceFor('draft'),
  shell: guidanceFor('shell'),
  thread: guidanceFor('thread'),
  sheetMetal: guidanceFor('sheetMetal'),
  frames: guidanceFor('frames'),
  surfaces: guidanceFor('surfaces'),
  curves: guidanceFor('curves'),
  render: guidanceFor('render'),
  drawing: guidanceFor('drawing'),
  material: guidanceFor('material'),
  appearance: guidanceFor('appearance'),
  notifications: guidanceFor('notifications'),
  print: guidanceFor('print'),
  assemblyEdit: guidanceFor('assemblyEdit'),
};
