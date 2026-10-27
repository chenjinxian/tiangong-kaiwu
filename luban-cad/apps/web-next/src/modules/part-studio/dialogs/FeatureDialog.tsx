/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * FeatureDialog（M3 Task 6；M4 Task 6 提交接线）：特征编辑非模态内联面板
 * （对齐 os-31）——
 * - 非模态：role=dialog + aria-modal=false + 无 backdrop 遮罩，画布区左上角
 *   内联定位（PartStudioCanvas 宿主）；对话框打开期间画布可持续拾取、
 *   视图可旋转缩放（os-31 采集对齐）；
 * - 顶置 ✓确认/✗取消（标题行首，绿✓/红✗）；
 * - 布尔作用域双页签：结果类型（实体|曲面|薄壁）× 布尔作用域（新建|加入|
 *   移除|相交），role=tablist + aria-selected；
 * - 芯片式实体选择框：初始实体（props 注入）渲染 chips + ×移除；快速拾取
 *   经 useCanvasSelection 把 store.canvas.selection 回流成 chips（按 id
 *   去重）——T5 选择驱动 hooks 的 T6 消费面（progress.md T5↔T6 一致）；
 * - 距离 + 折叠段：距离（M4-T6 新增——insertFeature extrude 的唯一可编辑
 *   量，默认 10）/方向（默认展开，正向/反向下拉）/起始偏移/对称（勾选）/
 *   拔模，aria-expanded 开合语义；
 * - 底部（M6-c T5 对齐采集规格 12-dialog-extrude-1.png：底部=透明度滑杆 +
 *   成品 + ?）：透明度滑杆（0-100，缺省 0=不透明）+ 成品按钮（=✓ 确认出口，
 *   M3 期即成品文案）+ ? 帮助（展开文案）。**透明度语义=预览透明度，🟠 挂账**——
 *   本版无视觉预览通道（useFeatureSystem previewOp 延后，insertFeature 直提交
 *   无预览帧），值仅本地态 + FeatureDialogResult.transparency 回传（接预览
 *   通道时消费）；M3 期的回滚滑杆撤出对话框（采集权威：Onshape 回滚条在特征
 *   树底部非对话框内——树回滚条归 backlog 单裁，不在本对话框复活）。
 *
 * 提交接线（M4-T6 拉伸闭环）：mode='new' 且 applyOp 在场时，✓/成品 →
 * `applyOp({ kind: 'insertFeature', featureType, params })`；成功 → toast
 *（IModelApp.notifications 标准通道，与保存错误面同管道）+ onConfirm（宿主
 * closeDialog——组件不自销，受控口径）；失败 → 就地 Alert（六态 error），
 * 对话框不关闭；提交中禁重入（两出口禁用）。非法距离校验先行（不发起 op）。
 *
 * 拉伸草图通道（M6-a T6，解「空 profile 死结」的前端最后一环）：extrude 的
 * 新建提交改走草图寻址——`params: { profile: [], distance, sketchId,
 * regionIndex }`（shared v1.6 互斥语义：sketchId 在场时 profile 须空数组，
 * 后端 zod 拒收裸空 profile；M6-c T3 起面域寻址升级为 regions 多选数组，
 * regionIndex 不再发——见下方 M6-c T3 段）。数据源裁决（两路取内聚者）：
 * - 草图列表 = 宿主（Session）自 useFeatureSystem.tree 过滤 featureType===
 *   'sketch' 经 mapFeatureEntries 命名后 props 下传——树已在 onCommitted/
 *   onAfterUndoRedo 双订刷新（建/删草图自动跟随、orderKey 有序、命名与特征
 *   树同源），不另开 listSketches 第二数据通道（useSketchSystem 移植时同款
 *   裁决：listSketches 摘要表无序无名，消费面未挂载不补）；
 * - 面域 = 选中草图后对话框直调 getSketch(connectionKey, sketchId) 读
 *   SketchRegionDto[]（面积降序，regionIndex=数组下标）——useSketchSystem
 *   的读面钉死 store.sketch.activeSketchId（草图模式身份），对话框拾取任意
 *   草图不属该通道（复用须劫持活动身份，误触草图模式变身语义），直调 RPC
 *   即最小内聚面（读操作不涉写租约；代际守卫防慢响应覆写）。
 * 交互（M6-a 最小形态，视口点击拾取归 M6-c；面域选择形态 M6-c T3 起分叉——
 * extrude 多选 chips / revolve 单选下拉，见下方 M6-c T3 段）：草图下拉
 *（多选一）；选中回显 chip「{草图名} 的面」（revolve 多面域追加 ·面域 N，
 * 对齐采集规格「Sketch 1 的 面」chips 形态），×移除=清选择。门禁（对齐 T3 zod 语义，不再空 profile 裸奔）：无草图 → 「先创建
 * 草图」提示 + 提交禁用；regions 缺省/空 → 「草图无可拉伸面域」 + 禁用；
 * 面域读取中/失败 → 禁用（失败经 role=alert 就地呈现）。布尔类型 M7 v1.10 起
 * 同样走草图通道（见下方 v1.10 段），其余特征类型走原 payload 不动。
 *
 * 布尔草图驱动（M7 v1.10，shared BooleanParams——首个里程碑）：布尔作用域页签
 * 映射 featureType（`booleanScopeFeatureType`：加入→booleanAdd、移除→
 * booleanSubtract；新建=基础类型）。映射仅作用于基础类型为 extrude/boolean* 的
 * 对话框（revolve/fillet 无草画面域工具体语义）。布尔通道复用拉伸通道的草图/
 * 面域拾取 UI（本次不做任意面拾取——保留下拉/多选 chips），载荷
 * `{sketchId, distance, regions, operation}`（无 profile 键——与内联 profile
 * 旧路径互斥，服务端 zod 拒收 mixed 形态）；symmetric 对布尔不适用（隐藏+不进载荷）。
 * 上游门禁（B1 复审 Important）：布尔特征 requiresUpstream=true，无实体（hasBodies=false）
 * 时加入/移除页签禁用 + 提交禁用 + 诚实提示（后端 op 边界同口径拒收，双层防御）；
 * 相交无后端特征类型，提交态页签禁用 + 提示（不可静默降级为并集）。
 *
 * revolve 通道（M6-b T4，照 M6-a T6 拉伸通道同构复刻）：sketchChannel 扩
 * revolve——草图/面域拾取两下拉全复用，revolve 分支增：
 * - 轴选择：getSketch entities 过滤 kind==='line'（RevolveParams.axis 的
 *   sketchEntityId 语义=草图内 line 实体 id）→ 下拉按几何判型命名（M6-c T5：
 *   端点解算坐标判向——竖直线/水平线/斜线+同类 1 基序号，对齐 Onshape 采集
 *   「线 3」美化语义；端点坐标缺失（未解算/旧后端）回退「线 {id}」——id 与
 *   载荷同值可对账不丢），缺省选第一条；无 line 实体 →
 *   「草图无可用旋转轴」提示 + 提交禁用；
 * - 全方位复选：fullRevolve 缺省 true（360° 满周）；取消勾选现角度输入——
 *   **UI 度制（用户面单位裁决），载荷前 ×π/180 转弧度**（shared
 *   RevolveParams.angle 契约 (0, 2π]，度制域 (0, 360]；180° → Math.PI 精度
 *   由单测钉死）；
 * - 载荷 `{profile: [], sketchId, regionIndex, axis: {sketchEntityId},
 *   fullRevolve, angle?}`（angle 仅 !fullRevolve 携带）；距离量对 revolve
 *   不适用——距离输入隐藏、距离校验跳过（revolve 分支独立构造器，extrude
 *   通道载荷不动）。
 *
 * 复合面域多选（M6-c T3，shared v1.8 ExtrudeParams.regions——Onshape「面和
 * 草图面域」多选语义，接替 M6-a T6 的面域单选下拉）：extrude 通道 regions>1
 * 时渲染面域多选 chips（点选切换选中态 aria-pressed，样式对齐既有 chip 家族）
 * +「全选/清空」轻量操作；缺省选中 [0]（=最大面域，v1.6 regionIndex 缺省 0
 * 的语义锚同源）；单面域保持自动 [0]（无 UI）。选中态 `selectedRegions`
 *（SketchDto.regions 面积降序下标，升序存储=载荷集语义确定性），载荷
 * `{profile: [], distance, sketchId, regions: selectedRegions,
 * ...(symmetric?{symmetric}:{})}`——**不再发 regionIndex**（shared v1.8 起
 * @deprecated，服务端 zod 与 regions 互斥拒收）。门禁追加：selectedRegions
 * 空（用户清空）→「选择至少一个面域」提示 + ✓ 禁用；regions 读取中/失败/空
 * 既有门禁不动。revolve 通道保持单选下拉 + regionIndex 载荷
 *（**裁决钉死：RevolveParams 未扩 regions——不越契约**；多面域旋转归后续
 * 契约扩展单裁），回显 chip「· 面域 N」后缀亦仅 revolve 保留（extrude 的
 * 面域选中态由多选 chips 自身 aria-pressed 呈现）。
 *
 * 对称复选（M6-b T4，extrude 通道）：Onshape 采集形态「对称」在折叠区外平铺
 *（sketchChannel 下折叠段 symmetric 隐藏，平铺复选顶替）——state 即既有
 * symmetric，随 FeatureDialogResult.symmetric 回传不变；**载荷接线已收口**
 *（T3 契约 shared v1.7 ExtrudeParams.symmetric 落地后控制器接线：勾选才带
 * symmetric:true 键，缺省省略=载荷向后兼容）。
 *
 * fillet 通道（M6-b T6，F8——**不走草图通道**：输入是体边非草画面域）：半径
 * 输入（缺省 5）+切向延伸复选（缺省 true，=FilletParams.propagateSmooth）+
 * 边 chips 列表（「边 N」1 基序号+×移除，按 filletEdgeRefKey 无关键去重——
 * 边自身 id 单键，M6-d v1.9 纯换）+「添加边」钮。**对话框驱动拾取裁决**：
 * 「添加边」启动 FilletEdgePickTool（直构+run，动态 import——工具模块静态依赖
 * editor 基座链，静态引入会强加给全部对话框消费方的 mock 面），工具每拾一条边
 * （已即时 resolveEdgeRef 换边自身持久 id 单引用）回调 chips 增行，右键/Esc/
 * 再点钮结束拾取回对话框。门禁：边集空→「选择要圆角的边」+✓禁用；半径≤0→
 * 就地 Alert（同距离校验口径）；**无 body 诚实降级**——宿主 hasBodies=false
 * （库里无实体）时「添加边」禁用+提示先建实体。载荷
 * `{radius, propagateSmooth, edges:[{edge:{nodeId,entityId}}...]}`（边自身 id
 * 透传，shared v1.9 契约；求值端 edgesFromOwnId 分裂片集合多持全入 blend）；
 * 距离量对 fillet 不适用（隐藏+校验跳过，revolve 同口径）。
 *
 * applyOp 未接线（壳期/纯展示）时确认回退纯 onConfirm（M3 语义保持）；
 * mode='edit' 且 applyOp 在场（宿主已接提交面）时 ✓/成品 禁用 + 提示行
 *「该特征类型的参数编辑即将推出」（T6 评审 M-1：updateParams 归特征对话框
 * 增强 backlog，消除「假成功」观感）。租约警示（T6 评审 I-2）：leaseOk=false
 * 时可视警示「提交将等待租约」，不硬禁用（保留陈旧租约 35s 自愈路；仅
 * canEdit 时呈现——只读权限下禁用 ✓ 后该警示是谎报，只读提示顶位）。
 * 只读写门禁（B2 发布窗实锤的前端根因，接替 T6 评审 I-1 的 store.viewOnly
 * 直读）：宿主单点下传 canEdit（!viewOnly ∧ 权限 editable，PartStudioPage
 * 合流），!canEdit 时 ✓/成品 禁用 + 诚实提示「当前为只读权限，无法提交特征」
 *——提交入口不发起 applyOp，自然不进租约获取等待环（hub 权限缺陷下只读
 * briefcase 仍可被放行写 op，卡 aria-busy 40-65s 的现场即此门缺位；hook 层
 * 另有 useFeatureSystem readonly 前置拒收兜底，两层防御纵深）。方向/对称/拔模随载荷回传
 * 但本版不进 op（shared ExtrudeParams 的 symmetric 等扩展未定稿——映射
 * 归特征对话框增强单裁，见 useFeatureSystem 头注延后项）。
 * sweep 通道（B3 v1.12）：**双草图选择器 + 语义分叉**——轮廓草图（闭合截面，服务端
 * 取最大面域外环）与路径草图（须恰为一条直线，服务端 op 边界 txn 之前拒收非线/零长）
 * 两个独立下拉（aria 文案「轮廓草图 / 路径草图」明确区分，不用几何序号）；载荷
 * `{profileSketchId, pathSketchId, bodyType:'SOLID'}`（无 distance/profile/regions 键）。
 * 门禁：两张草图均已选、互不相同、且仍存在于实时草图选项（删草图后不得留陈旧 id 放行）；
 * 草图不足两张 → 诚实提示 + 提交禁用。首版无 twist/scale/lock/guides UI（范围裁决）。
 * ribbon 入口：SweepFaces 虽是真实直改工具 id，但参数化特征链入口改道本对话框
 *（与 extrude/revolve/loft/fillet 同姿态，见 Ribbon.tsx 注）。
 *
 * Escape 关闭（M5-T1 D-T9-5）：非 iTwinUI Dialog 的自研面板吃不到官方
 * dismissal 处方——document keydown（Escape→onCancel）挂载期一次注册，
 * 对齐 canvas/CanvasContextMenu.tsx:226-234 模式（onCancel 经 ref 取用，
 * 不随 props 变化重挂）；IModelApp Escape 工具语义共存由 P1 波次放行传播
 *（viewer-next keyboard-shortcuts Escape 分支不拦断，浮层收合与工具取消
 * 两层语义并存）。M6-b T6：拾取态下 Escape 分叉=只结束拾取（stopPick）不关
 * 对话框——「Esc 结束拾取回对话框」语义优先于面板关闭。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import { SvgCheckmark, SvgClose } from '@itwin/itwinui-icons-react';
