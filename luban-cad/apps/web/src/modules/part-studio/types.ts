/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * part-studio 模块契约类型（M3 Task 2）。
 */

import type {
  LubanFeatureType,
  LubanTopologyId,
  PatternParams,
  SketchPlaneDto,
} from '@luban-cad/shared';

/**
 * body 产出型特征（B6 M-A3.2a 单一真源）：这些特征的 insert 在 N>1 authored active
 * body 时必须显式 targetBodyId（后端 op 边界同口径）。**本常量不驱动 target UI**
 * （R1/Critical 1 后：手动 target 下拉给无拾取耦合的 insert 通道，fillet 按拾取边
 * 父体自动推导，chamfer/shell 禁提交）——仅作为 PartStudioSession `hasBodies`
 * 的 legacy 回退判据（body 读面不可用时树内是否有产体特征）。
 */
export const BODY_PRODUCING_FEATURE_TYPES: readonly LubanFeatureType[] = [
  'extrude',
  'revolve',
  'booleanAdd',
  'booleanSubtract',
  'booleanBodies',
  'loft',
  'sweep',
  'mirror',
  'pattern',
  // 2026-11-08：体修改型新特征同列（消隐回退/插入后取景/无读面时的 hasBodies
  // 判定一致；不是第二套体模型，均为标准 insertFeature 输出）。
  'featurePattern',
  'featureMirror',
  'moveFace',
  'faceExtrude',
  'transform',
  'splitPart',
];

/**
 * 画布拾取类型（spec §5 上下文敏感模型：右键菜单按 kind 重构）。
 * 2026-11-12：草图编辑态实体/控制点选择并入同一选择权威（ADR-0018），
 * 但不投影到 connection.selectionSet（非 iModel 元素）。
 */
export type CanvasSelectionKind = 'part' | 'face' | 'edge' | 'vertex' | 'feature' | 'sketchEntity' | 'sketchConstraint';

/**
 * 画布选择集条目——viewport pick → store 回流的寻址单位
 *（选择驱动 UI：ribbon 组重排/高亮、画布右键按 kind 重构的依据）。
 * T5 定宿主（T2 挂账「CanvasSelection 无宿主」收口）：存 store.canvas
 * .selection；label/featureType 为可选显示/路由元数据（featureType 是
 * 「编辑特征」路由 tools.run 的目标 toolId）。
 * M-A5.2 T1：face/edge 条目携带宿主 body + 持久拓扑 id（子实体选择不经
 * SelectionSet，由工具写入）。
 */
export interface CanvasSelection {
  kind: CanvasSelectionKind;
  id: string;
  /** 显示名（菜单标签「删除 {{name}}」插值；缺省回退 id）。 */
  label?: string;
  /** kind=feature 时的特征类型（edit 模式 FeatureDialog 的寻址元数据，如 extrude）。 */
  featureType?: string;
  /** face/edge/vertex 必填：所属 BodySolid 元素 id（=getBodies.bodyKey）。 */
  ownerBodyKey?: string;
  /** face/edge 持久拓扑 id（edge=ref.edge；face=resolveFaceRef.ref）；vertex 无持久契约。 */
  topologyId?: LubanTopologyId;
  /**
   * face/edge 会话级 cache id（仅拾取工具活跃期间有效；工具退出即失效）。
   * 面/边删除通道用它调用 solidModelingIpc.deleteSubEntities；缺失时删除项
   * 禁用（须重新拾取），不得把它当作持久标识）。
   */
  cacheId?: number;
  /** kind=sketchEntity：所属草图特征 id（updateSketch 寻址）。 */
  sketchId?: string;
  /** kind=sketchEntity：草图实体 id（SketchEntityDto.id）。 */
  entityId?: number;
  /** 拾取部位：曲线本体或控制点（控制点后续拖拽差异化用）。 */
  sketchPart?: 'curve' | 'handle';
  /** 控制点序号（sketchPart=handle；端点/圆心/样条控制点统一序号）。 */
  handleIndex?: number;
  /** kind=sketchConstraint：尺寸/约束 id（SketchConstraintDto.id）。 */
  constraintId?: number;
}

