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
  selection: 'full', // M-A5.2：面/边子实体选择模式（full no-op 探针，不触发能力引导）
  sketch: 'full',
  extrude: 'full',
  fillet: 'full',
  chamfer: 'full',
  revolve: 'full', // 旋转
  sweep: 'full', // 扫掠
  loft: 'full', // 放样
  thicken: 'gated', // 加厚（无实体 FeatureOp/曲面体管道——W1.2b 诚实 gated）
  // ADR-0006 切片 A（2026-11-05）：孔走后端 hole op + HoleDialog，能力翻 full。
  hole: 'full', // 孔
  linearPattern: 'full', // 线性阵列（B5 起参数化 PART 级入口）
  circularPattern: 'full', // 环形阵列（B5 起参数化 PART 级入口）
  curvePattern: 'gated', // 曲线阵列（B5：无工具/后端面——首版 pattern 仅线性/圆周，翻 gated 诚实引导）
  mirror: 'full', // 镜像
  boolean: 'full', // 布尔运算
  splitPart: 'full', // 分割（ADR-0012 UI 面：单侧世界平面 + 偏移 + 保留侧；面/双侧/converter 未接）
  transform: 'full', // 变换（ADR-0010 UI 面：XYZ 平动/世界轴旋转/均匀缩放 + 复制；converter 未接）
  wrap: 'gated', // 包覆（无工具/后端面——W1.2b 续审计诚实 gated）
  decal: 'gated', // 印花（非几何显示特征，无工具面——W1.2b 续审计）
  // 2026-11-13：草图文本/圆锥曲线占位改 gated（有 live/帮助证据，缺字体轮廓
  // 引擎与新实体类型；点击开引导而非静默 no-op）。
  sketchText: 'gated', // 草图文本（字体轮廓引擎 + 新实体类型未实现）
  sketchConic: 'gated', // 草图圆锥曲线（conic 实体/求解器未实现）
  deleteBodies: 'gated', // 删除零件（无后端 FeatureOp——W1.2b 诚实 gated）
  modifyFillet: 'gated', // 修改圆角（无工具/后端面——W1.2b 续审计诚实 gated）
  deleteFace: 'gated', // 删除面（内核 DeleteSubEntity 0 回包——blocked-kernel）
  moveFace: 'full', // 移动面（ADR-0014 切片 1/2 + MoveFaceDialog：面 + 偏移/给定深度距离；逐面距离编辑/converter 未接）
  replaceFace: 'gated', // 替换面（editor IPC 未暴露——blocked）
  cPlane: 'full', // 平面
  userFeatures: 'gated', // 添加自定义特征（FeatureScript 自定义特征不在本版本——W1.2b 续审计）

  // —— 初始 gated 集合（spec §5；材料/外观、曲面/曲线各拆两条）——
  draft: 'gated', // 拔模
  rib: 'gated', // 筋（Onshape 工具栏补齐；无后端面，能力引导）
  shell: 'full', // 抽壳（T3 参数化 ShellDialog：移除面 + 壁厚 + 方向；Hollow 未支持）
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
  // T7 汉堡文档菜单（os-24）gated 项登记：移动/工作区还原/复制/更新/属性均无
  // 后端面（集合 15→20，capabilities.test.ts EXPECTED_GATED_IDS 已同步）；打印
  // 沿用既有 print 登记。
  moveDocument: 'gated', // 移至…
  restoreWorkspace: 'gated', // 还原已删除的工作区…
  copyWorkspace: 'gated', // 复制工作区…
  updateWorkspace: 'gated', // 更新工作区…
  workspaceProperties: 'gated', // 工作区属性…
  // M4-T8 D3 特征段头三钮（os-11 段头形态）登记：插入元素（跨 Part Studio
  // 元素插入）/暂停重建/特征历史（重生成时间）均无后端面，gated 引导
  // （集合 20→23，capabilities.test.ts EXPECTED_GATED_IDS 已同步）。
  insertElement: 'gated', // 插入元素
  pauseRebuild: 'gated', // 暂停重建
  featureHistory: 'gated', // 特征历史
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
  rib: guidanceFor('rib'),
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
  moveDocument: guidanceFor('moveDocument'),
  restoreWorkspace: guidanceFor('restoreWorkspace'),
  copyWorkspace: guidanceFor('copyWorkspace'),
  updateWorkspace: guidanceFor('updateWorkspace'),
  workspaceProperties: guidanceFor('workspaceProperties'),
  insertElement: guidanceFor('insertElement'),
  pauseRebuild: guidanceFor('pauseRebuild'),
  featureHistory: guidanceFor('featureHistory'),
  curvePattern: guidanceFor('curvePattern'),
  // W1.2b 能力真相审计（2026-11-07）：以下六项无真实 UI 面（部分后端已落），先 gated；
  // moveFace 已于 2026-11-08 接 MoveFaceDialog 翻 full。
  thicken: guidanceFor('thicken'),
  deleteBodies: guidanceFor('deleteBodies'),
  deleteFace: guidanceFor('deleteFace'),
  replaceFace: guidanceFor('replaceFace'),
  // W1.2b 续审计（2026-11-07）：其余 four full 项无真实工具面。
  wrap: guidanceFor('wrap'),
  decal: guidanceFor('decal'),
  modifyFillet: guidanceFor('modifyFillet'),
  userFeatures: guidanceFor('userFeatures'),
  // 2026-11-13：草图占位改 gated 引导。
  sketchText: guidanceFor('sketchText'),
  sketchConic: guidanceFor('sketchConic'),
};