import type {
  FeatureOp,
  FeatureOpResult,
  FilletEdgeRef,
  LubanFeatureType,
  SketchEntityDto,
  SketchRegionDto,
} from '@luban-cad/shared';
import { LubanFeatureRpcInterface } from '@luban-cad/shared';
import { useCanvasSelection } from '../hooks/useCanvasSelection.js';
import { filletEdgeRefKey } from '../tools/modeling/fillet-edge-ref.js';
import './FeatureDialog.css';

/** 结果类型页签（os-31：实体|曲面|薄壁）。 */
export type FeatureResultType = 'solid' | 'surface' | 'thinWall';

/** 布尔作用域页签（os-31：新建|加入|移除|相交）。 */
export type FeatureBooleanScope = 'new' | 'add' | 'remove' | 'intersect';

/** 方向（折叠段「方向」下拉值域）。 */
export type FeatureDirection = 'forward' | 'backward';

/** 实体芯片（面和草图区域的寻址单位）。 */
export interface FeatureDialogEntity {
  id: string;
  label: string;
}

/** 草图选项（M6-a T6 拉伸草图通道的下拉寻址单位——宿主自特征树 sketch 节点映射）。 */
export interface FeatureDialogSketchOption {
  id: string;
  label: string;
}

/** 确认载荷：面板全量本地态的一次性回传（变异层接线口）。 */
export interface FeatureDialogResult {
  resultType: FeatureResultType;
  booleanScope: FeatureBooleanScope;
  entities: readonly FeatureDialogEntity[];
  direction: FeatureDirection;
  startOffset: string;
  symmetric: boolean;
  draft: string;
  /**
   * 透明度滑杆读数（M6-c T5，0-100，缺省 0=不透明）——🟠 挂账：本版无视觉
   * 预览通道（previewOp 延后），值仅回传不消费；接预览通道时作为预览帧透明度。
   *（M3 期同位的 rollback 滑杆已撤出——采集权威钉底栏=透明度，见文件头注。）
   */
  transparency: number;
  /** M6-b T6（fillet 通道）：已拾边集（边自身持久 id 单引用，shared v1.9；仅 fillet 通道携带）。 */
  filletEdges?: readonly FilletEdgeRef[];
}

export interface FeatureDialogProps {
  /** 特征名（标题=对话框可访问名，os-31「Extrude 1」；new 模式=类型标签）。 */
  featureName: string;
  /**
   * 提交模式（M4-T6）：'new'=创建（applyOp 在场即走 insertFeature 直提交）；
   * 'edit'=既有特征（本版不提交，updateParams 归特征对话框增强 backlog）。
   * 缺省 'edit'（纯展示壳期语义）。
   */
  mode?: 'new' | 'edit';
  /** 特征类型（mode='new' 时 insertFeature 的 featureType）。 */
  featureType?: LubanFeatureType;
  /** op 提交面（Session useFeatureSystem.applyOp 直通；缺省=纯回调壳期语义）。 */
  applyOp?: (op: FeatureOp) => Promise<FeatureOpResult>;
  /**
   * 写租约在持（Session useFeatureSystem.leaseOk 直通；T6 评审 I-2）——
   * false 且提交面在场时给可视警示「提交将等待租约」，**不硬禁用**（保留
   * applyOp 陈旧租约 35s 自愈路）；缺省（未接线/壳期）不警示。canEdit=false
   * 时不呈现（只读权限下提交已禁用，「等待租约」是谎报——只读提示顶位）。
   */
  leaseOk?: boolean;
  /**
   * 编辑面总门（B2 只读写门禁，M5-T3 单点合流的下游消费）：宿主
   *（PartStudioSession→Canvas）单点下传 !viewOnly ∧ 权限 editable——false 时
   * ✓/成品 禁用 + 只读提示，提交入口不发起 applyOp（不进租约获取等待环）。
   * 缺省 true（壳期/纯展示语义保持——无写路径可关；生产宿主恒显式传参）。
   */
  canEdit?: boolean;
  /** 初始实体 chips（RPC 接线前由宿主注入；缺省空集）。 */
  entities?: readonly FeatureDialogEntity[];
  /**
   * 可选草图集（M6-a T6 拉伸草图通道）：宿主（Session）自 useFeatureSystem.tree
   * 过滤 featureType==='sketch' 经 mapFeatureEntries 命名下传（「草图 N」与
   * 特征树同源同名，树刷新自动跟随）。缺省空集 → 「先创建草图」提示 + 提交
   * 禁用（T3 zod 语义：无 sketchId 的空 profile 裸奔被拒收，不再发放行）。
   */
  sketches?: readonly FeatureDialogSketchOption[];
  /**
   * iModel key（M6-a T6 面域读面 / M6-b T6 边拾取寻址）：选中草图后经 getSketch
   * 拉 SketchRegionDto[]（面积降序，regionIndex=数组下标）；fillet 通道直通
   * FilletEdgePickTool（resolveEdgeRef 寻址键）。缺省 undefined = 面域不可读
   * / 边不可拾（提交禁用 + 就地提示，不发起 RPC）。
   */
  connectionKey?: string;
  /**
   * 库内已有实体（M6-b T6 fillet 通道诚实降级门）：宿主自特征树判
   * （body 产出型条目在场：extrude/revolve/booleanAdd/booleanSubtract）——
   * false 时「添加边」禁用 + 提示先建实体（无体可拾边，不发工具）。缺省 true
   * （壳期/测试语义保持；生产宿主恒显式传参）。
   */
  hasBodies?: boolean;
  /** ✓/成品 确认出口（回传全量载荷；提交成功后由宿主 closeDialog）。 */
  onConfirm?: (result: FeatureDialogResult) => void;
  /** ✗ 取消出口。 */
  onCancel?: () => void;
}

/** 结果类型页签序（os-31）。 */
const RESULT_TYPES: readonly FeatureResultType[] = ['solid', 'surface', 'thinWall'];

/** 布尔作用域页签序（os-31）。 */
const BOOLEAN_SCOPES: readonly FeatureBooleanScope[] = ['new', 'add', 'remove', 'intersect'];

/**
 * 布尔作用域 → 特征类型（M7 v1.10）：加入→booleanAdd、移除→booleanSubtract
 *（shared BooleanParams 草图驱动——operation 由类型名映射，unite/subtract）。
 * 新建=基础特征类型（无映射）；相交无后端特征类型（M7 首版不支持）——提交态
 * 对话框里该页签**禁用**（B1 复审：不可静默降级为并集；纯展示/壳期仍可回传元数据）。
 */
export function booleanScopeFeatureType(scope: FeatureBooleanScope): LubanFeatureType | undefined {
  if (scope === 'add') return 'booleanAdd';
  if (scope === 'remove') return 'booleanSubtract';
  return undefined;
}

/** 折叠段定义（方向默认展开——主参数段；余者折叠）。 */
interface CollapsibleSection {
  id: 'direction' | 'startOffset' | 'symmetric' | 'draft';
  defaultExpanded: boolean;
}