/** 特征条目（双段树特征段视图模型；数据由消费方注入——壳期空集，RPC 接线后走 react-query）。 */
export interface FeatureNode {
  id: string;
  name: string;
  /** 特征类型（:type 筛选依据；ribbon 工具 id 同族命名，如 sketch/extrude/fillet）。 */
  type: string;
  /** 重生成失败（os-11：出错特征红色显示）。 */
  hasError: boolean;
  /** 有警告（:warnings 筛选依据）。 */
  hasWarning?: boolean;
  /** 已抑制（os-11：抑制斜体；:suppressed 筛选依据）。 */
  isSuppressed: boolean;
  /** 已隐藏（:hidden 筛选依据；画布隐藏集 store.canvas.hiddenIds 叠加其上）。 */
  isHidden: boolean;
  /** 使用/更改的变量名（:variable 筛选依据，区分大小写）。 */
  variables?: readonly string[];
}

/** 零件条目（双段树零件段视图模型；注入口径同 FeatureNode）。 */
export interface PartNode {
  id: string;
  name: string;
  isHidden: boolean;
  hasError?: boolean;
  /** W1.5b：逐 body 体积（mm³，质量属性读面；缺省=未读取/不可用，不显示）。 */
  volumeMm3?: number;
}

/** 双段树活动段（os-11 左栏：特征列表 / 零件列表）。 */
export type TreeTab = 'features' | 'parts';

/**
 * 右侧停靠面板活动页签（沿用旧应用 EditorDockPanel 三类：
 * 工具设置 / 版本历史 / 显示设置）。
 */
export type DockTab = 'toolSettings' | 'history' | 'display';

/** tree 切片——树选中/展开 + 双段活动段（spec §3 编辑器会话态）。 */
export interface PartStudioTreeState {
  activeTab: TreeTab;
  selectedNodeIds: readonly string[];
  expandedNodeIds: readonly string[];
}

/** dock 切片——停靠页签与开合。 */
export interface PartStudioDockState {
  activeTab: DockTab;
  isOpen: boolean;
}

/** tool 切片——当前激活工具（ribbon/画布拾取的会话锚点）。 */
export interface PartStudioToolState {
  activeToolId: string | null;
}

/** sketch 切片——草图模式（ribbon 变身/栅格覆盖层/树红显的开关源）。 */
export interface PartStudioSketchState {
  isActive: boolean;
  activeSketchId: string | null;
  /**
   * M6-a T5：活动草图平面（世界系米制三向量，SketchPlaneDto）。
   * 数据源两条：① SketchDialog 确认链（onConfirm → 宿主 PartStudioCanvas 经
   * sketchPlaneFromOption 映射下发 setActiveSketchPlane）；② 树「编辑草图」入口
   * （M6-b T1：FeatureTree.handleEditSketch 自树行 params.plane 回显——shared v1.7
   * SketchDto.plane 落库回传链）。绘制工具取点投影与 AccuDraw 锁定以此为草图面。
   * null=契约缺省 XY@z=0（insertSketch op 省略 plane 键的同义语义，与后端
   * planeZ v1 一致）。
   */
  activeSketchPlane: SketchPlaneDto | null;
  /** v1.23（ADR-0004）：构造模式——新绘制曲线带 construction=true，不参与面域。 */
  constructionMode?: boolean;
  /**
   * ADR-0018 S1f：进入草图的相机意图。true=新建草图（按平面法向定向并快照，
   * 退出恢复）；false/缺省=编辑既有草图（Onshape live：不转正、不取景、退出不
   * 回放），显式“正视草图平面”由草图对话框按钮承担。
   */
  orientCameraOnEnter?: boolean;
  /**
   * ADR-0018 S1g：草图对话框「显示约束」开关（Onshape live 默认勾选）。
   * false 时隐藏约束 glyph 与尺寸标注覆盖层（live 实测两者同时消失），
   * 一并关闭其选中/双击改值拾取；缺省 true。
   */
  showConstraints?: boolean;
}

