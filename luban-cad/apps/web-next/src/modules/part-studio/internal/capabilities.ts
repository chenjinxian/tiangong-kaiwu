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
 * 才走能力引导）。T4 ribbon 校准收口：27 工具 + 44 下拉子项引用的
 * capability 键已全量入册本表（ribbon-registry 测试钉死该不变式）。
 */
export const TOOL_CAPABILITIES: Record<string, Capability> = {
  // —— full 锚点（已有真实工具面；T4 ribbon 校准全量入册）——
  sketch: 'full',
  extrude: 'full',
  fillet: 'full',
  chamfer: 'full',
  revolve: 'full', // 旋转
  sweep: 'full', // 扫掠
  loft: 'full', // 放样
  thicken: 'full', // 加厚（含封闭变体）
  hole: 'full', // 孔
  linearPattern: 'full', // 线性阵列
  circularPattern: 'full', // 环形阵列
  curvePattern: 'full', // 曲线阵列
  mirror: 'full', // 镜像
  boolean: 'full', // 布尔运算
  splitPart: 'full', // 分割
  transform: 'full', // 变换（含包覆/印花）
  wrap: 'full', // 包覆
  decal: 'full', // 印花
  deleteBodies: 'full', // 删除零件
  modifyFillet: 'full', // 修改圆角
  deleteFace: 'full', // 删除面
  moveFace: 'full', // 移动面
  replaceFace: 'full', // 替换面
  cPlane: 'full', // 平面
  userFeatures: 'full', // 添加自定义特征

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
  // T5 画布右键「显示依赖项…」登记：依赖项查看器无后端面，gated 引导（集合 14→15，
  // capabilities.test.ts EXPECTED_GATED_IDS 已同步）。
  dependencies: 'gated', // 依赖项查看
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
  dependencies: guidanceFor('dependencies'),
};