const SECTIONS: readonly CollapsibleSection[] = [
  { id: 'direction', defaultExpanded: true },
  { id: 'startOffset', defaultExpanded: false },
  { id: 'symmetric', defaultExpanded: false },
  { id: 'draft', defaultExpanded: false },
];

/**
 * 旋转轴判型描述（M6-c T5）：线段按端点解算坐标判向 + 同类判型内 1 基序号——
 * 下拉文案「竖直线/水平线/斜线 N」（对齐 Onshape 采集的轴命名语义，替代
 * M6-b T4 的「线 {id}」裸 id 形态）。
 */
export interface AxisLineDescriptor {
  /** 草图内 line 实体 id（=载荷 axis.sketchEntityId，同值可对账）。 */
  id: number;
  /** 判型：竖直（x 相等）/水平（y 相等）/斜线；端点坐标缺失=unknown。 */
  kind: 'vertical' | 'horizontal' | 'slanted' | 'unknown';
  /** 同类判型内的 1 基序号（unknown 不编号，UI 回退「线 {id}」）。 */
  ordinal: number;
}

/** 判向容差（草图局部坐标，内部米制；sketch-offset-logic 链扩展同款 1e-6 纪律）。 */
const AXIS_COORD_EPSILON = 1e-6;

/**
 * 旋转轴判型（M6-c T5，纯函数——FeatureDialog.test 直测）：按线段两端点的
 * 解算坐标判竖直/水平/斜线。端点坐标任一缺失（未解算/旧后端不下发坐标）→
 * unknown（UI 回退「线 {id}」，载荷寻址不受影响）。序号按实体集出现顺序计。
 */
export function classifyAxisLines(entities: readonly SketchEntityDto[]): AxisLineDescriptor[] {
  const points = new Map<number, { x: number; y: number }>();
  for (const entity of entities) {
    if (entity.kind === 'point' && entity.x !== undefined && entity.y !== undefined) {
      points.set(entity.id, { x: entity.x, y: entity.y });
    }
  }
  const counters: Record<AxisLineDescriptor['kind'], number> = {
    vertical: 0,
    horizontal: 0,
    slanted: 0,
    unknown: 0,
  };
  const descriptors: AxisLineDescriptor[] = [];
  for (const entity of entities) {
    if (entity.kind !== 'line') continue;
    const p1 = points.get(entity.p1);
    const p2 = points.get(entity.p2);
    let kind: AxisLineDescriptor['kind'] = 'unknown';
    if (p1 !== undefined && p2 !== undefined) {
      if (Math.abs(p1.x - p2.x) <= AXIS_COORD_EPSILON) kind = 'vertical';
      else if (Math.abs(p1.y - p2.y) <= AXIS_COORD_EPSILON) kind = 'horizontal';
      else kind = 'slanted';
    }
    counters[kind] += 1;
    descriptors.push({ id: entity.id, kind, ordinal: counters[kind] });
  }
  return descriptors;
}

/** 草图选项缺省（M6-a T6：props 未接线/壳期空集——「先创建草图」门禁数据源；模块级常量防引用抖动）。 */
const EMPTY_SKETCHES: readonly FeatureDialogSketchOption[] = [];

/**
 * 面积读数（M6-a T6）：内部米制 m²，toPrecision(3) 去尾零（0.0025 → "0.0025"、
 * 3.14159 → "3.14"）——面域下拉的量级提示位，非精确读数（精确面积标注归
 * M6-c 视口拾取交互单裁）。
 */
function formatArea(area: number): string {
  return String(Number(area.toPrecision(3)));
}

/**
 * 特征编辑对话框（非模态内联面板）。宿主经 onConfirm/onCancel 收合——
 * 组件不自销（受控口径，与 CapabilityDialog 一致）；宿主挂
 * `key={mode==='edit' ? featureId : 'new-'+featureType}`（M3-T6 台账①：
 * 本地态跨特征复用残留的根治）。
 */