/** commandPalette 切片——命令搜索面板（alt+/）开关 + 查询词 + ribbon 亮显。 */
export interface PartStudioCommandPaletteState {
  isOpen: boolean;
  /** 当前查询词（ribbon「亮显工具栏中的工具」的数据源；T4）。 */
  query: string;
  /** 亮显开关（os-23 勾选，默认开）。 */
  highlightEnabled: boolean;
}

/** canvas 切片——画布选择集（viewport pick → store 回流）+ 会话隐藏集。 */
export interface PartStudioCanvasState {
  /** 画布选择集（右键菜单按 primary.kind 重构的依据；T6 viewport pick 接线后写入）。 */
  selection: readonly CanvasSelection[];
  /** 隐藏集（画布菜单「隐藏」的会话记录；FeatureOverrideProvider 消费、:hidden 叠加）。 */
  hiddenIds: readonly string[];
}

/**
 * dialog 切片——画布内联非模态对话框的宿主寻址（T6：FeatureDialog/SketchDialog
 * 由 PartStudioCanvas 按 active 渲染）。feature 段双模式（M4-T6 拉伸闭环）：
 * - mode 'new'：ribbon「拉伸」创建路由（featureType 即提交 op 的特征类型）；
 * - mode 'edit'：树上「编辑…」路由（featureId 为宿主 FeatureDialog 的
 *   重挂 key——M3-T6 台账①根治本地态跨特征残留；featureName/featureType
 *   供标题与后续 updateParams 路由）。
 * sketch=新建草图（ribbon newSketch 激活路由）。
 */
export type PartStudioDialogState =
  | { active: null }
  /** B5：patternKind 为 ribbon 入口的初始阵列类型（LinearPattern→linear、CircularPattern→circular）；
   * 对话框内仍可自由切换（参数化特征载荷 kind 以对话框当前值为准）。 */
  | {
    active: 'feature';
    mode: 'new';
    featureType: LubanFeatureType;
    patternKind?: PatternParams['kind'];
    /** 打开对话框时的预选面快照（抽壳：对话框打开会暂停选择工具并清空选择，
     *  必须在路由时捕获输入面）。 */
    inputFaces?: readonly CanvasSelection[];
  }
  | { active: 'feature'; mode: 'edit'; featureId: string; featureName: string; featureType: string }
  | { active: 'sketch'; sketchId: string | null };

/**
 * viewOnly 切片——仅查看模式（T7 汉堡菜单「切换到仅查看模式」切换；
 * os-24 菜单项 checkmark 数据源，后续消费面：ribbon 只读态/编辑工具禁用）。
 */
export interface PartStudioViewOnlyState {
  isActive: boolean;
}

/** 默认几何图元（Onshape 初始树：Origin + Top/Front/Right 三基准面）。 */
export type DatumId = 'origin' | 'top' | 'front' | 'right';

/**
 * datum 切片——默认几何图元可见性/展开/选中（2026-11-02 Onshape 对齐）。
 * **合成 id 不进入 tree.selectedNodeIds / canvas.hiddenIds**：这些 id 不是 iModel
 * element，误传给 EmphasizeElements/hideElements 会产生无效元素操作。
 */
export interface PartStudioDatumState {
  /** 有效可见性（树/装饰件消费；由 Session 按模型/草图状态实时同步）。 */
  visibility: Record<DatumId, boolean>;
  /** 用户眼睛按钮覆盖（仅 scope 切换时清空；优先于自动规则）。 */
  visibilityOverrides: Partial<Record<DatumId, boolean>>;
  expanded: boolean;
  selectedId: DatumId | null;
}

/**
 * part-studio 编辑器会话态聚合（spec §3 五分法：编辑器会话态唯一归属
 * zustand；服务端态归 react-query、运行时态归 viewer，不进本类型）。
 */
export interface PartStudioState {
  tree: PartStudioTreeState;
  dock: PartStudioDockState;
  tool: PartStudioToolState;
  sketch: PartStudioSketchState;
  commandPalette: PartStudioCommandPaletteState;
  canvas: PartStudioCanvasState;
  dialog: PartStudioDialogState;
  viewOnly: PartStudioViewOnlyState;
  datum: PartStudioDatumState;
}