export function FeatureDialog({
  featureName,
  mode = 'edit',
  featureType,
  applyOp,
  leaseOk,
  canEdit = true,
  entities,
  sketches,
  connectionKey,
  hasBodies = true,
  onConfirm,
  onCancel,
}: FeatureDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const { selection } = useCanvasSelection();

  const [resultType, setResultType] = React.useState<FeatureResultType>('solid');
  const [booleanScope, setBooleanScope] = React.useState<FeatureBooleanScope>('new');
  const [chips, setChips] = React.useState<FeatureDialogEntity[]>([...(entities ?? [])]);
  const [distance, setDistance] = React.useState('10');
  const [direction, setDirection] = React.useState<FeatureDirection>('forward');
  const [startOffset, setStartOffset] = React.useState('');
  const [symmetric, setSymmetric] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  // 透明度滑杆（M6-c T5 对齐采集底栏；0=不透明。语义挂账见文件头注）。
  const [transparency, setTransparency] = React.useState(0);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<CollapsibleSection['id'], boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, s.defaultExpanded])) as Record<
      CollapsibleSection['id'],
      boolean
    >,
  );
  // 提交态（M4-T6）：提交中禁重入；错误就地 Alert（六态 error，对话框不关）。
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  // 卸载守卫：pending 期间宿主关闭（✗）后的迟到回包不得再 setState。
  // StrictMode 正确形态（T8 真栈冒烟修正，同 SketchDialog——原形态 dev 双挂载后
  // 恒 false，提交回包永远早退：aria-busy 永挂、onConfirm 永不执行）。
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  // Escape 关闭（M5-T1 D-T9-5）：自研非模态面板（非 iTwinUI Dialog）无官方
  // dismissal——document keydown 挂载期一次注册（Escape→onCancel），回调经
  // ref 取用，不随 props/重渲染重挂（CanvasContextMenu.tsx:226-234 同款模式；
  // IModelApp Escape 工具语义共存——P1 波次已放行传播，两层语义并存）。
  const onCancelRef = React.useRef(onCancel);
  onCancelRef.current = onCancel;
  // M6-b T6：Escape 出口经 ref 间接——拾取态下分叉为「只结束拾取」（回对话框
  // 不关面板），分叉逻辑在 stopPick 定义后回填（渲染体内同步完成，先于任何
  // 事件可达；缺省回落 onCancel 保持 M5-T1 语义）。
  const onEscapeRef = React.useRef<() => void>(() => onCancelRef.current?.());
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscapeRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
    // 监听终身一次挂载；闭包内一律走 ref（意图在此注记，非遗漏依赖）。
  }, []);
  // edit 模式且宿主已接提交面（T6 评审 M-1）：updateParams 本版不接线（特征
  // 对话框增强 backlog），✓/成品 禁用 + 提示行，消除「点确认即关面板无事发生」
  // 的假成功观感；applyOp 未接线（壳期/纯展示）保持 M3 纯回调语义。
  const editStandalone = mode === 'edit' && applyOp !== undefined;

  // 布尔作用域 → 提交特征类型（M7 v1.10）：仅拉伸/布尔对话框参与映射（revolve/fillet
  // 无草画面域工具体语义，页签保持元数据回传）；加入→booleanAdd、移除→booleanSubtract。
  const booleanScopeCapable =
    mode === 'new' &&
    (featureType === 'extrude' || featureType === 'booleanAdd' || featureType === 'booleanSubtract') &&
    applyOp !== undefined;
  const booleanScopeMapped = booleanScopeCapable ? booleanScopeFeatureType(booleanScope) : undefined;
  const effectiveFeatureType = booleanScopeMapped ?? featureType;
  // 草图通道（M6-a T6 extrude / M6-b T4 revolve；M7 v1.10 扩布尔）：新建提交走 sketchId 寻址
  //（数据源/门禁裁决见文件头注）；其余特征类型与 edit/壳期路径一概不进本通道。
  const booleanChannel =
    mode === 'new' && (effectiveFeatureType === 'booleanAdd' || effectiveFeatureType === 'booleanSubtract') && applyOp !== undefined;
  const sketchChannel =
    mode === 'new' && (effectiveFeatureType === 'extrude' || effectiveFeatureType === 'revolve' || booleanChannel) && applyOp !== undefined;
  const revolveChannel = sketchChannel && effectiveFeatureType === 'revolve';
  const extrudeChannel = sketchChannel && effectiveFeatureType === 'extrude';
  // 布尔上游门禁（B1 复审 Important）：布尔特征 requiresUpstream=true，无上游时后端
  // 只会把失败吞成 status=1 死节点（op 仍 ok:true）——UI 侧先挡：无实体时禁用
  // 加入/移除页签与提交（诚实提示），后端 op 边界另有同口径拒收（双层防御）。
  const booleanScopeNoBody = booleanScopeCapable && !hasBodies;
  const booleanUpstreamMissing = booleanChannel && !hasBodies;
  // fillet 通道（M6-b T6）：体边拾取非草画面域——不进草图通道；输入集=体上
  // 拾得的边（持久拓扑 id 对），提交面同 applyOp。
  const filletChannel = mode === 'new' && featureType === 'fillet' && applyOp !== undefined;
  // B2 loft 通道（首版两平行截面）：**双截面草图**选择器——不走 sketchChannel
  //（loft 无面域读取：服务端每草图取最大面域；载荷 {sketchIds, bodyType:'SOLID'}）。
  // ribbon 现有 'loft' 条目无注册工具（伪 toolId，见 Ribbon.tsx 注记），入口改道
  // 本对话框；guides/端条件/sections UI 首版不做。
  const loftChannel = mode === 'new' && featureType === 'loft' && applyOp !== undefined;
  // B3 sweep 通道（首版单闭合轮廓沿单直线路径）：**双草图选择器**——不走 sketchChannel
  //（sweep 无面域读取：服务端轮廓取最大面域、路径须恰一条直线；载荷
  // {profileSketchId, pathSketchId, bodyType:'SOLID'}）。ribbon 的 SweepFaces 为真实直改
  // 工具 id，但参数化特征链入口特例改道本对话框（见 Ribbon.tsx 注）；twist/scale/lock/
  // guides UI 首版不做。
  const sweepChannel = mode === 'new' && featureType === 'sweep' && applyOp !== undefined;
  const sketchOptions = sketches ?? EMPTY_SKETCHES;
  const [selectedSketchId, setSelectedSketchId] = React.useState('');
  // revolve 通道面域序（RevolveParams.regionIndex 单选语义——M6-c T3 起 extrude
  // 不再消费此态，其面域选择走下方 selectedRegions 多选集）。
  const [regionIndex, setRegionIndex] = React.useState(0);
  // M6-c T3（extrude 通道）：多面域选中集——SketchDto.regions 面积降序下标，
  // 升序存储（载荷集语义确定性；后端重复下标按集去重幂等）。缺省 [0]=最大面域
  //（v1.6 regionIndex 缺省 0 的语义锚同源），随面域读取落定回填。
  const [selectedRegions, setSelectedRegions] = React.useState<number[]>([]);
  // 面域读面（getSketch.regions——面积降序数组；undefined=未选/读取中）。
  const [regions, setRegions] = React.useState<SketchRegionDto[] | undefined>(undefined);
  const [regionsLoading, setRegionsLoading] = React.useState(false);
  const [regionsError, setRegionsError] = React.useState<string | undefined>(undefined);
  // M6-b T4（revolve 通道）：getSketch.entities 原样留存（与 regions 同一
  // 响应落定，无独立读取窗）；undefined=未选草图/读取中。
  const [sketchEntities, setSketchEntities] = React.useState<SketchEntityDto[] | undefined>(undefined);
  // M6-b T4（revolve 通道）：旋转轴选择——fullRevolve 缺省 true（满周）；
  // 角度 UI 度制（用户面单位裁决），载荷前转弧度（见 handleConfirm 注记）。
  const [selectedAxisId, setSelectedAxisId] = React.useState<number | undefined>(undefined);
  const [fullRevolve, setFullRevolve] = React.useState(true);
  const [angleDegrees, setAngleDegrees] = React.useState('360');
  // 面域读取代际：换草图/换连接时 +1，慢响应过期即丢弃（useSketchSystem
  // activeEpochRef 同款纪律——stale-clobber 防旧草图面域覆写新选择）。
  const regionsEpochRef = React.useRef(0);
  // B2 loft 通道：两截面草图选择（LoftParams.sketchIds 二元组；两键均选且互不相同
  // 才可提交——同草图重复是退化放样，服务端 zod 同口径拒收）。
  const [loftSketchA, setLoftSketchA] = React.useState('');
  const [loftSketchB, setLoftSketchB] = React.useState('');
  // B3 sweep 通道：轮廓草图 + 路径草图（两键均选且互不相同才可提交——同草图是退化
  // 扫掠/同平面路径，服务端 zod 同口径拒收）。
  const [sweepProfileSketchId, setSweepProfileSketchId] = React.useState('');
  const [sweepPathSketchId, setSweepPathSketchId] = React.useState('');

  // ── fillet 通道（M6-b T6）：半径/切向延伸/边 chips + 对话框驱动拾取会话 ──
  const [radius, setRadius] = React.useState('5');
  const [propagateSmooth, setPropagateSmooth] = React.useState(true);
  const [filletEdges, setFilletEdges] = React.useState<FilletEdgeRef[]>([]);
  // 拾取态：picking 供渲染（按钮切换/✓禁用），ref 镜像供 Escape 分叉（监听
  // 终身一次挂载，不吃闭包旧态——与 onCancelRef 同纪律）；工具实例经 ref 持有
  //（stop/卸载守卫时 exitTool，实例类型来自动态 import，不静态引入工具模块）。
  const [picking, setPicking] = React.useState(false);
  const pickingRef = React.useRef(false);
  const pickToolRef = React.useRef<{ exitTool(): Promise<void> } | null>(null);

  /** 结束拾取（三通道汇合：Esc 分叉/再点钮/卸载守卫；工具自然退出亦归此态）。 */
  const stopPick = React.useCallback(() => {
    if (!pickingRef.current) return;
    pickingRef.current = false;
    setPicking(false);
    const tool = pickToolRef.current;
    pickToolRef.current = null;
    // 工具已被框架先行退出（Esc 经 startDefaultTool 替换）时 exitTool 为 no-op。
    void tool?.exitTool();
  }, []);

  /** 添加边（M6-b T6）：动态 import 启动 FilletEdgePickTool（工具模块静态依赖
   * editor 基座链，动态拆包见文件头注 fillet 通道裁决）；回调直改 chips。 */
  const startPick = React.useCallback(() => {
    if (pickingRef.current || !connectionKey) return;
    pickingRef.current = true;
    setPicking(true);
    void (async () => {
      let tool: { exitTool(): Promise<void> } | undefined = undefined;
      try {
        const { startFilletEdgePick } = await import('../tools/modeling/FilletEdgePickTool.js');
        tool = await startFilletEdgePick({
          connectionKey,
          onEdgeAdded: (ref) =>
            setFilletEdges((prev) =>
              prev.some((edge) => filletEdgeRefKey(edge) === filletEdgeRefKey(ref)) ? prev : [...prev, ref],
            ),
          onEdgeRemoved: (ref) => {
            const key = filletEdgeRefKey(ref);
            setFilletEdges((prev) => prev.filter((edge) => filletEdgeRefKey(edge) !== key));
          },
          onError: (message) =>
            IModelApp.notifications.outputMessage(
              new NotifyMessageDetails(OutputMessagePriority.Error, message),
            ),
          onEnded: stopPick,
        });
      } catch {
        tool = undefined; // 动态加载/安装异常与启动失败同面——回非拾取态不悬挂
      }
      pickToolRef.current = tool ?? null;
      if (!tool) {
        // 启动失败（视口不适配/宿主未就绪）——回非拾取态（诚实不悬挂）。
        pickingRef.current = false;
        setPicking(false);
      }
    })();
  }, [connectionKey, stopPick]);

  // 卸载守卫：对话框关闭/确认成功而拾取仍在场——退出工具不留孤儿拾取会话。
  React.useEffect(() => {
    return () => {
      const tool = pickToolRef.current;
      if (tool) {
        pickingRef.current = false;
        pickToolRef.current = null;
        void tool.exitTool();
      }
    };
  }, []);

  // Escape 分叉回填（见上方 onEscapeRef 注记）：拾取态=只结束拾取回对话框。
  onEscapeRef.current = () => {
    if (pickingRef.current) stopPick();
    else onCancelRef.current?.();
  };


  // 面域读面（对话框直调 getSketch RPC——裁决见文件头注）：读操作不涉写租约；
  // 未选草图/连接缺失时清态（后者以就地提示诚实禁提交，不发起 RPC）。
  React.useEffect(() => {
    const epoch = ++regionsEpochRef.current;
    if (!sketchChannel || selectedSketchId === '') {
      setRegions(undefined);
      setSketchEntities(undefined);
      setSelectedRegions([]); // M6-c T3：多选集随身份清空（不跨草图残留）
      setRegionsLoading(false);
      setRegionsError(undefined);
      return;
    }
    if (!connectionKey) {
      setRegions(undefined);
      setSketchEntities(undefined);
      setSelectedRegions([]);
      setRegionsLoading(false);
      setRegionsError(t('partStudio.featureDialog.regionUnreadable'));
      return;
    }
    setRegionsLoading(true);
    setRegionsError(undefined);
    LubanFeatureRpcInterface.getClient()
      .getSketch(connectionKey, selectedSketchId)
      .then(
        (sketch) => {
          if (regionsEpochRef.current !== epoch) return; // 迟写丢弃（身份已切换）
          setRegions(sketch?.regions ?? []); // regions 缺省（旧后端不下发）=无面域，禁提交
          setSketchEntities(sketch?.entities ?? []); // M6-b T4：revolve 轴候选源（同响应落定）
          // M6-c T3：多选集缺省回填 [0]=最大面域（单/多面域同式；空集=无面域）。
          setSelectedRegions((sketch?.regions?.length ?? 0) > 0 ? [0] : []);
          setRegionsLoading(false);
        },
        (err: unknown) => {
          if (regionsEpochRef.current !== epoch) return;
          setRegions([]);
          setSketchEntities([]);
          setSelectedRegions([]);
          setRegionsError(err instanceof Error ? err.message : String(err));
          setRegionsLoading(false);
        },
      );
  }, [sketchChannel, selectedSketchId, connectionKey, t]);

  // 轴候选（M6-b T4 revolve 通道；M6-c T5 判型升级）：草图内 line 实体按端点
  // 解算坐标判型（classifyAxisLines——竖直/水平/斜线+同类序号；id 即载荷
  // axis.sketchEntityId，同值可对账）。非 revolve 通道不消费（extrude 无轴语义）。
  const axisLines = React.useMemo<AxisLineDescriptor[]>(
    () => (revolveChannel ? classifyAxisLines(sketchEntities ?? []) : []),
    [revolveChannel, sketchEntities],
  );

  // 轴缺省选第一条（任务规格）；换草图/实体集变化致选中失效时回落首条，无
  // line（空数组）即清选（提交随 sketchReady 禁用 + 无轴提示呈现）。
  React.useEffect(() => {
    if (axisLines.length === 0) {
      if (selectedAxisId !== undefined) setSelectedAxisId(undefined);
      return;
    }
    if (selectedAxisId === undefined || !axisLines.some((line) => line.id === selectedAxisId)) {
      setSelectedAxisId(axisLines[0]!.id);
    }
  }, [axisLines, selectedAxisId]);

  // 提交门（M6-a T6；M6-c T3 面域判据分叉）：草图通道就绪 = 已选草图 ∧ 面域
  // 已载且非空 ∧ 面域选择就绪——extrude=多选集非空（用户清空 →「选择至少一个
  // 面域」+ ✓ 禁用）；revolve=单选序未越界（换草图瞬间旧值残留防御）∧ 轴线
  // 已选。不就绪 → ✓/成品 禁用——T3 zod 拒收语义前置到 UI（无 sketchId 的空
  // profile 裸奔不再发放行）。
  const regionCount = regions?.length ?? 0;
  const sketchReady =
    !sketchChannel ||
    (selectedSketchId !== '' &&
      !regionsLoading &&
      regionsError === undefined &&
      regionCount > 0 &&
      (revolveChannel
        ? regionIndex < regionCount && selectedAxisId !== undefined
        : selectedRegions.length > 0));
  // 提交门（M6-b T6 fillet 追加）：已拾至少一条边（空边集禁提交——shared
  // FilletParams.edges 非空语义前置）∧ 拾取会话已结束（会话在场时禁提交）。
  const filletReady = !filletChannel || (filletEdges.length > 0 && !picking);
  // 提交门（B2 loft）：两截面均已选、互不相同、**且仍存在于实时草图选项**——
  // 非模态对话框打开期间删除已选草图（sketches 缩水）不得留下陈旧 id 放行提交
  //（loftNeedsTwo/loftSelectionStale 均入就绪判据；服务端 zod/存在性检查兜底）。
  const loftNeedsTwo = loftChannel && sketchOptions.length < 2;
  const loftDuplicate = loftChannel && loftSketchA !== '' && loftSketchA === loftSketchB;
  const loftSelectionStale = loftChannel && loftSketchA !== '' && loftSketchB !== ''
    && (!sketchOptions.some((option) => option.id === loftSketchA)
      || !sketchOptions.some((option) => option.id === loftSketchB));
  const loftReady = !loftChannel
    || (!loftNeedsTwo && !loftDuplicate && !loftSelectionStale
      && loftSketchA !== '' && loftSketchB !== '');
  // 提交门（B3 sweep）：轮廓与路径均已选、互不相同、**且仍存在于实时草图选项**——
  // 非模态对话框打开期间删除已选草图（sketches 缩水）不得留下陈旧 id 放行提交
  //（服务端 zod/存在性检查兜底）。
  const sweepNeedsTwo = sweepChannel && sketchOptions.length < 2;
  const sweepDuplicate = sweepChannel && sweepProfileSketchId !== '' && sweepProfileSketchId === sweepPathSketchId;
  const sweepSelectionStale = sweepChannel && sweepProfileSketchId !== '' && sweepPathSketchId !== ''
    && (!sketchOptions.some((option) => option.id === sweepProfileSketchId)
      || !sketchOptions.some((option) => option.id === sweepPathSketchId));
  const sweepReady = !sweepChannel
    || (!sweepNeedsTwo && !sweepDuplicate && !sweepSelectionStale
      && sweepProfileSketchId !== '' && sweepPathSketchId !== '');

  // 快速拾取：画布选择集 → chips（按 id 去重；label 缺省回退 id）。
  const handleFastPick = React.useCallback(() => {
    if (selection.length === 0) return;
    setChips((prev) => {
      const known = new Set(prev.map((chip) => chip.id));
      const incoming = selection
        .filter((item) => !known.has(item.id))
        .map((item) => ({ id: item.id, label: item.label ?? item.id }));
      return incoming.length > 0 ? [...prev, ...incoming] : prev;
    });
  }, [selection]);

  const handleRemoveChip = React.useCallback((id: string) => {
    setChips((prev) => prev.filter((chip) => chip.id !== id));
  }, []);

  // 草图选择（M6-a T6）：换草图即重置面域选择（regions 语义=该草图的面积降序
  // 数组，旧下标不跨草图续用；读取中的过渡窗由 sketchReady 禁提交兜住）——
  // 单选序归零 + 多选集同步清空（M6-c T3：多选集不清则载荷会以新 sketchId 配
  // 旧草图下标，读取 effect 落定前的过渡帧故须就地失效）。
  const handleSketchChange = React.useCallback((sketchId: string) => {
    setSelectedSketchId(sketchId);
    setRegionIndex(0);
    setSelectedRegions([]);
  }, []);

  // 草图 chip ×移除 = 清选择（回到「选择草图…」占位，提交随 sketchReady 禁用）。
  const handleRemoveSketchChip = React.useCallback(() => {
    setSelectedSketchId('');
    setRegionIndex(0);
    setSelectedRegions([]);
  }, []);

  // 面域多选（M6-c T3 extrude 通道）：点 chip 切换选中态；升序存储（载荷集
  // 语义确定性）；「全选/清空」轻量操作补全 Onshape 多选手感的两端。
  const handleToggleRegion = React.useCallback((index: number) => {
    setSelectedRegions((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b),
    );
  }, []);
  const handleSelectAllRegions = React.useCallback(() => {
    setSelectedRegions((regions ?? []).map((_, index) => index));
  }, [regions]);
  const handleClearRegions = React.useCallback(() => setSelectedRegions([]), []);

  const buildResult = React.useCallback((): FeatureDialogResult => ({
    resultType,
    booleanScope,
    entities: chips,
    direction,
    startOffset,
    symmetric,
    draft,
    // M6-c T5：底部滑杆=透明度（采集对齐；预览消费挂账见文件头注）。
    transparency,
    // M6-b T6：仅 fillet 通道携带已拾边集（其余通道键缺省——既有钉形载荷不破）。
    ...(filletChannel ? { filletEdges } : {}),
  }), [resultType, booleanScope, chips, direction, startOffset, symmetric, draft, transparency, filletChannel, filletEdges]);

  /**
   * 确认出口：new + applyOp 在场 → insertFeature 直提交（拉伸闭环）；否则
   * 纯 onConfirm 回传（壳期/edit 模式语义）。成功 → toast + onConfirm（宿主
   * closeDialog）；失败/校验不过 → 就地 Alert，对话框不关闭。
   */
  const handleConfirm = React.useCallback(() => {
    if (submitting || !canEdit) return; // 禁重入 + 只读写门禁（B2：readonly 不进租约环）
    if (editStandalone) return; // M-1：edit 本版不提交（✓ 已禁用，此为防御兜底）
    if (!(mode === 'new' && applyOp && featureType)) {
      onConfirm?.(buildResult());
      return;
    }
    if (sketchChannel && !sketchReady) return; // 草图通道门禁（✓ 已禁用，此为防御兜底）
    if (filletChannel && !filletReady) return; // fillet 通道门禁（空边集/拾取中——防御兜底）
    if (loftChannel && !loftReady) return; // loft 通道门禁（两截面未选/同草图——防御兜底）
    if (sweepChannel && !sweepReady) return; // sweep 通道门禁（轮廓/路径未选/同草图——防御兜底）
    if (booleanUpstreamMissing) return; // 布尔上游门禁（无实体——✓ 已禁用，防御兜底）
    // 距离校验（extrude/通用路径；revolve/fillet/loft/sweep 无距离量——旋转角即参数/
    // 半径即参数/放样无扫掠距离/扫掠无扫掠距离，输入已隐藏）。
    let parsedDistance = 0;
    if (!revolveChannel && !filletChannel && !loftChannel && !sweepChannel) {
      parsedDistance = Number(distance);
      if (distance.trim() === '' || !Number.isFinite(parsedDistance) || parsedDistance <= 0) {
        setError(t('partStudio.featureDialog.distanceInvalid'));
        return;
      }
    }
    // 半径校验（M6-b T6 fillet 通道）：内部米制直传（单位换算在显示层——
    // architecture.md §四；缺省 5 与 Onshape 采集默认同量级）。
    let parsedRadius = 0;
    if (filletChannel) {
      parsedRadius = Number(radius);
      if (radius.trim() === '' || !Number.isFinite(parsedRadius) || parsedRadius <= 0) {
        setError(t('partStudio.featureDialog.radiusInvalid'));
        return;
      }
    }
    // 角度校验与换算（M6-b T4 revolve 且非全周）：UI 度制（用户面单位裁决）→
    // 载荷弧度制（shared RevolveParams.angle 契约 (0, 2π]，度制域 (0, 360]）；
    // 180° → Math.PI 的 π 精度由单测钉死。fullRevolve=true 时不带 angle 键。
    let angleRadians: number | undefined;
    if (revolveChannel && !fullRevolve) {
      const degrees = Number(angleDegrees);
      if (angleDegrees.trim() === '' || !Number.isFinite(degrees) || degrees <= 0 || degrees > 360) {
        setError(t('partStudio.featureDialog.angleInvalid'));
        return;
      }
      angleRadians = (degrees * Math.PI) / 180;
    }
    setError(undefined);
    setSubmitting(true);
    void (async () => {
      let result: FeatureOpResult;
      try {
        result = await applyOp({
          kind: 'insertFeature',
          // M7 v1.10：布尔作用域映射后的提交类型（新建=基础类型；加入/移除=booleanAdd/
          // booleanSubtract）。外层门禁已确保 featureType 在场，effectiveFeatureType 随之非空
          //（`!` 收窄：布尔映射只在基础类型为 extrude/boolean* 时产生）。
          featureType: effectiveFeatureType!,
          // M6-a T6：extrude 走草图通道——{sketchId} 草图寻址 + 空 profile
          //（shared 互斥语义：sketchId 在场时 profile 须空数组，后端
          // sketchRegionsFrom 按面域数组产轮廓）。M7 v1.10：布尔草图驱动独立
          // 分支见下方 booleanChannel（{sketchId, distance, regions, operation}，
          // 无 profile 键）；revolve/fillet 各有独立构造器。
          // M6-c T3：面域寻址升级——regions 多选数组直出（缺省 [0]=最大面域；
          // 不再发 regionIndex——shared v1.8 起该键 @deprecated，服务端 zod 与
          // regions 互斥拒收，同给两键即拒）。
          // M6-b T4：revolve 分支独立构造器——{sketchId, regionIndex,
          // axis, fullRevolve, angle?}（shared v1.7 RevolveParams；**裁决钉死：
          // RevolveParams 未扩 regions，revolve 保持单选 regionIndex 不越契约**；
          // symmetric 等 extrude 扩展不适用，对称载荷挂账见文件头注 T4-minor）。
          // M6-b T6：fillet 分支独立构造器——{radius, propagateSmooth,
          // edges:[{edge:{nodeId,entityId}}...]}（边自身持久 id 透传，shared v1.9
          // M6-d 纯换契约；无 profile/distance 语义）。
          params: sweepChannel
            ? {
                // B3 sweep（shared v1.12 SweepParams）：轮廓草图 + 路径草图 + 实体类型。
                // 无 distance/profile/regions/twist/scale/lock/guides 键（首版范围裁决）。
                profileSketchId: sweepProfileSketchId,
                pathSketchId: sweepPathSketchId,
                bodyType: 'SOLID',
              }
            : loftChannel
            ? {
                // B2 loft（shared v1.11 LoftParams）：两截面草图二元组 + 实体类型。
                // 无 distance/profile/regions/guides 键（首版范围裁决）。
                sketchIds: [loftSketchA, loftSketchB],
                bodyType: 'SOLID',
              }
            : filletChannel
            ? {
                radius: parsedRadius,
                propagateSmooth,
                edges: filletEdges.map((edge) => ({ edge: edge.edge })),
              }
            : revolveChannel
            ? {
                profile: [],
                sketchId: selectedSketchId,
                regionIndex,
                axis: { sketchEntityId: selectedAxisId! },
                fullRevolve,
                ...(angleRadians !== undefined ? { angle: angleRadians } : {}),
              }
            // M7 v1.10：草图驱动布尔（shared BooleanParams）——operation 由映射后的类型名
            // 唯一决定（booleanAdd⇔unite / booleanSubtract⇔subtract，服务端 zod 一致性拒收）；
            // 无 profile 键（与内联 profile 旧路径互斥）；面域多选语义与 extrude 同锚。
            // symmetric 不适用（BooleanParams 无该键，工具体沿草图法向单向扫掠）。
            : booleanChannel
            ? {
                sketchId: selectedSketchId,
                distance: parsedDistance,
                regions: [...selectedRegions],
                operation: effectiveFeatureType === 'booleanAdd' ? 'unite' : 'subtract',
              }
            : sketchChannel
              ? {
                  profile: [],
                  distance: parsedDistance,
                  sketchId: selectedSketchId,
                  regions: [...selectedRegions],
                  // M6-b T3 契约（shared v1.7 ExtrudeParams.symmetric）落地后的
                  // T4-minor 接线收口：对称复选勾选才带键（缺省省略=载荷向后
                  // 兼容，既有钉形测试不破）。
                  ...(symmetric ? { symmetric: true } : {}),
                }
              : { profile: [], distance: parsedDistance },
        });
      } catch (err) {
        // rpc-over-ipc 异常（连接断开等）——与拒收同面呈现，不静默。
        result = { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (!aliveRef.current) return;
      setSubmitting(false);
      if (result.ok) {
        // 成功 toast（notifications 标准通道）+ onConfirm（宿主 closeDialog）。
        IModelApp.notifications.outputMessage(
          new NotifyMessageDetails(
            OutputMessagePriority.Success,
            t('partStudio.featureDialog.submitSuccess', { name: featureName }),
          ),
        );
        onConfirm?.(buildResult());
      } else {
        setError(result.error);
      }
    })();
  }, [
    submitting,
    canEdit,
    editStandalone,
    mode,
    applyOp,
    featureType,
    effectiveFeatureType,
    sketchChannel,
    booleanChannel,
    booleanUpstreamMissing,
    revolveChannel,
    sketchReady,
    filletChannel,
    filletReady,
    filletEdges,
    radius,
    propagateSmooth,
    loftChannel,
    loftReady,
    loftSketchA,
    loftSketchB,
    sweepChannel,
    sweepReady,
    sweepProfileSketchId,
    sweepPathSketchId,
    selectedSketchId,
    regionIndex,
    selectedRegions,
    selectedAxisId,
    fullRevolve,
    angleDegrees,
    distance,
    t,
    onConfirm,
    buildResult,
    featureName,
  ]);

  // 选中回显 chip（M6-a T6；M6-c T3 分叉）：「{草图名} 的面」——对齐采集规格
  // 「Sketch 1 的 面」chips 形态；「· 面域 N」后缀仅 revolve 保留（单选下拉的
  // 回显位），extrude 的面域选中态由多选 chips 自身 aria-pressed 呈现（后缀
  // 表达不了集合）。
  const selectedSketch = sketchOptions.find((option) => option.id === selectedSketchId);
  const sketchChipLabel = selectedSketch
    ? revolveChannel && regionCount > 1
      ? t('partStudio.featureDialog.sketchFaceChipWithRegion', {
          name: selectedSketch.label,
          index: regionIndex,
        })
      : t('partStudio.featureDialog.sketchFaceChip', { name: selectedSketch.label })
    : undefined;
  // 面域下拉项（M6-a T6）：regions 面积降序（后端 sketchRegionsFrom 确定性排序
  // 语义），首项标注最大（= regionIndex 缺省 0 的语义锚）。
  const regionOptionLabel = (index: number, area: number): string =>
    index === 0
      ? t('partStudio.featureDialog.regionOptionLargest', { index, area: formatArea(area) })
      : t('partStudio.featureDialog.regionOption', { index, area: formatArea(area) });

  // 轴下拉项（M6-c T5 判型命名）：竖直线/水平线/斜线+同类序号；unknown（端点
  // 无解算坐标）回退「线 {id}」——载荷寻址（axis.sketchEntityId=id）不受影响。
  const axisOptionLabel = (line: AxisLineDescriptor): string => {
    switch (line.kind) {
      case 'vertical':
        return t('partStudio.featureDialog.axisOptionVertical', { index: line.ordinal });
      case 'horizontal':
        return t('partStudio.featureDialog.axisOptionHorizontal', { index: line.ordinal });
      case 'slanted':
        return t('partStudio.featureDialog.axisOptionSlanted', { index: line.ordinal });
      default:
        return t('partStudio.featureDialog.axisOption', { id: line.id });
    }
  };

  // 折叠段可见集（M6-b T4）：草图通道「对称」以平铺复选顶替（Onshape 采集
  // 形态），折叠段 symmetric 隐藏防双复选绑同态；非通道（edit/布尔/壳期）不动。
  const visibleSections = React.useMemo(
    () => (sketchChannel || loftChannel || sweepChannel ? SECTIONS.filter((section) => section.id !== 'symmetric') : SECTIONS),
    [sketchChannel, loftChannel, sweepChannel],
  );

  const toggleSection = React.useCallback((id: CollapsibleSection['id']) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={featureName}
      aria-busy={submitting || undefined}
      className="part-studio-feature-dialog"
      data-testid="part-studio-feature-dialog"
    >
      {/* 顶置标题行：特征名 + ✓确认/✗取消（os-31）。 */}
      <header className="part-studio-feature-dialog__header">
        <h2 className="part-studio-feature-dialog__title">{featureName}</h2>
        <div className="part-studio-feature-dialog__header-actions">
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.confirm')}
            className="part-studio-feature-dialog__confirm"
            disabled={submitting || editStandalone || !canEdit || !sketchReady || !filletReady || !loftReady || !sweepReady || booleanUpstreamMissing}
            onClick={handleConfirm}
          >
            <SvgCheckmark />
          </button>
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.cancel')}
            className="part-studio-feature-dialog__cancel"
            onClick={() => onCancel?.()}
          >
            <SvgClose />
          </button>
        </div>
      </header>

      {/* 布尔作用域双页签（os-31）。 */}
      <div className="part-studio-feature-dialog__tabs">
        <div
          role="tablist"
          aria-label={t('partStudio.featureDialog.resultTypeTabs')}
          className="part-studio-feature-dialog__tablist"
        >
          {RESULT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={resultType === type}
              className={[
                'part-studio-feature-dialog__tab',
                resultType === type ? 'part-studio-feature-dialog__tab--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setResultType(type)}
            >
              {t(`partStudio.featureDialog.resultTypes.${type}`)}
            </button>
          ))}
        </div>
        <div
          role="tablist"
          aria-label={t('partStudio.featureDialog.booleanScopeTabs')}
          className="part-studio-feature-dialog__tablist"
        >
          {BOOLEAN_SCOPES.map((scope) => {
            // 提交态禁用（B1 复审）：①相交无后端特征类型，禁用防静默并集；
            // ②无实体时加入/移除无上游，禁用防「成功 toast + status=1 死特征」。
            const scopeDisabled =
              booleanScopeCapable &&
              (scope === 'intersect' || (booleanScopeNoBody && (scope === 'add' || scope === 'remove')));
            const scopeDisabledHint =
              scope === 'intersect'
                ? t('partStudio.featureDialog.booleanIntersectUnsupported')
                : t('partStudio.featureDialog.booleanNoBodyHint');
            return (
              <button
                key={scope}
                type="button"
                role="tab"
                aria-selected={booleanScope === scope}
                disabled={scopeDisabled}
                title={scopeDisabled ? scopeDisabledHint : undefined}
                className={[
                  'part-studio-feature-dialog__tab',
                  booleanScope === scope ? 'part-studio-feature-dialog__tab--active' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setBooleanScope(scope)}
              >
                {t(`partStudio.featureDialog.booleanScopes.${scope}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="part-studio-feature-dialog__body">
        {/* 提交错误就地 Alert（六态 error；失败不关闭可改参重试）。 */}
        {error && (
          <p role="alert" className="part-studio-feature-dialog__alert" data-testid="part-studio-feature-dialog-error">
            {error}
          </p>
        )}

        {/* 租约警示（T6 评审 I-2）：活租约被他人持有时可视提示，不硬禁用——
            applyOp 内置陈旧租约 35s 有限重试自愈路，禁用即堵死。只读权限
           （!canEdit）下不呈现：提交已被门禁禁用，「等待租约」成谎报。 */}
        {applyOp !== undefined && mode === 'new' && leaseOk === false && canEdit && (
          <p
            role="note"
            className="part-studio-feature-dialog__lease-warning"
            data-testid="part-studio-feature-dialog-lease-warning"
          >
            {t('partStudio.featureDialog.leaseBusy')}
          </p>
        )}

        {/* 只读权限提示（B2 只读写门禁）：✓/成品 已禁用时的诚实呈现——
            「只读」是比 editHint 更根本的不可提交因，顶位优先。 */}
        {!canEdit && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-readonly-hint"
          >
            {t('partStudio.featureDialog.readonlyHint')}
          </p>
        )}

        {/* 布尔上游门禁 / 相交不支持提示（B1 复审 Important/Minor）——禁用页签的可见原因，
            不静默降级：无实体时布尔无上游，相交无后端特征类型。 */}
        {booleanScopeNoBody && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-boolean-no-body-hint"
          >
            {t('partStudio.featureDialog.booleanNoBodyHint')}
          </p>
        )}
        {booleanScopeCapable && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-intersect-unsupported-hint"
          >
            {t('partStudio.featureDialog.booleanIntersectUnsupported')}
          </p>
        )}

        {/* edit 模式提示行（T6 评审 M-1）：参数编辑即将推出（✓ 已禁用）。 */}
        {canEdit && editStandalone && (
          <p
            role="note"
            className="part-studio-feature-dialog__hint"
            data-testid="part-studio-feature-dialog-edit-hint"
          >
            {t('partStudio.featureDialog.editHint')}
          </p>
        )}

        {/* 距离（M4-T6：insertFeature extrude 的唯一可编辑量；常驻不折叠）。
            M6-b T4：revolve 通道不适用（无距离量——全周/角度即参数），输入
            隐藏、handleConfirm 跳过距离校验。M6-b T6：fillet 通道同口径
            （无距离量——半径即参数）。 */}
        {!revolveChannel && !filletChannel && !loftChannel && !sweepChannel && (
          <section className="part-studio-feature-dialog__distance">
            <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-distance">
              {t('partStudio.featureDialog.distanceLabel')}
            </label>
            <input
              id="part-studio-feature-dialog-distance"
              type="text"
              inputMode="decimal"
              aria-label={t('partStudio.featureDialog.distanceLabel')}
              className="part-studio-feature-dialog__input"
              value={distance}
              disabled={submitting}
              onChange={(event) => setDistance(event.target.value)}
            />
          </section>
        )}

        {/* 对称平铺复选（M6-b T4，extrude 通道）：Onshape 采集形态——「对称」
            在折叠区外平铺（sketchChannel 下折叠段 symmetric 隐藏，见下方
            visibleSections）。本版仅渲染+本地态（state 即既有 symmetric，随
            onConfirm 载荷回传不变）；op 载荷不含 symmetric——ExtrudeParams
            .symmetric 契约由并行 T3 落，落地后此处接线（T4-minor 挂账）。 */}
        {extrudeChannel && (
          <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-feature-dialog-symmetric-flat">
            <input
              type="checkbox"
              checked={symmetric}
              onChange={(event) => setSymmetric(event.target.checked)}
            />
            <span>{t('partStudio.featureDialog.sections.symmetric')}</span>
          </label>
        )}

        {/* revolve 参数区（M6-b T4）：全方位复选（fullRevolve 缺省 true）+
            角度输入（取消勾选才现；UI 度制，载荷前转弧度——见 handleConfirm）。
            独立于 extrude 距离区（revolve 分支独立构造器）。 */}
        {revolveChannel && (
          <React.Fragment>
            <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-feature-dialog-full-revolve">
              <input
                type="checkbox"
                checked={fullRevolve}
                onChange={(event) => setFullRevolve(event.target.checked)}
              />
              <span>{t('partStudio.featureDialog.fullRevolveLabel')}</span>
            </label>
            {!fullRevolve && (
              <section className="part-studio-feature-dialog__angle">
                <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-angle">
                  {t('partStudio.featureDialog.angleLabel')}
                </label>
                <input
                  id="part-studio-feature-dialog-angle"
                  type="text"
                  inputMode="decimal"
                  aria-label={t('partStudio.featureDialog.angleLabel')}
                  className="part-studio-feature-dialog__input"
                  value={angleDegrees}
                  disabled={submitting}
                  onChange={(event) => setAngleDegrees(event.target.value)}
                />
              </section>
            )}
          </React.Fragment>
        )}

        {/* fillet 参数区（M6-b T6）：半径（缺省 5，米制直传）+切向延伸复选
            （缺省 true = FilletParams.propagateSmooth）。独立构造器（见
            handleConfirm fillet 分支）。 */}
        {filletChannel && (
          <React.Fragment>
            <section className="part-studio-feature-dialog__distance">
              <label className="part-studio-feature-dialog__distance-label" htmlFor="part-studio-feature-dialog-radius">
                {t('partStudio.featureDialog.radiusLabel')}
              </label>
              <input
                id="part-studio-feature-dialog-radius"
                type="text"
                inputMode="decimal"
                aria-label={t('partStudio.featureDialog.radiusLabel')}
                className="part-studio-feature-dialog__input"
                value={radius}
                disabled={submitting}
                onChange={(event) => setRadius(event.target.value)}
              />
            </section>
            <label className="part-studio-feature-dialog__checkbox" data-testid="part-studio-feature-dialog-propagate-smooth">
              <input
                type="checkbox"
                checked={propagateSmooth}
                onChange={(event) => setPropagateSmooth(event.target.checked)}
              />
              <span>{t('partStudio.featureDialog.propagateSmoothLabel')}</span>
            </label>
          </React.Fragment>
        )}

        {/* 芯片式实体选择框（os-31）。M6-a T6 分叉：拉伸新建 = 草图通道——
            草图下拉 + 面域下拉（regions>1 才现）+ 选中回显 chip（采集规格
            「Sketch 1 的 面」形态）；无草图/无面域 → 诚实提示 + 提交禁用。
            M6-b T6 分叉：fillet 新建 = 边 chips + 添加边（对话框驱动拾取）。
            其余（edit/非通道特征/壳期）保持通用 chips + 快速拾取不动。 */}
        <section className="part-studio-feature-dialog__entities">
          <div className="part-studio-feature-dialog__entities-header">
            <span className="part-studio-feature-dialog__entities-label">
              {filletChannel
                ? t('partStudio.featureDialog.filletEdgesLabel')
                : sweepChannel
                  ? t('partStudio.featureDialog.sweepSketchesLabel')
                  : loftChannel
                    ? t('partStudio.featureDialog.loftSectionsLabel')
                    : t('partStudio.featureDialog.entitiesLabel')}
            </span>
            {!sketchChannel && !filletChannel && !loftChannel && !sweepChannel && (
              <button
                type="button"
                className="part-studio-feature-dialog__fast-pick"
                onClick={handleFastPick}
              >
                {t('partStudio.featureDialog.fastPick')}
              </button>
            )}
          </div>

          {/* fillet 通道（M6-b T6）：无 body/无连接诚实降级 / 添加边拾取钮 /
              拾取中提示 / 边 chips 列表（「边 N」+×移除）/ 空边集门禁。 */}
          {filletChannel && (
            <React.Fragment>
              {!hasBodies ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-body-hint"
                >
                  {t('partStudio.featureDialog.noBodyHint')}
                </p>
              ) : !connectionKey ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-edge-unpickable"
                >
                  {t('partStudio.featureDialog.edgeUnpickable')}
                </p>
              ) : (
                <React.Fragment>
                  <button
                    type="button"
                    className="part-studio-feature-dialog__fast-pick"
                    data-testid="part-studio-feature-dialog-add-edge"
                    aria-pressed={picking}
                    disabled={submitting}
                    onClick={picking ? stopPick : startPick}
                  >
                    {picking
                      ? t('partStudio.featureDialog.stopPick')
                      : t('partStudio.featureDialog.addEdge')}
                  </button>
                  {picking && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-picking-hint"
                    >
                      {t('partStudio.featureDialog.pickingHint')}
                    </p>
                  )}
                </React.Fragment>
              )}

              {filletEdges.length > 0 && (
                <ul className="part-studio-feature-dialog__chips" data-testid="part-studio-feature-dialog-edge-chips">
                  {filletEdges.map((edge, index) => (
                    <li key={filletEdgeRefKey(edge)} className="part-studio-feature-dialog__chip">
                      <span className="part-studio-feature-dialog__chip-label">
                        {t('partStudio.featureDialog.edgeChip', { index: index + 1 })}
                      </span>
                      <button
                        type="button"
                        aria-label={t('partStudio.featureDialog.removeEdge', { index: index + 1 })}
                        className="part-studio-feature-dialog__chip-remove"
                        disabled={submitting}
                        onClick={() =>
                          setFilletEdges((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <SvgClose />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 空边集门禁（M6-b T6）：「选择要圆角的边」+ ✓禁用（filletReady
                  判据；无 body 提示在场时让位——同一禁提交因，不双报）。 */}
              {hasBodies && filletEdges.length === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-edges-hint"
                >
                  {t('partStudio.featureDialog.noEdgesHint')}
                </p>
              )}
            </React.Fragment>
          )}

          {/* B2 loft 通道：双截面草图选择器（首版两平行截面——每草图取最大面域）。
              草图不足两张 → 诚实提示 + 提交禁用；两键互不相同（同草图重复=退化放样，
              服务端 zod 同口径拒收）。无 guides/端条件/sections UI。 */}
          {loftChannel && (
            <React.Fragment>
              {sketchOptions.length < 2 ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-loft-needs-two-hint"
                >
                  {t('partStudio.featureDialog.loftNeedsTwoSketchesHint')}
                </p>
              ) : (
                <React.Fragment>
                  <select
                    aria-label={t('partStudio.featureDialog.loftSectionLabel', { index: 1 })}
                    className="part-studio-feature-dialog__select"
                    value={loftSketchA}
                    disabled={submitting}
                    onChange={(event) => setLoftSketchA(event.target.value)}
                  >
                    <option value="" disabled>
                      {t('partStudio.featureDialog.sketchPlaceholder')}
                    </option>
                    {sketchOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t('partStudio.featureDialog.loftSectionLabel', { index: 2 })}
                    className="part-studio-feature-dialog__select"
                    value={loftSketchB}
                    disabled={submitting}
                    onChange={(event) => setLoftSketchB(event.target.value)}
                  >
                    <option value="" disabled>
                      {t('partStudio.featureDialog.sketchPlaceholder')}
                    </option>
                    {sketchOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {loftDuplicate && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-loft-duplicate-hint"
                    >
                      {t('partStudio.featureDialog.loftDuplicateHint')}
                    </p>
                  )}
                  {loftSelectionStale && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-loft-stale-hint"
                    >
                      {t('partStudio.featureDialog.loftSelectionStaleHint')}
                    </p>
                  )}
                  {/* 首版范围提示（服务端 op 边界对不平行截面同口径拒收）。 */}
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-loft-parallel-hint"
                  >
                    {t('partStudio.featureDialog.loftParallelHint')}
                  </p>
                </React.Fragment>
              )}
            </React.Fragment>
          )}

          {/* B3 sweep 通道：轮廓草图 + 路径草图双选择器（首版单闭合轮廓沿单直线路径）。
              草图不足两张 → 诚实提示 + 提交禁用；两键互不相同（同草图=退化扫掠/同平面
              路径，服务端 zod 同口径拒收）。路径直线语义由服务端 op 边界守卫兜底，
              前端只做范围提示（不做草图几何读取——路径合法性不需要面域读面）。 */}
          {sweepChannel && (
            <React.Fragment>
              {sketchOptions.length < 2 ? (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-sweep-needs-two-hint"
                >
                  {t('partStudio.featureDialog.sweepNeedsTwoSketchesHint')}
                </p>
              ) : (
                <React.Fragment>
                  <select
                    aria-label={t('partStudio.featureDialog.sweepProfileLabel')}
                    className="part-studio-feature-dialog__select"
                    value={sweepProfileSketchId}
                    disabled={submitting}
                    onChange={(event) => setSweepProfileSketchId(event.target.value)}
                  >
                    <option value="" disabled>
                      {t('partStudio.featureDialog.sketchPlaceholder')}
                    </option>
                    {sketchOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t('partStudio.featureDialog.sweepPathLabel')}
                    className="part-studio-feature-dialog__select"
                    value={sweepPathSketchId}
                    disabled={submitting}
                    onChange={(event) => setSweepPathSketchId(event.target.value)}
                  >
                    <option value="" disabled>
                      {t('partStudio.featureDialog.sketchPlaceholder')}
                    </option>
                    {sketchOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {sweepDuplicate && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-sweep-duplicate-hint"
                    >
                      {t('partStudio.featureDialog.sweepDuplicateHint')}
                    </p>
                  )}
                  {sweepSelectionStale && (
                    <p
                      role="note"
                      className="part-studio-feature-dialog__hint"
                      data-testid="part-studio-feature-dialog-sweep-stale-hint"
                    >
                      {t('partStudio.featureDialog.sweepSelectionStaleHint')}
                    </p>
                  )}
                  {/* 首版范围提示（服务端 op 边界对非直线/零长路径同口径拒收）。 */}
                  <p
                    role="note"
                    className="part-studio-feature-dialog__hint"
                    data-testid="part-studio-feature-dialog-sweep-path-hint"
                  >
                    {t('partStudio.featureDialog.sweepPathHint')}
                  </p>
                </React.Fragment>
              )}
            </React.Fragment>
          )}

          {sketchChannel && sketchOptions.length === 0 ? (
            /* 无草图门禁（M6-a T6）：先创建草图（不再发空 profile 裸奔）。 */
            <p
              role="note"
              className="part-studio-feature-dialog__hint"
              data-testid="part-studio-feature-dialog-no-sketch-hint"
            >
              {t('partStudio.featureDialog.noSketchHint')}
            </p>
          ) : null}

          {sketchChannel && sketchOptions.length > 0 && (
            <React.Fragment>
              {/* 草图下拉（多选一；视口点击拾取归 M6-c 交互精化）。 */}
              <select
                aria-label={t('partStudio.featureDialog.sketchLabel')}
                className="part-studio-feature-dialog__select"
                value={selectedSketchId}
                disabled={submitting}
                onChange={(event) => handleSketchChange(event.target.value)}
              >
                <option value="" disabled>
                  {t('partStudio.featureDialog.sketchPlaceholder')}
                </option>
                {sketchOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              {/* 面域选择（M6-a T6 最小形态 → M6-c T3 分叉）：extrude=多选 chips
                  （regions>1 才现；点选切换 aria-pressed，缺省 [0]=最大面域；
                  「全选/清空」轻量操作）——Onshape「面和草图面域」多选语义；
                  revolve=单选下拉保持（**裁决钉死：RevolveParams 未扩 regions——
                  不越契约**，载荷仍 regionIndex）。单面域两通道均自动 [0]（缺省
                  语义无需选择，无 UI）。 */}
              {regions !== undefined && regionCount > 1 && !revolveChannel && (
                <div
                  className="part-studio-feature-dialog__region-picker"
                  data-testid="part-studio-feature-dialog-region-chips"
                >
                  <ul className="part-studio-feature-dialog__chips">
                    {regions.map((region, index) => (
                      <li key={`region-${index}`}>
                        <button
                          type="button"
                          aria-pressed={selectedRegions.includes(index)}
                          className="part-studio-feature-dialog__region-chip"
                          disabled={submitting}
                          onClick={() => handleToggleRegion(index)}
                        >
                          {regionOptionLabel(index, region.area)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="part-studio-feature-dialog__region-actions">
                    <button
                      type="button"
                      className="part-studio-feature-dialog__fast-pick"
                      data-testid="part-studio-feature-dialog-region-select-all"
                      disabled={submitting}
                      onClick={handleSelectAllRegions}
                    >
                      {t('partStudio.featureDialog.regionSelectAll')}
                    </button>
                    <button
                      type="button"
                      className="part-studio-feature-dialog__fast-pick"
                      data-testid="part-studio-feature-dialog-region-clear"
                      disabled={submitting}
                      onClick={handleClearRegions}
                    >
                      {t('partStudio.featureDialog.regionClearAll')}
                    </button>
                  </div>
                </div>
              )}
              {regions !== undefined && regionCount > 1 && revolveChannel && (
                <select
                  aria-label={t('partStudio.featureDialog.regionLabel')}
                  className="part-studio-feature-dialog__select"
                  value={regionIndex}
                  disabled={submitting}
                  onChange={(event) => setRegionIndex(Number(event.target.value))}
                >
                  {regions.map((region, index) => (
                    <option key={`region-${index}`} value={index}>
                      {regionOptionLabel(index, region.area)}
                    </option>
                  ))}
                </select>
              )}

              {/* 空选门禁（M6-c T3）：extrude 多面域下用户清空全部选中 →
                  「选择至少一个面域」提示 + ✓ 禁用（sketchReady extrude 判据）。
                  revolve 无此态（单选下拉恒有值）。 */}
              {!revolveChannel && !regionsError && regions !== undefined && regionCount > 0 && selectedRegions.length === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-region-selected-hint"
                >
                  {t('partStudio.featureDialog.noRegionSelectedHint')}
                </p>
              )}

              {/* 旋转轴下拉（M6-b T4 revolve 通道；M6-c T5 判型命名）：选项
                  「竖直线/水平线/斜线 N」（端点解算坐标判向；unknown 回退
                  「线 {id}」——id=草图内实体 id，与载荷 axis.sketchEntityId
                  同值）；缺省首条（见轴缺省 effect）。revolve 专属——extrude
                  无轴语义不渲染。 */}
              {revolveChannel && axisLines.length > 0 && (
                <select
                  aria-label={t('partStudio.featureDialog.axisLabel')}
                  className="part-studio-feature-dialog__select"
                  value={selectedAxisId ?? ''} /* ?? ''=恒受控（缺省 effect 落定前的过渡帧防 uncontrolled 警告；未选态提交由 sketchReady 拦） */
                  disabled={submitting}
                  onChange={(event) => setSelectedAxisId(Number(event.target.value))}
                >
                  {axisLines.map((line) => (
                    <option key={`axis-${line.id}`} value={line.id}>
                      {axisOptionLabel(line)}
                    </option>
                  ))}
                </select>
              )}

              {/* 无旋转轴门禁（M6-b T4）：选中草图读得实体集但无 line →
                  「草图无可用旋转轴」提示 + 提交禁用（sketchReady 轴判据）。
                  读取失败（regionsError）时让位错误 alert，不双报。 */}
              {revolveChannel && !regionsError && sketchEntities !== undefined && axisLines.length === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-axis-hint"
                >
                  {t('partStudio.featureDialog.noAxisHint')}
                </p>
              )}

              {/* 选中回显 chip：「{草图名} 的面」（revolve 多面域 + regionIndex）；×=清选择。 */}
              {selectedSketch && sketchChipLabel && (
                <ul className="part-studio-feature-dialog__chips">
                  <li className="part-studio-feature-dialog__chip">
                    <span className="part-studio-feature-dialog__chip-label">{sketchChipLabel}</span>
                    <button
                      type="button"
                      aria-label={t('partStudio.featureDialog.removeEntity', { label: sketchChipLabel })}
                      className="part-studio-feature-dialog__chip-remove"
                      onClick={handleRemoveSketchChip}
                    >
                      <SvgClose />
                    </button>
                  </li>
                </ul>
              )}

              {/* 面域读取失败（RPC 异常/连接缺失）：就地 alert + 提交禁用。 */}
              {regionsError && (
                <p
                  role="alert"
                  className="part-studio-feature-dialog__alert"
                  data-testid="part-studio-feature-dialog-region-error"
                >
                  {regionsError}
                </p>
              )}

              {/* 无面域门禁（M6-a T6）：regions 缺省/空 → 草图无可拉伸面域。 */}
              {!regionsError && regions !== undefined && regionCount === 0 && (
                <p
                  role="note"
                  className="part-studio-feature-dialog__hint"
                  data-testid="part-studio-feature-dialog-no-region-hint"
                >
                  {t('partStudio.featureDialog.noRegionHint')}
                </p>
              )}
            </React.Fragment>
          )}

          {!sketchChannel && !loftChannel && !sweepChannel && (
            <ul className="part-studio-feature-dialog__chips">
              {chips.map((chip) => (
                <li key={chip.id} className="part-studio-feature-dialog__chip">
                  <span className="part-studio-feature-dialog__chip-label">{chip.label}</span>
                  <button
                    type="button"
                    aria-label={t('partStudio.featureDialog.removeEntity', { label: chip.label })}
                    className="part-studio-feature-dialog__chip-remove"
                    onClick={() => handleRemoveChip(chip.id)}
                  >
                    <SvgClose />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 折叠段：方向/起始偏移/对称/拔模（os-31）。草图通道对称段隐藏
            （M6-b T4：平铺复选顶替，见 visibleSections 注记）。 */}
        <div className="part-studio-feature-dialog__sections">
          {visibleSections.map((section) => {
            const isOpen = expanded[section.id];
            const label = t(`partStudio.featureDialog.sections.${section.id}`);
            return (
              <section key={section.id} className="part-studio-feature-dialog__section">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="part-studio-feature-dialog__section-toggle"
                  onClick={() => toggleSection(section.id)}
                >
                  <span>{label}</span>
                </button>
                {isOpen && (
                  <div className="part-studio-feature-dialog__section-body">
                    {section.id === 'direction' && (
                      <select
                        aria-label={label}
                        className="part-studio-feature-dialog__select"
                        value={direction}
                        onChange={(event) => setDirection(event.target.value as FeatureDirection)}
                      >
                        <option value="forward">
                          {t('partStudio.featureDialog.directionOptions.forward')}
                        </option>
                        <option value="backward">
                          {t('partStudio.featureDialog.directionOptions.backward')}
                        </option>
                      </select>
                    )}
                    {section.id === 'startOffset' && (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={label}
                        className="part-studio-feature-dialog__input"
                        value={startOffset}
                        onChange={(event) => setStartOffset(event.target.value)}
                      />
                    )}
                    {section.id === 'symmetric' && (
                      <label className="part-studio-feature-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={symmetric}
                          onChange={(event) => setSymmetric(event.target.checked)}
                        />
                        <span>{label}</span>
                      </label>
                    )}
                    {section.id === 'draft' && (
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={label}
                        className="part-studio-feature-dialog__input"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* 底部（M6-c T5 采集对齐 12-dialog-extrude-1.png）：透明度滑杆（无可见
          标签，aria 供名）+ 成品 + ?。透明度=预览透明度语义（挂账：无预览通道，
          值仅本地态+载荷回传——见文件头注）；M3 期回滚滑杆撤出（Onshape 回滚条
          在特征树底部，归树 backlog 单裁）。 */}
      <footer className="part-studio-feature-dialog__footer">
        <div className="part-studio-feature-dialog__transparency">
          <input
            type="range"
            aria-label={t('partStudio.featureDialog.transparencyLabel')}
            data-testid="part-studio-feature-dialog-transparency"
            className="part-studio-feature-dialog__transparency-slider"
            min={0}
            max={100}
            value={transparency}
            onChange={(event) => setTransparency(Number(event.target.value))}
          />
        </div>
        <div className="part-studio-feature-dialog__footer-actions">
          <button
            type="button"
            className="part-studio-feature-dialog__finish"
            disabled={submitting || editStandalone || !canEdit || !sketchReady || !filletReady || !loftReady || !sweepReady || booleanUpstreamMissing}
            onClick={handleConfirm}
          >
            {t('partStudio.featureDialog.finish')}
          </button>
          <button
            type="button"
            aria-label={t('partStudio.featureDialog.help')}
            aria-expanded={helpOpen}
            className="part-studio-feature-dialog__help"
            onClick={() => setHelpOpen((prev) => !prev)}
          >
            ?
          </button>
        </div>
      </footer>
      {helpOpen && (
        <p role="note" className="part-studio-feature-dialog__help-text">
          {t('partStudio.featureDialog.helpText')}
        </p>
      )}
    </div>
  );
}
